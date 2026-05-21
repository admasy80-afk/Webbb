'use strict';
require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const hpp = require('hpp');
const busboy = require('busboy');
const { z } = require('zod');
const pino = require('pino');
const pinoHttp = require('pino-http');

const {
    S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
    ListMultipartUploadsCommand, AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

/* ==========================================================
   1) Logger
   ========================================================== */
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
        paths: [
            'req.headers.authorization', 'req.headers.cookie',
            'req.headers["x-csrf-token"]', '*.password', '*.token',
            '*.secret', '*.refreshToken', '*.accessToken'
        ],
        remove: true
    },
    base: { service: 'eld7e7-api', env: process.env.NODE_ENV || 'production' }
});

/* ==========================================================
   2) Required env
   ========================================================== */
const REQUIRED_ENV = ['JWT_SECRET', 'MONGO_URL', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
    logger.fatal({ missingEnv }, 'متغيرات بيئة إلزامية ناقصة');
    process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
    logger.fatal('JWT_SECRET قصير جدًا — لازم 32 حرف على الأقل');
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.createHash('sha256').update(JWT_SECRET + '::refresh').digest('hex');
const PUBLIC_ACCESS_SECRET = process.env.PUBLIC_ACCESS_SECRET || crypto.createHash('sha256').update(JWT_SECRET + '::public').digest('hex');
const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'eld7e7-platform';
const JWT_AUDIENCE = 'eld7e7-users';
const ACCESS_TOKEN_TTL = '2h';
const REFRESH_TOKEN_TTL_DAYS = 30;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'eld7e7';
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PROD = NODE_ENV === 'production';

/* ==========================================================
   3) Express app
   ========================================================== */
const app = express();
const PORT = process.env.PORT || 3000;
let server;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.disable('etag');

/* ==========================================================
   3.1) Per-request nonce (CSP)
   ========================================================== */
app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use(pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    },
    serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.ip }),
        res: (res) => ({ statusCode: res.statusCode })
    }
}));

/* ==========================================================
   4) Helmet + CSP (nonce based)
   ========================================================== */
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                (req, res) => `'nonce-${res.locals.cspNonce}'`,
                "'strict-dynamic'",
                'https:'
            ],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
            fontSrc: ["'self'", 'https:', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            mediaSrc: ["'self'", 'blob:', 'https:'],
            connectSrc: ["'self'", 'https:'],
            workerSrc: ["'self'", 'blob:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: IS_PROD ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    noSniff: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    dnsPrefetchControl: { allow: false }
}));

app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
});

/* ==========================================================
   5) CORS
   ========================================================== */
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('CORS Policy Rejection'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400
}));

app.use(compression({
    filter: (req, res) => {
        if (req.path.startsWith('/api/video/stream/')) return false;
        return compression.filter(req, res);
    }
}));

/* ==========================================================
   6) JSON parser — يتخطى راوت الرفع
   ========================================================== */
const jsonParser = express.json({ limit: '1mb', strict: true });
app.use((req, res, next) => {
    if (req.path === '/api/admin/upload-course') return next();
    return jsonParser(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: IS_PROD ? '7d' : 0,
    etag: true,
    index: ['index.html'],
    setHeaders: (res, filePath) => {
        if (/\.(html)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
}));

/* ==========================================================
   7) NoSQL injection sanitizer (deep, safe, non-mutating-on-arrays-keys)
   ========================================================== */
const SANITIZE_DEPTH = 8;
const sanitizeMongo = (obj, depth = 0) => {
    if (depth > SANITIZE_DEPTH) return;
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (item && typeof item === 'object') sanitizeMongo(item, depth + 1);
        }
        return;
    }
    for (const key of Object.keys(obj)) {
        if (key.startsWith('$') || key.includes('.')) {
            logger.warn({ key }, 'NoSQL injection attempt blocked');
            try { delete obj[key]; } catch (_) {}
            continue;
        }
        const val = obj[key];
        if (val && typeof val === 'object') sanitizeMongo(val, depth + 1);
    }
};
app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object') sanitizeMongo(req.body);
    if (req.query && typeof req.query === 'object') sanitizeMongo(req.query);
    next();
});

app.use(hpp());

/* ==========================================================
   8) Schemas
   ========================================================== */
const courseSchema = z.object({
    courseName: z.string().trim().min(2).max(100),
    grade: z.string().trim().min(2).max(50),
    description: z.string().max(2000).optional().default(''),
    duration: z.string().max(50).optional().default(''),
    imageUrl: z.string().max(15 * 1024 * 1024).optional().default('')
});

const gradeSchema = z.object({ grade: z.string().trim().min(2).max(50) });

const loginSchema = z.object({
    identifier: z.string().trim().min(3).max(120).optional(),
    password: z.string().min(1).max(200).optional(),
    first_name: z.string().trim().min(1).max(80).optional(),
    email: z.string().email().max(120).optional(),
    phone: z.string().trim().min(5).max(30).regex(/^[+0-9\s-]+$/).optional(),
    grade: z.string().trim().max(50).optional()
}).passthrough();

const mcqQuestionSchema = z.object({
    question: z.string().trim().min(1).max(2000),
    choices: z.array(z.string().max(500)).min(2).max(8),
    correctAnswer: z.union([z.number().int().min(0).max(7), z.string().max(500)]),
    hint: z.string().max(2000).optional().default(''),
    points: z.number().int().min(0).max(1000).optional().default(1)
});
const quizPayloadSchema = z.object({
    grade: z.string().trim().min(1).max(50),
    quizTitle: z.string().trim().min(1).max(200),
    questionsArray: z.array(mcqQuestionSchema).min(1).max(200)
});
const publicQuizPayloadSchema = z.object({
    grade: z.string().trim().max(50).optional().default('عام'),
    quizTitle: z.string().trim().min(1).max(200),
    questionsArray: z.array(mcqQuestionSchema).min(1).max(200)
});

