require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// مكاتب التخزين السحابي (S3)
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dahih_super_secret_key_2026';

// إعدادات الحماية والبروكسي
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ 
    dest: uploadDir,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } 
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "محاولات كثيرة جداً، يرجى المحاولة بعد 15 دقيقة." }
});

let db;
let usersCollection;

// ==================== 1. إعدادات Cloudflare R2 ====================
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});
const R2_BUCKET_NAME = 'eld7e7';

// ==================== 2. إعدادات Backblaze B2 ====================
const b2Client = new S3Client({
    region: process.env.B2_REGION || 'us-east-005',
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.B2_ACCESS_KEY_ID,
        secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
    },
});
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'eld7e7-courses';

// ==================== 3. إعدادات تيليجرام (للأرشيف) ====================
const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim().replace(/['"]/g, '');
const apiId = parseInt((process.env.TELEGRAM_API_ID || "0").toString().trim().replace(/['"]/g, ''));
const apiHash = (process.env.TELEGRAM_API_HASH || "").trim().replace(/['"]/g, '');
const stringSession = new StringSession(""); 
const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 10, useWSS: true });

async function ensureTelegramConnection() {
    if (tgClient.connected) return true;
    try {
        await tgClient.start({ botAuthToken: botToken });
        console.log("👑 سيرفر تيليجرام متصل (للأرشيف)");
        return true;
    } catch (err) {
        console.error("❌ فشل اتصال تيليجرام:", err.message);
        return false;
    }
}

async function startServer() {
    try {
        if (process.env.MONGO_URL) {
            const client = new MongoClient(process.env.MONGO_URL);
            await client.connect();
            db = client.db('dahih_db');
            usersCollection = db.collection('users');
            console.log("✅ تم الاتصال بمونجو بنجاح..");
        }
        await ensureTelegramConnection();
        app.listen(PORT, () => console.log(`🚀 السيرفر شغال بدمج سحابي (B2 + R2 + Telegram) على بورت ${PORT}`));
    } catch (err) {
        console.error("❌ فشل تشغيل السيرفر الأساسي:", err);
    }
}

startServer();

app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (req, res) => res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4'));

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    const role = (req.user && req.user.role) ? req.user.role : req.body.role;
    if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
    next();
};

app.get('/api/verify-session', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ message: "انتهت الجلسة" });
    const userRole = req.user.role;
    res.status(200).json({ message: "التوكن صالح", redirectTo: (userRole === 'dev' || userRole === 'owner') ? '/admin-dashboard.html' : '/student-dashboard.html', role: userRole });
});

// 🔥 رفع الفيديو (الافتراضي الآن هو Backblaze B2) 🔥
app.post('/api/admin/upload-course', authenticateToken, requireAdmin, upload.single('videoFile'), async (req, res) => {
    let absoluteFilePath = null;
    try {
        const { courseName, grade, description } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: "يرجى اختيار ملف الفيديو أولاً" });

        absoluteFilePath = path.resolve(file.path);
        const fileStream = fs.createReadStream(absoluteFilePath);
        
        // تسمية فريدة للملف
        const fileKey = `videos/${Date.now()}_${path.basename(file.originalname).replace(/[^a-zA-Z0-9.]/g, "")}`;
        
        console.log("🚀 جاري رفع الفيديو إلى Backblaze B2...");

        const parallelUploads3 = new Upload({
            client: b2Client,
            params: { Bucket: B2_BUCKET_NAME, Key: fileKey, Body: fileStream, ContentType: file.mimetype || 'video/mp4' },
            queueSize: 4, 
            partSize: 1024 * 1024 * 5, 
        });

        await parallelUploads3.done();
        console.log("✅ تم الرفع لـ Backblaze B2 بنجاح!");

        if (fs.existsSync(absoluteFilePath)) fs.unlinkSync(absoluteFilePath);

        const coursesCollection = db.collection('courses');
        const fakeMsgId = Date.now(); 

        await coursesCollection.insertOne({
            courseName,
            grade,
            description,
            telegramMsgId: fakeMsgId, 
            fileKey: fileKey,       
            provider: 'B2', // لتمييز مصدر الفيديو
            createdAt: new Date()
        });

        res.status(200).json({ message: "✅ تم رفع المحاضرة السحابية بنجاح!" });
    } catch (error) {
        if (absoluteFilePath && fs.existsSync(absoluteFilePath)) fs.unlinkSync(absoluteFilePath);
        console.error("B2 Upload Error:", error);
        res.status(500).json({ message: "خطأ في السيرفر السحابي: " + (error.message || "فشل غير معروف") });
    }
});

