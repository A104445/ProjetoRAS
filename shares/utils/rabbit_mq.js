/**
 * RabbitMQ utilities for shares service
 */

const amqp = require('amqplib');

const rabbit_host = process.env.RABBITMQ_HOST || 'rabbitmq';
const rabbit_port = process.env.RABBITMQ_PORT || 5672;
const rabbit_username = process.env.RABBITMQ_USER || 'user';
const rabbit_password = process.env.RABBITMQ_PASS || 'password';
const exchange = 'picturas';

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ
 */
async function connect() {
    const connectionUrl = `amqp://${rabbit_username}:${rabbit_password}@${rabbit_host}:${rabbit_port}`;

    try {
        connection = await amqp.connect(connectionUrl);
        channel = await connection.createChannel();

        await channel.assertExchange(exchange, 'direct', { durable: true });

        console.log('RabbitMQ connected (shares)');
        return channel;
    } catch (error) {
        console.error('RabbitMQ connection failed:', error.message);
        throw error;
    }
}

/**
 * Get channel (reconnect if needed)
 */
async function getChannel() {
    if (!channel) {
        await connect();
    }
    return channel;
}

/**
 * Send message to a queue
 */
async function sendToQueue(queue, message) {
    const ch = await getChannel();
    await ch.assertQueue(queue, { durable: true });
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}

/**
 * Publish to exchange
 */
async function publish(routingKey, message) {
    const ch = await getChannel();
    ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), { persistent: true });
}

/**
 * Consume from queue with callback
 */
async function consume(queue, callback, options = {}) {
    const ch = await getChannel();
    await ch.assertQueue(queue, { durable: true });

    ch.consume(queue, async (msg) => {
        if (msg) {
            try {
                const content = JSON.parse(msg.content.toString());
                const result = await callback(content, msg.properties);

                // If RPC request, send reply
                if (msg.properties.replyTo) {
                    ch.sendToQueue(
                        msg.properties.replyTo,
                        Buffer.from(JSON.stringify(result || {})),
                        { correlationId: msg.properties.correlationId }
                    );
                }

                ch.ack(msg);
            } catch (error) {
                console.error('Message processing error:', error);

                // Send error response if RPC
                if (msg.properties.replyTo) {
                    ch.sendToQueue(
                        msg.properties.replyTo,
                        Buffer.from(JSON.stringify({ error: error.message })),
                        { correlationId: msg.properties.correlationId }
                    );
                }

                ch.ack(msg); // Ack to avoid requeue loop
            }
        }
    }, { noAck: false, ...options });

    console.log(`Consuming from queue: ${queue}`);
}

/**
 * Graceful shutdown
 */
async function close() {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed');
}

module.exports = {
    connect,
    getChannel,
    sendToQueue,
    publish,
    consume,
    close
};
