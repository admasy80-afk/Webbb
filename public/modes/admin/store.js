import { CONFIG } from './config.js';

export const State = (() => {
    const _sysSpecs = { mem: typeof navigator !== 'undefined' && navigator.deviceMemory ? navigator.deviceMemory : 4, cores: typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4 };
    let _maxCacheSize = Math.floor(_sysSpecs.mem * 250);
    let _currentGradeData = null;
    let _pendingRequests = [];
    const _studentsCache = new Map();
    const _loadingKeys = new Set();
    const _abortMap = new Map();
    const _reqIds = new Map();
    const _subscribers = new Map();
    const _metrics = { hits: 0, misses: 0, evictions: 0, requests: 0, duplicates: 0, prefetchExecutions: 0, prefetchHits: 0 };
    const _requestQueue = new Map();
    const _prefetchQueue = new Set();
    const _cacheVersions = new Map();
    const _dirtyKeys = new Set();
    const _persistenceKey = 'state_cache_v3_elite';
    const _accessOrder = new Map();
    const _accessFrequency = new Map();
    const _markovTransitions = new Map();
    let _lastAccessedKey = null;
    const _requestTimestamps = new Map();
    const _errorCounts = new Map();
    const _circuitBreakers = new Map();
    const _backgroundRefreshTimers = new Map();
    let _gcTimer = null;
    let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let _visibilityState = typeof document !== 'undefined' ? document.visibilityState : 'visible';
    let _performanceObserver = null;
    let _intersectionObserver = null;
    const _offlineQueue = [];
    const _syncLock = new Set();
    const _cacheTagMap = new Map();
    const _tagCacheMap = new Map();
    const _requestDedupeWindow = 50;
    const _pendingDedupeMap = new Map();
    const _adaptiveTTL = new Map();
    const _networkCondition = { type: 'unknown', rtt: 0, downlink: 0, saveData: false };
    const _memoryPressure = { level: 'none', lastCheck: 0, limit: 0, used: 0 };
    const _stateHistory = [];
    const _maxHistorySize = 100;
    const _snapshotMap = new Map();
    const _transactionLog = [];
    const _idleCallbacks = [];
    let _idleScheduled = false;
    const _eventBuffer = [];
    let _eventTimer = null;

    const _dbPromise = (() => {
        if (typeof indexedDB === 'undefined') return Promise.reject();
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('EliteStateDB', 2);
            req.onupgradeneeded = e => {
                if (!e.target.result.objectStoreNames.contains('cache')) {
                    e.target.result.createObjectStore('cache', { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject();
        });
    })();

    const _estimateSize = (data) => {
        if (!data) return 0;
        if (typeof data === 'string') return data.length * 2;
        if (Array.isArray(data)) return data.length * 100;
        if (typeof data === 'object') return Object.keys(data).length * 100;
        return 50;
    };

    const _notifySubscribers = (event, payload) => {
        _eventBuffer.push({ event, payload });
        if (!_eventTimer) {
            const runner = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
            _eventTimer = runner(() => {
                const batch = _eventBuffer.splice(0);
                _eventTimer = null;
                batch.forEach(({ event: ev, payload: p }) => {
                    const handlers = _subscribers.get(ev);
                    if (handlers) handlers.forEach(fn => { try { fn(p); } catch (e) {} });
                    const wildcardHandlers = _subscribers.get('*');
                    if (wildcardHandlers) wildcardHandlers.forEach(fn => { try { fn(ev, p); } catch (e) {} });
                });
            });
        }
    };

    const _detectNetworkCondition = () => {
        if (typeof navigator !== 'undefined' && navigator.connection) {
            const conn = navigator.connection;
            _networkCondition.type = conn.effectiveType || 'unknown';
            _networkCondition.rtt = conn.rtt || 0;
            _networkCondition.downlink = conn.downlink || 0;
            _networkCondition.saveData = conn.saveData || false;
            _maxCacheSize = _networkCondition.saveData ? Math.floor(_sysSpecs.mem * 100) : Math.floor(_sysSpecs.mem * 250);
        }
    };

    const _getAdaptiveTTL = (grade) => {
        const base = CONFIG.CACHE_TTL_MS || 300000;
        const freqScore = _accessFrequency.get(grade) || 0;
        const networkMultiplier = _networkCondition.type === '4g' ? 1 : _networkCondition.type === '3g' ? 2 : 3;
        const freqMultiplier = freqScore > 50 ? 0.6 : freqScore > 20 ? 0.8 : 1;
        const stored = _adaptiveTTL.get(grade);
        if (stored) return stored;
        return Math.floor(base * networkMultiplier * freqMultiplier);
    };

    const _updateMarkovAndFreq = (grade) => {
        const now = Date.now();
        _accessOrder.set(grade, now);
        _accessFrequency.set(grade, (_accessFrequency.get(grade) || 0) + 1);
        if (_lastAccessedKey && _lastAccessedKey !== grade) {
            const transitions = _markovTransitions.get(_lastAccessedKey) || new Map();
            transitions.set(grade, (transitions.get(grade) || 0) + 1);
            _markovTransitions.set(_lastAccessedKey, transitions);
        }
        _lastAccessedKey = grade;
    };

    const _evictLFRU = () => {
        if (_studentsCache.size <= _maxCacheSize) return;
        const now = Date.now();
        const weights = [..._studentsCache.keys()].map(key => {
            const freq = _accessFrequency.get(key) || 1;
            const recency = now - (_accessOrder.get(key) || now);
            const score = (freq * 10000) / (recency + 1);
            return { key, score };
        });
        weights.sort((a, b) => a.score - b.score);
        const toEvict = weights.slice(0, Math.max(1, Math.floor(_maxCacheSize * 0.15)));
        toEvict.forEach(({ key }) => {
            _studentsCache.delete(key);
            _accessOrder.delete(key);
            _accessFrequency.delete(key);
            _cacheVersions.delete(key);
            _metrics.evictions++;
            _notifySubscribers(`cache:evict:${key}`, key);
            _dbPromise.then(db => {
                const tx = db.transaction('cache', 'readwrite');
                tx.objectStore('cache').delete(key);
            }).catch(() => {});
        });
    };

    const _checkMemoryPressure = () => {
        if (typeof performance !== 'undefined' && performance.memory) {
            const mem = performance.memory;
            _memoryPressure.used = mem.usedJSHeapSize;
            _memoryPressure.limit = mem.jsHeapSizeLimit;
            const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
            const prev = _memoryPressure.level;
            if (ratio > 0.92) _memoryPressure.level = 'critical';
            else if (ratio > 0.75) _memoryPressure.level = 'high';
            else if (ratio > 0.5) _memoryPressure.level = 'moderate';
            else _memoryPressure.level = 'none';
            _memoryPressure.lastCheck = Date.now();
            if (_memoryPressure.level === 'critical' && prev !== 'critical') _emergencyEviction();
        }
    };

    const _emergencyEviction = () => {
        const toKeep = Math.floor(_maxCacheSize * 0.2);
        const sorted = [..._accessOrder.entries()].sort((a, b) => b[1] - a[1]).slice(0, toKeep);
        const keepSet = new Set(sorted.map(([k]) => k));
        [..._studentsCache.keys()].forEach(k => {
            if (!keepSet.has(k)) {
                _studentsCache.delete(k);
                _accessOrder.delete(k);
                _metrics.evictions++;
            }
        });
        _notifySubscribers('memory:pressure:eviction', { level: _memoryPressure.level, retained: keepSet.size });
    };

    const _circuitBreakerCheck = (key) => {
        const cb = _circuitBreakers.get(key);
        if (!cb) return true;
        if (cb.state === 'open') {
            const backoff = Math.min(300000, Math.pow(2, cb.errors) * 1000 + Math.random() * 1000);
            if (Date.now() - cb.openedAt > backoff) {
                cb.state = 'half-open';
                return true;
            }
            return false;
        }
        return true;
    };

    const _recordError = (key) => {
        const count = (_errorCounts.get(key) || 0) + 1;
        _errorCounts.set(key, count);
        const threshold = CONFIG.CIRCUIT_BREAKER_THRESHOLD || 3;
        if (count >= threshold) {
            _circuitBreakers.set(key, { state: 'open', openedAt: Date.now(), errors: count });
            _notifySubscribers(`circuit:open:${key}`, { key, errors: count });
        }
    };

    const _recordSuccess = (key) => {
        _errorCounts.delete(key);
        const cb = _circuitBreakers.get(key);
        if (cb) {
            _circuitBreakers.delete(key);
            _notifySubscribers(`circuit:closed:${key}`, { key });
        }
    };

    const _scheduleIdle = (fn) => {
        _idleCallbacks.push(fn);
        if (!_idleScheduled) {
            _idleScheduled = true;
            const runner = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : (cb) => setTimeout(cb, 50);
            runner(() => {
                _idleScheduled = false;
                const cbs = _idleCallbacks.splice(0, 5);
                cbs.forEach(cb => { try { cb(); } catch (e) {} });
                if (_idleCallbacks.length > 0) _scheduleIdle(() => {});
            });
        }
    };

    const _persistCache = () => {
        if (_dirtyKeys.size === 0) return;
        const toSync = [];
        _dirtyKeys.forEach(key => {
            const val = _studentsCache.get(key);
            if (val && Date.now() < val.expiry) toSync.push({ key, ...val });
        });
        _dirtyKeys.clear();
        if (toSync.length === 0) return;
        _dbPromise.then(db => {
            const tx = db.transaction('cache', 'readwrite');
            const store = tx.objectStore('cache');
            toSync.forEach(item => store.put(item));
        }).catch(() => {
            try {
                const serializable = {};
                _studentsCache.forEach((val, key) => {
                    if (Date.now() < val.expiry) serializable[key] = val;
                });
                sessionStorage.setItem(_persistenceKey, JSON.stringify(serializable));
            } catch (e) {}
        });
    };

    const _restoreCache = () => {
        _dbPromise.then(db => {
            const tx = db.transaction('cache', 'readonly');
            const store = tx.objectStore('cache');
            const req = store.getAll();
            req.onsuccess = () => {
                const now = Date.now();
                req.result.forEach(v => {
                    if (now < v.expiry) {
                        _studentsCache.set(v.key, { data: v.data, expiry: v.expiry, version: v.version, size: v.size, tags: v.tags, etag: v.etag, lastModified: v.lastModified, _isPrefetched: v._isPrefetched });
                        _accessOrder.set(v.key, now);
                    } else {
                        _scheduleIdle(() => {
                            _dbPromise.then(db2 => db2.transaction('cache', 'readwrite').objectStore('cache').delete(v.key)).catch(()=>{});
                        });
                    }
                });
            };
        }).catch(() => {
            try {
                const raw = sessionStorage.getItem(_persistenceKey);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                const now = Date.now();
                Object.entries(parsed).forEach(([k, v]) => {
                    if (now < v.expiry) {
                        _studentsCache.set(k, v);
                        _accessOrder.set(k, now);
                    }
                });
            } catch (e) {}
        });
    };

    const _predictivePrewarm = (fetcher) => {
        if (!_lastAccessedKey || !fetcher || !_isOnline || _networkCondition.saveData) return;
        const transitions = _markovTransitions.get(_lastAccessedKey);
        if (!transitions) return;
        let bestKey = null;
        let maxCount = 0;
        transitions.forEach((count, key) => {
            if (count > maxCount && !_studentsCache.has(key) && !_loadingKeys.has(key)) {
                maxCount = count;
                bestKey = key;
            }
        });
        if (bestKey && maxCount > 2) {
            _scheduleIdle(async () => {
                try {
                    const data = await fetcher(bestKey);
                    if (data) {
                        module.setCachedStudents(bestKey, data, { _isPrefetch: true });
                        _metrics.prefetchExecutions++;
                    }
                } catch (e) {}
            });
        }
    };

    const _backgroundRefresh = (grade, fetcher) => {
        if (!fetcher) return;
        const existing = _backgroundRefreshTimers.get(grade);
        if (existing) clearTimeout(existing);
        const entry = _studentsCache.get(grade);
        if (!entry) return;
        const timeToExpiry = entry.expiry - Date.now();
        const refreshAt = Math.max(0, timeToExpiry - (_getAdaptiveTTL(grade) * 0.3));
        const timer = setTimeout(async () => {
            if (_visibilityState === 'hidden' || _networkCondition.saveData) return;
            try {
                const fresh = await fetcher(grade);
                if (fresh) {
                    module.setCachedStudents(grade, fresh);
                    _notifySubscribers(`cache:refresh:${grade}`, { grade, data: fresh });
                }
            } catch (e) {} finally {
                _backgroundRefreshTimers.delete(grade);
            }
        }, refreshAt);
        _backgroundRefreshTimers.set(grade, timer);
    };

    const _runGCMicrotask = function* () {
        const now = Date.now();
        let collected = 0;
        const keys = [..._studentsCache.keys()];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const entry = _studentsCache.get(key);
            if (entry && now > entry.expiry) {
                _studentsCache.delete(key);
                _accessOrder.delete(key);
                _accessFrequency.delete(key);
                _cacheVersions.delete(key);
                _dirtyKeys.delete(key);
                collected++;
                _metrics.evictions++;
            } else {
                const freq = _accessFrequency.get(key);
                if (freq) {
                    const decayed = freq * 0.95;
                    if (decayed < 1) _accessFrequency.delete(key);
                    else _accessFrequency.set(key, decayed);
                }
            }
            if (i % 50 === 0) yield;
        }
        const markovKeys = [..._markovTransitions.keys()];
        for (let i = 0; i < markovKeys.length; i++) {
            const src = markovKeys[i];
            const transitions = _markovTransitions.get(src);
            for (const [tgt, count] of transitions) {
                const newCount = count * 0.95;
                if (newCount < 0.5) transitions.delete(tgt);
                else transitions.set(tgt, newCount);
            }
            if (transitions.size === 0) _markovTransitions.delete(src);
            if (i % 20 === 0) yield;
        }
        for (const [key] of _reqIds) {
            if (!_loadingKeys.has(key)) _reqIds.delete(key);
            yield;
        }
        for (const [key, val] of _pendingDedupeMap) {
            if (now - val.ts > _requestDedupeWindow * 10) _pendingDedupeMap.delete(key);
        }
        if (collected > 0) _notifySubscribers('gc:complete', { collected, cacheSize: _studentsCache.size });
        _checkMemoryPressure();
        if (_studentsCache.size > _maxCacheSize) _evictLFRU();
    };

    const _runGC = () => {
        const iterator = _runGCMicrotask();
        const processChunk = () => {
            const start = performance.now();
            while (performance.now() - start < 5) {
                const { done } = iterator.next();
                if (done) return;
            }
            if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(processChunk);
            } else {
                setTimeout(processChunk, 16);
            }
        };
        processChunk();
    };

    const _startGCTimer = () => {
        if (_gcTimer) clearInterval(_gcTimer);
        const interval = _visibilityState === 'hidden' ? 120000 : (CONFIG.GC_INTERVAL_MS || 45000);
        _gcTimer = setInterval(_runGC, interval);
    };

    const _recordTransaction = (type, key, meta = {}) => {
        const ts = Date.now();
        if (_stateHistory.length >= _maxHistorySize) _stateHistory.shift();
        _stateHistory.push({ type, key, ts, ...meta });
        _transactionLog.push({ type, key, ts, ...meta });
        if (_transactionLog.length > 500) _transactionLog.splice(0, 250);
    };

    const _tagCache = (grade, tags = []) => {
        _cacheTagMap.set(grade, tags);
        tags.forEach(tag => {
            const existing = _tagCacheMap.get(tag) || new Set();
            existing.add(grade);
            _tagCacheMap.set(tag, existing);
        });
    };

    const _invalidateByTag = (tag) => {
        const keys = _tagCacheMap.get(tag);
        if (!keys) return;
        keys.forEach(k => {
            _studentsCache.delete(k);
            _accessOrder.delete(k);
            _accessFrequency.delete(k);
            _cacheVersions.delete(k);
            _metrics.evictions++;
            _dbPromise.then(db => db.transaction('cache', 'readwrite').objectStore('cache').delete(k)).catch(()=>{});
        });
        _tagCacheMap.delete(tag);
        _notifySubscribers(`invalidate:tag:${tag}`, { tag, count: keys.size });
    };

    const _prefetch = async (grades, fetcher) => {
        if (!fetcher || _isOnline === false || _networkCondition.saveData) return;
        const toFetch = grades.filter(g => {
            if (_prefetchQueue.has(g)) return false;
            const entry = _studentsCache.get(g);
            return !(entry && Date.now() < entry.expiry);
        });
        toFetch.forEach(g => _prefetchQueue.add(g));
        let active = 0;
        const maxConcurrent = _sysSpecs.cores;
        const processNext = async () => {
            if (toFetch.length === 0 || active >= maxConcurrent) return;
            const grade = toFetch.shift();
            active++;
            try {
                const data = await fetcher(grade);
                if (data) {
                    module.setCachedStudents(grade, data, { _isPrefetch: true });
                    _metrics.prefetchExecutions++;
                }
            } catch (e) {} finally {
                _prefetchQueue.delete(grade);
                active--;
                processNext();
            }
        };
        for (let i = 0; i < maxConcurrent; i++) processNext();
    };

    const _deduplicateRequest = (key, requestFn) => {
        const now = Date.now();
        const existing = _pendingDedupeMap.get(key);
        if (existing && now - existing.ts < _requestDedupeWindow) {
            _metrics.duplicates++;
            return existing.promise;
        }
        const promise = requestFn();
        _pendingDedupeMap.set(key, { promise, ts: now });
        promise.finally(() => setTimeout(() => _pendingDedupeMap.delete(key), _requestDedupeWindow));
        return promise;
    };

    const _queueOfflineRequest = (request) => {
        _offlineQueue.push({ ...request, ts: Date.now(), retries: 0 });
        _notifySubscribers('offline:queued', { queueSize: _offlineQueue.length });
    };

    const _flushOfflineQueue = async () => {
        if (!_isOnline || _offlineQueue.length === 0) return;
        const queue = _offlineQueue.splice(0);
        for (const req of queue) {
            try {
                if (req.execute) await req.execute();
                _notifySubscribers('offline:flushed', req);
            } catch (e) {
                req.retries++;
                if (req.retries < 3) _offlineQueue.unshift(req);
                break;
            }
        }
    };

    _restoreCache();
    _startGCTimer();
    _detectNetworkCondition();
    setInterval(_persistCache, 5000);

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            _isOnline = true;
            _notifySubscribers('network:online', null);
            _flushOfflineQueue();
        });
        window.addEventListener('offline', () => {
            _isOnline = false;
            _notifySubscribers('network:offline', null);
        });
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            _visibilityState = document.visibilityState;
            _startGCTimer();
            if (_visibilityState === 'visible') {
                _runGC();
                _detectNetworkCondition();
                _notifySubscribers('visibility:visible', null);
            }
        });
    }

    if (typeof navigator !== 'undefined' && navigator.connection) {
        navigator.connection.addEventListener('change', _detectNetworkCondition);
    }

    if (typeof PerformanceObserver !== 'undefined') {
        try {
            _performanceObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
                        _notifySubscribers('perf:metric', { name: entry.name, duration: entry.duration });
                    }
                });
            });
            _performanceObserver.observe({ entryTypes: ['navigation', 'resource'] });
        } catch (e) {}
    }

    const module = {
        get currentGradeData() { return _currentGradeData; },
        set currentGradeData(v) {
            const prev = _currentGradeData;
            _currentGradeData = v;
            _recordTransaction('set:currentGradeData', 'currentGradeData', { prev: !!prev, next: !!v });
            _notifySubscribers('currentGradeData:change', { prev, next: v });
        },

        get pendingRequests() { return _pendingRequests; },
        set pendingRequests(v) {
            _pendingRequests = v;
            _notifySubscribers('pendingRequests:change', { count: v.length });
        },

        getCachedStudents: (grade) => {
            const entry = _studentsCache.get(grade);
            if (!entry) {
                _metrics.misses++;
                _notifySubscribers('cache:miss', { grade });
                return null;
            }
            if (Date.now() > entry.expiry) {
                _studentsCache.delete(grade);
                _accessOrder.delete(grade);
                _accessFrequency.delete(grade);
                _cacheVersions.delete(grade);
                _dirtyKeys.delete(grade);
                _metrics.misses++;
                _metrics.evictions++;
                _notifySubscribers('cache:expired', { grade });
                return null;
            }
            _metrics.hits++;
            if (entry._isPrefetch) {
                _metrics.prefetchHits++;
                entry._isPrefetch = false;
                _dirtyKeys.add(grade);
            }
            _updateMarkovAndFreq(grade);
            if (entry.fetcher) {
                _scheduleIdle(() => _predictivePrewarm(entry.fetcher));
            }
            _notifySubscribers('cache:hit', { grade });
            return entry.data;
        },

        setCachedStudents: (grade, data, options = {}) => {
            const ttl = options.ttl || _getAdaptiveTTL(grade);
            const version = (_cacheVersions.get(grade) || 0) + 1;
            const size = _estimateSize(data);
            _cacheVersions.set(grade, version);
            _studentsCache.set(grade, {
                data,
                expiry: Date.now() + ttl,
                version,
                size,
                tags: options.tags || [],
                etag: options.etag || null,
                lastModified: options.lastModified || null,
                fetcher: options.fetcher,
                _isPrefetch: options._isPrefetch || false
            });
            _updateMarkovAndFreq(grade);
            _dirtyKeys.add(grade);
            if (options.tags) _tagCache(grade, options.tags);
            _recordTransaction('cache:set', grade, { version, ttl, size });
            _notifySubscribers('cache:set', { grade, version, ttl });
            if (_studentsCache.size > _maxCacheSize) _evictLFRU();
            if (options.fetcher) _backgroundRefresh(grade, options.fetcher);
        },

        invalidateStudents: (grade) => {
            if (grade) {
                _studentsCache.delete(grade);
                _accessOrder.delete(grade);
                _accessFrequency.delete(grade);
                _cacheVersions.delete(grade);
                _dirtyKeys.delete(grade);
                _backgroundRefreshTimers.get(grade) && clearTimeout(_backgroundRefreshTimers.get(grade));
                _backgroundRefreshTimers.delete(grade);
                _recordTransaction('cache:invalidate', grade);
                _notifySubscribers('cache:invalidate', { grade });
                _dbPromise.then(db => db.transaction('cache', 'readwrite').objectStore('cache').delete(grade)).catch(()=>{});
            } else {
                _studentsCache.clear();
                _accessOrder.clear();
                _accessFrequency.clear();
                _cacheVersions.clear();
                _dirtyKeys.clear();
                _backgroundRefreshTimers.forEach(t => clearTimeout(t));
                _backgroundRefreshTimers.clear();
                _recordTransaction('cache:invalidate:all', '*');
                _notifySubscribers('cache:invalidate:all', null);
                _dbPromise.then(db => db.transaction('cache', 'readwrite').objectStore('cache').clear()).catch(()=>{});
            }
        },

        invalidateByTag: _invalidateByTag,

        isLoading: (key) => _loadingKeys.has(key),
        setLoading: (k, v) => {
            const changed = v ? !_loadingKeys.has(k) : _loadingKeys.has(k);
            v ? _loadingKeys.add(k) : _loadingKeys.delete(k);
            if (changed) _notifySubscribers(`loading:${v ? 'start' : 'end'}`, { key: k });
        },

        generateReqId(key) {
            const id = `${Date.now()}_${Math.random().toString(36).slice(2)}_${(typeof performance !== 'undefined' ? performance.now() * 1000 | 0 : 0)}`;
            _reqIds.set(key, id);
            _requestTimestamps.set(key, Date.now());
            _metrics.requests++;
            _recordTransaction('req:generate', key, { id });
            return id;
        },

        isReqValid: (key, id) => _reqIds.get(key) === id,

        abort(key) {
            const existing = _abortMap.get(key);
            if (existing && !existing.signal.aborted) {
                existing.abort();
                _notifySubscribers('req:aborted', { key });
                _recordTransaction('req:abort', key);
            }
            const ctrl = new AbortController();
            _abortMap.set(key, ctrl);
            return ctrl;
        },

        abortAll() {
            _abortMap.forEach((ctrl, key) => {
                if (!ctrl.signal.aborted) {
                    ctrl.abort();
                    _notifySubscribers('req:aborted', { key });
                }
            });
            _abortMap.clear();
        },

        subscribe: (event, fn) => {
            const handlers = _subscribers.get(event) || new Set();
            handlers.add(fn);
            _subscribers.set(event, handlers);
            return () => {
                handlers.delete(fn);
                if (handlers.size === 0) _subscribers.delete(event);
            };
        },

        once: (event, fn) => {
            const unsub = module.subscribe(event, (...args) => {
                unsub();
                fn(...args);
            });
            return unsub;
        },

        prefetch: _prefetch,
        deduplicateRequest: _deduplicateRequest,
        queueOfflineRequest: _queueOfflineRequest,
        flushOfflineQueue: _flushOfflineQueue,

        isCircuitOpen: (key) => !_circuitBreakerCheck(key),
        recordError: _recordError,
        recordSuccess: _recordSuccess,

        getMetrics: () => ({
            ..._metrics,
            cacheSize: _studentsCache.size,
            maxCacheSize: _maxCacheSize,
            loadingKeys: _loadingKeys.size,
            pendingAborts: _abortMap.size,
            hitRate: _metrics.hits / (_metrics.hits + _metrics.misses || 1),
            offlineQueueSize: _offlineQueue.length,
            networkCondition: { ..._networkCondition },
            memoryPressure: { ..._memoryPressure },
            circuitBreakers: _circuitBreakers.size,
            prefetchQueue: _prefetchQueue.size,
            isOnline: _isOnline
        }),

        getStateHistory: () => [..._stateHistory],
        getTransactionLog: () => [..._transactionLog],

        snapshot: (label) => {
            const snap = {
                label,
                ts: Date.now(),
                cacheSize: _studentsCache.size,
                metrics: { ..._metrics },
                loadingKeys: [..._loadingKeys],
                pendingRequests: _pendingRequests.length
            };
            _snapshotMap.set(label, snap);
            return snap;
        },

        diffSnapshot: (labelA, labelB) => {
            const a = _snapshotMap.get(labelA);
            const b = _snapshotMap.get(labelB);
            if (!a || !b) return null;
            return {
                cacheSizeDelta: b.cacheSize - a.cacheSize,
                hitsDelta: b.metrics.hits - a.metrics.hits,
                missesDelta: b.metrics.misses - a.metrics.misses,
                evictionsDelta: b.metrics.evictions - a.metrics.evictions,
                duration: b.ts - a.ts
            };
        },

        setAdaptiveTTL: (grade, ttl) => _adaptiveTTL.set(grade, ttl),
        getNetworkCondition: () => ({ ..._networkCondition }),
        getMemoryPressure: () => ({ ..._memoryPressure }),
        isOnline: () => _isOnline,
        forceGC: () => { _runGC(); return _studentsCache.size; },

        reset: () => {
            _studentsCache.clear();
            _loadingKeys.clear();
            _abortMap.forEach(ctrl => { try { ctrl.abort(); } catch (e) {} });
            _abortMap.clear();
            _reqIds.clear();
            _requestTimestamps.clear();
            _errorCounts.clear();
            _circuitBreakers.clear();
            _backgroundRefreshTimers.forEach(t => clearTimeout(t));
            _backgroundRefreshTimers.clear();
            _accessOrder.clear();
            _accessFrequency.clear();
            _markovTransitions.clear();
            _cacheVersions.clear();
            _dirtyKeys.clear();
            _prefetchQueue.clear();
            _pendingDedupeMap.clear();
            _adaptiveTTL.clear();
            _subscribers.clear();
            _stateHistory.length = 0;
            _transactionLog.length = 0;
            _offlineQueue.length = 0;
            _currentGradeData = null;
            _pendingRequests = [];
            _lastAccessedKey = null;
            _recordTransaction('reset', '*');
            _notifySubscribers('state:reset', null);
            try { sessionStorage.removeItem(_persistenceKey); } catch (e) {}
            _dbPromise.then(db => db.transaction('cache', 'readwrite').objectStore('cache').clear()).catch(()=>{});
        },

        destroy: () => {
            if (_gcTimer) clearInterval(_gcTimer);
            if (_performanceObserver) { try { _performanceObserver.disconnect(); } catch (e) {} }
            if (_intersectionObserver) { try { _intersectionObserver.disconnect(); } catch (e) {} }
            _backgroundRefreshTimers.forEach(t => clearTimeout(t));
            _abortMap.forEach(ctrl => { try { ctrl.abort(); } catch (e) {} });
        }
    };

    return module;
})();
