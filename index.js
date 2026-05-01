const express = require('express');
const http = require('http');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const bareServer = createBareServer('/bare/');
const PORT = process.env.PORT || 8080;

/* =========================
   STATIC UV FILES
========================= */
app.use('/uv/', express.static(uvPath));

/* =========================
   CONFIG ENDPOINT
========================= */
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
      sw: '/sw.js'
    };
  `);
});

/* =========================
   MAIN PROXY PAGE
========================= */
app.get('/', (req, res) => {
  if (!req.query.__cpo) {
    return res.send(`
      <html style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px">
        <h2>Ultra Proxy</h2>
        <input id="u" placeholder="https://example.com" style="padding:10px;width:300px">
        <button onclick="go()">Go</button>

        <script>
          function go(){
            let u = document.getElementById('u').value;
            if(!u.startsWith('http')) u = 'https://' + u;
            location.href='/?__cpo=' + btoa(u);
          }
        </script>
      </html>
    `);
  }

  let target;
  try {
    target = Buffer.from(req.query.__cpo, 'base64').toString();
  } catch {
    return res.status(400).send('Invalid URL');
  }

  return res.send(`
<!DOCTYPE html>
<html>
<head>
  <script src="/uv/uv.bundle.js"></script>
  <script src="/uv.config.js"></script>
</head>

<body style="margin:0;background:#111;overflow:hidden">

<div id="loader" style="color:#00ff88;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
  Loading...
</div>

<iframe id="frame" style="width:100%;height:100%;border:none;display:none"></iframe>

<script>
(async () => {
  const frame = document.getElementById('frame');
  const loader = document.getElementById('loader');

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    loader.style.display = 'none';
    frame.style.display = 'block';

    const encoded = __uv$config.encodeUrl("${target}");
    frame.src = __uv$config.prefix + encoded;

  } catch (e) {
    loader.innerHTML = "Proxy Error: " + e.message;
    loader.style.color = "red";
  }
})();
</script>

</body>
</html>
  `);
});

/* =========================
   SERVICE WORKER (STABLE CORE)
========================= */
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

/* =========================
   PROXY ERROR SAFETY LAYER
========================= */
app.get('/proxy/*', (req, res) => {
  res.status(500).send(`
    <h1 style="color:white;background:#111;text-align:center;padding:20px">
      Proxy routing error
    </h1>
  `);
});

/* =========================
   💥 SINGLE ENTRY POINT (IMPORTANT)
========================= */
const server = http.createServer((req, res) => {

  // 1. Bare takes priority
  if (bareServer.shouldRoute(req)) {
    return bareServer.routeRequest(req, res);
  }

  // 2. Everything else → Express
  return app(req, res);
});

/* WebSocket / Upgrade handling */
server.on('upgrade', (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    return bareServer.routeUpgrade(req, socket, head);
  }
  socket.destroy();
});

/* =========================
   START SERVER
========================= */
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Production Proxy running on ${PORT}`);
});
