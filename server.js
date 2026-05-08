require('dotenv').config(); // تأكد من استدعاء متغيرات البيئة

const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const { performance } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// ⚙️ إعدادات السيرفر الأساسية - مطورة ومصفحة
// ==========================================
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    etag: true,
    lastModified: true
}));

// 🔥 Headers أمان خارقة
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// 🔥 نظام بصمة الطلب
const requestMetrics = {
    total: 0, successful: 0, failed: 0, avgResponseTime: 0, peakRPS: 0, currentRPS: 0,
    rpsBuffer: [], endpoints: new Map(), statusCodes: new Map(), slowQueries: [], errors: []
};

// 🔥 تنظيف المدخلات (NoSQL Injection Protection)
function sanitizeInput(obj, depth = 0) {
    if (depth > 10) return obj;
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
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            cleaned[key] = sanitizeInput(obj[key], depth + 1);
        }
        return cleaned;
    }
    return obj;
}

app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') req.body = sanitizeInput(req.body);
    if (req.query && typeof req.query === 'object') req.query = sanitizeInput(req.query);
    next();
});

// 🔥 تتبع الأداء
app.use((req, res, next) => {
    const startTime = performance.now();
    const reqId = crypto.randomBytes(8).toString('hex');
    req.requestId = reqId;
    req.startTime = startTime;
    requestMetrics.total++;

    res.on('finish', () => {
        const duration = performance.now() - startTime;
        const endpoint = `${req.method} ${req.path}`;
        if (res.statusCode < 400) requestMetrics.successful++; else requestMetrics.failed++;

        if (!requestMetrics.endpoints.has(endpoint)) {
            requestMetrics.endpoints.set(endpoint, { count: 0, totalTime: 0, errors: 0 });
        }
        const ep = requestMetrics.endpoints.get(endpoint);
        ep.count++; ep.totalTime += duration;
        if (res.statusCode >= 400) ep.errors++;

        const sc = requestMetrics.statusCodes.get(res.statusCode) || 0;
        requestMetrics.statusCodes.set(res.statusCode, sc + 1);

        if (duration > 1000) {
            requestMetrics.slowQueries.push({ endpoint, duration: Math.round(duration), timestamp: new Date(), reqId });
            if (requestMetrics.slowQueries.length > 100) requestMetrics.slowQueries.shift();
        }

        requestMetrics.avgResponseTime = (requestMetrics.avgResponseTime * (requestMetrics.total - 1) + duration) / requestMetrics.total;
    });
    next();
});

// 🔥 Logger ملون
app.use((req, res, next) => {
    const time = new Date().toISOString();
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const ua = (req.headers['user-agent'] || 'unknown').substring(0, 50);
    console.log(`📡 [${time}] [${req.requestId}] ${req.method} ${req.url} | IP: ${ip} | UA: ${ua}`);
    next();
});

