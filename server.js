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

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime
});

if (!process.env.JWT_SECRET) {
    logger.fatal("FATAL ERROR: JWT_SECRET environment variable is missing.");
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';

// الاستيراد الديناميكي لـ file-type لدعم الـ Streams وفحص الـ Magic Numbers
let fileTypeStream;
(async () => {
    try {
        const fileTypeModule = await import('file-type');
        fileTypeStream = fileTypeModule.fileTypeStream;
    } catch (err) {
        logger.warn("Failed to load file-type module. Stream magic number validation may be degraded.");
    }
})();

// دوال الـ AWS SDK المطلوبة (بما فيها تنظيف الـ Multipart والـ HeadObject)
const { 
    S3Client, 
    GetObjectCommand, 
    DeleteObjectCommand,
    HeadObjectCommand,
    ListMultipartUploadsCommand,
    AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const app = express();
const PORT = process.env.PORT || 3000;
let server; 

app.set('trust proxy', 1);
app.disable('x-powered-by');

// CSP متوازن (يسمح بالـ inline مؤقتاً لتجنب كسر الفرونت إند، الأفضل مستقبلاً استخدام Nonce)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], 
            styleSrc: ["'self'", "'unsafe-inline'"], 
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "blob:", "https:"], 
            connectSrc: ["'self'", "https:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    dnsPrefetchControl: { allow: false }, // إغلاق ثغرة الـ DNS Prefetching
    frameguard: { action: 'deny' },       // منع Clickjacking
    noSniff: true                         // تفعيل X-Content-Type-Options
}));

const allowedOrigins = process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
app.use(cors({
    origin: function(origin, callback){
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            return callback(new Error('CORS Policy Rejection'), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// حارس يدوي صارم لمنع NoSQL Injection (أقوى وأسرع من express-mongo-sanitize)
app.use((req, res, next) => {
    const hasDollarKey = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        for (let key in obj) {
            if (key.startsWith('$')) return true;
            if (typeof obj[key] === 'object' && hasDollarKey(obj[key])) return true;
        }
        return false;
    };
    if (hasDollarKey(req.body) || hasDollarKey(req.query)) {
        logger.warn({ ip: req.ip, path: req.path }, "Illegal NoSQL operator injection attempt blocked.");
        return res.status(400).json({ message: "Request contains illegal characters." });
    }
    next();
});

app.use(hpp());

app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    next();
});

// ==================== Zod Schemas ====================
const loginSchema = z.object({
    identifier: z.string().min(3).max(100),
    password: z.string().min(6).max(100)
});

const registerSchema = z.object({
    first_name: z.string().min(2).max(50),
    email: z.string().email(),
    phone: z.string().min(8).max(20),
    password: z.string().min(6).max(100),
    grade: z.string().min(2).max(50)
});

const gradeSchema = z.object({
    grade: z.string().min(2).max(50)
});

const courseSchema = z.object({
    courseName: z.string().min(2).max(100),
    grade: z.string().min(2).max(50),
    description: z.string().optional()
});

// ==================== Rate Limiters ====================
const loginLimiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 20, 
    // ربط الـ IP بالـ Identifier لمنع الهجمات الموزعة أو التبديل العشوائي للإيميلات
    keyGenerator: (req) => `${req.ip}-${req.body?.identifier || 'unknown'}`, 
    message: { message: "محاولات كثيرة جداً، يرجى المحاولة لاحقاً." } 
});
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyGenerator: (req) => req.ip, message: { message: "محاولات تسجيل كثيرة جداً." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { message: "تجاوزت الحد المسموح من الطلبات." } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح للرفع خلال ساعة." } });
const publicQuizLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح لجلب الاختبارات العامة." } });

app.use('/api/', (req, res, next) => {
    const skipLimits = ['/auth/login', '/auth/register', '/admin/upload-course', '/public/quiz'];
    if (skipLimits.includes(req.path.replace('/api', ''))) return next();
    apiLimiter(req, res, next);
});

// ==================== MongoDB Configuration ====================
const MONGO_URL = process.env.MONGO_URL;
let db;
let usersCollection;
let mongoClient;

async function connectMongo() {
    try {
        if (!MONGO_URL) {
            logger.fatal("متغير MONGO_URL غير موجود!");
            process.exit(1);
        }

        mongoClient = new MongoClient(MONGO_URL, {
            maxPoolSize: 20, minPoolSize: 5, maxIdleTimeMS: 30000, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000, retryWrites: true
        });

        await mongoClient.connect();
        db = mongoClient.db('dahih_db');
        usersCollection = db.collection('users');

        await usersCollection.createIndex({ email: 1 }, { unique: true, background: true });
        await usersCollection.createIndex({ phone: 1 }, { unique: true, background: true });
        await db.collection('courses').createIndex({ grade: 1 }, { background: true });
        await db.collection('courses').createIndex({ telegramMsgId: 1 }, { background: true });
        await db.collection('curriculum_content').createIndex({ grade: 1 }, { background: true });

        logger.info("🔥 قاعدة البيانات والـ Indexes جاهزة للعمل");
    } catch (error) {
        logger.fatal({ err: error }, "فشل الاتصال بمونجو");
        process.exit(1);
    }
}

// ==================== Cloud Storage ====================
const r2Client = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }});
const b2Client = new S3Client({ region: process.env.B2_REGION || 'us-east-005', endpoint: process.env.B2_ENDPOINT, credentials: { accessKeyId: process.env.B2_ACCESS_KEY_ID, secretAccessKey: process.env.B2_SECRET_ACCESS_KEY }});
const idriveClient = new S3Client({ region: process.env.IDRIVE_REGION || 'eu-west-4', endpoint: process.env.IDRIVE_ENDPOINT, credentials: { accessKeyId: process.env.IDRIVE_ACCESS_KEY_ID, secretAccessKey: process.env.IDRIVE_SECRET_ACCESS_KEY }});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'eld7e7';
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'eld7e7-courses';
const IDRIVE_BUCKET_NAME = process.env.IDRIVE_BUCKET_NAME || 'eld7e7';

