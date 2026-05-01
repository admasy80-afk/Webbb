const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ✅ مهم خلف البروكسي (Render/Railway/NGINX)
app.set('trust proxy', 1);

const server = createServer(app);

const bareServer = createBareServer('/bare/', {
  logErrors: false
});

const PORT = process.env.PORT || 8080;


// ==================
// 🔐 حماية خفيفة بدون كسر البروكسي
// ==================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// ❗ Rate limit فقط على الصفحات العادية (مو uv/bare)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

app.use((req, res, next) => {
  if (req.url.startsWith('/uv') || req.url.startsWith('/bare')) {
    return next();
  }
  limiter(req, res, next);
});

// ضغط متوازن
app.use(compression({ level: 6 }));


// ==================
// ⚡ كاش + أداء
// ==================

// ملفات UV (نادر تتغير → كاش طويل)
app.use('/uv/', express.static(uvPath, {
  maxAge: '7d',
  etag: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}));

// ملفاتك
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'
}));


// ==================
// 🎬 يوتيوب سريع
// ==================
app.get('/yt', (req, res) => {
  const target = 'https://m.youtube.com';

  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="/uv/uv.bundle.js"></script>
<script src="/uv/uv.config.js"></script>
</head>
<body style="background:#000;color:#fff;text-align:center;padding-top:25vh">
<h3>🚀 جاري الدخول...</h3>
<script>
navigator.serviceWorker.register('/sw.js').then(() => {
  location.href = '/uv/service/' + __uv$config.encodeUrl('${target}');
});
</script>
</body>
</html>`);
});


// ==================
// ⚙️ إصلاح التعليق
// ==================
app.get('/uv/service/*', (req, res) => {
  if (res.headersSent) return;

  res.send(`<!DOCTYPE html>
<html>
<head>
<script src="/uv/uv.bundle.js"></script>
<script src="/uv/uv.config.js"></script>
</head>
<body style="background:#000;color:#fff;text-align:center;padding-top:20vh">
<h3>⚙️ تهيئة الاتصال...</h3>
<script>
navigator.serviceWorker.register('/sw.js').then(reg => {
  reg.update();
  setTimeout(() => location.reload(), 400);
});
</script>
</body>
</html>`);
});


// ==================
// ❌ 404 نظيف
// ==================
app.use((req, res) => {
  if (!res.headersSent) {
    res.status(404).send('Not Found');
  }
});


// ==================
// 🔌 ربط البروكسي
// ==================
server.on('request', (req, res) => {
  try {
    if (bareServer.shouldRoute(req)) {
      bareServer.routeRequest(req, res);
    } else {
      app(req, res);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Internal Error');
    }
  }
});

server.on('upgrade', (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});


// ==================
// 🚀 تشغيل
// ==================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 LIVE: http://localhost:${PORT}`);
});
