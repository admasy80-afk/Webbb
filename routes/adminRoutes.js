const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
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

module.exports = router;

