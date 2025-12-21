const { getRedis } = require('../config/redis');
const ProjectLock = require('../models/ProjectLock');
const mongoose = require('mongoose');

class LockManager {
    constructor() {
        this.timeoutCheckInterval = null;
        this.heartbeatSyncInterval = null;
    }

    // Start background jobs
    startBackgroundJobs() {
        // Check timeouts every minute
        this.timeoutCheckInterval = setInterval(() => {
            this.checkTimeouts().catch(err => console.error('Timeout check error:', err));
        }, 60 * 1000);

        // Sync heartbeats to MongoDB every 2 minutes
        this.heartbeatSyncInterval = setInterval(() => {
            this.syncHeartbeats().catch(err => console.error('Heartbeat sync error:', err));
        }, 2 * 60 * 1000);

        // Reconciliation every 5 minutes
        setInterval(() => {
            this.reconcileLocks().catch(err => console.error('Reconciliation error:', err));
        }, 5 * 60 * 1000);

        console.log('✅ Lock manager background jobs started');
    }

    // Acquire lock (Write-Through Cache pattern)
    async acquireLock(projectId, userId, userName, sessionId) {
        const redis = getRedis();

        // 1. Quick check in Redis
        const redisLock = await redis.hGetAll(`lock:${projectId}`);
        if (redisLock.editorId && redisLock.editorId !== 'null') {
            // Lock occupied - add to queue
            return await this.addToQueue(projectId, userId, userName, sessionId);
        }

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
            const now = Date.now();
            await redis.hSet(`lock:${projectId}`, {
                editorId: userId,
                editorName: userName,
                editorSessionId: sessionId,
                lockedAt: now.toString(),
                lastActivity: now.toString(),
                inactivityWarningSent: 'false',
                warningExpiresAt: (now + 7 * 60 * 1000).toString()
            });
            await redis.expire(`lock:${projectId}`, 10 * 60); // TTL 10 minutes

            return { lockGranted: true, expiresAt: new Date(now + 7 * 60 * 1000) };
        }

        // 4. Race condition - add to queue
        return await this.addToQueue(projectId, userId, userName, sessionId);
    }

    // Release lock
    async releaseLock(projectId, userId) {
        const redis = getRedis();

        // 1. Verify ownership in Redis
        const redisLock = await redis.hGetAll(`lock:${projectId}`);
        if (redisLock.editorId !== userId) {
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
            throw new Error('Lock not found or does not belong to you');
        }

        // 3. Clear Redis
        await redis.del(`lock:${projectId}`);
        await redis.del(`lock:${projectId}:heartbeat`);

        // 4. Promote next in queue
        const nextInQueue = lock.editQueue?.[0];
        if (nextInQueue) {
            await this.promoteFromQueue(projectId, nextInQueue);
        }

        return { success: true, nextEditor: nextInQueue };
    }

    // Process heartbeat
    async processHeartbeat(projectId, userId) {
        const redis = getRedis();

        try {
            const exists = await redis.exists(`lock:${projectId}`);
            if (!exists) {
                // Redis lost - revalidate from MongoDB
                const mongoLock = await ProjectLock.findOne({
                    projectId: new mongoose.Types.ObjectId(projectId)
                });

                if (mongoLock && mongoLock.editorId?.toString() === userId) {
                    await this.syncLockToRedis(projectId, mongoLock);
                } else {
                    return { lockLost: true };
                }
            }

            // Update lastActivity in Redis
            await redis.hSet(`lock:${projectId}`, 'lastActivity', Date.now().toString());

            return { success: true };
        } catch (error) {
            console.error('Heartbeat error:', error);
            return { error: error.message };
        }
    }

    // Add to queue
    async addToQueue(projectId, userId, userName, sessionId) {
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

            return {
                lockGranted: false,
                position,
                estimatedWaitTime: estimatedWait,
                currentEditor: lock.editorName
            };
        }

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

            // 5 minutes - send warning
            if (timeSinceActivity > 5 * 60 * 1000 && lock.inactivityWarningSent !== 'true') {
                console.log(`⚠️  Sending inactivity warning for project ${projectId}`);
                await redis.hSet(key, {
                    inactivityWarningSent: 'true',
                    warningExpiresAt: (now + 2 * 60 * 1000).toString()
                });
                // TODO: Send WebSocket notification
            }

            // 7 minutes - expire lock
            if (timeSinceActivity > 7 * 60 * 1000) {
                console.log(`⏱️  Expiring lock for project ${projectId}`);
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
            const oldEditor = {
                userId: mongoLock.editorId.toString(),
                sessionId: mongoLock.editorSessionId
            };

            await this.releaseLock(projectId, oldEditor.userId);

            console.log(`🔓 Lock expired for project ${projectId}, reason: ${reason}`);
            // TODO: Notify via WebSocket
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

                // Notify client with "phantom" lock
                if (redisLock.editorId && redisLock.editorId !== mongoLock.editorId.toString()) {
                    // TODO: Notify via WebSocket that lock was lost
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
            await redis.hSet(`lock:${projectId}`, {
                editorId: mongoLock.editorId.toString(),
                editorName: mongoLock.editorName,
                editorSessionId: mongoLock.editorSessionId,
                lockedAt: mongoLock.lockedAt.getTime().toString(),
                lastActivity: mongoLock.lastActivity.getTime().toString(),
                inactivityWarningSent: 'false',
                warningExpiresAt: mongoLock.lockExpiresAt.getTime().toString()
            });
            await redis.expire(`lock:${projectId}`, 10 * 60);
        }
    }

    // Promote from queue
    async promoteFromQueue(projectId, nextUser) {
        await this.acquireLock(
            projectId,
            nextUser.userId.toString(),
            nextUser.userName,
            nextUser.sessionId
        );

        // Remove from queue
        await ProjectLock.updateOne(
            { projectId: new mongoose.Types.ObjectId(projectId) },
            { $pull: { editQueue: { userId: nextUser.userId } } }
        );

        // TODO: Notify via WebSocket
        console.log(`🎉 Promoted ${nextUser.userName} to editor for project ${projectId}`);
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