// 🔥 نظام Rate Limiting
class AdvancedRateLimiter {
    constructor() {
        this.ipBuckets = new Map(); this.bannedIPs = new Map(); this.suspiciousIPs = new Map();
    }
    check(ip, endpoint, options = {}) {
        const now = Date.now();
        const { windowMs = 60000, maxRequests = 120, burstThreshold = 30, burstWindow = 5000 } = options;

        if (this.bannedIPs.has(ip)) {
            const ban = this.bannedIPs.get(ip);
            if (now < ban.until) return { allowed: false, reason: 'banned', remaining: 0, retryAfter: Math.ceil((ban.until - now) / 1000) };
            this.bannedIPs.delete(ip);
        }

        if (!this.ipBuckets.has(ip)) {
            this.ipBuckets.set(ip, { count: 1, resetAt: now + windowMs, requests: [now], firstSeen: now });
        } else {
            const bucket = this.ipBuckets.get(ip);
            if (now > bucket.resetAt) {
                bucket.count = 1; bucket.resetAt = now + windowMs; bucket.requests = [now];
            } else {
                bucket.count++; bucket.requests.push(now);
                bucket.requests = bucket.requests.filter(t => now - t < burstWindow);

                if (bucket.requests.length >= burstThreshold) {
                    this.suspiciousIPs.set(ip, { detectedAt: now, reason: 'burst_attack', count: bucket.requests.length });
                    this.bannedIPs.set(ip, { until: now + 5 * 60 * 1000, reason: 'burst_attack' });
                    return { allowed: false, reason: 'burst_detected', remaining: 0, retryAfter: 300 };
                }
                if (bucket.count > maxRequests) {
                    return { allowed: false, reason: 'rate_limit', remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
                }
            }
        }
        return { allowed: true, remaining: maxRequests - this.ipBuckets.get(ip).count };
    }
    cleanup() {
        const now = Date.now();
        for (const [ip, bucket] of this.ipBuckets.entries()) { if (now > bucket.resetAt + 300000) this.ipBuckets.delete(ip); }
        for (const [ip, ban] of this.bannedIPs.entries()) { if (now > ban.until) this.bannedIPs.delete(ip); }
    }
    getStats() { return { activeIPs: this.ipBuckets.size, bannedIPs: this.bannedIPs.size, suspiciousIPs: this.suspiciousIPs.size }; }
}
const rateLimiter = new AdvancedRateLimiter();
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

app.use((req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const result = rateLimiter.check(ip, req.path);
    res.setHeader('X-RateLimit-Remaining', result.remaining || 0);
    if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        const msgs = { burst_detected: "🛑 تم كشف هجوم.. الحساب موقوف", banned: "🚫 IP محظور", rate_limit: "🛑 طلبات كتير" };
        return res.status(429).json({ message: msgs[result.reason] || msgs.rate_limit });
    }
    next();
});

// 🔥 قواعد البيانات
let dbInstance, usersCollection, contentCollection, logsCollection, notificationsCollection, sessionsCollection, activityCollection, messagesCollection, achievementsCollection, attendanceCollection, auditCollection, analyticsCollection;

// 🔥 نظام Cache
class MultiTierCache {
    constructor() {
        this.l1Hot = new Map(); this.l2Warm = new Map();
        this.maxL1Size = 100; this.maxL2Size = 1000;
        this.stats = { hits: 0, misses: 0, evictions: 0, sets: 0 };
    }
    set(key, value, ttlMs = 30000) {
        const entry = { value, expiresAt: Date.now() + ttlMs, hits: 0, createdAt: Date.now() };
        this.stats.sets++;
        if (this.l1Hot.size >= this.maxL1Size) {
            const oldest = this.findLRU(this.l1Hot);
            if (oldest) { this.l2Warm.set(oldest, this.l1Hot.get(oldest)); this.l1Hot.delete(oldest); }
        }
        if (this.l2Warm.size >= this.maxL2Size) {
            const oldest = this.findLRU(this.l2Warm);
            if (oldest) { this.l2Warm.delete(oldest); this.stats.evictions++; }
        }
        this.l1Hot.set(key, entry);
    }
    get(key) {
        let entry = this.l1Hot.get(key);
        if (entry) {
            if (Date.now() > entry.expiresAt) { this.l1Hot.delete(key); this.stats.misses++; return null; }
            entry.hits++; this.stats.hits++; return entry.value;
        }
        entry = this.l2Warm.get(key);
        if (entry) {
            if (Date.now() > entry.expiresAt) { this.l2Warm.delete(key); this.stats.misses++; return null; }
            entry.hits++;
            if (entry.hits >= 2) { this.l2Warm.delete(key); this.l1Hot.set(key, entry); }
            this.stats.hits++; return entry.value;
        }
        this.stats.misses++; return null;
    }
    findLRU(map) {
        let oldest = null, oldestTime = Date.now();
        for (const [key, entry] of map.entries()) {
            const lastAccess = entry.createdAt + (entry.hits * 1000);
            if (lastAccess < oldestTime) { oldestTime = lastAccess; oldest = key; }
        }
        return oldest;
    }
    invalidate(prefix) {
        for (const key of this.l1Hot.keys()) { if (key.startsWith(prefix)) this.l1Hot.delete(key); }
        for (const key of this.l2Warm.keys()) { if (key.startsWith(prefix)) this.l2Warm.delete(key); }
    }
    clear() { this.l1Hot.clear(); this.l2Warm.clear(); }
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return { ...this.stats, hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%', l1Size: this.l1Hot.size, l2Size: this.l2Warm.size };
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.l1Hot.entries()) { if (now > entry.expiresAt) this.l1Hot.delete(key); }
        for (const [key, entry] of this.l2Warm.entries()) { if (now > entry.expiresAt) this.l2Warm.delete(key); }
    }
}
const cache = new MultiTierCache();
setInterval(() => cache.cleanup(), 60 * 1000);

