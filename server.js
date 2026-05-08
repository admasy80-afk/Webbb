require('dotenv').config();

const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const os = require('os');
const { performance } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// ⚙️ إعدادات السيرفر والحماية
// ==========================================
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' })); // خففنا الـ Payload
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
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

// 🔥 نظام Rate Limiting بسيط في الذاكرة (لا يستهلك داتا بيس)
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
            if (bucket.count > 100) return res.status(429).json({ message: "🛑 طلبات كتير.. خفف شوية" });
        }
    }
    next();
});
setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of rateLimiter.entries()) { if (now > bucket.resetAt) rateLimiter.delete(ip); }
}, 60000);

// 🔥 الكاش في الذاكرة
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

// 🔥 دوال مساعدة للحماية والطباعة
// تم تحويل الـ Logs لتطبع في الكونسول فقط بدلاً من حرق مساحة MongoDB المجانية!
function logActivity(type, actor, details = {}) { console.log(`📝 [LOG] ${type} | ${actor}`, details); }
function auditLog(action, actor, ip) { console.log(`🚨 [AUDIT] ${action} by ${actor} from IP: ${ip}`); }

function hashPassword(password, salt) {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, useSalt, 10000, 64, 'sha512').toString('hex'); // خففنا الدورات لتقليل الحمل على السيرفر المجاني
    return { hash, salt: useSalt };
}
function verifyPassword(password, storedHash, storedSalt) {
    if (!storedSalt) return password === storedHash;
    const { hash } = hashPassword(password, storedSalt);
    return hash === storedHash;
}
function generateSessionToken() { return crypto.randomBytes(32).toString('hex'); }

// ==========================================
// 🚀 إعدادات قاعدة البيانات (رشيق وموفر للمساحة)
// ==========================================
let dbInstance, usersCollection, contentCollection, notificationsCollection, sessionsCollection, achievementsCollection;

async function startServer() {
    try {
        if (!process.env.MONGO_URL) throw new Error("MONGO_URL missing!");
        
        const client = new MongoClient(process.env.MONGO_URL);
        await client.connect();
        dbInstance = client.db('dahih_db');
        usersCollection = dbInstance.collection('users');
        contentCollection = dbInstance.collection('curriculum_content');
        notificationsCollection = dbInstance.collection('notifications');
        sessionsCollection = dbInstance.collection('sessions');
        achievementsCollection = dbInstance.collection('achievements');

        // 🔥 فهارس أساسية فقط لا غير! (يحل مشكلة OutOfDiskSpace)
        await Promise.all([
            usersCollection.createIndex({ email: 1 }),
            sessionsCollection.createIndex({ token: 1 }, { unique: true }),
            sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        ]).catch(e => console.log("⚠️ Index creation warning (Safe to ignore if space is tight):", e.message));

        console.log("✅ تم الاتصال بمونجو.. السيرفر الخفيف جاهز!");
        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
    } catch (err) {
        console.error("❌ فشل الاتصال:", err); process.exit(1);
    }
}
startServer();

// ==========================================
// 🛡️ Middlewares
// ==========================================
function ensureDB(req, res, next) {
    if (!usersCollection) return res.status(503).json({ message: "السيرفر لسه بيسخن" });
    next();
}

async function validateSession(req, res, next) {
    try {
        const token = req.body.sessionToken || req.headers['x-session-token'];
        if (!token) return next();
        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (session) {
            req.session = session;
            sessionsCollection.updateOne({ token }, { $set: { lastActivity: new Date() } }); // Non-blocking
        }
        next();
    } catch (e) { next(); }
}

