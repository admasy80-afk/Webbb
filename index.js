const express = require('express');
const http = require('http');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const server = http.createServer();
const PORT = process.env.PORT || 8080;

const bareServer = createBareServer('/bare/');

// 1. ملف الإعدادات
app.get('/uv.config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    self.__uv$config = {
        prefix: '/proxy/',
        bare: '/bare/',
        encodeUrl: Ultraviolet.codec.xor.encode,
        decodeUrl: Ultraviolet.codec.xor.decode,
        handler: '/uv/uv.handler.js',
        bundle: '/uv/uv.bundle.js',
        config: '/uv.config.js',
        sw: '/uv/uv.sw.js',
    };
  `);
});

// 2. مسار طوارئ: لو المتصفح هرب من الـ Service Worker يقع هنا بدل الشاشة البيضاء
app.get('/proxy/*', (req, res) => {
  res.status(500).send(`
    <html style="background:#111; color:#fff; text-align:center; padding:50px; font-family:sans-serif;">
      <h2>⚠️ خطأ في الاستقبال</h2>
      <p style="color:#ff4444;">المتصفح لم يفعل البروكسي بشكل صحيح.</p>
      <button onclick="window.location.reload()" style="padding:15px 30px; background:#00ff88; color:#000; border:none; border-radius:8px; cursor:pointer; font-size:16px;">تحديث الصفحة ⚡</button>
    </html>
  `);
});

// 3. ملفات UV الأساسية
app.use('/uv/', express.static(uvPath));

// 4. مسار الصفحة الرئيسية
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
        <script src="/uv.config.js"></script>
      </head>
      <body style="margin:0; padding:0; height:100%; background: #111; overflow: hidden;">
        
        <div id="loader" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#00ff88; font-family:sans-serif; font-size: 20px;">
          ⚡ جاري الاتصال...
        </div>

        <iframe id="proxyFrame" style="width:100%; height:100%; border:none; display:none; background:#111;"></iframe>

        <script>
          async function startProxy() {
            const frame = document.getElementById('proxyFrame');
            const loader = document.getElementById('loader');

            try {
              // تسجيل الـ SW بنجاح
              await navigator.serviceWorker.register('/sw.js', { scope: '/' });
              await navigator.serviceWorker.ready;

              // إخفاء التحميل وعرض الفريم
              loader.style.display = 'none';
              frame.style.display = 'block';

              // تشفير الرابط ووضعه في الـ iframe
              const encodedTarget = __uv$config.encodeUrl("` + targetUrl + `");
              frame.src = __uv$config.prefix + encodedTarget;

            } catch (err) {
              loader.style.color = '#ff4444';
              loader.innerHTML = '❌ حدث خطأ في النظام:<br>' + err.message;
            }
          }

          startProxy();
        </script>
      </body>
      </html>
    `);
  }

  // الصفحة الرئيسية للبحث
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

// 5. الـ Service Worker (أضفنا فيه تصليح الروابط عشان ميجيبش شاشة بيضاء + اصطياد الأخطاء)
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    importScripts('/uv/uv.bundle.js');
    importScripts('/uv.config.js');
    importScripts('/uv/uv.sw.js');
    
    const sw = new UVServiceWorker();
    
    self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

    self.addEventListener('fetch', event => {
      event.respondWith(
        (async () => {
          try {
            // لو الرابط يخص البروكسي، خليه يمر من مكتبة UV
            if (event.request.url.startsWith(location.origin + __uv$config.prefix)) {
              return await sw.fetch(event);
            }
            // لو أي رابط تاني (صور/سكربتات عادية للموقع)، يمر بشكل طبيعي
            return await fetch(event.request);
          } catch (error) {
            console.error("SW Proxy Error:", error);
            return new Response("<html style='background:#111;color:#ff4444;text-align:center;padding:20px;'><h2>❌ خطأ داخلي في البروكسي</h2><p>" + error.message + "</p></html>", { headers: { 'Content-Type': 'text/html' } });
          }
        })()
      );
    });
  `);
});

// 6. توجيه الطلبات (Bare Server)
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
  console.log('✅ Proxy is READY on port ' + PORT);
});