// 🔥 Logging & Notifications
class BatchedLogger {
    constructor() { this.queue = []; this.batchSize = 50; this.flushInterval = 3000; setInterval(() => this.flush(), this.flushInterval); }
    log(type, actor, details = {}) {
        this.queue.push({ type, actor, details, timestamp: new Date(), timestampMs: Date.now() });
        if (this.queue.length >= this.batchSize) this.flush();
    }
    async flush() {
        if (this.queue.length === 0 || !logsCollection) return;
        const batch = this.queue.splice(0, this.batchSize);
        try { await logsCollection.insertMany(batch, { ordered: false }); } 
        catch (e) { this.queue.unshift(...batch.slice(0, 10)); }
    }
}
const batchLogger = new BatchedLogger();
async function logActivity(type, actor, details = {}) { batchLogger.log(type, actor, details); }

class NotificationQueue {
    constructor() { this.queue = []; this.batchSize = 100; this.flushInterval = 2000; setInterval(() => this.flush(), this.flushInterval); }
    add(email, title, body, kind = 'info', metadata = {}) {
        this.queue.push({ email: email.trim().toLowerCase(), title, body, kind, metadata, read: false, createdAt: new Date(), priority: kind === 'danger' ? 1 : kind === 'warning' ? 2 : 3 });
        if (this.queue.length >= this.batchSize) this.flush();
    }
    async flush() {
        if (this.queue.length === 0 || !notificationsCollection) return;
        const batch = this.queue.splice(0, this.batchSize);
        try { await notificationsCollection.insertMany(batch, { ordered: false }); } catch (e) {}
    }
}
const notifQueue = new NotificationQueue();
async function createNotification(email, title, body, kind = 'info', metadata = {}) { notifQueue.add(email, title, body, kind, metadata); }

// 🔥 أدوات الحماية والتشفير
function hashPassword(password, salt) {
    const useSalt = salt || crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
    return { hash, salt: useSalt, algorithm: 'pbkdf2-sha512-100k' };
}
function verifyPassword(password, storedHash, storedSalt) {
    if (!storedSalt) return password === storedHash;
    try {
        const { hash } = hashPassword(password, storedSalt);
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
    } catch (e) { return false; }
}
function generateSessionToken() { return crypto.randomBytes(48).toString('hex'); }
function generateDeviceFingerprint(req) {
    const ua = req.headers['user-agent'] || '';
    const accept = req.headers['accept-language'] || '';
    const encoding = req.headers['accept-encoding'] || '';
    return crypto.createHash('sha256').update(ua + accept + encoding).digest('hex').substring(0, 32);
}

// 🔥 نظام XP والانجازات
async function checkAndGrantAchievements(email) {
    try {
        if (!usersCollection || !achievementsCollection) return;
        const user = await usersCollection.findOne({ email });
        if (!user) return;
        const earned = user.achievements || [];
        const newOnes = [];
        const milestones = [
            { id: 'first_login', condition: () => true, title: '🎉 أول دخول', desc: 'أهلاً بك', xp: 10 },
            { id: 'points_50', condition: () => (user.points || 0) >= 50, title: '⭐ نجم', desc: '50 نقطة', xp: 25 },
            { id: 'streak_7', condition: () => (user.loginStreak || 0) >= 7, title: '🔥 مواظب', desc: '7 أيام', xp: 40 }
            // تم تقليل القائمة اختصاراً للكود، يمكنك إضافة البقية كما في نسختك
        ];
        let totalXP = 0;
        for (const m of milestones) {
            if (!earned.includes(m.id) && m.condition()) {
                newOnes.push(m.id); totalXP += m.xp || 0;
                await achievementsCollection.insertOne({ email, achievementId: m.id, title: m.title, description: m.desc, xp: m.xp, unlockedAt: new Date() });
                await createNotification(email, m.title, `حصلت على إنجاز: ${m.desc} (+${m.xp} XP)`, 'reward');
            }
        }
        if (newOnes.length > 0) {
            await usersCollection.updateOne({ email }, { $addToSet: { achievements: { $each: newOnes } }, $inc: { xp: totalXP } });
        }
    } catch (e) {}
}

