const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'); 

const app = express();

// 🔥 هذا السطر ضروري جداً جداً عشان الكوكيز تشتغل على Railway 🔥
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY_123";

app.use(express.json());
app.use(cookieParser());

// ملفاتك العامة (الواجهة، الصور، CSS)
app.use(express.static(path.join(__dirname, 'public')));

let db;
let usersCollection;

// ==========================================
// Database
// ==========================================
async function startServer() {
    try {
        if (!process.env.MONGO_URL) {
            console.log("❌ MONGO_URL غير موجود");
            process.exit(1);
        }

        const client = new MongoClient(process.env.MONGO_URL);
        await client.connect();
        
        db = client.db('dahih_db');
        usersCollection = db.collection('users');

        console.log("✅ Mongo Connected");

        app.listen(PORT, () => {
            console.log(`🚀 Running on ${PORT}`);
        });

    } catch (err) {
        console.log("❌ DATABASE ERROR:", err);
        process.exit(1);
    }
}
startServer();

// ==========================================
// JWT Middleware
// ==========================================
function verifyToken(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "غير مسجل دخول" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "انتهت الجلسة" });
    }
}

// ==========================================
// التوجيه التلقائي (Auto Redirect)
// ==========================================
app.get('/api/me', verifyToken, async (req, res) => {
    res.json({
        loggedIn: true,
        role: req.user.role
    });
});

// ==========================================
// 1. مسار تسجيل حساب جديد (Register)
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const data = req.body;

        if (!usersCollection) {
            return res.status(500).json({ message: "السيرفر لسه بيبدأ" });
        }

        const existing = await usersCollection.findOne({
            $or: [ { email: data.email }, { phone: data.phone } ]
        });

        if (existing) {
            return res.status(400).json({ message: "البريد أو الهاتف مستخدم مسبقاً" });
        }

        // تشفير كلمة المرور
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(data.password, salt);

        const newUser = {
            first_name: data.first_name,
            email: data.email,
            phone: data.phone,
            password: hashedPassword,
            grade: data.grade,
            status: "pending",
            rejection_reason: "",
            role: "student",
            points: 0
        };

        await usersCollection.insertOne(newUser);

        const token = jwt.sign(
            { email: newUser.email, role: "student" },
            JWT_SECRET,
            { expiresIn: '365d' }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax", // تم التعديل لتجنب مشاكل Railway
            maxAge: 1000 * 60 * 60 * 24 * 365 
        });

        return res.status(200).json({
            message: "تم إنشاء الحساب بنجاح",
            userData: {
                name: newUser.first_name,
                grade: newUser.grade,
                status: "pending",
                email: newUser.email,
                role: "student"
            }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "حدث خطأ أثناء التسجيل" });
    }
});

// ==========================================
// 2. مسار تسجيل الدخول (Login)
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!usersCollection) {
            return res.status(500).json({ message: "السيرفر لسه بيبدأ" });
        }

        // ==================================
        // DEV / OWNER LOGIN (Secure via ENV)
        // ==================================
        const isDev = identifier === process.env.DEV_EMAIL && password === process.env.DEV_PASSWORD;
        const isOwner = identifier === process.env.OWNER_EMAIL && password === process.env.OWNER_PASSWORD;

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";

            const token = jwt.sign(
                { email: identifier, role: userRole },
                JWT_SECRET,
                { expiresIn: '365d' }
            );

            res.cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24 * 365
            });

            return res.status(200).json({
                message: `أهلاً بك يا ${roleName} 👑`,
                userData: {
                    name: roleName,
                    role: userRole,
                    email: identifier,
                    status: "accepted",
                    grade: "إدارة المنصة"
                }
            });
        }

        // ==================================
        // STUDENT LOGIN
        // ==================================
        const user = await usersCollection.findOne({
            $or: [ { email: identifier }, { phone: identifier } ]
        });

        if (!user) {
            return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
        }

        // حل مشكلة الطلاب القدامى اللي باسورداتهم مو مشفرة
        let isMatch = false;
        if (user.password && user.password.startsWith("$2")) {
            // باسورد مشفر بـ bcrypt
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            // باسورد قديم غير مشفر
            isMatch = (password === user.password);
        }

        if (!isMatch) {
            return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
        }

        const token = jwt.sign(
            { email: user.email, role: "student" },
            JWT_SECRET,
            { expiresIn: '365d' }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 365
        });

        return res.status(200).json({
            message: "تم الدخول ✓",
            userData: {
                name: user.first_name,
                grade: user.grade,
                status: user.status || "pending",
                reason: user.rejection_reason || "",
                email: user.email,
                role: "student"
            }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "حدث خطأ أثناء تسجيل الدخول" });
    }
});

// ==========================================
// VERIFY SESSION
// ==========================================
app.get('/api/verify-session', verifyToken, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.user.email });

        if (!user && req.user.role === "student") {
            return res.status(404).json({ message: "المستخدم غير موجود" });
        }

        res.status(200).json({
            loggedIn: true,
            user: req.user
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ" });
    }
});

// ==========================================
// LOGOUT
// ==========================================
app.post('/api/logout', (req, res) => {
    res.clearCookie("token");
    res.json({ message: "تم تسجيل الخروج" });
});

// ==========================================
// ADMIN ROUTES
// ==========================================
app.post('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== "dev" && req.user.role !== "owner") {
            return res.status(403).json({ message: "غير مصرح" });
        }

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });

        res.json({
            studentsCount,
            pendingCount,
            questionsCount: "نشط"
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ" });
    }
});

// ==========================================
// STUDENT DASHBOARD
// ==========================================
app.post('/api/student/dashboard-data', verifyToken, async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.user.email });
        const studentPoints = user?.points || 0;
        const contentCollection = db.collection('curriculum_content');
        
        const content = await contentCollection.findOne({ grade: user.grade }) || {
            points: [],
            questions: [],
            tests: []
        };

        res.json({
            studentPoints,
            content
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ" });
    }
});

// ==========================================
// Protected Pages (تأكد أن مجلد private مو داخل public)
// ==========================================
app.get('/admin-dashboard', verifyToken, (req, res) => {
    if (req.user.role !== "dev" && req.user.role !== "owner") {
        return res.status(403).send("ممنوع");
    }
    res.sendFile(path.join(__dirname, 'private', 'admin-dashboard.html'));
});

app.get('/student-dashboard', verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'student-dashboard.html'));
});

// ==========================================
// Default Route
// ==========================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
