const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');
const helmet = require('helmet');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2
});

redisClient.on('error', () => {});

const requireRedis = (req, res, next) => {
    if (redisClient.status !== 'ready') {
        return res.status(503).json({ message: 'الخدمة غير متاحة مؤقتاً' });
    }
    next();
};

const createUltimateShield = ({ windowMs, max, prefix, keyGenerator, delayAfter, message, strictFail }) => {
    const isRedisDown = () => redisClient.status !== 'ready';

    const speedStore = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: `sec:sd:${prefix}:`
    });

    const limitStore = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: `sec:rl:${prefix}:`
    });

    const speedLimiter = slowDown({
        store: speedStore,
        windowMs,
        delayAfter: delayAfter || Math.max(1, Math.floor(max * 0.3)),
        delayMs: (hits) => hits * 1000,
        maxDelayMs: 30000,
        keyGenerator,
        skip: strictFail ? () => false : isRedisDown
    });

    const requestLimiter = rateLimit({
        store: limitStore,
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
        skip: strictFail ? () => false : isRedisDown,
        handler: (req, res) => {
            res.set('X-Security-Action', 'CAPTCHA_REQUIRED');
            res.set('Retry-After', Math.ceil(windowMs / 1000));
            res.status(429).json({
                ...message,
                lockout: true,
                requiresCaptcha: true
            });
        }
    });

    return strictFail ? [requireRedis, speedLimiter, requestLimiter] : [speedLimiter, requestLimiter];
};

const loginIpLimiter = createUltimateShield({
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: 'login_ip',
    delayAfter: 3,
    keyGenerator: (req) => req.ip,
    message: { message: "محاولات تسجيل دخول كثيرة. تم الحظر مؤقتاً." },
    strictFail: true
});

const loginAccountLimiter = createUltimateShield({
    windowMs: 15 * 60 * 1000,
    max: 3,
    prefix: 'login_acc',
    delayAfter: 1,
    keyGenerator: (req) => String(req.body?.identifier || 'unknown').toLowerCase().trim(),
    message: { message: "تجاوزت الحد المسموح لتسجيل الدخول للحساب. تم القفل لمدة 15 دقيقة." },
    strictFail: true
});

const authLoginLimiter = [...loginIpLimiter, ...loginAccountLimiter];

const apiLimiter = createUltimateShield({
    windowMs: 60 * 1000,
    max: 100,
    prefix: 'api',
    delayAfter: 50,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { message: "تجاوزت الحد المسموح من الطلبات." },
    strictFail: false
});

const uploadLimiter = createUltimateShield({
    windowMs: 60 * 60 * 1000,
    max: 15,
    prefix: 'upload',
    delayAfter: 5,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { message: "تجاوزت الحد المسموح للرفع." },
    strictFail: false
});

const publicQuizLimiter = createUltimateShield({
    windowMs: 15 * 60 * 1000,
    max: 15,
    prefix: 'quiz',
    delayAfter: 5,
    keyGenerator: (req) => req.ip,
    message: { message: "تجاوزت الحد المسموح." },
    strictFail: false
});

const redeemAccountLimiter = createUltimateShield({
    windowMs: 30 * 60 * 1000,
    max: 10,
    prefix: 'redeem_acc',
    delayAfter: 3,
    keyGenerator: (req) => req.user?.email || 'anon',
    message: { message: "محاولات كثيرة جداً من هذا الحساب. تم التجميد 30 دقيقة." },
    strictFail: true
});

const redeemIpLimiter = createUltimateShield({
    windowMs: 30 * 60 * 1000,
    max: 20,
    prefix: 'redeem_ip',
    delayAfter: 5,
    keyGenerator: (req) => req.ip,
    message: { message: "محاولات تفعيل كثيرة من شبكتك. تم التجميد 30 دقيقة." },
    strictFail: true
});

const redeemCodeLimiter = createUltimateShield({
    windowMs: 30 * 60 * 1000,
    max: 15,
    prefix: 'redeem_code',
    delayAfter: 3,
    keyGenerator: (req) => String(req.body?.code || 'nocode').toUpperCase().trim(),
    message: { message: "محاولات كثيرة جداً على هذا الكود. تم التجميد 30 دقيقة." },
    strictFail: true
});

const redeemLimiter = [...redeemAccountLimiter, ...redeemIpLimiter, ...redeemCodeLimiter];

const applyGlobalSecurity = (app) => {
    if (process.env.NODE_ENV === 'production') {
        app.set('trust proxy', 1);
    }
    app.disable('x-powered-by');
    app.use(helmet({
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: true,
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }));
};

module.exports = { 
    authLoginLimiter,
    apiLimiter, 
    uploadLimiter, 
    publicQuizLimiter, 
    redeemLimiter,
    applyGlobalSecurity
};
