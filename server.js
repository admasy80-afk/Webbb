require('dotenv').config();
const express = require('express');
const path = require('path');
const compression = require('compression');
const hpp = require('hpp');

// الاستيرادات الخاصة بنا
const { connectMongo, getClient, logger } = require('./config/db');
const setupSecurity = require('./config/security');
const sanitizeMiddleware = require('./middleware/sanitize');
const initCronJobs = require('./utils/cronJobs');

// استيراد المسارات
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const publicRoutes = require('./routes/publicRoutes');

if (!process.env.JWT_SECRET) {
    logger.fatal("FATAL ERROR: JWT_SECRET environment variable is missing.");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
let server;

// 1. إعدادات الحماية والأمان
setupSecurity(app);

// 2. الـ Middlewares العامة
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(sanitizeMiddleware);
app.use(hpp());

// إضافة الـ Request ID لتتبع الطلبات
app.use((req, res, next) => {
    const crypto = require('crypto');
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

// 3. ربط المسارات (Routes)
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes); // تعديل طفيف لضم مسارات الطالب تحت بادئة واحدة
app.use('/api/public', publicRoutes);

// مسارات فرعية خاصة بالتوافق والـ Loader.io
app.get('/loaderio-b00f7b4f538e02991e1faafc9686e4f4/', (req, res) => res.send('loaderio-b00f7b4f538e02991e1faafc9686e4f4'));
app.use('/api/*', (req, res) => res.status(404).json({ message: "المسار غير موجود (API 404)." }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 4. تشغيل السيرفر وقاعدة البيانات
async function startServer() {
    await connectMongo();
    
    // تشغيل وظائف الكرون الدوري
    initCronJobs();

    server = app.listen(PORT, () => logger.info(`🚀 السيرفر شغال ومستعد لخدمة الطلبة على بورت ${PORT}`));
    
    // إعدادات الـ Timeouts لدعم الملفات الكبيرة (2GB)
    server.headersTimeout = 65000;
    server.requestTimeout = 0; // مفتوح لعمليات الرفع الطويلة
    server.keepAliveTimeout = 60000;
    server.timeout = 30 * 60 * 1000; // 30 دقيقة كحد أقصى للسوكت
}

startServer();

// معالجة الأخطاء غير المتوقعة والإغلاق الآمن (Graceful Shutdown)
process.on('unhandledRejection', (err) => { logger.error({ err: err?.message }, 'unhandledRejection'); });
process.on('uncaughtException', (err) => { logger.error({ err: err?.message }, 'uncaughtException'); });
process.on('SIGINT', async () => {
    if (server) {
        server.close(async () => {
            try {
                const client = getClient();
                if (client) await client.close();
            } catch (e) {}
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
