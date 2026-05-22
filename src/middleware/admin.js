function requireAdmin(req, res, next) {
    if (req.user?.role !== 'dev' && req.user?.role !== 'owner') {
        return res.status(403).json({
            message: 'صلاحيات غير كافية'
        });
    }

    next();
}

module.exports = requireAdmin;
