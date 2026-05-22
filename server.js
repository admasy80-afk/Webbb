require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
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
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { pid: process.pid, host: os.hostname() }
});

if (!process.env.JWT_SECRET) {
    logger.fatal("FATAL ERROR: JWT_SECRET environment variable is missing.");
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';

let fileTypeStream;
(async () => {
    try {
        const fileTypeModule = await import('file-type');
        fileTypeStream = fileTypeModule.fileTypeStream;
    } catch (err) {
        logger.warn("Failed to load file-type module.");
    }
})();

const {
    S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand, PutObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let server;

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

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj instanceof Object) {
            for (let key in obj) {
                if (/^\$/.test(key)) {
                    logger.warn({ key, path: req.path, ip: req.ip }, "🚨 تم رصد ومسح كود مشبوه");
                    delete obj[key];
                } else if (typeof obj[key] === 'object') {
                    sanitize(obj[key]);
                }
            }
        }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
});

app.use(hpp());

app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

const courseSchema = z.object({
    courseName: z.string().min(2).max(100),
    grade: z.string().min(2).max(50),
    description: z.string().optional()
});

const gradeSchema = z.object({
    grade: z.string().min(2).max(50)
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => `${req.ip}-${req.body?.identifier || 'unknown'}`, message: { message: "محاولات كثيرة جداً." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { message: "تجاوزت الحد المسموح من الطلبات." } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح للرفع." } });
const publicQuizLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح." } });

app.use('/api/', (req, res, next) => {
    const skipLimits = ['/saveUser', '/admin/upload-course', '/public/quiz'];
    if (skipLimits.includes(req.path.replace('/api', ''))) return next();
    apiLimiter(req, res, next);
});

const MONGO_URL = process.env.MONGO_URL;
let db;
let usersCollection;
let mongoClient;

async function connectMongo() {
    try {
        if (!MONGO_URL) { logger.fatal("متغير MONGO_URL غير موجود!"); process.exit(1); }
        mongoClient = new MongoClient(MONGO_URL, { maxPoolSize: 20, minPoolSize: 5, maxIdleTimeMS: 30000, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000, retryWrites: true });
        await mongoClient.connect();
        db = mongoClient.db('dahih_db');
        usersCollection = db.collection('users');
        await usersCollection.createIndex({ email: 1 }, { unique: true, background: true });
        await usersCollection.createIndex({ phone: 1 }, { unique: true, background: true });
        await db.collection('courses').createIndex({ grade: 1 }, { background: true });
        await db.collection('courses').createIndex({ telegramMsgId: 1 }, { background: true });
        await db.collection('curriculum_content').createIndex({ grade: 1 }, { background: true });
        logger.info("🔥 قاعدة البيانات والـ Indexes جاهزة للعمل");
    } catch (error) { logger.fatal({ err: error }, "فشل الاتصال بمونجو"); process.exit(1); }
}

// ⚡ HTTPS Agent خارق مع Keep-Alive لتسريع الاتصالات وتقليل Handshake
const buildHttpHandler = () => new NodeHttpHandler({
    httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 100,
        maxFreeSockets: 20,
        timeout: 120000,
        scheduling: 'lifo'
    }),
    connectionTimeout: 15000,
    socketTimeout: 300000
});

const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    requestHandler: buildHttpHandler(),
    maxAttempts: 5
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'eld7e7';

// 🩺 سجل صحة المزودين (Provider Health Tracker) - تم الإبقاء على R2 فقط
const providerHealth = {
    R2: { failures: 0, lastFailure: 0, lastSuccess: Date.now(), totalUploads: 0, totalBytes: 0 }
};

const markProviderFailure = (name) => {
    if (!providerHealth[name]) return;
    providerHealth[name].failures += 1;
    providerHealth[name].lastFailure = Date.now();
};
const markProviderSuccess = (name, bytes) => {
    if (!providerHealth[name]) return;
    providerHealth[name].failures = 0;
    providerHealth[name].lastSuccess = Date.now();
    providerHealth[name].totalUploads += 1;
    providerHealth[name].totalBytes += bytes || 0;
};
const isProviderHealthy = (name) => {
    const h = providerHealth[name];
    if (!h) return true;
    // إذا تجاوزت الفشلات 3 خلال آخر 5 دقائق => اعتبره غير صحي مؤقتاً
    if (h.failures >= 3 && (Date.now() - h.lastFailure) < 5 * 60 * 1000) return false;
    return true;
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const generateFingerprint = (req) => crypto.createHash('sha256').update((req.headers['user-agent'] || '')).digest('hex');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const authenticateToken = (req, res, next) => {
    let token = req.query.token;

    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: "غير مصرح بالوصول.", reason: "Token missing" });
    }

    jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM], issuer: 'eld7e7-platform', audience: 'eld7e7-users', clockTolerance: 5 }, (err, decoded) => {
        if (err) return res.status(403).json({ message: "انتهت صلاحية الجلسة أو غير صالحة.", reason: err.message });
        req.user = decoded;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'dev' && req.user?.role !== 'owner') return res.status(403).json({ message: "مطلوب صلاحيات مسؤول." });
    next();
};

