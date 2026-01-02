/**
 * WebSocket Notification Service
 *
 * This service provides methods to queue notifications that should be sent to clients.
 * Since the shares service doesn't have direct WebSocket access (it's in wsGateway),
 * we use RabbitMQ to communicate notifications to the WebSocket gateway (ws_queue).
 */

const { publish } = require('../utils/rabbit_mq');

const WS_QUEUE = 'ws_queue';

/**
 * Publish a notification to the WebSocket gateway via RabbitMQ
 * @param {string} type - Event type
 * @param {object} payload - Event payload
 */
async function publishNotification(type, payload) {
    try {
        await publish(WS_QUEUE, {
            type,
            ...payload,
            timestamp: Date.now()
        });
        console.log(`Published notification: ${type}`);
    } catch (error) {
        console.error('Failed to publish notification:', error);
    }
}

/**
 * Notify about lock acquisition
 */
async function notifyLockAcquired(projectId, editorId, editorName) {
    await publishNotification('lock-acquired-broadcast', {
        projectId,
        editorId,
        editorName
    });
}

/**
 * Notify about lock release
 */
async function notifyLockReleased(projectId, releasedBy, nextEditor = null) {
    await publishNotification('lock-released', {
        projectId,
        releasedBy,
        nextEditor
    });
}

/**
 * Notify about lock expiration
 */
async function notifyLockExpired(projectId, userId, reason) {
    await publishNotification('lock-expired', {
        projectId,
        userId,
        reason
    });
}

/**
 * Notify about inactivity warning
 */
async function notifyInactivityWarning(projectId, userId, expiresIn) {
    await publishNotification('lock-inactivity-warning', {
        projectId,
        userId,
        expiresIn
    });
}

/**
 * Notify about queue position update
 */
async function notifyQueueUpdate(projectId, queue) {
    await publishNotification('lock-queue-update', {
        projectId,
        queue: queue.map((q, index) => ({
            userId: q.userId.toString(),
            userName: q.userName,
            position: index + 1,
            estimatedWait: (index + 1) * 1 * 60
        }))
    });
}

/**
 * Notify about user promotion from queue
 */
async function notifyUserPromoted(projectId, userId, userName, sessionId) {
    await publishNotification('lock-promoted', {
        projectId,
        userId,
        userName,
        sessionId,
        expiresAt: new Date(Date.now() + 1 * 60 * 1000)
    });
}

/**
 * Notify about lock lost due to reconciliation
 */
async function notifyLockLost(projectId, userId, reason) {
    await publishNotification('lock-lost', {
        projectId,
        userId,
        reason
    });
}

/**
 * Notify about user joining project session
 */
async function notifyUserJoined(projectId, userId, userName, role) {
    await publishNotification('session-user-joined', {
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
    await publishNotification('session-user-left', {
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
    WS_QUEUE
};
