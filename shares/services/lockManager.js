const { getRedis } = require('../config/redis');
const ProjectLock = require('../models/ProjectLock');
const mongoose = require('mongoose');
const notifications = require('./notificationService');

class LockManager {
    constructor() {
        this.timeoutCheckInterval = null;
        this.heartbeatSyncInterval = null;
        // Track in-flight lock requests to prevent duplicates
        this.inFlightRequests = new Map(); // key: "projectId:userId", value: Promise
    }

    // Lock timeout configuration (in milliseconds)
    static LOCK_TIMEOUT_MS = 60 * 1000; // 1 minute
    static WARNING_BEFORE_TIMEOUT_MS = 30 * 1000; // 30 seconds warning before timeout

    // Start background jobs
    startBackgroundJobs() {
        // Check timeouts every 1 second
        this.timeoutCheckInterval = setInterval(() => {
            this.checkTimeouts().catch(err => console.error('Timeout check error:', err));
        }, 1 * 1000);

        // Sync heartbeats to MongoDB every 1 minute
        this.heartbeatSyncInterval = setInterval(() => {
            this.syncHeartbeats().catch(err => console.error('Heartbeat sync error:', err));
        }, 60 * 1000);

        // Reconciliation every 2 minutes
        setInterval(() => {
            this.reconcileLocks().catch(err => console.error('Reconciliation error:', err));
        }, 1 * 60 * 1000);

        console.log('✅ Lock manager background jobs started (timeout: 1 min)');
    }

    // Acquire lock (Write-Through Cache pattern)
    async acquireLock(projectId, userId, userName, sessionId) {
        const requestKey = `${projectId}:${userId}`;

        // Check for duplicate in-flight request
        if (this.inFlightRequests.has(requestKey)) {
            console.log(`⚠️  Duplicate lock request detected for project ${projectId}, user ${userId} - returning existing promise`);
            return this.inFlightRequests.get(requestKey);
        }

        // Create promise for this request
        const requestPromise = this._acquireLockInternal(projectId, userId, userName, sessionId);

        // Track it
        this.inFlightRequests.set(requestKey, requestPromise);

        // Clean up when done
        requestPromise.finally(() => {
            this.inFlightRequests.delete(requestKey);
        });

        return requestPromise;
    }