app.get('/api/verify-session', authenticateToken, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ message: "انتهت صلاحية الجلسة." });
        const userRole = req.user.role;
        const userEmail = req.user.email;

        if (userRole === 'dev' || userRole === 'owner') {
            return res.status(200).json({ message: "تم التحقق", redirectTo: '/admin.html', role: userRole });
        }

        const student = await usersCollection.findOne({ email: userEmail });
        if (!student) return res.status(401).json({ message: "الحساب غير موجود." });

        if (student.status === 'pending' || student.status === 'rejected') {
            return res.status(200).json({ message: "حساب غير مفعل", redirectTo: '/status.html', role: userRole });
        }

        return res.status(200).json({ message: "تم التحقق من الجلسة بنجاح.", redirectTo: '/student/', role: userRole });

    } catch (error) {
        return res.status(500).json({ message: "خطأ داخلي في السيرفر" });
    }
});

app.post('/api/saveUser', loginLimiter, async (req, res) => {
    try {
        const data = req.body;
        if (!usersCollection) return res.status(500).json({ message: "السيرفر لسه بيسخن.." });

        const { DEV_EMAIL, DEV_PASSWORD_HASH, OWNER_EMAIL, OWNER_PASSWORD_HASH } = process.env;
        const fingerprint = generateFingerprint(req);

        let isDev = false, isOwner = false;

        if (data.identifier === DEV_EMAIL && DEV_PASSWORD_HASH) isDev = await bcrypt.compare(data.password, DEV_PASSWORD_HASH);
        if (data.identifier === OWNER_EMAIL && OWNER_PASSWORD_HASH) isOwner = await bcrypt.compare(data.password, OWNER_PASSWORD_HASH);

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            const token = jwt.sign({ email: data.identifier, role: userRole, fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            return res.status(200).json({ message: `أهلاً بك يا ${roleName} 👑`, token: token, userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" } });
        }

        if (data.identifier) {
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });
            let validPassword = false;

            if (user) {
                validPassword = await bcrypt.compare(data.password, user.password);
                if (data.password === user.password) validPassword = true;
            }

            if (user && validPassword) {
                if (user.status !== 'accepted') return res.status(403).json({ message: 'الحساب قيد المراجعة أو مرفوض.' });

                const token = jwt.sign({ email: user.email, role: "student", fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
                return res.status(200).json({ message: "تم الدخول ✓", token: token, userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", email: user.email, phone: user.phone, role: "student", phoneVerified: user.phoneVerified || false } });
            }

            await delay(1500);
            return res.status(401).json({ message: "خطأ في بيانات الدخول" });
        }

        if (data.first_name) {
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = { ...data, password: hashedPassword, status: "pending", role: "student", points: 0, phoneVerified: false };

            try { await usersCollection.insertOne(newUser); } catch (err) { throw err; }

            const token = jwt.sign({ email: data.email, role: "student", fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            return res.status(200).json({ message: "تم إنشاء حساب بنجاح", token: token, userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } });
        }
        return res.status(400).json({ message: "بيانات غير مكتملة." });

    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي" }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚀🚀🚀 دالة الرفع الخارقة الجبارة المُراقبة من الذرة للمجرة 🚀🚀🚀
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/admin/upload-course', authenticateToken, requireAdmin, uploadLimiter, async (req, res) => {
    const uploadId = crypto.randomBytes(6).toString('hex');
    const startTime = Date.now();
    const log = logger.child({ uploadId, route: 'upload-course', requestId: req.requestId });

    let responded = false;
    let parallelUpload = null;
    let uploadFinalized = false;
    let bytesReceived = 0;
    let lastProgressLog = Date.now();
    let lastBytesSnapshot = 0;
    let fileStreamRef = null;
    let bbInstance = null;
    let watchdogInterval = null;
    let speedSamples = [];
    let chosenProvider = null;
    let fileKeyGlobal = null;

    // 🛡️ Safety net مضمون: يضمن أن العميل يأخذ رد مهما حصل
    const sendResponse = (status, payload) => {
        if (responded) return;
        responded = true;
        try {
            res.status(status).json(payload);
            log.info({ status, durationMs: Date.now() - startTime }, `📤 [${uploadId}] الرد أُرسل للعميل`);
        } catch (e) {
            log.error({ err: e.message }, `❌ [${uploadId}] فشل إرسال الرد للعميل`);
        }
    };

    // 🧹 منظف الموارد عند أي خطأ أو انقطاع
    const cleanup = async (reason) => {
        if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }
        if (parallelUpload && !uploadFinalized) {
            try {
                await parallelUpload.abort();
                log.warn({ reason }, `🧹 [${uploadId}] تم إجهاض الرفع المتعدد الأجزاء`);
            } catch (abortErr) {
                log.error({ err: abortErr.message }, `⚠️ [${uploadId}] فشل إجهاض الرفع`);
            }
        }
        if (chosenProvider && fileKeyGlobal && !uploadFinalized) {
            try {
                await chosenProvider.client.send(new DeleteObjectCommand({ Bucket: chosenProvider.bucket, Key: fileKeyGlobal }));
                log.warn(`🗑️ [${uploadId}] تم حذف الملف الجزئي من ${chosenProvider.name}`);
            } catch (e) { /* تجاهل */ }
        }
    };

    // 🐕 Watchdog: يراقب الـ Stream ويكتشف الجمود
    const startWatchdog = () => {
        watchdogInterval = setInterval(() => {
            const now = Date.now();
            const sinceLastProgress = now - lastProgressLog;
            const bytesSinceLast = bytesReceived - lastBytesSnapshot;
            const speedMBps = (bytesSinceLast / (1024 * 1024)) / (5); // كل 5 ثوان
            speedSamples.push(speedMBps);
            if (speedSamples.length > 12) speedSamples.shift();
            const avgSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;

            log.info({
                bytesReceived,
                humanSize: formatBytes(bytesReceived),
                speedMBps: speedMBps.toFixed(2),
                avgSpeedMBps: avgSpeed.toFixed(2),
                idleMs: sinceLastProgress,
                provider: chosenProvider?.name || 'N/A',
                uploadFinalized
            }, `💓 [${uploadId}] نبضة Watchdog`);

            lastBytesSnapshot = bytesReceived;

            // 🚨 إذا لم يصل أي byte لمدة 60 ثانية والرفع لم يكتمل => اعتبره معلق
            if (!uploadFinalized && bytesSinceLast === 0 && sinceLastProgress > 60000) {
                log.error({ idleMs: sinceLastProgress }, `🚨 [${uploadId}] تم اكتشاف جمود! الرفع معلق - سيتم إجهاضه`);
                clearInterval(watchdogInterval);
                watchdogInterval = null;
                cleanup('watchdog-timeout').finally(() => {
                    sendResponse(504, { message: "انقطع الاتصال أثناء الرفع. حاول مرة أخرى.", code: "UPLOAD_STALLED" });
                });
            }
        }, 5000);
    };

    try {
        log.info({ ip: req.ip, contentLength: req.headers['content-length'], userAgent: req.headers['user-agent']?.substring(0, 60) }, `🎬 [${uploadId}] بدأ طلب الرفع`);

        bbInstance = busboy({
            headers: req.headers,
            limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1, fields: 10 },
            highWaterMark: 2 * 1024 * 1024 // 2MB buffer للأداء العالي
        });

        let courseData = {};
        let fieldsReceived = false;

        bbInstance.on('field', (name, val) => {
            courseData[name] = val;
            if (courseData.courseName && courseData.grade) fieldsReceived = true;
            log.debug({ field: name, valueLength: val?.length }, `📝 [${uploadId}] حقل مُستلم`);
        });

        bbInstance.on('file', async (name, file, info) => {
            fileStreamRef = file;
            log.info({ filename: info.filename, mimeType: info.mimeType, encoding: info.encoding }, `📁 [${uploadId}] بدء استقبال الملف`);

            if (!fieldsReceived) {
                file.resume();
                log.warn(`⚠️ [${uploadId}] الملف وصل قبل بيانات الدورة`);
                return sendResponse(400, { message: "يجب إرسال بيانات الدورة قبل ملف الفيديو." });
            }

            if (responded) return file.resume();

            const parseResult = courseSchema.safeParse(courseData);
            if (!parseResult.success) {
                file.resume();
                log.warn({ errors: parseResult.error.issues }, `⚠️ [${uploadId}] بيانات الدورة غير صالحة`);
                return sendResponse(400, { message: "بيانات الدورة غير صالحة.", details: parseResult.error.issues });
            }

            const mimeType = info.mimeType || 'video/mp4';
            const extMap = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/x-matroska': 'mkv', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi' };
            const ext = extMap[mimeType] || 'mp4';
            const fileKey = `videos/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${crypto.randomUUID()}.${ext}`;
            fileKeyGlobal = fileKey;

            // 🎯 تم تعيين المزود بشكل ثابت ليكون R2 فقط
            chosenProvider = { name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME };

            log.info({
                provider: chosenProvider.name,
                bucket: chosenProvider.bucket,
                fileKey,
                ext,
                mimeType
            }, `🎯 [${uploadId}] تم اختيار المزود السحابي`);

            // 📊 تتبع حجم البيانات
            file.on('data', (chunk) => {
                bytesReceived += chunk.length;
                lastProgressLog = Date.now();
            });

            file.on('limit', () => {
                log.error(`🚫 [${uploadId}] تم تجاوز حد حجم الملف!`);
                sendResponse(413, { message: "حجم الملف يتجاوز الحد المسموح (2GB).", code: "FILE_TOO_LARGE" });
            });

            file.on('error', (err) => {
                log.error({ err: err.message }, `❌ [${uploadId}] خطأ في Stream الملف`);
                cleanup('file-stream-error').finally(() => {
                    sendResponse(500, { message: "خطأ في قراءة الملف من العميل.", code: "FILE_STREAM_ERROR" });
                });
            });

            startWatchdog();

            try {
                parallelUpload = new Upload({
                    client: chosenProvider.client,
                    params: {
                        Bucket: chosenProvider.bucket,
                        Key: fileKey,
                        Body: file,
                        ContentType: mimeType,
                        Metadata: {
                            'upload-id': uploadId,
                            'course-name': encodeURIComponent(courseData.courseName).substring(0, 200),
                            'grade': encodeURIComponent(courseData.grade).substring(0, 100),
                            'uploaded-by': encodeURIComponent(req.user?.email || 'unknown').substring(0, 200),
                            'uploaded-at': new Date().toISOString()
                        }
                    },
                    queueSize: 6,               // 6 أجزاء بالتوازي = سرعة قصوى
                    partSize: 10 * 1024 * 1024, // 10MB لكل جزء = أقل عدد طلبات
                    leavePartsOnError: false
                });

                // 📈 تتبع تقدم الرفع للسحابة
                let lastPartLogged = 0;
                parallelUpload.on('httpUploadProgress', (progress) => {
                    if (progress.part && progress.part !== lastPartLogged) {
                        lastPartLogged = progress.part;
                        log.info({
                            part: progress.part,
                            loaded: progress.loaded,
                            total: progress.total,
                            humanLoaded: formatBytes(progress.loaded),
                            percentage: progress.total ? ((progress.loaded / progress.total) * 100).toFixed(1) : 'N/A'
                        }, `☁️ [${uploadId}] جزء جديد رُفع للسحابة`);
                    }
                });

                log.info(`⏳ [${uploadId}] بدء الرفع المتوازي للسحابة...`);
                const uploadResult = await parallelUpload.done();
                uploadFinalized = true;

                const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
                const avgSpeedMBs = (bytesReceived / (1024 * 1024) / parseFloat(durationSec)).toFixed(2);

                log.info({
                    location: uploadResult.Location,
                    etag: uploadResult.ETag,
                    bytesReceived,
                    humanSize: formatBytes(bytesReceived),
                    durationSec,
                    avgSpeedMBs,
                    provider: chosenProvider.name
                }, `✅ [${uploadId}] اكتمل الرفع السحابي بنجاح!`);

                markProviderSuccess(chosenProvider.name, bytesReceived);
                if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }

                // =========================================================================
                // 🪄 عملية استخراج الميتاداتا (الغلاف والمدة) آلياً عبر رابط مؤقت و ffmpeg
                // =========================================================================
                let finalDuration = courseData.duration || 'غير محدد';
                let finalImageUrl = courseData.imageUrl || '';

                try {
                    log.info(`[${uploadId}] بدء استخراج الغلاف والمدة من الفيديو...`);
                    const getCmd = new GetObjectCommand({ Bucket: chosenProvider.bucket, Key: fileKey });
                    const signedUrl = await getSignedUrl(chosenProvider.client, getCmd, { expiresIn: 3600 });

                    // استخراج المدة
                    finalDuration = await new Promise((resolve) => {
                        ffmpeg.ffprobe(signedUrl, (err, metadata) => {
                            if (err || !metadata || !metadata.format) return resolve('غير محدد');
                            const d = metadata.format.duration;
                            const mins = Math.floor(d / 60);
                            const secs = Math.floor(d % 60);
                            resolve(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
                        });
                    });

                    // استخراج صورة الغلاف
                    const thumbFilename = `thumb_${crypto.randomUUID()}.jpg`;
                    const thumbPath = path.join(os.tmpdir(), thumbFilename);

                    await new Promise((resolve) => {
                        ffmpeg(signedUrl)
                            .screenshots({
                                timestamps: ['00:00:03.000'],
                                filename: thumbFilename,
                                folder: os.tmpdir(),
                                size: '1280x720'
                            })
                            .on('end', resolve)
                            .on('error', (err) => {
                                log.warn({ err: err.message }, `⚠️ [${uploadId}] فشل استخراج الغلاف`);
                                resolve();
                            });
                    });

                    // رفع الغلاف لنفس المزود السحابي الذي تم رفع الفيديو عليه
                    if (fs.existsSync(thumbPath)) {
                        const thumbKey = `thumbnails/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${thumbFilename}`;
                        await chosenProvider.client.send(new PutObjectCommand({
                            Bucket: chosenProvider.bucket,
                            Key: thumbKey,
                            Body: fs.createReadStream(thumbPath),
                            ContentType: 'image/jpeg'
                        }));
                        finalImageUrl = thumbKey; // تحديث المسار
                        fs.unlinkSync(thumbPath); // مسح الصورة المؤقتة من السيرفر
                        log.info(`✅ [${uploadId}] تم استخراج ورفع الغلاف بنجاح`);
                    }

                } catch (metaErr) {
                    log.warn({ err: metaErr.message }, `⚠️ [${uploadId}] فشل سحب الميتاداتا، جاري إكمال حفظ الدورة`);
                }

                // 💾 حفظ في قاعدة البيانات
                try {
                    const insertResult = await db.collection('courses').insertOne({
                        courseName: courseData.courseName,
                        grade: courseData.grade,
                        description: courseData.description || "",
                        duration: finalDuration,
                        image: finalImageUrl,
                        telegramMsgId: crypto.randomUUID(),
                        fileKey: fileKey,
                        provider: chosenProvider.name,
                        bucket: chosenProvider.bucket,
                        fileSize: bytesReceived,
                        mimeType: mimeType,
                        uploadDurationSec: parseFloat(durationSec),
                        uploadedBy: req.user?.email || 'unknown',
                        etag: uploadResult.ETag,
                        createdAt: new Date()
                    });

                    log.info({ courseId: insertResult.insertedId.toString() }, `💾 [${uploadId}] تم حفظ الكورس في قاعدة البيانات`);

                    return sendResponse(200, {
                        message: "تم الرفع السحابي بنجاح. 🎉",
                        courseId: insertResult.insertedId.toString(),
                        uploadId,
                        provider: chosenProvider.name,
                        duration: finalDuration,
                        image: finalImageUrl,
                        fileSize: bytesReceived,
                        humanSize: formatBytes(bytesReceived),
                        durationSec: parseFloat(durationSec),
                        avgSpeedMBs: parseFloat(avgSpeedMBs)
                    });

                } catch (dbError) {
                    log.error({ err: dbError.message, provider: chosenProvider.name }, `❌ [${uploadId}] فشلت إضافة الكورس لقاعدة البيانات`);
                    try {
                        await chosenProvider.client.send(new DeleteObjectCommand({ Bucket: chosenProvider.bucket, Key: fileKey }));
                        log.warn(`🗑️ [${uploadId}] تم حذف الملف من ${chosenProvider.name} بعد فشل DB`);
                    } catch (cleanupError) {
                        log.error({ err: cleanupError.message }, `⚠️ [${uploadId}] فشل تنظيف الملف بعد فشل DB`);
                    }
                    return sendResponse(500, { message: "تم رفع الفيديو لكن فشل حفظ بيانات الدورة.", code: "DB_ERROR" });
                }

            } catch (err) {
                if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }
                markProviderFailure(chosenProvider.name);

                log.error({
                    err: err.message,
                    errName: err.name,
                    errCode: err.Code || err.code,
                    provider: chosenProvider.name,
                    bytesReceived,
                    humanSize: formatBytes(bytesReceived)
                }, `🚨 [${uploadId}] فشل الرفع السحابي على ${chosenProvider.name}`);

                await cleanup(`upload-error-${err.name}`);
                return sendResponse(500, {
                    message: `فشل الرفع السحابي على منصة ${chosenProvider.name}`,
                    code: "UPLOAD_FAILED",
                    provider: chosenProvider.name,
                    reason: err.name || 'Unknown'
                });
            }
        });

        bbInstance.on('finish', () => {
            log.info({ bytesReceived, humanSize: formatBytes(bytesReceived) }, `🏁 [${uploadId}] Busboy انتهى من معالجة الطلب`);
        });

        bbInstance.on('error', (err) => {
            log.error({ err: err.message }, `❌ [${uploadId}] خطأ في Busboy`);
            cleanup('busboy-error').finally(() => {
                sendResponse(500, { message: "خطأ في معالجة الملف المرفوع.", code: "BUSBOY_ERROR" });
            });
        });

        // 🔌 معالجة انقطاع الاتصال من العميل
        req.on('close', () => {
            if (!req.complete) {
                log.warn({ bytesReceived, humanSize: formatBytes(bytesReceived) }, `🔌 [${uploadId}] العميل قطع الاتصال قبل الاكتمال`);
                cleanup('client-disconnect').finally(() => {
                    sendResponse(499, { message: "تم قطع الاتصال من العميل.", code: "CLIENT_DISCONNECT" });
                });
            }
        });

        req.on('aborted', () => {
            log.warn(`⛔ [${uploadId}] الطلب أُلغي من العميل`);
            cleanup('request-aborted').finally(() => {
                sendResponse(499, { message: "تم إلغاء الطلب.", code: "REQUEST_ABORTED" });
            });
        });

        req.on('error', (err) => {
            log.error({ err: err.message }, `❌ [${uploadId}] خطأ في طلب HTTP`);
            cleanup('request-error').finally(() => {
                sendResponse(500, { message: "خطأ في طلب الرفع.", code: "REQUEST_ERROR" });
            });
        });

        // ⏰ Hard Timeout: 30 دقيقة كحد أقصى لأي رفع
        const hardTimeout = setTimeout(() => {
            if (!responded) {
                log.error(`⏰ [${uploadId}] انتهت المهلة الزمنية القصوى (30 دقيقة)`);
                cleanup('hard-timeout').finally(() => {
                    sendResponse(504, { message: "انتهت المهلة الزمنية القصوى للرفع.", code: "HARD_TIMEOUT" });
                });
            }
        }, 30 * 60 * 1000);

        res.on('finish', () => clearTimeout(hardTimeout));
        res.on('close', () => clearTimeout(hardTimeout));

        req.pipe(bbInstance);

    } catch (error) {
        log.error({ err: error.message, stack: error.stack }, `💥 [${uploadId}] خطأ غير متوقع في معالج الرفع`);
        await cleanup('unexpected-error');
        sendResponse(500, { message: "خطأ غير متوقع في السيرفر.", code: "UNEXPECTED_ERROR" });
    }
});

app.get('/api/video/stream/:msgId', authenticateToken, async (req, res) => {
    let streamTimeout;
    try {
        const msgId = req.params.msgId;
        let range = req.headers.range;

        if (range && !/^bytes=\d+-\d*$/.test(range)) return res.status(416).send("نطاق البث غير صالح.");

        const queryId = /^\d+$/.test(msgId) ? parseInt(msgId, 10) : msgId;
        const course = await db.collection('courses').findOne({ telegramMsgId: queryId });
        if (!course || !course.fileKey) return res.status(404).send("الفيديو مفقود.");

        // تم تعيين المزود بشكل ثابت ليكون R2 فقط
        let targetClient = r2Client;
        let targetBucket = R2_BUCKET_NAME;

        const headCommand = new HeadObjectCommand({ Bucket: targetBucket, Key: course.fileKey });
        const headResponse = await targetClient.send(headCommand);
        const fileSize = headResponse.ContentLength;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            if (start >= fileSize || end >= fileSize || start > end) return res.status(416).send("النطاق المطلوب خارج حدود الملف.");
        }

        const abortController = new AbortController();
        streamTimeout = setTimeout(() => abortController.abort(), 15000);

        const command = new GetObjectCommand({ Bucket: targetBucket, Key: course.fileKey, Range: range });
        const s3Response = await targetClient.send(command, { abortSignal: abortController.signal });
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
        pipeline(s3Response.Body, res, (err) => { });

    } catch (error) {
        if (streamTimeout) clearTimeout(streamTimeout);
        if (!res.headersSent) res.status(error.name === 'AbortError' ? 504 : 500).send("تعذر تحميل الفيديو.");
    }
});

app.get('/api/admin/get-all-courses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const courses = await db.collection('courses').find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
        const formattedCourses = courses.map(c => ({ id: c._id.toString(), courseName: c.courseName, grade: c.grade, description: c.description, telegramMsgId: c.telegramMsgId }));
        res.status(200).json({ courses: formattedCourses });
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر" }); }
});

app.delete('/api/admin/delete-course/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        const course = await db.collection('courses').findOne({ _id: new ObjectId(courseId) });
        if (course && course.fileKey) {
            // تم تعيين المزود بشكل ثابت ليكون R2 فقط
            let targetClient = r2Client;
            let targetBucket = R2_BUCKET_NAME;

            try { await targetClient.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: course.fileKey })); } catch (e) { }
            
            // تنظيف الغلاف لو موجود
            if (course.image && course.image.startsWith('thumbnails/')) {
                 try { await targetClient.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: course.image })); } catch (e) { }
            }
        }
        await db.collection('courses').deleteOne({ _id: new ObjectId(courseId) });
        res.status(200).json({ message: "تم حذف المحاضرة بنجاح" });
    } catch (error) { res.status(500).json({ message: "فشل الحذف" }); }
});

