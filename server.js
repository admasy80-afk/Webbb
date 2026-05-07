const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let usersCollection;

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
// 1️⃣ مسارات الطلاب وتسجيل الدخول 
// ==========================================
app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;

        if (!usersCollection) return res.status(500).json({ message: "السيرفر لسه بيسخن.." });

        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            return res.status(200).json({ 
                message: `أهلاً بك يا ${roleName} 👑`,
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" }
            });
        }

        if (data.identifier) {
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password
            });
            
            if (user) {
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
            } else {
                return res.status(401).json({ message: "خطأ في بيانات الدخول" });
            }
        }

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
            return res.status(200).json({ 
                message: "تم إنشاء حسابك بنجاح",
                userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, role: "student" }
            });
        }
    } catch (error) { res.status(500).json({ message: "حدث خطأ" }); }
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة 
// ==========================================
app.post('/api/admin/stats', async (req, res) => {
    try {
        const { role } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح" });

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        res.status(200).json({ studentsCount, pendingCount, questionsCount: "نشط" }); 
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/pending', async (req, res) => {
    try {
        const { role } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح" });

        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-status', async (req, res) => {
    try {
        const { role, studentEmail, newStatus, reason } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح" });

        await usersCollection.updateOne({ email: studentEmail.trim() }, { $set: { status: newStatus, rejection_reason: reason || "" } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-content', async (req, res) => {
    try {
        const { role, grade, type, pointText, questionText, questionHint } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح" });

        const db = usersCollection.s.db; 
        const contentCollection = db.collection('curriculum_content');
        
        if (type === 'point') {
            await contentCollection.updateOne({ grade: grade }, { $push: { points: pointText } }, { upsert: true });
        } else {
            await contentCollection.updateOne({ grade: grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
        }
        res.status(200).json({ message: "تم" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-points', async (req, res) => {
    try {
        const { role, studentEmail, points } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح" });

        await usersCollection.updateOne({ email: studentEmail.trim() }, { $inc: { points: parseInt(points) } });
        res.status(200).json({ message: "تم تحديث النقاط" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// ==========================================
// 3️⃣ مسارات الواجهة الخاصة بالطالب
// ==========================================
app.post('/api/check-status', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await usersCollection.findOne({ email: email });
        if (user) res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        else res.status(404).json({ message: "حساب غير موجود" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// 🔥 مسار جلب المنهج (النقاط والأسئلة) للطالب
app.post('/api/student/get-content', async (req, res) => {
    try {
        const { grade } = req.body;
        const db = usersCollection.s.db;
        const contentCollection = db.collection('curriculum_content');

        const content = await contentCollection.findOne({ grade: grade });
        if (content) {
            res.status(200).json({ points: content.points || [], questions: content.questions || [] });
        } else {
            res.status(200).json({ points: [], questions: [] });
        }
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// 🔥 مسار جلب نقاط وتقييم الطالب
app.post('/api/student/get-info', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await usersCollection.findOne({ email: email });
        if (user) {
            res.status(200).json({ points: user.points || 0 });
        } else {
            res.status(404).json({ message: "غير موجود" });
        }
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
