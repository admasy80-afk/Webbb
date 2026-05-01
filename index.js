const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');

const app = express();
const server = createServer();
const bareServer = createBareServer('/bare/', { logErrors: false });

const PORT = process.env.PORT || 8080;

app.use(compression({ level: 9 }));

// 1. مسار محرك فك التشفير
app.use('/uv/', express.static(uvPath));

// 2. مسار ملفات الإعدادات بتاعتك (public)
app.use(express.static(path.join(__dirname, 'public')));

// 3. دالة التشفير الصاروخية
function uvEncode(str) {
    if (!str) return str;
    return encodeURIComponent(str.toString().split('').map((char, ind) => 
        ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char
    ).join(''));
}

// 4. رابط يوتيوب المباشر
app.get('/yt', (req, res) => {
    if (res.headersSent) return;
    const encoded = uvEncode('https://m.youtube.com');
    
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>جاري تشغيل Nebula...</title>
            <script src="/uv/uv.bundle.js"></script>
            <script src="/uv.config.js"></script>
            <style>
                body { background: #050505; color: #fff; text-align: center; font-family: sans-serif; padding-top: 25vh; margin:0; }
                .loader { border: 4px solid #222; border-top: 4px solid #1a73e8; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="loader" id="spin"></div>
            <h3>🚀 جاري إنشاء نفق مشفر ليوتيوب...</h3>
            <script>
                if (typeof __uv$config !== 'undefined') {
                    navigator.serviceWorker.register('/sw.js', { scope: __uv$config.prefix })
                        .then(() => {
                            window.location.href = __uv$config.prefix + '${encoded}';
                        });
                }
            </script>
        </body>
        </html>
    `);
});

// 🌟 5. شبكة الأمان (هنا السحر لحل مشكلة Not Found)
app.get('/uv/service/*', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>جاري التفعيل...</title>
            <script src="/uv/uv.bundle.js"></script>
            <script src="/uv.config.js"></script>
        </head>
        <body style="background: #050505; color: #fff; text-align: center; font-family: sans-serif; padding-top: 25vh; margin:0;">
            <h3>⚙️ جاري التفعيل النهائي للاتصال...</h3>
            <script>
                // المتصفح كان سريع جداً، فهنسجل المحرك تاني ونعمل ريفريش
                if (typeof __uv$config !== 'undefined') {
                    navigator.serviceWorker.register('/sw.js', { scope: __uv$config.prefix })
                        .then(() => {
                            setTimeout(() => window.location.reload(), 500);
                        });
                }
            </script>
        </body>
        </html>
    `);
});

// 6. حماية من الروابط العشوائية (404)
app.use((req, res) => {
    if (!res.headersSent) {
        res.status(404).send('Not Found: ' + req.url);
    }
});

// 7. تشغيل السيرفر الأساسي والـ Bare
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

server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Server is ONLINE on port ' + PORT);
});
