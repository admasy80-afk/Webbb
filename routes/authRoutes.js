const express = require('express');
const router = express.Router();
const authController = require('../controllers/​authController.js');
const { loginLimiter } = require('../middleware/rateLimiters');
const { authenticateToken } = require('../middleware/auth');

router.post('/saveUser', loginLimiter, authController.saveUser);
router.get('/verify-session', authenticateToken, authController.verifySession);

module.exports = router;

