const helmet = require('helmet');
const cors = require('cors');
const { logger } = require('./db');

const setupSecurity = (app) => {
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https:"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https:"],
                fontSrc: ["'self'", "https:", "data:"],
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                mediaSrc: ["'self'", "blob:", "https:"],
                connectSrc: ["'self'", "https:"]
            }
        },
        crossOriginEmbedderPolicy: false,
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: 'deny' },
        noSniff: true
    }));

    const allowedOrigins = process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                return callback(new Error('CORS Policy Rejection'), false);
            }
            return callback(null, true);
        },
        credentials: true
    }));
};

module.exports = setupSecurity;

