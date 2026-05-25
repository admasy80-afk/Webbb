(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // 🔥 DAHIH APP - V6 THE ULTIMATE MASTERPIECE (PRODUCTION READY)
    // ═══════════════════════════════════════════════════════════════════

    if (window.__DAHIH_INITIALIZED__) return; // 🚀 [Fix: 10] Prevent Double Init Memory Leaks
    window.__DAHIH_INITIALIZED__ = true;

    const state = {
        user: null,
        currentMsgId: null,
        currentPoints: -1,
        coursesVersion: 0,
        quizzesVersion: 0,
        pointsVersion: 0,
        questionsVersion: 0,
        rawQuizzes: [],
        currentQuizFilter: 'all',
        speedIndex: 0,
        speeds: [1, 1.25, 1.5, 2],
        pollTimer: null,
        isPolling: false, // 🚀 [Fix: 9] Polling Lock
        isQuizOpen: false,
        uiFrozen: false,
        requestEpoch: 0,
        dashboardController: null,
        rafIds: new Set(),
        timeoutIds: new Set(),
        eventListeners: [],
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        lowEndDevice: false,
        isDestroyed: false,
        offlineMode: false,
        progressBuffer: new Map(),
        progressFlushTimer: null,
        idbReady: false,
        toastContainer: null
    };

    const getCsrfToken = () => {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    };

    (function detectDevice() {
        try {
            const cores = navigator.hardwareConcurrency || 4;
            const mem = navigator.deviceMemory || 4;
            const conn = navigator.connection || {};
            state.lowEndDevice = cores <= 2 || mem <= 2 || conn.saveData === true || ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
        } catch (e) { state.lowEndDevice = false; }
    })();

    // 🚀 [Fix: 12 & 14] CSS Optimizations (Containment & Tap Highlight)
    document.head.insertAdjacentHTML('beforeend', `
        <style>
            * { -webkit-tap-highlight-color: transparent; }
            .course-card-v4, .quiz-card { contain: layout paint style; }
            .low-end-device * { animation: none !important; transition: none !important; backdrop-filter: none !important; box-shadow: none !important; }
            .frozen-ui * { animation-play-state: paused !important; transition: none !important; }
        </style>
    `);

    if (state.lowEndDevice) document.body.classList.add('low-end-device');

    const $ = (id) => document.getElementById(id);

    const escapeHTML = (str) => {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    };

    const cyrb53 = (str, seed = 0) => {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };

    const formatTime = (t) => {
        if (!isFinite(t) || t < 0) return '00:00';
        const m = Math.floor(t / 60), s = Math.floor(t % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const haptic = (ms = 30) => {
        if (state.reduceMotion || state.lowEndDevice) return;
        if ('vibrate' in navigator) { try { navigator.vibrate(ms); } catch (e) {} }
    };

    const safeRAF = (cb) => {
        if (state.isDestroyed || state.uiFrozen) return null;
        const id = requestAnimationFrame((t) => { state.rafIds.delete(id); if (!state.isDestroyed) cb(t); });
        state.rafIds.add(id); return id;
    };

    // 🚀 [Fix: 13] safeIdle for large non-blocking renders
    const safeIdle = (cb) => {
        if (state.isDestroyed || state.uiFrozen) return;
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => { if (!state.isDestroyed && !state.uiFrozen) cb(); }, { timeout: 1000 });
        } else {
            safeTimeout(cb, 50);
        }
    };

    const safeTimeout = (cb, ms) => {
        if (state.isDestroyed) return null;
        const id = setTimeout(() => { state.timeoutIds.delete(id); if (!state.isDestroyed) cb(); }, ms);
        state.timeoutIds.add(id); return id;
    };

    const cancelSafeTimeout = (id) => { if (id) { clearTimeout(id); state.timeoutIds.delete(id); } };
    const safeOn = (target, event, handler, options) => {
        if (!target) return;
        target.addEventListener(event, handler, options);
        state.eventListeners.push({ target, event, handler, options });
    };

    const debounce = (fn, wait) => {
        let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
    };

    const TokenManager = {
        getUser: () => { try { return JSON.parse(localStorage.getItem('dahih_user')); } catch { return null; } },
        clear: () => localStorage.removeItem('dahih_user')
    };

    function authGate() {
        const user = TokenManager.getUser();
        if (!user) {
            Toast.show("⚠️ انتهت صلاحية الجلسة، جاري التحويل...", 'warn', 2000);
            safeTimeout(() => window.location.replace('/logina.html'), 1500);
            return false;
        }
        state.user = user; return true;
    }

    function logout() {
        destroy(); TokenManager.clear();
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfToken() } })
            .finally(() => window.location.replace('/logina.html'));
    }

    // 🚀 [Fix] Robust Multi-Browser Fullscreen Handler
    function toggleFullscreen() {
        const container = $('videoContainer');
        if (!container) return;
        try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
                if (container.requestFullscreen) container.requestFullscreen();
                else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
                else if (container.mozRequestFullScreen) container.mozRequestFullScreen();
                else if (container.msRequestFullscreen) container.msRequestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
                else if (document.msExitFullscreen) document.msExitFullscreen();
            }
        } catch (e) {
            Toast.show("🚨 عذراً، ميزة ملء الشاشة غير مدعومة بالكامل على هذا الجهاز", 'warn');
        }
    }

    const Toast = {
        MAX_TOASTS: 4, 
        init() {
            if (state.toastContainer) return;
            const c = document.createElement('div');
            c.id = 'dahih-toast-root'; c.setAttribute('aria-live', 'polite');
            c.style.cssText = `position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;max-width:90vw;`;
            document.body.appendChild(c); state.toastContainer = c;
        },
        show(msg, type = 'info', duration = 4000) {
            this.init();
            while (state.toastContainer.children.length >= this.MAX_TOASTS) state.toastContainer.firstChild.remove();
            const colors = { info: 'background:#1e293b;border-color:#334155;color:#e2e8f0;', success: 'background:#064e3b;border-color:#10b981;color:#d1fae5;', error: 'background:#7f1d1d;border-color:#ef4444;color:#fee2e2;', warn: 'background:#78350f;border-color:#f59e0b;color:#fef3c7;' };
            const t = document.createElement('div');
            t.style.cssText = `${colors[type] || colors.info}padding:.75rem 1.25rem;border-radius:.75rem;border:1px solid;font-size:.875rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:auto;opacity:0;transform:translateY(-10px);transition:opacity .25s,transform .25s;direction:rtl;text-align:right;max-width:24rem;`;
            t.textContent = msg; state.toastContainer.appendChild(t);
            requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
            const removeToast = () => { if (!t.isConnected) return; t.style.opacity = '0'; t.style.transform = 'translateY(-10px)'; safeTimeout(() => { if (t.isConnected) t.remove(); }, 300); };
            t.dataset.timeoutId = safeTimeout(removeToast, duration);
        }
    };

    const IDBCache = {
        db: null, DB_NAME: 'dahih_cache_v6', STORE: 'dashboard',
        async init() {
            if (!('indexedDB' in window)) return false;
            return new Promise((resolve) => {
                try {
                    const req = indexedDB.open(this.DB_NAME, 1);
                    req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { keyPath: 'key' }); };
                    req.onsuccess = (e) => { this.db = e.target.result; state.idbReady = true; resolve(true); };
                    req.onerror = () => resolve(false);
                } catch (e) { resolve(false); }
            });
        },
        async set(key, value) {
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                try {
                    const tx = this.db.transaction(this.STORE, 'readwrite');
                    tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(new Error('IDB aborted'));
                    tx.objectStore(this.STORE).put({ key, value, ts: Date.now() });
                } catch (e) { reject(e); }
            });
        },
        async get(key) {
            if (!this.db) return null;
            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(key);
                    req.onsuccess = () => resolve(req.result ? req.result.value : null); req.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            });
        }
    };

    // 🚀 [Fix: 15] Universal React-like Reconciler Utility
    function reconcileDOM(container, dataList, idKey, hashFn, buildFn, patchFn, visibilityFn = null) {
        if (!container) return;
        const existingMap = new Map();
        Array.from(container.children).forEach(el => {
            const id = el.dataset[idKey];
            if (id) existingMap.set(id, el);
        });

        const ordered = [];
        dataList.forEach((item, idx) => {
            const id = String(item[idKey] || item.id || item.telegramMsgId);
            const hash = String(hashFn(item));
            let el = existingMap.get(id);

            if (!el) {
                el = buildFn(item, idx);
                patchFn(el, item, idx);
                el.dataset.fp = hash;
                el.dataset[idKey] = id;
            } else {
                existingMap.delete(id);
                if (el.dataset.fp !== hash) {
                    patchFn(el, item, idx);
                    el.dataset.fp = hash;
                }
            }

            if (visibilityFn) el.hidden = !visibilityFn(item);
            ordered.push(el);
        });

        existingMap.forEach(el => el.remove());
        container.replaceChildren(...ordered);
    }

    const player = {
        video: null, progressRAF: null, lastSentTime: -1,

        init() {
            this.video = $('dahihPlayer');
            this.poster = $('videoPoster'); this.container = $('videoContainer');
            this.progress = $('progressContainer'); this.progressBar = $('progressBar');
            this.currentTimeEl = $('currentTimeDisplay'); this.durationEl = $('durationDisplay');
            this.speedBtn = $('speedBtn'); this.muteBtn = $('muteBtn'); this.centerPlay = $('centerPlay');
            this.titleEl = $('playingVideoTitle'); this.tapLeft = $('tapLeft'); this.tapRight = $('tapRight');

            if (!this.video) return;

            // 🚀 [Fix: 3 & 11] Pro Video Attributes
            this.video.preload = state.lowEndDevice ? 'none' : 'metadata';
            this.video.setAttribute('playsinline', '');
            this.video.disablePictureInPicture = true;
            this.video.controlsList = 'nodownload';
            this.video.crossOrigin = 'anonymous';

            safeOn(this.video, 'click', () => this.togglePlay());
            safeOn(this.centerPlay, 'click', () => this.togglePlay());
            safeOn(this.video, 'play', () => this.onPlay());
            safeOn(this.video, 'pause', () => this.onPause());
            safeOn(this.video, 'loadedmetadata', () => { this.durationEl.textContent = formatTime(this.video.duration); });
            safeOn(this.video, 'error', () => this.onError());
            safeOn(this.video, 'waiting', () => this.onBuffering(true));
            safeOn(this.video, 'canplay', () => this.onBuffering(false));
            safeOn(this.video, 'ended', () => this.flushProgress());

            safeOn(this.tapLeft, 'dblclick', (e) => { e.preventDefault(); this.skip(-10, '-10', 'left'); });
            safeOn(this.tapRight, 'dblclick', (e) => { e.preventDefault(); this.skip(10, '+10', 'right'); });

            safeOn(this.speedBtn, 'click', (e) => {
                e.stopPropagation(); state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
                this.video.playbackRate = state.speeds[state.speedIndex]; this.speedBtn.textContent = state.speeds[state.speedIndex] + 'x';
            });
            safeOn(this.muteBtn, 'click', (e) => { e.stopPropagation(); this.video.muted = !this.video.muted; this.updateMuteIcon(); });
            safeOn(this.progress, 'click', (e) => {
                e.stopPropagation(); if (!this.video.src || !isFinite(this.video.duration)) return;
                const r = this.progress.getBoundingClientRect(), pos = (e.clientX - r.left) / r.width;
                this.video.currentTime = Math.max(0, Math.min(1, pos)) * this.video.duration;
            });
            safeOn(window, 'pagehide', () => this.flushProgress());
        },

        // 🚀 [Fix: 4] High-Performance RAF Loop for Video Progress (Zero Main-Thread Blocking)
        startProgressLoop() {
            const loop = () => {
                if (!this.video || this.video.paused || this.video.ended || state.isDestroyed) return;
                this.onTimeUpdate();
                this.progressRAF = requestAnimationFrame(loop);
            };
            if (this.progressRAF) cancelAnimationFrame(this.progressRAF);
            this.progressRAF = requestAnimationFrame(loop);
        },
        
        stopProgressLoop() {
            if (this.progressRAF) { cancelAnimationFrame(this.progressRAF); this.progressRAF = null; }
        },

        async load(msgId, title) {
            if (!this.video) return;
            if (String(state.currentMsgId) === String(msgId)) { this.togglePlay(); return; }

            this.flushProgress(); this.stopProgressLoop();
            state.currentMsgId = String(msgId); this.titleEl.textContent = title || 'جاري التحميل...'; this.lastSentTime = -1;
            
            this.poster.classList.add('hidden'); this.video.classList.remove('hidden'); this.video.style.display = 'block';
            this.container.classList.add('is-active');
            
            const wasMuted = this.video.muted; this.video.muted = true; 
            this.video.src = `/api/student/video/stream/${encodeURIComponent(msgId)}`; this.video.load();

            await new Promise((resolve) => {
                let timer; const done = () => { this.video.removeEventListener('loadedmetadata', done); clearTimeout(timer); resolve(); };
                timer = setTimeout(done, 2000); this.video.addEventListener('loadedmetadata', done, { once: true });
            });

            try { await this.video.play(); this.video.muted = wasMuted; } 
            catch (err) {
                this.centerPlay.classList.add('is-visible'); this.centerPlay.style.opacity = "1"; this.centerPlay.style.transform = "scale(1)"; this.centerPlay.style.pointerEvents = "auto";
            }

            document.querySelectorAll('.course-card-v4.is-playing').forEach(c => {
                c.classList.remove('is-playing', 'border-yellow-500/40', 'shadow-md'); c.classList.add('border-white/10', 'shadow-sm');
                const btn = c.querySelector('button.course-action-btn');
                if (btn) { btn.className = "course-action-btn w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 rounded-lg transition-colors border border-white/10"; btn.textContent = "تشغيل المحاضرة"; }
            });

            const card = $(`course_${msgId}`);
            if (card) {
                card.classList.remove('border-white/10', 'shadow-sm'); card.classList.add('is-playing', 'border-yellow-500/40', 'shadow-md');
                const btn = card.querySelector('button.course-action-btn');
                if (btn) { btn.className = "course-action-btn w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2.5 rounded-lg transition-colors"; btn.textContent = "استكمال المشاهدة"; }
            }
            this.container.scrollIntoView({ behavior: state.reduceMotion ? 'auto' : 'smooth', block: 'center' });
        },

        togglePlay() {
            if (!this.video.src) return;
            if (this.video.paused) this.video.play().catch(() => {}); else this.video.pause();
        },

        onPlay() {
            this.centerPlay.classList.remove('is-visible'); this.centerPlay.style.opacity = "0"; this.centerPlay.style.transform = "scale(1.5)"; this.centerPlay.style.pointerEvents = "none";
            this.startProgressLoop(); // 🔥 Start RAF Loop
        },

        onPause() {
            this.centerPlay.classList.add('is-visible'); this.centerPlay.style.opacity = "1"; this.centerPlay.style.transform = "scale(1)"; this.centerPlay.style.pointerEvents = "auto";
            this.stopProgressLoop(); // 🔥 Stop RAF Loop
            this.flushProgress();
        },

        onBuffering(isBuffering) { if (this.container) this.container.classList.toggle('is-buffering', isBuffering); },

        onTimeUpdate() {
            if (!isFinite(this.video.duration)) return;
            const pct = (this.video.currentTime / this.video.duration) * 100;
            this.progressBar.style.width = pct + '%'; this.currentTimeEl.textContent = formatTime(this.video.currentTime);

            const currentSec = Math.floor(this.video.currentTime);
            if (!state.uiFrozen && currentSec > 0 && currentSec % 10 === 0 && this.lastSentTime !== currentSec) {
                this.lastSentTime = currentSec; this.queueProgress(state.currentMsgId, this.video.currentTime);
            }
        },

        queueProgress(msgId, currentTime) {
            state.progressBuffer.set(msgId, currentTime);
            if (state.progressFlushTimer) return;
            state.progressFlushTimer = safeTimeout(() => { state.progressFlushTimer = null; this.flushProgress(); }, 2000);
        },

        flushProgress() {
            if (state.progressBuffer.size === 0) return;
            const entries = Array.from(state.progressBuffer.entries()).map(([msgId, currentTime]) => ({ msgId, currentTime }));
            state.progressBuffer.clear();
            fetch('/api/student/save-progress-batch', { method: 'POST', keepalive: true, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() }, body: JSON.stringify(entries) }).catch(() => {});
        },

        onError() {
            const err = this.video.error; const codes = { 1: 'تم إلغاء التحميل', 2: 'خطأ شبكة', 3: 'خطأ فك التشفير', 4: 'الصيغة غير مدعومة' };
            Toast.show(`🚨 ${err ? (codes[err.code] || 'خطأ غير معروف') : 'خطأ مجهول'}`, 'error');
        },

        skip(seconds, label, side) {
            if (!this.video.src || !isFinite(this.video.duration)) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            const indicator = side === 'left' ? $('skipIndicatorLeft') : $('skipIndicatorRight');
            const textEl = side === 'left' ? $('skipTextLeft') : $('skipTextRight');
            if (indicator && textEl) {
                textEl.textContent = label; indicator.classList.remove('is-active');
                requestAnimationFrame(() => indicator.classList.add('is-active'));
            } haptic(35);
        },

        updateMuteIcon() {
            this.muteBtn.innerHTML = this.video.muted
                ? '<svg style="width:1.4rem;height:1.4rem;color:#f87171;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4"/></svg>'
                : '<svg style="width:1.4rem;height:1.4rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"/></svg>';
        }
    };

    // 🚀 [Fix: 2] Rock-Solid Fetch Data with forcedEpoch for Retries
    async function fetchData(initial = false, retries = 2, forcedEpoch = null) {
        if (state.uiFrozen || state.isDestroyed) return;
        
        const currentEpoch = forcedEpoch ?? ++state.requestEpoch;

        const container = $('studentCoursesContainer');
        if (initial && container && !container.querySelector('.course-card-v4')) {
            container.innerHTML = `<div class="text-center py-16 text-gray-500 flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10 w-full"><svg class="animate-spin h-10 w-10 text-yellow-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><p class="font-bold text-lg text-gray-300">جاري جلب البيانات...</p></div>`;
            if (state.idbReady) {
                IDBCache.get(`dashboard_${state.user.email}`).then(cached => {
                    if (cached && state.requestEpoch === currentEpoch && !state.uiFrozen) safeIdle(() => renderAll(cached, true));
                });
            }
        }

        if (state.dashboardController) { try { state.dashboardController.abort(); } catch (e) {} }
        state.dashboardController = new AbortController(); const ctrl = state.dashboardController;
        const timeoutId = safeTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 15000);

        try {
            const res = await fetch('/api/student/dashboard-data', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                body: JSON.stringify({ email: state.user.email, grade: state.user.grade }),
                signal: ctrl.signal, cache: 'no-store'
            });

            cancelSafeTimeout(timeoutId);
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) { Toast.show("🚨 انتهت صلاحية الجلسة", 'error'); safeTimeout(() => logout(), 1500); return; }
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            if (state.requestEpoch !== currentEpoch || state.uiFrozen || state.isDestroyed) return;

            // 🚀 [Fix: 5] Fire and forget IDB save (Non-blocking)
            if (state.idbReady) IDBCache.set(`dashboard_${state.user.email}`, data).catch(() => {});

            state.offlineMode = false;
            safeRAF(() => renderAll(data, initial));

        } catch (err) {
            cancelSafeTimeout(timeoutId);
            if (err.name === 'AbortError' || state.requestEpoch !== currentEpoch) return;

            if (retries > 0 && !state.isDestroyed) {
                const delay = (3 - retries) * 1500;
                const retryEpoch = currentEpoch;
                safeTimeout(() => { if (!state.isDestroyed) fetchData(initial, retries - 1, retryEpoch); }, delay);
                return;
            }

            if (initial && state.idbReady) {
                const cached = await IDBCache.get(`dashboard_${state.user.email}`);
                if (cached && !state.uiFrozen && state.requestEpoch === currentEpoch) {
                    state.offlineMode = true; Toast.show("📡 وضع عدم الاتصال - بيانات محفوظة", 'warn');
                    safeIdle(() => renderAll(cached, true)); return;
                }
            }
            if (container && initial && !state.uiFrozen && state.requestEpoch === currentEpoch) {
                container.innerHTML = `<div class="text-center py-16 text-red-400 bg-red-500/5 rounded-2xl border border-red-500/20 w-full"><p class="font-bold text-xl mb-2">فشل تحميل البيانات 😔</p><p class="text-sm text-gray-400 mb-6">${escapeHTML(err.message)}</p><button onclick="DahihApp.refresh()" class="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 px-6 py-2 rounded-xl transition-colors font-bold">🔄 أعد المحاولة</button></div>`;
            } else if (!initial && state.requestEpoch === currentEpoch) {
                Toast.show("⚠️ فشل تحديث البيانات", 'warn', 2500);
            }
        }
    }

    function renderAll(data, initial) {
        if (state.uiFrozen || state.isDestroyed) return;
        try {
            renderCourses(data.courses || data.content?.courses || []);
            if (data.content?.quizzes) state.rawQuizzes = data.content.quizzes.slice().reverse();
            renderQuizzes(state.rawQuizzes);
            renderPoints(data.content?.points || []);
            renderQuestions(data.content?.questions || []);
            renderScore(parseInt(data.studentPoints || 0));
        } catch (e) { console.error("Render error:", e); }
    }

    // ─── COURSES RENDER (VIA RECONCILER) ───────────────────────────────────────
    function renderCourses(list) {
        const container = $('studentCoursesContainer'); if (!container) return;
        const v = cyrb53(list.map(c => `${c.telegramMsgId}|${c.lastWatched}`).join(';'));
        if (v === state.coursesVersion) return; state.coursesVersion = v;

        if (list.length === 0) {
            container.className = "flex flex-col gap-8";
            container.innerHTML = '<div class="text-center py-16 text-gray-400 bg-white/5 rounded-2xl border border-white/10 w-full">لا توجد محاضرات متاحة حالياً لصفك الدراسي.</div>';
            return;
        }

        container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";

        const buildCard = () => {
            const el = document.createElement('div');
            el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
            el.innerHTML = `
                <div class="relative p-4 flex flex-col justify-between border-b border-white/10 course-header" style="background-color:#0a0a0a; aspect-ratio: 16/9;">
                    <img src="" alt="" loading="lazy" decoding="async" class="course-img absolute inset-0 w-full h-full object-cover opacity-50" style="z-index:0;">
                    <div class="absolute inset-0" style="background:linear-gradient(to bottom right,rgba(0,0,0,0.3),rgba(0,0,0,0.8));z-index:1;"></div>
                    <span class="course-badge relative self-start px-2.5 py-1 rounded-md text-[0.7rem] font-bold bg-black/80 border" style="z-index:2;"></span>
                    <div class="course-desc relative text-white/90 text-xs font-medium drop-shadow-sm truncate" style="z-index:2;"></div>
                </div>
                <div class="p-5 flex flex-col flex-grow">
                    <h3 class="course-title text-lg font-bold text-white mb-3 truncate"></h3>
                    <div class="flex items-center gap-2 text-xs text-gray-400 mb-4"><span class="course-duration bg-black/30 px-2 py-1 rounded border border-white/5"></span></div>
                    <div class="course-last-watched"></div>
                    <div class="mt-auto pt-4 border-t border-white/10"><button tabindex="-1" class="course-action-btn course-play w-full transition-colors"></button></div>
                </div>`;
            return el;
        };

        const patchCard = (el, course, idx) => {
            const id = course.telegramMsgId, isActive = String(state.currentMsgId) === String(id);
            const title = course.courseName || 'محاضرة', desc = course.description || 'لا يوجد وصف', duration = course.duration || 'غير محدد';
            
            el.setAttribute('aria-label', `تشغيل ${title}`);
            el.className = `${isActive ? 'is-playing ' : ''}flex flex-col bg-white/5 border ${isActive ? 'border-yellow-500/40 shadow-md' : 'border-white/10 shadow-sm'} rounded-xl overflow-hidden hover:-translate-y-1 hover:border-white/20 transition-transform transition-colors duration-300 course-card-v4 cursor-pointer`;
            el.querySelector('.course-img').src = course.image && course.image.length > 10 ? course.image : 'https://images.unsplash.com/photo-1632516643720-e7f5d7d6ecc9?q=80&w=600&auto=format&fit=crop';
            const badge = el.querySelector('.course-badge'); badge.textContent = `الدرس ${idx + 1}`;
            badge.className = `course-badge relative self-start px-2.5 py-1 rounded-md text-[0.7rem] font-bold bg-black/80 border ${isActive ? 'border-yellow-500/40 text-yellow-500' : 'border-white/10 text-white'}`;
            el.querySelector('.course-desc').textContent = desc; el.querySelector('.course-title').textContent = title;
            el.querySelector('.course-title').title = title; el.querySelector('.course-duration').textContent = `⏱️ ${duration}`;
            const lw = el.querySelector('.course-last-watched');
            lw.innerHTML = course.lastWatched ? `<div class="inline-flex items-center gap-2 text-[0.75rem] text-white bg-white/5 px-3 py-1.5 rounded-md mb-4 border border-white/10 w-fit"><span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>آخر مشاهدة: الدقيقة ${escapeHTML(course.lastWatched)}</div>` : '<div class="h-8 mb-4"></div>';
            const btn = el.querySelector('.course-action-btn'); btn.dataset.title = title; btn.dataset.msgid = id;
            btn.className = `course-action-btn course-play w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-lg transition-colors ${isActive ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`;
            btn.textContent = isActive ? "استكمال المشاهدة" : "تشغيل المحاضرة";
        };

        reconcileDOM(container, list, 'courseId', c => cyrb53(`${c.telegramMsgId}|${c.courseName}|${c.lastWatched}|${c.duration}|${String(state.currentMsgId) === String(c.telegramMsgId)}`), buildCard, patchCard);
    }

    // ─── QUIZZES RENDER (VIA RECONCILER) ───────────────────────────────────────
    function renderQuizzes(list) {
        const container = $('onlineQuizzesContainer'), emptyState = $('empty-state');
        if (!container || !list) return;

        const processed = list.map(quiz => {
            const res = quiz.results ? quiz.results.find(r => r.email === state.user.email) : null;
            return { ...quiz, attempted: !!res, score: res ? res.percentage : 0, attempts: res ? 1 : 0, questionsCount: quiz.questions?.length || 0, duration: quiz.duration || 15 };
        });

        const dataHash = cyrb53(processed.map(q => `${q.id}|${q.attempted}|${q.score}|${q.attempts}`).join(';'));
        if (dataHash === state.memoizedQuizzesHash) {
            let vis = 0;
            Array.from(container.children).forEach(el => {
                const match = state.currentQuizFilter === 'all' || (state.currentQuizFilter === 'new' && el.dataset.attempted === 'false') || (state.currentQuizFilter === 'completed' && el.dataset.attempted === 'true');
                el.hidden = !match; if (match) vis++;
            });
            if (emptyState) { emptyState.classList.toggle('hidden', vis > 0); emptyState.classList.toggle('flex', vis === 0); }
            return;
        }
        state.memoizedQuizzesHash = dataHash;

        if ($('stat-total')) {
            const comp = processed.filter(q => q.attempted);
            $('stat-total').textContent = processed.length; $('stat-completed').textContent = comp.length;
            $('stat-remaining').textContent = processed.length - comp.length;
            $('stat-average').textContent = comp.length ? `${Math.round(comp.reduce((a, q) => a + (q.score || 0), 0) / comp.length)}%` : '-';
        }

        processed.sort((a, b) => (a.attempted === b.attempted) ? 0 : a.attempted ? 1 : -1);

        const buildQuiz = (quiz, idx) => {
            const el = document.createElement('button');
            el.style.animationDelay = state.lowEndDevice ? '0s' : `${(idx % 10) * 0.03}s`;
            return el;
        };

        const patchQuiz = (el, quiz) => {
            el.dataset.attempted = String(quiz.attempted);
            el.setAttribute('aria-label', `اختبار ${quiz.title || 'بدون عنوان'}`);
            el.className = `quiz-card ${quiz.attempted ? 'completed-card' : ''} animate-fade w-full text-left transition-transform transition-colors`;
            
            if (!quiz.attempted) {
                el.innerHTML = `<div class="relative z-10"><div class="flex items-center gap-2 mb-3"><span class="text-[11px] font-bold text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-[10px] tracking-wider">جديد</span><span class="text-xs text-gray-500">${quiz.duration} دقيقة</span></div><h3 class="text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">${escapeHTML(quiz.title || 'بدون عنوان')}</h3><p class="text-sm text-gray-400 flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>${quiz.questionsCount} سؤال</span></p></div><div class="relative z-10 flex items-center justify-between mt-auto pt-5 border-t border-white/[0.03]"><span class="text-sm font-medium text-gray-400">اضغط للبدء</span><div class="w-8 h-8 rounded-[10px] bg-white/5 flex items-center justify-center text-gray-400"><svg class="w-4 h-4 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></div></div>`;
            } else {
                el.innerHTML = `<div class="relative z-10 flex justify-between items-start mb-3"><span class="text-[11px] font-bold text-white bg-white/10 px-2 py-1 rounded-[10px] tracking-wider">مكتمل</span></div><h3 class="relative z-10 text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">${escapeHTML(quiz.title || 'بدون عنوان')}</h3><div class="relative z-10 text-xs text-gray-500 space-y-1 mb-4">${quiz.attempts ? `المحاولات: ${quiz.attempts}` : ''}</div><div class="relative z-10 mt-auto pt-4 border-t border-white/[0.03] flex items-end justify-between"><span class="text-xs text-gray-400 mb-1">النتيجة النهائية</span><div class="text-3xl font-black leading-none ${quiz.score >= 50 ? 'text-yellow-400' : 'text-red-400'}">${quiz.score}%</div></div>`;
            }
        };

        const visFn = q => state.currentQuizFilter === 'all' || (state.currentQuizFilter === 'new' && !q.attempted) || (state.currentQuizFilter === 'completed' && q.attempted);
        
        reconcileDOM(container, processed, 'id', q => cyrb53(`${q.id}|${q.attempted}|${q.score}|${q.attempts}|${q.title}`), buildQuiz, patchQuiz, visFn);

        if (emptyState) {
            const vis = Array.from(container.children).filter(el => !el.hidden).length;
            emptyState.classList.toggle('hidden', vis > 0); emptyState.classList.toggle('flex', vis === 0);
        }
    }

    function renderPoints(list) {
        const container = $('pointsContainer'); if (!container) return;
        const v = cyrb53(JSON.stringify(list)); if (v === state.pointsVersion) return; state.pointsVersion = v;
        if (!list.length) { container.innerHTML = '<p class="empty text-gray-500 py-10 text-center">لا توجد ملاحظات حالياً.</p>'; return; }

        safeRAF(() => {
            const frag = document.createDocumentFragment(); const ul = document.createElement('ul'); ul.className = "fade-in-stagger flex flex-col gap-3";
            ul.innerHTML = list.map(p => `<li class="flex gap-3 text-slate-300 text-sm leading-relaxed"><span class="text-yellow-500 shrink-0">▸</span><span>${escapeHTML(p)}</span></li>`).join('');
            frag.appendChild(ul); container.replaceChildren(frag);
        });
    }

    // 🚀 [Fix: 6] 100% XSS-Safe DOM Creation (No innerHTML for user content)
    function renderQuestions(list) {
        const container = $('questionsContainer'); if (!container) return;
        const v = cyrb53(JSON.stringify(list)); if (v === state.questionsVersion) return; state.questionsVersion = v;
        if (!list.length) { container.innerHTML = '<p class="empty text-gray-500 py-10 text-center">لا توجد أسئلة مقالية حالياً.</p>'; return; }

        safeRAF(() => {
            const frag = document.createDocumentFragment();
            const wrapper = document.createElement('div'); wrapper.className = "fade-in-stagger flex flex-col gap-4";
            
            list.forEach((q, i) => {
                const article = document.createElement('article'); article.className = "bg-black/30 border border-white/5 rounded-xl p-4";
                
                const h3 = document.createElement('h3'); h3.className = "text-sm font-bold text-white mb-2 leading-relaxed";
                const numSpan = document.createElement('span'); numSpan.className = "text-gray-500 ml-2"; numSpan.textContent = `${i + 1}.`;
                h3.appendChild(numSpan); h3.appendChild(document.createTextNode(q.question || ''));
                
                const p = document.createElement('p'); p.className = "text-gray-400 text-xs leading-relaxed border-t border-white/5 pt-2 mt-0";
                const ansSpan = document.createElement('span'); ansSpan.className = "text-yellow-500 font-bold ml-2"; ansSpan.textContent = "الإجابة:";
                p.appendChild(ansSpan); p.appendChild(document.createTextNode(q.hint || ''));
                
                article.appendChild(h3); article.appendChild(p); wrapper.appendChild(article);
            });
            frag.appendChild(wrapper); container.replaceChildren(frag);
        });
    }

    function renderScore(newPoints) {
        const el = $('studentPointsDisplay'); if (!el || state.currentPoints === newPoints) return;
        const start = state.currentPoints === -1 ? 0 : state.currentPoints, duration = 1200;
        if (state.reduceMotion || state.lowEndDevice || state.uiFrozen) { el.textContent = newPoints + '%'; state.currentPoints = newPoints; return; }
        const t0 = performance.now();
        const step = (now) => {
            if (state.isDestroyed || state.uiFrozen) return;
            const p = Math.min((now - t0) / duration, 1), eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.floor(start + (newPoints - start) * eased) + '%';
            if (p < 1) safeRAF(step);
        };
        safeRAF(step); state.currentPoints = newPoints;
    }

    function destroy() {
        if (state.isDestroyed) return; state.isDestroyed = true;
        try { player.flushProgress(); player.stopProgressLoop(); } catch (e) {}
        if (state.pollTimer) cancelSafeTimeout(state.pollTimer);
        state.timeoutIds.forEach(id => clearTimeout(id)); state.timeoutIds.clear();
        state.rafIds.forEach(id => cancelAnimationFrame(id)); state.rafIds.clear();
        if (state.dashboardController) { try { state.dashboardController.abort(); } catch (e) {} }
        state.eventListeners.forEach(({ target, event, handler, options }) => { try { target.removeEventListener(event, handler, options); } catch (e) {} });
        state.eventListeners = [];
        try { if (player.video) { player.video.pause(); player.video.src = ''; } } catch (e) {}
    }

    // 🚀 [Fix: 9] Polling Lock
    async function pollLoop() {
        if (state.isDestroyed) return;
        if (state.isPolling) return; 
        
        state.isPolling = true;
        try {
            if (!document.hidden && !state.uiFrozen && !state.isQuizOpen) await fetchData(false); 
        } finally {
            state.isPolling = false;
            const POLL_INTERVAL = state.lowEndDevice ? 45000 : 30000;
            state.pollTimer = safeTimeout(pollLoop, POLL_INTERVAL);
        }
    }

    async function init() {
        if (!authGate()) return;
        await IDBCache.init();

        const firstName = state.user.name ? state.user.name.split(' ')[0] : 'طالب';
        if ($('studentName')) $('studentName').textContent = firstName;
        if ($('studentGrade')) $('studentGrade').textContent = state.user.grade || 'الصف غير محدد';

        player.init();
        await fetchData(true);
        pollLoop(); 

        safeOn(document, 'visibilitychange', debounce(() => {
            state.uiFrozen = document.hidden || state.isQuizOpen;
            if (document.hidden) {
                document.body.classList.add('frozen-ui');
                player.stopProgressLoop();
            } else {
                document.body.classList.remove('frozen-ui');
                if (!state.isQuizOpen) {
                    if (String(state.currentMsgId) !== 'null' && !player.video?.paused) player.startProgressLoop();
                    fetchData(false);
                }
            }
        }, 300));

        safeOn(window, 'online', () => { Toast.show("✅ عاد الاتصال", 'success', 2000); fetchData(false); });
        safeOn(window, 'offline', () => { Toast.show("📡 لا يوجد اتصال بالإنترنت", 'warn', 3000); });

        const coursesContainer = $('studentCoursesContainer');
        if (coursesContainer) {
            safeOn(coursesContainer, 'click', (e) => {
                const card = e.target.closest('.course-card-v4'); if (!card) return;
                const msgId = card.dataset.courseId, btn = card.querySelector('.course-action-btn'), title = btn ? btn.dataset.title : '';
                if (String(state.currentMsgId) === String(msgId)) return;
                if (typeof window.switchTab === 'function') { window.switchTab('dashboard'); }
                player.load(msgId, title); window.scrollTo({ top: 0, behavior: state.reduceMotion ? 'auto' : 'smooth' });
            });
            safeOn(coursesContainer, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const card = e.target.closest('.course-card-v4'); if (card) card.click(); }
            });
        }

        const quizContainer = $('onlineQuizzesContainer');
        if (quizContainer) {
            safeOn(quizContainer, 'click', (e) => {
                const card = e.target.closest('.quiz-card'); if (!card) return;
                const quizId = card.getAttribute('data-id'), quizData = state.rawQuizzes.find(q => String(q.id) === String(quizId));
                if (quizData && typeof QuizEngine !== 'undefined') QuizEngine.open(quizData);
                else if (!quizData) Toast.show("⚠️ لم يتم العثور على بيانات الاختبار", 'warn');
            });
        }

        document.querySelectorAll('.filter-btn').forEach(btn => {
            safeOn(btn, 'click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active');
                state.currentQuizFilter = e.target.getAttribute('data-filter'); safeRAF(() => renderQuizzes(state.rawQuizzes));
            });
        });

        safeOn(window, 'pagehide', () => { try { player.flushProgress(); } catch (e) {} destroy(); });
    }

    window.DahihApp = {
        logout, toggleFullscreen,
        refresh: () => { if (!state.isDestroyed) fetchData(true); },
        getState: () => state,
        toast: (msg, type, duration) => Toast.show(msg, type, duration),
        setQuizState: (isOpen) => {
            state.isQuizOpen = isOpen; state.uiFrozen = isOpen;
            if (isOpen && state.dashboardController) { try { state.dashboardController.abort(); } catch (e) {} }
            if (!isOpen) safeTimeout(() => fetchData(false), 1000);
        },
        destroy
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