async function requireAdmin(req, res, next) {
    try {
        const token = req.body.sessionToken || req.headers['x-session-token'] || req.headers.authorization;
        if (!token) return res.status(401).json({ message: "تسجيل الدخول مطلوب" });

        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (!session || (session.role !== 'dev' && session.role !== 'owner')) {
            auditLog('unauthorized_admin', session?.email || 'unknown', req.ip);
            return res.status(403).json({ message: "غير مصرح لك" });
        }
        req.adminSession = session; 
        next();
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
}

// ==========================================
// 1️⃣ مسارات الدخول والتسجيل
// ==========================================
app.post('/api/saveUser', ensureDB, async (req, res) => {
    try {
        const data = req.body;
        const DEV_EMAIL = process.env.DEV_EMAIL || "nullbrodidyouknow@gmail.com";
        const DEV_PASS = process.env.DEV_PASSWORD || "T9@qL7!zR4#pX2vK8";
        const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@owner.com";
        const OWNER_PASS = process.env.OWNER_PASSWORD || "123456asdW#";

        if ((data.identifier === DEV_EMAIL && data.password === DEV_PASS) || 
            (data.identifier === OWNER_EMAIL && data.password === OWNER_PASS)) {
            
            const userRole = data.identifier === DEV_EMAIL ? "dev" : "owner";
            const token = generateSessionToken();
            await sessionsCollection.insertOne({ token, email: data.identifier, role: userRole, expiresAt: new Date(Date.now() + 7 * 24 * 3600000) });
            return res.status(200).json({ message: "أهلاً بالإدارة", userData: { role: userRole, email: data.identifier }, sessionToken: token });
        }

        if (data.identifier) {
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });
            if (!user) return res.status(401).json({ message: "خطأ في البيانات" });
            if (user.banned) return res.status(403).json({ message: "حسابك موقوف" });

            const passwordMatch = user.passwordSalt ? verifyPassword(data.password, user.password, user.passwordSalt) : user.password === data.password;
            if (!passwordMatch) return res.status(401).json({ message: "خطأ في البيانات" });

            const today = new Date().toDateString();
            const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate).toDateString() : null;
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            let newStreak = user.loginStreak || 0;
            if (lastLogin !== today) newStreak = (lastLogin === yesterday) ? newStreak + 1 : 1;

            await usersCollection.updateOne({ _id: user._id }, { $set: { lastLoginDate: new Date(), loginStreak: newStreak }, $inc: { xp: 5 } });
            
            const token = generateSessionToken();
            await sessionsCollection.insertOne({ token, email: user.email, role: 'student', expiresAt: new Date(Date.now() + 7 * 24 * 3600000) });

            return res.status(200).json({ message: "تم الدخول", userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", email: user.email, role: "student", points: user.points || 0, streak: newStreak }, sessionToken: token });
        }

        if (data.first_name) {
            if (!data.email || !data.password) return res.status(400).json({ message: "بيانات ناقصة" });
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
            if (existing) return res.status(400).json({ message: "مسجل مسبقاً" });

            const { hash, salt } = hashPassword(data.password);
            data.password = hash; data.passwordSalt = salt;
            data.status = "pending"; data.role = "student"; data.points = 0; data.xp = 0; data.createdAt = new Date();

            await usersCollection.insertOne(data);
            return res.status(200).json({ message: "تم التسجيل بنجاح", userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, role: "student" } });
        }
        res.status(400).json({ message: "طلب غير صالح" });
    } catch (e) { res.status(500).json({ message: "حدث خطأ" }); }
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة (محمية)
// ==========================================
app.post('/api/admin/stats', ensureDB, requireAdmin, async (req, res) => {
    try {
        const cached = getCache('admin_stats');
        if (cached) return res.status(200).json(cached);

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        const result = { studentsCount, pendingCount };
        
        setCache('admin_stats', result, 30000);
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
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

// ==========================================
// 3️⃣ مسارات الطالب
// ==========================================
app.post('/api/check-status', ensureDB, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.body.email });
        if (user) {
            if(user.banned) return res.status(200).json({ status: "banned", reason: user.banReason });
            res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        } else res.status(404).json({ message: "حساب غير موجود" });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', ensureDB, validateSession, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.body.email });
        const content = await contentCollection.findOne({ grade: req.body.grade }) || { points: [], questions: [], tests: [] };
        res.status(200).json({ studentPoints: user ? (user.points || 0) : 0, content, user: { name: user?.first_name, streak: user?.loginStreak || 0 } });
    } catch (e) { res.status(500).json({ message: "خطأ" }); }
});

// 🔥 تنظيف الجلسات المنتهية
setInterval(() => { if (sessionsCollection) sessionsCollection.deleteMany({ expiresAt: { $lt: new Date() } }); }, 3600000);

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

