const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const server = createServer(app);
const bareServer = createBareServer('/bare/', { logErrors: false });

const PORT = process.env.PORT || 8080;

app.use(compression({ level: 9 }));
app.use(helmet({ contentSecurityPolicy: false }));

// 1. خدمة ملفات المحرك
app.use('/uv/', express.static(uvPath));

// 2. خدمة ملفات مجلد public (تأكد من وجود هذا المجلد في GitHub)
app.use(express.static(path.join(__dirname, 'public')));

function uvEncode(str) {
    if (!str) return str;
    return encodeURIComponent(str.toString().split('').map((char, ind) => 
        ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char
    ).join(''));
}

// دالة شاشة التحميل مع "رادار كشف الأعطال"
function getLoaderHTML(encodedUrl) {
    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>جاري الاتصال...</title>
            <style>
                body { background: #000; color: #fff; text-align: center; font-family: sans-serif; padding-top: 20vh; }
                .loader { border: 5px solid #333; border-top: 5px solid #1a73e8; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                #status { margin-top: 20px; font-size: 18px; color: #aaa; }
                #error { color: #ff4444; margin-top: 20px; font-weight: bold; display: none; background: #220000; padding: 15px; border-radius: 8px; border: 1px solid #ff4444; width: 80%; margin-left: auto; margin-right: auto; }
            </style>
        </head>
        <body>
            <div class="loader" id="spin"></div>
            <div id="status">🚀 جاري تشغيل محرك Nebula...</div>
            <div id="error"></div>

            <script>
                const errorBox = document.getElementById('error');
                const spin = document.getElementById('spin');
                const status = document.getElementById('status');

                async function start() {
                    try {
                        // اختبار وجود ملفات الإعدادات
                        const configCheck = await fetch('/uv.config.js');
                        if (!configCheck.ok) throw new Error("ملف uv.config.js غير موجود في مجلد public على GitHub!");

                        const swCheck = await fetch('/sw.js');
                        if (!swCheck.ok) throw new Error("ملف sw.js غير موجود في مجلد public على GitHub!");

                        // تحميل الملفات برمجياً
                        const script = document.createElement('script');
                        script.src = '/uv.config.js';
                        script.onload = async () => {
                            try {
                                await navigator.serviceWorker.register('/sw.js', { scope: __uv$config.prefix });
                                window.location.href = __uv$config.prefix + '${encodedUrl}';
                            } catch (e) {
                                showError("فشل تسجيل Service Worker: " + e.message);
                            }
                        };
                        script.onerror = () => showError("فشل تحميل uv.config.js");
                        document.head.appendChild(script);

                    } catch (err) {
                        showError(err.message);
                    }
                }

                function showError(msg) {
                    spin.style.display = 'none';
                    status.style.display = 'none';
                    errorBox.style.display = 'block';
                    errorBox.innerText = "⛔ عطل فني: " + msg;
                }

                start();
            </script>
            <script src="/uv/uv.bundle.js"></script>
        </body>
        </html>
    `;
}

app.get('/yt', (req, res) => {
    const encoded = uvEncode('https://m.youtube.com');
    res.send(getLoaderHTML(encoded));
});

server.on('request', (req, res) => {
    if (bareServer.shouldRoute(req)) bareServer.routeRequest(req, res);
    else app(req, res);
});

server.on('upgrade', (req, socket, head) => {
    if (bareServer.shouldRoute(req)) bareServer.routeUpgrade(req, socket, head);
    else socket.end();
});

server.listen(PORT, '0.0.0.0', () => console.log('Server Live on ' + PORT));
