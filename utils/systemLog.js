// ==========================================
// 📜 [CORE] SYSTEM EVENT LOGGER
// تسجيل كل الأحداث المهمة في قاعدة البيانات (collection: system_logs)
// ==========================================
const { getDb, logger } = require('../config/db');

/**
 * استخراج عنوان الـ IP الحقيقي للزائر مع دعم البروكسي (trust proxy مفعّل).
 */
function getClientIp(req) {
    if (!req) return 'system';
    const fwd = req.headers && req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

/**
 * تحديد هوية الفاعل (المستخدم) من التوكن أو من الجسم.
 */
function resolveActor(req, explicitActor) {
    if (explicitActor) return explicitActor;
    if (req && req.user) {
        return req.user.email || req.user.role || 'authenticated';
    }
    if (req && req.body && (req.body.identifier || req.body.email)) {
        return req.body.identifier || req.body.email;
    }
    return 'زائر';
}

/**
 * تسجيل حدث في النظام.
 * @param {object} req - كائن الطلب (يمكن أن يكون null للأحداث الداخلية)
 * @param {object} opts - { action, details, actor, status, role }
 */
async function logEvent(req, opts = {}) {
    try {
        const db = getDb();
        if (!db) return;

        const entry = {
            action: String(opts.action || 'UNKNOWN'),
            details: typeof opts.details === 'string' ? opts.details : JSON.stringify(opts.details || {}),
            actor: resolveActor(req, opts.actor),
            role: opts.role || (req && req.user && req.user.role) || 'student',
            status: opts.status || 'info', // info | success | warning | error
            ip: getClientIp(req),
            userAgent: (req && req.headers && req.headers['user-agent']) || 'unknown',
            requestId: (req && req.requestId) || null,
            createdAt: new Date()
        };

        // كتابة غير معطِّلة — لا يجب أن يوقف فشل التسجيل العملية الأساسية
        await db.collection('system_logs').insertOne(entry);
    } catch (err) {
        logger.warn({ err: err.message }, '⚠️ فشل تسجيل حدث في system_logs');
    }
}

// قائمة موحّدة بأسماء الأحداث لمنع الأخطاء الإملائية
const ACTIONS = Object.freeze({
    LOGIN: 'تسجيل دخول',
    LOGIN_FAILED: 'فشل تسجيل دخول',
    LOGOUT: 'تسجيل خروج',
    REGISTER: 'إنشاء حساب',
    CARD_CREATE: 'إنشاء بطاقة شحن',
    CARD_REDEEM: 'استخدام بطاقة شحن',
    CARD_DELETE: 'حذف بطاقة شحن',
    STUDENT_UPDATE: 'تعديل بيانات طالب',
    STUDENT_DELETE: 'حذف طالب',
    QUIZ_CREATE: 'إنشاء اختبار',
    QUIZ_DELETE: 'حذف اختبار',
    QUIZ_UPDATE: 'تعديل اختبار',
    COURSE_CREATE: 'رفع كورس',
    COURSE_DELETE: 'حذف كورس',
    BALANCE_ADD: 'إضافة رصيد',
    BALANCE_DEDUCT: 'خصم رصيد',
    SUBSCRIPTION_EXTEND: 'تمديد اشتراك',
    SUBSCRIPTION_EXPIRE: 'انتهاء اشتراك',
    PLAN_CREATE: 'إنشاء باقة',
    PLAN_UPDATE: 'تعديل باقة',
    PLAN_DELETE: 'حذف باقة',
    AVATAR_UPDATE: 'تحديث الصورة الشخصية',
    SYSTEM_ERROR: 'خطأ في النظام'
});

module.exports = { logEvent, getClientIp, ACTIONS };
