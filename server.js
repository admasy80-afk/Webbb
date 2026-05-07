const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let usersCollection;

// --- [تطوير جزء قاعدة البيانات ليكون أكثر أماناً] ---
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

        // تشغيل السيرفر بعد التأكد من الاتصال
        app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
    } catch (err) {
        console.error("❌ فشل الاتصال بقاعدة البيانات:", err);
        process.exit(1); // إغلاق السيرفر لو الاتصال فشل
    }
}

// تشغيل دالة البداية
startServer();

// ==========================================
// 1️⃣ مسارات الطلاب وتسجيل الدخول الأساسية
// ==========================================
app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;

        if (!usersCollection) {
            return res.status(500).json({ message: "السيرفر لسه بيسخن.. حاول كمان ثواني" });
        }

        // 👑 فحص حسابات الإدارة (المستر والديفيلوبر) أولاً 👑
        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            
            return res.status(200).json({ 
                message: `أهلاً بك يا ${roleName} 👑`,
                // ضفنا الإيميل هنا عشان الإدارة تستخدمه كإثبات هوية في الطلبات الجاية
                userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" }
            });
        }

        // 🟢 لوجيك تسجيل الدخول للطلاب
        if (data.identifier) {
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password
            });
            
            if (user) {
                const userStatus = user.status || "pending"; 
                return res.status(200).json({ 
                    message: "تم الدخول ✓",
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

        // 🔵 لوجيك إنشاء حساب طالب جديد
        if (data.first_name) {
            const existing = await usersCollection.findOne({
                $or: [{ email: data.email }, { phone: data.phone }]
            });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            data.status = "pending"; 
            data.rejection_reason = "";
            data.role = "student";

            await usersCollection.insertOne(data);
            
            return res.status(200).json({ 
                message: "تم إنشاء حسابك بنجاح",
                userData: { name: data.first_name, grade: data.grade, status: "pending", role: "student" }
            });
        }

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ message: "حدث خطأ أثناء معالجة البيانات" });
    }
});

// ==========================================
// 2️⃣ مسارات لوحة الإدارة (Admin APIs)
// ==========================================

// مسار: جلب إحصائيات نظرة عامة
app.post('/api/admin/stats', async (req, res) => {
    try {
        const { role } = req.body;
        // التأكد إن الطلب جاي من أدمن
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });

        const studentsCount = await usersCollection.countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await usersCollection.countDocuments({ role: "student", status: "pending" });
        
        res.status(200).json({ studentsCount, pendingCount, questionsCount: 0 }); 
    } catch (error) {
        res.status(500).json({ message: "خطأ في جلب الإحصائيات" });
    }
});

// مسار: جلب التقديمات الحالية (الطلاب اللي لسه pending)
app.post('/api/admin/pending', async (req, res) => {
    try {
        const { role } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });

        const pendingUsers = await usersCollection.find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) {
        res.status(500).json({ message: "خطأ في جلب التقديمات" });
    }
});

// مسار: قبول أو رفض طالب
app.post('/api/admin/update-status', async (req, res) => {
    try {
        const { role, studentEmail, newStatus, reason } = req.body;
        if (role !== 'dev' && role !== 'owner') return res.status(403).json({ message: "غير مصرح لك" });

        await usersCollection.updateOne(
            { email: studentEmail },
            { $set: { status: newStatus, rejection_reason: reason || "" } }
        );

        res.status(200).json({ message: "تم تحديث حالة الطالب بنجاح" });
    } catch (error) {
        res.status(500).json({ message: "خطأ في تحديث الحالة" });
    }
});


// أي مسار تاني يرجع للصفحة الرئيسية
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
