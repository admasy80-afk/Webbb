const express = require('express');
const http = require('http');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const server = http.createServer(); // نظيف ومفيش أخطاء هيدرز
const PORT = process.env.PORT || 8080;

// 1. خادم Bare للبروكسي
const bareServer = createBareServer('/bare/');

// 2. ملفات Ultraviolet
app.use('/uv/', express.static(uvPath));

// =====================================
// 🚨 هنا كان الخطأ! المسار اللي نسيته في النسخة اللي فاتت
// =====================================
app.get('/uv/service/*', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Loading...</title>
      <script src="/uv/uv.bundle.js"></script>
      <script src="/uv/uv.config.js"></script>
    </head>
    <body style="background: #111; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; margin: 0;">
      <h2>جاري التحويل... ⚡</h2>
      <script>
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
          // بنخلي الـ Service Worker يمسك الرابط وبعدين نعمل ريفريش عشان يفتح الموقع
          setTimeout(() => { window.location.reload(); }, 500);
        });
      </script>
    </body>
    </html>
  `);
});

// 3. مسار الصفحة الرئيسية (استقبال الرابط المباشر)
app.get('/', (req, res) => {
  // لو الرابط فيه __cpo (الرابط السريع)
  if (req.query.__cpo) {
    let targetUrl;
    try {
      targetUrl = Buffer.from(req.query.__cpo, 'base64').toString('utf-8');
    } catch (e) {
      return res.send('Error: Invalid URL');
    }

    return res.send(`
      <!DOCTYPE html>
      <html style="margin:0; padding:0; height:100%;">
      <head>
        <title>Loading...</title>
        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
      </head>
      <body style="margin:0; padding:0; height:100%; background: #111; overflow: hidden;">
        <script>
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
              const encodedTarget = __uv$config.encodeUrl("${targetUrl}");
              window.location.href = '/uv/service/' + encodedTarget;
            });
          }
        </script>
      </body>
      </html>
    `);
  }

  // الواجهة البسيطة لصنع الروابط
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Proxy Generator</title>
      <style>
        body { background: #111; color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; margin: 0;}
        input { padding: 12px; width: 300px; border-radius: 5px; border: none; margin-bottom: 15px; outline: none; background: #222; color: #fff;}
        button { padding: 12px 20px; background: #00ff88; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; color: black;}
      </style>
    </head>
    <body>
      <h3>🔗 أدخل الرابط لإنشاء رابط مباشر</h3>
      <input type="text" id="url" placeholder="youtube.com">
      <button onclick="go()">دخول / تحويل</button>
      <script>
        function go() {
          let url = document.getElementById('url').value.trim();
          if (!url) return;
          if (!/^https?:\\/\\//i.test(url)) url = 'https://' + url;
          
          const b64 = btoa(url);
          window.location.href = '/?__cpo=' + b64;
        }
      </script>
    </body>
    </html>
  `);
});

// 4. الـ Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    importScripts('/uv/uv.bundle.js');
    importScripts('/uv/uv.config.js');
    importScripts('/uv/uv.sw.js');
    const sw = new UVServiceWorker();
    self.addEventListener('fetch', (event) => {
      event.respondWith((async () => {
        if (event.request.url.includes('/uv/')) return await sw.fetch(event);
        return await fetch(event.request);
      })());
    });
  `);
});

// 5. توجيه الطلبات
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

// 6. تشغيل السيرفر
server.listen(PORT, '0.0.0.0', () => {
  console.log(\`✅ Direct Proxy running on port \${PORT}\`);
});
