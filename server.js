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

app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;
        if (!usersCollection) return res.status(500).json({ message: "السيرفر لسه بيسخن.. حاول كمان ثواني" });

        // 👑 فحص حسابات الإدارة (المستر والديفيلوبر) أولاً 👑
        const isDev = data.identifier === "nullbrodidyouknow@gmail.com" && data.password === "T9@qL7!zR4#pX2vK8";
        const isOwner = data.identifier === "owner@owner.com" && data.password === "123456asdW#";

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور (Null)" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            
            return res.status(200).json({ 
                message: `أهلاً بك يا ${roleName} 👑`,
                userData: { name: roleName, role: userRole, status: "accepted", grade: "إدارة المنصة" }
            });
        }

        // 🟢 لوجيك تسجيل الدخول للطلاب
        if (data.identifier) {
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password
            });
            
            if (user) {
                // لو المستخدم قديم ومفيش عنده حالة، هنعتبره قيد المراجعة كافتراضي
                const userStatus = user.status || "pending"; 
                return res.status(200).json({ 
                    message: "تم الدخول ✓",
                    userData: { 
                        name: user.first_name, 
                        grade: user.grade, 
                        status: userStatus, 
                        reason: user.rejection_reason || "",
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

            // 🔥 إضافة حالة "قيد المراجعة" للطالب الجديد
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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
