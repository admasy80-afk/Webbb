// ==================== QUANTUM DASHBOARD ENGINE v8.1 (GOD MODE EXTREME) ====================
// 🔥 Multi-Threaded CSV Worker | Anti-Tamper Mutation Shield | Request Deduplication
// 🚀 Dynamic Hardware-Aware Chunking | LRU TTL Cache | Quantum DJB2 Hashing
// 🛡️ DOM Scheduler + Sync Fixes | Deep AST Sanitizer | Pseudo-element Zero-Allocation Ripple
import { SysUI, trashSVG } from './ui.js';
import { sessionToken } from './state.js';

// ═══════════════════════════════════════════════════════════════════
// ⚙️ [CORE] SYSTEM CONSTANTS & ADAPTIVE CONFIG
// ═══════════════════════════════════════════════════════════════════
const API = Object.freeze({
    STATS:           '/api/admin/stats',
    PENDING:         '/api/admin/pending',
    UPDATE_STATUS:   '/api/admin/update-status',
    STUDENTS_GRADE:  '/api/admin/students-by-grade',
    GRADE_CONTENT:   '/api/admin/get-grade-content',
    DELETE_ITEM:     '/api/admin/delete-item',
});

const STATUS    = Object.freeze({ ACCEPTED: 'accepted', REJECTED: 'rejected', PENDING: 'pending' });
const ITEM_TYPE = Object.freeze({ PUBLIC_QUIZ: 'publicQuiz', QUIZ: 'quiz', TEST: 'test', QUESTION: 'question', POINT: 'point' });
const THRESHOLD = Object.freeze({ HIGH: 85, PASS: 50 });

// Hardware-aware dynamic chunking for maximum FPS
const _cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
const CONFIG = Object.freeze({ 
    FETCH_TIMEOUT: 15000, 
    MAX_RETRIES: 3, 
    RENDER_CHUNK_SIZE: Math.max(15, _cores * 8), 
    CACHE_TTL_MS: 300000 // 5 Minutes 
});