/* ==========================================================
   9) Rate limiters
   ========================================================== */
const limiterDefaults = { standardHeaders: 'draft-7', legacyHeaders: false };
const loginLimiter = rateLimit({
    ...limiterDefaults, windowMs: 15 * 60 * 1000, max: 20,
    keyGenerator: (req) => `${req.ip}:${(req.body?.identifier || 'anon').slice(0, 80)}`,
    message: { message: 'محاولات كثيرة جداً.' }
});
const ipStrictLimiter = rateLimit({
    ...limiterDefaults, windowMs: 15 * 60 * 1000, max: 100,
    keyGenerator: (req) => req.ip,
    message: { message: 'تجاوزت الحد المسموح من المحاولات.' }
});
const apiLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 1000, max: 100, message: { message: 'تجاوزت الحد المسموح من الطلبات.' } });
const uploadLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 60 * 1000, max: 30, message: { message: 'تجاوزت حد الرفع.' } });
const publicQuizLimiter = rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, max: 30, message: { message: 'تجاوزت الحد المسموح.' } });
const refreshLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 60 * 1000, max: 60, message: { message: 'تجاوزت حد التجديد.' } });

const SKIP_API_LIMIT = ['/saveUser', '/admin/upload-course', '/public/quiz', '/student/save-progress', '/video/stream', '/auth/refresh'];
app.use('/api', (req, res, next) => {
    const sub = req.path.split('?')[0];
    for (const skip of SKIP_API_LIMIT) if (sub.startsWith(skip)) return next();
    return apiLimiter(req, res, next);
});

/* ==========================================================
   10) Mongo
   ========================================================== */
let db, usersCollection, sessionsCollection, auditCollection, lockoutCollection, mongoClient;
async function connectMongo() {
    mongoClient = new MongoClient(process.env.MONGO_URL, {
        maxPoolSize: 20, minPoolSize: 5, maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000, retryWrites: true
    });
    await mongoClient.connect();
    db = mongoClient.db('dahih_db');
    usersCollection = db.collection('users');
    sessionsCollection = db.collection('sessions');
    auditCollection = db.collection('audit_logs');
    lockoutCollection = db.collection('lockouts');

    await Promise.all([
        usersCollection.createIndex({ email: 1 }, { unique: true, background: true }),
        usersCollection.createIndex({ phone: 1 }, { unique: true, background: true }),
        usersCollection.createIndex({ role: 1, status: 1 }, { background: true }),
        db.collection('courses').createIndex({ grade: 1, createdAt: 1 }, { background: true }),
        db.collection('courses').createIndex({ telegramMsgId: 1 }, { background: true }),
        db.collection('curriculum_content').createIndex({ grade: 1 }, { background: true }),
        sessionsCollection.createIndex({ jti: 1 }, { unique: true, background: true }),
        sessionsCollection.createIndex({ email: 1 }, { background: true }),
        sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true }),
        auditCollection.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90, background: true }),
        auditCollection.createIndex({ email: 1, action: 1 }, { background: true }),
        lockoutCollection.createIndex({ key: 1 }, { unique: true, background: true }),
        lockoutCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true })
    ]);
    logger.info('قاعدة البيانات والـ indexes جاهزة');
}

/* ==========================================================
   11) R2 client
   ========================================================== */
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    requestHandler: { requestTimeout: 0, connectionTimeout: 10000 }
});

/* ==========================================================
   12) Helpers
   ========================================================== */
const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
};

const generateFingerprint = (req) => {
    const ua = req.headers['user-agent'] || '';
    const lang = req.headers['accept-language'] || '';
    const enc = req.headers['accept-encoding'] || '';
    return crypto.createHash('sha256').update(`${ua}|${lang}|${enc}`).digest('hex');
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const formatProgressTime = (t) => {
    if (!Number.isFinite(t) || t <= 0) return null;
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const isValidObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

const signAccessToken = (payload) => jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM, expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER, audience: JWT_AUDIENCE, jwtid: crypto.randomUUID()
});

const signRefreshToken = (payload) => {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET, {
        algorithm: JWT_ALGORITHM, expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
        issuer: JWT_ISSUER, audience: JWT_AUDIENCE, jwtid: jti
    });
    return { token, jti };
};

const issueTokens = async (user, fingerprint, req) => {
    const basePayload = { email: user.email, role: user.role, fingerprint };
    const accessToken = signAccessToken(basePayload);
    const { token: refreshToken, jti } = signRefreshToken(basePayload);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
    try {
        await sessionsCollection.insertOne({
            jti, email: user.email, role: user.role, fingerprint,
            ip: req.ip, userAgent: (req.headers['user-agent'] || '').slice(0, 300),
            createdAt: new Date(), expiresAt, revoked: false
        });
    } catch (e) { logger.warn({ err: e.message }, 'session insert failed'); }
    return { accessToken, refreshToken };
};

const audit = async (action, meta = {}) => {
    try {
        await auditCollection.insertOne({ action, at: new Date(), ...meta });
    } catch (_) {}
};

const LOCK_THRESHOLD = 8;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 30 * 60 * 1000;
const registerFailedLogin = async (key) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_WINDOW_MS);
    const doc = await lockoutCollection.findOneAndUpdate(
        { key },
        { $inc: { fails: 1 }, $setOnInsert: { firstFailAt: now }, $set: { expiresAt } },
        { upsert: true, returnDocument: 'after' }
    );
    const cur = doc?.value || doc;
    if (cur && cur.fails >= LOCK_THRESHOLD) {
        await lockoutCollection.updateOne({ key }, {
            $set: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS), expiresAt: new Date(Date.now() + LOCK_DURATION_MS) }
        });
    }
};
const isLocked = async (key) => {
    const cur = await lockoutCollection.findOne({ key });
    if (!cur) return false;
    if (cur.lockedUntil && cur.lockedUntil > new Date()) return true;
    return false;
};
const clearLockout = async (key) => { try { await lockoutCollection.deleteOne({ key }); } catch (_) {} };

