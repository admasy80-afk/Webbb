const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. إعدادات الاتصال بـ MongoDB
const mongoUrl = process.env.MONGO_URL; 
let db;

// دالة الاتصال بقاعدة البيانات
async function connectDB() {
    try {
        const client = new MongoClient(mongoUrl);
        await client.connect();
        db = client.db('dahih_db'); // اسم قاعدة البيانات (تقدر تغيره)
        console.log("✅ تم الاتصال بـ MongoDB بنجاح يا دحيح!");
    } catch (error) {
        console.error("❌ خطأ في الاتصال بـ MongoDB:", error);
    }
}
connectDB();

app.use(express.json());
// تشغيل ملفات الموقع من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// 2. معالجة الطلبات (التسجيل وتسجيل الدخول)
app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;
        const usersCollection = db.collection('users');

        // 🟢 حالة (1): تسجيل الدخول (لو البيانات فيها identifier)
        if (data.identifier) {
            console.log("محاولة تسجيل دخول:", data.identifier);
            
            // البحث عن المستخدم بالبريد أو رقم الهاتف
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password // (يفضل تشفيرها مستقبلاً)
            });

            if (user) {
                return res.status(200).json({ message: "تم تسجيل الدخول بنجاح ✓" });
            } else {
                return res.status(401).json({ message: "البيانات غير صحيحة! تأكد من البريد/الرقم وكلمة المرور." });
            }
        }

        // 🔵 حالة (2): إنشاء حساب جديد (لو البيانات فيها first_name)
        if (data.first_name) {
            console.log("محاولة تسجيل حساب جديد:", data.email);

            // فحص هل الإيميل أو رقم الهاتف مسجلين قبل كدا؟
            const existingUser = await usersCollection.findOne({
                $or: [{ email: data.email }, { phone: data.phone }]
            });

            if (existingUser) {
                return res.status(400).json({ message: "هذا البريد الإلكتروني أو رقم الهاتف مسجل بالفعل!" });
            }

            // حفظ الدحيح الجديد في قاعدة البيانات
            await usersCollection.insertOne(data);
            return res.status(200).json({ message: "تم إنشاء حسابك بنجاح" });
        }

        // لو جيه طلب غريب
        return res.status(400).json({ message: "طلب غير صالح" });

    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ message: "حدث خطأ في السيرفر، يرجى المحاولة لاحقاً." });
    }
});

// أي رابط تاني يفتح الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