// ==================== Helper Functions ====================
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const generateFingerprint = (req) => {
    return crypto.createHash('sha256')
        .update((req.headers['user-agent'] || '') + (req.headers['accept-language'] || ''))
        .digest('hex');
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== Middlewares ====================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "غير مصرح بالوصول." });
    
    jwt.verify(token, JWT_SECRET, { 
        algorithms: [JWT_ALGORITHM], 
        issuer: 'eld7e7-platform', 
        audience: 'eld7e7-users',
        clockTolerance: 5 
    }, (err, decoded) => {
        if (err) return res.status(403).json({ message: "انتهت صلاحية الجلسة أو غير صالحة." });
        
        const currentFingerprint = generateFingerprint(req);
        if (decoded.fingerprint && decoded.fingerprint !== currentFingerprint) {
            logger.warn({ reqId: req.requestId, email: decoded.email }, "محاولة وصول غير معتادة ببصمة مختلفة.");
            return res.status(403).json({ message: "تم اكتشاف محاولة وصول غير معتادة." });
        }
        req.user = decoded;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'dev' && req.user?.role !== 'owner') return res.status(403).json({ message: "مطلوب صلاحيات مسؤول." });
    next();
};

// ==================== Routes ====================

app.get('/api/verify-session', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ message: "انتهت صلاحية الجلسة." });
    const userRole = req.user.role;
    res.status(200).json({ message: "تم التحقق من الجلسة بنجاح.", redirectTo: (userRole === 'dev' || userRole === 'owner') ? '/admin-dashboard.html' : '/student-dashboard.html', role: userRole });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const parseResult = loginSchema.safeParse(req.body);
        if (!parseResult.success) {
            await delay(1000); 
            return res.status(400).json({ message: "بيانات الإدخال غير صالحة." });
        }
        const data = parseResult.data;
        
        const { DEV_EMAIL, DEV_PASSWORD_HASH, OWNER_EMAIL, OWNER_PASSWORD_HASH } = process.env;
        let isDev = false, isOwner = false;

        if (data.identifier === DEV_EMAIL && DEV_PASSWORD_HASH) isDev = await bcrypt.compare(data.password, DEV_PASSWORD_HASH);
        if (data.identifier === OWNER_EMAIL && OWNER_PASSWORD_HASH) isOwner = await bcrypt.compare(data.password, OWNER_PASSWORD_HASH);
        
        const fingerprint = generateFingerprint(req);

        if (isDev || isOwner) {  
            const userRole = isDev ? "dev" : "owner";  
            const token = jwt.sign({ email: data.identifier, role: userRole, fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '7d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            logger.info({ reqId: req.requestId, role: userRole }, "Admin login successful.");
            return res.status(200).json({ message: "تم تسجيل الدخول.", token, userData: { role: userRole } });  
        }  

        const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });  
        
        let validPassword = false;
        if (user) {
            validPassword = await bcrypt.compare(data.password, user.password);
        }

        if (user && validPassword && user.status === 'accepted') {
            const token = jwt.sign({ email: user.email, role: "student", fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '7d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            return res.status(200).json({ message: "تم تسجيل الدخول.", token, userData: { name: user.first_name, role: "student" } });  
        } 
        
        await delay(1500); 
        return res.status(401).json({ message: "بيانات تسجيل الدخول غير صحيحة." });  
    } catch (error) { 
        logger.error({ err: error, reqId: req.requestId }, "Login error");
        res.status(500).json({ message: "حدث خطأ داخلي." }); 
    }
});