// 🔥 بث الفيديو: نظام توجيه ذكي للثلاث منصات 🔥
app.get('/api/video/stream/:msgId', authenticateToken, async (req, res) => {
    try {
        const msgId = parseInt(req.params.msgId);
        const coursesCollection = db.collection('courses');
        const course = await coursesCollection.findOne({ telegramMsgId: msgId });

        if (!course) return res.status(404).send("الفيديو غير متاح");

        // 🔵 1. التشغيل من Backblaze B2
        if (course.provider === 'B2') {
            const command = new GetObjectCommand({ Bucket: B2_BUCKET_NAME, Key: course.fileKey, Range: req.headers.range });
            const s3Response = await b2Client.send(command);
            
            const headers = {
                'Accept-Ranges': 'bytes',
                'Content-Length': s3Response.ContentLength,
                'Content-Type': s3Response.ContentType || 'video/mp4'
            };
            if (s3Response.ContentRange) headers['Content-Range'] = s3Response.ContentRange;
            
            res.writeHead(s3Response.$metadata.httpStatusCode || 200, headers);
            s3Response.Body.pipe(res);
            return;
        }

        // 🟠 2. التشغيل من Cloudflare R2
        if (course.r2FileKey) {
            const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.r2FileKey, Range: req.headers.range });
            const r2Response = await r2Client.send(command);
            
            const headers = {
                'Accept-Ranges': 'bytes',
                'Content-Length': r2Response.ContentLength,
                'Content-Type': r2Response.ContentType || 'video/mp4'
            };
            if (r2Response.ContentRange) headers['Content-Range'] = r2Response.ContentRange;
            
            res.writeHead(r2Response.$metadata.httpStatusCode || 200, headers);
            r2Response.Body.pipe(res);
            return;
        }

        // 🟢 3. التشغيل من تيليجرام 
        await ensureTelegramConnection();
        const messages = await tgClient.getMessages('@mohamed293g', { ids: [msgId] });
        if (!messages || messages.length === 0 || !messages[0].media) return res.status(404).send("الفيديو غير متاح");

        const message = messages[0];
        const fileSize = Number(message.media.document.size);
        const range = req.headers.range;

        let start = 0; let end = fileSize - 1;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10);
            end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        }

        res.writeHead(range ? 206 : 200, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start) + 1,
            'Content-Type': 'video/mp4'
        });

        const stream = tgClient.iterDownload({ file: message.media, offset: start, limit: (end - start) + 1, requestSize: 1024 * 512 });
        let isClosed = false;
        req.on('close', () => { isClosed = true; });

        for await (const chunk of stream) {
            if (isClosed) break;
            if (!res.write(chunk)) await new Promise(resolve => res.once('drain', resolve));
        }
        if (!isClosed) res.end();

    } catch (error) {
        console.error("❌ خطأ في بث الفيديو:", error.message);
        if (!res.headersSent) res.status(500).send("حدث خطأ أثناء تحميل مشغل الفيديو");
    }
});

app.get('/api/admin/get-all-courses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
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
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر أثناء جلب البيانات" }); }
});

