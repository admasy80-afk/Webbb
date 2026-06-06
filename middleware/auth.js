"use strict";
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const net = require('net');

const parseSecrets = () => {
    try {
        if (process.env.JWT_SECRETS) {
            const parsed = JSON.parse(process.env.JWT_SECRETS);
            if (typeof parsed !== 'object' || parsed === null || !Object.keys(parsed).length) throw new Error();
            return parsed;
        }
        if (process.env.JWT_SECRET) return { 'key-1': process.env.JWT_SECRET };
        throw new Error();
    } catch (e) {
        process.exit(1);
    }
};

const JWT_SECRETS = Object.freeze(parseSecrets());
const ACTIVE_KEY_ID = process.env.JWT_ACTIVE_KEY_ID || Object.keys(JWT_SECRETS)[0];
const REDIS_URL = process.env.REDIS_URL ? process.env.REDIS_URL.replace(/['"]+/g, '').trim() : null;

if (!JWT_SECRETS[ACTIVE_KEY_ID]) throw new Error('MISSING_ACTIVE_SECRET');

const CONFIG = Object.freeze({
    alg: process.env.JWT_ALGORITHM || 'HS256',
    iss: process.env.JWT_ISSUER || 'eld7e7-platform',
    aud: process.env.JWT_AUDIENCE || 'eld7e7-users',
    clockTolerance: Number(process.env.JWT_CLOCK_TOLERANCE) || 5,
    maxTokenLength: Number(process.env.JWT_MAX_TOKEN_LENGTH) || 4096,
    maxPayloadLength: Number(process.env.JWT_MAX_PAYLOAD_LENGTH) || 4096,
    bruteWindow: Number(process.env.JWT_BRUTE_WINDOW) || 900,
    bruteMax: Number(process.env.JWT_BRUTE_MAX) || 50,
    gracePeriod: Number(process.env.JWT_GRACE_PERIOD) || 15,
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d',
    lruMaxSize: Number(process.env.JWT_LRU_MAX_SIZE) || 100000
});

const ROLE_RANK = Object.freeze({ user: 0, vip: 1, moderator: 2, admin: 3, dev: 4, owner: 5 });
const ADMIN_ROLES = new Set(['dev', 'owner']);

class EnterpriseHybridStore {
    constructor() {
        this.redis = null;
        this.memory = new Map();
        this.isRedisReady = false;
        this.circuitOpen = false;
        this.failures = 0;

        if (REDIS_URL) {
            try {
                const Redis = require('ioredis');
                this.redis = new Redis(REDIS_URL, {
                    maxRetriesPerRequest: null,
                    enableOfflineQueue: false,
                    connectTimeout: 15000,
                    keepAlive: 10000,
                    retryStrategy: (times) => {
                        this.failures++;
                        if (this.failures > 5) this.circuitOpen = true;
                        return Math.min(Math.exp(times) * 100, 5000);
                    },
                    reconnectOnError: (err) => err.message.includes('READONLY')
                });
                
                const defineRedisCommands = () => {
                    this.redis.defineCommand('rateLimit', {
                        numberOfKeys: 1,
                        lua: `
                            local current = redis.call('INCR', KEYS[1])
                            if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
                            return current
                        `
                    });
                };

                this.redis.on('connect', defineRedisCommands);
                this.redis.on('ready', () => {
                    this.isRedisReady = true;
                    this.circuitOpen = false;
                    this.failures = 0;
                });
                this.redis.on('reconnecting', () => { this.isRedisReady = false; });
                this.redis.on('error', () => { this.isRedisReady = false; });
            } catch (err) {
                this.isRedisReady = false;
                this.circuitOpen = true;
            }
        }
        this.pruneInterval = setInterval(() => this.prune(), 30000);
        this.pruneInterval.unref();
    }

    prune() {
        const now = Date.now();
        if (this.memory.size > CONFIG.lruMaxSize * 1.5) {
            this.memory.clear();
            return;
        }

        for (const [key, val] of this.memory) {
            if (now > val.exp) this.memory.delete(key);
        }

        if (this.memory.size > CONFIG.lruMaxSize) {
            let evicted = 0;
            const target = Math.floor(CONFIG.lruMaxSize * 0.2);
            for (const key of this.memory.keys()) {
                if (evicted++ >= target) break;
                this.memory.delete(key);
            }
        }
    }

    async set(key, value, ttlSeconds) {
        const validTtl = Math.max(1, Number(ttlSeconds) || 3600);
        this.memory.set(key, { data: value, exp: Date.now() + (validTtl * 1000) });
        if (this.isRedisReady && !this.circuitOpen) {
            await this.redis.set(key, JSON.stringify(value), 'EX', validTtl).catch(() => null);
        }
    }

    async setGraceAtomic(key, value, ttlSeconds) {
        const validTtl = Math.max(1, Number(ttlSeconds) || CONFIG.gracePeriod);
        if (this.isRedisReady && !this.circuitOpen) {
            try {
                const result = await this.redis.set(key, JSON.stringify(value), 'EX', validTtl, 'NX');
                if (result === 'OK') {
                    this.memory.set(key, { data: value, exp: Date.now() + (validTtl * 1000) });
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        }
        if (this.memory.has(key) && this.memory.get(key).exp > Date.now()) return false;
        this.memory.set(key, { data: value, exp: Date.now() + (validTtl * 1000) });
        return true;
    }

    async get(key) {
        if (this.isRedisReady && !this.circuitOpen) {
            try {
                const data = await this.redis.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    this.memory.set(key, { data: parsed, exp: Date.now() + 60000 });
                    return parsed;
                }
            } catch (e) {}
        }
        const local = this.memory.get(key);
        if (local && local.exp > Date.now()) return local.data;
        this.memory.delete(key);
        return null;
    }

    async delete(key) {
        this.memory.delete(key);
        if (this.isRedisReady && !this.circuitOpen) {
            await this.redis.del(key).catch(() => null);
        }
    }

    async increment(key, ttlSeconds) {
        const validTtl = Math.max(1, Number(ttlSeconds) || 3600);
        if (this.isRedisReady && !this.circuitOpen && this.redis.rateLimit) {
            try {
                return await this.redis.rateLimit(key, validTtl);
            } catch (e) {}
        }
        const now = Date.now();
        const record = this.memory.get(key);
        if (record && now <= record.exp) {
            record.data += 1;
            return record.data;
        }
        this.memory.set(key, { data: 1, exp: now + (validTtl * 1000) });
        return 1;
    }
}

const store = new EnterpriseHybridStore();

const hashString = (input) => crypto.createHash('sha3-256').update(String(input)).digest('hex');

const extractNormalizedIp = (req) => {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '0.0.0.0';
    return (net.isIPv6(rawIp) && rawIp.startsWith('::ffff:')) ? rawIp.substring(7) : rawIp;
};

const generateFingerprint = (req) => {
    const devId = req.headers['x-device-id'];
    const uaInfo = [req.headers['user-agent'] || 'ua_missing', req.headers['accept-language'] || 'lang_missing', req.headers['sec-ch-ua'] || 'sec_missing'].join('|');
    const ip = extractNormalizedIp(req);
    
    return {
        strict: devId ? hashString(devId) : hashString(uaInfo),
        medium: hashString(uaInfo),
        soft: hashString(ip)
    };
};

const verifyFingerprint = (tokenFp, currentFp) => {
    if (!tokenFp) return true;
    if (tokenFp.strict && tokenFp.strict === currentFp.strict) return true;
    return tokenFp.medium && tokenFp.medium === currentFp.medium;
};

const getTTL = (expAt) => expAt ? Math.max(1, expAt - Math.floor(Date.now() / 1000)) : 2592000;

const isRevoked = async (jti) => !!(await store.get(`rev:${hashString(jti)}`));

const revokeToken = async (decoded) => {
    if (decoded?.jti && decoded?.exp) await store.set(`rev:${hashString(decoded.jti)}`, true, getTTL(decoded.exp));
};

const revokeFamily = async (familyId, exp) => {
    if (familyId) await store.set(`fam:${hashString(familyId)}`, true, getTTL(exp));
};

const isFamilyRevoked = async (familyId) => !!(await store.get(`fam:${hashString(familyId)}`));

const recordFailure = async (key) => await store.increment(`throttle:${key}`, CONFIG.bruteWindow);
const isThrottled = async (key) => (await store.get(`throttle:${key}`)) >= CONFIG.bruteMax;
const clearFailures = async (key) => await store.delete(`throttle:${key}`);

const extractToken = (req) => {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
    if (req.headers['x-access-token']) return String(req.headers['x-access-token']).trim();
    if (req.cookies?.token) return String(req.cookies.token).trim();
    return null;
};

const deny = (res, status, message, code) => res.status(status).json({ success: false, message, code });

const getKeyResolver = (header, callback) => {
    const key = JWT_SECRETS[header.kid] || JWT_SECRETS[ACTIVE_KEY_ID];
    return key ? callback(null, key) : callback(new Error('INVALID_KEY_ID'));
};

const verifyTokenAsyncSafe = (token) => new Promise((resolve, reject) => {
    jwt.verify(token, getKeyResolver, { algorithms: [CONFIG.alg], issuer: CONFIG.iss, audience: CONFIG.aud, clockTolerance: CONFIG.clockTolerance }, (err, decoded) => err ? reject(err) : resolve(decoded));
});

const signTokenAsyncSafe = (payload, options) => new Promise((resolve, reject) => {
    jwt.sign(payload, JWT_SECRETS[ACTIVE_KEY_ID], { algorithm: CONFIG.alg, issuer: CONFIG.iss, audience: CONFIG.aud, expiresIn: options.expiresIn || CONFIG.accessTtl, jwtid: options.jwtid, subject: options.subject ? String(options.subject) : undefined, keyid: ACTIVE_KEY_ID }, (err, token) => err ? reject(err) : resolve(token));
});

const generateAuthTokens = async (payload, existingFamilyId = null) => {
    if (Buffer.byteLength(JSON.stringify(payload)) > CONFIG.maxPayloadLength) throw new Error('JWT_PAYLOAD_TOO_LARGE');
    
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const familyId = existingFamilyId || crypto.randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
        signTokenAsyncSafe({ ...payload, typ: 'access' }, { jwtid: accessJti, expiresIn: CONFIG.accessTtl }),
        signTokenAsyncSafe({ ...payload, typ: 'refresh', fam: familyId }, { jwtid: refreshJti, expiresIn: CONFIG.refreshTtl })
    ]);

    return { accessToken, refreshToken };
};

const rotateTokens = async (refreshToken, req = null) => {
    const decoded = await verifyTokenAsyncSafe(refreshToken);
    if (decoded.typ !== 'refresh') throw new Error('ERR_INVALID_TYPE');
    if (!store.isRedisReady) throw new Error('REDIS_REQUIRED_FOR_ROTATION');

    if (await isRevoked(decoded.jti) || (decoded.fam && await isFamilyRevoked(decoded.fam))) {
        if (decoded.fam) await revokeFamily(decoded.fam, decoded.exp);
        throw new Error('ERR_REVOKED_FAMILY_BREACH');
    }

    const graceKey = `grace:${hashString(decoded.jti)}`;
    const existingGraceData = await store.get(graceKey);
    if (existingGraceData) return existingGraceData;

    const payload = { id: decoded.id, _id: decoded._id, sub: decoded.sub, role: decoded.role || 'user', tv: decoded.tv || 1, fp: req ? generateFingerprint(req) : decoded.fp };
    const newTokens = await generateAuthTokens(payload, decoded.fam);

    const locked = await store.setGraceAtomic(graceKey, newTokens, CONFIG.gracePeriod);
    if (!locked) {
        const raceData = await store.get(graceKey);
        if (raceData) return raceData;
        throw new Error('ERR_ROTATION_RACE_CONDITION');
    }

    await revokeToken(decoded);
    return newTokens;
};

const authenticateToken = async (req, res, next) => {
    try {
        const ip = extractNormalizedIp(req);
        const throttleKey = hashString(`auth_limit|${ip}`);

        if (await isThrottled(throttleKey)) {
            res.setHeader('Retry-After', CONFIG.bruteWindow);
            return deny(res, 429, 'تم حظر الطلبات مؤقتًا.', 'TOO_MANY_REQUESTS');
        }

        const token = extractToken(req);
        if (!token || token === 'null' || token === 'undefined') return deny(res, 401, 'غير مصرح بالوصول.', 'TOKEN_MISSING');

        if (token.length > CONFIG.maxTokenLength || token.split('.').length !== 3) {
            await recordFailure(throttleKey);
            return deny(res, 401, 'جلسة غير صالحة.', 'TOKEN_MALFORMED');
        }

        let decoded;
        try {
            decoded = await verifyTokenAsyncSafe(token);
        } catch (err) {
            await recordFailure(throttleKey);
            if (err.name === 'TokenExpiredError') return deny(res, 401, 'انتهت صلاحية الجلسة.', 'TOKEN_EXPIRED');
            if (err.name === 'NotBeforeError') return deny(res, 401, 'الجلسة غير مفعّلة بعد.', 'TOKEN_NOT_ACTIVE');
            return deny(res, 401, 'جلسة غير صالحة.', 'TOKEN_INVALID');
        }

        if (decoded.typ === 'refresh') return deny(res, 401, 'نوع التوكن غير صالح.', 'TOKEN_TYPE_MISMATCH');
        if (!decoded.id && !decoded._id && !decoded.sub) return deny(res, 401, 'بيانات الجلسة غير مكتملة.', 'TOKEN_INVALID_SUBJECT');
        if (await isRevoked(decoded.jti) || (decoded.fam && await isFamilyRevoked(decoded.fam))) return deny(res, 401, 'تم إنهاء الجلسة مسبقًا.', 'TOKEN_REVOKED');
        
        const currentFp = generateFingerprint(req);
        if (decoded.fp && !verifyFingerprint(decoded.fp, currentFp)) {
            await recordFailure(throttleKey);
            return deny(res, 401, 'تعذّر التحقق من الهوية.', 'FINGERPRINT_MISMATCH');
        }

        await clearFailures(throttleKey);

        req.user = decoded;
        req.token = token;
        req.tokenId = decoded.jti;
        req.auth = { id: decoded.id || decoded._id || decoded.sub, role: decoded.role || 'user', rank: ROLE_RANK[decoded.role] ?? 0, tokenVersion: decoded.tv || 1, fingerprint: currentFp, ip, issuedAt: decoded.iat, expiresAt: decoded.exp };

        next();
    } catch (error) {
        return deny(res, 500, 'خطأ داخلي في الخادم.', 'INTERNAL_ERROR');
    }
};

const requireRole = (...roles) => {
    const allowed = new Set(roles);
    return (req, res, next) => {
        if (!req.user) return deny(res, 401, 'غير مصرح بالوصول.', 'TOKEN_MISSING');
        if (!allowed.has(req.user.role)) return deny(res, 403, 'صلاحيات غير كافية.', 'FORBIDDEN');
        next();
    };
};

const requireMinRank = (minRole) => {
    const min = ROLE_RANK[minRole] ?? Infinity;
    return (req, res, next) => {
        if (!req.user) return deny(res, 401, 'غير مصرح بالوصول.', 'TOKEN_MISSING');
        if ((ROLE_RANK[req.user.role] ?? -1) < min) return deny(res, 403, 'صلاحيات غير كافية.', 'FORBIDDEN');
        next();
    };
};

const requireAdmin = (req, res, next) => {
    if (!req.user || !ADMIN_ROLES.has(req.user.role)) return deny(res, 403, 'مطلوب صلاحيات مسؤول.', 'FORBIDDEN');
    next();
};

const optionalAuth = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token || token === 'null' || token === 'undefined') {
            req.user = null;
            return next();
        }
        
        const decoded = await verifyTokenAsyncSafe(token);
        if (decoded.typ === 'refresh' || await isRevoked(decoded.jti) || (decoded.fam && await isFamilyRevoked(decoded.fam))) {
            req.user = null;
            req.authError = 'TOKEN_REVOKED_OR_INVALID_TYPE';
        } else {
            req.user = decoded;
        }
        next();
    } catch (error) {
        req.user = null;
        req.authError = 'TOKEN_VERIFICATION_FAILED';
        next();
    }
};

module.exports = { authenticateToken, optionalAuth, requireAdmin, requireRole, requireMinRank, generateFingerprint, generateAuthTokens, verifyTokenAsyncSafe, rotateTokens, revokeToken, revokeFamily, isRevoked, isFamilyRevoked, store, CONFIG, JWT_SECRETS };
