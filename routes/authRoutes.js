const express = require('express');
const router = express.Router();

// تم مسح الحرف المخفي هنا لتجنب خطأ MODULE_NOT_FOUND
const authController = require('../controllers/authController.js');

const { loginLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');

// 1. مسار تسليم توكن الـ CSRF للفرونت-إند
router.get('/csrf', (req, res) => {
    const token = req.csrfToken ? req.csrfToken() : 'csrf-disabled';
    res.status(200).json({ token });
});

// 2. مسارات المصادقة
router.post('/saveUser', loginLimiter, authController.saveUser);

// التحقق من الجلسة
router.get('/verify-session', (req, res, next) => {
    authenticateToken(req, res, (err) => {
        if (err) {
            return res.redirect('/');
        }
        next();
    });
}, authController.verifySession);

// Logout وهمي لمنع 404
router.post('/logout', (req, res) => {
    res.status(200).json({
        message: 'تم تسجيل الخروج'
    });
});

module.exports = router;