app.post('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        res.status(200).json({ studentsCount, pendingCount, questionsCount: "نشط" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// 🩺 Endpoint جديد لمراقبة صحة المزودين
app.get('/api/admin/providers-health', authenticateToken, requireAdmin, (req, res) => {
    const summary = {};
    for (const [name, h] of Object.entries(providerHealth)) {
        summary[name] = {
            failures: h.failures,
            healthy: isProviderHealthy(name),
            totalUploads: h.totalUploads,
            totalBytesUploaded: h.totalBytes,
            humanTotalBytes: formatBytes(h.totalBytes),
            lastSuccess: h.lastSuccess ? new Date(h.lastSuccess).toISOString() : null,
            lastFailure: h.lastFailure ? new Date(h.lastFailure).toISOString() : null
        };
    }
    res.status(200).json({ providers: summary, serverUptimeSec: Math.floor(process.uptime()), memoryMB: (process.memoryUsage().rss / 1024 / 1024).toFixed(2) });
});

app.post('/api/admin/pending', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, newStatus, reason } = req.body;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { status: newStatus, rejection_reason: reason || "" } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/students-by-grade', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body;
        const students = await usersCollection.find({ status: "accepted", role: "student", grade: grade }).toArray();
        res.status(200).json(students);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, type, pointText, questionText, questionHint } = req.body;
        const contentCollection = db.collection('curriculum_content');
        if (type === 'point') await contentCollection.updateOne({ grade: grade }, { $push: { points: pointText } }, { upsert: true });
        else await contentCollection.updateOne({ grade: grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-points', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, points } = req.body;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { points: parseInt(points) } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/toggle-stream', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isLive } = req.body;
        const contentCollection = db.collection('curriculum_content');
        if (isLive) {
            await contentCollection.updateMany({}, { $set: { "liveStream": { isLive: true, startedAt: new Date() } } }, { upsert: true });
            res.status(200).json({ message: "تم إطلاق البث بنجاح" });
        } else {
            await contentCollection.updateMany({}, { $unset: { "liveStream": "" } });
            res.status(200).json({ message: "تم إيقاف البث بنجاح" });
        }
    } catch (error) { res.status(500).json({ message: "خطأ في تحديث حالة البث" }); }
});

