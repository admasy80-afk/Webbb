require('dotenv').config();

const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// رابط الداتا بيس الخاص بك (Railway)
const MONGO_URI = process.env.MONGO_URL || "mongodb://mongo:iWteUaeFERklPvvTTVixFSuaHHfoUlMw@turntable.proxy.rlwy.net:21742";

// ==========================================
// ⚙️ إعدادات السيرفر والحماية الخارقة
// ==========================================
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' })); 
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

// 🔥 Headers حماية صارمة
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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

// 🔥 نظام Rate Limiting بسيط في الذاكرة لمنع هجمات الـ DDoS (لا يستهلك مساحة الداتا بيس)
const rateLimiter = new Map();
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (!rateLimiter.has(ip)) {
        rateLimiter.set(ip, { count: 1, resetAt: now + 60000 });
    } else {
        const bucket = rateLimiter.get(ip);
        if (now > bucket.resetAt) {
            bucket.count = 1; bucket.resetAt = now + 60000;
        } else {
            bucket.count++;
            if (bucket.count > 150) return res.status(429).json({ message: "🛑 طلبات كتير.. تم حظر الآي بي مؤقتاً" });
        }
    }
    next();
});
setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of rateLimiter.entries()) { if (now > bucket.resetAt) rateLimiter.delete(ip); }
}, 60000);

// 🔥 الكاش السريع في الذاكرة
const cache = new Map();
function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
    return entry.value;
}
function setCache(key, value, ttl = 30000) { cache.set(key, { value, expiresAt: Date.now() + ttl }); }
function clearCache(prefix) {
    for (const key of cache.keys()) { if (key.startsWith(prefix)) cache.delete(key); }
}

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
    return hash === storedHash;
}

// ==========================================
// 🚀 إعدادات قاعدة البيانات 
// ==========================================
let dbInstance, usersCollection, contentCollection, sessionsCollection;

async function startServer() {
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        dbInstance = client.db('dahih_db');
        usersCollection = dbInstance.collection('users');
        contentCollection = dbInstance.collection('curriculum_content');
        sessionsCollection = dbInstance.collection('sessions');

        // لا نقوم بإنشاء فهارس (Indexes) هنا لتجنب خطأ المساحة

        console.log("✅ تم الاتصال بمونجو Railway بنجاح.. السيرفر الخارق جاهز!");
        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
    } catch (err) {
        console.error("❌ فشل الاتصال بقاعدة البيانات:", err); process.exit(1);
    }
}
startServer();

// ==========================================
// 🛡️ Middlewares التحقق (حراس الأمن)
// ==========================================
function ensureDB(req, res, next) {
    if (!usersCollection) return res.status(503).json({ message: "السيرفر لسه بيسخن" });
    next();
}

// حارس أمن الإدارة (يمنع أي شخص من الدخول للإدارة بدون توكن حقيقي)
async function requireAdmin(req, res, next) {
    try {
        // يقبل التوكن من البودي أو الهيدر
        const token = req.body.sessionToken || req.headers['x-session-token'] || req.headers.authorization;
        if (!token) return res.status(401).json({ message: "تسجيل الدخول مطلوب.. التوكن مفقود" });

        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (!session || (session.role !== 'dev' && session.role !== 'owner')) {
            console.log(`🚨 [HACK ATTEMPT] محاولة دخول للإدارة مرفوضة من IP: ${req.ip}`);
            return res.status(403).json({ message: "غير مصرح لك" });
        }
        
        req.adminSession = session; // تمرير بيانات الأدمن للمسار
        next();
    } catch (e) { res.status(500).json({ message: "خطأ في النظام" }); }
}

// ==========================================
// 1️⃣ مسارات الدخول والتسجيل
// ==========================================
app.post('/api/saveUser', ensureDB, async (req, res) => {
    try {
        const data = req.body;
        
        // حسابات الإدارة
        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            const token = generateSessionToken();
            
            await sessionsCollection.insertOne({ 
                token, email: data.identifier, role: userRole, 
                createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 3600000) 
            });
            
            return res.status(200).json({ 
                message: `أهلاً بك يا ${roleName} 👑`, 
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" },
                sessionToken: token // 🔥 السلاح السري اللي الفرونت إند لازم يخزنه
            });
        }

        // تسجيل دخول طالب
        if (data.identifier) {
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });
            if (!user) return res.status(401).json({ message: "خطأ في بيانات الدخول" });
            
            // تحقق الباسورد
            const passwordMatch = user.passwordSalt ? verifyPassword(data.password, user.password, user.passwordSalt) : user.password === data.password;
            if (!passwordMatch) return res.status(401).json({ message: "خطأ في بيانات الدخول" });

            const token = generateSessionToken();
            await sessionsCollection.insertOne({ 
                token, email: user.email, role: 'student', 
                createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 3600000) 
            });

            return res.status(200).json({ 
                message: "تم الدخول ✓", 
                userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", reason: user.rejection_reason || "", email: user.email, role: "student", points: user.points || 0 },
                sessionToken: token
            });
        }

        // إنشاء حساب طالب جديد
        if (data.first_name) {
            if (!data.email || !data.password) return res.status(400).json({ message: "بيانات ناقصة" });
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            // تشفير الباسورد
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
// 2️⃣ مسارات لوحة الإدارة (محمية بـ requireAdmin بقوة)
// ==========================================
app.post('/api/admin/stats', ensureDB, requireAdmin, async (req, res) => {
    try {
        const cached = getCache('admin_stats');
        if (cached) return res.status(200).json(cached);

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        const result = { studentsCount, pendingCount, questionsCount: "نشط" };
        
        setCache('admin_stats', result, 15000);
        res.status(200).json(result);
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
        const { studentEmail, newStatus, reason } = req.body;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { status: newStatus, rejection_reason: reason || "" } });
        clearCache('admin_stats');
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
        const { grade, type, pointText, questionText, questionHint } = req.body;
        if (type === 'point') {
            await contentCollection.updateOne({ grade }, { $push: { points: pointText } }, { upsert: true });
        } else {
            await contentCollection.updateOne({ grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
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
// 3️⃣ مسارات الطالب
// ==========================================
app.post('/api/check-status', ensureDB, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.body.email });
        if (user) res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        else res.status(404).json({ message: "حساب غير موجود" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', ensureDB, async (req, res) => {
    try {
        const { email, grade } = req.body;
        const user = await usersCollection.findOne({ email: email });
        const studentPoints = user ? (user.points || 0) : 0;
        
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [] };  
        res.status(200).json({ studentPoints, content });
    } catch (error) { res.status(500).json({ message: "خطأ في جلب البيانات" }); }
});

// 🔥 تنظيف الجلسات المنتهية كل ساعة للحفاظ على المساحة
setInterval(async () => { 
    if (sessionsCollection) await sessionsCollection.deleteMany({ expiresAt: { $lt: new Date() } }); 
}, 3600000);

// ==========================================
// 🌐 الشاشة الرئيسية
// ==========================================
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

