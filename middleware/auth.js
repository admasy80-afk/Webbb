const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';

const generateFingerprint = (req) => crypto.createHash('sha256').update((req.headers['user-agent'] || '')).digest('hex');

const authenticateToken = (req, res, next) => {
    let token = req.query.token;
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: "غير مصرح بالوصول.", reason: "Token missing" });
    }

    jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM], issuer: 'eld7e7-platform', audience: 'eld7e7-users', clockTolerance: 5 }, (err, decoded) => {
        if (err) return res.status(403).json({ message: "انتهت صلاحية الجلسة أو غير صالحة.", reason: err.message });
        req.user = decoded;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'dev' && req.user?.role !== 'owner') {
        return res.status(403).json({ message: "مطلوب صلاحيات مسؤول." });
    }
    next();
};

module.exports = { authenticateToken, requireAdmin, generateFingerprint };