/* ==========================================================
   12.1) Magic bytes detection
   ========================================================== */
const detectVideoMime = (buf) => {
    if (!buf || buf.length < 12) return null;
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4';
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'video/webm';
    return null;
};

/* ==========================================================
   13) Auth middlewares
   ========================================================== */
const authenticateToken = (req, res, next) => {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7).trim();
    if (!token && req.path.startsWith('/api/video/stream/')) token = req.query.token;

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: 'غير مصرح بالوصول.', reason: 'Token missing' });
    }
    jwt.verify(token, JWT_SECRET, {
        algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE, clockTolerance: 5
    }, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'انتهت صلاحية الجلسة.', reason: err.message });
        if (decoded.type === 'refresh') {
            return res.status(403).json({ message: 'نوع توكن غير صالح.' });
        }
        const currentFp = generateFingerprint(req);
        if (decoded.fingerprint && !safeEqual(decoded.fingerprint, currentFp)) {
            audit('fingerprint_mismatch', { email: decoded.email, ip: req.ip });
            return res.status(403).json({ message: 'الجلسة غير صالحة لهذا الجهاز.' });
        }
        req.user = decoded;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'dev' && req.user?.role !== 'owner') {
        return res.status(403).json({ message: 'مطلوب صلاحيات مسؤول.' });
    }
    next();
};

/* ==========================================================
   14) Auth routes
   ========================================================== */
app.get('/api/verify-session', authenticateToken, async (req, res) => {
    try {
        const { role, email } = req.user;
        if (role === 'dev' || role === 'owner') {
            return res.status(200).json({ message: 'OK', redirectTo: '/admin.html', role });
        }
        const student = await usersCollection.findOne({ email }, { projection: { status: 1 } });
        if (!student) return res.status(401).json({ message: 'الحساب غير موجود.' });
        if (student.status === 'pending' || student.status === 'rejected') {
            return res.status(200).json({ message: 'حساب غير مفعل', redirectTo: '/status.html', role });
        }
        return res.status(200).json({ message: 'OK', redirectTo: '/student/', role });
    } catch (err) {
        req.log.error({ err: err.message }, 'verify-session failed');
        res.status(500).json({ message: 'خطأ داخلي' });
    }
});

app.post('/api/auth/refresh', refreshLimiter, ipStrictLimiter, async (req, res) => {
    try {
        const refreshToken = req.body?.refreshToken;
        if (!refreshToken || typeof refreshToken !== 'string') {
            return res.status(400).json({ message: 'بيانات ناقصة.' });
        }
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
                algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE, clockTolerance: 5
            });
        } catch (e) {
            return res.status(403).json({ message: 'توكن التجديد غير صالح.' });
        }
        if (decoded.type !== 'refresh' || !decoded.jti) {
            return res.status(403).json({ message: 'نوع توكن غير صالح.' });
        }
        const session = await sessionsCollection.findOne({ jti: decoded.jti });
        if (!session || session.revoked || session.expiresAt < new Date()) {
            return res.status(403).json({ message: 'الجلسة منتهية.' });
        }
        const fp = generateFingerprint(req);
        if (session.fingerprint && !safeEqual(session.fingerprint, fp)) {
            await sessionsCollection.updateOne({ jti: decoded.jti }, { $set: { revoked: true, revokedAt: new Date(), revokeReason: 'fp_mismatch' } });
            audit('refresh_fp_mismatch', { email: decoded.email, ip: req.ip });
            return res.status(403).json({ message: 'الجلسة غير صالحة لهذا الجهاز.' });
        }
        await sessionsCollection.updateOne({ jti: decoded.jti }, { $set: { revoked: true, revokedAt: new Date(), revokeReason: 'rotated' } });
        const tokens = await issueTokens({ email: decoded.email, role: decoded.role }, fp, req);
        res.status(200).json({ token: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch (err) {
        req.log.error({ err: err.message }, 'refresh failed');
        res.status(500).json({ message: 'خطأ داخلي' });
    }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        if (refreshToken) {
            try {
                const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
                    algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE
                });
                if (decoded?.jti) {
                    await sessionsCollection.updateOne({ jti: decoded.jti }, { $set: { revoked: true, revokedAt: new Date(), revokeReason: 'logout' } });
                }
            } catch (_) {}
        } else {
            await sessionsCollection.updateMany({ email: req.user.email, revoked: false }, { $set: { revoked: true, revokedAt: new Date(), revokeReason: 'logout_all' } });
        }
        audit('logout', { email: req.user.email, ip: req.ip });
        res.status(200).json({ message: 'تم تسجيل الخروج.' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ' });
    }
});

