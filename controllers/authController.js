const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/db');
const {
    generateFingerprint,
    JWT_SECRET,
    JWT_ALGORITHM,
    JWT_ISSUER,
    JWT_AUDIENCE
} = require('../middleware/auth');
const { delay } = require('../utils/helpers');
const { logEvent, ACTIONS } = require('../utils/systemLog');

const TOKEN_TTL = '30d';
const BCRYPT_ROUNDS = 10;

/* ============================================================
   Helpers
   ============================================================ */

const signToken = (payload) =>
    jwt.sign(payload, JWT_SECRET, {
        algorithm: JWT_ALGORITHM,
        expiresIn: TOKEN_TTL,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });

/**
 * يتحقق من صحة كلمة المرور.
 * - لو الـ hash المخزّن يبدأ بـ $2 (bcrypt) → bcrypt.compare العادي.
 * - لو الـ hash هو نص واضح (legacy)        → يقارن نصيًا، وإن نجحت يرقّيها إلى bcrypt تلقائيًا.
 *
 * هذه الترقية التلقائية تسمح بتنظيف قاعدة البيانات تدريجيًا بدون كسر أي حساب قديم.
 */
async function verifyAndUpgradePassword(usersCollection, user, plain) {
    const stored = user.password || '';
    const looksHashed = typeof stored === 'string' && stored.startsWith('$2');

    if (looksHashed) {
        return bcrypt.compare(plain, stored);
    }

    // Legacy plaintext — مقارنة آمنة بطول ثابت لمنع timing attacks.
    const a = Buffer.from(String(stored));
    const b = Buffer.from(String(plain));
    if (a.length !== b.length) return false;

    const crypto = require('crypto');
    const ok = crypto.timingSafeEqual(a, b);
    if (!ok) return false;

    // ترقية فورية للـ bcrypt + علم passwordUpgradedAt للتتبع.
    try {
        const fresh = await bcrypt.hash(plain, BCRYPT_ROUNDS);
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { password: fresh, passwordUpgradedAt: new Date() } }
        );
    } catch (_) {
        // فشل الترقية لا يجب أن يمنع الدخول — نسجّل فقط.
    }
    return true;
}

const buildStudentResponse = (user, token) => ({
    message: 'تم الدخول ✓',
    token,
    userData: {
        name: user.first_name,
        grade: user.grade,
        status: user.status || 'pending',
        email: user.email,
        phone: user.phone,
        role: 'student',
        phoneVerified: user.phoneVerified || false
    }
});

/* ============================================================
   Admin / Owner login (env-based)
   ============================================================ */

async function tryAdminLogin(identifier, password, fingerprint) {
    const { DEV_EMAIL, DEV_PASSWORD_HASH, OWNER_EMAIL, OWNER_PASSWORD_HASH } = process.env;

    let userRole = null;
    let roleName = null;

    if (identifier === DEV_EMAIL && DEV_PASSWORD_HASH && (await bcrypt.compare(password, DEV_PASSWORD_HASH))) {
        userRole = 'dev';
        roleName = 'المطور';
    } else if (identifier === OWNER_EMAIL && OWNER_PASSWORD_HASH && (await bcrypt.compare(password, OWNER_PASSWORD_HASH))) {
        userRole = 'owner';
        roleName = 'مستر';
    }

    if (!userRole) return null;

    const token = signToken({ email: identifier, role: userRole, fingerprint });
    return {
        message: `أهلاً بك يا ${roleName} 👑`,
        token,
        userData: {
            name: roleName,
            role: userRole,
            email: identifier,
            status: 'accepted',
            grade: 'إدارة المنصة'
        }
    };
}

/* ============================================================
   Core handlers
   ============================================================ */

exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body || {};
        if (!identifier || !password) {
            return res.status(400).json({ message: 'بيانات غير مكتملة.', code: 'MISSING_FIELDS' });
        }

        const db = getDb();
        const usersCollection = db.collection('users');
        const fingerprint = generateFingerprint(req);

        // 1) Admin / Owner
        const adminResp = await tryAdminLogin(identifier, password, fingerprint);
        if (adminResp) {
            logEvent(req, { action: ACTIONS.LOGIN, details: `دخول الإدارة (${identifier})`, actor: identifier, role: adminResp.userData.role, status: 'success' });
            return res.status(200).json(adminResp);
        }

        // 2) Student
        const user = await usersCollection.findOne({
            $or: [{ email: identifier }, { phone: identifier }]
        });

        if (user && (await verifyAndUpgradePassword(usersCollection, user, password))) {
            if (user.status !== 'accepted') {
                logEvent(req, { action: ACTIONS.LOGIN_FAILED, details: `محاولة دخول لحساب غير مفعّل (${identifier})`, actor: identifier, status: 'warning' });
                return res.status(403).json({
                    message: 'الحساب قيد المراجعة أو مرفوض.',
                    code: 'ACCOUNT_NOT_ACTIVE'
                });
            }
            const token = signToken({ email: user.email, role: 'student', fingerprint });
            logEvent(req, { action: ACTIONS.LOGIN, details: `دخول الطالب ${user.email}`, actor: user.email, role: 'student', status: 'success' });
            return res.status(200).json(buildStudentResponse(user, token));
        }

        // فشل — تأخير ثابت لمقاومة هجمات التعداد.
        logEvent(req, { action: ACTIONS.LOGIN_FAILED, details: `بيانات دخول خاطئة (${identifier})`, actor: identifier, status: 'warning' });
        await delay(1500);
        return res.status(401).json({ message: 'خطأ في بيانات الدخول', code: 'INVALID_CREDENTIALS' });
    } catch (error) {
        return res.status(500).json({ message: 'حدث خطأ داخلي', code: 'INTERNAL_ERROR' });
    }
};

