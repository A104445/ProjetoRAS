/**
 * WebSocket Notification Service
 * 
 * This service provides methods to queue notifications that should be sent to clients.
 * Since the shares service doesn't have direct WebSocket access (it's in wsGateway),
 * we use Redis pub/sub to communicate notifications to the WebSocket gateway.
 */

const { getRedis } = require('../config/redis');

const NOTIFICATION_CHANNEL = 'shares:notifications';

/**
 * Publish a notification to the WebSocket gateway via Redis pub/sub
 * @param {string} event - Event name
 * @param {object} payload - Event payload
 */
async function publishNotification(event, payload) {
    try {
        const redis = getRedis();
        const message = JSON.stringify({ event, payload, timestamp: Date.now() });
        await redis.publish(NOTIFICATION_CHANNEL, message);
        console.log(`📤 Published notification: ${event}`);
    } catch (error) {
        console.error('Failed to publish notification:', error);
    }
}

/**
 * Notify about lock acquisition
 */
async function notifyLockAcquired(projectId, editorId, editorName) {
    await publishNotification('lock:acquired', {
        projectId,
        editorId,
        editorName
    });
}

/**
 * Notify about lock release
 */
async function notifyLockReleased(projectId, releasedBy) {
    await publishNotification('lock:released', {
        projectId,
        releasedBy
    });
}

/**
 * Notify about lock expiration
 */
async function notifyLockExpired(projectId, sessionId, reason) {
    await publishNotification('lock:expired', {
        projectId,
        sessionId,
        reason
    });
}

/**
 * Notify about inactivity warning
 */
async function notifyInactivityWarning(projectId, sessionId, expiresIn) {
    await publishNotification('lock:inactivity-warning', {
        projectId,
        sessionId,
        expiresIn
    });
}

/**
 * Notify about queue position update
 */
async function notifyQueueUpdate(projectId, queue) {
    await publishNotification('lock:queue-update', {
        projectId,
        queue: queue.map((q, index) => ({
            userId: q.userId.toString(),
            userName: q.userName,
            position: index + 1,
            estimatedWait: (index + 1) * 5 * 60
        }))
    });
}

/**
 * Notify about user promotion from queue
 */
async function notifyUserPromoted(projectId, userId, userName, sessionId) {
    await publishNotification('lock:promoted', {
        projectId,
        userId,
        userName,
        sessionId,
        expiresAt: new Date(Date.now() + 7 * 60 * 1000)
    });
}

/**
 * Notify about lock lost due to reconciliation
 */
async function notifyLockLost(projectId, sessionId, reason) {
    await publishNotification('lock:lost', {
        projectId,
        sessionId,
        reason
    });
}

/**
 * Notify about user joining project session
 */
async function notifyUserJoined(projectId, userId, userName, role) {
    await publishNotification('session:user-joined', {
        projectId,
        userId,
        userName,
        role
    });
}

/**
 * Notify about user leaving project session
 */
async function notifyUserLeft(projectId, userId) {
    await publishNotification('session:user-left', {
        projectId,
        userId
    });
}

module.exports = {
    publishNotification,
    notifyLockAcquired,
    notifyLockReleased,
    notifyLockExpired,
    notifyInactivityWarning,
    notifyQueueUpdate,
    notifyUserPromoted,
    notifyLockLost,
    notifyUserJoined,
    notifyUserLeft,
    NOTIFICATION_CHANNEL
};
