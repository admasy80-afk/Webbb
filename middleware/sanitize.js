const { getDb, logger } = require('../config/db');
const crypto = require('crypto');
const os = require('os');
const { EventEmitter } = require('events');
const { monitorEventLoopDelay } = require('perf_hooks');
const Redis = require('ioredis');

const elMonitor = monitorEventLoopDelay({ resolution: 10 });
elMonitor.enable();

let redis = null;
try {
    if (process.env.REDIS_URL) {
        redis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 2,
            enableAutoPipelining: true,
            connectTimeout: 2000,
            commandTimeout: 1000,
            offlineQueue: false,
            retryStrategy: (times) => Math.min(times * 50, 2000)
        });
        redis.on('error', () => {});
    }
} catch (e) {
    redis = null;
}

const SYS_CONTEXT = Object.freeze({
    hostname: os.hostname(),
    pid: process.pid,
    arch: os.arch(),
    node: process.version
});

const REDACT_KEYS = new Set([
    'password', 'token', 'authorization', 'secret', 'card_number', 
    'cvv', 'pin', 'cookie', 'session', 'api_key', 'jwt', 'auth', 
    'passphrase', 'private_key', 'credit_card'
]);

const REDACT_REGEX = [
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|[25][1-7][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})\b/,
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
];

class SafeEmitter extends EventEmitter {
    emit(eventName, ...args) {
        try {
            return super.emit(eventName, ...args);
        } catch (e) {
            try {
                if (logger && typeof logger.error === 'function') logger.error('Event Emission Error', e);
            } catch (err) {}
            return false;
        }
    }
}

const bus = new SafeEmitter();
bus.setMaxListeners(0);
bus.on('error', () => {});

const redact = (obj, seen = new WeakSet()) => {
    try {
        if (obj == null || typeof obj !== 'object') {
            if (typeof obj === 'string') {
                for (let i = 0; i < REDACT_REGEX.length; i++) {
                    if (REDACT_REGEX[i].test(obj)) return '[REDACTED]';
                }
            }
            return obj;
        }
        if (Buffer.isBuffer(obj)) return '[BUFFER]';
        if (seen.has(obj)) return '[CIRCULAR]';
        seen.add(obj);

        if (Array.isArray(obj)) {
            const arr = new Array(obj.length);
            for (let i = 0; i < obj.length; i++) {
                arr[i] = redact(obj[i], seen);
            }
            return arr;
        }

        const out = {};
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(obj[k], seen);
        }
        return out;
    } catch (e) {
        return '[REDACTION_ERROR]';
    }
};

class Metrics {
    constructor() { this.store = new Map(); }
    inc(k, l = {}) {
        try {
            const id = `${k}:${JSON.stringify(l)}`;
            this.store.set(id, (this.store.get(id) || 0) + 1);
        } catch (e) {}
    }
    observe(k, l = {}, v) {
        try {
            const id = `${k}:${JSON.stringify(l)}`;
            const cur = this.store.get(id) || { s: 0, c: 0 };
            cur.s += v;
            cur.c += 1;
            this.store.set(id, cur);
        } catch (e) {}
    }
}
const metrics = new Metrics();

class ThreatEngine {
    constructor() { this.local = new Map(); }

    _handleLocal(ip, status) {
        let d = this.local.get(ip) || { r: 0, f: 0 };
        d.r++;
        if (status !== 200) d.f++;
        this.local.set(ip, d);
        if (this.local.size > 10000) this.local.clear();
        return d;
    }

    async assess(ip, action, status) {
        try {
            if (!ip || ip === 'UNKNOWN') return { score: 0, action: 'ALLOW' };
            const key = `th:${ip}`;
            let fails = 0, reqs = 0;

            if (redis && redis.status === 'ready') {
                try {
                    const pipe = redis.pipeline();
                    pipe.incr(`${key}:r`);
                    pipe.expire(`${key}:r`, 60);
                    if (status !== 200 || (typeof action === 'string' && action.includes('FAILED'))) {
                        pipe.incr(`${key}:f`);
                        pipe.expire(`${key}:f`, 3600);
                    }
                    const res = await pipe.exec();
                    if (res && Array.isArray(res)) {
                        reqs = (res[0] && !res[0][0]) ? (res[0][1] || 1) : 1;
                        fails = (res[2] && !res[2][0]) ? (res[2][1] || 0) : 0;
                    }
                } catch (re) {
                    const d = this._handleLocal(ip, status);
                    reqs = d.r; fails = d.f;
                }
            } else {
                const d = this._handleLocal(ip, status);
                reqs = d.r; fails = d.f;
            }

            let score = (fails * 5) + (reqs > 100 ? 20 : 0);
            if (score >= 80) return { score, action: 'BLOCK' };
            return { score, action: 'ALLOW' };
        } catch (e) {
            return { score: 0, action: 'ALLOW' };
        }
    }
}
const threat = new ThreatEngine();