app.post('/api/auth/register', registerLimiter, async (req, res) => {
    try {
        const parseResult = registerSchema.safeParse(req.body);
        if (!parseResult.success) return res.status(400).json({ message: "البيانات غير مطابقة للمواصفات." });
        const data = parseResult.data;

        const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
        if (existing) return res.status(400).json({ message: "البريد أو الهاتف مستخدم بالفعل." });

        const hashedPassword = await bcrypt.hash(data.password, 10);
        const newUser = { ...data, password: hashedPassword, status: "pending", role: "student", points: 0, phoneVerified: false };
        
        try {
            await usersCollection.insertOne(newUser);
        } catch (err) {
            if (err.code === 11000) return res.status(400).json({ message: "البريد أو الهاتف مستخدم بالفعل." });
            throw err;
        }
        
        return res.status(200).json({ message: "تم إنشاء الحساب، بانتظار موافقة الإدارة." });  
    } catch (error) { 
        logger.error({ err: error, reqId: req.requestId }, "Registration error");
        res.status(500).json({ message: "حدث خطأ داخلي." }); 
    }
});

// الرفع الحصين مع Dynamic Extensions
app.post('/api/admin/upload-course', authenticateToken, requireAdmin, uploadLimiter, async (req, res) => {
    let responded = false;
    let parallelUpload = null;

    try {
        const bb = busboy({ 
            headers: req.headers, 
            limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1, fields: 10 } 
        });
        
        let courseData = {};
        let fieldsReceived = false;

        bb.on('field', (name, val) => { 
            courseData[name] = val; 
            if (courseData.courseName && courseData.grade) {
                fieldsReceived = true;
            }
        });

        bb.on('file', async (name, file, info) => {
            if (!fieldsReceived) {
                file.resume(); 
                if (!responded) { responded = true; return res.status(400).json({ message: "يجب إرسال بيانات الدورة قبل ملف الفيديو." }); }
                return;
            }

            if (responded) return file.resume();

            const parseResult = courseSchema.safeParse(courseData);
            if (!parseResult.success) {
                file.resume();
                if (!responded) { responded = true; return res.status(400).json({ message: "بيانات الدورة غير صالحة." }); }
                return;
            }

            let uploadStream = file;
            let mimeType = info.mimeType;

            if (fileTypeStream) {
                try {
                    const streamWithFileType = await fileTypeStream(file);
                    const type = await streamWithFileType.fileType;
                    
                    if (!type || !['video/mp4', 'video/webm', 'video/x-matroska'].includes(type.mime)) {
                        streamWithFileType.resume();
                        if (!responded) { responded = true; return res.status(400).json({ message: "صيغة الفيديو غير مدعومة أو الملف مزيف." }); }
                        return;
                    }
                    mimeType = type.mime;
                    uploadStream = streamWithFileType;
                } catch (e) {
                    file.resume();
                    if (!responded) { responded = true; return res.status(500).json({ message: "خطأ في فحص توقيع الملف." }); }
                    return;
                }
            } else if (!['video/mp4', 'video/webm', 'video/x-matroska'].includes(mimeType)) {
                file.resume();
                if (!responded) { responded = true; return res.status(400).json({ message: "صيغة غير مدعومة." }); }
                return;
            }

            // تحديد الامتداد بشكل ديناميكي لتجنب تعارض المشغلات
            const extMap = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };
            const ext = extMap[mimeType] || 'mp4';
            const fileKey = `videos/${crypto.randomUUID()}.${ext}`;

            const providers = [
                { name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME },
                { name: 'B2', client: b2Client, bucket: B2_BUCKET_NAME },
                { name: 'IDRIVE', client: idriveClient, bucket: IDRIVE_BUCKET_NAME }
            ];

            const targetProvider = shuffleArray(providers)[0];
            
            try {
                parallelUpload = new Upload({
                    client: targetProvider.client,
                    params: { Bucket: targetProvider.bucket, Key: fileKey, Body: uploadStream, ContentType: mimeType },
                    queueSize: 4, partSize: 5 * 1024 * 1024, leavePartsOnError: false 
                });

                await parallelUpload.done();
                
                try {
                    await db.collection('courses').insertOne({
                        courseName: courseData.courseName, grade: courseData.grade, description: courseData.description || "",
                        telegramMsgId: crypto.randomUUID(), fileKey: fileKey, provider: targetProvider.name, createdAt: new Date()
                    });

                    logger.info({ reqId: req.requestId, fileKey }, "Course uploaded and database updated successfully.");
                    if (!responded) { responded = true; res.status(200).json({ message: "تم الرفع السحابي بنجاح." }); }

                } catch (dbError) {
                    logger.error({ err: dbError, reqId: req.requestId }, "Database insertion failed, cleaning up orphaned cloud file...");
                    try {
                        await targetProvider.client.send(new DeleteObjectCommand({ Bucket: targetProvider.bucket, Key: fileKey }));
                    } catch (cleanupError) {
                        logger.error({ err: cleanupError, reqId: req.requestId, fileKey }, "Failed to clean up orphaned file.");
                    }
                    if (!responded) { responded = true; res.status(500).json({ message: "حدث خطأ أثناء حفظ الدورة وتم إلغاء الرفع." }); }
                }

            } catch (err) {
                logger.error({ err: err, reqId: req.requestId }, "Cloud Upload Error.");
                if (!responded) { responded = true; res.status(500).json({ message: "فشل الرفع للسحابة." }); }
            }
        });

        req.on('close', () => {
            if (!req.complete) {
                logger.warn({ reqId: req.requestId }, "Client disconnected abruptly. Aborting upload.");
                // منع تشغيل الـ abort على مسار تم إنهاؤه بنجاح
                if (parallelUpload && !responded) parallelUpload.abort();
            }
        });

        req.pipe(bb);
    } catch (error) {
        logger.error({ err: error, reqId: req.requestId }, "Unexpected upload error.");
        if (!responded) { responded = true; res.status(500).json({ message: "خطأ غير متوقع." }); }
    }
});

