const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cluster = require('cluster');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const { createBareServer } = require('@tomphttp/bare-server-node');
const { uvPath } = require('@titaniumnetwork-dev/ultraviolet');

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const PORT = process.env.PORT || 8080;
// 🚀 تحسين: استخدام Worker واحد افتراضياً لمنع استهلاك كل الذاكرة على السيرفرات السحابية
const WORKERS = process.env.WORKERS || 1; 

// =====================
// 🔥 CLUSTER MODE
// =====================
if (cluster.isPrimary) {
  console.log(`🔥 Master ${process.pid} starting ${WORKERS} workers...`);
  
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died. Spawning replacement...`);
    cluster.fork();
  });
  
} else {

const app = express();
const server = http.createServer(app);

// =====================
// 🧠 ADVANCED STATE ENGINE
// =====================
const state = {
  requests: 0,
  errors: 0,
  bandwidth: { in: 0, out: 0 },
  history: [],
  maxHistory: 200,
  sessions: new Map(),
  bookmarks: new Map(),
  cache: new Map(),
  cacheMaxSize: 500,
  analytics: {
    domains: new Map(),
    hourly: new Array(24).fill(0),
    responseTime: [],
    statusCodes: new Map()
  },
  startTime: Date.now(),
  peakRPS: 0,
  currentRPS: 0
};

// RPS tracker
let rpsCounter = 0;
setInterval(() => {
  state.currentRPS = rpsCounter;
  if (rpsCounter > state.peakRPS) state.peakRPS = rpsCounter;
  rpsCounter = 0;
}, 1000);

// =====================
// 🔧 TRUST PROXY
// =====================
// 🚀 تحسين: الثقة في جميع البروكسيات لحل مشكلة قراءة الـ IP على Railway
app.set('trust proxy', true);

// =====================
// ⚡ BARE SERVER
// =====================
const bareServer = createBareServer('/bare/', {
  logErrors: false,
  maintainer: {
    email: 'admin@ultraproxy.io',
    website: '[ultraproxy.io](https://ultraproxy.io)'
  }
});

// =====================
// 🔐 SECURITY HARDENING
// =====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  dnsPrefetchControl: { allow: true },
  frameguard: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true
}));

// =====================
// ⚡ ADVANCED COMPRESSION
// =====================
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// =====================
// 🚦 INTELLIGENT RATE LIMITING
// =====================
// 🚀 تحسين: إزالة keyGenerator لترك Express يحدد الـ IP الصحيح تلقائياً بفضل trust proxy
const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: message, retryAfter: Math.ceil(windowMs / 1000) });
  },
  skip: (req) => {
    return req.url.startsWith('/uv') || req.url.startsWith('/bare');
  }
});

const globalLimiter = createLimiter(60000, 300, 'Too many requests');
const apiLimiter = createLimiter(60000, 100, 'API rate limit exceeded');

app.use(globalLimiter);
app.use('/__', apiLimiter);

// =====================
// ⚡ OPTIMIZED STATIC SERVING
// =====================
app.use('/uv/', express.static(uvPath, {
  maxAge: '30d',
  immutable: true,
  etag: true,
  lastModified: true
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

// =====================
// 📊 ANALYTICS MIDDLEWARE
// =====================
app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();
  state.requests++;
  rpsCounter++;
  
  const originalEnd = res.end;
  let responseSize = 0;
  
  res.end = function(chunk, encoding) {
    if (chunk) responseSize += Buffer.byteLength(chunk);
    state.bandwidth.out += responseSize;
    
    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    state.analytics.responseTime.push(duration);
    if (state.analytics.responseTime.length > 1000) {
      state.analytics.responseTime.shift();
    }
    
    const hour = new Date().getHours();
    state.analytics.hourly[hour]++;
    
    const statusCode = res.statusCode.toString();
    state.analytics.statusCodes.set(statusCode, (state.analytics.statusCodes.get(statusCode) || 0) + 1);
    
    if (res.statusCode >= 500) state.errors++;
    
    return originalEnd.call(this, chunk, encoding);
  };
  
  if (req.headers['content-length']) {
    state.bandwidth.in += parseInt(req.headers['content-length'], 10);
  }
  
  next();
});

// =====================
// 🔑 SESSION MANAGEMENT
// =====================
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function getSession(req, res) {
  let sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !state.sessions.has(sessionId)) {
    sessionId = generateSessionId();
    state.sessions.set(sessionId, {
      id: sessionId,
      created: Date.now(),
      lastActive: Date.now(),
      tabs: [],
      history: [],
      settings: {
        theme: 'dark',
        searchEngine: 'google',
        adBlock: true,
        jsEnabled: true
      }
    });
  } else {
    state.sessions.get(sessionId).lastActive = Date.now();
  }
  
  res.setHeader('X-Session-Id', sessionId);
  return state.sessions.get(sessionId);
}

// Session cleanup
setInterval(() => {
  const timeout = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, session] of state.sessions) {
    if (now - session.lastActive > timeout) {
      state.sessions.delete(id);
    }
  }
}, 60000);

// =====================
// 🧠 HISTORY SYSTEM
// =====================
function addHistory(session, url, title = '') {
  if (!url) return;
  
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    url,
    title: title || extractDomain(url),
    time: Date.now(),
    visits: 1
  };
  
  const existing = session.history.findIndex(h => h.url === url);
  if (existing !== -1) {
    session.history[existing].visits++;
    session.history[existing].time = Date.now();
    const item = session.history.splice(existing, 1)[0];
    session.history.unshift(item);
  } else {
    session.history.unshift(entry);
  }
  
  if (session.history.length > 500) {
    session.history = session.history.slice(0, 500);
  }
  
  // Global history
  state.history.unshift(entry);
  if (state.history.length > state.maxHistory) {
    state.history.pop();
  }
  
  // Domain analytics
  const domain = extractDomain(url);
  state.analytics.domains.set(domain, (state.analytics.domains.get(domain) || 0) + 1);
}

function extractDomain(url) {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
  } catch {
    return url.split('/')[0];
  }
}

// =====================
// 🔍 SEARCH ENGINE INTEGRATION
// =====================
const searchEngines = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
  yahoo: 'https://search.yahoo.com/search?p=',
  yandex: 'https://yandex.com/search/?text=',
  ecosia: 'https://www.ecosia.org/search?q='
};

function processInput(input, engine = 'google') {
  input = input.trim();
  
  if (/^(https?:\/\/|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/.test(input)) {
    return input.startsWith('http') ? input : 'https://' + input;
  }
  
  const searchUrl = searchEngines[engine] || searchEngines.google;
  return searchUrl + encodeURIComponent(input);
}

// =====================
// 🎨 CSS THEMES
// =====================
const themes = {
  dark: {
    bg: '#0a0a0f',
    bgSecondary: '#12121a',
    bgTertiary: '#1a1a25',
    accent: '#00ff88',
    accentHover: '#00cc6a',
    text: '#ffffff',
    textSecondary: '#8888aa',
    border: '#2a2a3a',
    shadow: 'rgba(0, 255, 136, 0.1)',
    gradient: 'linear-gradient(135deg, #00ff88 0%, #00ccff 100%)'
  },
  midnight: {
    bg: '#0d1117',
    bgSecondary: '#161b22',
    bgTertiary: '#21262d',
    accent: '#58a6ff',
    accentHover: '#79b8ff',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#30363d',
    shadow: 'rgba(88, 166, 255, 0.1)',
    gradient: 'linear-gradient(135deg, #58a6ff 0%, #a371f7 100%)'
  },
  cyberpunk: {
    bg: '#0a0010',
    bgSecondary: '#150020',
    bgTertiary: '#200030',
    accent: '#ff00ff',
    accentHover: '#ff44ff',
    text: '#ffffff',
    textSecondary: '#aa88cc',
    border: '#440066',
    shadow: 'rgba(255, 0, 255, 0.2)',
    gradient: 'linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)'
  },
  ocean: {
    bg: '#0a1628',
    bgSecondary: '#0f2137',
    bgTertiary: '#142c46',
    accent: '#00d4ff',
    accentHover: '#33ddff',
    text: '#e0f7ff',
    textSecondary: '#6699bb',
    border: '#1e3a5f',
    shadow: 'rgba(0, 212, 255, 0.15)',
    gradient: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)'
  },
  forest: {
    bg: '#0a1510',
    bgSecondary: '#0f201a',
    bgTertiary: '#142b23',
    accent: '#00ff66',
    accentHover: '#33ff88',
    text: '#e0ffe8',
    textSecondary: '#66aa77',
    border: '#1e4030',
    shadow: 'rgba(0, 255, 102, 0.15)',
    gradient: 'linear-gradient(135deg, #00ff66 0%, #88ff00 100%)'
  }
};

function generateCSS(theme) {
  const t = themes[theme] || themes.dark;
  return `
    :root {
      --bg: ${t.bg};
      --bg-secondary: ${t.bgSecondary};
      --bg-tertiary: ${t.bgTertiary};
      --accent: ${t.accent};
      --accent-hover: ${t.accentHover};
      --text: ${t.text};
      --text-secondary: ${t.textSecondary};
      --border: ${t.border};
      --shadow: ${t.shadow};
      --gradient: ${t.gradient};
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }
    
    ::selection {
      background: var(--accent);
      color: var(--bg);
    }
    
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--bg-secondary);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: var(--accent);
    }
    
    .container {
      max-width: 1800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      padding: 15px 25px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(20px);
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.5rem;
      font-weight: 700;
      background: var(--gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .logo-icon {
      width: 40px;
      height: 40px;
      background: var(--gradient);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      -webkit-text-fill-color: white;
    }
    
    .stats-bar {
      display: flex;
      gap: 20px;
      font-size: 0.85rem;
    }
    
    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 15px;
      background: var(--bg-tertiary);
      border-radius: 20px;
      border: 1px solid var(--border);
    }
    
    .stat-value {
      color: var(--accent);
      font-weight: 600;
    }
    
    .search-container {
      background: var(--bg-secondary);
      border-radius: 20px;
      padding: 40px;
      margin: 30px 0;
      border: 1px solid var(--border);
      box-shadow: 0 10px 40px var(--shadow);
    }
    
    .search-box {
      display: flex;
      gap: 12px;
      max-width: 900px;
      margin: 0 auto;
    }
    
    .search-input-wrapper {
      flex: 1;
      position: relative;
    }
    
    .search-input {
      width: 100%;
      padding: 18px 25px 18px 55px;
      font-size: 1.1rem;
      border: 2px solid var(--border);
      border-radius: 15px;
      background: var(--bg);
      color: var(--text);
      outline: none;
      transition: all 0.3s ease;
    }
    
    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--shadow);
    }
    
    .search-input::placeholder {
      color: var(--text-secondary);
    }
    
    .search-icon {
      position: absolute;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
      font-size: 1.2rem;
    }
    
    .search-btn {
      padding: 18px 35px;
      background: var(--gradient);
      border: none;
      border-radius: 15px;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .search-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px var(--shadow);
    }
    
    .search-btn:active {
      transform: translateY(0);
    }
    
    .quick-links {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 25px;
      flex-wrap: wrap;
    }
    
    .quick-link {
      padding: 10px 20px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 25px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.9rem;
      transition: all 0.3s ease;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .quick-link:hover {
      background: var(--accent);
      color: var(--bg);
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    
    .main-content {
      display: grid;
      grid-template-columns: 350px 1fr 300px;
      gap: 25px;
      margin-top: 25px;
    }
    
    @media (max-width: 1400px) {
      .main-content {
        grid-template-columns: 300px 1fr;
      }
      .sidebar-right {
        display: none;
      }
    }
    
    @media (max-width: 900px) {
      .main-content {
        grid-template-columns: 1fr;
      }
      .sidebar-left {
        display: none;
      }
    }
    
    .panel {
      background: var(--bg-secondary);
      border-radius: 16px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    
    .panel-header {
      padding: 18px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-tertiary);
    }
    
    .panel-title {
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .panel-body {
      padding: 15px;
      max-height: 500px;
      overflow-y: auto;
    }
    
    .tab-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .tab-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 15px;
      background: var(--bg);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }
    
    .tab-item:hover {
      border-color: var(--accent);
      background: var(--bg-tertiary);
    }
    
    .tab-item.active {
      border-color: var(--accent);
      background: var(--bg-tertiary);
    }
    
    .tab-favicon {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
    }
    
    .tab-title {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.9rem;
    }
    
    .tab-close {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    
    .tab-close:hover {
      background: #ff4444;
      color: white;
    }
    
    .history-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 15px;
      background: var(--bg);
      border-radius: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }
    
    .history-item:hover {
      border-color: var(--accent);
      background: var(--bg-tertiary);
    }
    
    .history-icon {
      width: 35px;
      height: 35px;
      border-radius: 8px;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }
    
    .history-info {
      flex: 1;
      min-width: 0;
    }
    
    .history-title {
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .history-url {
      font-size: 0.75rem;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .history-time {
      font-size: 0.7rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    
    .browser-frame {
      width: 100%;
      height: 70vh;
      min-height: 500px;
      border: none;
      border-radius: 12px;
      background: var(--bg);
    }
    
    .browser-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 15px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
    }
    
    .toolbar-btn {
      width: 35px;
      height: 35px;
      border-radius: 8px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    
    .toolbar-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    
    .toolbar-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .url-bar {
      flex: 1;
      padding: 10px 15px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.9rem;
      outline: none;
    }
    
    .url-bar:focus {
      border-color: var(--accent);
    }
    
    .bookmark-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--bg);
      border-radius: 8px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .bookmark-item:hover {
      background: var(--bg-tertiary);
    }
    
    .settings-section {
      margin-bottom: 20px;
    }
    
    .settings-title {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .settings-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 15px;
      background: var(--bg);
      border-radius: 8px;
      margin-bottom: 8px;
    }
    
    .toggle {
      width: 50px;
      height: 26px;
      background: var(--border);
      border-radius: 13px;
      position: relative;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .toggle.active {
      background: var(--accent);
    }
    
    .toggle::after {
      content: '';
      width: 22px;
      height: 22px;
      background: white;
      border-radius: 50%;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: all 0.3s ease;
    }
    
    .toggle.active::after {
      left: 26px;
    }
    
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    
    .theme-option {
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      text-align: center;
      font-size: 0.8rem;
      border: 2px solid transparent;
      transition: all 0.2s ease;
    }
    
    .theme-option:hover {
      border-color: var(--border);
    }
    
    .theme-option.active {
      border-color: var(--accent);
    }
    
    .search-engine-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    
    .engine-option {
      padding: 12px;
      background: var(--bg);
      border-radius: 8px;
      cursor: pointer;
      text-align: center;
      font-size: 0.85rem;
      border: 2px solid transparent;
      transition: all 0.2s ease;
    }
    
    .engine-option:hover {
      border-color: var(--border);
    }
    
    .engine-option.active {
      border-color: var(--accent);
      background: var(--bg-tertiary);
    }
    
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    
    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    
    .modal {
      background: var(--bg-secondary);
      border-radius: 20px;
      border: 1px solid var(--border);
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow: hidden;
      transform: scale(0.9);
      transition: all 0.3s ease;
    }
    
    .modal-overlay.active .modal {
      transform: scale(1);
    }
    
    .modal-header {
      padding: 20px 25px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .modal-body {
      padding: 25px;
      overflow-y: auto;
      max-height: 60vh;
    }
    
    .modal-close {
      width: 35px;
      height: 35px;
      border-radius: 8px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .modal-close:hover {
      background: #ff4444;
      border-color: #ff4444;
      color: white;
    }
    
    .analytics-card {
      background: var(--bg);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 15px;
    }
    
    .analytics-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--accent);
    }
    
    .analytics-label {
      color: var(--text-secondary);
      font-size: 0.85rem;
    }
    
    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }
    
    .chart-bar {
      height: 100px;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding: 10px 0;
    }
    
    .bar {
      flex: 1;
      background: var(--accent);
      border-radius: 4px 4px 0 0;
      min-height: 5px;
      transition: all 0.3s ease;
    }
    
    .bar:hover {
      opacity: 0.8;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }
    
    .empty-state-icon {
      font-size: 3rem;
      margin-bottom: 15px;
      opacity: 0.5;
    }
    
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    
    .btn-primary {
      background: var(--gradient);
      color: white;
    }
    
    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text);
      border: 1px solid var(--border);
    }
    
    .btn:hover {
      transform: translateY(-2px);
    }
    
    .kbd {
      display: inline-block;
      padding: 3px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
    }
    
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 3000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .toast {
      padding: 15px 25px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease;
    }
    
    .toast.success {
      border-color: #00ff88;
    }
    
    .toast.error {
      border-color: #ff4444;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(100px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    .context-menu {
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 0;
      min-width: 180px;
      z-index: 4000;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      display: none;
    }
    
    .context-menu.active {
      display: block;
    }
    
    .context-menu-item {
      padding: 10px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
      transition: all 0.2s ease;
    }
    
    .context-menu-item:hover {
      background: var(--bg-tertiary);
      color: var(--accent);
    }
    
    .context-menu-divider {
      height: 1px;
      background: var(--border);
      margin: 8px 0;
    }
    
    .mobile-nav {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      padding: 10px 20px;
      z-index: 1000;
    }
    
    @media (max-width: 900px) {
      .mobile-nav {
        display: flex;
        justify-content: space-around;
      }
      
      body {
        padding-bottom: 70px;
      }
    }
    
    .mobile-nav-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 15px;
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.75rem;
    }
    
    .mobile-nav-btn.active {
      color: var(--accent);
    }
    
    .mobile-nav-btn svg {
      width: 24px;
      height: 24px;
    }
  `;
}

// =====================
// 🏠 MAIN DASHBOARD
// =====================
app.get('/', (req, res) => {
  const session = getSession(req, res);
  const theme = session.settings.theme || 'dark';
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ultra Proxy | Unlimited Access</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${generateCSS(theme)}</style>
</head>
<body>
  <header class="header">
    <div class="logo">
      <div class="logo-icon">⚡</div>
      Ultra Proxy
    </div>
    <div class="stats-bar">
      <div class="stat">
        <span>🔥</span>
        <span>RPS:</span>
        <span class="stat-value" id="rps">0</span>
      </div>
      <div class="stat">
        <span>📊</span>
        <span>Total:</span>
        <span class="stat-value" id="total">${state.requests.toLocaleString()}</span>
      </div>
      <div class="stat">
        <span>⏱️</span>
        <span>Uptime:</span>
        <span class="stat-value" id="uptime">0h</span>
      </div>
      <button class="toolbar-btn" onclick="openSettings()" title="Settings">⚙️</button>
      <button class="toolbar-btn" onclick="openAnalytics()" title="Analytics">📈</button>
    </div>
  </header>

  <main class="container">
    <section class="search-container">
      <div class="search-box">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            class="search-input" 
            id="searchInput" 
            placeholder="Enter URL or search term..." 
            autocomplete="off"
            autofocus
          >
        </div>
        <button class="search-btn" onclick="navigate()">
          <span>Browse</span>
          <span>→</span>
        </button>
      </div>
      <div class="quick-links">
        <div class="quick-link" onclick="quickNav('youtube.com')">📺 YouTube</div>
        <div class="quick-link" onclick="quickNav('discord.com')">💬 Discord</div>
        <div class="quick-link" onclick="quickNav('twitter.com')">🐦 Twitter</div>
        <div class="quick-link" onclick="quickNav('reddit.com')">🔴 Reddit</div>
        <div class="quick-link" onclick="quickNav('tiktok.com')">🎵 TikTok</div>
        <div class="quick-link" onclick="quickNav('twitch.tv')">🎮 Twitch</div>
        <div class="quick-link" onclick="quickNav('instagram.com')">📷 Instagram</div>
        <div class="quick-link" onclick="quickNav('github.com')">🐙 GitHub</div>
      </div>
    </section>

    <div class="main-content">
      <aside class="sidebar-left">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">📑 Tabs</span>
            <button class="toolbar-btn" onclick="addTab()" title="New Tab">+</button>
          </div>
          <div class="panel-body">
            <div class="tab-container" id="tabContainer">
              <div class="empty-state">
                <div class="empty-state-icon">📑</div>
                <p>No tabs open</p>
              </div>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-top: 20px;">
          <div class="panel-header">
            <span class="panel-title">⭐ Bookmarks</span>
          </div>
          <div class="panel-body">
            <div id="bookmarks">
              <div class="empty-state">
                <div class="empty-state-icon">⭐</div>
                <p>No bookmarks yet</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="panel" style="grid-column: span 1;">
        <div class="browser-toolbar">
          <button class="toolbar-btn" onclick="goBack()" id="backBtn" disabled title="Back">←</button>
          <button class="toolbar-btn" onclick="goForward()" id="forwardBtn" disabled title="Forward">→</button>
          <button class="toolbar-btn" onclick="refresh()" id="refreshBtn" title="Refresh">↻</button>
          <input type="text" class="url-bar" id="urlBar" placeholder="about:blank" readonly>
          <button class="toolbar-btn" onclick="bookmark()" id="bookmarkBtn" title="Bookmark">☆</button>
          <button class="toolbar-btn" onclick="fullscreen()" title="Fullscreen">⛶</button>
        </div>
        <div id="browserContainer" style="position: relative;">
          <div class="empty-state" id="emptyBrowser" style="padding: 100px 20px;">
            <div class="empty-state-icon">🌐</div>
            <h3>Ready to Browse</h3>
            <p style="margin-top: 10px;">Enter a URL or search term above</p>
            <p style="margin-top: 20px; font-size: 0.85rem;">
              <kbd>Enter</kbd> to navigate • <kbd>Ctrl+L</kbd> focus URL bar
            </p>
          </div>
          <iframe id="browserFrame" class="browser-frame" style="display: none;"></iframe>
        </div>
      </section>

      <aside class="sidebar-right">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">📜 History</span>
            <button class="toolbar-btn" onclick="clearHistory()" title="Clear">🗑️</button>
          </div>
          <div class="panel-body">
            <div id="historyContainer">
              <div class="empty-state">
                <div class="empty-state-icon">📜</div>
                <p>No history yet</p>
              </div>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-top: 20px;">
          <div class="panel-header">
            <span class="panel-title">🔥 Top Sites</span>
          </div>
          <div class="panel-body">
            <div id="topSites"></div>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <div class="modal-overlay" id="settingsModal">
    <div class="modal">
      <div class="modal-header">
        <h3>⚙️ Settings</h3>
        <button class="modal-close" onclick="closeSettings()">✕</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <div class="settings-title">Theme</div>
          <div class="theme-grid">
            <div class="theme-option \${theme === 'dark' ? 'active' : ''}" style="background: #0a0a0f; color: #00ff88;" onclick="setTheme('dark')">Dark</div>
            <div class="theme-option \${theme === 'midnight' ? 'active' : ''}" style="background: #0d1117; color: #58a6ff;" onclick="setTheme('midnight')">Midnight</div>
            <div class="theme-option \${theme === 'cyberpunk' ? 'active' : ''}" style="background: #0a0010; color: #ff00ff;" onclick="setTheme('cyberpunk')">Cyberpunk</div>
            <div class="theme-option \${theme === 'ocean' ? 'active' : ''}" style="background: #0a1628; color: #00d4ff;" onclick="setTheme('ocean')">Ocean</div>
            <div class="theme-option \${theme === 'forest' ? 'active' : ''}" style="background: #0a1510; color: #00ff66;" onclick="setTheme('forest')">Forest</div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Search Engine</div>
          <div class="search-engine-grid">
            <div class="engine-option \${session.settings.searchEngine === 'google' ? 'active' : ''}" onclick="setSearchEngine('google')">🔍 Google</div>
            <div class="engine-option \${session.settings.searchEngine === 'duckduckgo' ? 'active' : ''}" onclick="setSearchEngine('duckduckgo')">🦆 DuckDuckGo</div>
            <div class="engine-option \${session.settings.searchEngine === 'bing' ? 'active' : ''}" onclick="setSearchEngine('bing')">🔷 Bing</div>
            <div class="engine-option \${session.settings.searchEngine === 'brave' ? 'active' : ''}" onclick="setSearchEngine('brave')">🦁 Brave</div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Privacy</div>
          <div class="settings-option">
            <span>JavaScript Enabled</span>
            <div class="toggle \${session.settings.jsEnabled ? 'active' : ''}" onclick="toggleSetting('jsEnabled')"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="analyticsModal">
    <div class="modal" style="max-width: 800px;">
      <div class="modal-header">
        <h3>📈 Analytics</h3>
        <button class="modal-close" onclick="closeAnalytics()">✕</button>
      </div>
      <div class="modal-body">
        <div class="analytics-grid" id="analyticsStats"></div>
        <div class="analytics-card" style="margin-top: 20px;">
          <h4 style="margin-bottom: 15px;">Hourly Activity</h4>
          <div class="chart-bar" id="hourlyChart"></div>
        </div>
        <div class="analytics-card">
          <h4 style="margin-bottom: 15px;">Top Domains</h4>
          <div id="topDomains"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="context-menu" id="contextMenu">
    <div class="context-menu-item" onclick="contextAction('newTab')">📑 Open in New Tab</div>
    <div class="context-menu-item" onclick="contextAction('bookmark')">⭐ Add to Bookmarks</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" onclick="contextAction('copy')">📋 Copy URL</div>
    <div class="context-menu-item" onclick="contextAction('delete')">🗑️ Delete</div>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <nav class="mobile-nav">
    <button class="mobile-nav-btn active" onclick="mobileNav('home')">
      <span>🏠</span>
      <span>Home</span>
    </button>
    <button class="mobile-nav-btn" onclick="mobileNav('tabs')">
      <span>📑</span>
      <span>Tabs</span>
    </button>
    <button class="mobile-nav-btn" onclick="mobileNav('history')">
      <span>📜</span>
      <span>History</span>
    </button>
    <button class="mobile-nav-btn" onclick="mobileNav('settings')">
      <span>⚙️</span>
      <span>Settings</span>
    </button>
  </nav>

  <script src="/uv/uv.bundle.js"></script>
  <script src="/uv/uv.config.js"></script>
  <script>
    // State
    let tabs = [];
    let activeTab = null;
    let sessionId = null;
    let settings = \${JSON.stringify(session.settings)};
    let history = [];
    let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
    let contextTarget = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
      await registerServiceWorker();
      loadBookmarks();
      startPolling();
      setupKeyboardShortcuts();
    });

    async function registerServiceWorker() {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (e) {
        console.error('SW registration failed:', e);
      }
    }

    function startPolling() {
      setInterval(fetchState, 2000);
      fetchState();
    }

    async function fetchState() {
      try {
        const res = await fetch('/__state');
        const data = await res.json();
        
        document.getElementById('rps').textContent = data.currentRPS || 0;
        document.getElementById('total').textContent = data.requests.toLocaleString();
        
        const uptimeMs = Date.now() - data.startTime;
        const hours = Math.floor(uptimeMs / 3600000);
        const minutes = Math.floor((uptimeMs % 3600000) / 60000);
        document.getElementById('uptime').textContent = hours + 'h ' + minutes + 'm';
        
        history = data.history || [];
        renderHistory();
        renderTopSites(data.analytics?.domains || {});
      } catch (e) {}
    }

    function navigate() {
      const input = document.getElementById('searchInput').value.trim();
      if (!input) return;
      
      const url = processInput(input);
      openUrl(url);
    }

    function quickNav(domain) {
      openUrl('https://' + domain);
    }

    function processInput(input) {
      if (/^(https?:\\/\\/|[a-zA-Z0-9][-a-zA-Z0-9]*\\.[a-zA-Z]{2,})/.test(input)) {
        return input.startsWith('http') ? input : 'https://' + input;
      }
      const engines = {
        google: 'https://www.google.com/search?q=',
        duckduckgo: 'https://duckduckgo.com/?q=',
        bing: 'https://www.bing.com/search?q=',
        brave: 'https://search.brave.com/search?q='
      };
      return (engines[settings.searchEngine] || engines.google) + encodeURIComponent(input);
    }

    function openUrl(url, newTab = false) {
      const encodedUrl = __uv$config.encodeUrl(url);
      const proxyUrl = '/uv/service/' + encodedUrl;
      
      if (newTab || !activeTab) {
        const tab = {
          id: Date.now(),
          url: url,
          title: extractDomain(url),
          proxyUrl: proxyUrl
        };
        tabs.push(tab);
        activeTab = tab;
      } else {
        activeTab.url = url;
        activeTab.title = extractDomain(url);
        activeTab.proxyUrl = proxyUrl;
      }
      
      renderTabs();
      loadFrame(proxyUrl, url);
      
      fetch('/__history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      }).catch(() => {});
    }

    function loadFrame(proxyUrl, originalUrl) {
      const frame = document.getElementById('browserFrame');
      const empty = document.getElementById('emptyBrowser');
      
      frame.style.display = 'block';
      empty.style.display = 'none';
      
      frame.src = proxyUrl;
      document.getElementById('urlBar').value = originalUrl;
      
      frame.onload = () => {
        document.getElementById('backBtn').disabled = false;
        document.getElementById('refreshBtn').disabled = false;
      };
    }

    function extractDomain(url) {
      try {
        return new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
      } catch {
        return url.split('/')[0];
      }
    }

    function addTab() {
      activeTab = null;
      document.getElementById('searchInput').value = '';
      document.getElementById('searchInput').focus();
      document.getElementById('browserFrame').style.display = 'none';
      document.getElementById('emptyBrowser').style.display = 'block';
      document.getElementById('urlBar').value = 'about:blank';
      renderTabs();
    }

    function switchTab(id) {
      const tab = tabs.find(t => t.id === id);
      if (tab) {
        activeTab = tab;
        loadFrame(tab.proxyUrl, tab.url);
        renderTabs();
      }
    }

    function closeTab(id, e) {
      e.stopPropagation();
      tabs = tabs.filter(t => t.id !== id);
      
      if (activeTab && activeTab.id === id) {
        if (tabs.length > 0) {
          switchTab(tabs[tabs.length - 1].id);
        } else {
          activeTab = null;
          document.getElementById('browserFrame').style.display = 'none';
          document.getElementById('emptyBrowser').style.display = 'block';
          document.getElementById('urlBar').value = 'about:blank';
        }
      }
      
      renderTabs();
    }

    function renderTabs() {
      const container = document.getElementById('tabContainer');
      
      if (tabs.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📑</div><p>No tabs open</p></div>';
        return;
      }
      
      container.innerHTML = tabs.map(tab => 
        '<div class="tab-item ' + (activeTab && activeTab.id === tab.id ? 'active' : '') + '" onclick="switchTab(' + tab.id + ')" oncontextmenu="showContext(event, \\'tab\\', ' + tab.id + ')">' +
        '<div class="tab-favicon">' + getFavicon(tab.url) + '</div>' +
        '<span class="tab-title">' + escapeHtml(tab.title) + '</span>' +
        '<button class="tab-close" onclick="closeTab(' + tab.id + ', event)">✕</button>' +
        '</div>'
      ).join('');
    }

    function getFavicon(url) {
      const domain = extractDomain(url).toLowerCase();
      const icons = {
        'youtube.com': '📺', 'discord.com': '💬', 'twitter.com': '🐦',
        'reddit.com': '🔴', 'tiktok.com': '🎵', 'twitch.tv': '🎮',
        'instagram.com': '📷', 'github.com': '🐙', 'google.com': '🔍',
        'facebook.com': '📘', 'netflix.com': '🎬', 'spotify.com': '🎧'
      };
      return icons[domain] || '🌐';
    }

    function renderHistory() {
      const container = document.getElementById('historyContainer');
      
      if (history.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>No history yet</p></div>';
        return;
      }
      
      container.innerHTML = history.slice(0, 20).map(item => {
        const timeAgo = formatTimeAgo(item.time);
        return '<div class="history-item" onclick="openUrl(\\'' + escapeHtml(item.url) + '\\')" oncontextmenu="showContext(event, \\'history\\', \\'' + escapeHtml(item.url) + '\\')">' +
          '<div class="history-icon">' + getFavicon(item.url) + '</div>' +
          '<div class="history-info">' +
          '<div class="history-title">' + escapeHtml(item.title || extractDomain(item.url)) + '</div>' +
          '<div class="history-url">' + escapeHtml(item.url) + '</div>' +
          '</div>' +
          '<div class="history-time">' + timeAgo + '</div>' +
          '</div>';
      }).join('');
    }

    function renderTopSites(domains) {
      const container = document.getElementById('topSites');
      const sorted = Object.entries(domains || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
      
      if (sorted.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No data yet</p></div>';
        return;
      }
      
      container.innerHTML = sorted.map(([domain, count]) => 
        '<div class="bookmark-item" onclick="openUrl(\\'https://' + escapeHtml(domain) + '\\')">' +
        '<span>' + getFavicon(domain) + '</span>' +
        '<span style="flex:1">' + escapeHtml(domain) + '</span>' +
        '<span style="color: var(--accent)">' + count + '</span>' +
        '</div>'
      ).join('');
    }

    function formatTimeAgo(timestamp) {
      const diff = Date.now() - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'now';
      if (minutes < 60) return minutes + 'm';
      if (hours < 24) return hours + 'h';
      return days + 'd';
    }

    function goBack() {
      const frame = document.getElementById('browserFrame');
      if (frame.contentWindow) {
        frame.contentWindow.history.back();
      }
    }

    function goForward() {
      const frame = document.getElementById('browserFrame');
      if (frame.contentWindow) {
        frame.contentWindow.history.forward();
      }
    }

    function refresh() {
      const frame = document.getElementById('browserFrame');
      if (frame.src) {
        frame.src = frame.src;
      }
    }

    function fullscreen() {
      const frame = document.getElementById('browserFrame');
      if (frame.requestFullscreen) {
        frame.requestFullscreen();
      }
    }

    function bookmark() {
      if (!activeTab) {
        showToast('No page to bookmark', 'error');
        return;
      }
      
      const exists = bookmarks.find(b => b.url === activeTab.url);
      if (exists) {
        showToast('Already bookmarked', 'error');
        return;
      }
      
      bookmarks.push({
        id: Date.now(),
        url: activeTab.url,
        title: activeTab.title
      });
      
      localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
      loadBookmarks();
      showToast('Bookmarked!', 'success');
    }

    function loadBookmarks() {
      const container = document.getElementById('bookmarks');
      bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
      
      if (bookmarks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⭐</div><p>No bookmarks yet</p></div>';
        return;
      }
      
      container.innerHTML = bookmarks.map(b => 
        '<div class="bookmark-item" onclick="openUrl(\\'' + escapeHtml(b.url) + '\\')" oncontextmenu="showContext(event, \\'bookmark\\', ' + b.id + ')">' +
        '<span>' + getFavicon(b.url) + '</span>' +
        '<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(b.title) + '</span>' +
        '</div>'
      ).join('');
    }

    function clearHistory() {
      if (confirm('Clear all history?')) {
        history = [];
        renderHistory();
        showToast('History cleared', 'success');
      }
    }

    function openSettings() {
      document.getElementById('settingsModal').classList.add('active');
    }

    function closeSettings() {
      document.getElementById('settingsModal').classList.remove('active');
    }

    function setTheme(theme) {
      settings.theme = theme;
      saveSettings();
      location.reload();
    }

    function setSearchEngine(engine) {
      settings.searchEngine = engine;
      saveSettings();
      document.querySelectorAll('.engine-option').forEach(el => el.classList.remove('active'));
      event.target.classList.add('active');
      showToast('Search engine updated', 'success');
    }

    function toggleSetting(key) {
      settings[key] = !settings[key];
      saveSettings();
      event.target.classList.toggle('active');
    }

    function saveSettings() {
      fetch('/__settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      }).catch(() => {});
    }

    function openAnalytics() {
      document.getElementById('analyticsModal').classList.add('active');
      fetchAnalytics();
    }

    function closeAnalytics() {
      document.getElementById('analyticsModal').classList.remove('active');
    }

    async function fetchAnalytics() {
      try {
        const res = await fetch('/__analytics');
        const data = await res.json();
        
        const statsContainer = document.getElementById('analyticsStats');
        statsContainer.innerHTML = 
          '<div class="analytics-card"><div class="analytics-value">' + data.requests.toLocaleString() + '</div><div class="analytics-label">Total Requests</div></div>' +
          '<div class="analytics-card"><div class="analytics-value">' + data.peakRPS + '</div><div class="analytics-label">Peak RPS</div></div>' +
          '<div class="analytics-card"><div class="analytics-value">' + data.errors + '</div><div class="analytics-label">Errors</div></div>' +
          '<div class="analytics-card"><div class="analytics-value">' + formatBytes(data.bandwidth.out) + '</div><div class="analytics-label">Bandwidth Out</div></div>';
        
        const hourlyContainer = document.getElementById('hourlyChart');
        const maxHourly = Math.max(...data.analytics.hourly, 1);
        hourlyContainer.innerHTML = data.analytics.hourly.map((val, i) => 
          '<div class="bar" style="height: ' + (val / maxHourly * 100) + '%" title="' + i + ':00 - ' + val + ' requests"></div>'
        ).join('');
        
        const domainsContainer = document.getElementById('topDomains');
        const sortedDomains = Object.entries(data.analytics.domains || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
        domainsContainer.innerHTML = sortedDomains.map(([domain, count]) => 
          '<div class="settings-option"><span>' + escapeHtml(domain) + '</span><span style="color: var(--accent)">' + count + '</span></div>'
        ).join('') || '<p>No data yet</p>';
        
      } catch (e) {}
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function showContext(e, type, data) {
      e.preventDefault();
      contextTarget = { type, data };
      
      const menu = document.getElementById('contextMenu');
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';
      menu.classList.add('active');
    }

    function contextAction(action) {
      const menu = document.getElementById('contextMenu');
      menu.classList.remove('active');
      
      if (!contextTarget) return;
      
      const { type, data } = contextTarget;
      
      switch (action) {
        case 'newTab':
          if (type === 'history') openUrl(data, true);
          break;
        case 'bookmark':
          if (type === 'history') {
            bookmarks.push({ id: Date.now(), url: data, title: extractDomain(data) });
            localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
            loadBookmarks();
            showToast('Bookmarked!', 'success');
          }
          break;
        case 'copy':
          if (type === 'history') {
            navigator.clipboard.writeText(data);
            showToast('Copied!', 'success');
          }
          break;
        case 'delete':
          if (type === 'bookmark') {
            bookmarks = bookmarks.filter(b => b.id !== data);
            localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
            loadBookmarks();
            showToast('Deleted', 'success');
          } else if (type === 'tab') {
            closeTab(data, { stopPropagation: () => {} });
          }
          break;
      }
      
      contextTarget = null;
    }

    document.addEventListener('click', () => {
      document.getElementById('contextMenu').classList.remove('active');
    });

    function showToast(message, type = 'success') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.innerHTML = '<span>' + (type === 'success' ? '✓' : '✕') + '</span><span>' + message + '</span>';
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && document.activeElement.id === 'searchInput') {
          navigate();
        }
        
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'l') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
            document.getElementById('searchInput').select();
          }
          if (e.key === 't') {
            e.preventDefault();
            addTab();
          }
          if (e.key === 'w' && activeTab) {
            e.preventDefault();
            closeTab(activeTab.id, { stopPropagation: () => {} });
          }
        }
        
        if (e.key === 'Escape') {
          closeSettings();
          closeAnalytics();
        }
      });
    }

    function mobileNav(section) {
      document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
      event.target.closest('.mobile-nav-btn').classList.add('active');
      
      if (section === 'settings') openSettings();
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.toString()
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '\\'');
    }
  </script>
</body>
</html>
  `);
});