    // Internal implementation of acquireLock
    async _acquireLockInternal(projectId, userId, userName, sessionId) {
        console.log(`🔐 Lock request: acquireLock for project ${projectId} by user ${userId} (${userName})`);
        const redis = getRedis();

        try {
            // 1. Quick check in Redis
            const redisLock = await redis.hGetAll(`lock:${projectId}`);
            if (redisLock.editorId && redisLock.editorId !== 'null') {
                console.log(`  ↳ Redis shows lock held by ${redisLock.editorId}, adding to queue`);
                // Lock occupied - add to queue
                return await this.addToQueue(projectId, userId, userName, sessionId);
            }

            console.log(`  ↳ Attempting MongoDB atomic lock acquisition...`);

            // 2. Atomic write to MongoDB (source of truth)
            const lock = await ProjectLock.findOneAndUpdate(
                {
                    projectId: new mongoose.Types.ObjectId(projectId),
                    $or: [
                        { editorId: null },
                        { editorId: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        editorId: new mongoose.Types.ObjectId(userId),
                        editorName: userName,
                        editorSessionId: sessionId,
                        lockedAt: new Date(),
                        lastActivity: new Date(),
                        inactivityWarningAt: null,
                        lockExpiresAt: new Date(Date.now() + 7 * 60 * 1000)
                    }
                },
                {
                    upsert: true,
                    new: true
                }
            );

            // 3. If MongoDB success, update Redis
            if (lock && lock.editorId.toString() === userId) {
                console.log(`  ↳ ✅ MongoDB lock acquired successfully`);
                const now = Date.now();
                const expiresAt = now + LockManager.LOCK_TIMEOUT_MS;
                await redis.hSet(`lock:${projectId}`, {
                    editorId: userId,
                    editorName: userName,
                    editorSessionId: sessionId,
                    lockedAt: now.toString(),
                    lastActivity: now.toString(),
                    inactivityWarningSent: 'false',
                    expiresAt: expiresAt.toString()
                });
                await redis.expire(`lock:${projectId}`, Math.ceil(LockManager.LOCK_TIMEOUT_MS / 1000) + 30);

                // Notify all clients about lock acquisition
                await notifications.notifyLockAcquired(projectId, userId, userName);

                return { lockGranted: true, expiresAt: new Date(expiresAt) };
            }

            // 4. Race condition - someone else got it first
            console.log(`  ↳ Lock already taken by ${lock?.editorId}, adding to queue`);
            return await this.addToQueue(projectId, userId, userName, sessionId);

        } catch (error) {
            // Handle E11000 duplicate key error gracefully
            if (error.code === 11000) {
                console.log(`  ↳ ⚠️  E11000 duplicate key error - race condition detected, adding to queue`);
                return await this.addToQueue(projectId, userId, userName, sessionId);
            }

            console.error(`  ↳ ❌ Error in acquireLock:`, error.message);
            throw error;
        }
    }

    // Release lock
    async releaseLock(projectId, userId) {
        console.log(`🔓 Lock release: releaseLock for project ${projectId} by user ${userId}`);
        const redis = getRedis();

        try {
            // 1. Verify ownership in Redis
            const redisLock = await redis.hGetAll(`lock:${projectId}`);
            if (!redisLock.editorId) {
                console.log(`  ↳ ⚠️  No lock found in Redis for project ${projectId}`);
                throw new Error('You do not have the lock');
            }

            if (redisLock.editorId !== userId) {
                console.log(`  ↳ ⚠️  Lock belongs to ${redisLock.editorId}, not ${userId}`);
                throw new Error('You do not have the lock');
            }

            // 2. Release in MongoDB first
            const lock = await ProjectLock.findOneAndUpdate(
                {
                    projectId: new mongoose.Types.ObjectId(projectId),
                    editorId: new mongoose.Types.ObjectId(userId)
                },
                {
                    $set: {
                        editorId: null,
                        editorName: null,
                        editorSessionId: null,
                        lockedAt: null,
                        lastActivity: null
                    }
                },
                { new: true }
            );

            if (!lock) {
                console.log(`  ↳ ⚠️  Lock not found in MongoDB for project ${projectId}`);
                throw new Error('Lock not found or does not belong to you');
            }

            // 3. Clear Redis
            await redis.del(`lock:${projectId}`);
            await redis.del(`lock:${projectId}:heartbeat`);
            console.log(`  ↳ ✅ Lock released successfully`);

            // Notify about lock release
            await notifications.notifyLockReleased(projectId, userId);

            // 4. Promote next in queue
            const nextInQueue = lock.editQueue?.[0];
            if (nextInQueue) {
                console.log(`  ↳ 👤 Next in queue: ${nextInQueue.userName} (${nextInQueue.userId})`);
                await this.promoteFromQueue(projectId, nextInQueue);
            } else {
                console.log(`  ↳ No users in queue`);
            }

            return { success: true, nextEditor: nextInQueue };
        } catch (error) {
            console.error(`  ↳ ❌ Error in releaseLock:`, error.message);
            throw error;
        }
    }

    // Process heartbeat / extend lock
    async processHeartbeat(projectId, userId) {
        const redis = getRedis();

        try {
            // Check if lock exists and belongs to this user
            const redisLock = await redis.hGetAll(`lock:${projectId}`);

            if (!redisLock.editorId) {
                // Redis lost - revalidate from MongoDB
                const mongoLock = await ProjectLock.findOne({
                    projectId: new mongoose.Types.ObjectId(projectId)
                });

                if (mongoLock && mongoLock.editorId?.toString() === userId) {
                    await this.syncLockToRedis(projectId, mongoLock);
                } else {
                    console.log(`Heartbeat failed: no lock found for project ${projectId}, user ${userId}`);
                    return { success: false, lockLost: true };
                }
            } else if (redisLock.editorId !== userId) {
                // Lock belongs to someone else
                console.log(`Heartbeat failed: lock belongs to ${redisLock.editorId}, not ${userId}`);
                return { success: false, lockLost: true, currentEditor: redisLock.editorId };
            }

            // Update lastActivity and extend expiration
            const now = Date.now();
            const newExpiresAt = now + LockManager.LOCK_TIMEOUT_MS;

            await redis.hSet(`lock:${projectId}`, {
                lastActivity: now.toString(),
                inactivityWarningSent: 'false',
                expiresAt: newExpiresAt.toString()
            });

            // Reset Redis TTL
            await redis.expire(`lock:${projectId}`, Math.ceil(LockManager.LOCK_TIMEOUT_MS / 1000) + 30);

            // Also update MongoDB lastActivity
            await ProjectLock.updateOne(
                { projectId: new mongoose.Types.ObjectId(projectId) },
                { $set: { lastActivity: new Date(now) } }
            );

            console.log(`Lock extended for project ${projectId}, user ${userId}, expires at ${new Date(newExpiresAt).toISOString()}`);
            return { success: true, expiresAt: new Date(newExpiresAt) };
        } catch (error) {
            console.error('Heartbeat/extend error:', error);
            return { success: false, error: error.message };
        }
    }

    // Add to queue
    async addToQueue(projectId, userId, userName, sessionId) {
        console.log(`📝 Adding to queue: user ${userId} (${userName}) for project ${projectId}`);

        // Check if user is already in queue
        const existingLock = await ProjectLock.findOne({
            projectId: new mongoose.Types.ObjectId(projectId),
            'editQueue.userId': new mongoose.Types.ObjectId(userId)
        });

        if (existingLock) {
            const existingPosition = existingLock.editQueue.findIndex(
                q => q.userId.toString() === userId
            ) + 1;
            console.log(`  ↳ User already in queue at position ${existingPosition}`);
            return {
                lockGranted: false,
                position: existingPosition,
                estimatedWaitTime: existingPosition * 5 * 60,
                currentEditor: existingLock.editorName,
                alreadyInQueue: true
            };
        }

        const lock = await ProjectLock.findOneAndUpdate(
            { projectId: new mongoose.Types.ObjectId(projectId) },
            {
                $push: {
                    editQueue: {
                        userId: new mongoose.Types.ObjectId(userId),
                        userName,
                        sessionId,
                        requestedAt: new Date(),
                        position: 0
                    }
                }
            },
            {
                upsert: true,
                new: true
            }
        );

        // Recalculate positions
        if (lock && lock.editQueue) {
            lock.editQueue.forEach((item, index) => {
                item.position = index + 1;
            });

            await ProjectLock.updateOne(
                { projectId: new mongoose.Types.ObjectId(projectId) },
                { $set: { editQueue: lock.editQueue } }
            );

            const position = lock.editQueue.length;
            const estimatedWait = position * 5 * 60; // 5 min per position

            console.log(`  ↳ ✅ Added to queue at position ${position}, estimated wait: ${estimatedWait}s`);

            // Notify about queue update
            await notifications.notifyQueueUpdate(projectId, lock.editQueue);

            return {
                lockGranted: false,
                position,
                estimatedWaitTime: estimatedWait,
                currentEditor: lock.editorName
            };
        }

        console.log(`  ↳ ✅ Added to queue at position 1`);
        return { lockGranted: false, position: 1 };
    }

    // Remove from queue
    async removeFromQueue(projectId, userId) {
        const lock = await ProjectLock.findOneAndUpdate(
            { projectId: new mongoose.Types.ObjectId(projectId) },
            {
                $pull: {
                    editQueue: { userId: new mongoose.Types.ObjectId(userId) }
                }
            },
            { new: true }
        );

        // Recalculate positions
        if (lock && lock.editQueue) {
            lock.editQueue.forEach((item, index) => {
                item.position = index + 1;
            });

            await ProjectLock.updateOne(
                { projectId: new mongoose.Types.ObjectId(projectId) },
                { $set: { editQueue: lock.editQueue } }
            );

            // Notify about queue update
            await notifications.notifyQueueUpdate(projectId, lock.editQueue);
        }

        return { success: true };
    }

    // Check timeouts
    async checkTimeouts() {
        const redis = getRedis();

        const lockKeys = await redis.keys('lock:*');

        for (const key of lockKeys) {
            if (key.includes(':heartbeat') || key.includes(':queue')) continue;

            const projectId = key.split(':')[1];
            const lock = await redis.hGetAll(key);

            if (!lock.editorId) continue;

            const now = Date.now();
            const lastActivity = parseInt(lock.lastActivity);
            const timeSinceActivity = now - lastActivity;

            const warningThreshold = LockManager.LOCK_TIMEOUT_MS - LockManager.WARNING_BEFORE_TIMEOUT_MS; // 30s before timeout

            // Send warning 30s before timeout
            if (timeSinceActivity > warningThreshold && lock.inactivityWarningSent !== 'true') {
                console.log(`⚠️  Sending inactivity warning for project ${projectId} (${Math.round(timeSinceActivity / 1000)}s inactive)`);
                await redis.hSet(key, {
                    inactivityWarningSent: 'true'
                });

                // Send WebSocket notification - notify by userId
                await notifications.notifyInactivityWarning(
                    projectId,
                    lock.editorId, // Use userId instead of sessionId
                    Math.round(LockManager.WARNING_BEFORE_TIMEOUT_MS / 1000) // seconds to respond
                );
            }

            // Timeout reached - expire lock
            if (timeSinceActivity > LockManager.LOCK_TIMEOUT_MS) {
                console.log(`⏱️  Expiring lock for project ${projectId} (${Math.round(timeSinceActivity / 1000)}s inactive)`);
                await this.expireLock(projectId, 'timeout');
            }
        }
    }

    // Expire lock
    async expireLock(projectId, reason) {
        const mongoLock = await ProjectLock.findOne({
            projectId: new mongoose.Types.ObjectId(projectId)
        });

        if (mongoLock && mongoLock.editorId) {
            const oldEditorId = mongoLock.editorId.toString();

            // Notify about lock expiration before releasing (by userId)
            await notifications.notifyLockExpired(projectId, oldEditorId, reason);

            await this.releaseLock(projectId, oldEditorId);

            console.log(`🔓 Lock expired for project ${projectId}, user ${oldEditorId}, reason: ${reason}`);
        }
    }

    // Sync heartbeats to MongoDB
    async syncHeartbeats() {
        const redis = getRedis();

        const lockKeys = await redis.keys('lock:*');

        for (const key of lockKeys) {
            if (key.includes(':heartbeat') || key.includes(':queue')) continue;

            const projectId = key.split(':')[1];
            const redisLock = await redis.hGetAll(key);

            if (redisLock.editorId) {
                await ProjectLock.updateOne(
                    { projectId: new mongoose.Types.ObjectId(projectId) },
                    { $set: { lastActivity: new Date(parseInt(redisLock.lastActivity)) } }
                );
            }
        }
    }

    // Reconcile locks
    async reconcileLocks() {
        const redis = getRedis();

        const mongoLocks = await ProjectLock.find({ editorId: { $ne: null } });

        for (const mongoLock of mongoLocks) {
            const projectId = mongoLock.projectId.toString();
            const redisLock = await redis.hGetAll(`lock:${projectId}`);

            // Check inconsistencies
            if (!redisLock.editorId || redisLock.editorId !== mongoLock.editorId.toString()) {
                console.warn(`⚠️  Inconsistency detected in project ${projectId}, MongoDB wins`);
                await this.syncLockToRedis(projectId, mongoLock);

                // Notify client with "phantom" lock that they lost it (by userId)
                if (redisLock.editorId && redisLock.editorId !== mongoLock.editorId.toString()) {
                    await notifications.notifyLockLost(
                        projectId,
                        redisLock.editorId, // Use userId instead of sessionId
                        'reconciliation'
                    );
                }
            }
        }

        // Clean orphan locks in Redis
        const redisKeys = await redis.keys('lock:*');
        for (const key of redisKeys) {
            if (key.includes(':heartbeat') || key.includes(':queue')) continue;

            const projectId = key.split(':')[1];
            const mongoExists = mongoLocks.find(l => l.projectId.toString() === projectId);

            if (!mongoExists) {
                await redis.del(key);
                console.info(`🧹 Orphan lock removed from Redis: ${projectId}`);
            }
        }
    }

    // Sync lock from MongoDB to Redis
    async syncLockToRedis(projectId, mongoLock) {
        const redis = getRedis();

        if (mongoLock.editorId) {
            const now = Date.now();
            const expiresAt = now + LockManager.LOCK_TIMEOUT_MS;

            await redis.hSet(`lock:${projectId}`, {
                editorId: mongoLock.editorId.toString(),
                editorName: mongoLock.editorName,
                editorSessionId: mongoLock.editorSessionId || '',
                lockedAt: mongoLock.lockedAt?.getTime().toString() || now.toString(),
                lastActivity: mongoLock.lastActivity?.getTime().toString() || now.toString(),
                inactivityWarningSent: 'false',
                expiresAt: expiresAt.toString()
            });
            await redis.expire(`lock:${projectId}`, Math.ceil(LockManager.LOCK_TIMEOUT_MS / 1000) + 30);
        }
    }

    // Promote from queue
    async promoteFromQueue(projectId, nextUser) {
        console.log(`⬆️  Promoting from queue: ${nextUser.userName} (${nextUser.userId}) for project ${projectId}`);

        try {
            // Remove from queue first to prevent duplicate promotion
            await ProjectLock.updateOne(
                { projectId: new mongoose.Types.ObjectId(projectId) },
                { $pull: { editQueue: { userId: nextUser.userId } } }
            );
            console.log(`  ↳ Removed from queue`);

            // Try to acquire lock
            const result = await this.acquireLock(
                projectId,
                nextUser.userId.toString(),
                nextUser.userName,
                nextUser.sessionId
            );

            if (result.lockGranted) {
                console.log(`  ↳ ✅ Lock granted to promoted user`);
                // Notify user about promotion
                await notifications.notifyUserPromoted(
                    projectId,
                    nextUser.userId.toString(),
                    nextUser.userName,
                    nextUser.sessionId
                );
                console.log(`🎉 Promoted ${nextUser.userName} to editor for project ${projectId}`);
            } else {
                console.log(`  ↳ ⚠️  Promotion acquired lock but user was queued (unexpected), position: ${result.position}`);
            }
        } catch (error) {
            console.error(`  ↳ ❌ Error promoting user ${nextUser.userName}:`, error.message);
            // Don't throw - try to continue even if promotion fails
            // The user will remain in view-only mode and can manually request lock again
        }
    }

    // Get lock status
    async getLockStatus(projectId) {
        const redis = getRedis();

        try {
            // Try Redis first
            const redisLock = await redis.hGetAll(`lock:${projectId}`);
            if (redisLock.editorId) {
                return {
                    hasLock: true,
                    editorId: redisLock.editorId,
                    editorName: redisLock.editorName,
                    lockedAt: parseInt(redisLock.lockedAt),
                    lastActivity: parseInt(redisLock.lastActivity)
                };
            }
        } catch (error) {
            console.error('Redis unavailable, using MongoDB');
        }

        // Fallback to MongoDB
        const mongoLock = await ProjectLock.findOne({
            projectId: new mongoose.Types.ObjectId(projectId)
        });

        if (mongoLock && mongoLock.editorId) {
            // Rebuild Redis cache
            await this.syncLockToRedis(projectId, mongoLock);

            return {
                hasLock: true,
                editorId: mongoLock.editorId.toString(),
                editorName: mongoLock.editorName,
                lockedAt: mongoLock.lockedAt.getTime(),
                lastActivity: mongoLock.lastActivity.getTime()
            };
        }

        return { hasLock: false };
    }

    // Get queue status
    async getQueueStatus(projectId) {
        const lock = await ProjectLock.findOne({
            projectId: new mongoose.Types.ObjectId(projectId)
        });

        return {
            currentEditor: lock?.editorName || null,
            queue: lock?.editQueue || [],
            queueLength: lock?.editQueue?.length || 0
        };
    }
}

module.exports = new LockManager();
