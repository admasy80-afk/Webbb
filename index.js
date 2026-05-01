const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = createServer(app);
const bareServer = createBareServer('/bare/', {
    logErrors: false,
    maintainer: {
        email: 'nebula@secure.proxy',
        website: 'https://nebula.proxy'
    }
});

// ضبط البورت ليتوافق مع Railway تلقائياً
const PORT = process.env.PORT || 8080;

// 1. تحسين الأداء والحماية
app.use(compression({ level: 9, threshold: 0 }));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' }
});
app.use(limiter);

// 2. إعدادات الـ Headers لضمان تخطي الحجب
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'Nebula-Ultra');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// ==========================================
// 🚀 الترتيب الصحيح للمسارات
// ==========================================

// أولاً: خدمة ملفات محرك Ultraviolet (مهم جداً أن يكون في البداية)
app.use('/uv/', express.static(uvPath));

// ثانياً: معالجة طلبات الـ Bare Server لضمان عمل المواقع
app.use('/bare/', (req, res) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
    }
});

// ثالثاً: خدمة ملفات الواجهة من مجلد public
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html', 'js', 'css']
}));

app.use(express.json({ limit: '10mb' }));

// ==========================================
// 🔗 ميزة الروابط المباشرة (CroxyProxy Style) مع شاشة تحميل
// ==========================================

function uvEncode(str) {
    if (!str) return str;
    return encodeURIComponent(str.toString().split('').map((char, ind) => 
        ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char
    ).join(''));
}

// دالة بترجع شاشة التحميل الذكية
function getLoaderHTML(encodedUrl, title) {
    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <script src="/uv/uv.bundle.js"></script>
            <script src="/uv.config.js"></script>
            <style>
                body { background: #111; color: #fff; text-align: center; font-family: Arial, sans-serif; padding-top: 30vh; margin: 0; }
                .loader { border: 4px solid #333; border-top: 4px solid #1a73e8; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <h2>🚀 جاري تخطي الحجب وتجهيز الاتصال الآمن...</h2>
            <div class="loader"></div>
            <script>
                // تشغيل الموتور وبعدين التوجيه فوراً
                navigator.serviceWorker.register('/sw.js', { scope: __uv$config.prefix })
                    .then(() => {
                        window.location.href = __uv$config.prefix + '${encodedUrl}';
                    }).catch(err => {
                        document.body.innerHTML += "<p style='color:red;'>حدث خطأ أثناء تحميل المحرك</p>";
                        console.error(err);
                    });
            </script>
        </body>
        </html>
    `;
}

// رابط يوتيوب المباشر
app.get('/yt', (req, res) => {
    if (res.headersSent) return;
    const target = 'https://m.youtube.com';
    const encoded = uvEncode(target); 
    res.send(getLoaderHTML(encoded, "جاري فتح يوتيوب..."));
});

// رابط التوجيه العام لأي موقع (Base64)
app.get('/go/:base64url', (req, res) => {
    if (res.headersSent) return;
    try {
        const target = Buffer.from(req.params.base64url, 'base64').toString('utf-8');
        const encoded = uvEncode(target);
        res.send(getLoaderHTML(encoded, "جاري فتح الموقع..."));
    } catch (e) {
        return res.status(400).send('Invalid Link Format');
    }
});

// ==========================================

// 4. واجهات الـ API المساعدة
app.get('/api/health', (req, res) => {
    return res.json({ status: 'online', timestamp: Date.now() });
});

app.get('/api/suggestions', async (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.json([]);
    try {
        const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        return res.json(data[1] || []);
    } catch (err) {
        return res.json([]);
    }
});

// 5. معالجة الأخطاء لضمان عدم توقف السيرفر
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error("[Server Error]:", err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
});

// 6. الربط بين Bare Server والـ HTTP Server
server.on('request', (req, res) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
    } else {
        app(req, res);
    }
});

server.on('upgrade', (req, socket, head) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
    } else {
        socket.end();
    }
});

// 7. انطلاق السيرفر
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║              🚀 ULTRA SECURE PROXY SYSTEM 🚀              ║
    ╠═══════════════════════════════════════════════════════════╣
    ║  Status: ONLINE (Optimized for Railway)                   ║
    ║  Port: ${PORT}                                              ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
});

process.on('uncaughtException', (err) => console.error('Exception:', err));
process.on('unhandledRejection', (reason) => console.error('Rejection:', reason));
