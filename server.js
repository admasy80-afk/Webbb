const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken'); // 👈 إضافة مكتبة التوكن

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "DAHIH_SECRET_KEY_123!@#"; // 👈 مفتاح التشفير

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let usersCollection;

// --- [تطوير جزء قاعدة البيانات] ---
async function startServer() {
    try {
        if (process.env.MONGO_URL) {
            const client = new MongoClient(process.env.MONGO_URL);
            await client.connect();
            usersCollection = client.db('dahih_db').collection('users');
            console.log("✅ تم الاتصال بمونجو بنجاح.. السيرفر جاهز الآن");
        } else {
            console.error("❌ MONGO_URL غير موجود في متغيرات البيئة!");
        }

        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
    } catch (err) {
        console.error("❌ فشل الاتصال بقاعدة البيانات:", err);
        process.exit(1);
    }
}

startServer();

// ==========================================
// 🛡️ وسيط الحماية (Middleware) لمنع الدخول غير المصرح
// ==========================================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ message: "غير مصرح لك بالدخول، يرجى تسجيل الدخول أولاً" });

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET); 
        req.user = decoded; 
        next();
    } catch (err) {
        return res.status(401).json({ message: "انتهت صلاحية الجلسة، قم بتسجيل الدخول مجدداً" });
    }
};

// ==========================================
// 1️⃣ مسارات الطلاب وتسجيل الدخول الأساسية
// ==========================================
app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;

        if (!usersCollection) {
            return res.status(500).json({ message: "السيرفر لسه بيسخن.. حاول كمان ثواني" });
        }

        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";

        // دالة إنشاء التوكن (صالح لمدة 30 يوم)
        const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

        // تسجيل دخول المطور / الإدارة
        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            const token = generateToken({ email: data.identifier, role: userRole });

            return res.status(200).json({ 
                message: `أهلاً بك يا ${roleName} 👑`,
                token: token, // 👈 إرسال التوكن
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" }
            });
        }

        // تسجيل دخول طالب
        if (data.identifier) {
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password
            });
            
            if (user) {
                const userStatus = user.status || "pending"; 
                const token = generateToken({ email: user.email, role: "student" });

                return res.status(200).json({ 
                    message: "تم الدخول ✓",
                    token: token, // 👈 إرسال التوكن
                    userData: { 
                        name: user.first_name, 
                        grade: user.grade, 
                        status: userStatus, 
                        reason: user.rejection_reason || "",
                        email: user.email,
                        role: "student"
                    }
                });
            } else {
                return res.status(401).json({ message: "خطأ في بيانات الدخول" });
            }
        }

        // إنشاء حساب جديد
        if (data.first_name) {
            const existing = await usersCollection.findOne({
                $or: [{ email: data.email }, { phone: data.phone }]
            });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            data.status = "pending"; 
            data.rejection_reason = "";
            data.role = "student";
            data.points = 0; 

            await usersCollection.insertOne(data);
            
            // إنشاء توكن حتى يدخل مباشرة بعد التسجيل ليتابع حالته (قيد المراجعة)
            const token = generateToken({ email: data.email, role: "student" });

            return res.status(200).json({ 
                message: "تم إنشاء حسابك بنجاح",
                token: token,
                userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, role: "student" }
            });
        }

    } catch (error) {
        res.status(500).json({ message: "حدث خطأ أثناء معالجة البيانات" });
    }
});

// ==========================================
// 🚀 مسار جديد: التحقق التلقائي (Auto-Login)
// ==========================================
app.get('/api/verify-session', verifyToken, async (req, res) => {
    const userEmail = req.user.email;
    
    if(req.user.role === 'dev' || req.user.role === 'owner') {
         return res.status(200).json({ role: req.user.role, redirectTo: '/admin-dashboard.html' }); // غير المسار لو اسم صفحة الأدمن مختلف
    }

    const user = await usersCollection.findOne({ email: userEmail });
    if(user) {
        return res.status(200).json({ 
            role: "student", 
            status: user.status,
            redirectTo: '/student-dashboard.html', // غير المسار لو اسم صفحة الطالب مختلف
            userData: user
        });
    }
    res.status(404).json({ message: "المستخدم غير موجود" });
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة (Admin APIs) - (محمية 🛡️)
// ==========================================
app.post('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const { role } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        res.status(200).json({ studentsCount, pendingCount, questionsCount: "نشط" }); 
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/pending', verifyToken, async (req, res) => {
    try {
        const { role } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-status', verifyToken, async (req, res) => {
    try {
        const { role, studentEmail, newStatus, reason } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        await usersCollection.updateOne(
            { email: studentEmail.trim() },
            { $set: { status: newStatus, rejection_reason: reason || "" } }
        );
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/students-by-grade', verifyToken, async (req, res) => {
    try {
        const { role, grade } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        
        const students = await usersCollection.find({ status: "accepted", role: "student", grade: grade }).toArray();
        res.status(200).json(students);
    } catch (error) { res.status(500).json({ message: "خطأ في جلب الطلاب" }); }
});

app.post('/api/admin/add-content', verifyToken, async (req, res) => {
    try {
        const { role, grade, type, pointText, questionText, questionHint } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        const db = usersCollection.s.db; 
        const contentCollection = db.collection('curriculum_content');
        if (type === 'point') {
            await contentCollection.updateOne({ grade: grade }, { $push: { points: pointText } }, { upsert: true });
        } else {
            await contentCollection.updateOne({ grade: grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
        }
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-points', verifyToken, async (req, res) => {
    try {
        const { role, studentEmail, points } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { points: parseInt(points) } }); 
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-test-scores', verifyToken, async (req, res) => {
    try {
        const { role, grade, testName, scores } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        
        const db = usersCollection.s.db; 
        const contentCollection = db.collection('curriculum_content');
        
        await contentCollection.updateOne(
            { grade: grade },
            { $push: { tests: { testName: testName, scores: scores, date: new Date() } } },
            { upsert: true }
        );
        res.status(200).json({ message: "تم إضافة درجات الاختبار بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ في الإضافة" }); }
});

// ==========================================
// 3️⃣ مسارات خاصة بالـ Dashboard بتاعة الطالب - (محمية 🛡️)
// ==========================================
app.post('/api/check-status', verifyToken, async (req, res) => {
    try {
        const { email } = req.body;
        const user = await usersCollection.findOne({ email: email });
        if (user) res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        else res.status(404).json({ message: "حساب غير موجود" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', verifyToken, async (req, res) => {
    try {
        const { email, grade } = req.body;
        const user = await usersCollection.findOne({ email: email });
        const studentPoints = user ? (user.points || 0) : 0;

        const db = usersCollection.s.db;
        const contentCollection = db.collection('curriculum_content');
        const content = await contentCollection.findOne({ grade: grade }) || { points: [], questions: [], tests: [] };

        res.status(200).json({ studentPoints, content });
    } catch (error) {
        res.status(500).json({ message: "خطأ في جلب البيانات" });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
