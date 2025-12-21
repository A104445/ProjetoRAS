const { createClient } = require('redis');

let redisClient;

// Redis Connection
async function connectRedis() {
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = process.env.REDIS_PORT || 6379;

    redisClient = createClient({
        socket: {
            host: redisHost,
            port: redisPort
        }
    });

    redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
    redisClient.on('connect', () => console.log('✅ Redis connected'));

    await redisClient.connect();

    return redisClient;
}

// Getter
function getRedis() {
    if (!redisClient || !redisClient.isOpen) {
        throw new Error('Redis not initialized or connection closed');
    }
    return redisClient;
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down Redis gracefully...');
    if (redisClient) await redisClient.quit();
});

module.exports = {
    connectRedis,
    getRedis
};
