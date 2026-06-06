const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController.js');
const { loginLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');

router.get('/csrf', (req, res) => {
    const token = req.csrfToken ? req.csrfToken() : 'csrf-disabled';
    res.status(200).json({ token });
});

router.post('/saveUser', loginLimiter, authController.saveUser);
router.get('/verify-session', authenticateToken, authController.verifySession);
router.post('/auth/login', authLoginLimiter, authController.login);
router.post('/auth/register', loginLimiter, authController.register);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authenticateToken, authController.verifySession);

module.exports = router;
