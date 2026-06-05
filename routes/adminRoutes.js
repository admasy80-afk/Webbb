const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const walletController = require('../controllers/walletController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiters');

// تطبيق الـ Middleware على كل مسارات الآدمن حمايةً لها
router.use(authenticateToken, requireAdmin);

router.post('/upload-course', uploadLimiter, adminController.uploadCourse);
router.get('/get-all-courses', adminController.getAllCourses);
router.delete('/delete-course/:id', adminController.deleteCourse);
router.post('/stats', adminController.getStats);
router.get('/providers-health', adminController.getProvidersHealth);
router.post('/pending', adminController.getPendingUsers);
router.post('/update-status', adminController.updateStatus);
router.post('/students-by-grade', adminController.getStudentsByGrade);
router.post('/add-content', adminController.addContent);
router.post('/update-points', adminController.updatePoints);
router.post('/toggle-stream', adminController.toggleStream);
router.post('/add-mcq-quiz', adminController.addMcqQuiz);
router.post('/add-test-results', adminController.addTestResults);
router.post('/add-public-quiz', adminController.addPublicQuiz);
router.post('/get-grade-content', adminController.getGradeContent);
router.post('/delete-item', adminController.deleteItem);

// ═══════════ نظام الرصيد والاشتراكات ═══════════

// الباقات (Subscription Plans)
router.get('/plans', walletController.listPlans);
router.post('/plans', walletController.createPlan);
router.put('/plans/:id', walletController.updatePlan);
router.delete('/plans/:id', walletController.deletePlan);

// بطاقات الشحن (Charge Cards)
router.get('/cards', walletController.listCards);
router.post('/cards', walletController.createCards);
router.delete('/cards/:id', walletController.deleteCard);

// إدارة الرصيد اليدوية
router.post('/adjust-balance', walletController.adjustBalance);

// لوحة مراقبة الرصيد (Wallet Management)
router.get('/wallet-stats', walletController.walletStats);

// سجل النظام (System Logs)
router.get('/logs', walletController.listLogs);
router.get('/logs/export', walletController.exportLogs);

module.exports = router;

