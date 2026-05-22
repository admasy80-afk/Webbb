const router = require('express').Router();

const authenticateToken = require('../../middleware/auth');
const requireAdmin = require('../../middleware/admin');

router.get(
    '/ping',
    authenticateToken,
    requireAdmin,
    (req, res) => {
        res.json({
            success: true,
            message: 'Admin route works'
        });
    }
);

module.exports = router;