// =====================
// 📡 API ENDPOINTS
// =====================
app.use(express.json());

app.get('/__state', (req, res) => {
  res.json({
    requests: state.requests,
    errors: state.errors,
    bandwidth: state.bandwidth,
    history: state.history.slice(0, 50),
    startTime: state.startTime,
    currentRPS: state.currentRPS,
    peakRPS: state.peakRPS,
    analytics: {
      domains: Object.fromEntries(state.analytics.domains),
      hourly: state.analytics.hourly
    }
  });
});

app.get('/__analytics', (req, res) => {
  const avgResponseTime = state.analytics.responseTime.length > 0
    ? state.analytics.responseTime.reduce((a, b) => a + b, 0) / state.analytics.responseTime.length
    : 0;
  
  res.json({
    requests: state.requests,
    errors: state.errors,
    bandwidth: state.bandwidth,
    peakRPS: state.peakRPS,
    currentRPS: state.currentRPS,
    avgResponseTime: avgResponseTime.toFixed(2),
    uptime: Date.now() - state.startTime,
    analytics: {
      domains: Object.fromEntries(state.analytics.domains),
      hourly: state.analytics.hourly,
      statusCodes: Object.fromEntries(state.analytics.statusCodes)
    }
  });
});

app.post('/__history', (req, res) => {
  const session = getSession(req, res);
  const { url, title } = req.body;
  
  if (url) {
    addHistory(session, url, title);
  }
  
  res.json({ success: true });
});