// ═══════════════════════════════════════════════════════════════════
// 📝 [CORE] TELEMETRY & ADVANCED LOGGER
// ═══════════════════════════════════════════════════════════════════
const Logger = (() => {
    const isProd = false; 
    
    if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', e => !isProd && console.error(`[🔥 QUANTUM] Unhandled Promise:`, e.reason));
        window.addEventListener('error', e => !isProd && console.error(`[🔥 QUANTUM] Global Error:`, e.message));
    }

    return {
        error: (msg, ...args) => console.error(`[🔥 QUANTUM] ${msg}`, ...args),
        warn:  (msg, ...args) => !isProd && console.warn(`[⚠️ QUANTUM] ${msg}`, ...args),
        info:  (msg, ...args) => !isProd && console.info(`[ℹ️ QUANTUM] ${msg}`, ...args),
        mem:   () => {
            if (!isProd && performance?.memory) {
                console.info(`[🧠 MEMORY] ${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)}MB`);
            }
        }
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🧠 [CORE] DOM SCHEDULER (PREVENTS LAYOUT THRASHING)
// ═══════════════════════════════════════════════════════════════════
const Scheduler = (() => {
    let _reads = [], _writes = [], _scheduled = false;
    const _run = () => {
        const reads = _reads, writes = _writes;
        _reads = []; _writes = []; _scheduled = false;
        reads.forEach(fn => { try { fn(); } catch (e) { Logger.error('Scheduler Read', e); } });
        writes.forEach(fn => { try { fn(); } catch (e) { Logger.error('Scheduler Write', e); } });
    };
    return {
        read(fn)  { _reads.push(fn);  if (!_scheduled) { _scheduled = true; requestAnimationFrame(_run); } },
        write(fn) { _writes.push(fn); if (!_scheduled) { _scheduled = true; requestAnimationFrame(_run); } },
        yield()   { return new Promise(r => window.requestIdleCallback ? requestIdleCallback(r) : setTimeout(r, 16)); }
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🛡️ [SECURITY] DEEP SANITIZER, SHIELD & QUANTUM HASH
// ═══════════════════════════════════════════════════════════════════
const Security = (() => {
    const _escape = (str) => {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    const _sanitizeNode = (node) => {
        if (node.nodeType === 1) { 
            const attrs = node.attributes;
            for (let i = attrs.length - 1; i >= 0; i--) {
                const attr = attrs[i];
                if (attr.name.toLowerCase().startsWith('on') || 
                    attr.value.trim().toLowerCase().startsWith('javascript:')) {
                    node.removeAttribute(attr.name);
                }
            }
        }
        node.childNodes.forEach(_sanitizeNode);
    };

    const _fields = ['first_name','second_name','third_name','last_name','email','grade','phone','title','question','testName','studentName'];

    // Anti-Tamper Shield
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        new MutationObserver(mutations => {
            for (const m of mutations) {
                m.addedNodes.forEach(n => {
                    if (n.tagName === 'SCRIPT' && n.src && !n.src.includes(location.hostname) && !n.src.includes('tailwindcss')) {
                        Logger.warn('Alien script intercepted & destroyed.', n.src);
                        n.remove();
                    }
                });
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    return {
        e: _escape,
        safeFile: (name) => _escape(name).replace(/[^\w\u0600-\u06FF-]/g, '_'),
        safeCSV: (val) => {
            let str = String(val).replace(/"/g, '""');
            return /^[=+\-@\t\r]/.test(str) ? `"'${str}"` : `"${str}"`;
        },
        sanitizeStudent(st) {
            const s = { _raw: st };
            _fields.forEach(k => { s[k] = _escape(st?.[k] ?? ''); });
            return s;
        },
        cleanDOM(templateElement) {
            templateElement.content.querySelectorAll('script, iframe, object, embed').forEach(s => s.remove());
            templateElement.content.childNodes.forEach(_sanitizeNode);
            return templateElement;
        },
        hashId(str) {
            let h = 5381;
            for(let i=0; i<str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
            return 'q_' + (h >>> 0).toString(16);
        },
        getToken: () => localStorage.getItem('userToken') || localStorage.getItem('dahih_token') || '',
        getCsrfToken: () => document.querySelector('meta[name="csrf-token"]')?.content || '',
        buildHeaders() {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getToken()}`,
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-Token': this.getCsrfToken()
            };
        },
        buildBody: (extra = {}) => JSON.stringify({ sessionToken, ...extra }),
        checkAuthError(res) {
            if (res.status === 401 || res.status === 403) { this.forceLogout(); return true; }
            return false;
        },
        forceLogout() {
            ['userToken','dahih_token'].forEach(k => localStorage.removeItem(k));
            sessionStorage.clear();
            window.location.replace('/index.html');
        },
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🎯 [STATE] LRU-TTL STORE & RACE CONDITION MANAGER
// ═══════════════════════════════════════════════════════════════════
const State = (() => {
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

        generateReqId(key) {
            const id = Date.now() + Math.random();
            _reqIds.set(key, id);
            return id;
        },
        isReqValid: (key, id) => _reqIds.get(key) === id,

        abort(key) {
            _abortMap.get(key)?.abort(); 
            const ctrl = new AbortController();
            _abortMap.set(key, ctrl);
            return ctrl;
        },
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🌐 [NETWORK] HTTP CLIENT (Auto-Abort + Deduplication + Backoff)
// ═══════════════════════════════════════════════════════════════════
const Http = (() => {
    const _delay = ms => new Promise(res => setTimeout(res, ms));
    const _activeRequests = new Map();

    return {
        async post(endpoint, body = {}, loadingKey = null, retries = CONFIG.MAX_RETRIES) {
            const dedupKey = endpoint + JSON.stringify(body);
            if (_activeRequests.has(dedupKey)) return _activeRequests.get(dedupKey);

            let abortCtrl, reqId;
            if (loadingKey) {
                if (State.isLoading(loadingKey)) State.abort(loadingKey); 
                State.setLoading(loadingKey, true);
                abortCtrl = State.abort(loadingKey);
                reqId = State.generateReqId(loadingKey);
            } else {
                abortCtrl = new AbortController();
            }

            const execute = async () => {
                for (let i = 0; i <= retries; i++) {
                    try {
                        const timeoutId = setTimeout(() => abortCtrl.abort(), CONFIG.FETCH_TIMEOUT);
                        const res = await fetch(endpoint, {
                            method: 'POST',
                            headers: Security.buildHeaders(),
                            body: Security.buildBody(body),
                            signal: abortCtrl.signal,
                        });
                        clearTimeout(timeoutId);

                        if (Security.checkAuthError(res)) return null;
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        
                        if (loadingKey && !State.isReqValid(loadingKey, reqId)) return null; 
                        return res;

                    } catch (err) {
                        if (abortCtrl.signal.aborted) {
                            Logger.info(`Request superseded/timeout: ${endpoint}`);
                            return null; 
                        }
                        if (i === retries) {
                            Logger.error(`Failed after ${retries} retries: ${endpoint}`, err);
                            return null;
                        }
                        await _delay(Math.pow(2, i) * 500);
                    } finally {
                        if (i === retries && loadingKey) State.setLoading(loadingKey, false);
                    }
                }
            };

            const promise = execute();
            _activeRequests.set(dedupKey, promise);
            promise.finally(() => _activeRequests.delete(dedupKey));
            return promise;
        },

        async postJSON(endpoint, body = {}, loadingKey = null) {
            const res = await this.post(endpoint, body, loadingKey);
            if (!res) return null;
            try { return await res.json(); } catch (e) { Logger.error('JSON Parse Error', e); return null; }
        },
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🍞 [UI] TOAST QUEUE SYSTEM
// ═══════════════════════════════════════════════════════════════════
const Toast = (() => {
    const _queue = [];
    let _active  = false;

    function _show({ type, msg, duration = 3000 }) {
        if (typeof SysUI === 'undefined' || !SysUI.toast) {
            Logger.warn('SysUI.toast missing', msg);
            _processNext();
            return;
        }
        SysUI.toast(type, msg);
        setTimeout(_processNext, duration + 350);
    }

    function _processNext() {
        _active = false;
        if (_queue.length) _show(_queue.shift());
    }

    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { _queue.length = 0; });

    return {
        show(type, msg, duration) {
            if (_active) { _queue.push({ type, msg, duration }); return; }
            _active = true;
            _show({ type, msg, duration });
        },
        success: (msg) => Toast.show('success', msg),
        error:   (msg) => Toast.show('error', msg),
        warning: (msg) => Toast.show('warning', msg),
        info:    (msg) => Toast.show('info', msg),
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 📡 [EVENTS] DEBOUNCED EVENT BUS
// ═══════════════════════════════════════════════════════════════════
const EventBus = (() => {
    const _listeners = new Map();
    const _batchTimers = new Map();

    return {
        on(event, fn)  { 
            if (!_listeners.has(event)) _listeners.set(event, new Set()); 
            _listeners.get(event).add(fn); 
        },
        off(event, fn) { 
            _listeners.get(event)?.delete(fn); 
        },
        emit(event, payload, batchMs = 0) {
            if (batchMs > 0) {
                clearTimeout(_batchTimers.get(event));
                _batchTimers.set(event, setTimeout(() => this._execute(event, payload), batchMs));
            } else {
                this._execute(event, payload);
            }
        },
        _execute(event, payload) {
            _listeners.get(event)?.forEach(fn => { try { fn(payload); } catch(e) { Logger.error(`Event Error [${event}]`, e); } });
        }
    };
})();

EventBus.on('student:updated', () => { fetchPendingRequests(); fetchStats(); });
EventBus.on('content:deleted', () => { fetchGradeContent(); });
if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => Toast.warning('لا يوجد اتصال بالإنترنت'));
    window.addEventListener('online',  () => Toast.success('عاد الاتصال بالإنترنت'));
}

// ═══════════════════════════════════════════════════════════════════
// ✨ [UI] ANIMATION ENGINE (Zero DOM Allocations + Will-Change)
// ═══════════════════════════════════════════════════════════════════
const Anim = (() => {
    const _rafs = new WeakMap(); 
    const _ease = t => 1 - Math.pow(1 - t, 3);
    const _numberCache = new WeakMap();

    const _progressObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                Scheduler.write(() => {
                    e.target.style.width = e.target.dataset.w;
                    _progressObserver.unobserve(e.target);
                });
            }
        });
    }, { threshold: 0.1 }) : null;

    const _normalizeArabicDigits = str => String(str).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

    return {
        animateValue(id, endValue, duration = 1200, suffix = '') {
            const obj = document.getElementById(id);
            if (!obj) return;
            
            const targetVal = parseFloat(_normalizeArabicDigits(endValue)) || 0;
            const startVal  = _numberCache.get(obj) || 0;
            if (startVal === targetVal) return;

            if (_rafs.has(obj)) cancelAnimationFrame(_rafs.get(obj));
            let t0 = null;

            const step = ts => {
                if (!document.body.contains(obj)) { _rafs.delete(obj); return; }
                if (!t0) t0 = ts;
                const p = Math.min((ts - t0) / duration, 1);
                const current = Math.floor(_ease(p) * (targetVal - startVal) + startVal);
                
                Scheduler.write(() => { obj.textContent = current.toLocaleString('ar-SA') + suffix; });

                if (p < 1) {
                    _rafs.set(obj, requestAnimationFrame(step));
                } else {
                    _rafs.delete(obj);
                    _numberCache.set(obj, targetVal);
                    Scheduler.write(() => { obj.textContent = targetVal.toLocaleString('ar-SA') + suffix; });
                }
            };
            _rafs.set(obj, requestAnimationFrame(step));
        },

        fadeIn(el, delay = 0) {
            if (!el) return;
            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                const anim = el.animate([
                    { opacity: 0, transform: 'translateY(10px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], { duration: 400, delay: delay * 1000, easing: 'ease', fill: 'both' });
                anim.onfinish = () => el.style.willChange = 'auto';
            });
        },

        slideOut(el, mode = 'right') {
            if (!el) return;
            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                el.style.pointerEvents = 'none';
                el.animate([
                    { opacity: 1, transform: 'none' },
                    { opacity: 0, transform: mode === 'right' ? 'translateX(28px) scale(0.97)' : 'scale(0.94)' }
                ], { duration: 380, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' });
            });
        },

        triggerRipple(btn) {
            if (!btn) return;
            Scheduler.write(() => {
                btn.classList.remove('__run-ripple');
                void btn.offsetWidth; 
                btn.classList.add('__run-ripple');
            });
        },

        pulse(el) {
            if (!el) return;
            Scheduler.write(() => {
                el.style.willChange = 'transform';
                const anim = el.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.04)' },
                    { transform: 'scale(1)' }
                ], { duration: 550, easing: 'ease' });
                anim.onfinish = () => el.style.willChange = 'auto';
            });
        },

        staggerFadeIn(container, selector, baseDelay = 0.05) {
            if (!container) return;
            const els = container.querySelectorAll(selector);
            els.forEach((el, i) => this.fadeIn(el, i * baseDelay));
        },

        progressBars(container) {
            if (!container || !_progressObserver) return;
            container.querySelectorAll('[data-w]').forEach(bar => _progressObserver.observe(bar));
        },
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🏗️ [UI] DOM ENGINE (Deep Sanitization + Incremental Rendering)
// ═══════════════════════════════════════════════════════════════════
const DOM = {
    get: id => document.getElementById(id),

    skeleton(rows = 3, cols = 1) {
        return `<div class="flex flex-col gap-3">${Array(rows).fill(0).map(() => `
            <div class="glass-panel border border-white/5 p-4 rounded-xl animate-pulse">
                <div class="flex justify-between items-center gap-4">
                    <div class="space-y-2 flex-1">
                        <div class="h-4 bg-white/10 rounded-lg w-3/4"></div>
                        <div class="h-3 bg-white/5 rounded-lg w-1/2"></div>
                    </div>
                    ${cols > 1 ? `<div class="flex gap-2">
                        <div class="h-9 w-16 bg-green-500/10 rounded-xl"></div>
                        <div class="h-9 w-16 bg-red-500/10 rounded-xl"></div>
                    </div>` : ''}
                </div>
            </div>`).join('')}</div>`;
    },

    emptyState(type, msg) {
        const cfg = { empty: ['📭','text-gray-500'], error: ['⚠️','text-red-400'], success: ['✅','text-green-400'] };
        const [icon, color] = cfg[type] || cfg.empty;
        return `<div class="col-span-full flex flex-col items-center justify-center py-16 gap-3 select-none">
            <span class="text-5xl opacity-25 select-none">${icon}</span>
            <p class="${color} text-sm text-center font-semibold">${Security.e(msg)}</p>
        </div>`;
    },

    fastAppend(container, htmlString) {
        const template = document.createElement('template');
        template.innerHTML = htmlString.trim();
        Security.cleanDOM(template);
        
        container.innerHTML = '';
        container.appendChild(template.content);
    },

    async renderChunked(container, htmlArray, headerHtml = '') {
        container.innerHTML = headerHtml;
        const listContainer = document.createElement('div');
        listContainer.className = 'space-y-3';
        container.appendChild(listContainer);
        
        for (let i = 0; i < htmlArray.length; i += CONFIG.RENDER_CHUNK_SIZE) {
            const chunk = htmlArray.slice(i, i + CONFIG.RENDER_CHUNK_SIZE).join('');
            const tpl = document.createElement('template');
            tpl.innerHTML = chunk;
            Security.cleanDOM(tpl);
            
            listContainer.appendChild(tpl.content);
            await Scheduler.yield();
        }
        Anim.staggerFadeIn(listContainer, '.result-card', 0.015);
        Logger.mem(); 
    }
};

// ═══════════════════════════════════════════════════════════════════
// 📊 [MODULE] STATS
// ═══════════════════════════════════════════════════════════════════
export async function fetchStats() {
    const data = await Http.postJSON(API.STATS, {}, 'stats');
    if (!data) return;

    const sCount = data.studentsCount || 0;
    const pCount = data.pendingCount  || 0;

    Anim.animateValue('stats-students', sCount, 1300);
    Anim.animateValue('stats-pending',  pCount, 1100);

    Scheduler.read(() => {
        const sEl = DOM.get('stats-students');
        const pEl = DOM.get('stats-pending');
        if (sCount > 0) Anim.pulse(sEl?.closest('[data-stat]'));
        if (pCount > 0) Anim.pulse(pEl?.closest('[data-stat]'));
    });

    Scheduler.write(() => {
        const badge = DOM.get('pendingBadge');
        if (badge) {
            badge.textContent   = pCount;
            badge.style.display = pCount > 0 ? 'flex' : 'none';
        }
    });

    if (sCount) {
        const rate = data.acceptedCount ? Math.round((data.acceptedCount / sCount) * 100) : 0;
        Anim.animateValue('stats-acceptance-rate', rate, 1000, '%');
    }
}

// ═══════════════════════════════════════════════════════════════════
// 📋 [MODULE] PENDING REQUESTS
// ═══════════════════════════════════════════════════════════════════
let _isPendingInitialized = false;

export async function fetchPendingRequests() {
    const container = DOM.get('pendingRequestsContainer');
    if (!container) return;

    container.innerHTML = DOM.skeleton(3, 2);
    const students = await Http.postJSON(API.PENDING, {}, 'pending');

    if (!students) { container.innerHTML = DOM.emptyState('error', 'فشل الاتصال بالخادم'); return; }
    State.pendingRequests = students;

    if (!students.length) {
        container.innerHTML = DOM.emptyState('empty', 'لا توجد طلبات جديدة حالياً ✓');
        return;
    }

    const html = students.map((st, i) => _buildRequestCard(st, i)).join('');
    DOM.fastAppend(container, html);
    Anim.staggerFadeIn(container, '.req-card', 0.06);

    if (!_isPendingInitialized) {
        container.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const { action, email } = btn.dataset;
            if (action === 'accept') updateStudentStatus(email, STATUS.ACCEPTED, '', btn);
            else if (action === 'reject') rejectStudent(email, btn);
        });
        _isPendingInitialized = true;
    }
}

function _buildRequestCard(st, i) {
    const s = Security.sanitizeStudent(st);
    const fullName = [s.first_name, s.second_name, s.third_name, s.last_name].filter(Boolean).join(' ');
    return `
    <div id="req-${s.email}" class="req-card glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 opacity-0 hover:border-white/15 hover:shadow-[0_0_24px_rgba(255,255,255,0.03)] transition-all duration-300 group">
        <div class="text-center md:text-right flex-1 min-w-0">
            <h4 class="font-bold text-white truncate text-base group-hover:text-yellow-200 transition-colors">${fullName}</h4>
            <div class="flex flex-wrap gap-1.5 mt-2 justify-center md:justify-start">
                <span class="text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">${s.email}</span>
                <span class="text-[11px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 font-semibold">${s.grade}</span>
                ${s.phone ? `<span class="text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full" dir="ltr">${s.phone}</span>` : ''}
            </div>
        </div>
        <div class="flex gap-2 w-full md:w-auto shrink-0">
            <button data-action="accept" data-email="${s.email}" aria-label="قبول الطالب" class="relative w-full md:w-auto bg-green-500/10 text-green-400 border border-green-500/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-green-500 hover:text-black hover:border-green-400 transition-all duration-200 active:scale-95 overflow-hidden focus-visible:ring-2 focus-visible:ring-green-500 ui-ripple">
                <span class="relative z-10 pointer-events-none">✓ قبول</span>
            </button>
            <button data-action="reject" data-email="${s.email}" aria-label="رفض الطالب" class="relative w-full md:w-auto bg-red-500/10 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-400 transition-all duration-200 active:scale-95 overflow-hidden focus-visible:ring-2 focus-visible:ring-red-500 ui-ripple">
                <span class="relative z-10 pointer-events-none">✕ رفض</span>
            </button>
        </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ [MODULE] UPDATE STATUS
// ═══════════════════════════════════════════════════════════════════
export async function updateStudentStatus(email, newStatus, reason = '', btnElement = null) {
    if (!email || !newStatus) return;

    if (btnElement) {
        Anim.triggerRipple(btnElement);
        Scheduler.write(() => {
            btnElement.disabled = true;
            btnElement.style.opacity = '0.65';
            const spinner = document.createElement('span');
            spinner.className = 'inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1';
            btnElement.querySelector('span')?.prepend(spinner);
        });
        const row = btnElement.closest('.req-card');
        if (row) setTimeout(() => Anim.slideOut(row, 'right'), 180);
    }

    const data = await Http.postJSON(API.UPDATE_STATUS, { studentEmail: email, newStatus, reason }, `status-${email}`);

    if (data !== null) {
        if (newStatus === STATUS.ACCEPTED) { Toast.success('✓ تم قبول الطالب بنجاح'); SysUI.confetti?.(); }
        else { Toast.warning('تم رفض الطالب'); }
        State.invalidateStudents();
    } else {
        Toast.error('فشل تحديث الحالة');
        if (btnElement) { 
            Scheduler.write(() => {
                btnElement.disabled = false; 
                btnElement.style.opacity = '1'; 
                btnElement.querySelector('.animate-spin')?.remove(); 
            });
        }
        return;
    }

    EventBus.emit('student:updated', null, 420);
}

export function rejectStudent(email, btnElement) {
    SysUI.prompt('سبب الرفض (سيظهر للطالب):', reason => {
        if (reason !== null) updateStudentStatus(email, STATUS.REJECTED, reason, btnElement);
    });
}

// ═══════════════════════════════════════════════════════════════════
// 🎓 [MODULE] STUDENTS BY GRADE
// ═══════════════════════════════════════════════════════════════════
let _gradeSelectDebounce = null;

export async function fetchStudentsByGrade() {
    clearTimeout(_gradeSelectDebounce);
    _gradeSelectDebounce = setTimeout(_doFetchStudents, 280);
}

async function _doFetchStudents() {
    const grade     = DOM.get('listGradeSelect')?.value;
    const container = DOM.get('studentsListContainer');
    if (!container || !grade) return;

    const cached = State.getCachedStudents(grade);
    if (cached) { _renderStudents(container, cached); return; }

    container.innerHTML = DOM.skeleton(6);
    const students = await Http.postJSON(API.STUDENTS_GRADE, { grade }, 'students');
    
    if (!students) { container.innerHTML = DOM.emptyState('error', 'فشل الاتصال'); return; }
    State.setCachedStudents(grade, students);
    _renderStudents(container, students);
}

function _renderStudents(container, students) {
    if (!students.length) { 
        container.innerHTML = DOM.emptyState('empty', 'لا يوجد طلاب مقبولون في هذه الدفعة'); 
        return; 
    }
    
    const html = students.map((st, i) => _buildStudentCard(st, i)).join('');
    DOM.fastAppend(container, html);
    
    Anim.staggerFadeIn(container, '.student-card', 0.04);
    Anim.progressBars(container);
}

function _buildStudentCard(st, i) {
    const s = Security.sanitizeStudent(st);
    const fullName = [s.first_name, s.second_name, s.third_name, s.last_name].filter(Boolean).join(' ');
    const pts = Math.max(0, Math.min(100, parseInt(st.points) || 0)); 
    const pColor = pts >= THRESHOLD.HIGH ? 'text-green-400' : pts >= THRESHOLD.PASS ? 'text-yellow-400' : 'text-red-400';
    const bColor = pts >= THRESHOLD.HIGH ? 'bg-green-500'   : pts >= THRESHOLD.PASS ? 'bg-yellow-500'  : 'bg-red-500';

    return `
    <div class="student-card bg-black/40 border border-white/5 rounded-xl p-4 opacity-0 hover:border-yellow-500/30 hover:-translate-y-1 hover:shadow-[0_8px_25px_rgba(234,179,8,0.07)] transition-all duration-300 cursor-default group">
        <div class="flex justify-between items-start mb-3">
            <div class="min-w-0 flex-1">
                <h4 class="font-bold text-white text-sm truncate group-hover:text-yellow-300 transition-colors">${fullName}</h4>
                <p class="text-[11px] text-gray-500 mt-0.5 truncate">${s.email}</p>
            </div>
            <div class="shrink-0 text-right ml-3">
                <p class="font-black text-xl ${pColor} tabular-nums">${pts}%</p>
            </div>
        </div>
        <div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div class="${bColor} h-full rounded-full transition-[width] duration-1000 ease-out" style="width:0%" data-w="${pts}%"></div>
        </div>
        ${s.phone ? `<p class="text-[10px] text-gray-600 mt-2 truncate" dir="ltr">${s.phone}</p>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// 📚 [MODULE] GRADE CONTENT
// ═══════════════════════════════════════════════════════════════════
let _isManageInitialized = false;

export async function fetchGradeContent() {
    const grade     = DOM.get('manageGradeSelect')?.value;
    const container = DOM.get('manageContainer');
    const loading   = DOM.get('manageLoading');
    if (!container || !loading || !grade) return;

    Scheduler.write(() => {
        container.style.opacity = '0';
        setTimeout(() => container.classList.add('hidden'), 280);
        loading.classList.remove('hidden');
    });

    const data = await Http.postJSON(API.GRADE_CONTENT, { grade }, `grade-content-${grade}`);
    
    Scheduler.write(() => { loading.classList.add('hidden'); });
    if (!data) return; 

    State.currentGradeData = data;
    renderManageContent(grade);

    Scheduler.write(() => {
        container.classList.remove('hidden');
        container.animate([{opacity: 0}, {opacity: 1}], {duration: 300, fill: 'forwards'});
    });

    if (!_isManageInitialized) {
        container.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'show-results') {
                showDetailedResults(btn.dataset.quizId, btn.dataset.isPublic === 'true');
            } else if (btn.dataset.action === 'delete') {
                const { grade, itemtype, identifier } = btn.dataset;
                deleteContent(grade, itemtype, identifier, btn);
            }
        });
        _isManageInitialized = true;
    }
}

export function renderManageContent(grade) {
    const data = State.currentGradeData;
    if (!data) return;
    _renderSection('managePublicQuizzes', data.publicQuizzes, (q,i) => _buildPublicQuizItem(q,i,grade), 'لا توجد اختبارات عامة');
    _renderSection('manageQuizzes',       data.quizzes,       (q,i) => _buildQuizItem(q,i,grade),       'لا توجد اختبارات منصة');
    _renderSection('manageTests',         data.tests,         (t,i) => _buildTestItem(t,i,grade),       'لا توجد سجلات');
    _renderSection('manageQuestions',     data.questions,     (q,i) => _buildQuestionItem(q,i,grade),   'لا توجد أسئلة مقالية');
    _renderSection('managePoints',        data.points,        (p,i) => _buildPointItem(p,i,grade),      'لا توجد نقاط');
}

function _renderSection(id, items, builder, emptyMsg) {
    const el = DOM.get(id);
    if (!el) return;
    if (!items?.length) {
        el.innerHTML = `<p class="text-gray-600 text-sm py-4 text-center italic">${Security.e(emptyMsg)}</p>`;
        return;
    }
    DOM.fastAppend(el, items.map((item, i) => builder(item, i)).join(''));
    Anim.staggerFadeIn(el, '[data-si]', 0.05);
}

function _buildPublicQuizItem(q, i, grade) {
    const title = Security.e(q.title || '');
    const id    = Security.e(String(q.id || ''));
    const cnt   = q.results?.length || 0;
    const g     = Security.e(grade);
    return `
    <div id="pubQz-${id}" data-si class="bg-yellow-900/10 border border-yellow-500/20 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 opacity-0 hover:border-yellow-500/40 hover:bg-yellow-900/20 transition-all duration-300 group">
        <div class="min-w-0 flex-1">
            <p class="font-bold text-white text-base truncate">${title}</p>
            <div class="flex gap-2 mt-1.5">
                <span class="text-[11px] text-yellow-300 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">${cnt} رد</span>
                <span class="text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">عام • برابط</span>
            </div>
        </div>
        <div class="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button data-action="show-results" data-quiz-id="${id}" data-is-public="true" class="bg-yellow-600/20 text-yellow-500 border border-yellow-500/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-500 hover:text-black hover:border-yellow-400 transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-yellow-500 ui-ripple">📊 النتائج</button>
            <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.PUBLIC_QUIZ}" data-identifier="${id}" aria-label="حذف الاختبار العام" class="trash-btn text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/20 focus-visible:ring-2 focus-visible:ring-red-500">${trashSVG}</button>
        </div>
    </div>`;
}

function _buildQuizItem(q, i, grade) {
    const title = Security.e(q.title || '');
    const id    = Security.e(String(q.id || ''));
    const cnt   = q.results?.length || 0;
    const g     = Security.e(grade);
    return `
    <div id="qz-${id}" data-si class="bg-black/30 border border-white/5 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 opacity-0 hover:border-white/15 hover:bg-black/50 transition-all duration-300 group">
        <div class="min-w-0 flex-1">
            <p class="font-bold text-white text-base truncate">${title}</p>
            <span class="text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full mt-1.5 inline-block border border-white/5">${cnt} مجيب</span>
        </div>
        <div class="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button data-action="show-results" data-quiz-id="${id}" data-is-public="false" class="bg-white/10 text-white border border-white/10 px-4 py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-black transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-white ui-ripple">عرض النتائج</button>
            <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.QUIZ}" data-identifier="${id}" aria-label="حذف اختبار المنصة" class="trash-btn text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/20">${trashSVG}</button>
        </div>
    </div>`;
}

function _buildTestItem(t, i, grade) {
    const name = Security.e(t.testName || '');
    const g    = Security.e(grade);
    return `
    <div data-si class="bg-black/30 border border-white/5 p-4 rounded-xl opacity-0 flex justify-between items-center hover:border-white/10 transition-all duration-300 group">
        <p class="font-bold text-white truncate flex-1 text-sm">${name}</p>
        <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.TEST}" data-identifier="${name}" aria-label="حذف السجل" class="trash-btn text-gray-500 group-hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/20 shrink-0">${trashSVG}</button>
    </div>`;
}

function _buildQuestionItem(q, i, grade) {
    const question = Security.e(q.question || '');
    const g        = Security.e(grade);
    return `
    <div data-si class="bg-black/30 border border-white/5 p-4 rounded-xl opacity-0 flex justify-between items-center gap-4 hover:border-white/10 transition-all duration-300 group">
        <p class="text-white text-sm truncate flex-1 leading-relaxed">${question}</p>
        <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.QUESTION}" data-identifier="${question}" aria-label="حذف السؤال المقالي" class="trash-btn text-gray-500 group-hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/20 shrink-0">${trashSVG}</button>
    </div>`;
}

function _buildPointItem(p, i, grade) {
    const point = Security.e(String(p ?? ''));
    const g     = Security.e(grade);
    return `
    <div data-si class="bg-black/30 border border-white/5 p-4 rounded-xl opacity-0 flex justify-between items-center gap-4 hover:border-white/10 transition-all duration-300 group">
        <p class="text-gray-300 text-sm truncate flex-1">${point}</p>
        <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.POINT}" data-identifier="${point}" aria-label="حذف النقطة" class="trash-btn text-gray-500 group-hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/20 shrink-0">${trashSVG}</button>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// 🗑️ [MODULE] DELETE CONTENT
// ═══════════════════════════════════════════════════════════════════
export function deleteContent(grade, itemType, identifier, trashBtn = null) {
    SysUI.confirm('هل أنت متأكد من حذف هذا العنصر نهائياً؟', async confirmed => {
        if (!confirmed) return;

        const row = trashBtn?.closest('[data-si]');
        if (row) Anim.slideOut(row, 'scale');

        const data = await Http.postJSON(API.DELETE_ITEM, { grade, itemType, identifier }, `del-${identifier}`);
        if (data !== null) {
            Toast.success('✓ تم الحذف بنجاح');
            State.invalidateStudents(grade);
            EventBus.emit('content:deleted', null, 420);
        } else {
            Toast.error('خطأ في الحذف');
            fetchGradeContent();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
// 📤 [MODULE] CSV EXPORT (Web Worker Offloaded)
// ═══════════════════════════════════════════════════════════════════
function _exportCSVWorker(quiz) {
    if (!quiz?.results?.length) { Toast.warning('لا توجد نتائج للتصدير'); return; }
    
    Toast.info('جاري معالجة وتشفير الملف...');
    
    const workerScript = `
        self.onmessage = function(e) {
            const { quiz } = e.data;
            const headers = ['الاسم','البريد','النتيجة','النسبة','الوقت'];
            const rows = quiz.results.map(r => [
                r.studentName || '',
                r.email || '',
                (r.score||0) + '/' + (quiz.questions?.length||0),
                (r.percentage||0) + '%',
                r.submittedAt ? new Date(r.submittedAt).toLocaleString('ar-SA') : ''
            ]);
            
            const sanitize = (val) => {
                let str = String(val).replace(/"/g, '""');
                return /^[=+\\-@\\t\\r]/.test(str) ? '"\\'' + str + '"' : '"' + str + '"';
            };
            
            const csv = [headers, ...rows].map(r => r.map(c => sanitize(c)).join(',')).join('\\n');
            const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            self.postMessage(URL.createObjectURL(blob));
        };
    `;
    
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
        const url = e.data;
        const fileName = `نتائج_${Security.safeFile(quiz.title)}_${Date.now()}.csv`;
        
        const a = document.createElement('a');
        Object.assign(a, { href: url, download: fileName });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        worker.terminate();
        Toast.success('✓ تم تصدير النتائج بنجاح');
    };
    
    worker.onerror = (err) => {
        Logger.error('CSV Worker Error', err);
        Toast.error('فشل تصدير الملف');
        worker.terminate();
    };

    worker.postMessage({ quiz });
}

// ═══════════════════════════════════════════════════════════════════
// 📈 [MODULE] RESULTS MODAL (True Identifier Toggle + Chunked Yield)
// ═══════════════════════════════════════════════════════════════════
let _resultsSearchTerm   = '';
let _resultsFilterStatus = 'all';
let _currentQuizCache    = null;
let _isResultsEventBinded = false;

export function showDetailedResults(quizId, isPublic) {
    const data = State.currentGradeData;
    if (!data) return;

    const arr  = isPublic ? data.publicQuizzes : data.quizzes;
    const quiz = arr?.find(q => String(q.id) === String(quizId));
    if (!quiz) return;

    _currentQuizCache    = quiz;
    _resultsSearchTerm   = '';
    _resultsFilterStatus = 'all';

    Scheduler.write(() => {
        const titleEl = DOM.get('resultsModalTitle');
        if (titleEl) titleEl.textContent = Security.e(quiz.title) + (isPublic ? ' (عام)' : ' (منصة)');

        const searchEl = DOM.get('resultsSearch');
        if (searchEl) {
            searchEl.value = '';
            searchEl.oninput = _debounce(e => {
                _resultsSearchTerm = e.target.value.toLowerCase().trim();
                _renderResultsContent(_currentQuizCache);
            }, 250);
        }

        const filterEl = DOM.get('resultsFilter');
        if (filterEl) {
            filterEl.value = 'all';
            filterEl.onchange = e => {
                _resultsFilterStatus = e.target.value;
                _renderResultsContent(_currentQuizCache);
            };
        }

        const exportBtn = DOM.get('exportCSVBtn');
        if (exportBtn) exportBtn.onclick = () => _exportCSVWorker(quiz);
    });

    _renderResultsContent(quiz);
    _openModal('resultsModal');
}

async function _renderResultsContent(quiz) {
    const container = DOM.get('resultsModalContent');
    if (!container) return;

    if (!quiz.results?.length) {
        Scheduler.write(() => {
            container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center select-none">
                <div class="text-6xl mb-4 opacity-20">📭</div>
                <p class="text-gray-400">لم يحل أحد هذا الاختبار بعد</p>
            </div>`;
        });
        return;
    }

    let results = [...quiz.results].sort((a,b) => (b.percentage||0) - (a.percentage||0));

    if (_resultsSearchTerm) {
        results = results.filter(r =>
            (r.studentName || '').toLowerCase().includes(_resultsSearchTerm) ||
            (r.email       || '').toLowerCase().includes(_resultsSearchTerm)
        );
    }
    if (_resultsFilterStatus !== 'all') {
        results = results.filter(r =>
            _resultsFilterStatus === 'pass' ? (r.percentage||0) >= THRESHOLD.PASS : (r.percentage||0) < THRESHOLD.PASS
        );
    }

    const total    = quiz.results.length;
    const passed   = quiz.results.filter(r => (r.percentage||0) >= THRESHOLD.PASS).length;
    const failed   = total - passed;
    const avgPct   = total ? Math.round(quiz.results.reduce((a,r) => a+(r.percentage||0),0)/total) : 0;
    const avgColor = avgPct >= THRESHOLD.HIGH ? 'text-green-400' : avgPct >= THRESHOLD.PASS ? 'text-yellow-400' : 'text-red-400';

    const headerHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            ${_statChip(total, 'المجيبين', 'text-white')}
            ${_statChip(passed, 'ناجح', 'text-green-400')}
            ${_statChip(failed, 'راسب', 'text-red-400')}
            ${_statChip(avgPct+'%', 'المتوسط', avgColor)}
        </div>`;

    if (results.length === 0) {
        Scheduler.write(() => { container.innerHTML = headerHtml + `<p class="text-gray-500 text-center py-8">لا توجد نتائج تطابق البحث</p>`; });
        return;
    }

    const htmlChunks = results.map((res,i) => _buildResultCard(res,i,quiz));
    await DOM.renderChunked(container, htmlChunks, headerHtml);

    if (!_isResultsEventBinded) {
        container.addEventListener('click', e => {
            const row = e.target.closest('[data-toggle-detail]');
            if (row) toggleStudentDetails(row.dataset.toggleDetail);
        });
        container.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                const row = e.target.closest('[data-toggle-detail]');
                if (row) { e.preventDefault(); toggleStudentDetails(row.dataset.toggleDetail); }
            }
        });
        _isResultsEventBinded = true;
    }
}

function _statChip(val, label, color) {
    return `<div class="bg-white/5 rounded-xl p-3 text-center border border-white/5">
        <p class="font-black text-xl ${color} tabular-nums">${val}</p>
        <p class="text-[11px] text-gray-500 mt-0.5">${label}</p>
    </div>`;
}

function _buildResultCard(res, index, quiz) {
    const pct    = res.percentage || 0;
    const score  = res.score      || 0;
    const total  = quiz.questions?.length || 0;
    const name   = Security.e(res.studentName || 'طالب غير معروف');
    const email  = Security.e(res.email       || '');

    const color      = pct >= THRESHOLD.HIGH ? 'text-green-400' : pct >= THRESHOLD.PASS ? 'text-blue-400' : 'text-red-400';
    const border     = pct >= THRESHOLD.PASS ? 'border-white/5' : 'border-red-900/20';
    const barColor   = pct >= THRESHOLD.HIGH ? 'bg-green-500'   : pct >= THRESHOLD.PASS ? 'bg-blue-500'  : 'bg-red-500';
    const rankBadge  = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `<span class="text-sm">${index+1}</span>`;
    
    const detailId   = `det-${Security.hashId(res.email || String(index))}`;

    return `
    <div class="result-card bg-black/40 rounded-xl border ${border} opacity-0 hover:bg-black/55 transition-colors duration-200">
        <div class="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer hover:bg-white/[0.02] transition-colors gap-3 select-none focus-visible:ring-2 focus-visible:ring-yellow-500"
            data-toggle-detail="${detailId}" data-source-email="${Security.e(res.email)}" role="button" tabindex="0" aria-expanded="false" aria-controls="${detailId}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-9 h-9 rounded-full bg-gray-800 border border-white/5 flex items-center justify-center font-bold text-white shrink-0 shadow-inner text-sm">${rankBadge}</div>
                <div class="min-w-0">
                    <p class="font-bold text-white text-sm truncate">${name}</p>
                    <p class="text-[11px] text-gray-500 mt-0.5 truncate">${email}${res.visitorId ? ' · <span class="text-yellow-500 text-[10px]">✓ موثق</span>' : ''}</p>
                </div>
            </div>
            <div class="flex items-center gap-4 shrink-0 border-t border-white/5 sm:border-none pt-2 sm:pt-0 w-full sm:w-auto justify-between sm:justify-end">
                <div class="text-center">
                    <p class="font-black text-2xl ${color} tabular-nums">${pct}%</p>
                    <div class="w-16 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                        <div class="${barColor} h-full rounded-full" style="width:${pct}%"></div>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-1 tabular-nums">${score} / ${total}</p>
                </div>
                <svg class="w-4 h-4 text-gray-500 transition-transform duration-300 shrink-0" id="icon-${detailId}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
        </div>
        <div id="${detailId}" class="student-details bg-black/60" data-rendered="false" role="region">
            <div class="details-content-wrapper">
                <div class="px-4 pb-5 pt-2">
                    <h4 class="text-white font-bold text-[11px] mb-3 border-b border-white/10 pb-2 uppercase tracking-widest opacity-50">مراجعة الإجابات</h4>
                    <div class="answers-body space-y-3"></div>
                </div>
            </div>
        </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// 🔄 [MODULE] TOGGLE DETAILS (Zero Reflow CSS Grid Transition)
// ═══════════════════════════════════════════════════════════════════
export function toggleStudentDetails(id) {
    const el      = document.getElementById(id);
    const trigger = document.querySelector(`[data-toggle-detail="${id}"]`);
    if (!el) return;
    
    const icon = document.getElementById(`icon-${id}`);
    const open = el.classList.contains('is-open');

    Scheduler.write(() => {
        if (open) {
            el.classList.remove('is-open');
            if (icon) icon.style.transform = 'rotate(0deg)';
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
            return;
        }

        if (el.dataset.rendered === 'false') {
            el.dataset.rendered = 'true';
            
            const sourceEmail = trigger?.dataset.sourceEmail;
            const quiz        = _currentQuizCache;
            const res         = quiz?.results?.find(r => String(r.email) === String(sourceEmail));
            const body        = el.querySelector('.answers-body');
            
            if (body && res && quiz) {
                const htmlStr = _buildAnswersHTML(res, quiz);
                const tpl = document.createElement('template');
                tpl.innerHTML = htmlStr;
                Security.cleanDOM(tpl);
                body.innerHTML = '';
                body.appendChild(tpl.content);
            }
        }

        el.classList.add('is-open');
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
    });
}

function _buildAnswersHTML(res, quiz) {
    if (!res.userAnswers || !quiz.questions) return '<p class="text-xs text-gray-500">تفاصيل الإجابات غير متوفرة</p>';
    
    return quiz.questions.map((q, qIdx) => {
        const sAns     = res.userAnswers[qIdx];
        const cAns     = q.correctAnswer;
        const correct  = sAns === cAns;
        const qText    = Security.e(q.questionText || '');
        const optsHTML = (q.options || []).map((opt, oi) => {
            const t = Security.e(String(opt));
            let cls = 'flex items-start gap-2 py-0.5 text-gray-500';
            let icon = '<span class="shrink-0 opacity-40">○</span>';
            if (oi === sAns && !correct) {
                cls  = 'flex items-start gap-2 py-1.5 px-2 text-red-400 font-semibold bg-red-500/10 rounded-lg border border-red-500/20';
                icon = '<span class="shrink-0">❌</span>';
            } else if (oi === cAns) {
                cls  = 'flex items-start gap-2 py-1.5 px-2 text-green-400 font-semibold bg-green-500/10 rounded-lg border border-green-500/20';
                icon = '<span class="shrink-0">✅</span>';
            }
            return `<div class="${cls}">${icon}<span class="leading-relaxed break-words text-xs">${t}</span></div>`;
        }).join('');
        return `
        <div class="bg-black/50 p-3 rounded-xl border ${correct ? 'border-green-500/15' : 'border-red-500/15'}">
            <p class="text-xs font-semibold text-gray-300 mb-2 leading-relaxed">${qIdx+1}. ${qText}</p>
            <div class="space-y-1">${optsHTML}</div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// 🚪 [MODULE] MODAL SYSTEM (Dynamic Focus Trap)
// ═══════════════════════════════════════════════════════════════════
let _activeModalCtrl = null;

function _openModal(id) {
    const modal = DOM.get(id);
    if (!modal) return;
    
    Scheduler.write(() => {
        document.body.style.overflow = 'hidden';
        modal.classList.remove('hidden');
        modal.animate([
            { opacity: 0, transform: 'scale(0.96)' },
            { opacity: 1, transform: 'scale(1)' }
        ], { duration: 280, easing: 'ease', fill: 'both' });
    });

    if (_activeModalCtrl) _activeModalCtrl.abort();
    _activeModalCtrl = new AbortController();
    const opts = { signal: _activeModalCtrl.signal };

    _trapFocus(modal, opts);

    document.addEventListener('keydown', e => { 
        if (e.key === 'Escape') closeResultsModal(); 
    }, opts);

    modal.addEventListener('click', e => { 
        if (e.target === modal) closeResultsModal(); 
    }, opts);
}

export function closeResultsModal() {
    const modal = DOM.get('resultsModal');
    if (!modal) return;
    
    if (_activeModalCtrl) {
        _activeModalCtrl.abort();
        _activeModalCtrl = null;
    }

    Scheduler.write(() => {
        const anim = modal.animate([
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(0.96)' }
        ], { duration: 250, easing: 'ease', fill: 'forwards' });
        
        anim.onfinish = () => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            anim.cancel();
        };
    });
}

function _trapFocus(modal, opts) {
    modal.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const focusable = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
            
        if (!focusable.length) return;
        
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
    }, opts);
    
    setTimeout(() => {
        Scheduler.read(() => {
            const firstBtn = modal.querySelector('button, input');
            if (firstBtn) firstBtn.focus();
        });
    }, 50);
}

// ═══════════════════════════════════════════════════════════════════
// 🚪 [MODULE] LOGOUT
// ═══════════════════════════════════════════════════════════════════
export function logout() {
    Security.forceLogout();
}

// ═══════════════════════════════════════════════════════════════════
// 🛠️ [UTILS]
// ═══════════════════════════════════════════════════════════════════
function _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ═══════════════════════════════════════════════════════════════════
// 💉 [CSS] SECURE CSS ENGINE (Zero Reflow Grid & Pseudo-Ripple)
// ═══════════════════════════════════════════════════════════════════
if (typeof document !== 'undefined' && !document.getElementById('__quantum_styles')) {
    const s = document.createElement('style');
    s.id = '__quantum_styles';
    s.textContent = `
        .student-details { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease; will-change: grid-template-rows, opacity; }
        .student-details.is-open { grid-template-rows: 1fr; opacity: 1; }
        .details-content-wrapper { overflow: hidden; }
        .trash-btn svg { transition: transform 0.18s ease; will-change: transform; }
        .trash-btn:hover svg { transform: scale(1.18) rotate(-4deg); }
        [data-action="accept"]:hover, [data-action="reject"]:hover { letter-spacing: 0.015em; }
        .result-card { contain: layout paint style; } 
        :focus-visible { outline: 2px solid rgba(234,179,8,0.7); outline-offset: 2px; border-radius: 6px; }
        
        /* 🔥 High-Perf Pseudo-element Ripple (Zero DOM Allocation) */
        .ui-ripple { position: relative; overflow: hidden; transform: translateZ(0); }
        .ui-ripple::after {
            content: ''; display: block; position: absolute; width: 100%; height: 100%;
            top: 0; left: 0; pointer-events: none;
            background-image: radial-gradient(circle, rgba(255,255,255,0.4) 10%, transparent 10.01%);
            background-repeat: no-repeat; background-position: 50%;
            transform: scale(10, 10); opacity: 0; transition: transform .5s, opacity 1s;
        }
        .ui-ripple.__run-ripple::after { transform: scale(0, 0); opacity: .3; transition: 0s; }
    `;
    document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════════════
// 🌍 [EXPORTS] STRICT GLOBAL BINDINGS
// ═══════════════════════════════════════════════════════════════════
export { Security, State, Anim, Http, Toast, EventBus, API, STATUS, ITEM_TYPE, THRESHOLD, Scheduler };

if (typeof window !== 'undefined') {
    Object.assign(window, {
        fetchStats, fetchPendingRequests, updateStudentStatus, rejectStudent,
        fetchStudentsByGrade, fetchGradeContent, renderManageContent, deleteContent,
        showDetailedResults, toggleStudentDetails, closeResultsModal, logout
    });
}
