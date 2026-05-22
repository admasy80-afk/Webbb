const router = require('express').Router();

const authenticateToken = require('../../middleware/auth');

/*
|--------------------------------------------------------------------------
| Student Health Check
|--------------------------------------------------------------------------
*/

router.get('/', authenticateToken, async (req, res) => {
    try {

        return res.status(200).json({
            success: true,
            message: 'Student API Ready',
            user: {
                email: req.user.email,
                role: req.user.role
            },
            timestamp: Date.now()
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: 'حدث خطأ داخلي'
        });
    }
});

/*
|--------------------------------------------------------------------------
| Student Profile
|--------------------------------------------------------------------------
*/

router.get('/profile', authenticateToken, async (req, res) => {

    try {

        return res.status(200).json({
            success: true,
            profile: {
                email: req.user.email,
                role: req.user.role
            }
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

/*
|--------------------------------------------------------------------------
| Student Courses
|--------------------------------------------------------------------------
*/

router.get('/courses', authenticateToken, async (req, res) => {

    try {

        return res.status(200).json({
            success: true,
            courses: []
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

/*
|--------------------------------------------------------------------------
| Student Logout
|--------------------------------------------------------------------------
*/

router.post('/logout', authenticateToken, async (req, res) => {

    try {

        return res.status(200).json({
            success: true,
            message: 'تم تسجيل الخروج'
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;
