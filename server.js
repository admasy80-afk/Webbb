require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cors = require('cors');

// CRITICAL SECURITY: Enforce JWT Secret
if (!process.env.JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET environment variable is missing.");
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// File Type Validation (Strict Magic Numbers Check via require)
let fileTypeFromFile;
try {
    const fileTypeModule = require('file-type');
    fileTypeFromFile = fileTypeModule.fileTypeFromFile;
} catch (err) {
    console.error("Failed to initialize file-type module:", err.message);
}

// S3 Cloud Storage Libraries
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Security and Proxy Setup
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// CORS Setup
const allowedOrigins = process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
app.use(cors({
    origin: function(origin, callback){
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request ID Tracking Middleware
app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    next();
});

// Upload Directory Setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Configuration
const upload = multer({ 
    dest: uploadDir,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB Max
});

// Rate Limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "محاولات كثيرة جداً، يرجى المحاولة لاحقاً." }
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { message: "تجاوزت الحد المسموح من الطلبات." }
});

// Apply general limiter to all /api routes except login
app.use('/api/', (req, res, next) => {
    if (req.path === '/saveUser') {
        return next();
    }
    apiLimiter(req, res, next);
});

let db;
let usersCollection;

// ==================== Cloud Storage Configurations ====================

const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'eld7e7';

const b2Client = new S3Client({
    region: process.env.B2_REGION || 'us-east-005',
    endpoint: process.env.B2_ENDPOINT,
    credentials: { accessKeyId: process.env.B2_ACCESS_KEY_ID, secretAccessKey: process.env.B2_SECRET_ACCESS_KEY },
});
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'eld7e7-courses';

const idriveClient = new S3Client({
    region: process.env.IDRIVE_REGION || 'eu-west-4',
    endpoint: process.env.IDRIVE_ENDPOINT,
    credentials: { accessKeyId: process.env.IDRIVE_ACCESS_KEY_ID, secretAccessKey: process.env.IDRIVE_SECRET_ACCESS_KEY },
});
const IDRIVE_BUCKET_NAME = process.env.IDRIVE_BUCKET_NAME || 'eld7e7';

// ==================== Core Server & DB Initialization ====================
async function startServer() {
    try {
        if (process.env.MONGO_URL) {
            const client = new MongoClient(process.env.MONGO_URL);
            await client.connect();
            db = client.db('dahih_db');
            usersCollection = db.collection('users');
            console.log("Database connection established.");
        }
        app.listen(PORT, () => console.log(`Server started on port ${PORT}.`));
    } catch (err) {
        console.error("Server startup failed:", err);
    }
}

startServer();

app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (req, res) => res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4'));

// ==================== Middlewares ====================

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: "غير مصرح بالوصول." });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "انتهت صلاحية الجلسة أو غير صالحة." });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    const role = (req.user && req.user.role) ? req.user.role : req.body.role;
    if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "مطلوب صلاحيات مسؤول." });
    next();
};

app.get('/api/verify-session', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ message: "انتهت صلاحية الجلسة." });
    const userRole = req.user.role;
    res.status(200).json({ message: "تم التحقق من الجلسة بنجاح.", redirectTo: (userRole === 'dev' || userRole === 'owner') ? '/admin-dashboard.html' : '/student-dashboard.html', role: userRole });
});

// ==================== Helper Functions ====================

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ==================== Routes ====================

