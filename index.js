const express = require('express');
const http = require('http');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// 1. إنشاء خادم Bare للبروكسي (أساس الشغل)
const bareServer = createBareServer('/bare/');

// 2. تقديم ملفات Ultraviolet الأساسية
app.use('/uv/', express.static(uvPath));

// 3. واجهة بسيطة جداً جداً (مربع بحث بس)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ultra Proxy - Fast</title>
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #121212; color: white; margin: 0; overflow: hidden; }
            .container { text-align: center; z-index: 10; }
            input { padding: 15px; width: 400px; border-radius: 8px; border: none; outline: none; font-size: 16px; background: #222; color: white; margin-bottom: 20px;}
            button { padding: 15px 30px; background-color: #00ff88; border: none; border-radius: 8px; cursor: pointer; color: black; font-weight: bold; font-size: 16px; transition: 0.2s;}
            button:hover { background-color: #00cc6a; }
            iframe { width: 100vw; height: 100vh; border: none; display: none; position: absolute; top: 0; left: 0; background: white; z-index: 20; }
        </style>
    </head>
    <body>
        <div class="container" id="ui">
            <h1>⚡ Ultra Proxy</h1>
            <p style="color: #888; margin-bottom: 20px;">Fast, Simple, No Tracking.</p>
            <input type="text" id="url" placeholder="Enter URL (e.g., youtube.com)" autofocus autocomplete="off">
            <br>
            <button onclick="go()">Browse / تصفح</button>
        </div>
        
        <iframe id="frame"></iframe>

        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
        <script>
            // تشغيل الـ Service Worker عشان البروكسي يشتغل
            navigator.serviceWorker.register('/sw.js', { scope: '/' });

            function go() {
                let url = document.getElementById('url').value.trim();
                if (!url) return;
                
                // لو مفيش http، ضيفها أو ابحث في جوجل
                if (!/^https?:\\/\\//i.test(url)) {
                    if (url.includes('.')) {
                        url = 'https://' + url;
                    } else {
                        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
                    }
                }

                // تشفير الرابط وفتح الـ iframe
                const encodedUrl = __uv$config.encodeUrl(url);
                document.getElementById('ui').style.display = 'none';
                const frame = document.getElementById('frame');
                frame.style.display = 'block';
                frame.src = '/uv/service/' + encodedUrl;
            }

            document.getElementById('url').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') go();
            });
        </script>
    </body>
    </html>
  `);
});

// 4. ملف الـ Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    importScripts('/uv/uv.bundle.js');
    importScripts('/uv/uv.config.js');
    importScripts('/uv/uv.sw.js');
    const sw = new UVServiceWorker();
    self.addEventListener('fetch', (event) => {
        event.respondWith(
            (async () => {
                if (event.request.url.includes('/uv/')) return await sw.fetch(event);
                return await fetch(event.request);
            })()
        );
    });
  `);
});

// 5. توجيه الطلبات للـ Bare Server أو للـ App العادي
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

// تشغيل السيرفر
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Proxy is running fast & clean on port ${PORT}`);
});
