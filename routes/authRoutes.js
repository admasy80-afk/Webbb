const express = require('express');
const router = express.Router();

// تم مسح الحرف المخفي هنا لتجنب خطأ MODULE_NOT_FOUND
const authController = require('../controllers/authController'); 
const { loginLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');

// 1. مسار تسليم توكن الـ CSRF للفرونت-إند (مهم جداً لعمليات الـ POST زي البث المباشر)
router.get('/csrf', (req, res) => {
    // لو السيرفر بيستخدم إضافة csurf، هيرجع التوكن الحقيقي، غير كدة هيرجع قيمة افتراضية
    const token = req.csrfToken ? req.csrfToken() : 'csrf-disabled';
    res.status(200).json({ token });
});

// 2. مسارات المصادقة
router.post('/saveUser', loginLimiter, authController.saveUser);
router.get('/verify-session', authenticateToken, authController.verifySession);

module.exports = router;