// Smart Multi-Cloud Failover Upload (with Retry, Timeout & Async Cleanup)
app.post('/api/admin/upload-course', authenticateToken, requireAdmin, upload.single('videoFile'), async (req, res) => {
    let absoluteFilePath = null;
    try {
        const { courseName, grade, description } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: "يرجى اختيار ملف فيديو." });
        if (!courseName || typeof courseName !== 'string') return res.status(400).json({ message: "اسم الدورة غير صالح." });

        absoluteFilePath = path.resolve(file.path);

        // Strict File Signature Validation
        if (fileTypeFromFile) {
             const type = await fileTypeFromFile(absoluteFilePath);
             if (!type || !type.mime.startsWith('video/')) {
                 throw new Error("نوع الملف غير مدعوم أو تالف.");
             }
        }

        const fileKey = `videos/${crypto.randomUUID()}.mp4`; 
        
        const providers = [
            { name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME },
            { name: 'B2', client: b2Client, bucket: B2_BUCKET_NAME },
            { name: 'IDRIVE', client: idriveClient, bucket: IDRIVE_BUCKET_NAME }
        ];

        const shuffledProviders = shuffleArray(providers);
        
        let finalProvider = null;
        let uploadSuccess = false;

        for (const providerConfig of shuffledProviders) {
            let attempt = 1;
            
            while (attempt <= 2 && !uploadSuccess) {
                console.log(`[${req.requestId}] Upload attempt ${attempt} for provider: ${providerConfig.name}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000); 
                let fileStream = null;

                try {
                    fileStream = fs.createReadStream(absoluteFilePath);
                    const parallelUploads3 = new Upload({
                        client: providerConfig.client,
                        params: { 
                            Bucket: providerConfig.bucket, 
                            Key: fileKey, 
                            Body: fileStream, 
                            ContentType: file.mimetype || 'video/mp4' 
                        },
                        abortController: controller,
                        queueSize: 4, 
                        partSize: 1024 * 1024 * 5, 
                    });

                    await parallelUploads3.done();
                    clearTimeout(timeoutId);
                    finalProvider = providerConfig.name;
                    uploadSuccess = true;
                    console.log(`[${req.requestId}] Upload completed successfully using provider: ${finalProvider}`);
                } catch (err) {
                    clearTimeout(timeoutId);
                    if (fileStream) fileStream.destroy(); // Prevent memory leaks
                    console.warn(`[${req.requestId}] Attempt ${attempt} failed for provider ${providerConfig.name}.`);
                    attempt++;
                }
            }
            if (uploadSuccess) break; 
        }

        if (!uploadSuccess) {
            throw new Error("فشلت جميع محاولات الرفع لمزودي الخدمة السحابية.");
        }

        const coursesCollection = db.collection('courses');
        const uniqueMsgId = crypto.randomUUID(); 

        await coursesCollection.insertOne({
            courseName,
            grade,
            description,
            telegramMsgId: uniqueMsgId, 
            fileKey: fileKey,       
            provider: finalProvider, 
            createdAt: new Date()
        });

        res.status(200).json({ message: "تم الرفع بنجاح." });
    } catch (error) {
        console.error(`[${req.requestId}] Multi-cloud upload failed:`, error.message);
        res.status(500).json({ message: "حدث خطأ غير متوقع أثناء الرفع." });
    } finally {
        if (absoluteFilePath && fs.existsSync(absoluteFilePath)) {
            try {
                await fs.promises.unlink(absoluteFilePath);
            } catch (cleanupError) {
                console.error(`[${req.requestId}] Failed to delete local temp file:`, cleanupError.message);
            }
        }
    }
});

// Dynamic Video Streamer with Range Validation and Error Handling
app.get('/api/video/stream/:msgId', authenticateToken, async (req, res) => {
    try {
        const msgId = req.params.msgId;
        
        const range = req.headers.range;
        if (range && !/^bytes=\d+-\d*$/.test(range)) {
            return res.status(416).send("نطاق البث غير صالح.");
        }

        const coursesCollection = db.collection('courses');
        // Support both old integer IDs and new UUIDs
        const queryId = isNaN(parseInt(msgId, 10)) ? msgId : parseInt(msgId, 10);
        const course = await coursesCollection.findOne({ telegramMsgId: queryId });

        if (!course) return res.status(404).send("الفيديو غير موجود.");

        let targetClient = null;
        let targetBucket = null;
        const targetKey = course.fileKey || course.r2FileKey;

        if (course.provider === 'B2') {
            targetClient = b2Client;
            targetBucket = B2_BUCKET_NAME;
        } else if (course.provider === 'IDRIVE') {
            targetClient = idriveClient;
            targetBucket = IDRIVE_BUCKET_NAME;
        } else if (course.provider === 'R2' || course.r2FileKey) {
            targetClient = r2Client;
            targetBucket = R2_BUCKET_NAME;
        }

        if (!targetClient) return res.status(404).send("مزود التخزين غير صالح.");

        const command = new GetObjectCommand({
            Bucket: targetBucket,
            Key: targetKey,
            Range: range 
        });

        const s3Response = await targetClient.send(command);
        
        const headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': s3Response.ContentLength,
            'Content-Type': s3Response.ContentType || 'video/mp4',
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff'
        };
        if (s3Response.ContentRange) headers['Content-Range'] = s3Response.ContentRange;
        
        res.writeHead(range ? 206 : 200, headers);
        
        s3Response.Body.on('error', (err) => {
            console.error(`[${req.requestId}] S3 Stream Error:`, err.message);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        s3Response.Body.pipe(res);

    } catch (error) {
        console.error(`[${req.requestId}] Video streaming error:`, error.message);
        if (!res.headersSent) res.status(500).send("تعذر تحميل الفيديو.");
    }
});

app.get('/api/admin/get-all-courses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;
        const coursesCollection = db.collection('courses');
        const courses = await coursesCollection.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
        const formattedCourses = courses.map(c => ({
            id: c._id.toString(),
            courseName: c.courseName,
            grade: c.grade,
            description: c.description,
            telegramMsgId: c.telegramMsgId
        }));
        res.status(200).json({ courses: formattedCourses });
    } catch (error) { res.status(500).json({ message: "فشل جلب البيانات." }); }
});

app.delete('/api/admin/delete-course/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        const coursesCollection = db.collection('courses');
        const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });

        if (course) {
            const targetKey = course.fileKey || course.r2FileKey;
            
            if (course.provider === 'B2') {
                try { await b2Client.send(new DeleteObjectCommand({ Bucket: B2_BUCKET_NAME, Key: targetKey })); } catch (e) { }
            } else if (course.provider === 'IDRIVE') {
                try { await idriveClient.send(new DeleteObjectCommand({ Bucket: IDRIVE_BUCKET_NAME, Key: targetKey })); } catch (e) { }
            } else if (course.provider === 'R2' || course.r2FileKey) {
                try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: targetKey })); } catch (e) { }
            }
        }

        const result = await coursesCollection.deleteOne({ _id: new ObjectId(courseId) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "تعذر العثور على المحاضرة." });
        res.status(200).json({ message: "تم حذف المحاضرة بنجاح." });
    } catch (error) { res.status(500).json({ message: "معرف غير صالح." }); }
});

app.post('/api/saveUser', loginLimiter, async (req, res) => {
    try {
        const data = req.body;
        if (!usersCollection) return res.status(500).json({ message: "الخدمة غير متاحة مؤقتاً." });  
        
        const DEV_EMAIL = process.env.DEV_EMAIL;
        const DEV_PASSWORD_HASH = process.env.DEV_PASSWORD_HASH;
        const OWNER_EMAIL = process.env.OWNER_EMAIL;
        const OWNER_PASSWORD_HASH = process.env.OWNER_PASSWORD_HASH;

        let isDev = false;
        let isOwner = false;

        if (data.identifier === DEV_EMAIL && DEV_PASSWORD_HASH) {
            isDev = await bcrypt.compare(data.password, DEV_PASSWORD_HASH);
        }
        if (data.identifier === OWNER_EMAIL && OWNER_PASSWORD_HASH) {
            isOwner = await bcrypt.compare(data.password, OWNER_PASSWORD_HASH);
        }
        
        if (isDev || isOwner) {  
            const roleName = isDev ? "Developer" : "Administrator";  
            const userRole = isDev ? "dev" : "owner";  
            const token = jwt.sign({ email: data.identifier, role: userRole }, JWT_SECRET, { expiresIn: '7d' });
            return res.status(200).json({ message: "تم تسجيل الدخول بنجاح.", token: token, userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "Platform Management" } });  
        }  

        if (data.identifier) {  
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });  
            if (user) {  
                const validPassword = await bcrypt.compare(data.password, user.password);
                if (validPassword) { 
                    const token = jwt.sign({ email: user.email, role: "student" }, JWT_SECRET, { expiresIn: '7d' });
                    return res.status(200).json({ message: "تم تسجيل الدخول بنجاح.", token: token, userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", email: user.email, phone: user.phone, role: "student", phoneVerified: user.phoneVerified || false } });  
                }
            } 
            return res.status(401).json({ message: "بيانات تسجيل الدخول غير صحيحة." });  
        }  

        if (data.first_name) {  
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });  
            if (existing) return res.status(400).json({ message: "البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل." });  
            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = { ...data, password: hashedPassword, status: "pending", role: "student", points: 0, phoneVerified: false };
            await usersCollection.insertOne(newUser);  
            const token = jwt.sign({ email: data.email, role: "student" }, JWT_SECRET, { expiresIn: '7d' });
            return res.status(200).json({ message: "تم إنشاء الحساب بنجاح.", token: token, userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } });  
        }  
    } catch (error) { console.error(`[${req.requestId}] saveUser Error:`, error.message); res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });  
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });  
        res.status(200).json({ studentsCount, pendingCount, questionsCount: "Active" });   
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/pending', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/update-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, newStatus, reason } = req.body;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { status: newStatus, rejection_reason: reason || "" } });
        res.status(200).json({ message: "تم تحديث حالة الطالب بنجاح." });
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/students-by-grade', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body;
        const students = await usersCollection.find({ status: "accepted", role: "student", grade: grade }).toArray();  
        res.status(200).json(students);  
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/add-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, type, pointText, questionText, questionHint } = req.body;
        const contentCollection = db.collection('curriculum_content');
        if (type === 'point') await contentCollection.updateOne({ grade: grade }, { $push: { points: pointText } }, { upsert: true });
        else await contentCollection.updateOne({ grade: grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
        res.status(200).json({ message: "تمت إضافة المحتوى بنجاح." });
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/update-points', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, points } = req.body;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { points: parseInt(points, 10) } }); 
        res.status(200).json({ message: "تم تحديث النقاط بنجاح." });
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/toggle-stream', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isLive } = req.body; 
        const contentCollection = db.collection('curriculum_content');  
        if (isLive) {
            await contentCollection.updateMany({}, { $set: { "liveStream": { isLive: true, startedAt: new Date() } } }, { upsert: true });  
            res.status(200).json({ message: "تم تشغيل البث المباشر." });  
        } else {
            await contentCollection.updateMany({}, { $unset: { "liveStream": "" } });  
            res.status(200).json({ message: "تم إيقاف البث المباشر." });  
        }
    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/add-mcq-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'quiz_' + Date.now();
        const contentCollection = db.collection('curriculum_content');
        await contentCollection.updateOne({ grade: grade }, { $push: { quizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } }, { upsert: true });
        res.status(200).json({ message: "تم إنشاء الاختبار بنجاح.", quizId: quizId });
    } catch (err) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/add-public-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'pub_' + Date.now(); 
        const contentCollection = db.collection('curriculum_content');
        await contentCollection.updateOne({ grade: grade || "General" }, { $push: { publicQuizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } }, { upsert: true });
        res.status(200).json({ success: true, message: "تم إنشاء الاختبار العام بنجاح.", quizId: quizId });
    } catch (err) { res.status(500).json({ message: "حدث خطأ داخلي في الخادم." }); }
});

app.post('/api/admin/get-grade-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body;
        const contentCollection = db.collection('curriculum_content');
        const content = await contentCollection.findOne({ grade: grade }) || { points: [],
