const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const walletController = require('../controllers/walletController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');
const { apiLimiter, redeemLimiter } = require('../middleware/rateLimiters');

// Public routes
router.post('/submit-quiz', studentController.submitQuiz);

// Protected routes
router.use(authenticateToken);

// المحفظة والاشتراك (متاحة دائماً حتى لو انتهى الاشتراك)
router.get('/wallet', walletController.getWallet);
router.post('/redeem', redeemLimiter, walletController.redeemCode);
router.post('/update-avatar', walletController.updateAvatar);

// dashboard-data متاح دائماً ليظهر شكل المنصة، والقفل يتم على الواجهة + الوظائف الحساسة
router.post('/dashboard-data', apiLimiter, studentController.getDashboardData);

// الوظائف الحساسة محمية باشتراك فعّال على الخادم
router.get('/video/stream/:msgId', requireActiveSubscription, studentController.streamVideo);

router.post('/check-status', studentController.checkStatus);
router.post('/verify-phone', studentController.verifyPhone);

module.exports = router;
