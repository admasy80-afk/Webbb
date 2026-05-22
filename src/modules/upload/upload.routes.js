const router = require('express').Router();

const authenticateToken = require('../../middleware/auth');
const requireAdmin = require('../../middleware/admin');

const uploadController = require('./upload.controller');

router.post(
    '/course',
    authenticateToken,
    requireAdmin,
    uploadController.uploadCourse
);

module.exports = router;
