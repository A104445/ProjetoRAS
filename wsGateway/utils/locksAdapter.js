/**
 * Locks Adapter - RPC over RabbitMQ
 *
 * This adapter provides the same interface as the old in-memory lock functions
 * but delegates all logic to the shares service via RabbitMQ RPC pattern.
 */

const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const LOCKS_REQUEST_QUEUE = 'locks_request_queue';

let channel = null;
let replyQueue = null;
const pendingRequests = new Map(); // correlationId -> { resolve, reject, timeout }

/**
 * Initialize RabbitMQ connection for RPC
 */
async function init() {
    const rabbit_host = process.env.RABBITMQ_HOST || 'rabbitmq';
    const rabbit_port = process.env.RABBITMQ_PORT || 5672;
    const rabbit_username = process.env.RABBITMQ_USER || 'user';
    const rabbit_password = process.env.RABBITMQ_PASS || 'password';

    const connectionUrl = `amqp://${rabbit_username}:${rabbit_password}@${rabbit_host}:${rabbit_port}`;

    try {
        const connection = await amqp.connect(connectionUrl);
        channel = await connection.createChannel();

        // Assert the request queue
        await channel.assertQueue(LOCKS_REQUEST_QUEUE, { durable: true });

        // Create exclusive reply queue for this instance
        const q = await channel.assertQueue('', { exclusive: true });
        replyQueue = q.queue;

        // Consume replies
        channel.consume(replyQueue, (msg) => {
            if (msg) {
                const correlationId = msg.properties.correlationId;
                const pending = pendingRequests.get(correlationId);

                if (pending) {
                    clearTimeout(pending.timeout);
                    pendingRequests.delete(correlationId);

                    try {
                        const response = JSON.parse(msg.content.toString());
                        pending.resolve(response);
                    } catch (err) {
                        pending.reject(new Error('Invalid response format'));
                    }
                }

                channel.ack(msg);
            }
        });

        console.log('Locks Adapter initialized (RabbitMQ RPC)');
        return true;
    } catch (error) {
        console.error('Failed to initialize Locks Adapter:', error.message);
        return false;
    }
}

/**
 * Send RPC request to shares service
 */
function sendRequest(action, data, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        if (!channel || !replyQueue) {
            return reject(new Error('Locks adapter not initialized'));
        }

        const correlationId = uuidv4();
        const message = JSON.stringify({ action, ...data });

        // Set timeout for request
        const timeout = setTimeout(() => {
            pendingRequests.delete(correlationId);
            reject(new Error(`Lock request timeout: ${action}`));
        }, timeoutMs);

        pendingRequests.set(correlationId, { resolve, reject, timeout });

        // Send request
        channel.sendToQueue(
            LOCKS_REQUEST_QUEUE,
            Buffer.from(message),
            {
                correlationId,
                replyTo: replyQueue,
                persistent: true
            }
        );
    });
}

/**
 * Acquire lock for a project
 * @param {string} projectId
 * @param {string} userId
 * @param {string} userName
 * @param {string} sessionId
 * @returns {Promise<{acquired: boolean, lockedBy?: string, queued?: boolean, position?: number, expiresAt?: number}>}
 */
async function acquireLock(projectId, userId, userName = 'Unknown', sessionId = null) {
    try {
        const result = await sendRequest('acquireLock', {
            projectId,
            userId,
            userName,
            sessionId: sessionId || `ws-${userId}-${Date.now()}`
        });

        // Normalize response to match old interface
        return {
            acquired: result.lockGranted || false,
            lockedBy: result.currentEditor || null,
            queued: !result.lockGranted && result.position > 0,
            position: result.position || 0,
            expiresAt: result.expiresAt ? new Date(result.expiresAt).getTime() : null
        };
    } catch (error) {
        console.error('acquireLock error:', error.message);
        return { acquired: false, error: error.message };
    }
}

/**
 * Release lock for a project
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function releaseLock(projectId, userId) {
    try {
        const result = await sendRequest('releaseLock', { projectId, userId });
        return result.success || false;
    } catch (error) {
        console.error('releaseLock error:', error.message);
        return false;
    }
}

/**
 * Get lock status for a project
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<{isLocked: boolean, lockedBy?: string, hasLock: boolean, expiresAt?: number}>}
 */
async function getLockStatus(projectId, userId) {
    try {
        const result = await sendRequest('getLockStatus', { projectId, userId });

        return {
            isLocked: result.hasLock || false,
            lockedBy: result.editorId || null,
            hasLock: result.editorId === userId,
            expiresAt: result.lockedAt ? result.lockedAt + (7 * 60 * 1000) : null
        };
    } catch (error) {
        console.error('getLockStatus error:', error.message);
        return { isLocked: false, lockedBy: null, hasLock: false, expiresAt: null };
    }
}

/**
 * Remove user from queue
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function removeFromQueue(projectId, userId) {
    try {
        const result = await sendRequest('removeFromQueue', { projectId, userId });
        return result.success || false;
    } catch (error) {
        console.error('removeFromQueue error:', error.message);
        return false;
    }
}

module.exports = {
    init,
    acquireLock,
    releaseLock,
    getLockStatus,
    removeFromQueue
};
