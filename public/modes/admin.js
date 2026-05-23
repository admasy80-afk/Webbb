// تحديث مهم رقم ٢٣
import { SysUI, trashSVG } from './ui.js';
import { sessionToken } from './state.js';

// ═══════════════════════════════════════════════════════════════════
// ⚙️ [CORE] SYSTEM CONSTANTS & ADAPTIVE CONFIG
// ═══════════════════════════════════════════════════════════════════
export const API = Object.freeze({
    STATS:           '/api/admin/stats',
    PENDING:         '/api/admin/pending',
    STUDENTS_GRADE:  '/api/admin/students-by-grade',
    GRADE_CONTENT:   '/api/admin/get-grade-content',
    UPDATE_STATUS:   '/api/admin/update-status',
    DELETE_ITEM:     '/api/admin/delete-item',
    UPDATE_POINTS:   '/api/admin/update-points',
    SAVE_TEST:       '/api/admin/save-test',
    SAVE_CONTENT:    '/api/admin/save-content',
    SAVE_QUIZ:       '/api/admin/save-quiz',
    SAVE_PUB_QUIZ:   '/api/admin/save-public-quiz',
    EXPORT_DATA:     '/api/admin/export-data'
});

export const STATUS    = Object.freeze({ ACCEPTED: 'accepted', REJECTED: 'rejected', PENDING: 'pending' });
export const ITEM_TYPE = Object.freeze({ PUBLIC_QUIZ: 'publicQuiz', QUIZ: 'quiz', TEST: 'test', QUESTION: 'question', POINT: 'point' });
export const THRESHOLD = Object.freeze({ HIGH: 85, PASS: 50 });

const _cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 8 : 8;
const CONFIG = Object.freeze({ 
    FETCH_TIMEOUT: 20000, 
    MAX_RETRIES: 4, 
    RENDER_CHUNK_SIZE: Math.max(25, _cores * 12), 
    CACHE_TTL_MS: 300000,
    BATCH_DELAY: 50 
});

