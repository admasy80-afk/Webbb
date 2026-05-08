require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { Redis } = require('@upstash/redis'); // ✅ بدل redis القديم
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// STATE
// ===============================
let db;
let usersCollection;
let auditCollection;
let redisClient;

// ===============================
// SECURITY CONFIG
// ===============================
app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}));

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// ===============================
// RATE LIMIT
// ===============================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many login attempts" }
});

// ===============================
// CONNECT DB + REDIS
// ===============================
async function startServer() {
    try {
        const mongoClient = new MongoClient(process.env.MONGO_URL);
        await mongoClient.connect();

        db = mongoClient.db('dahih_enterprise_db');
        usersCollection = db.collection('users');
        auditCollection = db.collection('audit_logs');

        // ===============================
        // ✅ UPSTASH REDIS (FIXED)
        // ===============================
        redisClient = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });

        console.log("✅ DB + Upstash Redis Connected");

        app.listen(PORT, () => {
            console.log(`🚀 Server running on ${PORT}`);
        });

    } catch (err) {
        console.error("❌ Startup failed:", err);
        process.exit(1);
    }
}

// ===============================
// JWT HELPERS
// ===============================
function signAccessToken(user) {
    return jwt.sign(
        { sub: user._id.toString(), role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );
}

async function signRefreshToken(userId) {
    const token = jwt.sign(
        { sub: userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
    );

    await redisClient.set(`refresh:${userId}`, token, {
        ex: 7 * 24 * 60 * 60
    });

    return token;
}

// ===============================
// AUDIT LOG
// ===============================
async function logAction(userId, action, ip) {
    if (!auditCollection) return;

    await auditCollection.insertOne({
        userId: userId ? new ObjectId(userId) : null,
        action,
        ip,
        date: new Date()
    });
}

// ===============================
// AUTH MIDDLEWARE
// ===============================
function authenticate(req, res, next) {
    const token = req.cookies.accessToken;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ message: "Token invalid/expired" });
    }
}

// ===============================
// RBAC
// ===============================
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            logAction(req.user?.sub, "UNAUTHORIZED_ACCESS", req.ip);
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}

// ===============================
// LOGIN
// ===============================
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await usersCollection.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const accessToken = signAccessToken(user);
        const refreshToken = await signRefreshToken(user._id.toString());

        await logAction(user._id.toString(), "LOGIN", req.ip);

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/api/refresh",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ message: "Logged in" });

    } catch {
        return res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// REFRESH TOKEN
// ===============================
app.post('/api/refresh', async (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const userId = decoded.sub;

        const saved = await redisClient.get(`refresh:${userId}`);

        if (saved !== token) {
            return res.status(401).json({ message: "Session invalid" });
        }

        const user = await usersCollection.findOne({
            _id: new ObjectId(userId)
        });

        const newAccessToken = signAccessToken(user);
        const newRefreshToken = await signRefreshToken(userId);

        res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000
        });

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/api/refresh",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ message: "Refreshed" });

    } catch {
        return res.status(401).json({ message: "Invalid refresh token" });
    }
});

// ===============================
// ADMIN ROUTE
// ===============================
app.post(
    '/api/admin/system-halt',
    authenticate,
    authorize('dev', 'owner'),
    async (req, res) => {
        await logAction(req.user.sub, "SYSTEM_HALT", req.ip);
        return res.json({ message: "OK" });
    }
);

// ===============================
// LOGOUT
// ===============================
app.post('/api/logout', authenticate, async (req, res) => {
    await redisClient.del(`refresh:${req.user.sub}`);

    await logAction(req.user.sub, "LOGOUT", req.ip);

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken", { path: "/api/refresh" });

    return res.json({ message: "Logged out" });
});

// ===============================
// GRACEFUL SHUTDOWN
// ===============================
process.on('SIGINT', async () => {
    console.log("Shutting down...");

    process.exit(0);
});

// ===============================
startServer();
