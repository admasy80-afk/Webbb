const { getDb, logger } = require('../config/db');
const crypto = require('crypto');
const os = require('os');
const { EventEmitter } = require('events');
const { monitorEventLoopDelay } = require('perf_hooks');
const Redis = require('ioredis');

const elMonitor = monitorEventLoopDelay({ resolution: 10 });
elMonitor.enable();

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    connectTimeout: 2000
}) : null;

const SYS_CONTEXT = Object.freeze({
    hostname: os.hostname(),
    pid: process.pid,
    arch: os.arch(),
    node: process.version
});

const REDACT_KEYS = new Set(['password', 'token', 'authorization', 'secret', 'card_number', 'cvv', 'pin', 'cookie', 'session', 'api_key', 'jwt', 'auth', 'passphrase', 'private_key', 'credit_card']);
const REDACT_REGEX = [/\b(?:4[0-9]{12}(?:[0-9]{3})?|[25][1-7][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})\b/, /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/];

const bus = new EventEmitter();
bus.setMaxListeners(0);

const redact = (obj, seen = new WeakSet()) => {
    if (obj == null || typeof obj !== 'object') {
        if (typeof obj === 'string') {
            for (const p of REDACT_REGEX) if (p.test(obj)) return '[REDACTED]';
        }
        return obj;
    }
    if (seen.has(obj)) return '[CIRCULAR]';
    seen.add(obj);
    if (Array.isArray(obj)) return obj.map(i => redact(i, seen));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, seen);
    }
    return out;
};

class Metrics {
    constructor() { this.store = new Map(); }
    inc(k, l = {}) { const id = `${k}:${JSON.stringify(l)}`; this.store.set(id, (this.store.get(id) || 0) + 1); }
    observe(k, l = {}, v) { const id = `${k}:${JSON.stringify(l)}`; const cur = this.store.get(id) || { s: 0, c: 0 }; cur.s += v; cur.c += 1; this.store.set(id, cur); }
}
const metrics = new Metrics();

class ThreatEngine {
    constructor() { this.local = new Map(); }
    async assess(ip, action, status) {
        if (!ip || ip === 'UNKNOWN') return { score: 0, action: 'ALLOW' };
        const key = `th:${ip}`;
        let fails = 0, reqs = 0;
        if (redis) {
            const pipe = redis.pipeline();
            pipe.incr(`${key}:r`);
            pipe.expire(`${key}:r`, 60);
            if (status !== 200 || action.includes('FAILED')) {
                pipe.incr(`${key}:f`);
                pipe.expire(`${key}:f`, 3600);
            }
            const res = await pipe.exec();
            reqs = res[0][1];
            fails = res[2] ? res[2][1] : 0;
        } else {
            let d = this.local.get(ip) || { r: 0, f: 0 };
            d.r++; if (status !== 200) d.f++;
            this.local.set(ip, d);
            reqs = d.r; fails = d.f;
        }
        let score = (fails * 5) + (reqs > 100 ? 20 : 0);
        if (score >= 80) return { score, action: 'BLOCK' };
        return { score, action: 'ALLOW' };
    }
}
const threat = new ThreatEngine();

class AuditQueue {
    constructor() {
        this.q = [];
        this.proc = false;
        setInterval(() => this.flush(), 1000).unref();
    }
    add(e) { this.q.push(e); if (this.q.length >= 500) this.flush(); }
    async flush() {
        if (this.proc || this.q.length === 0) return;
        this.proc = true;
        const db = getDb();
        if (db) {
            const b = this.q.splice(0, 500);
            try { await db.collection('system_logs').insertMany(b, { ordered: false }); } catch (e) { logger.error(e); }
        }
        this.proc = false;
    }
}
const queue = new AuditQueue();

async function logEvent(req, opts = {}) {
    try {
        const start = process.hrtime.bigint();
        const ip = req?.headers?.['cf-connecting-ip'] || req?.ip || 'UNKNOWN';
        const intel = await threat.assess(ip, opts.action, opts.status);
        const entry = {
            _id: crypto.randomUUID(),
            trace: { requestId: req?.requestId || crypto.randomUUID(), traceId: req?.traceId || crypto.randomUUID() },
            timestamp: new Date(),
            action: opts.action,
            actor: { id: req?.user?.id || 'GUEST', role: req?.user?.role || 'GUEST' },
            context: { ip, sys: { ...SYS_CONTEXT, lag: elMonitor.mean, mem: process.memoryUsage().heapUsed } },
            payload: { d: redact(opts.details || {}), e: opts.error?.message },
            security: { score: intel.score, action: intel.action },
            perf: { ns: Number(process.hrtime.bigint() - start) }
        };
        queue.add(entry);
        bus.emit('log', entry);
        if (intel.action === 'BLOCK') bus.emit('alert', entry);
    } catch (e) { logger.error(e); }
}

const tracing = (req, res, next) => {
    req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.traceId = req.headers['x-trace-id'] || crypto.randomUUID();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        metrics.observe('http_duration', { m: req.method }, Number(process.hrtime.bigint() - start) / 1e6);
        logEvent(req, { action: `HTTP ${req.method} ${req.path}`, status: res.statusCode });
    });
    next();
};

const security = async (req, res, next) => {
    if (await threat.assess(req.ip, 'CHECK', 200).then(i => i.action === 'BLOCK')) return res.status(403).send();
    next();
};

module.exports = { logEvent, tracing, security, bus, metrics };