app.delete('/api/admin/delete-course/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        const coursesCollection = db.collection('courses');
        const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });

        if (course) {
            // حذف من السحابة الصحيحة
            if (course.provider === 'B2') {
                try { await b2Client.send(new DeleteObjectCommand({ Bucket: B2_BUCKET_NAME, Key: course.fileKey })); } 
                catch (e) { console.error("⚠️ فشل حذف الملف من B2:", e.message); }
            } else if (course.r2FileKey) {
                try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.r2FileKey })); } 
                catch (e) { console.error("⚠️ فشل حذف الملف من R2:", e.message); }
            }
        }

        const result = await coursesCollection.deleteOne({ _id: new ObjectId(courseId) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "المحاضرة غير موجودة بالفعل" });
        res.status(200).json({ message: "تم حذف المحاضرة بنجاح" });
    } catch (error) { res.status(500).json({ message: "فشل الحذف، معرف غير صالح" }); }
});

// =================== بقية مسارات النظام الأساسية ===================

app.post('/api/saveUser', loginLimiter, async (req, res) => {
    try {
        const data = req.body;
        if (!usersCollection) return res.status(500).json({ message: "السيرفر لسه بيسخن.." });  
        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";  
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";  
        if (isDev || isOwner) {  
            const roleName = isDev ? "المطور (Null)" : "مستر";  
            const userRole = isDev ? "dev" : "owner";  
            const token = jwt.sign({ email: data.identifier, role: userRole }, JWT_SECRET, { expiresIn: '30d' });
            return res.status(200).json({ message: `أهلاً بك يا ${roleName} 👑`, token: token, userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" } });  
        }  
        if (data.identifier) {  
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });  
            if (user) {  
                const validPassword = await bcrypt.compare(data.password, user.password);
                if (validPassword || data.password === user.password) { 
                    const token = jwt.sign({ email: user.email, role: "student" }, JWT_SECRET, { expiresIn: '30d' });
                    return res.status(200).json({ message: "تم الدخول ✓", token: token, userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", email: user.email, phone: user.phone, role: "student", phoneVerified: user.phoneVerified || false } });  
                }
            } 
            return res.status(401).json({ message: "خطأ في بيانات الدخول" });  
        }  
        if (data.first_name) {  
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });  
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });  
            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = { ...data, password: hashedPassword, status: "pending", role: "student", points: 0, phoneVerified: false };
            await usersCollection.insertOne(newUser);  
            const token = jwt.sign({ email: data.email, role: "student" }, JWT_SECRET, { expiresIn: '30d' });
            return res.status(200).json({ message: "تم إنشاء حساب بنجاح", token: token, userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } });  
        }  
    } catch (error) { res.status(500).json({ message: "حدث خطأ" }); }
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

app.post('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email; 
        const { grade } = req.body;
        
        const user = await usersCollection.findOne({ email: email });
        const studentPoints = user ? (user.points || 0) : 0;
        
        const contentCollection = db.collection('curriculum_content');  
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [], quizzes: [] };  

        const coursesCollection = db.collection('courses');
        const courses = await coursesCollection.find({ grade: grade }).sort({ createdAt: 1 }).toArray();

        res.status(200).json({ 
            studentPoints, 
            content,
            courses: courses 
        });  
    } catch (error) { 
        console.error("❌ خطأ في جلب بيانات لوحة الطالب:", error);
        res.status(500).json({ message: "خطأ في السيرفر" }); 
    }
});

app.get('/api/public/quiz', async (req, res) => {
    try {
        const { id, device } = req.query; 
        if (!id) return res.status(400).json({ message: "مفقود معرف الاختبار" });
        const contentCollection = db.collection('curriculum_content');
        const doc = await contentCollection.findOne({ "publicQuizzes.id": id });
        if (!doc) return res.status(404).json({ message: "الاختبار غير موجود أو تم حذفه" });
        const quiz = doc.publicQuizzes.find(q => q.id === id);
        if (device && quiz.results) {
            const alreadyTaken = quiz.results.some(r => r.visitorId === device);
            if (alreadyTaken) return res.status(403).json({ message: "كان غيرك اشطر😂😂" });
        }
        quiz.grade = doc.grade; 
        res.status(200).json(quiz);
    } catch (err) { res.status(500).json({ message: "خطأ في جلب الاختبار" }); }
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

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            message: err.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف أكبر من 2 جيجا!' : 'حدث خطأ أثناء الرفع.'
        });
    }
    next(err);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
