const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const rateLimitRedis = require('rate-limit-redis');
const RedisStore = rateLimitRedis.default || rateLimitRedis;
const Redis = require('ioredis');
const helmet = require('helmet');
const hpp = require('hpp');
const crypto = require('crypto');

const redisOptions = {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
    connectTimeout: 10000,
    keepAlive: 10000,
    retryStrategy: (times) => Math.min(Math.exp(times) * 50, 2000)
};

const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', redisOptions);

redisClient.on('error', (err) => console.error('Redis Error:', err.message));
redisClient.on('ready', () => console.log('Redis Security Layer Active'));

const isRedisDown = () => redisClient.status !== 'ready';

const requireRedis = (req, res, next) => {
    if (isRedisDown()) {
        return res.status(503).json({ message: 'الخدمة غير متاحة مؤقتاً' });
    }
    next();
};

const generateFingerprint = (req) => {
    const components = [
        req.ip,
        req.headers['user-agent'] || 'unknown',
        req.headers['accept-language'] || 'unknown',
        req.headers['x-forwarded-for'] || 'none'
    ].join('|');
    return crypto.createHash('sha3-256').update(components).digest('hex');
};

const secureHash = (data) => {
    if (!data || typeof data !== 'string') return String(data);
    return crypto.createHash('sha3-256').update(data).digest('hex');
};

const abuseScoringMiddleware = async (req, res, next) => {
    if (isRedisDown()) return next();
    try {
        const fp = generateFingerprint(req);
        const scoreKey = `sec:abuse:score:${fp}`;
        const score = await redisClient.get(scoreKey);
        
        if (score && parseInt(score) >= 100) {
            res.set({
                'X-Security-Action': 'THREAT_BLOCKED',
                'Retry-After': '86400'
            });
            return res.status(403).json({ 
                message: 'تم حظر الوصول بسبب نشاط مشبوه.', 
                requiresCaptcha: true,
                lockout: true
            });
        }
        req.securityFingerprint = fp;
        next();
    } catch (e) {
        next();
    }
};

const recordAbuse = (req) => {
    if (isRedisDown() || !req.securityFingerprint) return;
    const scoreKey = `sec:abuse:score:${req.securityFingerprint}`;
    redisClient.multi()
        .incrby(scoreKey, 25)
        .expire(scoreKey, 86400)
        .exec()
        .catch(() => {});
};

const storeFactory = (prefix) => new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: `sec:${prefix}:`
});

const createUltimateShield = ({ windowMs, max, prefix, keyGenerator, delayAfter, message, strictFail, sensitiveKey }) => {
    const speedStore = storeFactory(`sd:${prefix}`);
    const limitStore = storeFactory(`rl:${prefix}`);

    const resolvedKeyGenerator = (req, res) => {
        const rawKey = keyGenerator(req, res);
        return sensitiveKey ? secureHash(rawKey) : rawKey;
    };

    const speedLimiter = slowDown({
        store: speedStore,
        windowMs,
        delayAfter: delayAfter || Math.max(1, Math.floor(max * 0.3)),
        delayMs: (hits) => Math.min(hits * 1000, 30000),
        maxDelayMs: 30000,
        keyGenerator: resolvedKeyGenerator,
        skip: strictFail ? () => false : isRedisDown
    });

    const requestLimiter = rateLimit({
        store: limitStore,
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: resolvedKeyGenerator,
        skip: strictFail ? () => false : isRedisDown,
        handler: (req, res) => {
            recordAbuse(req);
            res.set({
                'X-Security-Action': 'CAPTCHA_REQUIRED',
                'Retry-After': Math.ceil(windowMs / 1000)
            });
            res.status(429).json({
                ...message,
                lockout: true,
                requiresCaptcha: true
            });
        }
    });

    const middlewares = [abuseScoringMiddleware, speedLimiter, requestLimiter];
    if (strictFail) middlewares.unshift(requireRedis);
    return middlewares;
};

const loginIpLimiter = createUltimateShield({
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: 'login_ip',
    delayAfter: 3,
    keyGenerator: (req) => req.ip,
    message: { message: "محاولات تسجيل دخول كثيرة. تم الحظر مؤقتاً." },
    strictFail: true,
    sensitiveKey: false
});

