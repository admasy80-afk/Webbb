const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ✅ أهم تصليح (كان غلط عندك)
const server = createServer(app);

const bareServer = createBareServer('/bare/', {
    logErrors: false
});

const PORT = process.env.PORT || 8080;


// ==================
// 🔐 حماية + أداء
// ==================
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300
}));

app.use(compression({ level: 6 }));


// ==================
// 📁 المسارات
// ==================

// ملفات Ultraviolet
app.use('/uv/', express.static(uvPath));

// ملفاتك
app.use(express.static(path.join(__dirname, 'public')));


// ==================
// 🔒 تشفير (محسن)
// ==================
function uvEncode(str) {
    if (!str) return str;

    return encodeURIComponent(
        str.split('').map((char, i) =>
            i % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 7) : char
        ).join('')
    );
}


// ==================
// 🎬 يوتيوب سريع
// ==================
app.get('/yt', (req, res) => {
    const target = 'https://m.youtube.com';
    const encoded = uvEncode(target);

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>جارٍ التحميل...</title>
        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
        <style>
            body {
                background: #050505;
                color: #fff;
                text-align: center;
                font-family: sans-serif;
                padding-top: 25vh;
            }
            .loader {
                border: 4px solid #222;
                border-top: 4px solid #1a73e8;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="loader"></div>
        <h3>🚀 جاري الاتصال...</h3>

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
// ⚙️ إصلاح التعليق
// ==================
app.get('/uv/service/*', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
    </head>
    <body style="background:#000;color:#fff;text-align:center;padding-top:20vh;">
        <h3>⚙️ إعادة تهيئة الاتصال...</h3>
        <script>
            navigator.serviceWorker.register('/sw.js').then(reg => {
                reg.update();
                setTimeout(() => location.reload(), 800);
            });
        </script>
    </body>
    </html>
    `);
});


// ==================
// ❌ 404
// ==================
app.use((req, res) => {
    res.status(404).send('❌ Not Found');
});


// ==================
// 🔌 الربط الأساسي
// ==================
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
        socket.destroy();
    }
});


// ==================
// 🚀 تشغيل
// ==================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 شغال على http://localhost:${PORT}`);
});
