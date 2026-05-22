const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => `${req.ip}-${req.body?.identifier || 'unknown'}`, message: { message: "محاولات كثيرة جداً." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { message: "تجاوزت الحد المسموح من الطلبات." } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح للرفع." } });
const publicQuizLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: "تجاوزت الحد المسموح." } });

module.exports = { loginLimiter, apiLimiter, uploadLimiter, publicQuizLimiter };