app.post('/api/saveUser', loginLimiter, ipStrictLimiter, async (req, res) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'بيانات غير صالحة.' });
        const data = parsed.data;
        if (!usersCollection) return res.status(503).json({ message: 'السيرفر لسه بيسخن..' });

        const { DEV_EMAIL, DEV_PASSWORD_HASH, OWNER_EMAIL, OWNER_PASSWORD_HASH } = process.env;
        const fingerprint = generateFingerprint(req);

        if (data.identifier && data.password) {
            const lockKey = `login:${data.identifier.toLowerCase()}`;
            if (await isLocked(lockKey)) {
                audit('login_locked', { identifier: data.identifier, ip: req.ip });
                return res.status(429).json({ message: 'الحساب مقفل مؤقتاً بسبب محاولات كثيرة. حاول لاحقاً.' });
            }

            let isDev = false, isOwner = false;
            if (DEV_EMAIL && safeEqual(data.identifier, DEV_EMAIL) && DEV_PASSWORD_HASH) {
                isDev = await bcrypt.compare(data.password, DEV_PASSWORD_HASH);
            }
            if (OWNER_EMAIL && safeEqual(data.identifier, OWNER_EMAIL) && OWNER_PASSWORD_HASH) {
                isOwner = await bcrypt.compare(data.password, OWNER_PASSWORD_HASH);
            }
            if (isDev || isOwner) {
                await clearLockout(lockKey);
                const roleName = isDev ? 'المطور' : 'مستر';
                const userRole = isDev ? 'dev' : 'owner';
                const tokens = await issueTokens({ email: data.identifier, role: userRole }, fingerprint, req);
                audit('login_admin', { email: data.identifier, role: userRole, ip: req.ip });
                return res.status(200).json({
                    message: `أهلاً بك يا ${roleName}`,
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    userData: { name: roleName, role: userRole, email: data.identifier, status: 'accepted', grade: 'إدارة المنصة' }
                });
            }

            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }]
            });
            const validPassword = user ? await bcrypt.compare(data.password, user.password) : false;

            if (user && validPassword) {
                if (user.status !== 'accepted') {
                    audit('login_blocked_status', { email: user.email, status: user.status, ip: req.ip });
                    return res.status(403).json({ message: 'الحساب قيد المراجعة أو مرفوض.' });
                }
                await clearLockout(lockKey);
                const tokens = await issueTokens({ email: user.email, role: 'student' }, fingerprint, req);
                audit('login_success', { email: user.email, ip: req.ip });
                return res.status(200).json({
                    message: 'تم الدخول',
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    userData: {
                        name: user.first_name, grade: user.grade, status: user.status || 'pending',
                        email: user.email, phone: user.phone, role: 'student',
                        phoneVerified: user.phoneVerified || false
                    }
                });
            }
            await registerFailedLogin(lockKey);
            audit('login_fail', { identifier: data.identifier, ip: req.ip });
            await delay(800 + Math.floor(Math.random() * 400));
            return res.status(401).json({ message: 'خطأ في بيانات الدخول' });
        }

        if (data.first_name && data.email && data.password && data.phone) {
            if (data.password.length < 8) {
                return res.status(400).json({ message: 'كلمة السر لازم 8 حروف على الأقل.' });
            }
            const existing = await usersCollection.findOne(
                { $or: [{ email: data.email }, { phone: data.phone }] },
                { projection: { _id: 1 } }
            );
            if (existing) return res.status(400).json({ message: 'البريد أو الهاتف مسجل بالفعل' });

            const hashedPassword = await bcrypt.hash(data.password, 12);
            const newUser = {
                first_name: data.first_name, email: data.email, phone: data.phone,
                grade: data.grade || '', password: hashedPassword,
                status: 'pending', role: 'student', points: 0,
                phoneVerified: false, progress: {}, createdAt: new Date()
            };
            try {
                await usersCollection.insertOne(newUser);
            } catch (err) {
                if (err.code === 11000) return res.status(400).json({ message: 'البريد أو الهاتف مسجل بالفعل' });
                throw err;
            }

            const tokens = await issueTokens({ email: data.email, role: 'student' }, fingerprint, req);
            audit('signup', { email: data.email, ip: req.ip });
            return res.status(200).json({
                message: 'تم إنشاء حساب بنجاح',
                token: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                userData: {
                    name: data.first_name, grade: data.grade, status: 'pending',
                    email: data.email, phone: data.phone, role: 'student', phoneVerified: false
                }
            });
        }

        return res.status(400).json({ message: 'بيانات غير مكتملة.' });
    } catch (err) {
        req.log.error({ err: err.message }, 'saveUser failed');
        res.status(500).json({ message: 'حدث خطأ داخلي' });
    }
});

/* ==========================================================
   15) Upload course (مع magic bytes + timeout + abort صحيح)
   ========================================================== */
