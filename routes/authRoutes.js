const express = require('express');
const router = express.Router();

const authController = require('../controllers/​authController.js');
const { loginLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');

/* ============================================================
   CSRF token endpoint
   ============================================================ */
router.get('/csrf', (req, res) => {
    const token = req.csrfToken ? req.csrfToken() : 'csrf-disabled';
    res.status(200).json({ token });
});

/* ============================================================
   Legacy endpoints (متوافقة مع الفرونت القديم — لا تحذفها)
   ============================================================ */
router.post('/saveUser', loginLimiter, authController.saveUser);
router.get('/verify-session', authenticateToken, authController.verifySession);

/* ============================================================
   Modern endpoints  (يفضّل استخدامها في أي كود جديد)
     POST /auth/login
     POST /auth/register
     POST /auth/logout
     GET  /auth/me
   ============================================================ */
router.post('/auth/login', loginLimiter, authController.login);
router.post('/auth/register', loginLimiter, authController.register);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authenticateToken, authController.verifySession);

module.exports = router;
