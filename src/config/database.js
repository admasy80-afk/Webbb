const { MongoClient } = require('mongodb');
const logger = require('./logger');

let db;
let usersCollection;
let mongoClient;

async function connectMongo() {
    const MONGO_URL = process.env.MONGO_URL;

    if (!MONGO_URL) {
        throw new Error('MONGO_URL مفقود');
    }

    mongoClient = new MongoClient(MONGO_URL, {
        maxPoolSize: 20,
        minPoolSize: 5,
        retryWrites: true
    });

    await mongoClient.connect();

    db = mongoClient.db('dahih_db');

    usersCollection = db.collection('users');

    logger.info('🔥 Mongo Connected');
}

function getDB() {
    return db;
}

function getUsersCollection() {
    return usersCollection;
}

module.exports = {
    connectMongo,
    getDB,
    getUsersCollection
};