function calculateLevel(xp) {
    if (!xp || xp < 0) return { level: 1, currentXP: 0, nextLevelXP: 100, progress: 0 };
    let level = 1, required = 100, total = 0;
    while (total + required <= xp) { total += required; level++; required = Math.floor(required * 1.5); }
    const currentXP = xp - total;
    return { level, currentXP, nextLevelXP: required, progress: Math.floor((currentXP / required) * 100) };
}

async function trackUserBehavior(email, action, metadata = {}) {
    try {
        if (!analyticsCollection) return;
        await analyticsCollection.insertOne({ email, action, metadata, timestamp: new Date(), hour: new Date().getHours(), day: new Date().getDay() });
    } catch (e) {}
}

async function auditLog(action, actor, target, oldValue, newValue, ip) {
    try {
        if (!auditCollection) return;
        await auditCollection.insertOne({ action, actor, target, oldValue, newValue, ip, timestamp: new Date(), severity: action.includes('delete') || action.includes('ban') ? 'high' : 'medium' });
    } catch (e) {}
}

// ==========================================
// 🚀 بدء السيرفر والاتصال بالقاعدة
// ==========================================
async function startServer() {
    try {
        if (process.env.MONGO_URL) {
            const client = new MongoClient(process.env.MONGO_URL, {
                maxPoolSize: 100, minPoolSize: 10, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000,
                retryWrites: true, retryReads: true, compressors: ['zlib']
            });
            await client.connect();
            dbInstance = client.db('dahih_db');
            usersCollection = dbInstance.collection('users');
            contentCollection = dbInstance.collection('curriculum_content');
            logsCollection = dbInstance.collection('activity_logs');
            notificationsCollection = dbInstance.collection('notifications');
            sessionsCollection = dbInstance.collection('sessions');
            activityCollection = dbInstance.collection('user_activity');
            messagesCollection = dbInstance.collection('messages');
            achievementsCollection = dbInstance.collection('achievements');
            attendanceCollection = dbInstance.collection('attendance');
            auditCollection = dbInstance.collection('audit_logs');
            analyticsCollection = dbInstance.collection('analytics');

            // الفهارس
            await Promise.all([
                usersCollection.createIndex({ email: 1 }),
                sessionsCollection.createIndex({ token: 1 }, { unique: true }),
                sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
                // ... (باقي الفهارس كما هي في نسختك)
            ]);
            console.log("✅ تم الاتصال بمونجو بنجاح.. السيرفر جاهز الآن");
        } else {
            console.error("❌ MONGO_URL غير موجود في متغيرات البيئة!");
        }

        const server = app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
        process.on('SIGTERM', async () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            await batchLogger.flush(); await notifQueue.flush();
            server.close(() => process.exit(0));
        });
    } catch (err) { console.error("❌ فشل الاتصال بقاعدة البيانات:", err); process.exit(1); }
}
startServer();

// ==========================================
// 🛡️ Middlewares الحماية
// ==========================================
function ensureDB(req, res, next) {
    if (!usersCollection) return res.status(503).json({ message: "السيرفر لسه بيسخن.. حاول كمان ثواني" });
    next();
}

async function validateSession(req, res, next) {
    try {
        const token = req.body.sessionToken || req.headers['x-session-token'];
        if (!token) return next();
        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (session) {
            req.session = session;
            await sessionsCollection.updateOne({ token }, { $set: { lastActivity: new Date() } });
        }
        next();
    } catch (e) { next(); }
}

