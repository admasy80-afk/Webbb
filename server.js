require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

let usersCollection;

// =========================
// SECURITY BASIC
// =========================
app.use(helmet());

app.use(cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true
}));

app.use(express.json({ limit: "10kb" }));

app.use(express.static(path.join(__dirname, 'public')));

// =========================
// RATE LIMIT (خفيف)
// =========================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200
});

app.use(limiter);

// =========================
// DB CONNECT
// =========================
async function startServer() {
    try {
        if (!process.env.MONGO_URL) {
            throw new Error("MONGO_URL missing");
        }

        const client = new MongoClient(process.env.MONGO_URL);
        await client.connect();

        const db = client.db('dahih_db');
        usersCollection = db.collection('users');

        console.log("✅ MongoDB connected");

        app.listen(PORT, () => {
            console.log(`🚀 Server running on ${PORT}`);
        });

    } catch (err) {
        console.error("❌ Server failed:", err.message);
        process.exit(1);
    }
}

// =========================
// LOGIN / REGISTER (زي نظامك القديم)
# =========================
app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;

        if (!usersCollection) {
            return res.status(500).json({ message: "DB not ready" });
        }

        // dev / owner bypass
        if (
            (data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7") ||
            (data.identifier === "owner@owner.com" && data.password === "123456")
        ) {
            return res.json({
                message: "welcome admin",
                userData: {
                    role: "admin",
                    status: "accepted"
                }
            });
        }

        // login
        if (data.identifier && data.password) {
            const user = await usersCollection.findOne({
                $or: [
                    { email: data.identifier },
                    { phone: data.identifier }
                ]
            });

            if (!user) {
                return res.status(401).json({ message: "Invalid login" });
            }

            const ok = await bcrypt.compare(data.password, user.password || "");

            if (!ok) {
                return res.status(401).json({ message: "Invalid login" });
            }

            return res.json({
                message: "login ok",
                userData: {
                    name: user.first_name,
                    grade: user.grade,
                    status: user.status || "pending",
                    email: user.email
                }
            });
        }

        // register
        if (data.first_name) {
            const exists = await usersCollection.findOne({
                $or: [{ email: data.email }, { phone: data.phone }]
            });

            if (exists) {
                return res.status(400).json({ message: "Already exists" });
            }

            const hashed = await bcrypt.hash(data.password, 10);

            await usersCollection.insertOne({
                ...data,
                password: hashed,
                status: "pending",
                role: "student",
                points: 0
            });

            return res.json({
                message: "registered"
            });
        }

        return res.status(400).json({ message: "invalid request" });

    } catch (err) {
        return res.status(500).json({ message: "server error" });
    }
});

// =========================
// ADMIN SIMPLE (زي القديم بس آمن)
// =========================
app.post('/api/admin/stats', async (req, res) => {
    try {
        const { role } = req.body;

        if (!["dev", "owner"].includes(role)) {
            return res.status(403).json({ message: "forbidden" });
        }

        const students = await usersCollection.countDocuments({ role: "student" });
        const pending = await usersCollection.countDocuments({ status: "pending" });

        res.json({ students, pending });

    } catch {
        res.status(500).json({ message: "error" });
    }
});

// =========================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

startServer();
