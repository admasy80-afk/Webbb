const { MongoClient } = require('mongodb');
const pino = require('pino');
const os = require('os');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { pid: process.pid, host: os.hostname() }
});

let db;
let mongoClient;

async function connectMongo() {
    try {
        if (!process.env.MONGO_URL) {
            logger.fatal("متغير MONGO_URL غير موجود!");
            process.exit(1);
        }
        mongoClient = new MongoClient(process.env.MONGO_URL, {
            maxPoolSize: 20,
            minPoolSize: 5,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            retryWrites: true
        });
        await mongoClient.connect();
        db = mongoClient.db('dahih_db');
        
        // إنشاء الـ Indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true, background: true });
        await db.collection('users').createIndex({ phone: 1 }, { unique: true, background: true });
        await db.collection('courses').createIndex({ grade: 1 }, { background: true });
        await db.collection('courses').createIndex({ telegramMsgId: 1 }, { background: true });
        await db.collection('curriculum_content').createIndex({ grade: 1 }, { background: true });
        
        logger.info("🔥 قاعدة البيانات والـ Indexes جاهزة للعمل");
    } catch (error) {
        logger.fatal({ err: error }, "فشل الاتصال بمونجو");
        process.exit(1);
    }
}

const getDb = () => db;
const getClient = () => mongoClient;

module.exports = { connectMongo, getDb, getClient, logger };