exports.register = async (req, res) => {
    try {
        const data = req.body || {};
        if (!data.first_name || !data.email || !data.password) {
            return res.status(400).json({ message: 'بيانات غير مكتملة.', code: 'MISSING_FIELDS' });
        }

        const db = getDb();
        const usersCollection = db.collection('users');
        const fingerprint = generateFingerprint(req);

        const existing = await usersCollection.findOne({
            $or: [{ email: data.email }, { phone: data.phone }]
        });
        if (existing) {
            return res.status(400).json({
                message: 'البريد أو الهاتف مسجل بالفعل',
                code: 'ALREADY_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        const newUser = {
            ...data,
            password: hashedPassword,
            status: 'pending',
            role: 'student',
            points: 0,
            // نظام الرصيد والاشتراك — تُدار بالكامل من قاعدة البيانات
            balance: 0,
            subscriptionStart: null,
            subscriptionEnd: null,
            codesUsedCount: 0,
            avatar: null,
            phoneVerified: false,
            createdAt: new Date()
        };
        await usersCollection.insertOne(newUser);

        logEvent(req, { action: ACTIONS.REGISTER, details: `حساب جديد: ${data.email} (${data.grade || '—'})`, actor: data.email, role: 'student', status: 'success' });

        const token = signToken({ email: data.email, role: 'student', fingerprint });
        return res.status(200).json({
            message: 'تم إنشاء حساب بنجاح',
            token,
            userData: {
                name: data.first_name,
                grade: data.grade,
                status: 'pending',
                email: data.email,
                phone: data.phone,
                role: 'student',
                phoneVerified: false
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'حدث خطأ داخلي', code: 'INTERNAL_ERROR' });
    }
};

/**
 * Backward-compatible orchestrator.
 * - data.identifier  → login
 * - data.first_name  → register
 * - غير ذلك          → 400
 *
 * يبقي الـ frontend القديم (/api/saveUser) شغّال ب��ون تعديل.
 */
exports.saveUser = async (req, res) => {
    const data = req.body || {};
    if (data.identifier) return exports.login(req, res);
    if (data.first_name) return exports.register(req, res);
    return res.status(400).json({ message: 'بيانات غير مكتملة.', code: 'MISSING_FIELDS' });
};

/**
 * Logout — JWT stateless، فلا يوجد session نلغيه على السيرفر.
 * نرد 200 ليتمكن العميل من مسح الـ localStorage بأمان دون أخطاء 404.
 *
 * (لو احتجنا لاحقًا blacklist للتوكنات، نضيفه هنا في collection خاص.)
 */
exports.logout = async (req, res) => {
    const actor = (req.user && req.user.email) || (req.body && req.body.email) || 'مستخدم';
    logEvent(req, { action: ACTIONS.LOGOUT, details: `تسجيل خروج (${actor})`, actor, status: 'info' });
    return res.status(200).json({ message: 'تم تسجيل الخروج', code: 'OK' });
};

exports.verifySession = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'انتهت صلاحية الجلسة.', code: 'TOKEN_INVALID' });
        }
        const userRole = req.user.role;
        const userEmail = req.user.email;
        const db = getDb();

        if (userRole === 'dev' || userRole === 'owner') {
            return res.status(200).json({
                message: 'تم التحقق',
                redirectTo: '/admin.html',
                role: userRole
            });
        }

        const student = await db.collection('users').findOne({ email: userEmail });
        if (!student) {
            return res.status(401).json({ message: 'الحساب غير موجود.', code: 'ACCOUNT_NOT_FOUND' });
        }

        if (student.status === 'pending' || student.status === 'rejected') {
            return res.status(200).json({
                message: 'حساب غير مفعل',
                redirectTo: '/status.html',
                role: userRole
            });
        }

        return res.status(200).json({
            message: 'تم التحقق من الجلسة بنجاح.',
            redirectTo: '/student/',
            role: userRole
        });
    } catch (error) {
        return res.status(500).json({ message: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
    }
};
