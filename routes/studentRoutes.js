const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticateToken } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiters');

// Public routes
router.post('/submit-quiz', studentController.submitQuiz);

// Protected routes
router.use(authenticateToken);

router.post('/dashboard-data', apiLimiter, studentController.getDashboardData);
router.get('/video/stream/:msgId', studentController.streamVideo);
router.post('/check-status', studentController.checkStatus);
router.post('/verify-phone', studentController.verifyPhone);

module.exports = router;
