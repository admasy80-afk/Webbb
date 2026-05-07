const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- [جزء قاعدة البيانات - ده اللي هيتغير بس لما ننقل] ---
let usersCollection;

async function connectToData() {
    // حالياً بنستخدم مونجو عشان إحنا على Railway
    if (process.env.MONGO_URL) {
        const client = new MongoClient(process.env.MONGO_URL);
        await client.connect();
        usersCollection = client.db('dahih_db').collection('users');
        console.log("✅ شغالين مونجو حالياً على ريلواي");
    }
}
connectToData();
// -------------------------------------------------------

app.post('/api/saveUser', async (req, res) => {
    try {
        const data = req.body;

        // 🟢 لوجيك تسجيل الدخول
        if (data.identifier) {
            const user = await usersCollection.findOne({
                $or: [{ email: data.identifier }, { phone: data.identifier }],
                password: data.password
            });
            return user ? res.status(200).json({ message: "تم الدخول ✓" }) 
                        : res.status(401).json({ message: "خطأ في البيانات" });
        }

        // 🔵 لوجيك إنشاء الحساب
        if (data.first_name) {
            const existing = await usersCollection.findOne({
                $or: [{ email: data.email }, { phone: data.phone }]
            });
            if (existing) return res.status(400).json({ message: "بياناتك مسجلة مسبقاً" });

            await usersCollection.insertOne(data);
            return res.status(200).json({ message: "تم إنشاء حسابك بنجاح" });
        }

    } catch (error) {
        res.status(500).json({ message: "عطل فني مؤقت" });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Running on ${PORT}`));
