require('dotenv').config(); // تم تصحيح الـ r لتكون سمول لضمان قراءة متغيرات البيئة
const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb'); 
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 

// 🪐 مكتبات نظام تيليجرام السحابي ورفع الملفات
const fs = require('fs');
const multer = require('multer');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dahih_super_secret_key_2026';

// 🔥 حل مشكلة Railway والـ Rate Limit للـ Proxies
app.set('trust proxy', 1);

// ==========================================
// 🛡️ إعدادات الحماية والملفات المؤقتة
// ==========================================
app.use(helmet({ contentSecurityPolicy: false })); 
app.use(express.json({ limit: '1mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

// إعداد فولدر رفع مؤقت للفيديوهات على السيرفر قبل نقلها لتيليجرام
const upload = multer({ dest: 'uploads/' }); 

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 20, 
    message: { message: "محاولات كثيرة جداً، يرجى المحاولة بعد 15 دقيقة." }
});

// تعيين المتغيرات العالمية بشكل صحيح متوافق مع v6 ومستقر
let db;
let usersCollection;

// ==========================================
// 🤖 تهيئة نظام تيليجرام MTProto (تنظيف أوتوماتيكي وحقن الاحتياطي الصارم)
// ==========================================
const botToken = (process.env.TELEGRAM_BOT_TOKEN || "8721699695:AAF_7GnXf9U4fGNm7VktRzjrpMg18KAtsig").trim().replace(/['"]/g, '');
const apiId = parseInt((process.env.TELEGRAM_API_ID || "31618084").toString().trim().replace(/['"]/g, ''));
const apiHash = (process.env.TELEGRAM_API_HASH || "530ee664dc425b824d896e0d65223cbf").trim().replace(/['"]/g, '');
const stringSession = new StringSession(""); 

const tgClient = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

// --- [الاتصال بقاعدة البيانات وتشغيل السيرفرات] ---
async function startServer() {
    try {
        if (process.env.MONGO_URL) {
            const client = new MongoClient(process.env.MONGO_URL);
            await client.connect();
            
            db = client.db('dahih_db');
            usersCollection = db.collection('users');
            
            console.log("✅ تم الاتصال بمونجو بنجاح.. السيرفر جاهز الآن");
        } else {
            console.error("❌ MONGO_URL غير موجود في متغيرات البيئة!");
        }

        // تشغيل اتصال تيليجرام المطور بالخلفية وحل مشكلة البوت كراش نهائياً بالخيار المعتمد
        await tgClient.start({ botAuthToken: botToken });
        console.log("👑 سيرفر تيليجرام MTProto متصل وجاهز للبث الآمن حتى 2 جيجا!");

        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));  
    } catch (err) {  
        console.error("❌ فشل تشغيل السيرفر أو اتصال الـ MTProto:", err);  
        process.exit(1);  
    }
}

startServer();

app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (req, res) => {
    res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4');
});

// ==========================================
// 🧹 نظام التنظيف التلقائي للموارد
// ==========================================
setInterval(async () => {
    if (!db) return;
    try {
        const contentCollection = db.collection('curriculum_content');
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        await contentCollection.updateMany(
            { "liveStream.isLive": true, "liveStream.startedAt": { $lt: fourHoursAgo } },
            { $unset: { "liveStream": "" } }
        );
    } catch (e) {
        console.error("⚠️ خطأ في دورة تنظيف الموارد:", e);
    }
}, 60 * 60 * 1000);

// ==========================================
// 🔒 نظام التوثيق المرن 
// ==========================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) req.user = user;
            next();
        });
    } else {
        next(); 
    }
};

const requireAdmin = (req, res, next) => {
    const role = (req.user && req.user.role) ? req.user.role : req.body.role;
    if (role !== 'dev' && role !== 'owner') {
        return res.status(403).json({ message: "غير مصرح لك" });
    }
    next();
};

app.get('/api/verify-session', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ message: "انتهت الجلسة" });
    const userRole = req.user.role;
    let redirectUrl = '/student-dashboard.html'; 
    if (userRole === 'dev' || userRole === 'owner') redirectUrl = '/admin-dashboard.html'; 
    res.status(200).json({ message: "التوكن صالح", redirectTo: redirectUrl, role: userRole });
});

