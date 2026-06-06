const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController.js');
const { authLoginLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');

router.post('/saveUser', authLoginLimiter, authController.saveUser);
router.get('/verify-session', authenticateToken, authController.verifySession);
router.post('/auth/login', authLoginLimiter, authController.login);
router.post('/auth/register', authLoginLimiter, authController.register);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authenticateToken, authController.verifySession);

module.exports = router;
