const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const { publicQuizLimiter } = require('../middleware/rateLimiters');

router.get('/quiz', publicQuizLimiter, publicController.getPublicQuiz);

module.exports = router;

