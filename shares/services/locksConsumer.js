/**
 * Locks Consumer - RPC Handler
 *
 * Consumes lock requests from RabbitMQ and delegates to lockManager.
 * Sends responses back to wsGateway via RPC reply.
 */

const { consume, publish } = require('../utils/rabbit_mq');
const lockManager = require('./lockManager');

const LOCKS_REQUEST_QUEUE = 'locks_request_queue';
const WS_NOTIFICATION_QUEUE = 'ws_queue';

/**
 * Send notification to wsGateway via RabbitMQ
 */
async function notifyWsGateway(type, payload) {
    try {
        await publish('ws_queue', {
            type,
            ...payload,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to notify wsGateway:', error.message);
    }
}

/**
 * Handle lock request
 */
async function handleLockRequest(message, properties) {
    const { action, projectId, userId, userName, sessionId } = message;

    console.log(`Lock request: ${action} for project ${projectId} by user ${userId}`);

    try {
        switch (action) {
            case 'acquireLock': {
                const result = await lockManager.acquireLock(
                    projectId,
                    userId,
                    userName || 'Unknown',
                    sessionId || `session-${Date.now()}`
                );

                // Notify other clients about lock change
                if (result.lockGranted) {
                    await notifyWsGateway('lock-acquired-broadcast', {
                        projectId,
                        editorId: userId,
                        editorName: userName,
                        expiresAt: result.expiresAt
                    });
                }

                return result;
            }

            case 'releaseLock': {
                const result = await lockManager.releaseLock(projectId, userId);

                // Notify about lock release
                if (result.success) {
                    await notifyWsGateway('lock-released', {
                        projectId,
                        releasedBy: userId,
                        nextEditor: result.nextEditor
                    });
                }

                return result;
            }

            case 'getLockStatus': {
                const result = await lockManager.getLockStatus(projectId);
                return result;
            }

            case 'removeFromQueue': {
                const result = await lockManager.removeFromQueue(projectId, userId);
                return result;
            }

            case 'getQueueStatus': {
                const result = await lockManager.getQueueStatus(projectId);
                return result;
            }

            default:
                console.warn(`Unknown lock action: ${action}`);
                return { error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error(`Lock action ${action} failed:`, error.message);
        return { error: error.message };
    }
}

/**
 * Start consuming lock requests
 */
async function startConsumer() {
    try {
        await consume(LOCKS_REQUEST_QUEUE, handleLockRequest);
        console.log('Locks consumer started');
    } catch (error) {
        console.error('Failed to start locks consumer:', error.message);
        throw error;
    }
}

module.exports = {
    startConsumer,
    notifyWsGateway
};
