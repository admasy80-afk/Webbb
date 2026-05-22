require('dotenv').config();

const app = require('./app');
const { connectMongo } = require('./config/database');
const logger = require('./config/logger');
const startCleanupJobs = require('./jobs/cleanup.job');

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await connectMongo();

        const server = app.listen(PORT, () => {
            logger.info(`🚀 السيرفر يعمل على ${PORT}`);
        });

        server.headersTimeout = 65000;
        server.requestTimeout = 0;
        server.keepAliveTimeout = 60000;
        server.timeout = 30 * 60 * 1000;

        startCleanupJobs();

    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
}

start();
