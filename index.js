const express = require('express');
const http = require('http');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

const bareServer = createBareServer('/bare/');

// ملفات UV
app.use('/uv/', express.static(uvPath));

// config
app.get('/uv.config.js', (req, res) => {
  res.type('application/javascript').send(`
    self.__uv$config = {
      prefix: '/proxy/',
      bare: '/bare/',
      encodeUrl: Ultraviolet.codec.xor.encode,
      decodeUrl: Ultraviolet.codec.xor.decode,
      handler: '/uv/uv.handler.js',
      bundle: '/uv/uv.bundle.js',
      config: '/uv.config.js',
      sw: '/uv/uv.sw.js'
    };
  `);
});

// صفحة الطوارئ
app.get('/proxy/*', (req, res) => {
  res.status(500).send(`<h2 style="color:white;background:#111;padding:20px">
  Proxy Error</h2>`);
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
  if (req.query.__cpo) {
    let targetUrl;

    try {
      targetUrl = Buffer.from(req.query.__cpo, 'base64').toString();
    } catch {
      return res.send('Invalid URL');
    }

    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Proxy</title>
  <script src="/uv/uv.bundle.js"></script>
  <script src="/uv.config.js"></script>
</head>

<body style="margin:0;background:#111;overflow:hidden">

<div id="loader" style="color:#0f0;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
  Loading...
</div>

<iframe id="frame" style="width:100%;height:100%;border:none;display:none"></iframe>

<script>
async function start() {
  const frame = document.getElementById('frame');
  const loader = document.getElementById('loader');

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    loader.style.display = 'none';
    frame.style.display = 'block';

    const encoded = __uv$config.encodeUrl("${targetUrl}");
    frame.src = __uv$config.prefix + encoded;

  } catch (e) {
    loader.innerHTML = "Error: " + e.message;
    loader.style.color = "red";
  }
}

start();
</script>

</body>
</html>
    `);
  }

  res.send(`
    <input id="u" placeholder="url">
    <button onclick="go()">Go</button>
    <script>
      function go(){
        let u = document.getElementById('u').value;
        if(!u.startsWith('http')) u = 'https://' + u;
        location.href='/?__cpo=' + btoa(u);
      }
    </script>
  `);
});

// Service Worker (نظيف بدون override خطير)
app.get('/sw.js', (req, res) => {
  res.type('application/javascript').send(`
    importScripts('/uv/uv.bundle.js');
    importScripts('/uv.config.js');
    importScripts('/uv/uv.sw.js');

    const sw = new UVServiceWorker();

    self.addEventListener('fetch', event => {
      event.respondWith(sw.fetch(event));
    });
  `);
});

// Bare routing (مهم جداً)
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

// تشغيل
server.listen(PORT, () => {
  console.log('Proxy running on port', PORT);
});
