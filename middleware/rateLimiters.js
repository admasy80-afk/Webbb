const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => `${req.ip}-${req.body?.identifier || 'unknown'}`, message: { message: "محاولات كثيرة جداً." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { message: "تجاوزت الحد المسموح من الطلبات." } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح للرفع." } });
const publicQuizLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح." } });
// حماية تفعيل الأكواد من هجمات التخمين (Brute Force): 10 محاولات كل 10 دقائق لكل مستخدم/IP
const redeemLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `${req.ip}-${(req.user && req.user.email) || 'anon'}`,
    message: { message: "محاولات كثيرة لتفعيل الأكواد. حاول لاحقاً.", code: "RATE_LIMITED" }
});

module.exports = { loginLimiter, apiLimiter, uploadLimiter, publicQuizLimiter, redeemLimiter };