app.post('/api/admin/add-mcq-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'quiz_' + Date.now();
        const contentCollection = db.collection('curriculum_content');
        await contentCollection.updateOne({ grade: grade }, { $push: { quizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } }, { upsert: true });
        res.status(200).json({ message: "تمت إضافة الاختبار بنجاح", quizId: quizId });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-public-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'pub_' + Date.now();
        const contentCollection = db.collection('curriculum_content');
        await contentCollection.updateOne({ grade: grade || "عام" }, { $push: { publicQuizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } }, { upsert: true });
        res.status(200).json({ success: true, message: "تمت إضافة الاختبار العام", quizId: quizId });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/get-grade-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body;
        const contentCollection = db.collection('curriculum_content');
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [], quizzes: [], publicQuizzes: [] };
        res.status(200).json(content);
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/delete-item', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, itemType, identifier } = req.body;
        const contentCollection = db.collection('curriculum_content');
        let updateQuery = {};
        if (itemType === 'point') updateQuery = { $pull: { points: identifier } };
        else if (itemType === 'question') updateQuery = { $pull: { questions: { question: identifier } } };
        else if (itemType === 'test') updateQuery = { $pull: { tests: { testName: identifier } } };
        else if (itemType === 'quiz') updateQuery = { $pull: { quizzes: { id: identifier } } };
        else if (itemType === 'publicQuiz') updateQuery = { $pull: { publicQuizzes: { id: identifier } } };
        await contentCollection.updateOne({ grade: grade }, updateQuery);
        res.status(200).json({ message: "تم الحذف بنجاح" });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const parseResult = gradeSchema.safeParse(req.body);
        if (!parseResult.success) return res.status(400).json({ message: "البيانات المدخلة غير صحيحة." });
        const { grade } = parseResult.data;

        const user = await usersCollection.findOne({ email: req.user.email });
        const studentPoints = user?.points || 0;
        const content = await db.collection('curriculum_content').findOne({ grade }) || { points: [], questions: [], tests: [], quizzes: [] };
        const courses = await db.collection('courses').find({ grade }).sort({ createdAt: 1 }).toArray();

        res.status(200).json({ studentPoints, content, courses });
    } catch (error) { res.status(500).json({ message: "فشل جلب البيانات." }); }
});