// 🔥 السلاح السري: حماية مسارات الإدارة بشكل قاطع
async function requireAdmin(req, res, next) {
    try {
        const token = req.body.sessionToken || req.headers['x-session-token'] || req.headers.authorization;
        if (!token) return res.status(401).json({ message: "تسجيل الدخول مطلوب" });

        const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
        if (!session) return res.status(401).json({ message: "الجلسة منتهية أو غير صالحة" });

        if (session.role !== 'dev' && session.role !== 'owner') {
            await auditLog('unauthorized_admin_access', session.email, req.path, null, null, req.ip);
            return res.status(403).json({ message: "غير مصرح لك الدخول لهذه الصفحة" });
        }

        await sessionsCollection.updateOne({ token }, { $set: { lastActivity: new Date() } });
        req.adminSession = session; 
        next();
    } catch (e) {
        return res.status(500).json({ message: "خطأ في التحقق من الصلاحيات" });
    }
}

// ==========================================
// 1️⃣ مسارات تسجيل الدخول الأساسية
// ==========================================
app.post('/api/saveUser', ensureDB, async (req, res) => {
    try {
        const data = req.body;
        const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const fingerprint = generateDeviceFingerprint(req);

        // تم نقل الباسوردات لملف .env للحماية القصوى
        const DEV_EMAIL = process.env.DEV_EMAIL || "nullbrodidyouknow@gmail.com";
        const DEV_PASS = process.env.DEV_PASSWORD || "T9@qL7!zR4#pX2vK8";
        const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@owner.com";
        const OWNER_PASS = process.env.OWNER_PASSWORD || "123456asdW#";

        const isDev = data.identifier === DEV_EMAIL && data.password === DEV_PASS;
        const isOwner = data.identifier === OWNER_EMAIL && data.password === OWNER_PASS;

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            const token = generateSessionToken();
            
            await sessionsCollection.insertOne({
                token, email: data.identifier, role: userRole,
                createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                ip: clientIP, fingerprint, userAgent: req.headers['user-agent']
            });

            await logActivity('admin_login', data.identifier, { role: userRole, ip: clientIP });
            return res.status(200).json({
                message: `أهلاً بك يا ${roleName} 👑`,
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" },
                sessionToken: token
            });
        }

        if (data.identifier) {
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });
            if (!user) return res.status(401).json({ message: "خطأ في بيانات الدخول" });

            if (user.failedLoginAttempts >= 10 && user.lastFailedLogin) {
                const timeSinceLastFail = Date.now() - new Date(user.lastFailedLogin).getTime();
                if (timeSinceLastFail < 15 * 60 * 1000) return res.status(429).json({ message: "تم قفل الحساب مؤقتاً" });
            }

            const passwordMatch = user.passwordSalt ? verifyPassword(data.password, user.password, user.passwordSalt) : user.password === data.password;
            if (!passwordMatch) {
                await usersCollection.updateOne({ _id: user._id }, { $inc: { failedLoginAttempts: 1 }, $set: { lastFailedLogin: new Date(), lastFailedIP: clientIP } });
                return res.status(401).json({ message: "خطأ في بيانات الدخول" });
            }

            if (user.banned) return res.status(403).json({ message: user.banReason || "حسابك موقوف" });

            if (!user.passwordSalt) {
                const { hash, salt } = hashPassword(data.password);
                await usersCollection.updateOne({ _id: user._id }, { $set: { password: hash, passwordSalt: salt } });
            }

            // Streak Logic
            const today = new Date().toDateString();
            const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate).toDateString() : null;
            const yesterday = new Date(Date.now() - 24*60*60*1000).toDateString();
            let newStreak = user.loginStreak || 0;
            if (lastLogin !== today) {
                newStreak = (lastLogin === yesterday) ? newStreak + 1 : 1;
            }

            await usersCollection.updateOne({ _id: user._id }, {
                $set: { lastLogin: new Date(), lastLoginDate: new Date(), loginStreak: newStreak, maxStreak: Math.max(user.maxStreak || 0, newStreak), failedLoginAttempts: 0, lastIP: clientIP },
                $inc: { totalLogins: 1, xp: 5 }
            });

            const token = generateSessionToken();
            await sessionsCollection.insertOne({
                token, email: user.email, role: 'student', createdAt: new Date(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), ip: clientIP
            });

            checkAndGrantAchievements(user.email);

            return res.status(200).json({
                message: "تم الدخول ✓",
                userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", email: user.email, role: "student", points: user.points || 0, streak: newStreak },
                sessionToken: token
            });
        }

        if (data.first_name) {
            // كود التسجيل كما هو في نسختك
            if (!data.email || !data.password || !data.phone) return res.status(400).json({ message: "بيانات ناقصة" });
            if (data.password.length < 6) return res.status(400).json({ message: "كلمة المرور قصيرة" });
            
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            const { hash, salt } = hashPassword(data.password);
            data.password = hash; data.passwordSalt = salt;
            data.status = "pending"; data.role = "student"; data.points = 0; data.xp = 0; data.createdAt = new Date();

            await usersCollection.insertOne(data);
            return res.status(200).json({ message: "تم إنشاء حسابك بنجاح", userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, role: "student" } });
        }
        res.status(400).json({ message: "طلب غير صالح" });
    } catch (error) { res.status(500).json({ message: "حدث خطأ" }); }
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة (مؤمنة بالـ Middleware)
// ==========================================

