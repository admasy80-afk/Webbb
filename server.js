require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs'); // لتشفير كلمات المرور
const jwt = require('jsonwebtoken'); // لحفظ الجلسات لـ 30 يوم
const helmet = require('helmet'); // لحماية الهيدرز من ثغرات الويب
const rateLimit = require('express-rate-limit'); // لمنع هجمات التخمين (Brute Force)

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dahih_super_secret_key_2026';

// ==========================================
// 🛡️ إعدادات الحماية الأساسية
// ==========================================
app.use(helmet()); // إخفاء معلومات السيرفر ومنع ثغرات XSS
app.use(express.json({ limit: '1mb' })); // تحديد حجم الـ Body لمنع إرهاق السيرفر
app.use(express.static(path.join(__dirname, 'public')));

// حماية مسار تسجيل الدخول من التخمين المستمر
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 20, // أقصى حد 20 محاولة من نفس الـ IP
    message: { message: "محاولات كثيرة جداً، يرجى المحاولة بعد 15 دقيقة." }
});

let usersCollection;

// --- [تطوير جزء قاعدة البيانات] ---
async function startServer() {
    try {
        if (process.env.MONGO_URL) {
            const client = new MongoClient(process.env.MONGO_URL);
            await client.connect();
            usersCollection = client.db('dahih_db').collection('users');
            console.log("✅ تم الاتصال بمونجو بنجاح.. السيرفر جاهز الآن ومحصن 🛡️");
        } else {
            console.error("❌ MONGO_URL غير موجود في متغيرات البيئة!");
        }

        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));  
    } catch (err) {  
        console.error("❌ فشل الاتصال بقاعدة البيانات:", err);  
        process.exit(1);  
    }
}

startServer();

// ======================================================
// 🛡️ كود التحقق السري الخاص بموقع loader.io 
// ======================================================
app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (req, res) => {
    res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4');
});

// ==========================================
// 🧹 نظام التنظيف التلقائي 
// ==========================================
setInterval(async () => {
    if (!usersCollection) return;
    try {
        const db = usersCollection.s.db;
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
// 🔒 نظام التوثيق (Middlewares) - لغلق الثغرات
// ==========================================

// 1. التحقق من التوكن (للطلاب والإدارة)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "غير مصرح لك، يرجى تسجيل الدخول" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "انتهت الجلسة، سجل دخول تاني" });
        req.user = user; // حفظ بيانات المستخدم المستخرجة من التوكن
        next();
    });
};

// 2. التحقق من صلاحيات الإدارة (للمطور والمستر فقط)
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'dev' && req.user.role !== 'owner') {
        return res.status(403).json({ message: "محاولة اختراق! غير مصرح لك." });
    }
    next();
};

// ==========================================
// 🔥 مسار التحقق التلقائي من الجلسة (Auto-Login)
// ==========================================
app.get('/api/verify-session', authenticateToken, (req, res) => {
    const userRole = req.user.role;
    
    // توجيه المستخدم حسب صلاحياته
    let redirectUrl = '/student-dashboard.html'; 
    
    if (userRole === 'dev' || userRole === 'owner') {
        redirectUrl = '/admin-dashboard.html'; 
    }

    res.status(200).json({ 
        message: "التوكن صالح", 
        redirectTo: redirectUrl,
        role: userRole 
    });
});