app.get('/api/public/quiz', publicQuizLimiter, async (req, res) => {
    try {
        if (req.headers['x-public-access'] !== 'eld7e7-web-client') return res.status(403).json({ message: "وصول غير مصرح." });
        const { id, device } = req.query;
        if (typeof id !== 'string' || id.length > 50) return res.status(400).json({ message: "معرف غير صالح." });

        const doc = await db.collection('curriculum_content').findOne({ "publicQuizzes.id": id });
        if (!doc) return res.status(404).json({ message: "تعذر العثور على الاختبار." });

        const quiz = doc.publicQuizzes.find(q => q.id === id);
        if (!quiz) return res.status(404).json({ message: "الاختبار غير موجود." });

        if (device && quiz.results) {
            const alreadyTaken = quiz.results.some(r => r.visitorId === device);
            if (alreadyTaken) return res.status(403).json({ message: "كان غيرك اشطر😂😂" });
        }

        quiz.grade = doc.grade;
        res.status(200).json(quiz);
    } catch (err) { res.status(500).json({ message: "حدث خطأ داخلي." }); }
});

app.post('/api/student/submit-quiz', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        const { studentName, grade, quizId, score, percentage, visitorId, userAnswers } = req.body;
        const contentCollection = db.collection('curriculum_content');
        const resultObj = { email, studentName, score, percentage, visitorId: visitorId || null, userAnswers: userAnswers || [], date: new Date() };

        if (quizId && quizId.startsWith('pub_')) {
            const existingDoc = await contentCollection.findOne({ grade: grade, publicQuizzes: { $elemMatch: { id: quizId, results: { $elemMatch: { $or: [{ visitorId: visitorId }, { email: email }] } } } } });
            if (existingDoc) return res.status(403).json({ message: "عفواً، لقد قمت بتقديم هذا الاختبار مسبقاً!" });
            await contentCollection.updateOne({ grade: grade, "publicQuizzes.id": quizId }, { $push: { "publicQuizzes.$.results": resultObj } });
        } else {
            await contentCollection.updateOne({ grade: grade, "quizzes.id": quizId }, { $push: { "quizzes.$.results": resultObj } });
        }
        res.status(200).json({ message: "تم حفظ النتيجة واعتمادها بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/check-status', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        const user = await usersCollection.findOne({ email: email });
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
        res.status(200).json({ status: user.status, reason: user.rejection_reason, phoneVerified: user.phoneVerified || false });
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر" }); }
});

app.post('/api/student/verify-phone', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        await usersCollection.updateOne({ email: email }, { $set: { phoneVerified: true } });
        res.status(200).json({ message: "تم توثيق الهاتف بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (req, res) => res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4'));
app.use('/api/*', (req, res) => res.status(404).json({ message: "المسار غير موجود (API 404)." }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== Cron Jobs ====================
setInterval(async () => {
    // تم تعيين المزود بشكل ثابت ليكون R2 فقط في وظيفة الكرون
    const providers = [{ name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME }];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const provider of providers) {
        try {
            const data = await provider.client.send(new ListMultipartUploadsCommand({ Bucket: provider.bucket }));
            if (data.Uploads) {
                for (const upload of data.Uploads) {
                    if (upload.Initiated < oneDayAgo) {
                        await provider.client.send(new AbortMultipartUploadCommand({ Bucket: provider.bucket, Key: upload.Key, UploadId: upload.UploadId }));
                        logger.info({ provider: provider.name, key: upload.Key }, `🧹 تم تنظيف رفع متعدد الأجزاء قديم`);
                    }
                }
            }
        } catch (err) { }
    }
}, 24 * 60 * 60 * 1000);

setInterval(async () => {
    if (!db) return;
    try {
        const contentCollection = db.collection('curriculum_content');
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        await contentCollection.updateMany({ "liveStream.isLive": true, "liveStream.startedAt": { $lt: fourHoursAgo } }, { $unset: { "liveStream": "" } });
    } catch (e) { }
}, 60 * 60 * 1000);

async function startServer() {
    await connectMongo();
    server = app.listen(PORT, () => logger.info(`🚀 السيرفر شغال ومستعد لخدمة الطلبة على بورت ${PORT}`));
    // ⚙️ Timeouts مُحسّنة لدعم الرفع الكبير (2GB)
    server.headersTimeout = 65000;
    server.requestTimeout = 0;           // بدون حد لطلبات الرفع الطويلة
    server.keepAliveTimeout = 60000;
    server.timeout = 30 * 60 * 1000;     // 30 دقيقة كحد أقصى للسوكت
}
startServer();
process.on('unhandledRejection', (err) => { logger.error({ err: err?.message }, 'unhandledRejection'); });
process.on('uncaughtException', (err) => { logger.error({ err: err?.message }, 'uncaughtException'); });
process.on('SIGINT', async () => { if (server) { server.close(async () => { try { if (mongoClient) await mongoClient.close(); } catch (e) { } process.exit(0); }); } else { process.exit(0); } });