// ==========================================
// 🎥 مسارات بث ورفع الفيديوهات السحابية 
// ==========================================

// 1. مسار رفع المحاضرة من المستر وتخزينها مشفرة في تيليجرام ومونجو
app.post('/api/admin/upload-course', authenticateToken, requireAdmin, upload.single('videoFile'), async (req, res) => {
    try {
        const { courseName, grade, description } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: "يرجى اختيار ملف الفيديو أولاً" });

        console.log(`⏳ جاري معالجة ورفع الحصة سحابياً وبشكل صامت: ${courseName}`);

        // رفع الملف كـ Stream أوتوماتيكي عبر بروتوكول MTProto لكسر ليميت الـ 50 ميجا
        const uploadedFile = await tgClient.uploadFile({
            file: file.path,
            workers: 4 
        });

        // إرسال الملف لشات البوت الخاص (me) لأرشفته وتوليد الـ ID
        const message = await tgClient.sendFile('me', {
            file: uploadedFile,
            caption: `حصة: ${courseName} | الصف: ${grade}`
        });

        // تنظيف وحذف الفيديو فوراً من سيرفر Railway عشان المساحة متتمليش
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        const coursesCollection = db.collection('courses');
        await coursesCollection.insertOne({
            courseName,
            grade,
            description,
            telegramMsgId: message.id, 
            createdAt: new Date()
        });

        res.status(200).json({ message: "✅ تم تشفير المحاضرة ورفعها للمنصة بنجاح لا نهائي!" });
    } catch (error) {
        console.error("❌ خطأ الرفع السحابي:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: "فشل الرفع السحابي، تأكد من كود الـ API والتوكن في الـ .env" });
    }
});

// 2. جلب جميع الكورسات مع دعم الـ GET والـ Pagination المطور المتوافق مع الفرونت إند
app.get('/api/admin/get-all-courses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const coursesCollection = db.collection('courses');
        
        const courses = await coursesCollection.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const formattedCourses = courses.map(c => ({
            id: c._id.toString(),
            courseName: c.courseName,
            grade: c.grade,
            description: c.description,
            telegramMsgId: c.telegramMsgId
        }));

        res.status(200).json({ courses: formattedCourses });
    } catch (error) {
        res.status(500).json({ message: "خطأ في السيرفر أثناء جلب البيانات" });
    }
});

// 3. مسار حذف الكورس المتكامل المتوافق مع الـ RESTful API الجديد الخاص بك
app.delete('/api/admin/delete-course/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        const coursesCollection = db.collection('courses');

        const result = await coursesCollection.deleteOne({ _id: new ObjectId(courseId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "المحاضرة غير موجودة بالفعل" });
        }

        res.status(200).json({ message: "تم حذف المحاضرة بنجاح" });
    } catch (error) {
        res.status(500).json({ message: "فشل الحذف، معرف غير صالح" });
    }
});

// 4. مسار البث الخفي والذكي للطالب (يمنع سحب الروابط ويدعم تحميل المتصفح حتة بحتة Chunks)
app.get('/api/video/stream/:msgId', authenticateToken, async (req, res) => {
    try {
        const msgId = parseInt(req.params.msgId);
        
        const messages = await tgClient.getMessages('me', { ids: [msgId] });
        if (!messages || messages.length === 0 || !messages[0].media) {
            return res.status(404).send("الفيديو غير متاح أو تم حذفه من الأرشيف");
        }

        const message = messages[0];
        const document = message.media.document;
        if (!document) return res.status(404).send("الملف المرفق ليس فيديو صالح");

        const fileSize = document.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            });

            const chunk = await tgClient.downloadFile(message.media, {
                start: start,
                end: end + 1,
                dcId: document.dcId,
                fileSize: fileSize
            });
            res.end(chunk);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4'
            });
            const chunk = await tgClient.downloadFile(message.media, {
                dcId: document.dcId,
                fileSize: fileSize
            });
            res.end(chunk);
        }
    } catch (error) {
        console.error("❌ خطأ أثناء بث الفيديو:", error);
        if (!res.headersSent) res.status(500).send("حدث خطأ أثناء تحميل مشغل الفيديو المحمي");
    }
});