class AuditQueue {
    constructor() {
        this.q = [];
        this.proc = false;
        const timer = setInterval(() => this.flush(), 1000);
        if (timer.unref) timer.unref();
    }
    add(e) {
        try {
            this.q.push(e);
            if (this.q.length >= 500) this.flush();
            if (this.q.length > 5000) this.q.splice(0, this.q.length - 5000);
        } catch (err) {}
    }
    async flush() {
        if (this.proc || this.q.length === 0) return;
        this.proc = true;
        try {
            let db = null;
            try { if (typeof getDb === 'function') db = getDb(); } catch (e) {}
            
            if (db && typeof db.collection === 'function') {
                const b = this.q.splice(0, 500);
                if (b.length > 0) {
                    await db.collection('system_logs').insertMany(b, { ordered: false });
                }
            }
        } catch (e) {
            try {
                if (logger && typeof logger.error === 'function') logger.error('DB Flush Error', e);
            } catch (err) {}
        } finally {
            this.proc = false;
        }
    }
}
const queue = new AuditQueue();

async function logEvent(req, opts = {}) {
    try {
        const start = process.hrtime.bigint();
        const ip = req?.headers?.['cf-connecting-ip'] || req?.headers?.['x-forwarded-for'] || req?.ip || 'UNKNOWN';
        const action = opts?.action || 'UNKNOWN';
        const status = opts?.status || 200;
        
        const intel = await threat.assess(ip, action, status);
        
        let mem = 0;
        try { mem = process.memoryUsage().heapUsed; } catch (e) {}

        const entry = {
            _id: crypto.randomUUID(),
            trace: { 
                requestId: req?.requestId || crypto.randomUUID(), 
                traceId: req?.traceId || crypto.randomUUID() 
            },
            timestamp: new Date(),
            action: action,
            actor: { 
                id: req?.user?.id || req?.user?._id || 'GUEST', 
                role: req?.user?.role || 'GUEST' 
            },
            context: { 
                ip, 
                sys: { ...SYS_CONTEXT, lag: elMonitor.mean, mem } 
            },
            payload: { 
                d: redact(opts?.details || {}), 
                e: opts?.error?.message || opts?.error || null 
            },
            security: { score: intel.score, action: intel.action },
            perf: { ns: Number(process.hrtime.bigint() - start) }
        };
        
        queue.add(entry);
        
        process.nextTick(() => {
            try {
                bus.emit('log', entry);
                if (intel.action === 'BLOCK') bus.emit('alert', entry);
            } catch (e) {}
        });
    } catch (e) { 
        try {
            if (logger && typeof logger.error === 'function') logger.error('logEvent Error', e);
        } catch (err) {}
    }
}

const tracing = (req, res, next) => {
    try {
        req.requestId = req.headers?.['x-request-id'] || crypto.randomUUID();
        req.traceId = req.headers?.['x-trace-id'] || crypto.randomUUID();
        const start = process.hrtime.bigint();
        
        if (res && typeof res.on === 'function') {
            res.on('finish', () => {
                try {
                    metrics.observe('http_duration', { m: req.method }, Number(process.hrtime.bigint() - start) / 1e6);
                    logEvent(req, { action: `HTTP ${req.method} ${req.path}`, status: res.statusCode });
                } catch (e) {}
            });
        }
    } catch (e) {}
    
    if (typeof next === 'function') next();
};

const security = async (req, res, next) => {
    try {
        const ip = req?.headers?.['cf-connecting-ip'] || req?.headers?.['x-forwarded-for'] || req?.ip || 'UNKNOWN';
        const intel = await threat.assess(ip, 'CHECK', 200);
        
        if (intel && intel.action === 'BLOCK') {
            if (res && !res.headersSent && typeof res.status === 'function') {
                return res.status(403).json({ error: 'Access Denied', code: 'SEC_BLOCK' });
            }
            return;
        }
    } catch (e) {}
    
    if (typeof next === 'function') next();
};

module.exports = { logEvent, tracing, security, bus, metrics };
