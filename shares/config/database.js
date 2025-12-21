const { MongoClient } = require('mongodb');
const { createClient } = require('redis');

let mongoClient;
let db;
let redisClient;

// MongoDB Connection
async function connectMongoDB() {
    const mongoURI = process.env.MONGO_URI || 'mongodb://shares_mongoDB:27017';
    const dbName = process.env.MONGO_DB_NAME || 'shares';

    mongoClient = new MongoClient(mongoURI);
    await mongoClient.connect();
    db = mongoClient.db(dbName);

    // Create indexes
    await createIndexes();

    console.log(`✅ MongoDB connected: ${dbName}`);
    return db;
}

async function createIndexes() {
    // Shares collection indexes
    await db.collection('shares').createIndex({ shareId: 1 }, { unique: true });
    await db.collection('shares').createIndex({ projectId: 1 });
    await db.collection('shares').createIndex({ ownerId: 1 });
    await db.collection('shares').createIndex({ token: 1 });

    // Project locks collection indexes
    await db.collection('project_locks').createIndex({ projectId: 1 }, { unique: true });

    // Active sessions collection indexes
    await db.collection('active_sessions').createIndex({ projectId: 1 }, { unique: true });

    // Operation history indexes
    await db.collection('operation_history').createIndex({ projectId: 1, timestamp: -1 });

    console.log('✅ MongoDB indexes created');
}

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

// Getters
function getDB() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

function getRedis() {
    if (!redisClient) {
        throw new Error('Redis not initialized');
    }
    return redisClient;
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (mongoClient) await mongoClient.close();
    if (redisClient) await redisClient.quit();
    process.exit(0);
});

module.exports = {
    connectMongoDB,
    connectRedis,
    getDB,
    getRedis
};