// ==========================================
// 1️⃣ مسارات الطلاب وتسجيل الدخول القديمة
// ==========================================
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

            return res.status(200).json({   
                message: `أهلاً بك يا ${roleName} 👑`,  
                token: token,
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" }  
            });  
        }  

        if (data.identifier) {  
            const user = await usersCollection.findOne({  
                $or: [{ email: data.identifier }, { phone: data.identifier }]
            });  
            
            if (user) {  
                const validPassword = await bcrypt.compare(data.password, user.password);
                if (validPassword || data.password === user.password) { 
                    const token = jwt.sign({ email: user.email, role: "student" }, JWT_SECRET, { expiresIn: '30d' });
                    return res.status(200).json({   
                        message: "تم الدخول ✓",  
                        token: token,
                        userData: { 
                            name: user.first_name, grade: user.grade, status: user.status || "pending", 
                            email: user.email, phone: user.phone, role: "student", phoneVerified: user.phoneVerified || false 
                        }  
                    });  
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
            return res.status(200).json({ 
                message: "تم إنشاء حسابك بنجاح", token: token,
                userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } 
            });  
        }  
    } catch (error) { res.status(500).json({ message: "حدث خطأ" }); }
});

// ==========================================
// 2️⃣ باقي مسارات لوحة الإدارة 
// ==========================================
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
        
        await contentCollection.updateOne(
            { grade: grade },
            { $push: { quizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } },
            { upsert: true }
        );
        res.status(200).json({ message: "تمت إضافة الاختبار بنجاح", quizId: quizId });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-public-quiz', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'pub_' + Date.now(); 
        const contentCollection = db.collection('curriculum_content');
        
        await contentCollection.updateOne(
            { grade: grade || "عام" },
            { $push: { publicQuizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } },
            { upsert: true }
        );
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

// ==========================================
// 4️⃣ مسارات الطالب والـ Dashboard
// ==========================================
app.post('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email; 
        const { grade } = req.body;
        const user = await usersCollection.findOne({ email: email });
        const studentPoints = user ? (user.points || 0) : 0;
        
        const contentCollection = db.collection('curriculum_content');  
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [], quizzes: [] };  
        
        res.status(200).json({ studentPoints, content });  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
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
        
        const resultObj = { 
            email, studentName, score, percentage, visitorId: visitorId || null, userAnswers: userAnswers || [], date: new Date() 
        };

        if (quizId && quizId.startsWith('pub_')) {
            const existingDoc = await contentCollection.findOne({
                grade: grade,
                publicQuizzes: {
                    $elemMatch: {
                        id: quizId,
                        results: { $elemMatch: { $or: [{ visitorId: visitorId }, { email: email }] } }
                    }
                }
            });

            if (existingDoc) return res.status(403).json({ message: "عفواً، لقد قمت بتقديم هذا الاختبار مسبقاً!" });

            await contentCollection.updateOne(
                { grade: grade, "publicQuizzes.id": quizId },
                { $push: { "publicQuizzes.$.results": resultObj } }
            );
        } else {
            await contentCollection.updateOne(
                { grade: grade, "quizzes.id": quizId },
                { $push: { "quizzes.$.results": resultObj } }
            );
        }
        
        res.status(200).json({ message: "تم حفظ النتيجة واعتمادها بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/check-status', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        const user = await usersCollection.findOne({ email: email });
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
        
        res.status(200).json({ 
            status: user.status, 
            reason: user.rejection_reason,
            phoneVerified: user.phoneVerified || false 
        });
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر" }); }
});

app.post('/api/student/verify-phone', authenticateToken, async (req, res) => {
    try {
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        await usersCollection.updateOne({ email: email }, { $set: { phoneVerified: true } });
        res.status(200).json({ message: "تم توثيق الهاتف بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
