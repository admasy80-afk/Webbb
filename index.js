const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ✅ حل مشكلة X-Forwarded-For (مهم جدًا)
app.set('trust proxy', 1);

// ✅ إنشاء السيرفر بشكل صحيح
const server = createServer(app);

const bareServer = createBareServer('/bare/', {
    logErrors: false
});

const PORT = process.env.PORT || 8080;


// ==================
// 🔐 حماية + أداء (خفيف)
// ==================
app.use(helmet({
    contentSecurityPolicy: false
}));

// ✅ Rate limit بدون مشاكل
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// ✅ ضغط متوازن (أفضل من 9)
app.use(compression({ level: 6 }));


// ==================
// 📁 المسارات
// ==================
app.use('/uv/', express.static(uvPath));
app.use(express.static(path.join(__dirname, 'public')));


// ==================
// 🔒 تشفير خفيف (أسرع)
// ==================
function uvEncode(str) {
    if (!str) return str;

    return encodeURIComponent(
        str.split('').map((c, i) =>
            i % 2 ? String.fromCharCode(c.charCodeAt(0) ^ 5) : c
        ).join('')
    );
}


// ==================
// 🎬 يوتيوب سريع
// ==================
app.get('/yt', (req, res) => {
    const target = 'https://m.youtube.com';

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
    </head>
    <body style="background:#000;color:#fff;text-align:center;padding-top:25vh">
        <h3>🚀 جاري الدخول...</h3>
        <script>
            navigator.serviceWorker.register('/sw.js').then(() => {
                location.href = '/uv/service/' + __uv$config.encodeUrl('${target}');
            });
        </script>
    </body>
    </html>
    `);
});


// ==================
// ⚙️ إصلاح التعليق (محسن)
// ==================
app.get('/uv/service/*', (req, res) => {
    if (res.headersSent) return;

    res.send(`
    <html>
    <head>
        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
    </head>
    <body style="background:#000;color:#fff;text-align:center;padding-top:20vh">
        <h3>⚙️ تهيئة الاتصال...</h3>
        <script>
            navigator.serviceWorker.register('/sw.js').then(reg => {
                reg.update();
                setTimeout(() => location.reload(), 500);
            });
        </script>
    </body>
    </html>
    `);
});


// ==================
// ❌ 404 (آمن)
// ==================
app.use((req, res) => {
    if (!res.headersSent) {
        res.status(404).send('❌ Not Found');
    }
});


// ==================
// 🔌 الربط الأساسي
// ==================
server.on('request', (req, res) => {
    try {
        if (bareServer.shouldRoute(req)) {
            bareServer.routeRequest(req, res);
        } else {
            app(req, res);
        }
    } catch (e) {
        if (!res.headersSent) {
            res.status(500).end('Internal Error');
        }
    }
});

server.on('upgrade', (req, socket, head) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
    } else {
        socket.destroy();
    }
});


// ==================
// 🚀 تشغيل
// ==================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 شغال على http://localhost:${PORT}`);
});
