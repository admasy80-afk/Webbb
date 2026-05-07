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

app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;

        // فحص إضافي للتأكد من وجود المتغير
        if (!usersCollection) {
            return res.status(500).json({ message: "السيرفر لسه بيسخن.. حاول كمان ثواني" });
        }

        // 🟢 لوجيك تسجيل الدخول
        if (data.identifier) {
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password
            });
            return user ? res.status(200).json({ message: "تم الدخول ✓" }) 
                        : res.status(401).json({ message: "خطأ في بيانات الدخول" });
        }

        // 🔵 لوجيك إنشاء الحساب
        if (data.first_name) {
            const existing = await usersCollection.findOne({
                $or: [{ email: data.email }, { phone: data.phone }]
            });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            await usersCollection.insertOne(data);
            return res.status(200).json({ message: "تم إنشاء حسابك بنجاح" });
        }

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ message: "حدث خطأ أثناء معالجة البيانات" });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
