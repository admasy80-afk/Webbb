const express = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');
const { createServer } = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = createServer(app);
const bareServer = createBareServer('/bare/', {
    logErrors: false,
    maintainer: {
        email: 'nebula@secure.proxy',
        website: 'https://nebula.proxy'
    }
});

const PORT = process.env.PORT || 24643;

app.use(compression({ level: 9, threshold: 0 }));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' }
});
app.use(limiter);

app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'Nebula-Ultra');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});

app.use('/uv/', express.static(uvPath, {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
    extensions: ['html', 'js', 'css']
}));

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
    return res.json({
        status: 'online',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
    });
});

app.get('/api/suggestions', async (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.json([]);
    
    try {
        const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (!res.headersSent && !res.closed) {
            return res.json(data[1] || []);
        }
    } catch (err) {
        if (!res.headersSent && !res.closed) {
            return res.json([]);
        }
    }
});

const favorites = new Map();

app.post('/api/favorites', (req, res) => {
    const { id, url, title, icon } = req.body;
    favorites.set(id, { url, title, icon, timestamp: Date.now() });
    return res.json({ success: true });
});

app.get('/api/favorites', (req, res) => {
    return res.json(Array.from(favorites.values()));
});

app.delete('/api/favorites/:id', (req, res) => {
    favorites.delete(req.params.id);
    return res.json({ success: true });
});

const history = [];

app.post('/api/history', (req, res) => {
    const { url, title } = req.body;
    history.unshift({ url, title, timestamp: Date.now() });
    if (history.length > 500) history.pop();
    return res.json({ success: true });
});

app.get('/api/history', (req, res) => {
    return res.json(history);
});

app.delete('/api/history', (req, res) => {
    history.length = 0;
    return res.json({ success: true });
});

// ==========================================
// 🚀 الروابط المباشرة (النسخة المستقرة)
// ==========================================

function uvEncode(str) {
    if (!str) return str;
    return encodeURIComponent(str.toString().split('').map((char, ind) => 
        ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char
    ).join(''));
}

app.get('/yt', (req, res) => {
    if (res.headersSent) return;
    const target = 'https://m.youtube.com';
    const encoded = uvEncode(target); 
    return res.redirect('/uv/service/' + encoded);
});

app.get('/go/:base64url', (req, res) => {
    if (res.headersSent) return;
    try {
        const target = Buffer.from(req.params.base64url, 'base64').toString('utf-8');
        const encoded = uvEncode(target);
        return res.redirect('/uv/service/' + encoded);
    } catch (e) {
        return res.status(400).send('Invalid Link Format');
    }
});
// ==========================================

app.use((err, req, res, next) => {
    if (res.headersSent || res.closed) {
        return next(err);
    }
    console.error("[Server Error]:", err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
});

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
    console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║              🚀 ULTRA SECURE PROXY SYSTEM 🚀              ║
    ║                                                           ║
    ╠═══════════════════════════════════════════════════════════╣
    ║  Status: ONLINE  (Anti-Crash Mode Enabled)                ║
    ║  Port: ${PORT}                                              ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