// بث الفيديو الموزع (فحص الـ Range عبر HeadObject + Pipeline)
app.get('/api/video/stream/:msgId', authenticateToken, async (req, res) => {
    let streamTimeout;
    try {
        const msgId = req.params.msgId;
        let range = req.headers.range;
        
        if (range && !/^bytes=\d+-\d*$/.test(range)) return res.status(416).send("نطاق البث غير صالح.");

        const queryId = isNaN(parseInt(msgId, 10)) ? msgId : parseInt(msgId, 10);
        const course = await db.collection('courses').findOne({ telegramMsgId: queryId });
        if (!course || !course.fileKey) return res.status(404).send("الفيديو مفقود.");

        let targetClient, targetBucket;
        if (course.provider === 'B2') { targetClient = b2Client; targetBucket = B2_BUCKET_NAME; } 
        else if (course.provider === 'IDRIVE') { targetClient = idriveClient; targetBucket = IDRIVE_BUCKET_NAME; } 
        else { targetClient = r2Client; targetBucket = R2_BUCKET_NAME; }

        // التحقق من صلاحية الـ Range مقابل الحجم الفعلي للملف لمنع دوس السيرفر
        const headCommand = new HeadObjectCommand({ Bucket: targetBucket, Key: course.fileKey });
        const headResponse = await targetClient.send(headCommand);
        const fileSize = headResponse.ContentLength;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize || end >= fileSize || start > end) {
                return res.status(416).send("النطاق المطلوب خارج حدود الملف.");
            }
        }

        const abortController = new AbortController();
        streamTimeout = setTimeout(() => abortController.abort(), 15000); 
        
        const command = new GetObjectCommand({ Bucket: targetBucket, Key: course.fileKey, Range: range });
        const s3Response = await targetClient.send(command, { abortSignal: abortController.signal });
        clearTimeout(streamTimeout);
        
        const headers = {
            'Accept-Ranges': 'bytes', 'Content-Length': s3Response.ContentLength, 'Content-Type': s3Response.ContentType || 'video/mp4',
            'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff'
        };
        if (s3Response.ContentRange) headers['Content-Range'] = s3Response.ContentRange;
        
        res.writeHead(range ? 206 : 200, headers);
        
        pipeline(s3Response.Body, res, (err) => {
            if (err && !res.headersSent) {
                logger.error({ err: err, reqId: req.requestId }, "Stream pipeline error");
            }
        });

    } catch (error) {
        if (streamTimeout) clearTimeout(streamTimeout);
        if (!res.headersSent) res.status(error.name === 'AbortError' ? 504 : 500).send("تعذر تحميل الفيديو من الخادم السحابي.");
    }
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
    } catch (error) { 
        logger.error({ err: error, reqId: req.requestId }, "Dashboard data fetch error");
        res.status(500).json({ message: "فشل جلب البيانات." }); 
    }
});

