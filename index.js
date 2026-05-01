const express = require('express');
const http = require('http');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const server = http.createServer();
const PORT = process.env.PORT || 8080;

// 1. خادم Bare للبروكسي
const bareServer = createBareServer('/bare/');

// 2. ملفات Ultraviolet الأساسية
app.use('/uv/', express.static(uvPath));

// ❌ تم حذف مسار الحماية (app.get('/uv/service/*')) لأنه سبب الـ Loop المفرغ

// 3. مسار الصفحة الرئيسية (استقبال الرابط المباشر)
app.get('/', (req, res) => {
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
        <title>Ultra Proxy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="/uv/uv.bundle.js"></script>
        <script src="/uv/uv.config.js"></script>
      </head>
      <body style="margin:0; padding:0; height:100%; background: #000; overflow: hidden;">
        
        <div id="loader" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#00ff88; font-family:sans-serif; font-size: 20px;">
          ⚡ جاري الفتح...
        </div>

        <iframe id="proxyFrame" style="width:100%; height:100%; border:none; display:none; background:#fff;"></iframe>

        <script>
          function loadProxy() {
            const encodedTarget = __uv$config.encodeUrl("` + targetUrl + `");
            const frame = document.getElementById('proxyFrame');
            const loader = document.getElementById('loader');
            
            frame.onload = () => { loader.style.display = 'none'; };
            frame.style.display = 'block';
            frame.src = __uv$config.prefix + encodedTarget;
          }

          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
              // التأكد من أن الـ Service Worker سيطر فعلياً على الصفحة قبل تحميل الـ iframe
              if (!navigator.serviceWorker.controller) {
                navigator.serviceWorker.addEventListener('controllerchange', loadProxy);
              } else {
                loadProxy();
              }
            }).catch(err => console.error("SW Error:", err));
          }
        </script>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Proxy Generator</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { background: #111; color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; margin: 0;}
        input { padding: 15px; width: 350px; max-width: 90%; border-radius: 8px; border: none; margin-bottom: 20px; outline: none; background: #222; color: #fff; font-size: 16px;}
        button { padding: 15px 30px; background: #00ff88; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; color: black; transition: 0.2s;}
        button:hover { background: #00cc6a; }
      </style>
    </head>
    <body>
      <h3>🔗 أدخل الرابط لإنشاء رابط مباشر</h3>
      <input type="text" id="url" placeholder="مثال: youtube.com">
      <button onclick="go()">دخول / تحويل ⚡</button>
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

// 4. الـ Service Worker (تم تعديله ليعمل فوراً بدون انتظار)
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    importScripts('/uv/uv.bundle.js');
    importScripts('/uv/uv.config.js');
    importScripts('/uv/uv.sw.js');
    
    const sw = new UVServiceWorker();
    
    // إجبار المتصفح على تفعيل البروكسي فوراً
    self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

    self.addEventListener('fetch', (event) => {
      event.respondWith((async () => {
        // التحقق الصحيح من مسار Ultraviolet
        if (event.request.url.startsWith(location.origin + __uv$config.prefix)) {
          return await sw.fetch(event);
        }
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
  console.log('✅ Proxy is READY on port ' + PORT);
});
