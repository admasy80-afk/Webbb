const { logger } = require('../config/db');

const MAX_NODES = 10000;
const MAX_DEPTH = 20;
const MAX_KEYS_PER_NODE = 1000;
const MAX_KEY_LENGTH = 256;
const MAX_STRING_LENGTH = 1024 * 100;
const MAX_ARRAY_LENGTH = 10000;
const MAX_TOTAL_STRING_BUDGET = 1024 * 1024 * 4;
const SUSPICION_BLOCK_THRESHOLD = 6;

const FORBIDDEN_KEYS = new Set([
    '__proto__', 'prototype', 'constructor', '$where', '$function',
    '$accumulator', '$expr', '$jsonSchema', '$comment', 'mapReduce',
    '$merge', '$out', '$facet', '$lookup', '$graphLookup', '$unionWith'
]);

const RESERVED_PROTO_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const HIGH_RISK_OPERATORS = new Set([
    '$where', '$function', '$accumulator', '$expr', '$regex', '$options',
    '$mod', '$text', '$search', '$nin', '$ne', '$gt', '$gte', '$lt',
    '$lte', '$in', '$or', '$and', '$not', '$nor', '$exists', '$type', '$elemMatch'
]);

const SUSPICIOUS_VALUE_PATTERN = /(\$where|\$function|\$accumulator|sleep\s*\(|benchmark\s*\(|function\s*\(|=>|process\.|require\s*\(|child_process|global\.|globalThis|this\.constructor|__proto__|prototype\s*\[|eval\s*\(|setTimeout\s*\(|setInterval\s*\(|Function\s*\(|fs\.|exec\s*\(|spawn\s*\()/i;
const NOSQL_VALUE_PATTERN = /(\{\s*"?\$[a-zA-Z]+"?\s*:|\[\$ne\]|\$gt|\$lt|\$regex|\$where|\$or\b|\$and\b)/i;
const SQLI_VALUE_PATTERN = /(\bunion\b\s+\bselect\b|\bselect\b.+\bfrom\b|\binsert\b\s+\binto\b|\bdrop\b\s+\btable\b|\bupdate\b.+\bset\b|\bdelete\b\s+\bfrom\b|--\s|;\s*--|\bor\b\s+1\s*=\s*1|'\s*or\s*'1'\s*=\s*'1|\/\*.*\*\/|\bxp_cmdshell\b|\bsleep\s*$$\s*\d+\s*$$)/i;
const PATH_TRAVERSAL_PATTERN = /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|\/etc\/passwd|c:\\windows|boot\.ini)/i;
const TEMPLATE_INJECTION_PATTERN = /(\{\{.*\}\}|\$\{.*\}|<%.*%>|#\{.*\})/;
const COMMAND_INJECTION_PATTERN = /(\|\s*\w+|;\s*\w+|`[^`]+`|\$$$[^)]+$$|&&\s*\w+|\|\|\s*\w+)/;

const toString = Object.prototype.toString;

function isSafeObject(value) {
    if (!value || typeof value !== 'object') return false;
    if (Buffer.isBuffer(value) || Array.isArray(value)) return false;
    try {
        const proto = Object.getPrototypeOf(value);
        return (proto === null || proto === Object.prototype) && toString.call(value) === '[object Object]';
    } catch (_) {
        return false;
    }
}

function isSafeArray(value) {
    return Array.isArray(value);
}

function fingerprint(req) {
    const ua = req.headers ? req.headers['user-agent'] || '' : '';
    const ip = req.ip || '';
    let hash = 5381;
    const raw = ip + '|' + ua;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}

function describeOffense(req, key, reason, extra) {
    const base = {
        reason,
        key,
        path: req.path,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        ip: req.ip,
        ips: req.ips,
        method: req.method,
        protocol: req.protocol,
        secure: req.secure,
        hostname: req.hostname,
        userAgent: req.headers ? req.headers['user-agent'] : undefined,
        referer: req.headers ? req.headers['referer'] : undefined,
        origin: req.headers ? req.headers['origin'] : undefined,
        contentType: req.headers ? req.headers['content-type'] : undefined,
        contentLength: req.headers ? req.headers['content-length'] : undefined,
        acceptLanguage: req.headers ? req.headers['accept-language'] : undefined,
        xForwardedFor: req.headers ? req.headers['x-forwarded-for'] : undefined,
        userId: req.user ? (req.user.id || req.user._id) : undefined,
        sessionId: req.sessionID,
        requestId: req.id || (req.headers ? req.headers['x-request-id'] : undefined),
        fingerprint: fingerprint(req),
        timestamp: new Date().toISOString()
    };
    if (extra) {
        const ek = Object.keys(extra);
        for (let i = 0; i < ek.length; i++) {
            base[ek[i]] = extra[ek[i]];
        }
    }
    return base;
}

function severityFor(reason) {
    switch (reason) {
        case 'operator_injection':
        case 'forbidden_key':
        case 'prototype_pollution':
        case 'suspicious_payload_value':
        case 'sql_injection_value':
        case 'nosql_injection_value':
        case 'command_injection_value':
        case 'high_risk_operator':
        case 'tainted_object_prototype':
        case 'invalid_object_keys':
            return 'critical';
        case 'path_traversal_value':
        case 'template_injection_value':
        case 'null_byte':
        case 'null_byte_value':
        case 'control_character':
            return 'high';
        case 'max_nodes_exceeded':
        case 'max_depth_exceeded':
        case 'max_keys_exceeded':
        case 'array_too_large':
        case 'string_too_long':
        case 'string_budget_exceeded':
        case 'suspicion_threshold_exceeded':
            return 'medium';
        default:
            return 'low';
    }
}

function reject(req, res, statusCode, errorMessage, offense) {
    if (logger && typeof logger.warn === 'function') {
        offense.severity = severityFor(offense.reason);
        offense.action = 'blocked';
        logger.warn(offense, "🚨 تم رفض الطلب بسبب محتوى مشبوه");
    }
    if (res.headersSent) {
        return false;
    }
    res.status(statusCode).json({
        success: false,
        error: errorMessage,
        code: offense.reason,
        requestId: offense.requestId
    });
    return false;
}

function inspectKey(key) {
    if (typeof key !== 'string') return 'invalid_key_type';
    if (key.length === 0) return 'empty_key';
    if (key.length > MAX_KEY_LENGTH) return 'key_too_long';
    
    if (key.charCodeAt(0) === 36) {
        if (HIGH_RISK_OPERATORS.has(key)) return 'high_risk_operator';
        return 'operator_injection';
    }
    
    if (key.indexOf('.') !== -1) return 'dotted_key';
    if (key.indexOf('\0') !== -1) return 'null_byte';
    if (FORBIDDEN_KEYS.has(key)) return 'forbidden_key';
    if (RESERVED_PROTO_KEYS.has(key)) return 'prototype_pollution';
    
    for (let i = 0; i < key.length; i++) {
        const code = key.charCodeAt(i);
        if (code < 32 || code === 127) return 'control_character';
    }
    return null;
}

function inspectValue(value, budget, ctx) {
    if (typeof value === 'string') {
        const len = value.length;
        if (len > MAX_STRING_LENGTH) return 'string_too_long';
        
        budget.used += len;
        if (budget.used > MAX_TOTAL_STRING_BUDGET) return 'string_budget_exceeded';
        
        if (value.indexOf('\0') !== -1) return 'null_byte_value';
        
        if (len > 3) {
            if (SUSPICIOUS_VALUE_PATTERN.test(value)) return 'suspicious_payload_value';
            if (NOSQL_VALUE_PATTERN.test(value)) return 'nosql_injection_value';
            if (SQLI_VALUE_PATTERN.test(value)) return 'sql_injection_value';
            if (PATH_TRAVERSAL_PATTERN.test(value)) return 'path_traversal_value';
            if (COMMAND_INJECTION_PATTERN.test(value)) return 'command_injection_value';
            if (TEMPLATE_INJECTION_PATTERN.test(value)) return 'template_injection_value';
            
            if (/(?:<script|onerror=|onload=|onmouseover=|javascript:)/i.test(value)) {
                ctx.suspicionScore += 4;
            } else if (/%(?:27|22|3C|3E|00)/i.test(value)) {
                ctx.suspicionScore += 1;
            } else if (/(\.\.\/|\.\.\\)/.test(value)) {
                ctx.suspicionScore += 2;
            }
        }
    } else if (typeof value === 'number') {
        if (!Number.isFinite(value) || Number.isNaN(value)) {
            ctx.suspicionScore += 1;
        }
    }
    return null;
}

function applySecurityHeaders(res) {
    if (typeof res.setHeader !== 'function' || res.headersSent) return;
    
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    res.removeHeader('X-Powered-By');
}

module.exports = (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const stack = [];
    const seen = new WeakSet();
    const budget = { used: 0 };
    const ctx = { suspicionScore: 0 };
    let visitedNodes = 0;

    if (isSafeObject(req.body) || isSafeArray(req.body)) stack.push({ obj: req.body, depth: 0, src: 'body' });
    if (isSafeObject(req.query) || isSafeArray(req.query)) stack.push({ obj: req.query, depth: 0, src: 'query' });
    if (isSafeObject(req.params) || isSafeArray(req.params)) stack.push({ obj: req.params, depth: 0, src: 'params' });

    while (stack.length > 0) {
        const frame = stack.pop();
        const { obj, depth, src } = frame;

        if (obj === null || seen.has(obj)) continue;
        seen.add(obj);

        visitedNodes++;
        if (visitedNodes > MAX_NODES) {
            return reject(req, res, 413, 'Payload too large', describeOffense(req, null, 'max_nodes_exceeded', { src, visitedNodes }));
        }

        if (depth > MAX_DEPTH) {
            return reject(req, res, 413, 'Payload too deep', describeOffense(req, null, 'max_depth_exceeded', { src, depth }));
        }

        if (isSafeArray(obj)) {
            if (obj.length > MAX_ARRAY_LENGTH) {
                return reject(req, res, 413, 'Payload too large', describeOffense(req, null, 'array_too_large', { src, length: obj.length }));
            }
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i];
                const itemReason = inspectValue(item, budget, ctx);
                
                if (itemReason) {
                    return reject(req, res, 400, 'Invalid payload', describeOffense(req, String(i), itemReason, { src }));
                }
                
                if (isSafeObject(item) || isSafeArray(item)) {
                    stack.push({ obj: item, depth: depth + 1, src });
                }
            }
            continue;
        }

        if (!isSafeObject(obj)) {
            return reject(req, res, 400, 'Invalid payload', describeOffense(req, null, 'tainted_object_prototype', { src }));
        }

        let keys;
        try {
            keys = Object.keys(obj);
        } catch (e) {
            return reject(req, res, 400, 'Invalid payload', describeOffense(req, null, 'invalid_object_keys', { src }));
        }

        if (keys.length > MAX_KEYS_PER_NODE) {
            return reject(req, res, 413, 'Too many keys', describeOffense(req, null, 'max_keys_exceeded', { src, keys: keys.length }));
        }

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            const keyReason = inspectKey(key);
            if (keyReason) {
                return reject(req, res, 400, 'Invalid payload', describeOffense(req, key, keyReason, { src }));
            }

            const value = obj[key];
            const valueReason = inspectValue(value, budget, ctx);
            
            if (valueReason) {
                return reject(req, res, 400, 'Invalid payload', describeOffense(req, key, valueReason, { src }));
            }

            if (isSafeObject(value) || isSafeArray(value)) {
                stack.push({ obj: value, depth: depth + 1, src });
            }
        }
    }

    if (ctx.suspicionScore >= SUSPICION_BLOCK_THRESHOLD) {
        return reject(req, res, 400, 'Invalid payload', describeOffense(req, null, 'suspicion_threshold_exceeded', { suspicionScore: ctx.suspicionScore }));
    }

    applySecurityHeaders(res);

    const elapsedNs = process.hrtime.bigint() - startedAt;
    req.securityScan = {
        nodes: visitedNodes,
        bytes: budget.used,
        elapsedMs: Number(elapsedNs) / 1e6,
        fingerprint: fingerprint(req),
        riskScore: ctx.suspicionScore
    };

    if (typeof res.setHeader === 'function' && !res.headersSent) {
        res.setHeader('X-Sanitizer', 'verified');
    }

    next();
};
