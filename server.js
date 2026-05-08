require('dotenv').config();

const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// ⚙️ إعدادات السيرفر والحماية الأساسية
// ==========================================
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' })); 
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

// 🔥 Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// 🔥 تنظيف المدخلات (NoSQL Injection Protection)
function sanitizeInput(obj, depth = 0) {
    if (depth > 5) return obj;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        if (/^\$/.test(obj) || /\.\$/.test(obj)) return obj.replace(/^\$/, '_').replace(/\.\$/g, '._');
        return obj;
    }
    if (Array.isArray(obj)) return obj.map(item => sanitizeInput(item, depth + 1));
    if (typeof obj === 'object') {
        const cleaned = {};
        for (const key of Object.keys(obj)) {
            if (key.startsWith('$') || key.includes('.')) continue;
            cleaned[key] = sanitizeInput(obj[key], depth + 1);
        }
        return cleaned;
    }
    return obj;
}

app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') req.body = sanitizeInput(req.body);
    next();
});

// 🔥 أدوات التشفير والتوكن
function generateSessionToken() { return crypto.randomBytes(48).toString('hex'); }
function hashPassword(password, salt) {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, useSalt, 10000, 64, 'sha512').toString('hex'); 
    return { hash, salt: useSalt };
}
function verifyPassword(password, storedHash, storedSalt) {
    if (!storedSalt) return password === storedHash;
    const { hash } = hashPassword(password, storedSalt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// ==========================================
// 🚀 إعدادات قاعدة البيانات (بطريقتك اللي اشتغلت 100%)
// ==========================================
let dbInstance, usersCollection, contentCollection, sessionsCollection;

async function startServer() {
    try {
        // استخدمنا طريقتك بالنص اللي نفعت مع Railway
        const uri = process.env.MONGO_URL || "mongodb://mongo:iWteUaeFERklPvvTTVixFSuaHHfoUlMw@turntable.proxy.rlwy.net:21742";
        
        if (uri) {
            const client = new MongoClient(uri);
            await client.connect();
            dbInstance = client.db('dahih_db');
            usersCollection = dbInstance.collection('users');
            contentCollection = dbInstance.collection('curriculum_content');
            sessionsCollection = dbInstance.collection('sessions');
            console.log("✅ تم الاتصال بمونجو بنجاح.. السيرفر جاهز ومأمن الآن 🛡️");
        } else {
            console.error("❌ الرابط غير موجود!");
        }

        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));  
    } catch (err) {  
        console.error("❌ فشل الاتصال بقاعدة البيانات:", err);  
        process.exit(1);  
    }
}
startServer();

// ==========================================
// 🛡️ Middlewares التحقق (حراس الأمن)
// ==========================================
function ensureDB(req, res, next) {
    if (!usersCollection) return res.status(503).json({ message: "السيرفر لسه بيسخن.. حاول كمان ثواني" });
    next();
}

async function requireAdmin(req, res, next) {
    try {
        const token = req.body.sessionToken || req.headers['x-session-token'];
        if (!token) return res.status(401).json({ message: "تسجيل الدخول مطلوب.. التوكن مفقود" });

        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (!session || (session.role !== 'dev' && session.role !== 'owner')) {
            return res.status(403).json({ message: "غير مصرح لك بالدخول للإدارة" });
        }
        req.adminSession = session; 
        next();
    } catch (e) { res.status(500).json({ message: "خطأ داخلي" }); }
}

async function requireAuth(req, res, next) {
    try {
        const token = req.body.sessionToken || req.headers['x-session-token'];
        if (!token) return res.status(401).json({ message: "الرجاء تسجيل الدخول أولاً" });

        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (!session) return res.status(401).json({ message: "انتهت صلاحية الجلسة" });
        
        req.userSession = session; 
        next();
    } catch (e) { res.status(500).json({ message: "خطأ داخلي" }); }
}

