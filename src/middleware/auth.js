const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
    let token = req.query.token;

    if (!token) {
        const authHeader = req.headers.authorization;
        token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            message: 'Unauthorized'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                message: 'Invalid token'
            });
        }

        req.user = decoded;

        next();
    });
}

module.exports = authenticateToken;
