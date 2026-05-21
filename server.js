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

let fileTypeStream;
(async () => {
    try {
        const fileTypeModule = await import('file-type');
        fileTypeStream = fileTypeModule.fileTypeStream;
    } catch (err) {
        logger.warn("Failed to load file-type module.");
    }
})();

// الاعتماد على Cloudflare R2 فقط حسب طلبك
const { 
    S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

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
    next();
});

// تحديث الـ Schema لتشمل المدة والصورة
const courseSchema = z.object({
    courseName: z.string().min(2).max(100),
    grade: z.string().min(2).max(50),
    description: z.string().optional(),
    duration: z.string().optional(), // مدة الكورس (مثال: 45 دقيقة)
    imageUrl: z.string().optional()  // رابط صورة الكورس
});

const gradeSchema = z.object({
    grade: z.string().min(2).max(50)
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => `${req.ip}-${req.body?.identifier || 'unknown'}`, message: { message: "محاولات كثيرة جداً." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { message: "تجاوزت الحد المسموح من الطلبات." } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح للرفع." } });
const publicQuizLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح." } });

app.use('/api/', (req, res, next) => {
    const skipLimits = ['/saveUser', '/admin/upload-course', '/public/quiz', '/student/save-progress'];
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

// تعريف كلاود فلير (R2) فقط وإزالة الباقي
const r2Client = new S3Client({ 
    region: 'auto', 
    endpoint: process.env.R2_ENDPOINT, 
    credentials: { 
        accessKeyId: process.env.R2_ACCESS_KEY_ID, 
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY 
    }
});
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'eld7e7';

const generateFingerprint = (req) => crypto.createHash('sha256').update((req.headers['user-agent'] || '')).digest('hex');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// دالة مساعدة لتحويل الثواني إلى صيغة مفهومة لـ "آخر مشاهدة"
function formatProgressTime(t) {
    if (!isFinite(t) || t <= 0) return null;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

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
            // إضافة مصفوفة/أوبجكت progress لحفظ تقدم الطالب في الكورسات
            const newUser = { ...data, password: hashedPassword, status: "pending", role: "student", points: 0, phoneVerified: false, progress: {} };
            
            try { await usersCollection.insertOne(newUser); } catch (err) { throw err; }
            
            const token = jwt.sign({ email: data.email, role: "student", fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            return res.status(200).json({ message: "تم إنشاء حساب بنجاح", token: token, userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } });  
        }  
        return res.status(400).json({ message: "بيانات غير مكتملة." });

    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي" }); }
});

app.post('/api/admin/upload-course', authenticateToken, requireAdmin, uploadLimiter, async (req, res) => {
    let responded = false;
    let parallelUpload = null;

    try {
        const bb = busboy({ headers: req.headers, limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1, fields: 15 } });
        let courseData = {};
        let fieldsReceived = false;

        bb.on('field', (name, val) => { 
            courseData[name] = val; 
            if (courseData.courseName && courseData.grade) fieldsReceived = true;
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
            const extMap = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };
            const ext = extMap[mimeType] || 'mp4';
            const fileKey = `videos/${crypto.randomUUID()}.${ext}`;

            try {
                // الاعتماد حصرياً على R2
                parallelUpload = new Upload({
                    client: r2Client,
                    params: { Bucket: R2_BUCKET_NAME, Key: fileKey, Body: uploadStream, ContentType: mimeType },
                    queueSize: 4, partSize: 5 * 1024 * 1024, leavePartsOnError: false 
                });

                await parallelUpload.done();
                
                try {
                    await db.collection('courses').insertOne({
                        courseName: courseData.courseName, 
                        grade: courseData.grade, 
                        description: courseData.description || "",
                        duration: courseData.duration || "غير محدد", // المدة
                        image: courseData.imageUrl || "",            // رابط الصورة
                        telegramMsgId: crypto.randomUUID(), 
                        fileKey: fileKey, 
                        provider: 'R2', // R2 فقط
                        createdAt: new Date()
                    });
                    if (!responded) { responded = true; res.status(200).json({ message: "تم الرفع السحابي على R2 بنجاح." }); }

                } catch (dbError) {
                    logger.error({ provider: 'R2' }, `❌ فشلت إضافة الكورس للداتا بيس`);
                    try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: fileKey })); } catch (cleanupError) {}
                    if (!responded) { responded = true; res.status(500).json({ message: "حدث خطأ أثناء حفظ الدورة." }); }
                }

            } catch (err) {
                logger.error({ provider: 'R2', error: err.message }, `🚨 فشل الرفع السحابي!`);
                if (!responded) { responded = true; res.status(500).json({ message: `فشل الرفع السحابي` }); }
            }
        });

        req.on('close', () => { if (!req.complete && parallelUpload && !responded) parallelUpload.abort(); });
        req.pipe(bb);
    } catch (error) { if (!responded) { responded = true; res.status(500).json({ message: "خطأ غير متوقع." }); } }
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

        // استخدام R2 فقط
        const headCommand = new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey });
        const headResponse = await r2Client.send(headCommand);
        const fileSize = headResponse.ContentLength;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            if (start >= fileSize || end >= fileSize || start > end) return res.status(416).send("النطاق المطلوب خارج حدود الملف.");
        }

        const abortController = new AbortController();
        streamTimeout = setTimeout(() => abortController.abort(), 15000); 
        
        const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey, Range: range });
        const s3Response = await r2Client.send(command, { abortSignal: abortController.signal });
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
        pipeline(s3Response.Body, res, (err) => {});

    } catch (error) {
        if (streamTimeout) clearTimeout(streamTimeout);
        if (!res.headersSent) res.status(error.name === 'AbortError' ? 504 : 500).send("تعذر تحميل الفيديو.");
    }
});