const loginAccountLimiter = createUltimateShield({
    windowMs: 15 * 60 * 1000,
    max: 3,
    prefix: 'login_acc',
    delayAfter: 1,
    keyGenerator: (req) => String(req.body?.identifier || 'unknown').toLowerCase().trim(),
    message: { message: "تجاوزت الحد المسموح لتسجيل الدخول للحساب. تم القفل لمدة 15 دقيقة." },
    strictFail: true,
    sensitiveKey: true
});

const authLoginLimiter = [
    requireRedis,
    abuseScoringMiddleware,
    ...loginIpLimiter.filter(m => m !== requireRedis && m !== abuseScoringMiddleware),
    ...loginAccountLimiter.filter(m => m !== requireRedis && m !== abuseScoringMiddleware)
];

const apiLimiter = createUltimateShield({
    windowMs: 60 * 1000,
    max: 100,
    prefix: 'api',
    delayAfter: 50,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { message: "تجاوزت الحد المسموح من الطلبات." },
    strictFail: false,
    sensitiveKey: false
});

const uploadLimiter = createUltimateShield({
    windowMs: 60 * 60 * 1000,
    max: 15,
    prefix: 'upload',
    delayAfter: 5,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { message: "تجاوزت الحد المسموح للرفع." },
    strictFail: false,
    sensitiveKey: false
});

const publicQuizLimiter = createUltimateShield({
    windowMs: 15 * 60 * 1000,
    max: 15,
    prefix: 'quiz',
    delayAfter: 5,
    keyGenerator: (req) => req.ip,
    message: { message: "تجاوزت الحد المسموح." },
    strictFail: false,
    sensitiveKey: false
});

const redeemAccountLimiter = createUltimateShield({
    windowMs: 30 * 60 * 1000,
    max: 10,
    prefix: 'redeem_acc',
    delayAfter: 3,
    keyGenerator: (req) => req.user?.email || 'anon',
    message: { message: "محاولات كثيرة جداً من هذا الحساب. تم التجميد 30 دقيقة." },
    strictFail: true,
    sensitiveKey: true
});

const redeemIpLimiter = createUltimateShield({
    windowMs: 30 * 60 * 1000,
    max: 20,
    prefix: 'redeem_ip',
    delayAfter: 5,
    keyGenerator: (req) => req.ip,
    message: { message: "محاولات تفعيل كثيرة من شبكتك. تم التجميد 30 دقيقة." },
    strictFail: true,
    sensitiveKey: false
});

const redeemCodeLimiter = createUltimateShield({
    windowMs: 30 * 60 * 1000,
    max: 15,
    prefix: 'redeem_code',
    delayAfter: 3,
    keyGenerator: (req) => String(req.body?.code || 'nocode').toUpperCase().trim(),
    message: { message: "محاولات كثيرة جداً على هذا الكود. تم التجميد 30 دقيقة." },
    strictFail: true,
    sensitiveKey: true
});

const redeemLimiter = [
    requireRedis,
    abuseScoringMiddleware,
    ...redeemAccountLimiter.filter(m => m !== requireRedis && m !== abuseScoringMiddleware),
    ...redeemIpLimiter.filter(m => m !== requireRedis && m !== abuseScoringMiddleware),
    ...redeemCodeLimiter.filter(m => m !== requireRedis && m !== abuseScoringMiddleware)
];

const applyGlobalSecurity = (app) => {
    if (process.env.NODE_ENV === 'production') {
        app.set('trust proxy', 1);
    }
    app.disable('x-powered-by');
    
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https:", "data:"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: [],
                blockAllMixedContent: [],
            },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: { policy: "same-origin" },
        crossOriginResourcePolicy: { policy: "same-site" },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        hsts: {
            maxAge: 63072000,
            includeSubDomains: true,
            preload: true
        },
        ieNoOpen: true,
        noSniff: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));
    
    app.use(hpp());
};

module.exports = { 
    authLoginLimiter,
    apiLimiter, 
    uploadLimiter, 
    publicQuizLimiter, 
    redeemLimiter,
    applyGlobalSecurity
};
