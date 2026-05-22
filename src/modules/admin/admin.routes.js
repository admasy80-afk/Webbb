const router = require('express').Router();

const authenticateToken = require('../../middleware/auth');
const requireAdmin = require('../../middleware/admin');

const { getDB } = require('../../config/database');

/*
|--------------------------------------------------------------------------
| Admin Health Check
|--------------------------------------------------------------------------
*/

router.get(
    '/ping',
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            return res.status(200).json({
                success: true,
                message: 'Admin API Ready',
                admin: {
                    email: req.user.email,
                    role: req.user.role
                },
                timestamp: Date.now()
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Dashboard Stats
|--------------------------------------------------------------------------
*/

router.get(
    '/stats',
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const db = getDB();

            const [
                usersCount,
                coursesCount
            ] = await Promise.all([
                db.collection('users').countDocuments(),
                db.collection('courses').countDocuments()
            ]);

            return res.status(200).json({
                success: true,
                stats: {
                    users: usersCount,
                    courses: coursesCount
                }
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Get Pending Students
|--------------------------------------------------------------------------
*/

router.get(
    '/students/pending',
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const db = getDB();

            const students = await db
                .collection('users')
                .find({
                    role: 'student',
                    status: 'pending'
                })
                .project({
                    password: 0
                })
                .toArray();

            return res.status(200).json({
                success: true,
                students
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Approve Student
|--------------------------------------------------------------------------
*/

router.post(
    '/students/:id/approve',
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const { ObjectId } = require('mongodb');

            const db = getDB();

            await db.collection('users').updateOne(
                {
                    _id: new ObjectId(req.params.id)
                },
                {
                    $set: {
                        status: 'active'
                    }
                }
            );

            return res.status(200).json({
                success: true,
                message: 'تم قبول الطالب'
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);

module.exports = router;
