require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let usersCollection;

// --- [الاتصال بقاعدة البيانات] ---
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
// مسارات الطلاب وتسجيل الدخول
// ==========================================
app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;
        if (!usersCollection) return res.status(500).json({ message: "السيرفر قيد التشغيل.. انتظر" });  

        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";  
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";  

        if (isDev || isOwner) {  
            const roleName = isDev ? "المطور" : "المدير";  
            const userRole = isDev ? "dev" : "owner";  
            return res.status(200).json({ message: `أهلاً بك يا ${roleName}`, userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" } });  
        }  

        if (data.identifier) {  
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }], password: data.password });  
            if (user) {  
                return res.status(200).json({ message: "تم الدخول", userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", reason: user.rejection_reason || "", email: user.email, role: "student" } });  
            } else {  
                return res.status(401).json({ message: "خطأ في بيانات الدخول" });  
            }  
        }  

        if (data.first_name) {  
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });  
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });  

            data.status = "pending"; data.rejection_reason = ""; data.role = "student"; data.points = 0;   
            await usersCollection.insertOne(data);  
            return res.status(200).json({ message: "تم التسجيل", userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, role: "student" } });  
        }  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// ==========================================
// مسارات لوحة الإدارة
// ==========================================
app.post('/api/admin/stats', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });  
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });  
        res.status(200).json({ studentsCount, pendingCount });   
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/pending', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-status', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        await usersCollection.updateOne({ email: req.body.studentEmail.trim() }, { $set: { status: req.body.newStatus, rejection_reason: req.body.reason || "" } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/students-by-grade', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        const students = await usersCollection.find({ status: "accepted", role: "student", grade: req.body.grade }).toArray();  
        res.status(200).json(students);  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-content', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        const contentCollection = usersCollection.s.db.collection('curriculum_content');
        if (req.body.type === 'point') await contentCollection.updateOne({ grade: req.body.grade }, { $push: { points: req.body.pointText } }, { upsert: true });
        else await contentCollection.updateOne({ grade: req.body.grade }, { $push: { questions: { question: req.body.questionText, hint: req.body.questionHint } } }, { upsert: true });
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/update-points', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        await usersCollection.updateOne({ email: req.body.studentEmail.trim() }, { $set: { points: parseInt(req.body.points) } }); 
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-test-scores', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح" });
        const contentCollection = usersCollection.s.db.collection('curriculum_content');  
        await contentCollection.updateOne({ grade: req.body.grade }, { $push: { tests: { testName: req.body.testName, scores: req.body.scores, date: new Date() } } }, { upsert: true });  
        res.status(200).json({ message: "تم الإضافة" });  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/admin/add-mcq-quiz', async (req, res) => {
    try {
        if (req.body.role !== 'dev' && req.body.role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });
        const contentCollection = usersCollection.s.db.collection('curriculum_content');  
        const newQuiz = {
            id: new Date().getTime().toString(),
            title: req.body.quizTitle,
            questions: req.body.questionsArray,
            results: [],
            createdAt: new Date()
        };
        await contentCollection.updateOne({ grade: req.body.grade }, { $push: { quizzes: newQuiz } }, { upsert: true });  
        res.status(200).json({ message: "تم نشر الاختبار بنجاح" });  
    } catch (error) { res.status(500).json({ message: "خطأ في الحفظ" }); }
});

// ==========================================
// مسارات الطالب وتأدية الاختبار
// ==========================================
app.post('/api/check-status', async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.body.email });
        if (user) res.status(200).json({ status: user.status || "pending", reason: user.rejection_reason || "" });
        else res.status(404).json({ message: "غير موجود" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

app.post('/api/student/dashboard-data', async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.body.email });
        const contentCollection = usersCollection.s.db.collection('curriculum_content');  
        const content = await contentCollection.findOne({ grade: req.body.grade }) || { points: [], questions: [], tests: [], quizzes: [] };  
        res.status(200).json({ studentPoints: user ? (user.points || 0) : 0, content });  
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
});

// 🔥 المسار الجديد لاستلام درجات الاختبار من الطالب لمنع التكرار 🔥
app.post('/api/student/submit-quiz', async (req, res) => {
    try {
        const { email, studentName, grade, quizId, score, percentage } = req.body;
        const contentCollection = usersCollection.s.db.collection('curriculum_content');
        
        await contentCollection.updateOne(
            { grade: grade, "quizzes.id": quizId },
            { $push: { "quizzes.$.results": { email, studentName, score, percentage, date: new Date() } } }
        );
        res.status(200).json({ message: "تم حفظ النتيجة" });
    } catch (error) {
        res.status(500).json({ message: "خطأ في حفظ النتيجة" });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