// ═══════════════════════════════════════════════════════════════════
// 📝 [CORE] TELEMETRY & ADVANCED LOGGER
// ═══════════════════════════════════════════════════════════════════
export const Logger = (() => {
    const isProd = false; 
    
    if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', e => !isProd && console.error(`[🔥 OMNI-CORE] Unhandled Promise:`, e.reason));
        window.addEventListener('error', e => !isProd && console.error(`[🔥 OMNI-CORE] Global Error:`, e.message));
    }

    return {
        error: (msg, ...args) => console.error(`[🔥 OMNI-CORE] ${msg}`, ...args),
        warn:  (msg, ...args) => !isProd && console.warn(`[⚠️ OMNI-CORE] ${msg}`, ...args),
        info:  (msg, ...args) => !isProd && console.info(`[ℹ️ OMNI-CORE] ${msg}`, ...args),
        mem:   () => {
            if (!isProd && performance?.memory) {
                console.info(`[🧠 MEMORY] ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)}MB / ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)}MB`);
            }
        },
        time: (label) => !isProd && console.time(`[⏱️ ${label}]`),
        timeEnd: (label) => !isProd && console.timeEnd(`[⏱️ ${label}]`)
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🧠 [CORE] DOM SCHEDULER (PREVENTS LAYOUT THRASHING)
// ═══════════════════════════════════════════════════════════════════
export const Scheduler = (() => {
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
        yield()   { return new Promise(r => window.requestIdleCallback ? requestIdleCallback(r) : setTimeout(r, 16)); },
        defer(fn) { return new Promise(r => setTimeout(() => { try { fn(); r(); } catch(e) { Logger.error('Defer', e); r(); } }, 0)); }
    };
})();

// ═══════════════════════════════════════════════════════════════════
// 🛡️ [SECURITY] DEEP SANITIZER, SHIELD & QUANTUM HASH
// ═══════════════════════════════════════════════════════════════════
export const Security = (() => {
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
                if (attr.name.toLowerCase().startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
                    node.removeAttribute(attr.name);
                }
            }
        }
        node.childNodes.forEach(_sanitizeNode);
    };

    const _fields = ['first_name','second_name','third_name','last_name','email','grade','phone','title','question','testName','studentName'];

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
// 🌐 [NETWORK] OMNI HTTP CLIENT
// ═══════════════════════════════════════════════════════════════════
export const Http = (() => {
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
export const Toast = (() => {
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
export const EventBus = (() => {
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
export const Anim = (() => {
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
                    { opacity: 0, transform: 'translateY(15px) scale(0.98)' },
                    { opacity: 1, transform: 'translateY(0) scale(1)' }
                ], { duration: 450, delay: delay * 1000, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' });
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
                    { opacity: 0, transform: mode === 'right' ? 'translateX(35px) scale(0.95)' : 'scale(0.92)' }
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
                    { transform: 'scale(1.05)' },
                    { transform: 'scale(1)' }
                ], { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
                anim.onfinish = () => el.style.willChange = 'auto';
            });
        },

        staggerFadeIn(container, selector, baseDelay = 0.04) {
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
export const DOM = {
    get: id => document.getElementById(id),

    skeleton(rows = 3, cols = 1) {
        return `<div class="flex flex-col gap-3 w-full">${Array(rows).fill(0).map((_, i) => `
            <div class="glass-panel border border-white/5 p-4 rounded-xl animate-pulse" style="animation-delay: ${i * 100}ms">
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
        const cfg = { empty: ['📭','text-gray-400'], error: ['⚠️','text-red-400'], success: ['✅','text-green-400'] };
        const [icon, color] = cfg[type] || cfg.empty;
        return `<div class="col-span-full flex flex-col items-center justify-center py-20 gap-4 select-none animate-fade-in-up">
            <div class="text-6xl opacity-30 select-none drop-shadow-2xl filter blur-[1px] hover:blur-none transition-all duration-500">${icon}</div>
            <p class="${color} text-sm text-center font-bold tracking-wide">${Security.e(msg)}</p>
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
        Anim.staggerFadeIn(listContainer, 'div > div', 0.015);
        Logger.mem(); 
    }
};

// ═══════════════════════════════════════════════════════════════════
// 🔥 [NEW] DYNAMIC QUIZ BUILDERS & FORM ENGINE
// ═══════════════════════════════════════════════════════════════════
export const QuizBuilder = {
    addBlock(containerId, isPublic = false) {
        const container = DOM.get(containerId);
        if(!container) return;
        const qCount = container.children.length + 1;
        const block = document.createElement('div');
        block.className = 'mcq-block bg-black/40 border border-white/10 p-5 rounded-2xl relative animate-fade-in-up hover:border-yellow-500/50 transition-colors duration-300 shadow-lg';
        block.innerHTML = `
            <button type="button" onclick="removeMCQBlock(this)" class="absolute top-4 left-4 text-gray-500 hover:text-red-400 bg-black/50 p-2 rounded-lg transition-colors z-10" title="حذف السؤال">${trashSVG}</button>
            <div class="mb-5 pr-3 border-r-4 border-yellow-500">
                <label class="block text-sm font-extrabold text-yellow-500 mb-2 tracking-wide">السؤال رقم ${qCount}</label>
                <textarea rows="2" required class="q-text w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm md:text-base transition-all resize-none shadow-inner" placeholder="اكتب نص السؤال بدقة..."></textarea>
            </div>
            <div class="space-y-3 pl-2 md:pl-8">
                ${[1,2,3,4].map(i => `
                <div class="flex items-center gap-4 bg-white/5 p-2 rounded-xl hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
                    <input type="radio" name="correct_${containerId}_${Date.now()}_${qCount}" value="${i-1}" ${i===1?'checked':''} class="w-5 h-5 text-yellow-500 focus:ring-yellow-500 border-gray-600 bg-black cursor-pointer">
                    <input type="text" required class="q-opt w-full bg-transparent border-none px-2 py-1 text-white outline-none focus:ring-0 text-sm placeholder-gray-500 font-medium" placeholder="الخيار ${i}">
                </div>`).join('')}
            </div>
        `;
        container.appendChild(block);
    },
    removeBlock(btn) {
        const block = btn.closest('.mcq-block');
        if(block) { block.style.opacity = '0'; block.style.transform = 'scale(0.95)'; setTimeout(() => block.remove(), 300); }
    },
    gatherData(containerId) {
        const container = DOM.get(containerId);
        if(!container) return [];
        const questions = [];
        container.querySelectorAll('.mcq-block').forEach(block => {
            const text = block.querySelector('.q-text').value;
            const options = Array.from(block.querySelectorAll('.q-opt')).map(i => i.value);
            const radioGroup = block.querySelector('input[type="radio"]:checked');
            if(text && options.every(o => o.trim() !== '') && radioGroup) {
                questions.push({ questionText: text, options: options, correctAnswer: parseInt(radioGroup.value) });
            }
        });
        return questions;
    }
};

export const FormsEngine = {
    init() {
        if(typeof document === 'undefined') return;
        document.addEventListener('DOMContentLoaded', () => {
            this.bindPointsForm();
            this.bindTestsForm();
            this.bindContentForm();
            this.bindQuizForm();
            this.bindPublicQuizForm();
        });
    },

    bindPointsForm() {
        const form = DOM.get('pointsForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('savePointsBtn');
            const email = DOM.get('studentEmail').value;
            const points = DOM.get('pointsAmount').value;
            
            Anim.triggerRipple(btn);
            btn.disabled = true; btn.innerHTML = '<span class="animate-pulse">جاري التحديث...</span>';
            
            const res = await Http.postJSON(API.UPDATE_POINTS, { studentEmail: email, points: parseInt(points) }, 'pts_add');
            btn.disabled = false; btn.textContent = 'تحديث التقييم';
            
            if(res) { Toast.success('تم تحديث تقييم الطالب بنجاح'); form.reset(); EventBus.emit('student:updated'); }
            else { Toast.error('فشل تحديث التقييم. تأكد من صحة البريد.'); }
        });
    },

    bindTestsForm() {
        const form = DOM.get('testsForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('saveTestBtn');
            const testName = DOM.get('testName').value;
            const grade = DOM.get('testGrade').value;
            
            const scores = [];
            document.getElementById('scoresContainer')?.querySelectorAll('.flex').forEach(row => {
                const name = row.querySelector('.test-student-name').value;
                const score = row.querySelector('.test-student-score').value;
                if(name && score) scores.push({ studentName: name, score: parseInt(score) });
            });

            if(scores.length === 0) return Toast.warning('الرجاء إضافة درجة طالب واحد على الأقل');

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.innerHTML = '<span class="animate-pulse">جاري النشر...</span>';
            
            const res = await Http.postJSON(API.SAVE_TEST, { testName, grade, scores }, 'test_add');
            btn.disabled = false; btn.textContent = 'نشر النتائج للطلاب';
            
            if(res) { 
                Toast.success('تم نشر النتائج للطلاب بنجاح'); 
                form.reset(); 
                document.getElementById('scoresContainer').innerHTML = ''; 
                EventBus.emit('content:deleted');
            } else { Toast.error('فشل حفظ الاختبار'); }
        });
    },

    bindContentForm() {
        const form = DOM.get('contentForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('saveContentBtn');
            const grade = DOM.get('contentGrade').value;
            const type = DOM.get('contentType').value;
            
            let payload = { grade, type };
            if(type === 'point') {
                payload.text = DOM.get('pointText').value;
                if(!payload.text) return Toast.warning('الرجاء كتابة الملاحظة');
            } else {
                payload.question = DOM.get('questionText').value;
                payload.hint = DOM.get('questionHint').value;
                if(!payload.question) return Toast.warning('الرجاء كتابة السؤال');
            }

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.innerHTML = '<span class="animate-pulse">جاري النشر...</span>';
            
            const res = await Http.postJSON(API.SAVE_CONTENT, payload, 'content_add');
            btn.disabled = false; btn.textContent = 'نشر المحتوى';
            
            if(res) { Toast.success('تم نشر المحتوى بنجاح'); form.reset(); EventBus.emit('content:deleted'); }
            else { Toast.error('فشل نشر المحتوى'); }
        });
    },

    bindQuizForm() {
        const form = DOM.get('quizForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('saveQuizBtn');
            const title = DOM.get('quizTitle').value;
            const grade = DOM.get('quizGrade').value;
            const questions = QuizBuilder.gatherData('dynamicQuestionsContainer');
            
            if(questions.length === 0) return Toast.warning('الرجاء إضافة سؤال واحد على الأقل وإكمال بياناته');

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.innerHTML = '<span class="animate-pulse">جاري المعالجة والنشر...</span>';
            
            const res = await Http.postJSON(API.SAVE_QUIZ, { title, grade, questions, isPublic: false }, 'quiz_add');
            btn.disabled = false; btn.textContent = 'نشر الاختبار للطلاب';
            
            if(res) { 
                Toast.success('تم نشر الاختبار للمنصة بنجاح!'); 
                form.reset(); 
                DOM.get('dynamicQuestionsContainer').innerHTML = ''; 
                EventBus.emit('content:deleted');
            } else { Toast.error('فشل إنشاء الاختبار'); }
        });
    },

    bindPublicQuizForm() {
        const form = DOM.get('publicQuizForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('savePublicQuizBtn');
            const title = DOM.get('publicQuizTitle').value;
            const grade = DOM.get('publicQuizGrade').value;
            const questions = QuizBuilder.gatherData('dynamicPublicQuestionsContainer');
            
            if(questions.length === 0) return Toast.warning('الرجاء إضافة سؤال واحد على الأقل وإكمال بياناته');

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.innerHTML = '<span class="animate-pulse">جاري إنشاء الرابط...</span>';
            
            const res = await Http.postJSON(API.SAVE_PUB_QUIZ, { title, grade, questions, isPublic: true }, 'pub_quiz_add');
            btn.disabled = false; btn.textContent = 'حفظ وتوليد رابط الاختبار';
            
            if(res && res.quizId) { 
                Toast.success('تم إنشاء الاختبار العام بنجاح!'); 
                DOM.get('publicQuizLinkArea').classList.remove('hidden');
                DOM.get('publicQuizLinkInput').value = `${window.location.origin}/quiz.html?id=${res.quizId}`;
                form.reset(); 
                DOM.get('dynamicPublicQuestionsContainer').innerHTML = ''; 
                EventBus.emit('content:deleted');
            } else { Toast.error('فشل إنشاء الاختبار العام'); }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// 📊 [MODULES] MAIN DASHBOARD LOGIC
// ═══════════════════════════════════════════════════════════════════
export async function fetchStats() {
    Logger.time('fetchStats');
    const data = await Http.postJSON(API.STATS, {}, 'stats');
    if (!data) return Logger.timeEnd('fetchStats');

    const sCount = data.studentsCount || 0;
    const pCount = data.pendingCount  || 0;

    Anim.animateValue('stats-students', sCount, 1500);
    Anim.animateValue('stats-pending',  pCount, 1300);

    Scheduler.read(() => {
        const sEl = DOM.get('stats-students');
        const pEl = DOM.get('stats-pending');
        if (sCount > 0) Anim.pulse(sEl?.closest('[data-stat]'));
        if (pCount > 0) Anim.pulse(pEl?.closest('[data-stat]'));
    });

    Scheduler.write(() => {
        const badge = DOM.get('pendingBadge');
        if (badge) {
            badge.textContent   = pCount > 99 ? '99+' : pCount;
            badge.style.display = pCount > 0 ? 'flex' : 'none';
            if(pCount > 0) badge.classList.add('animate-bounce');
            else badge.classList.remove('animate-bounce');
        }
    });

    if (sCount) {
        const rate = data.acceptedCount ? Math.round((data.acceptedCount / sCount) * 100) : 0;
        Anim.animateValue('stats-acceptance-rate', rate, 1200, '%');
    }
    Logger.timeEnd('fetchStats');
}

let _isPendingInitialized = false;

export async function fetchPendingRequests() {
    Logger.time('fetchPending');
    const container = DOM.get('pendingRequestsContainer');
    if (!container) return;

    container.innerHTML = DOM.skeleton(3, 2);
    const students = await Http.postJSON(API.PENDING, {}, 'pending');

    if (!students) { container.innerHTML = DOM.emptyState('error', 'فشل الاتصال بالخادم. يرجى التحقق من الشبكة.'); return; }
    State.pendingRequests = students;

    if (!students.length) {
        container.innerHTML = DOM.emptyState('empty', 'لا توجد طلبات معلقة حالياً ✓');
        return;
    }

    const html = students.map((st, i) => _buildRequestCard(st, i)).join('');
    DOM.fastAppend(container, html);
    Anim.staggerFadeIn(container, '.req-card', 0.05);

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
    Logger.timeEnd('fetchPending');
}

function _buildRequestCard(st, i) {
    const s = Security.sanitizeStudent(st);
    const fullName = [s.first_name, s.second_name, s.third_name, s.last_name].filter(Boolean).join(' ');
    return `
    <div id="req-${s.email}" class="req-card glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 opacity-0 hover:border-white/15 hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] transition-all duration-300 group relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none"></div>
        <div class="text-center md:text-right flex-1 min-w-0 z-10">
            <h4 class="font-bold text-white truncate text-base group-hover:text-yellow-300 transition-colors">${fullName}</h4>
            <div class="flex flex-wrap gap-1.5 mt-2 justify-center md:justify-start">
                <span class="text-[11px] text-gray-300 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 shadow-sm">${s.email}</span>
                <span class="text-[11px] text-yellow-400 bg-yellow-500/10 px-2.5 py-1 rounded-full border border-yellow-500/20 font-bold shadow-sm">${s.grade}</span>
                ${s.phone ? `<span class="text-[11px] text-gray-300 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 shadow-sm" dir="ltr">📞 ${s.phone}</span>` : ''}
            </div>
        </div>
        <div class="flex gap-2 w-full md:w-auto shrink-0 z-10">
            <button data-action="accept" data-email="${s.email}" aria-label="قبول الطالب" class="relative w-full md:w-auto bg-green-500/10 text-green-400 border border-green-500/20 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-green-500 hover:text-black hover:border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-all duration-200 active:scale-95 overflow-hidden focus-visible:ring-2 focus-visible:ring-green-500 ui-ripple">
                <span class="relative z-10 pointer-events-none flex items-center justify-center gap-2"><span class="text-lg">✓</span> قبول</span>
            </button>
            <button data-action="reject" data-email="${s.email}" aria-label="رفض الطالب" class="relative w-full md:w-auto bg-red-500/10 text-red-400 border border-red-500/20 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all duration-200 active:scale-95 overflow-hidden focus-visible:ring-2 focus-visible:ring-red-500 ui-ripple">
                <span class="relative z-10 pointer-events-none flex items-center justify-center gap-2"><span class="text-lg">✕</span> رفض</span>
            </button>
        </div>
    </div>`;
}

export async function updateStudentStatus(email, newStatus, reason = '', btnElement = null) {
    if (!email || !newStatus) return;

    if (btnElement) {
        Anim.triggerRipple(btnElement);
        Scheduler.write(() => {
            btnElement.disabled = true;
            btnElement.style.opacity = '0.65';
            const spinner = document.createElement('span');
            spinner.className = 'inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2';
            btnElement.querySelector('span')?.prepend(spinner);
        });
        const row = btnElement.closest('.req-card');
        if (row) setTimeout(() => Anim.slideOut(row, 'right'), 200);
    }

    const data = await Http.postJSON(API.UPDATE_STATUS, { studentEmail: email, newStatus, reason }, `status-${email}`);

    if (data !== null) {
        if (newStatus === STATUS.ACCEPTED) { Toast.success('تم قبول الطالب وانضمامه للمنصة بنجاح 🎓'); typeof SysUI !== 'undefined' && SysUI.confetti?.(); }
        else { Toast.warning('تم رفض طلب الطالب وإرسال السبب.'); }
        State.invalidateStudents();
        EventBus.emit('student:updated', null, 300);
    } else {
        Toast.error('خطأ أمني: فشل تحديث الحالة. حاول مجدداً.');
        if (btnElement) { 
            Scheduler.write(() => {
                btnElement.disabled = false; 
                btnElement.style.opacity = '1'; 
                btnElement.querySelector('.animate-spin')?.remove(); 
            });
        }
    }
}

export function rejectStudent(email, btnElement) {
    if(typeof SysUI !== 'undefined' && SysUI.prompt) {
        SysUI.prompt('سبب الرفض (إلزامي ليظهر للطالب):', reason => {
            if (reason !== null && reason.trim() !== '') updateStudentStatus(email, STATUS.REJECTED, reason, btnElement);
            else if (reason !== null) Toast.error('يجب كتابة سبب الرفض');
        });
    } else {
        const reason = prompt('سبب الرفض:');
        if(reason) updateStudentStatus(email, STATUS.REJECTED, reason, btnElement);
    }
}

let _gradeSelectDebounce = null;

export async function fetchStudentsByGrade() {
    clearTimeout(_gradeSelectDebounce);
    _gradeSelectDebounce = setTimeout(_doFetchStudents, 300);
}

async function _doFetchStudents() {
    const grade     = DOM.get('listGradeSelect')?.value;
    const container = DOM.get('studentsListContainer');
    if (!container || !grade) return;

    const cached = State.getCachedStudents(grade);
    if (cached) { _renderStudents(container, cached); return; }

    container.innerHTML = DOM.skeleton(6);
    const students = await Http.postJSON(API.STUDENTS_GRADE, { grade }, 'students');
    
    if (!students) { container.innerHTML = DOM.emptyState('error', 'جدار الحماية يمنع الاتصال أو الخادم لا يستجيب.'); return; }
    State.setCachedStudents(grade, students);
    _renderStudents(container, students);
}

function _renderStudents(container, students) {
    if (!students.length) { 
        container.innerHTML = DOM.emptyState('empty', 'لا يوجد أي طالب مسجل في هذه الدفعة حالياً.'); 
        return; 
    }
    
    const html = students.map((st, i) => _buildStudentCard(st, i)).join('');
    DOM.fastAppend(container, html);
    
    Anim.staggerFadeIn(container, '.student-card', 0.03);
    Anim.progressBars(container);
}

function _buildStudentCard(st, i) {
    const s = Security.sanitizeStudent(st);
    const fullName = [s.first_name, s.second_name, s.third_name, s.last_name].filter(Boolean).join(' ');
    const pts = Math.max(0, Math.min(100, parseInt(st.points) || 0)); 
    const pColor = pts >= THRESHOLD.HIGH ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]' : pts >= THRESHOLD.PASS ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]';
    const bColor = pts >= THRESHOLD.HIGH ? 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]' : pts >= THRESHOLD.PASS ? 'bg-gradient-to-r from-yellow-600 to-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]' : 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_10px_rgba(248,113,113,0.6)]';

    return `
    <div class="student-card bg-black/50 border border-white/5 rounded-2xl p-5 opacity-0 hover:border-white/20 hover:-translate-y-1.5 hover:shadow-[0_10px_30px_rgba(255,255,255,0.05)] transition-all duration-400 cursor-default group relative overflow-hidden backdrop-blur-sm">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex justify-between items-center mb-4">
            <div class="min-w-0 flex-1">
                <h4 class="font-extrabold text-white text-base truncate group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-yellow-400 group-hover:to-yellow-200 transition-all duration-300 tracking-wide">${fullName}</h4>
                <p class="text-xs text-gray-400 mt-1 truncate font-medium bg-black/30 inline-block px-2 py-0.5 rounded-md border border-white/5">${s.email}</p>
            </div>
            <div class="shrink-0 text-right ml-4">
                <p class="font-black text-3xl ${pColor} tabular-nums tracking-tighter">${pts}<span class="text-lg opacity-60">%</span></p>
            </div>
        </div>
        <div class="w-full bg-black border border-white/10 rounded-full h-2.5 overflow-hidden shadow-inner p-0.5">
            <div class="${bColor} h-full rounded-full transition-[width] duration-1500 ease-out relative overflow-hidden" style="width:0%" data-w="${pts}%">
                <div class="absolute inset-0 bg-white/20 w-full h-full transform -skew-x-12 -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
            </div>
        </div>
        ${s.phone ? `<div class="mt-3 flex items-center gap-2 text-xs text-gray-500 font-medium"><span class="opacity-50">📱</span><span dir="ltr">${s.phone}</span></div>` : ''}
    </div>`;
}

let _isManageInitialized = false;

export async function fetchGradeContent() {
    Logger.time('fetchContent');
    const grade     = DOM.get('manageGradeSelect')?.value;
    const container = DOM.get('manageContainer');
    const loading   = DOM.get('manageLoading');
    if (!container || !loading || !grade) return;

    Scheduler.write(() => {
        container.style.opacity = '0';
        container.style.transform = 'translateY(10px)';
        setTimeout(() => container.classList.add('hidden'), 300);
        loading.classList.remove('hidden');
    });

    const data = await Http.postJSON(API.GRADE_CONTENT, { grade }, `grade-content-${grade}`);
    
    Scheduler.write(() => { loading.classList.add('hidden'); });
    if (!data) return; 

    State.currentGradeData = data;
    renderManageContent(grade);

    Scheduler.write(() => {
        container.classList.remove('hidden');
        container.animate([{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 400, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards'});
    });

    if (!_isManageInitialized) {
        container.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'show-results') {
                if(typeof window.showDetailedResults === 'function') window.showDetailedResults(btn.dataset.quizId, btn.dataset.isPublic === 'true');
            } else if (btn.dataset.action === 'delete') {
                const { grade, itemtype, identifier } = btn.dataset;
                deleteContent(grade, itemtype, identifier, btn);
            }
        });
        _isManageInitialized = true;
    }
    Logger.timeEnd('fetchContent');
}

export function renderManageContent(grade) {
    const data = State.currentGradeData;
    if (!data) return;
    _renderSection('managePublicQuizzes', data.publicQuizzes, (q,i) => _buildPublicQuizItem(q,i,grade), 'لم يتم إنشاء اختبارات عامة بعد.');
    _renderSection('manageQuizzes',       data.quizzes,       (q,i) => _buildQuizItem(q,i,grade),       'لم يتم إنشاء اختبارات منصة للطلاب.');
    _renderSection('manageTests',         data.tests,         (t,i) => _buildTestItem(t,i,grade),       'لا توجد سجلات درجات مرفوعة.');
    _renderSection('manageQuestions',     data.questions,     (q,i) => _buildQuestionItem(q,i,grade),   'لا توجد أسئلة مقالية مضافة.');
    _renderSection('managePoints',        data.points,        (p,i) => _buildPointItem(p,i,grade),      'لا توجد نقاط أو ملاحظات مسجلة.');
}

function _renderSection(id, items, builder, emptyMsg) {
    const el = DOM.get(id);
    if (!el) return;
    if (!items?.length) {
        el.innerHTML = `<div class="bg-black/30 border border-white/5 rounded-xl py-8 flex flex-col items-center justify-center"><span class="text-3xl opacity-20 mb-2">📁</span><p class="text-gray-500 text-sm font-semibold tracking-wide">${Security.e(emptyMsg)}</p></div>`;
        return;
    }
    DOM.fastAppend(el, items.map((item, i) => builder(item, i)).join(''));
    Anim.staggerFadeIn(el, '[data-si]', 0.04);
}

function _buildPublicQuizItem(q, i, grade) {
    const title = Security.e(q.title || '');
    const id    = Security.e(String(q.id || ''));
    const cnt   = q.results?.length || 0;
    const g     = Security.e(grade);
    return `
    <div id="pubQz-${id}" data-si class="bg-gradient-to-r from-yellow-900/20 to-black border border-yellow-500/20 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 opacity-0 hover:border-yellow-500/50 hover:shadow-[0_0_20px_rgba(234,179,8,0.1)] transition-all duration-300 group">
        <div class="min-w-0 flex-1">
            <p class="font-extrabold text-white text-lg truncate group-hover:text-yellow-400 transition-colors">${title}</p>
            <div class="flex flex-wrap gap-2 mt-2">
                <span class="text-[11px] text-yellow-900 bg-yellow-400 px-3 py-1 rounded-full font-bold shadow-[0_0_10px_rgba(234,179,8,0.3)]">${cnt} رد مسجل</span>
                <span class="text-[11px] text-gray-300 bg-white/10 px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">🌍 اختبار عام</span>
                <button onclick="navigator.clipboard.writeText('${window.location.origin}/quiz.html?id=${id}'); Toast.success('تم نسخ رابط الاختبار');" class="text-[11px] text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1 rounded-full border border-blue-500/20 transition-colors flex items-center gap-1 cursor-pointer">🔗 نسخ الرابط</button>
            </div>
        </div>
        <div class="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button data-action="show-results" data-quiz-id="${id}" data-is-public="true" class="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-yellow-500 hover:text-black hover:shadow-[0_0_15px_rgba(234,179,8,0.4)] transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-yellow-500 ui-ripple flex items-center gap-2">📊 الإحصائيات</button>
            <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.PUBLIC_QUIZ}" data-identifier="${id}" title="حذف نهائي" class="text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2.5 rounded-xl border border-transparent hover:border-red-500/30 focus-visible:ring-2 focus-visible:ring-red-500 flex items-center justify-center">${trashSVG}</button>
        </div>
    </div>`;
}

function _buildQuizItem(q, i, grade) {
    const title = Security.e(q.title || '');
    const id    = Security.e(String(q.id || ''));
    const cnt   = q.results?.length || 0;
    const g     = Security.e(grade);
    return `
    <div id="qz-${id}" data-si class="bg-black/40 border border-white/10 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 opacity-0 hover:border-white/30 hover:bg-black/60 transition-all duration-300 group shadow-lg">
        <div class="min-w-0 flex-1">
            <p class="font-extrabold text-white text-lg truncate group-hover:text-gray-200 transition-colors">${title}</p>
            <span class="text-[11px] text-gray-300 bg-white/10 px-3 py-1 rounded-full mt-2 inline-flex items-center gap-1 border border-white/10 font-medium">👥 ${cnt} مجيب من المنصة</span>
        </div>
        <div class="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button data-action="show-results" data-quiz-id="${id}" data-is-public="false" class="bg-white/5 text-white border border-white/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-white hover:text-black hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-white ui-ripple">عرض النتائج</button>
            <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.QUIZ}" data-identifier="${id}" title="إزالة من المنصة" class="text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2.5 rounded-xl border border-transparent hover:border-red-500/30">${trashSVG}</button>
        </div>
    </div>`;
}

function _buildTestItem(t, i, grade) {
    const name = Security.e(t.testName || '');
    const g    = Security.e(grade);
    return `
    <div data-si class="bg-black/40 border border-white/10 p-4 rounded-xl opacity-0 flex justify-between items-center hover:border-blue-500/30 hover:bg-blue-900/10 transition-all duration-300 group">
        <div class="flex items-center gap-3 flex-1 min-w-0">
            <span class="bg-blue-500/20 text-blue-400 p-2 rounded-lg text-lg">📝</span>
            <p class="font-bold text-white truncate text-base">${name}</p>
        </div>
        <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.TEST}" data-identifier="${name}" title="مسح السجل" class="text-gray-500 group-hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/30 shrink-0 ml-4">${trashSVG}</button>
    </div>`;
}

function _buildQuestionItem(q, i, grade) {
    const question = Security.e(q.question || '');
    const hint = Security.e(q.hint || '');
    const g = Security.e(grade);
    return `
    <div data-si class="bg-black/40 border border-white/10 p-5 rounded-2xl opacity-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-purple-500/30 hover:bg-purple-900/10 transition-all duration-300 group">
        <div class="flex-1 min-w-0 w-full">
            <div class="flex items-start gap-3">
                <span class="text-purple-400 text-xl mt-0.5">❓</span>
                <div class="w-full">
                    <p class="text-white text-base font-bold leading-relaxed w-full whitespace-normal break-words">${question}</p>
                    ${hint ? `<p class="text-xs text-purple-300/70 mt-2 bg-purple-500/10 p-2 rounded-lg border border-purple-500/20 w-fit">💡 تلميح: ${hint}</p>` : ''}
                </div>
            </div>
        </div>
        <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.QUESTION}" data-identifier="${question}" title="حذف السؤال" class="text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2.5 rounded-xl border border-transparent hover:border-red-500/30 sm:self-center self-end shrink-0">${trashSVG}</button>
    </div>`;
}

function _buildPointItem(p, i, grade) {
    const text = Security.e(p.text || '');
    const g = Security.e(grade);
    return `
    <div data-si class="bg-black/40 border border-white/10 p-4 rounded-xl opacity-0 flex justify-between items-center gap-4 hover:border-green-500/30 hover:bg-green-900/10 transition-all duration-300 group border-l-4 border-l-green-500">
        <p class="text-white text-sm flex-1 leading-relaxed font-medium pl-2">${text}</p>
        <button data-action="delete" data-grade="${g}" data-itemtype="${ITEM_TYPE.POINT}" data-identifier="${text}" title="حذف الملاحظة" class="text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 p-2 rounded-lg border border-transparent hover:border-red-500/30 shrink-0">${trashSVG}</button>
    </div>`;
}

export function deleteContent(grade, itemType, identifier, btnElement = null) {
    if(typeof SysUI !== 'undefined' && SysUI.confirm) {
        SysUI.confirm('⚠️ تحذير أمني: هل أنت متأكد من الحذف النهائي؟ لا يمكن التراجع عن هذا الإجراء.', async confirmed => {
            if (!confirmed) return;
            _executeDelete(grade, itemType, identifier, btnElement);
        });
    } else {
        if(confirm('تأكيد الحذف النهائي؟')) _executeDelete(grade, itemType, identifier, btnElement);
    }
}

async function _executeDelete(grade, itemType, identifier, btnElement) {
    if(btnElement) {
        const card = btnElement.closest('[data-si]');
        if(card) {
            card.style.pointerEvents = 'none';
            card.style.filter = 'grayscale(100%) opacity(0.5)';
        }
    }
    const res = await Http.postJSON(API.DELETE_ITEM, { grade, itemType, identifier }, `del-${identifier}`);
    if (res) { 
        Toast.success('تم مسح البيانات بنجاح 🗑️'); 
        fetchGradeContent(); 
    } else { 
        Toast.error('خطأ فادح: تعذر الحذف من قاعدة البيانات.'); 
        if(btnElement) {
            const card = btnElement.closest('[data-si]');
            if(card) { card.style.pointerEvents = 'auto'; card.style.filter = 'none'; }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// 🚪 [MODULE] SYSTEM LOGOUT
// ═══════════════════════════════════════════════════════════════════
export function logout() { 
    Logger.warn('Initiating System Logout Sequence...');
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    setTimeout(() => Security.forceLogout(), 400);
}

// ═══════════════════════════════════════════════════════════════════
// 🌍 [EXPORTS] OMNI GLOBAL BINDINGS
// ═══════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
    Object.assign(window, {
        fetchStats, fetchPendingRequests, updateStudentStatus, rejectStudent,
        fetchStudentsByGrade, fetchGradeContent, renderManageContent, deleteContent, logout,
        QuizBuilder, FormsEngine, addMCQBlock: () => QuizBuilder.addBlock('dynamicQuestionsContainer', false),
        addPublicMCQBlock: () => QuizBuilder.addBlock('dynamicPublicQuestionsContainer', true),
        removeMCQBlock: (btn) => QuizBuilder.removeBlock(btn)
    });
    
    // Auto-init on load
    window.addEventListener('load', () => {
        FormsEngine.init();
        setTimeout(() => {
            fetchStats();
            fetchPendingRequests();
        }, 100);
    });
}