app.post('/__settings', (req, res) => {
  const session = getSession(req, res);
  const newSettings = req.body;
  
  if (newSettings) {
    session.settings = { ...session.settings, ...newSettings };
  }
  
  res.json({ success: true, settings: session.settings });
});

app.get('/__session', (req, res) => {
  const session = getSession(req, res);
  res.json(session);
});

// =====================
// 🎯 PROXY SERVICE
// =====================
app.get('/uv/service/*', (req, res) => {
  const session = getSession(req, res);
  const encodedUrl = req.originalUrl.split('/service/')[1];
  
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(encodedUrl);
  } catch {
    decodedUrl = encodedUrl;
  }
  
  addHistory(session, decodedUrl);
  
  const theme = session.settings.theme || 'dark';
  const t = themes[theme] || themes.dark;
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loading...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: \${t.bg};
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, sans-serif;
      color: \${t.text};
    }
    .loader {
      text-align: center;
    }
    .spinner {
      width: 60px;
      height: 60px;
      border: 4px solid \${t.border};
      border-top-color: \${t.accent};
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h2 {
      background: \${t.gradient};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    p {
      color: \${t.textSecondary};
      margin-top: 10px;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <h2>⚡ Ultra Proxy</h2>
    <p>Connecting securely...</p>
  </div>
  <script src="/uv/uv.bundle.js"></script>
  <script src="/uv/uv.config.js"></script>
  <script>
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
      setTimeout(() => {
        location.replace('/uv/' + __uv$config.encodeUrl('\${decodedUrl.replace(/'/g, "\\\\\\'")}'));
      }, 100);
    }).catch(err => {
      document.body.innerHTML = '<div style="text-align:center;padding:50px;"><h2>Error</h2><p>Failed to initialize. Please refresh.</p></div>';
    });
  </script>
</body>
</html>
  `);
});

// =====================
// 🔧 SERVICE WORKER
// =====================
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
      if (event.request.url.includes('/uv/')) {
        return await sw.fetch(event);
      }
      return await fetch(event.request);
    })()
  );
});
  `);
});