// ==========================================
// 1️⃣ مسارات الطلاب وتسجيل الدخول (محمية ومشفّرة)
// ==========================================
app.post('/api/saveUser', loginLimiter, async (req, res) => {
    try {
        const data = req.body;
        if (!usersCollection) return res.status(500).json({ message: "السيرفر لسه بيسخن.." });  

        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";  
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";  

        // 🟢 دخول الإدارة
        if (isDev || isOwner) {  
            const roleName = isDev ? "المطور (Null)" : "مستر";  
            const userRole = isDev ? "dev" : "owner";  
            
            // إنشاء توكن الإدارة (صالح لـ 30 يوم)
            const token = jwt.sign({ email: data.identifier, role: userRole }, JWT_SECRET, { expiresIn: '30d' });

            return res.status(200).json({   
                message: `أهلاً بك يا ${roleName} 👑`,  
                token: token,
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" }  
            });  
        }  

        // 🟢 تسجيل دخول طالب
        if (data.identifier) {  
            const user = await usersCollection.findOne({  
                $or: [{ email: data.identifier }, { phone: data.identifier }]
            });  
            
            if (user) {  
                // التحقق من الباسورد المشفر
                const validPassword = await bcrypt.compare(data.password, user.password);
                if (validPassword) {
                    // إنشاء توكن الطالب
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

        // 🟢 إنشاء حساب جديد طالب
        if (data.first_name) {  
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });  
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });  
            
            // تشفير الباسورد قبل الحفظ
            const hashedPassword = await bcrypt.hash(data.password, 10);
            
            const newUser = {
                ...data,
                password: hashedPassword, // حفظ الباسورد مشفر
                status: "pending", role: "student", points: 0, phoneVerified: false
            };

            await usersCollection.insertOne(newUser);  
            
            // إنشاء توكن للطالب الجديد
            const token = jwt.sign({ email: data.email, role: "student" }, JWT_SECRET, { expiresIn: '30d' });

            return res.status(200).json({ 
                message: "تم إنشاء حسابك بنجاح", 
                token: token,
                userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } 
            });  
        }  
    } catch (error) { res.status(500).json({ message: "حدث خطأ في السيرفر" }); }
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة (محمية بالتوكن والصلاحيات)
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
        // إزالة الباسوردات من البيانات المرسلة للفرونت اند
        const safeData = pendingUsers.map(({ password, ...rest }) => rest);
        res.status(200).json(safeData);
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
        const safeData = students.map(({ password, ...rest }) => rest);
        res.status(200).json(safeData);  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, type, pointText, questionText, questionHint } = req.body;
        const db = usersCollection.s.db;
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
        const db = usersCollection.s.db;   
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
        const db = usersCollection.s.db;
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
        const db = usersCollection.s.db;
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
        const db = usersCollection.s.db;
        const contentCollection = db.collection('curriculum_content');
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [], quizzes: [], publicQuizzes: [] };
        res.status(200).json(content);
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/delete-item', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { grade, itemType, identifier } = req.body;
        const db = usersCollection.s.db;
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
// 4️⃣ مسارات الطالب، الـ Dashboard، والاختبار العام (محمية)
// ==========================================

app.post('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        // الثغرة اتقفلت: الطالب مبقاش يقدر يستعلم عن بيانات طالب تاني بالإيميل، بنجيب إيميله من التوكن حصراً
        const email = req.user.email;
        const { grade } = req.body; 

        const user = await usersCollection.findOne({ email: email });
        const studentPoints = user ? (user.points || 0) : 0;
        
        const db = usersCollection.s.db;  
        const contentCollection = db.collection('curriculum_content');  
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [], quizzes: [] };  
        
        res.status(200).json({ studentPoints, content });  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// 🔥 جلب بيانات الاختبار العام 
app.get('/api/public/quiz', async (req, res) => {
    try {
        const { id, device } = req.query; 
        if (!id) return res.status(400).json({ message: "مفقود معرف الاختبار" });

        const db = usersCollection.s.db;
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
        // تأمين إضافي: الاعتماد على إيميل التوكن لمنع طالب من حل امتحان باسم طالب آخر
        const email = req.user.email;
        const { studentName, grade, quizId, score, percentage, visitorId, userAnswers } = req.body;
        
        const db = usersCollection.s.db;  
        const contentCollection = db.collection('curriculum_content');
        
        const resultObj = { email, studentName, score, percentage, visitorId: visitorId || null, userAnswers: userAnswers || [], date: new Date() };

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

// ==========================================
// 🔥 مسارات التحقق وتوثيق الرقم (محمية)
// ==========================================

app.post('/api/check-status', authenticateToken, async (req, res) => {
    try {
        const email = req.user.email;
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
        const email = req.user.email;
        await usersCollection.updateOne({ email: email }, { $set: { phoneVerified: true } });
        res.status(200).json({ message: "تم توثيق الهاتف بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