app.post('/api/admin/upload-course', authenticateToken, requireAdmin, uploadLimiter, (req, res) => {
    let responded = false;
    let parallelUpload = null;
    let aborted = false;
    let magicChecked = false;
    let magicBuffer = Buffer.alloc(0);
    const MAGIC_BYTES_NEEDED = 16;

    const sendError = (status, message, meta) => {
        if (responded) return;
        responded = true;
        if (meta) req.log.warn(meta, message);
        if (!res.headersSent) res.status(status).json({ message });
    };

    req.setTimeout(30 * 60 * 1000);
    res.setTimeout(30 * 60 * 1000);

    let bb;
    try {
        bb = busboy({
            headers: req.headers,
            limits: {
                fileSize: 2 * 1024 * 1024 * 1024,
                fieldSize: 16 * 1024 * 1024,
                fieldNameSize: 200,
                files: 1,
                fields: 20
            }
        });
    } catch (err) {
        return sendError(400, 'صيغة الطلب غير صحيحة', { err: err.message });
    }

    const courseData = {};
    let fieldsReceived = false;

    bb.on('field', (name, val, info) => {
        if (info?.nameTruncated || info?.valueTruncated) {
            return sendError(413, `الحقل "${name}" أكبر من الحد المسموح.`, { field: name });
        }
        if (typeof name === 'string' && (name.startsWith('$') || name.includes('.'))) return;
        courseData[name] = val;
        if (courseData.courseName && courseData.grade) fieldsReceived = true;
    });

    bb.on('error', (err) => {
        if (parallelUpload) try { parallelUpload.abort(); } catch (_) {}
        sendError(400, `خطأ في قراءة البيانات: ${err.message}`, { err: err.message });
    });
    bb.on('filesLimit', () => sendError(400, 'تم تجاوز عدد الملفات.'));
    bb.on('fieldsLimit', () => sendError(400, 'تم تجاوز عدد الحقول.'));
    bb.on('partsLimit', () => sendError(400, 'تم تجاوز عدد الأجزاء.'));

    bb.on('file', (name, file, info) => {
        file.on('limit', () => {
            if (parallelUpload) try { parallelUpload.abort(); } catch (_) {}
            sendError(413, 'حجم الفيديو يتجاوز 2GB.');
        });

        if (!fieldsReceived) {
            file.resume();
            return sendError(400, 'يجب إرسال بيانات الدورة قبل ملف الفيديو.');
        }

        const parsed = courseSchema.safeParse(courseData);
        if (!parsed.success) {
            file.resume();
            const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ');
            return sendError(400, `بيانات الدورة غير صالحة — ${issues}`);
        }
        const cleanData = parsed.data;

        const allowedMimes = new Set(['video/mp4', 'video/webm']);
        const declaredMime = (info.mimeType || '').toLowerCase();
        if (!allowedMimes.has(declaredMime)) {
            file.resume();
            return sendError(415, 'صيغة غير مدعومة. ارفع MP4 أو WebM فقط.');
        }

        const ext = declaredMime === 'video/webm' ? 'webm' : 'mp4';
        const fileKey = `videos/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
        const telegramMsgId = crypto.randomUUID();

        const { PassThrough } = require('stream');
        const passthrough = new PassThrough();

        file.on('data', (chunk) => {
            if (magicChecked) return;
            magicBuffer = Buffer.concat([magicBuffer, chunk]);
            if (magicBuffer.length >= MAGIC_BYTES_NEEDED) {
                magicChecked = true;
                const detected = detectVideoMime(magicBuffer);
                if (!detected || detected !== declaredMime) {
                    if (parallelUpload) try { parallelUpload.abort(); } catch (_) {}
                    aborted = true;
                    file.unpipe(passthrough);
                    passthrough.destroy();
                    file.resume();
                    return sendError(415, 'محتوى الملف لا يطابق الامتداد. ملف غير صالح.');
                }
            }
        });

        file.on('error', (err) => {
            if (parallelUpload) try { parallelUpload.abort(); } catch (_) {}
            sendError(500, 'انقطع تدفق الفيديو أثناء الرفع.', { err: err.message });
        });

        file.pipe(passthrough);

        parallelUpload = new Upload({
            client: r2Client,
            params: {
                Bucket: R2_BUCKET_NAME, Key: fileKey, Body: passthrough,
                ContentType: declaredMime,
                Metadata: {
                    'course-name': encodeURIComponent(cleanData.courseName).slice(0, 200),
                    'uploaded-by': encodeURIComponent(req.user.email || '').slice(0, 200)
                }
            },
            queueSize: 4,
            partSize: 8 * 1024 * 1024,
            leavePartsOnError: false
        });

        parallelUpload.done()
            .then(async () => {
                if (aborted) return;
                try {
                    await db.collection('courses').insertOne({
                        courseName: cleanData.courseName,
                        grade: cleanData.grade,
                        description: cleanData.description,
                        duration: cleanData.duration || 'غير محدد',
                        image: cleanData.imageUrl,
                        telegramMsgId,
                        fileKey,
                        provider: 'R2',
                        mimeType: declaredMime,
                        createdAt: new Date(),
                        uploadedBy: req.user.email
                    });
                    audit('course_upload', { email: req.user.email, fileKey, course: cleanData.courseName });
                    if (!responded) {
                        responded = true;
                        res.status(200).json({ message: 'تم رفع الكورس بنجاح.', telegramMsgId });
                    }
                } catch (dbErr) {
                    req.log.error({ err: dbErr.message }, 'فشل حفظ الكورس — حذف الملف من R2');
                    try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: fileKey })); } catch (_) {}
                    sendError(500, 'حدث خطأ أثناء حفظ الدورة.', { err: dbErr.message });
                }
            })
            .catch((err) => {
                if (aborted) return;
                req.log.error({ err: err.message, fileKey }, 'فشل الرفع إلى R2');
                sendError(502, 'فشل الرفع السحابي. حاول مجدداً.');
            });
    });

    req.on('aborted', () => {
        aborted = true;
        if (parallelUpload) try { parallelUpload.abort(); } catch (_) {}
        req.log.warn('upload aborted by client');
    });
    req.on('close', () => {
        if (!res.writableEnded && parallelUpload && !responded) {
            aborted = true;
            try { parallelUpload.abort(); } catch (_) {}
        }
    });

    req.pipe(bb);
});

/* ==========================================================
   16) Video stream
   ========================================================== */
app.get('/api/video/stream/:msgId', authenticateToken, async (req, res) => {
    let streamTimeout;
    try {
        const { msgId } = req.params;
        if (!msgId || msgId.length > 64) return res.status(400).send('معرف غير صالح.');

        const range = req.headers.range;
        if (range && !/^bytes=\d+-\d*$/.test(range)) return res.status(416).send('نطاق البث غير صالح.');

        const queryId = /^\d+$/.test(msgId) ? parseInt(msgId, 10) : msgId;
        const course = await db.collection('courses').findOne(
            { telegramMsgId: queryId },
            { projection: { fileKey: 1 } }
        );
        if (!course?.fileKey) return res.status(404).send('الفيديو مفقود.');

        const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey }));
        const fileSize = head.ContentLength;

        if (range) {
            const [s, e] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(s, 10);
            const end = e ? parseInt(e, 10) : fileSize - 1;
            if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0 ||
                start >= fileSize || end >= fileSize || start > end) {
                return res.status(416).set('Content-Range', `bytes */${fileSize}`).send('النطاق المطلوب خارج حدود الملف.');
            }
        }

        const abortController = new AbortController();
        streamTimeout = setTimeout(() => abortController.abort(), 20000);

        const s3Response = await r2Client.send(
            new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey, Range: range }),
            { abortSignal: abortController.signal }
        );
        clearTimeout(streamTimeout);

        const headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': s3Response.ContentLength,
            'Content-Type': s3Response.ContentType || 'video/mp4',
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff'
        };
        if (s3Response.ContentRange) headers['Content-Range'] = s3Response.ContentRange;

        res.writeHead(range ? 206 : 200, headers);
        pipeline(s3Response.Body, res, (err) => {
            if (err && !res.writableEnded) req.log.warn({ err: err.message }, 'video stream pipeline ended');
        });

        req.on('close', () => { try { abortController.abort(); } catch (_) {} });
    } catch (err) {
        if (streamTimeout) clearTimeout(streamTimeout);
        req.log.error({ err: err.message }, 'video stream failed');
        if (!res.headersSent) {
            res.status(err.name === 'AbortError' ? 504 : 500).send('تعذر تحميل الفيديو.');
        }
    }
});

/* ==========================================================
   17) Student routes
   ========================================================== */
app.post('/api/student/save-progress', authenticateToken, async (req, res) => {
    try {
        const { msgId, currentTime } = req.body || {};
        if (!msgId || typeof msgId !== 'string' || msgId.length > 64 || /[$.]/.test(msgId)) {
            return res.status(400).json({ message: 'معرف غير صالح' });
        }
        const ct = Number(currentTime);
        if (!Number.isFinite(ct) || ct < 0 || ct > 86400) {
            return res.status(400).json({ message: 'وقت غير صالح' });
        }
        await usersCollection.updateOne(
            { email: req.user.email },
            { $set: { [`progress.${msgId}`]: Math.floor(ct) } }
        );
        res.status(200).json({ success: true });
    } catch (err) {
        req.log.error({ err: err.message }, 'save-progress failed');
        res.status(500).json({ message: 'فشل حفظ التقدم.' });
    }
});

app.post('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const parsed = gradeSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'البيانات غير صحيحة.' });
        const { grade } = parsed.data;

        const [user, content, rawCourses] = await Promise.all([
            usersCollection.findOne({ email: req.user.email }, { projection: { points: 1, progress: 1 } }),
            db.collection('curriculum_content').findOne({ grade }),
            db.collection('courses').find({ grade }).sort({ createdAt: 1 }).toArray()
        ]);

        const studentProgress = user?.progress || {};
        const courses = rawCourses.map(c => ({
            id: c._id,
            courseName: c.courseName,
            description: c.description,
            telegramMsgId: c.telegramMsgId,
            duration: c.duration || 'غير محدد',
            image: c.image || '',
            lastWatched: studentProgress[c.telegramMsgId] ? formatProgressTime(studentProgress[c.telegramMsgId]) : null
        }));

        res.status(200).json({
            studentPoints: user?.points || 0,
            content: content || { points: [], questions: [], tests: [], quizzes: [] },
            courses
        });
    } catch (err) {
        req.log.error({ err: err.message }, 'dashboard-data failed');
        res.status(500).json({ message: 'فشل جلب البيانات.' });
    }
});

/* ==========================================================
   18) Admin routes
   ========================================================== */
app.get('/api/admin/get-all-courses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const courses = await db.collection('courses').find({}).sort({ createdAt: -1 })
            .skip(skip).limit(limit).toArray();
        res.status(200).json({
            courses: courses.map(c => ({
                id: c._id.toString(), courseName: c.courseName, grade: c.grade,
                description: c.description, telegramMsgId: c.telegramMsgId,
                duration: c.duration, image: c.image
            }))
        });
    } catch (err) {
        req.log.error({ err: err.message }, 'get-all-courses failed');
        res.status(500).json({ message: 'خطأ في السيرفر' });
    }
});

app.delete('/api/admin/delete-course/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        const course = await db.collection('courses').findOne({ _id: new ObjectId(id) });
        if (!course) return res.status(404).json({ message: 'الكورس غير موجود.' });
        if (course.fileKey) {
            try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey })); }
            catch (e) { req.log.warn({ err: e.message }, 'فشل حذف الملف من R2'); }
        }
        await db.collection('courses').deleteOne({ _id: new ObjectId(id) });
        audit('course_delete', { email: req.user.email, id });
        res.status(200).json({ message: 'تم حذف المحاضرة بنجاح' });
    } catch (err) {
        req.log.error({ err: err.message }, 'delete-course failed');
        res.status(500).json({ message: 'فشل الحذف' });
    }
});

app.post('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [studentsCount, pendingCount] = await Promise.all([
            usersCollection.countDocuments({ role: 'student', status: 'accepted' }),
            usersCollection.countDocuments({ role: 'student', status: 'pending' })
        ]);
        res.status(200).json({ studentsCount, pendingCount, questionsCount: 'نشط' });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/pending', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const pending = await usersCollection.find(
            { status: 'pending', role: 'student' },
            { projection: { password: 0 } }
        ).toArray();
        res.status(200).json(pending);
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, newStatus, reason } = req.body || {};
        if (!studentEmail || !['accepted', 'pending', 'rejected'].includes(newStatus)) {
            return res.status(400).json({ message: 'بيانات غير صالحة' });
        }
        await usersCollection.updateOne(
            { email: String(studentEmail).trim() },
            { $set: { status: newStatus, rejection_reason: String(reason || '').slice(0, 500) } }
        );
        audit('update_status', { admin: req.user.email, target: studentEmail, newStatus });
        res.status(200).json({ message: 'تم التحديث' });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/students-by-grade', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body || {};
        if (!grade || typeof grade !== 'string') return res.status(400).json({ message: 'الصف مطلوب' });
        const students = await usersCollection.find(
            { status: 'accepted', role: 'student', grade: String(grade).slice(0, 50) },
            { projection: { password: 0 } }
        ).toArray();
        res.status(200).json(students);
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/add-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, type, pointText, questionText, questionHint } = req.body || {};
        if (!grade || !type) return res.status(400).json({ message: 'بيانات ناقصة' });
        if (!['point', 'question'].includes(type)) return res.status(400).json({ message: 'نوع غير معروف' });
        const col = db.collection('curriculum_content');
        if (type === 'point') {
            await col.updateOne({ grade: String(grade).slice(0, 50) }, { $push: { points: String(pointText || '').slice(0, 2000) } }, { upsert: true });
        } else {
            await col.updateOne({ grade: String(grade).slice(0, 50) },
                { $push: { questions: { question: String(questionText || '').slice(0, 2000), hint: String(questionHint || '').slice(0, 2000) } } },
                { upsert: true });
        }
        res.status(200).json({ message: 'تمت الإضافة' });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/update-points', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, points } = req.body || {};
        const pts = parseInt(points, 10);
        if (!studentEmail || !Number.isFinite(pts) || pts < -1e9 || pts > 1e9) return res.status(400).json({ message: 'بيانات غير صالحة' });
        await usersCollection.updateOne({ email: String(studentEmail).trim() }, { $set: { points: pts } });
        audit('update_points', { admin: req.user.email, target: studentEmail, points: pts });
        res.status(200).json({ message: 'تم التحديث' });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/toggle-stream', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isLive } = req.body || {};
        const col = db.collection('curriculum_content');
        if (isLive) {
            await col.updateMany({}, { $set: { liveStream: { isLive: true, startedAt: new Date() } } });
            res.status(200).json({ message: 'تم إطلاق البث بنجاح' });
        } else {
            await col.updateMany({}, { $unset: { liveStream: '' } });
            res.status(200).json({ message: 'تم إيقاف البث بنجاح' });
        }
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/add-mcq-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const parsed = quizPayloadSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'بيانات غير صالحة', issues: parsed.error.issues.map(i => i.message) });
        const { grade, quizTitle, questionsArray } = parsed.data;
        const quizId = 'quiz_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        await db.collection('curriculum_content').updateOne(
            { grade },
            { $push: { quizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [], createdAt: new Date() } } },
            { upsert: true }
        );
        res.status(200).json({ message: 'تمت الإضافة', quizId });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/add-public-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const parsed = publicQuizPayloadSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'بيانات غير صالحة', issues: parsed.error.issues.map(i => i.message) });
        const { grade, quizTitle, questionsArray } = parsed.data;
        const quizId = 'pub_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        await db.collection('curriculum_content').updateOne(
            { grade },
            { $push: { publicQuizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [], createdAt: new Date() } } },
            { upsert: true }
        );
        res.status(200).json({ success: true, message: 'تمت الإضافة', quizId });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/get-grade-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body || {};
        if (!grade) return res.status(400).json({ message: 'الصف مطلوب' });
        const content = await db.collection('curriculum_content').findOne({ grade: String(grade).slice(0, 50) })
            || { points: [], questions: [], tests: [], quizzes: [], publicQuizzes: [] };
        res.status(200).json(content);
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

app.post('/api/admin/delete-item', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, itemType, identifier } = req.body || {};
        if (!grade || !itemType || identifier === undefined) return res.status(400).json({ message: 'بيانات ناقصة' });
        const updates = {
            point: { $pull: { points: identifier } },
            question: { $pull: { questions: { question: identifier } } },
            test: { $pull: { tests: { testName: identifier } } },
            quiz: { $pull: { quizzes: { id: identifier } } },
            publicQuiz: { $pull: { publicQuizzes: { id: identifier } } }
        };
        if (!updates[itemType]) return res.status(400).json({ message: 'نوع غير معروف' });
        await db.collection('curriculum_content').updateOne({ grade }, updates[itemType]);
        audit('delete_item', { admin: req.user.email, grade, itemType });
        res.status(200).json({ message: 'تم الحذف بنجاح' });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

/* ==========================================================
   19) Public quiz (HMAC-signed access) + student
   ========================================================== */
app.get('/api/public/access-token', publicQuizLimiter, (req, res) => {
    const ts = Date.now();
    const sig = crypto.createHmac('sha256', PUBLIC_ACCESS_SECRET).update(`${ts}`).digest('hex');
    res.status(200).json({ ts, sig });
});

const verifyPublicAccess = (req, res, next) => {
    const ts = parseInt(req.headers['x-public-ts'] || req.query.ts || '0', 10);
    const sig = req.headers['x-public-sig'] || req.query.sig;
    const legacy = req.headers['x-public-access'];
    if (legacy === 'eld7e7-web-client' && !ts && !sig) {
        return next();
    }
    if (!ts || !sig || typeof sig !== 'string') {
        return res.status(403).json({ message: 'وصول غير مصرح.' });
    }
    if (Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
        return res.status(403).json({ message: 'انتهت صلاحية المفتاح.' });
    }
    const expected = crypto.createHmac('sha256', PUBLIC_ACCESS_SECRET).update(`${ts}`).digest('hex');
    if (!safeEqual(expected, sig)) return res.status(403).json({ message: 'توقيع غير صالح.' });
    next();
};

app.get('/api/public/quiz', publicQuizLimiter, verifyPublicAccess, async (req, res) => {
    try {
        const { id, device } = req.query;
        if (typeof id !== 'string' || id.length > 80) return res.status(400).json({ message: 'معرف غير صالح.' });

        const doc = await db.collection('curriculum_content').findOne({ 'publicQuizzes.id': id });
        if (!doc) return res.status(404).json({ message: 'تعذر العثور على الاختبار.' });
        const quiz = doc.publicQuizzes.find(q => q.id === id);
        if (!quiz) return res.status(404).json({ message: 'الاختبار غير موجود.' });

        if (device && Array.isArray(quiz.results) && quiz.results.some(r => r.visitorId === device)) {
            return res.status(403).json({ message: 'كان غيرك اشطر😂😂' });
        }
        quiz.grade = doc.grade;
        res.status(200).json(quiz);
    } catch (err) {
        req.log.error({ err: err.message }, 'public quiz failed');
        res.status(500).json({ message: 'حدث خطأ داخلي.' });
    }
});

app.post('/api/student/submit-quiz', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email || req.body?.email;
        const { studentName, grade, quizId, score, percentage, visitorId, userAnswers } = req.body || {};
        if (!email || !grade || !quizId) return res.status(400).json({ message: 'بيانات ناقصة' });
        if (typeof quizId !== 'string' || quizId.length > 80) return res.status(400).json({ message: 'معرف غير صالح' });
        const col = db.collection('curriculum_content');
        const result = {
            email,
            studentName: String(studentName || '').slice(0, 200),
            score: Number.isFinite(Number(score)) ? Number(score) : 0,
            percentage: Number.isFinite(Number(percentage)) ? Number(percentage) : 0,
            visitorId: visitorId ? String(visitorId).slice(0, 200) : null,
            userAnswers: Array.isArray(userAnswers) ? userAnswers.slice(0, 500) : [],
            date: new Date()
        };
        if (quizId.startsWith('pub_')) {
            const exists = await col.findOne({
                grade,
                publicQuizzes: { $elemMatch: { id: quizId, results: { $elemMatch: { $or: [{ visitorId: result.visitorId }, { email }] } } } }
            });
            if (exists) return res.status(403).json({ message: 'لقد قمت بتقديم هذا الاختبار مسبقاً!' });
            await col.updateOne({ grade, 'publicQuizzes.id': quizId }, { $push: { 'publicQuizzes.$.results': result } });
        } else {
            await col.updateOne({ grade, 'quizzes.id': quizId }, { $push: { 'quizzes.$.results': result } });
        }
        res.status(200).json({ message: 'تم حفظ النتيجة بنجاح' });
    } catch (err) {
        req.log.error({ err: err.message }, 'submit-quiz failed');
        res.status(500).json({ message: 'خطأ' });
    }
});

app.post('/api/check-status', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email;
        const user = await usersCollection.findOne({ email },
            { projection: { status: 1, rejection_reason: 1, phoneVerified: 1 } });
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
        res.status(200).json({
            status: user.status, reason: user.rejection_reason, phoneVerified: user.phoneVerified || false
        });
    } catch (err) { res.status(500).json({ message: 'خطأ في السيرفر' }); }
});

app.post('/api/student/verify-phone', authenticateToken, async (req, res) => {
    try {
        await usersCollection.updateOne({ email: req.user?.email }, { $set: { phoneVerified: true } });
        res.status(200).json({ message: 'تم توثيق الهاتف بنجاح' });
    } catch (err) { res.status(500).json({ message: 'خطأ' }); }
});

/* ==========================================================
   20) Health + misc
   ========================================================== */
app.get('/api/health', async (_req, res) => {
    try {
        await db.command({ ping: 1 });
        res.status(200).json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
    } catch (_) {
        res.status(503).json({ status: 'degraded' });
    }
});

app.get('/api/csp-nonce', (_req, res) => {
    res.status(200).json({ nonce: res.locals.cspNonce });
});

app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (_req, res) =>
    res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4'));

app.use('/api/*', (_req, res) => res.status(404).json({ message: 'المسار غير موجود (API 404).' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ==========================================================
   21) Error handler
   ========================================================== */
app.use((err, req, res, _next) => {
    req.log?.error({ err: err.message, stack: err.stack }, 'unhandled error');
    if (res.headersSent) return;
    if (err.message === 'CORS Policy Rejection') return res.status(403).json({ message: 'CORS rejected' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'الطلب كبير جداً.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON غير صالح.' });
    res.status(500).json({ message: 'خطأ داخلي.' });
});

/* ==========================================================
   22) Cron jobs
   ========================================================== */
const cleanupR2Multipart = async () => {
    try {
        const data = await r2Client.send(new ListMultipartUploadsCommand({ Bucket: R2_BUCKET_NAME }));
        if (!data.Uploads?.length) return;
        const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
        for (const u of data.Uploads) {
            if (u.Initiated < oneDayAgo) {
                try {
                    await r2Client.send(new AbortMultipartUploadCommand({
                        Bucket: R2_BUCKET_NAME, Key: u.Key, UploadId: u.UploadId
                    }));
                    logger.info({ key: u.Key }, 'aborted stale multipart upload');
                } catch (e) { logger.warn({ err: e.message }, 'abort multipart failed'); }
            }
        }
    } catch (err) { logger.warn({ err: err.message }, 'r2 cleanup failed'); }
};

const cleanupStaleStreams = async () => {
    if (!db) return;
    try {
        const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000);
        await db.collection('curriculum_content').updateMany(
            { 'liveStream.isLive': true, 'liveStream.startedAt': { $lt: fourHoursAgo } },
            { $unset: { liveStream: '' } }
        );
    } catch (err) { logger.warn({ err: err.message }, 'live stream cleanup failed'); }
};

const cleanupExpiredSessions = async () => {
    if (!sessionsCollection) return;
    try {
        await sessionsCollection.deleteMany({ expiresAt: { $lt: new Date() } });
    } catch (err) { logger.warn({ err: err.message }, 'sessions cleanup failed'); }
};

setInterval(cleanupR2Multipart, 24 * 3600 * 1000).unref();
setInterval(cleanupStaleStreams, 3600 * 1000).unref();
setInterval(cleanupExpiredSessions, 6 * 3600 * 1000).unref();

/* ==========================================================
   23) Boot + graceful shutdown
   ========================================================== */
async function startServer() {
    await connectMongo();
    server = app.listen(PORT, () => logger.info(`السيرفر شغّال على بورت ${PORT}`));

    server.headersTimeout = 65 * 1000;
    server.requestTimeout = 5 * 60 * 1000;
    server.keepAliveTimeout = 60 * 1000;
    server.timeout = 0;
}

const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down...');
    if (server) {
        server.close(async () => {
            try { if (mongoClient) await mongoClient.close(); } catch (_) {}
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 30000).unref();
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error({ reason: reason?.message || reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaughtException');
    setTimeout(() => process.exit(1), 1000).unref();
});

startServer().catch((err) => {
    logger.fatal({ err: err.message }, 'failed to start server');
    process.exit(1);
});