// =====================
// ❌ 404 HANDLER
// =====================
app.use((req, res) => {
  const theme = themes.dark;
  res.status(404).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>404 - Not Found</title>
  <style>
    body {
      background: \${theme.bg};
      color: \${theme.text};
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    h1 {
      font-size: 8rem;
      background: \${theme.gradient};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    a {
      color: \${theme.accent};
      text-decoration: none;
      padding: 15px 30px;
      border: 2px solid \${theme.accent};
      border-radius: 10px;
      display: inline-block;
      margin-top: 20px;
      transition: all 0.3s;
    }
    a:hover {
      background: \${theme.accent};
      color: \${theme.bg};
    }
  </style>
</head>
<body>
  <div>
    <h1>404</h1>
    <p>Page not found</p>
    <a href="/">← Back to Home</a>
  </div>
</body>
</html>
  `);
});

// =====================
// ❌ ERROR HANDLER
// =====================
app.use((err, req, res, next) => {
  state.errors++;
  console.error('Error:', err.message);
  
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =====================
// 🌐 BARE SERVER ROUTING
// =====================
server.on('request', (req, res) => {
  try {
    if (bareServer.shouldRoute(req)) {
      return bareServer.routeRequest(req, res);
    }
    return app(req, res);
  } catch (err) {
    state.errors++;
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Server Error');
    }
  }
});

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
// 🚀 START SERVER
// =====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(\`⚡ Ultra Proxy Worker \${process.pid} running on port \${PORT}\`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  state.errors++;
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  state.errors++;
});

}
