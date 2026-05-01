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

// 4. رابط يوتيوب المباشر (النسخة المضمونة بالترتيب الصحيح)
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
                #error { color: #ff4444; margin-top: 20px; font-weight: bold; font-size: 16px; direction: ltr; }
            </style>
        </head>
        <body>
            <div class="loader" id="spin"></div>
            <h3>🚀 جاري إنشاء نفق مشفر ليوتيوب...</h3>
            <div id="error"></div>
            <script>
                setTimeout(async () => {
                    try {
                        if (typeof __uv$config === 'undefined') {
                            throw new Error("ملف uv.config.js فشل في التحميل! تأكد من وجوده في مجلد public.");
                        }
                        // تسجيل المحرك
                        await navigator.serviceWorker.register('/sw.js', { scope: __uv$config.prefix });
                        // الانطلاق ليوتيوب
                        window.location.href = __uv$config.prefix + '${encoded}';
                    } catch (e) {
                        document.getElementById('spin').style.display = 'none';
                        document.getElementById('error').innerHTML = "⛔ عطل فني: " + e.message;
                    }
                }, 400);
            </script>
        </body>
        </html>
    `);
});

// 5. حماية من الروابط العشوائية (404)
app.use((req, res) => {
    if (!res.headersSent) {
        res.status(404).send('Not Found: ' + req.url);
    }
});

// 6. تشغيل السيرفر الأساسي والـ Bare
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
