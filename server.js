const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// تشغيل ملفات الـ HTML من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// محاكاة الـ API بتاع كلاود فلير عشان كودك ما يتغيرش
app.post('/api/saveUser', async (req, res) => {
    console.log("بيانات مستلمة على Railway:", req.body);
    
    // هنا تقدر تربط بـ Supabase أو أي قاعدة بيانات تانية مؤقتاً
    res.status(200).json({ message: "تم الاستلام بنجاح على Railway ✓" });
});

// أي رابط تاني يفتح الـ index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

