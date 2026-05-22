const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const crypto = require('crypto');

module.exports = function(app) {

    app.use(helmet({
        crossOriginEmbedderPolicy: false
    }));

    const allowedOrigins = process.env.ALLOWED_ORIGIN
        ? [process.env.ALLOWED_ORIGIN]
        : ['http://localhost:3000'];

    app.use(cors({
        origin(origin, callback) {
            if (!origin) return callback(null, true);

            if (!allowedOrigins.includes(origin)) {
                return callback(new Error('CORS blocked'));
            }

            callback(null, true);
        },
        credentials: true
    }));

    app.use(hpp());

    app.use((req, res, next) => {
        req.requestId = crypto.randomUUID();
        res.setHeader('X-Request-Id', req.requestId);
        next();
    });
};