app.get('/api/public/quiz', publicQuizLimiter, async (req, res) => {
    try {
        if (req.headers['x-public-access'] !== 'eld7e7-web-client') return res.status(403).json({ message: "وصول غير مصرح." });
        const { id } = req.query; 
        if (typeof id !== 'string' || id.length > 50) return res.status(400).json({ message: "معرف غير صالح." });
        
        const doc = await db.collection('curriculum_content').findOne({ "publicQuizzes.id": id });
        if (!doc) return res.status(404).json({ message: "تعذر العثور على الاختبار." });
        
        const quiz = doc.publicQuizzes.find(q => q.id === id);
        if (!quiz) return res.status(404).json({ message: "الاختبار غير موجود." }); 
        
        quiz.grade = doc.grade; 
        res.status(200).json(quiz);
    } catch (err) { 
        logger.error({ err: err, reqId: req.requestId }, "Public quiz fetch error");
        res.status(500).json({ message: "حدث خطأ داخلي." }); 
    }
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ message: "المسار غير موجود (API 404)." });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== Cron Jobs (Background Tasks) ====================
// تنظيف الـ Multipart Uploads المهجورة (Orphaned) كل 24 ساعة لعدم استنزاف المساحة
setInterval(async () => {
    logger.info("Running daily cleanup for orphaned multipart uploads...");
    const providers = [
        { name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME },
        { name: 'B2', client: b2Client, bucket: B2_BUCKET_NAME },
        { name: 'IDRIVE', client: idriveClient, bucket: IDRIVE_BUCKET_NAME }
    ];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const provider of providers) {
        try {
            const data = await provider.client.send(new ListMultipartUploadsCommand({ Bucket: provider.bucket }));
            if (data.Uploads) {
                for (const upload of data.Uploads) {
                    if (upload.Initiated < oneDayAgo) {
                        await provider.client.send(new AbortMultipartUploadCommand({
                            Bucket: provider.bucket,
                            Key: upload.Key,
                            UploadId: upload.UploadId
                        }));
                        logger.info(`Aborted orphaned upload: ${upload.Key} in ${provider.name}`);
                    }
                }
            }
        } catch (err) {
            logger.error({ err: err.message, provider: provider.name }, "Failed to cleanup orphaned multipart uploads.");
        }
    }
}, 24 * 60 * 60 * 1000); // 24 Hours

// ==================== Server Boot & Graceful Shutdown ====================
async function startServer() {
    await connectMongo();
    server = app.listen(PORT, () => logger.info(`🚀 السيرفر شغال ومستعد لخدمة الطلبة على بورت ${PORT}`));
    
    server.headersTimeout = 15000;
    server.requestTimeout = 30000;
    server.keepAliveTimeout = 5000;
}

startServer();

process.on('unhandledRejection', (err) => logger.error({ err: err }, 'Unhandled Rejection'));
process.on('uncaughtException', (err) => logger.fatal({ err: err }, 'Uncaught Exception'));

process.on('SIGINT', async () => {
    logger.info('\nShutting down server safely...');
    if (server) {
        server.close(async () => {
            logger.info('HTTP connections closed.');
            try { if (mongoClient) await mongoClient.close(); } catch (e) {}
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