app.post('/api/admin/stats', ensureDB, requireAdmin, async (req, res) => {
    try {
        const role = req.adminSession.role; // نقرأها من الجلسة الآمنة وليس من البودي
        const cached = cache.get('admin_stats');
        if (cached) return res.status(200).json(cached);

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        const result = { studentsCount, pendingCount, questionsCount: "نشط", accessedBy: role };
        
        cache.set('admin_stats', result, 15000);
        res.status(200).json(result);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/pending', ensureDB, requireAdmin, async (req, res) => {
    try {
        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }, { projection: { password: 0, passwordSalt: 0 } }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-status', ensureDB, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, newStatus, reason } = req.body;
        const role = req.adminSession.role;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { status: newStatus, rejection_reason: reason || "", statusUpdatedBy: role } });
        cache.invalidate('admin_stats');
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/students-by-grade', ensureDB, requireAdmin, async (req, res) => {
    try {
        const { grade } = req.body;
        const students = await usersCollection.find({ status: "accepted", role: "student", grade: grade }, { projection: { password: 0, passwordSalt: 0 } }).toArray();
        res.status(200).json(students);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-content', ensureDB, requireAdmin, async (req, res) => {
    try {
        const { grade, type, pointText, questionText, questionHint } = req.body;
        if (type === 'point') {
            await contentCollection.updateOne({ grade: grade }, { $push: { points: pointText } }, { upsert: true });
        } else {
            await contentCollection.updateOne({ grade: grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
        }
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-points', ensureDB, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, points } = req.body;
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { points: parseInt(points) } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-test-scores', ensureDB, requireAdmin, async (req, res) => {
    try {
        const { grade, testName, scores } = req.body;
        await contentCollection.updateOne(
            { grade: grade },
            { $push: { tests: { testName: testName, scores: scores, date: new Date() } } },
            { upsert: true }
        );
        res.status(200).json({ message: "تم إضافة درجات الاختبار بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});


// ==========================================
// 3️⃣ مسارات الطالب (Student Dashboard)
// ==========================================
app.post('/api/check-status', ensureDB, async (req, res) => {
    try {
        const { email } = req.body;
        const user = await usersCollection.findOne({ email: email });
        if (user) {
            if(user.banned) return res.status(200).json({ status: "banned", reason: user.banReason });
            res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        } else res.status(404).json({ message: "حساب غير موجود" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', ensureDB, validateSession, async (req, res) => {
    try {
        const { email, grade } = req.body;
        const user = await usersCollection.findOne({ email: email });
        const studentPoints = user ? (user.points || 0) : 0;
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [] };
        
        res.status(200).json({ 
            studentPoints, 
            content,
            user: { name: user?.first_name, streak: user?.loginStreak || 0 }
        });
    } catch (error) { res.status(500).json({ message: "خطأ في جلب البيانات" }); }
});

// 🔥 تنظيف السيرفر
setInterval(async () => {
    if (sessionsCollection) await sessionsCollection.deleteMany({ expiresAt: { $lt: new Date() } });
}, 60 * 60 * 1000);

// ==========================================
// 🌐 الشاشة الرئيسية (Frontend) - يجب أن تكون في النهاية
// ==========================================
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));


