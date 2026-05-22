const pino = require('pino');
const os = require('os');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
        pid: process.pid,
        host: os.hostname()
    }
});

module.exports = logger;
