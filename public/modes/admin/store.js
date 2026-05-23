// ==========================================
// 🎯 [STATE] LRU-TTL STORE
// ==========================================
import { CONFIG } from './config.js';

export const State = (() => {
    let _currentGradeData = null;
    let _pendingRequests  = [];
    const _studentsCache  = new Map();
    const _loadingKeys    = new Set();
    const _abortMap       = new Map();
    const _reqIds         = new Map();

    return {
        get currentGradeData()  { return _currentGradeData; },
        set currentGradeData(v) { _currentGradeData = v; },
        get pendingRequests()   { return _pendingRequests; },
        set pendingRequests(v)  { _pendingRequests = v; },

        getCachedStudents: (grade) => {
            const entry = _studentsCache.get(grade);
            if (!entry) return null;
            if (Date.now() > entry.expiry) { _studentsCache.delete(grade); return null; }
            return entry.data;
        },
        setCachedStudents: (grade, data) => _studentsCache.set(grade, { data, expiry: Date.now() + CONFIG.CACHE_TTL_MS }),
        invalidateStudents: (grade)      => grade ? _studentsCache.delete(grade) : _studentsCache.clear(),

        isLoading: (key)   => _loadingKeys.has(key),
        setLoading: (k, v) => v ? _loadingKeys.add(k) : _loadingKeys.delete(k),

        generateReqId(key) { const id = Date.now() + Math.random(); _reqIds.set(key, id); return id; },
        isReqValid: (key, id) => _reqIds.get(key) === id,

        abort(key) {
            _abortMap.get(key)?.abort(); 
            const ctrl = new AbortController();
            _abortMap.set(key, ctrl);
            return ctrl;
        },
    };
})();

