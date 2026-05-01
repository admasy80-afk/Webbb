const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const app = express();
const PORT = process.env.PORT || 8080;

// =====================
// 🔧 Proxy Support
// =====================
app.set('trust proxy', 1);

// =====================
// 🧠 Core Servers
// =====================
const bareServer = createBareServer('/bare/', {
  logErrors: false
});

// IMPORTANT: unified server handler (fix double-count + headers bug)
const server = http.createServer((req, res) => {
  try {
    // Bare proxy first (important)
    if (bareServer.shouldRoute(req)) {
      return bareServer.routeRequest(req, res);
    }

    // then Express
    return app(req, res);

  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

// WebSocket / upgrade support
server.on('upgrade', (req, socket, head) => {
  try {
    if (bareServer.shouldRoute(req)) {
      bareServer.routeUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

// =====================
// 🔐 Security (safe mode)
// =====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// =====================
// ⚡ Compression
// =====================
app.use(compression({ level: 6 }));

// =====================
// 🚦 Rate Limit (skip proxy routes)
// =====================
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip
});

app.use((req, res, next) => {
  if (req.url.startsWith('/uv') || req.url.startsWith('/bare')) return next();
  limiter(req, res, next);
});

// =====================
// ⚡ Static Assets
// =====================

// Ultraviolet core (long cache)
app.use('/uv/', express.static(uvPath, {
  maxAge: '7d',
  immutable: true
}));

// Public files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'
}));

// =====================
// 🎯 Main Route (NO loading page, direct UX)
// =====================
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Ultra Proxy</title>
  <style>
    body {
      margin:0;
      background:#0d0d0d;
      color:white;
      font-family:Arial;
      display:flex;
      height:100vh;
      align-items:center;
      justify-content:center;
      flex-direction:column;
    }
    input {
      width:300px;
      padding:12px;
      border-radius:10px;
      border:none;
      outline:none;
    }
    button {
      margin-top:10px;
      padding:10px 20px;
      border:none;
      border-radius:10px;
      cursor:pointer;
      background:#00ff88;
    }
  </style>
</head>
<body>

  <h2>🚀 Ultra Proxy</h2>

  <input id="url" placeholder="Enter URL (https://...)" />
  <button onclick="go()">Go</button>

  <script src="/uv/uv.bundle.js"></script>
  <script src="/uv/uv.config.js"></script>

  <script>
    navigator.serviceWorker.register('/sw.js');

    function go() {
      const input = document.getElementById('url').value;
      if (!input) return;

      location.href = '/uv/service/' + __uv$config.encodeUrl(input);
    }
  </script>

</body>
</html>
  `);
});

// =====================
// ❌ Clean 404
// =====================
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// =====================
// 🚀 Start Server
// =====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 Server running: http://localhost:${PORT}`);
});