// 📌 راوت جديد: حفظ الدقيقة التي توقف عندها الطالب (آخر مشاهدة)
app.post('/api/student/save-progress', authenticateToken, async (req, res) => {
    try {
        const { msgId, currentTime } = req.body;
        if (!msgId || currentTime === undefined) return res.status(400).json({ message: "بيانات غير مكتملة" });

        // حفظ التقدم داخل أوبجكت progress الخاص بالطالب
        await usersCollection.updateOne(
            { email: req.user.email },
            { $set: { [`progress.${msgId}`]: Math.floor(currentTime) } }
        );
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ message: "فشل حفظ تقدم الطالب." });
    }
});

// دمج بيانات (آخر مشاهدة) مع الكورسات وعرضها في لوحة التحكم
app.post('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const parseResult = gradeSchema.safeParse(req.body);
        if (!parseResult.success) return res.status(400).json({ message: "البيانات المدخلة غير صحيحة." });
        const { grade } = parseResult.data;
        
        const user = await usersCollection.findOne({ email: req.user.email });
        const studentPoints = user?.points || 0;
        const studentProgress = user?.progress || {}; // التقدم الخاص بالطالب
        
        const content = await db.collection('curriculum_content').findOne({ grade }) || { points: [], questions: [], tests: [], quizzes: [] };  
        const rawCourses = await db.collection('courses').find({ grade }).sort({ createdAt: 1 }).toArray();

        // دمج الكورسات مع تقدم الطالب
        const courses = rawCourses.map(course => {
            const rawTime = studentProgress[course.telegramMsgId];
            return {
                id: course._id,
                courseName: course.courseName,
                description: course.description,
                telegramMsgId: course.telegramMsgId,
                duration: course.duration || "غير محدد",
                image: course.image || "", 
                lastWatched: rawTime ? formatProgressTime(rawTime) : null // إرجاع الوقت بصيغة (دقيقة:ثانية)
            };
        });

        res.status(200).json({ studentPoints, content, courses });  
    } catch (error) { res.status(500).json({ message: "فشل جلب البيانات." }); }
});

app.get('/api/admin/get-all-courses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const courses = await db.collection('courses').find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
        const formattedCourses = courses.map(c => ({ id: c._id.toString(), courseName: c.courseName, grade: c.grade, description: c.description, telegramMsgId: c.telegramMsgId, duration: c.duration, image: c.image }));
        res.status(200).json({ courses: formattedCourses });
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر" }); }
});

app.delete('/api/admin/delete-course/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        const course = await db.collection('courses').findOne({ _id: new ObjectId(courseId) });
        if (course && course.fileKey) {
            try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey })); } catch (e) {}
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
    try {
        // تنظيف الملفات المعلقة من R2 فقط
        const data = await r2Client.send(new ListMultipartUploadsCommand({ Bucket: R2_BUCKET_NAME }));
        if (data.Uploads) {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            for (const upload of data.Uploads) {
                if (upload.Initiated < oneDayAgo) {
                    await r2Client.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET_NAME, Key: upload.Key, UploadId: upload.UploadId }));
                }
            }
        }
    } catch (err) {}
}, 24 * 60 * 60 * 1000); 

setInterval(async () => {
    if (!db) return;
    try {
        const contentCollection = db.collection('curriculum_content');
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        await contentCollection.updateMany({ "liveStream.isLive": true, "liveStream.startedAt": { $lt: fourHoursAgo } }, { $unset: { "liveStream": "" } });
    } catch (e) {}
}, 60 * 60 * 1000);

async function startServer() {
    await connectMongo();
    server = app.listen(PORT, () => logger.info(`🚀 السيرفر شغال ومستعد لخدمة الطلبة على بورت ${PORT}`));
    server.headersTimeout = 15000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000;
}
startServer();
process.on('unhandledRejection', (err) => {}); process.on('uncaughtException', (err) => {});
process.on('SIGINT', async () => { if (server) { server.close(async () => { try { if (mongoClient) await mongoClient.close(); } catch (e) {} process.exit(0); }); } else { process.exit(0); } });