// ==========================================
// 1️⃣ مسارات الدخول والتسجيل
// ==========================================
app.post('/api/saveUser', ensureDB, async (req, res) => {
    try {
        const data = req.body;
        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            const token = generateSessionToken();
            
            await sessionsCollection.insertOne({ token, email: data.identifier, role: userRole, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 3600000) });
            
            return res.status(200).json({ 
                message: `أهلاً بك يا ${roleName} 👑`, 
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" },
                sessionToken: token 
            });
        }

        if (data.identifier) {
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });
            if (!user) return res.status(401).json({ message: "خطأ في بيانات الدخول" });
            
            const passwordMatch = user.passwordSalt ? verifyPassword(data.password, user.password, user.passwordSalt) : user.password === data.password;
            if (!passwordMatch) return res.status(401).json({ message: "خطأ في بيانات الدخول" });

            const token = generateSessionToken();
            await sessionsCollection.insertOne({ token, email: user.email, role: 'student', grade: user.grade, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 3600000) });

            return res.status(200).json({ 
                message: "تم الدخول ✓", 
                userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", reason: user.rejection_reason || "", email: user.email, role: "student", points: user.points || 0 },
                sessionToken: token
            });
        }

        if (data.first_name) {
            if (!data.email || !data.password) return res.status(400).json({ message: "بيانات ناقصة" });
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            const { hash, salt } = hashPassword(data.password);
            data.password = hash; data.passwordSalt = salt;
            data.status = "pending"; data.rejection_reason = ""; data.role = "student"; data.points = 0;
            await usersCollection.insertOne(data);
            
            return res.status(200).json({ message: "تم التسجيل بنجاح", userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, role: "student" } });
        }
        res.status(400).json({ message: "طلب غير صالح" });
    } catch (e) { res.status(500).json({ message: "حدث خطأ" }); }
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة (محمية بـ requireAdmin)
// ==========================================
app.post('/api/admin/stats', ensureDB, requireAdmin, async (req, res) => {
    try {
        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        res.status(200).json({ studentsCount, pendingCount, questionsCount: "نشط" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/pending', ensureDB, requireAdmin, async (req, res) => {
    try {
        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }, { projection: { password: 0, passwordSalt: 0 } }).toArray();
        res.status(200).json(pendingUsers);
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-status', ensureDB, requireAdmin, async (req, res) => {
    try {
        await usersCollection.updateOne({ email: req.body.studentEmail.trim() }, { $set: { status: req.body.newStatus, rejection_reason: req.body.reason || "" } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/students-by-grade', ensureDB, requireAdmin, async (req, res) => {
    try {
        const students = await usersCollection.find({ status: "accepted", role: "student", grade: req.body.grade }, { projection: { password: 0, passwordSalt: 0 } }).toArray();
        res.status(200).json(students);
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-content', ensureDB, requireAdmin, async (req, res) => {
    try {
        if (req.body.type === 'point') {
            await contentCollection.updateOne({ grade: req.body.grade }, { $push: { points: req.body.pointText } }, { upsert: true });
        } else {
            await contentCollection.updateOne({ grade: req.body.grade }, { $push: { questions: { question: req.body.questionText, hint: req.body.questionHint } } }, { upsert: true });
        }
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-points', ensureDB, requireAdmin, async (req, res) => {
    try {
        await usersCollection.updateOne({ email: req.body.studentEmail.trim() }, { $set: { points: parseInt(req.body.points) } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-test-scores', ensureDB, requireAdmin, async (req, res) => {
    try {
        await contentCollection.updateOne({ grade: req.body.grade }, { $push: { tests: { testName: req.body.testName, scores: req.body.scores, date: new Date() } } }, { upsert: true });
        res.status(200).json({ message: "تم إضافة درجات الاختبار بنجاح" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

// ==========================================
// 3️⃣ مسارات الطالب (محمية بـ requireAuth)
// ==========================================
app.post('/api/check-status', ensureDB, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.body.email });
        if (user) {
            res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        } else res.status(404).json({ message: "حساب غير موجود" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', ensureDB, requireAuth, async (req, res) => {
    try {
        const secureEmail = req.userSession.email; 
        const secureGrade = req.userSession.grade;

        const user = await usersCollection.findOne({ email: secureEmail });
        const studentPoints = user ? (user.points || 0) : 0;
        const content = await contentCollection.findOne({ grade: secureGrade }) || { points: [], questions: [], tests: [] };  
        
        res.status(200).json({ studentPoints, content });
    } catch (error) { res.status(500).json({ message: "خطأ في جلب البيانات" }); }
});

// تنظيف الجلسات القديمة للحفاظ على مساحة الداتا بيس
setInterval(async () => { 
    if (sessionsCollection) await sessionsCollection.deleteMany({ expiresAt: { $lt: new Date() } }); 
}, 3600000);

// ==========================================
// 🌐 الشاشة الرئيسية
// ==========================================
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
