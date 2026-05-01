const express = require('express');
const { createServer } = require('http');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const path = require('path');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// خدمة ملفات Ultraviolet المحرك الأساسي
app.use('/uv/', express.static(uvPath));

// خدمة مجلد الواجهة (جوجل التمويهي)
app.use(express.static(path.join(__dirname, 'public')));

// تشغيل السيرفر
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy is live on port ${PORT}`);
});

