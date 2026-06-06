const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'eld7e7-platform';
const JWT_AUDIENCE = 'eld7e7-users';

/**
 * بصمة بسيطة على User-Agent — تساعد كطبقة إضافية لكنها ليست بديلًا عن JWT.
 */
const generateFingerprint = (req) =>
    crypto.createHash('sha256').update((req.headers['user-agent'] || '')).digest('hex');

/**
 * استخراج التوكن من Authorization header أو من query (?token=) كـ fallback.
 */
const extractToken = (req) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    if (req.query && req.query.token) return String(req.query.token).trim();
    return null;
};

/**
 * Middleware للمصادقة بـ JWT.
 * يرد بأكواد واضحة (code) حتى يتعامل الفرونت بدقة بدل ما يفسّر الرسائل النصية.
 *
 *   401 + code=TOKEN_MISSING   → ما فيه توكن أصلًا (طبيعي للزوار، لا يجب عرض رسالة "انتهت الجلسة")
 *   401 + code=TOKEN_EXPIRED   → التوكن انتهى → الفرونت يمسح storage ويعيد توجيه إلى /login.html
 *   401 + code=TOKEN_INVALID   → توقيع غير صالح / issuer / audience خطأ → نفس التصرف
 */
const authenticateToken = (req, res, next) => {
    const token = extractToken(req);

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({
            message: 'غير مصرح بالوصول.',
            code: 'TOKEN_MISSING'
        });
    }

    jwt.verify(
        token,
        JWT_SECRET,
        {
            algorithms: [JWT_ALGORITHM],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            clockTolerance: 5
        },
        (err, decoded) => {
            if (err) {
                const isExpired = err.name === 'TokenExpiredError';
                return res.status(401).json({
                    message: isExpired ? 'انتهت صلاحية الجلسة.' : 'جلسة غير صالحة.',
                    code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
                });
            }
            req.user = decoded;
            next();
        }
    );
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'dev' && req.user?.role !== 'owner') {
        return res.status(403).json({ message: 'مطلوب صلاحيات مسؤول.', code: 'FORBIDDEN' });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    generateFingerprint,
    JWT_SECRET,
    JWT_ALGORITHM,
    JWT_ISSUER,
    JWT_AUDIENCE
};
