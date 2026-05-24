// ═══════════════════════════════════════════════════════════════════════════════════════
// منصة الدحيح | المشغل الخارق (Titanium Quantum Player Engine - v12.0 Apex Edition)
// Architecture: Isolated Subsystems + Reactive FSM with Microtask Batching + WeakRef Registry
//               + AbortController Lifecycle + Capability Matrix + Scheduler Priority Queue
//               + Adaptive Thermal Governor + Binary-Search VTT + DOM-Safe Subtitle Renderer
//               + Multi-Pass Ambient Bloom + Inertial Gesture Physics + Velocity-Based Seek
//               + Page Lifecycle API + Frame Drop Recovery + Mode Profiles + Error Taxonomy
//               + Workerized IndexedDB with Chunked Cursor Flush + Exponential Backoff
//               + Internal EventBus + Capability Contracts + Safari Decoder GC + Zero-Leak
// ═══════════════════════════════════════════════════════════════════════════════════════

const TitaniumQuantum = (() => {
    'use strict';

    // ─── 0. CAPABILITY MATRIX (DETECTED ONCE, CONSULTED EVERYWHERE) ───────────
    const Capabilities = (() => {
        const caps = {
            rvfc: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            webAudio: !!(window.AudioContext || window.webkitAudioContext),
            wakeLock: 'wakeLock' in navigator,
            mediaSession: 'mediaSession' in navigator,
            pictureInPicture: 'pictureInPictureEnabled' in document,
            fullscreen: !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
            screenOrientation: 'orientation' in screen && 'lock' in screen.orientation,
            indexedDB: 'indexedDB' in window,
            worker: typeof Worker !== 'undefined',
            blob: typeof Blob !== 'undefined',
            beacon: 'sendBeacon' in navigator,
            visualViewport: 'visualViewport' in window,
            pageLifecycle: 'onfreeze' in document || 'onresume' in document,
            networkInfo: 'connection' in navigator,
            deviceMemory: 'deviceMemory' in navigator,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            schedulerPostTask: 'scheduler' in window && 'postTask' in window.scheduler,
            requestIdleCallback: 'requestIdleCallback' in window,
            abortController: typeof AbortController !== 'undefined',
            weakRef: typeof WeakRef !== 'undefined',
            intersectionObserver: 'IntersectionObserver' in window,
            resizeObserver: 'ResizeObserver' in window,
            mutationObserver: 'MutationObserver' in window,
            performanceObserver: 'PerformanceObserver' in window,
            mediaCapabilities: 'mediaCapabilities' in navigator,
            hls: typeof window.Hls !== 'undefined',
            dash: typeof window.dashjs !== 'undefined',
            vibrate: 'vibrate' in navigator,
            battery: 'getBattery' in navigator,
            permissions: 'permissions' in navigator,
            broadcastChannel: typeof BroadcastChannel !== 'undefined',
            structuredClone: typeof structuredClone === 'function',
            crypto: 'crypto' in window && 'subtle' in window.crypto,
            mediaRecorder: typeof MediaRecorder !== 'undefined',
        };

        // Tier classification
        const memory = caps.deviceMemory || 4;
        const cores = caps.hardwareConcurrency;
        if (memory >= 8 && cores >= 8) caps.tier = 'apex';
        else if (memory >= 4 && cores >= 4) caps.tier = 'high';
        else if (memory >= 2 && cores >= 2) caps.tier = 'mid';
        else caps.tier = 'low';

        return Object.freeze(caps);
    })();

    // ─── 1. INTERNAL EVENT BUS (DECOUPLED SUBSYSTEMS) ─────────────────────────
    class EventBus {
        constructor() { this.channels = new Map(); }
        on(channel, handler) {
            if (!this.channels.has(channel)) this.channels.set(channel, new Set());
            this.channels.get(channel).add(handler);
            return () => this.channels.get(channel)?.delete(handler);
        }
        once(channel, handler) {
            const off = this.on(channel, (...args) => { off(); handler(...args); });
            return off;
        }
        emit(channel, ...args) {
            const handlers = this.channels.get(channel);
            if (!handlers) return;
            handlers.forEach(h => { try { h(...args); } catch(e) { console.warn(`[EventBus:${channel}]`, e); } });
        }
        clear() { this.channels.clear(); }
    }

    // ─── 2. SCHEDULER (PRIORITY-BASED TASK QUEUE) ─────────────────────────────
    const Scheduler = {
        critical(cb) {
            if (Capabilities.schedulerPostTask) return scheduler.postTask(cb, { priority: 'user-blocking' });
            queueMicrotask(cb);
        },
        normal(cb) {
            if (Capabilities.schedulerPostTask) return scheduler.postTask(cb, { priority: 'user-visible' });
            setTimeout(cb, 0);
        },
        idle(cb, timeout = 2000) {
            if (Capabilities.schedulerPostTask) return scheduler.postTask(cb, { priority: 'background' });
            if (Capabilities.requestIdleCallback) return requestIdleCallback(cb, { timeout });
            setTimeout(cb, 16);
        },
        microtask(cb) { queueMicrotask(cb); },
    };

    // ─── 3. ZERO-LEAK REGISTRY (AbortController + WeakRef + Named Slots) ──────
    class LifecycleRegistry {
        constructor() {
            this.controller = Capabilities.abortController ? new AbortController() : null;
            this.intervals = new Set();
            this.namedTimeouts = new Map();
            this.namedRafs = new Map();
            this.observers = new Set();
            this.cleanupTasks = new Set();
            this.eventLog = []; // for diagnostics
        }
        get signal() { return this.controller?.signal; }
        listen(target, event, handler, options = {}) {
            if (!target) return () => {};
            const opts = typeof options === 'object' ? { ...options, signal: this.signal } : { signal: this.signal };
            try { target.addEventListener(event, handler, opts); } catch { target.addEventListener(event, handler, options); }
            return () => { try { target.removeEventListener(event, handler, opts); } catch {} };
        }
        setTimeout(key, cb, ms) {
            if (this.namedTimeouts.has(key)) clearTimeout(this.namedTimeouts.get(key));
            const id = setTimeout(() => { this.namedTimeouts.delete(key); cb(); }, ms);
            this.namedTimeouts.set(key, id);
            return id;
        }
        clearTimeout(key) {
            if (this.namedTimeouts.has(key)) { clearTimeout(this.namedTimeouts.get(key)); this.namedTimeouts.delete(key); }
        }
        setRaf(key, cb) {
            if (this.namedRafs.has(key)) cancelAnimationFrame(this.namedRafs.get(key));
            const id = requestAnimationFrame(t => { this.namedRafs.delete(key); cb(t); });
            this.namedRafs.set(key, id);
            return id;
        }
        clearRaf(key) {
            if (this.namedRafs.has(key)) { cancelAnimationFrame(this.namedRafs.get(key)); this.namedRafs.delete(key); }
        }
        interval(cb, ms) { const id = setInterval(cb, ms); this.intervals.add(id); return id; }
        observe(observer) { this.observers.add(observer); return observer; }
        addCleanup(fn) { this.cleanupTasks.add(fn); }
        destroy() {
            try { this.controller?.abort(); } catch {}
            this.intervals.forEach(clearInterval);
            this.namedTimeouts.forEach(clearTimeout);
            this.namedRafs.forEach(cancelAnimationFrame);
            this.observers.forEach(o => { try { o.disconnect(); } catch {} });
            this.cleanupTasks.forEach(fn => { try { fn(); } catch {} });
            this.intervals.clear();
            this.namedTimeouts.clear();
            this.namedRafs.clear();
            this.observers.clear();
            this.cleanupTasks.clear();
        }
    }

    const Registry = new LifecycleRegistry();
    const Bus = new EventBus();

    // ─── 4. ERROR TAXONOMY ────────────────────────────────────────────────────
    const ErrorTaxonomy = {
        NETWORK_STALL: { code: 'E_NET_STALL', severity: 'warn', recoverable: true },
        NETWORK_OFFLINE: { code: 'E_NET_OFFLINE', severity: 'warn', recoverable: true },
        MEDIA_DECODE_ERROR: { code: 'E_DECODE', severity: 'error', recoverable: true },
        MEDIA_ABORTED: { code: 'E_ABORT', severity: 'info', recoverable: true },
        SOURCE_UNSUPPORTED: { code: 'E_SOURCE', severity: 'error', recoverable: false },
        BUFFER_UNDERFLOW: { code: 'E_BUFFER', severity: 'warn', recoverable: true },
        AUDIO_CONTEXT_SUSPENDED: { code: 'E_AUDIO_SUSP', severity: 'info', recoverable: true },
        AUDIO_CONTEXT_FAILED: { code: 'E_AUDIO_FAIL', severity: 'warn', recoverable: false },
        DRM_FAILURE: { code: 'E_DRM', severity: 'error', recoverable: false },
        FULLSCREEN_DENIED: { code: 'E_FS', severity: 'info', recoverable: false },
        SUBTITLE_PARSE: { code: 'E_VTT', severity: 'warn', recoverable: false },
        WORKER_FAILURE: { code: 'E_WORKER', severity: 'warn', recoverable: false },
    };

    // ─── 5. WORKERIZED TELEMETRY (Chunked Cursor + Exponential Backoff) ───────
    const telemetryWorkerCode = `
        const DB_NAME = 'TitaniumQuantum_v12';
        const STORE = 'analytics';
        const CHUNK_SIZE = 50;
        let db = null;
        let backoff = 1000;
        const MAX_BACKOFF = 60000;

        function openDB() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = e => {
                    const d = e.target.result;
                    if (!d.objectStoreNames.contains(STORE)) {
                        const store = d.createObjectStore(STORE, { keyPath: '_id', autoIncrement: true });
                        store.createIndex('ts', 'timestamp');
                    }
                };
                req.onsuccess = e => resolve(e.target.result);
                req.onerror = e => reject(e.target.error);
            });
        }

        async function init() { try { db = await openDB(); } catch(e) { self.postMessage({ type: 'ERROR', error: 'DB_INIT' }); } }

        async function push(payload) {
            if (!db) return;
            try {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).add({ ...payload, timestamp: Date.now() });
            } catch(e) {}
        }

        async function flushChunk(apiUrl) {
            if (!db) return false;
            return new Promise(resolve => {
                const tx = db.transaction(STORE, 'readwrite');
                const store = tx.objectStore(STORE);
                const req = store.openCursor();
                const batch = [];
                const keys = [];
                req.onsuccess = async (ev) => {
                    const cursor = ev.target.result;
                    if (cursor && batch.length < CHUNK_SIZE) {
                        batch.push(cursor.value);
                        keys.push(cursor.primaryKey);
                        cursor.continue();
                    } else {
                        if (!batch.length) return resolve(true);
                        try {
                            const res = await fetch(apiUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(batch),
                                keepalive: true
                            });
                            if (res.ok) {
                                const dtx = db.transaction(STORE, 'readwrite');
                                const dstore = dtx.objectStore(STORE);
                                keys.forEach(k => dstore.delete(k));
                                backoff = 1000;
                                resolve(true);
                            } else { resolve(false); }
                        } catch(e) { resolve(false); }
                    }
                };
                req.onerror = () => resolve(false);
            });
        }

        async function flushAll(apiUrl) {
            let ok = true;
            while (ok) {
                ok = await flushChunk(apiUrl);
                if (!ok) {
                    setTimeout(() => flushAll(apiUrl), backoff);
                    backoff = Math.min(MAX_BACKOFF, backoff * 2);
                    break;
                }
            }
        }

        init();
        self.onmessage = (e) => {
            const { type, payload, apiUrl } = e.data;
            if (type === 'PUSH') push(payload);
            else if (type === 'FLUSH') flushAll(apiUrl);
            else if (type === 'PING') self.postMessage({ type: 'PONG' });
        };
    `;

    // ─── 6. SUBTITLE ENGINE (Binary Search + DOM-Safe + Cue Cache) ────────────
    class SubtitleEngine {
        constructor(container) {
            this.container = container;
            this.cues = [];
            this.lastIndex = -1;
            this.lastTime = -1;
            this.visible = false;
            this.fragmentCache = new Map();
        }
        async loadVTT(url) {
            try {
                const res = await fetch(url, { signal: Registry.signal });
                const text = await res.text();
                this.cues = this._parse(text);
                this.lastIndex = -1;
                Bus.emit('subtitles:loaded', { count: this.cues.length });
            } catch(e) {
                Bus.emit('error', ErrorTaxonomy.SUBTITLE_PARSE, e);
            }
        }
        _parse(data) {
            const cues = [];
            const lines = data.replace(/\r/g, '').split('\n');
            let i = 0;
            while (i < lines.length) {
                const m = lines[i].match(/(\d{1,2}):?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):?(\d{2}):(\d{2})[.,](\d{3})/);
                if (m) {
                    const start = (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
                    const end = (+m[5] || 0) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
                    const text = [];
                    i++;
                    while (i < lines.length && lines[i].trim() !== '') { text.push(lines[i]); i++; }
                    cues.push({ start, end, text: text.join('\n') });
                }
                i++;
            }
            cues.sort((a, b) => a.start - b.start);
            return cues;
        }
        _binarySearch(time) {
            let lo = 0, hi = this.cues.length - 1, ans = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const c = this.cues[mid];
                if (time < c.start) hi = mid - 1;
                else if (time > c.end) lo = mid + 1;
                else { ans = mid; break; }
            }
            return ans;
        }
        update(time) {
            if (!this.cues.length || !this.container) return;
            if (Math.abs(time - this.lastTime) < 0.05) return;
            this.lastTime = time;
            const idx = this._binarySearch(time);
            if (idx === this.lastIndex) return;
            this.lastIndex = idx;
            // DOM-safe rendering (no innerHTML injection)
            while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
            if (idx === -1) {
                if (this.visible) { this.container.style.opacity = '0'; this.visible = false; }
                return;
            }
            const cue = this.cues[idx];
            const lines = cue.text.split('\n');
            lines.forEach((line, i) => {
                if (i > 0) this.container.appendChild(document.createElement('br'));
                const span = document.createElement('span');
                span.textContent = line; // SAFE: textContent prevents injection
                this.container.appendChild(span);
            });
            if (!this.visible) { this.container.style.opacity = '1'; this.visible = true; }
        }
        clear() {
            this.cues = [];
            this.lastIndex = -1;
            if (this.container) {
                while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
            }
        }
    }

    // ─── 7. THERMAL & PERFORMANCE GOVERNOR ────────────────────────────────────
    class ThermalGovernor {
        constructor() {
            this.fps = 60;
            this.dropRate = 0;
            this.thermalLevel = 'normal'; // normal, warm, hot, critical
            this.batteryLevel = 1;
            this.charging = true;
            this.dataSaver = false;
            this.frameTimes = [];
            this.lastDecoded = 0;
            this.lastDropped = 0;
            this._initBattery();
            this._initNetwork();
        }
        async _initBattery() {
            if (!Capabilities.battery) return;
            try {
                const bat = await navigator.getBattery();
                const update = () => {
                    this.batteryLevel = bat.level;
                    this.charging = bat.charging;
                    this._reassess();
                };
                bat.addEventListener('levelchange', update);
                bat.addEventListener('chargingchange', update);
                update();
            } catch {}
        }
        _initNetwork() {
            if (!Capabilities.networkInfo) return;
            const conn = navigator.connection;
            const update = () => {
                this.dataSaver = conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType);
                this._reassess();
            };
            conn.addEventListener?.('change', update);
            update();
        }
        sample(video) {
            if (!video?.getVideoPlaybackQuality) return;
            const q = video.getVideoPlaybackQuality();
            const decDelta = q.totalVideoFrames - this.lastDecoded;
            const dropDelta = q.droppedVideoFrames - this.lastDropped;
            this.lastDecoded = q.totalVideoFrames;
            this.lastDropped = q.droppedVideoFrames;
            this.fps = decDelta;
            this.dropRate = decDelta > 0 ? dropDelta / decDelta : 0;
            this._reassess();
        }
        _reassess() {
            let level = 'normal';
            if (this.dropRate > 0.15 || this.fps < 20) level = 'critical';
            else if (this.dropRate > 0.08 || this.fps < 30) level = 'hot';
            else if (this.dropRate > 0.03 || (this.batteryLevel < 0.15 && !this.charging)) level = 'warm';
            if (level !== this.thermalLevel) {
                const old = this.thermalLevel;
                this.thermalLevel = level;
                Bus.emit('thermal:change', { old, level });
            }
        }
        getProfile() {
            return {
                ambient: this.thermalLevel === 'normal',
                ambientResolution: this.thermalLevel === 'normal' ? 128 : this.thermalLevel === 'warm' ? 64 : 32,
                ambientFPS: this.thermalLevel === 'normal' ? 30 : this.thermalLevel === 'warm' ? 15 : 8,
                blur: this.thermalLevel === 'normal' || this.thermalLevel === 'warm',
                debugUpdateMs: this.thermalLevel === 'critical' ? 2000 : 1000,
                uiUpdateMs: this.thermalLevel === 'critical' ? 500 : 250,
            };
        }
    }

    // ─── 8. AMBIENT GRAPHICS ENGINE (Multi-pass + Adaptive) ───────────────────
    class AmbientEngine {
        constructor(container, video, governor) {
            this.container = container;
            this.video = video;
            this.governor = governor;
            this.canvas = null;
            this.ctx = null;
            this.offscreen = null;
            this.offCtx = null;
            this.enabled = true;
            this.lastDraw = 0;
            this.rvfcHandle = null;
        }
        mount() {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'tq-ambient';
            this.canvas.width = 128; this.canvas.height = 72;
            if (Capabilities.offscreenCanvas) {
                try {
                    this.offscreen = new OffscreenCanvas(128, 72);
                    this.offCtx = this.offscreen.getContext('2d', { alpha: false, desynchronized: true });
                    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
                } catch { this.ctx = this.canvas.getContext('2d', { alpha: false }); }
            } else {
                this.ctx = this.canvas.getContext('2d', { alpha: false });
            }
            this.container.prepend(this.canvas);
            this._startSync();
        }
        _startSync() {
            if (Capabilities.rvfc) {
                const cb = () => {
                    this._draw();
                    if (this.video && !this.video.paused) {
                        this.rvfcHandle = this.video.requestVideoFrameCallback(cb);
                    }
                };
                this.rvfcHandle = this.video.requestVideoFrameCallback(cb);
            }
        }
        _draw() {
            if (!this.enabled || document.hidden) return;
            const profile = this.governor.getProfile();
            if (!profile.ambient) {
                if (this.canvas) this.canvas.style.opacity = '0';
                return;
            }
            const now = performance.now();
            const minInterval = 1000 / profile.ambientFPS;
            if (now - this.lastDraw < minInterval) return;
            this.lastDraw = now;
            const res = profile.ambientResolution;
            if (this.canvas.width !== res) {
                this.canvas.width = res;
                this.canvas.height = Math.round(res * 9 / 16);
                if (this.offscreen) {
                    this.offscreen.width = res;
                    this.offscreen.height = Math.round(res * 9 / 16);
                }
            }
            const target = this.offCtx || this.ctx;
            try {
                target.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                if (this.offCtx && this.ctx) {
                    this.ctx.drawImage(this.offscreen, 0, 0);
                }
            } catch {}
            this.canvas.style.opacity = profile.blur ? '0.6' : '0.3';
            this.canvas.classList.toggle('tq-ambient-noblur', !profile.blur);
        }
        setEnabled(v) {
            this.enabled = v;
            if (this.canvas) this.canvas.style.display = v ? '' : 'none';
        }
        destroy() {
            if (this.rvfcHandle && this.video.cancelVideoFrameCallback) {
                try { this.video.cancelVideoFrameCallback(this.rvfcHandle); } catch {}
            }
            this.canvas?.remove();
        }
    }

    // ─── 9. AUDIO ENGINE (10-Band EQ + Compressor + Boost + Stereo Pan) ───────
    class AudioEngine {
        constructor(video) {
            this.video = video;
            this.ctx = null;
            this.src = null;
            this.gain = null;
            this.compressor = null;
            this.bands = [];
            this.panner = null;
            this.analyser = null;
            this.active = false;
        }
        init() {
            if (this.active || !Capabilities.webAudio) return false;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.src = this.ctx.createMediaElementSource(this.video);
                this.compressor = this.ctx.createDynamicsCompressor();
                this.compressor.threshold.value = -24;
                this.compressor.ratio.value = 12;
                this.compressor.attack.value = 0.003;
                this.compressor.release.value = 0.25;
                this.compressor.knee.value = 30;
                this.gain = this.ctx.createGain();
                this.panner = this.ctx.createStereoPanner();
                this.analyser = this.ctx.createAnalyser();
                this.analyser.fftSize = 256;
                const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
                let prev = this.src;
                this.bands = freqs.map((freq, i) => {
                    const f = this.ctx.createBiquadFilter();
                    f.type = i === 0 ? 'lowshelf' : i === freqs.length - 1 ? 'highshelf' : 'peaking';
                    f.frequency.value = freq;
                    f.Q.value = 1.414;
                    f.gain.value = 0;
                    prev.connect(f);
                    prev = f;
                    return f;
                });
                prev.connect(this.panner);
                this.panner.connect(this.gain);
                this.gain.connect(this.compressor);
                this.compressor.connect(this.analyser);
                this.analyser.connect(this.ctx.destination);
                this.active = true;
                Bus.emit('audio:ready');
                return true;
            } catch(e) {
                Bus.emit('error', ErrorTaxonomy.AUDIO_CONTEXT_FAILED, e);
                return false;
            }
        }
        async resume() {
            if (this.ctx?.state === 'suspended') {
                try { await this.ctx.resume(); } catch {}
            }
        }
        setVolume(level) {
            if (!this.active) return false;
            this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
            return true;
        }
        setPan(value) {
            if (!this.active) return;
            this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), this.ctx.currentTime, 0.1);
        }
        applyEQ(gains) {
            if (!this.active) return;
            gains.forEach((g, i) => {
                if (this.bands[i]) this.bands[i].gain.setTargetAtTime(g, this.ctx.currentTime, 0.2);
            });
        }
        getSpectrum() {
            if (!this.analyser) return null;
            const data = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(data);
            return data;
        }
        destroy() {
            try { this.ctx?.close(); } catch {}
            this.ctx = null; this.active = false;
        }
    }

    const EQ_PRESETS = {
        flat:        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bassBoost:   [7, 6, 4, 2, 0, 0, 0, 0, 0, 0],
        trebleBoost: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
        vocal:       [-3, -2, 0, 2, 4, 5, 4, 2, 0, -1],
        cinematic:   [6, 5, 3, 0, -1, 0, 2, 4, 5, 6],
        rock:        [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
        electronic:  [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
        podcast:     [-4, -3, -1, 2, 4, 4, 3, 1, -1, -2],
        nightMode:   [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2],
    };

    // ─── 10. MODE PROFILES ────────────────────────────────────────────────────
    const MODE_PROFILES = {
        cinema:      { ambient: true,  blur: true,  bufferGoal: 60,  eq: 'cinematic',  brightness: 1.0 },
        batterySaver:{ ambient: false, blur: false, bufferGoal: 20,  eq: 'flat',       brightness: 0.85 },
        dataSaver:   { ambient: false, blur: false, bufferGoal: 15,  eq: 'flat',       brightness: 1.0 },
        ultraSmooth: { ambient: true,  blur: true,  bufferGoal: 90,  eq: 'flat',       brightness: 1.0 },
        audioOnly:   { ambient: false, blur: false, bufferGoal: 30,  eq: 'flat',       brightness: 0.0 },
        standard:    { ambient: true,  blur: true,  bufferGoal: 30,  eq: 'flat',       brightness: 1.0 },
    };

    // ─── 11. GESTURE PHYSICS (Inertial + Velocity + Haptic Thresholds) ────────
    class GesturePhysics {
        constructor(container, video, callbacks) {
            this.container = container;
            this.video = video;
            this.cb = callbacks;
            this.active = false;
            this.lock = null;
            this.startX = 0; this.startY = 0;
            this.lastX = 0; this.lastY = 0;
            this.lastT = 0;
            this.vx = 0; this.vy = 0;
            this.startTime = 0;
            this.startVol = 0;
            this.startBright = 0;
            this.target = null;
            this.hapticBudget = 3;
        }
        _haptic(ms) {
            if (Capabilities.vibrate && this.hapticBudget > 0) {
                try { navigator.vibrate(ms); this.hapticBudget--; } catch {}
            }
        }
        start(e) {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            this.startX = this.lastX = t.clientX;
            this.startY = this.lastY = t.clientY;
            this.lastT = performance.now();
            this.startTime = this.video.currentTime;
            this.startVol = this.cb.getVolume();
            this.startBright = this.cb.getBrightness();
            this.lock = null;
            this.active = false;
            this.vx = this.vy = 0;
            this.hapticBudget = 3;
        }
        move(e) {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            const now = performance.now();
            const dt = Math.max(1, now - this.lastT);
            this.vx = (t.clientX - this.lastX) / dt;
            this.vy = (t.clientY - this.lastY) / dt;
            this.lastX = t.clientX; this.lastY = t.clientY; this.lastT = now;
            const dx = t.clientX - this.startX;
            const dy = t.clientY - this.startY;
            if (!this.lock) {
                if (Math.abs(dx) > 18 || Math.abs(dy) > 18) {
                    this.lock = Math.abs(dx) > Math.abs(dy) ? 'seek' : 'vertical';
                    this.active = true;
                    this._haptic(8);
                }
                return;
            }
            e.preventDefault();
            if (this.lock === 'seek') {
                const w = this.container.offsetWidth || window.innerWidth;
                // velocity-aware seek with easing
                const linear = (dx / w) * 90;
                const velocityBonus = Math.sign(this.vx) * Math.min(15, Math.abs(this.vx) * 8);
                const offset = linear + velocityBonus * 0.2;
                const target = Math.max(0, Math.min(this.video.duration || 0, this.startTime + offset));
                this.target = target;
                this.cb.onSeek(target);
            } else {
                const isRight = this.startX > (window.innerWidth / 2);
                const delta = -dy / 200;
                if (isRight) {
                    const v = Math.max(0, Math.min(3, this.startVol + delta * 1.5));
                    this.cb.onVolume(v);
                    if (Math.abs(v - 1) < 0.02 || Math.abs(v - 2) < 0.02) this._haptic(5);
                } else {
                    const b = Math.max(0.1, Math.min(2, this.startBright + delta));
                    this.cb.onBrightness(b);
                }
            }
        }
        end() {
            if (!this.active) return;
            if (this.lock === 'seek' && this.target !== null) {
                this.cb.onSeekCommit(this.target);
                this.target = null;
            }
            this.cb.onEnd();
            this.lock = null;
            this.active = false;
        }
    }

    // ─── 12. NATIVE SUBTITLE/PIP/MEDIA SESSION INTEGRATION ────────────────────
    function setupMediaSession(player) {
        if (!Capabilities.mediaSession) return;
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Titanium Quantum Stream' });
        const actions = {
            play: () => player.togglePlay(),
            pause: () => player.togglePlay(),
            seekbackward: e => player.skip(e?.seekOffset ? -e.seekOffset : -10),
            seekforward: e => player.skip(e?.seekOffset ? e.seekOffset : 10),
            seekto: e => { if (e.fastSeek && 'fastSeek' in player.dom.video) player.dom.video.fastSeek(e.seekTime); else player.dom.video.currentTime = e.seekTime; },
            stop: () => { player.dom.video.pause(); player.dom.video.currentTime = 0; },
        };
        for (const [action, handler] of Object.entries(actions)) {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
        }
    }

    // ─── 13. THE PLAYER ───────────────────────────────────────────────────────
    class TitaniumQuantumPlayer {
        constructor() {
            this.dom = {};
            this.audio = null;
            this.ambient = null;
            this.governor = new ThermalGovernor();
            this.subtitles = null;
            this.gesture = null;
            this.telemetryWorker = null;
            this.network = { stallCount: 0, retryCount: 0, lastSave: 0, lastTime: 0, hlsObj: null, dashObj: null, wakelock: null };
            this.stats = { lastUpdate: 0, lastDebug: 0 };
            this.prefs = { volume: 1, muted: false, speed: 1, quality: 'auto', ambient: true, eqPreset: 'flat', mode: 'standard' };
            this.chapters = [];
            this._stateBatch = new Set();
            this._batchScheduled = false;
            this._raw = {
                storageKey: 'TitaniumQuantum_v12',
                playing: false, seeking: false, buffering: false, idle: false,
                fullscreen: false, pip: false, isOnline: navigator.onLine,
                gestureLock: null, hasInteracted: false, debugMode: false,
                currentChapter: null, brightness: 1, currentMsgId: null,
                pageVisible: !document.hidden, frozen: false,
            };
            this.state = new Proxy(this._raw, {
                set: (t, p, v) => {
                    const old = t[p];
                    t[p] = v;
                    if (old !== v) this._batchStateChange(p, v, old);
                    return true;
                }
            });
        }

        async init(videoId = 'dahihPlayer', containerId = 'videoContainer') {
            this.dom.video = document.getElementById(videoId);
            this.dom.container = document.getElementById(containerId);
            if (!this.dom.video || !this.dom.container) {
                console.warn('[TitaniumQuantum] Video or container not found.');
                return;
            }
            this._injectStyles();
            this._bindUI();
            this._loadPrefs();
            this.dom.video.crossOrigin = 'anonymous';
            this.dom.video.preload = 'auto';
            this.dom.video.playsInline = true;
            this.audio = new AudioEngine(this.dom.video);
            this.ambient = new AmbientEngine(this.dom.container, this.dom.video, this.governor);
            this.subtitles = new SubtitleEngine(this.dom.captionsContainer);
            this.gesture = new GesturePhysics(this.dom.container, this.dom.video, {
                getVolume: () => this.prefs.volume,
                getBrightness: () => this.state.brightness,
                onSeek: (t) => this._showOverlay('seek', t),
                onSeekCommit: (t) => { this.dom.video.currentTime = t; },
                onVolume: (v) => { this.setVolume(v); this._showOverlay('volume', v / 3); },
                onBrightness: (b) => { this.state.brightness = b; this.dom.video.style.filter = `brightness(${b})`; this._showOverlay('brightness', b / 2); },
                onEnd: () => this._hideOverlays(),
            });
            this._initWorker();
            this._attachListeners();
            this._wireBus();
            setupMediaSession(this);
            this._setupAccessibility();
            if (this.prefs.ambient) this.ambient.mount();
            this._createDebugHUD();
            this._createBoostBadge();
            this._startBackgroundEngines();
            this._applyPrefs();
            console.log('%c⚡ TitaniumQuantum v12 Apex Edition Online', 'color:#0ea5e9;font-weight:900;font-size:18px;text-shadow:0 0 10px #0ea5e9;');
            console.log('%cTier:', 'color:#fbbf24;font-weight:700', Capabilities.tier, '| Cores:', Capabilities.hardwareConcurrency, '| Memory:', (Capabilities.deviceMemory || '?') + 'GB');
            Bus.emit('player:ready');
        }

        _bindUI() {
            const $ = id => document.getElementById(id);
            Object.assign(this.dom, {
                progress: $('progressContainer'),
                progressBar: $('progressBar'),
                bufferedBar: $('bufferedBar'),
                currentTime: $('currentTimeDisplay'),
                duration: $('durationDisplay'),
                speedBtn: $('speedBtn'),
                muteBtn: $('muteBtn'),
                playBtn: $('centerPlay'),
                volumeBar: $('volumeBar'),
                volumeFill: $('volumeBarFill'),
                chapterEl: $('chapterDisplay'),
                tapLeft: $('tapLeft'),
                tapRight: $('tapRight'),
                captionsContainer: $('captionsContainer') || (() => {
                    const c = document.createElement('div');
                    c.className = 'tq-captions';
                    this.dom.container.appendChild(c);
                    return c;
                })(),
            });
        }

        _initWorker() {
            if (!Capabilities.worker || !Capabilities.blob || !Capabilities.indexedDB) return;
            try {
                const blob = new Blob([telemetryWorkerCode], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                this.telemetryWorker = new Worker(url);
                this.telemetryWorker.onmessage = e => Bus.emit('worker:msg', e.data);
                this.telemetryWorker.onerror = e => Bus.emit('error', ErrorTaxonomy.WORKER_FAILURE, e);
                Registry.addCleanup(() => URL.revokeObjectURL(url));
            } catch (e) { Bus.emit('error', ErrorTaxonomy.WORKER_FAILURE, e); }
        }

        _wireBus() {
            Bus.on('thermal:change', ({ level }) => {
                if (level === 'critical') this.toast(`⚠️ تخفيف الأداء — وضع حماية`, 'warning');
                if (level === 'normal') this.toast(`✅ الأداء عاد طبيعي`, 'info');
            });
            Bus.on('error', (taxonomy, raw) => {
                console.warn(`[TQ:${taxonomy.code}]`, raw);
                if (taxonomy.severity === 'error') this.toast(`❌ ${taxonomy.code}`, 'error');
            });
            Bus.on('worker:msg', (msg) => { if (msg.type === 'ERROR') Bus.emit('error', ErrorTaxonomy.WORKER_FAILURE, msg.error); });
        }

        _batchStateChange(prop, val, old) {
            this._stateBatch.add({ prop, val, old });
            if (this._batchScheduled) return;
            this._batchScheduled = true;
            queueMicrotask(() => {
                const changes = Array.from(this._stateBatch);
                this._stateBatch.clear();
                this._batchScheduled = false;
                changes.forEach(c => this._applyStateChange(c.prop, c.val, c.old));
            });
        }

        _applyStateChange(prop, val, old) {
            if (!this.dom.container) return;
            switch (prop) {
                case 'playing':
                    val ? this._startRenderLoop() : this._stopRenderLoop();
                    if (this.dom.playBtn) this.dom.playBtn.classList.toggle('is-visible', !val);
                    if (Capabilities.mediaSession) navigator.mediaSession.playbackState = val ? 'playing' : 'paused';
                    this._resetIdle();
                    val ? this._acquireWakeLock() : this._releaseWakeLock();
                    break;
                case 'buffering':
                    this.dom.container.classList.toggle('is-buffering', val);
                    if (val) Registry.clearTimeout('idleTimer');
                    break;
                case 'idle':
                    this.dom.container.classList.toggle('is-idle', val);
                    break;
                case 'seeking':
                    this.dom.container.classList.toggle('is-seeking', val);
                    if (!val && this.state.playing) this._startRenderLoop();
                    break;
                case 'fullscreen':
                    this.dom.container.classList.toggle('is-fullscreen', val);
                    if (Capabilities.screenOrientation) {
                        try { val ? screen.orientation.lock('landscape').catch(()=>{}) : screen.orientation.unlock(); } catch {}
                    }
                    break;
                case 'debugMode':
                    if (this.dom.debugHud) this.dom.debugHud.style.display = val ? 'block' : 'none';
                    break;
                case 'pageVisible':
                    if (!val) this._flushTelemetry();
                    break;
                case 'frozen':
                    if (val) { this.dom.video.pause(); this._flushTelemetry(); }
                    break;
            }
        }

        async loadMedia(src, type, msgId = null, chapters = [], subtitlesUrl = null) {
            this.state.currentMsgId = msgId;
            this.chapters = chapters;
            this.state.buffering = true;
            this.network.retryCount = 0;
            if (subtitlesUrl) this.subtitles.loadVTT(subtitlesUrl); else this.subtitles.clear();
            if (this.network.hlsObj) { try { this.network.hlsObj.destroy(); } catch {} this.network.hlsObj = null; }
            if (this.network.dashObj) { try { this.network.dashObj.reset(); } catch {} this.network.dashObj = null; }
            this.dom.video.pause();
            const isHls = type === 'application/x-mpegURL' || src.includes('.m3u8');
            const isDash = type === 'application/dash+xml' || src.includes('.mpd');
            if (isHls) {
                if (Capabilities.hls && Hls.isSupported()) {
                    const profile = MODE_PROFILES[this.prefs.mode] || MODE_PROFILES.standard;
                    this.network.hlsObj = new Hls({
                        maxBufferLength: profile.bufferGoal,
                        maxMaxBufferLength: profile.bufferGoal * 10,
                        capLevelToPlayerSize: true,
                        startLevel: -1,
                        abrEwmaDefaultEstimate: 500000,
                    });
                    this.network.hlsObj.loadSource(src);
                    this.network.hlsObj.attachMedia(this.dom.video);
                    this.network.hlsObj.on(Hls.Events.ERROR, (_, data) => {
                        if (data.fatal) {
                            if (data.type === 'networkError') Bus.emit('error', ErrorTaxonomy.NETWORK_STALL, data);
                            else if (data.type === 'mediaError') Bus.emit('error', ErrorTaxonomy.MEDIA_DECODE_ERROR, data);
                            this._recoverStream();
                        }
                    });
                } else if (this.dom.video.canPlayType('application/vnd.apple.mpegurl')) {
                    this.dom.video.src = src;
                } else {
                    Bus.emit('error', ErrorTaxonomy.SOURCE_UNSUPPORTED);
                }
            } else if (isDash) {
                if (Capabilities.dash) {
                    this.network.dashObj = dashjs.MediaPlayer().create();
                    this.network.dashObj.initialize(this.dom.video, src, false);
                } else {
                    Bus.emit('error', ErrorTaxonomy.SOURCE_UNSUPPORTED);
                }
            } else {
                this.dom.video.src = src;
            }
            this.dom.video.load();
            try { await this.dom.video.play(); }
            catch { this.toast('اضغط للتشغيل', 'info'); }
        }

        // ─── RENDER LOOPS (Split for performance) ────────────────────────────
        _startRenderLoop() {
            const tick = (time) => {
                if (!this.state.playing || document.hidden || this.state.frozen) return;
                this._updateProgress(time);
                this.subtitles?.update(this.dom.video.currentTime);
                Registry.setRaf('mainLoop', tick);
            };
            Registry.setRaf('mainLoop', tick);
            this._startUILoop();
            this._startStatsLoop();
        }
        _startUILoop() {
            const loop = () => {
                if (!this.state.playing || document.hidden) return;
                const profile = this.governor.getProfile();
                this._updateUI();
                Registry.setTimeout('uiLoop', loop, profile.uiUpdateMs);
            };
            Registry.setTimeout('uiLoop', loop, 250);
        }
        _startStatsLoop() {
            const loop = () => {
                if (!this.state.playing || document.hidden) return;
                this.governor.sample(this.dom.video);
                if (this.state.debugMode) this._updateDebugHUD();
                const profile = this.governor.getProfile();
                Registry.setTimeout('statsLoop', loop, profile.debugUpdateMs);
            };
            Registry.setTimeout('statsLoop', loop, 1000);
        }
        _stopRenderLoop() {
            Registry.clearRaf('mainLoop');
            Registry.clearTimeout('uiLoop');
            Registry.clearTimeout('statsLoop');
        }

        _updateProgress() {
            const v = this.dom.video;
            if (!v || !isFinite(v.duration) || this.state.seeking) return;
            const pct = v.currentTime / v.duration;
            if (this.dom.progressBar) this.dom.progressBar.style.transform = `scaleX(${pct})`;
        }

        _updateUI() {
            const v = this.dom.video;
            if (!v || !isFinite(v.duration)) return;
            if (this.dom.currentTime) this.dom.currentTime.textContent = this._formatTime(v.currentTime);
            if (this.dom.duration && this.dom.duration.textContent !== this._formatTime(v.duration)) {
                this.dom.duration.textContent = this._formatTime(v.duration);
            }
            if (this.dom.bufferedBar && v.buffered.length) {
                const end = v.buffered.end(v.buffered.length - 1);
                this.dom.bufferedBar.style.transform = `scaleX(${end / v.duration})`;
            }
            // Chapter detection
            if (this.chapters?.length && this.dom.chapterEl) {
                const ct = v.currentTime;
                const ch = this.chapters.find(c => ct >= c.start && ct < c.end);
                if (ch && ch !== this.state.currentChapter) {
                    this.state.currentChapter = ch;
                    this.dom.chapterEl.textContent = ch.title || '';
                }
            }
        }

        // ─── EVENT LISTENERS ─────────────────────────────────────────────────
        _attachListeners() {
            const v = this.dom.video;
            const l = Registry.listen.bind(Registry);
            l(v, 'play', () => { this.state.playing = true; this.state.hasInteracted = true; if (!this.audio.active) this.audio.init(); this.audio.resume(); });
            l(v, 'pause', () => this.state.playing = false);
            l(v, 'waiting', () => this.state.buffering = true);
            l(v, 'playing', () => { this.state.buffering = false; this.network.retryCount = 0; });
            l(v, 'seeking', () => this.state.seeking = true);
            l(v, 'seeked', () => this.state.seeking = false);
            l(v, 'ended', () => { this.state.playing = false; this._flushTelemetry(); Bus.emit('media:ended'); });
            l(v, 'error', e => { Bus.emit('error', ErrorTaxonomy.MEDIA_DECODE_ERROR, e); this._recoverStream(); });
            l(v, 'loadedmetadata', () => Bus.emit('media:metadata', { duration: v.duration }));
            l(v, 'click', () => this.togglePlay());
            l(v, 'enterpictureinpicture', () => this.state.pip = true);
            l(v, 'leavepictureinpicture', () => this.state.pip = false);
            // Touch gestures
            l(v, 'touchstart', e => this.gesture.start(e), { passive: true });
            l(v, 'touchmove', e => this.gesture.move(e), { passive: false });
            l(v, 'touchend', () => this.gesture.end(), { passive: true });
            l(v, 'wheel', e => this._handleWheel(e), { passive: false });
            // Buttons
            if (this.dom.playBtn) l(this.dom.playBtn, 'click', () => this.togglePlay());
            if (this.dom.muteBtn) l(this.dom.muteBtn, 'click', e => { e.stopPropagation(); this.setVolume(this.dom.video.muted ? 1 : 0); });
            if (this.dom.speedBtn) l(this.dom.speedBtn, 'click', e => { e.stopPropagation(); this.cycleSpeed(); });
            // Progress scrubbing
            if (this.dom.progress) {
                l(this.dom.progress, 'pointerdown', e => {
                    this.state.seeking = true;
                    e.target.setPointerCapture?.(e.pointerId);
                    this._scrubTo(e);
                });
                l(document, 'pointermove', e => { if (this.state.seeking) this._scrubTo(e); }, { passive: false });
                l(document, 'pointerup', e => {
                    if (!this.state.seeking) return;
                    this.state.seeking = false;
                    e.target.releasePointerCapture?.(e.pointerId);
                    if (this.gesture.target !== null) this.dom.video.currentTime = this.gesture.target;
                    this._hideOverlays();
                });
            }
            // Keyboard
            l(document, 'keydown', e => this._handleKeys(e));
            // Fullscreen
            l(document, 'fullscreenchange', () => this.state.fullscreen = !!document.fullscreenElement);
            l(document, 'webkitfullscreenchange', () => this.state.fullscreen = !!document.webkitFullscreenElement);
            // Network
            l(window, 'online', () => { this.state.isOnline = true; this._flushTelemetry(); this.toast('✅ عاد الاتصال'); });
            l(window, 'offline', () => { this.state.isOnline = false; this.toast('❌ أنت الآن دون اتصال', 'error'); Bus.emit('error', ErrorTaxonomy.NETWORK_OFFLINE); });
            // Page Lifecycle
            l(document, 'visibilitychange', () => { this.state.pageVisible = !document.hidden; });
            if (Capabilities.pageLifecycle) {
                l(document, 'freeze', () => this.state.frozen = true);
                l(document, 'resume', () => this.state.frozen = false);
            }
            l(window, 'pagehide', () => this._flushTelemetry());
            l(window, 'beforeunload', () => this._flushTelemetry());
            // Idle orchestration
            l(this.dom.container, 'pointermove', () => this._resetIdle(), { passive: true });
            l(this.dom.container, 'pointerleave', () => { Registry.setTimeout('idleTimer', () => { if (this.state.playing) this.state.idle = true; }, 1500); });
            // Tap zones
            if (this.dom.tapLeft) l(this.dom.tapLeft, 'dblclick', () => this.skip(-10));
            if (this.dom.tapRight) l(this.dom.tapRight, 'dblclick', () => this.skip(10));
        }

        _handleKeys(e) {
            const tag = document.activeElement?.tagName;
            if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement?.isContentEditable || !this.dom.video) return;
            const map = {
                'Space': () => this.togglePlay(),
                'KeyK': () => this.togglePlay(),
                'KeyF': () => this.toggleFullscreen(),
                'KeyM': () => this.setVolume(this.dom.video.muted ? 1 : 0),
                'KeyP': () => this.togglePiP(),
                'KeyD': () => this.state.debugMode = !this.state.debugMode,
                'KeyE': () => this.cycleEQ(),
                'KeyC': () => this.cycleMode(),
                'KeyJ': () => this.skip(-10),
                'KeyL': () => this.skip(10),
                'ArrowRight': () => this.skip(e.shiftKey ? 30 : 5),
                'ArrowLeft': () => this.skip(e.shiftKey ? -30 : -5),
                'ArrowUp': () => this.setVolume(this.prefs.volume + 0.1),
                'ArrowDown': () => this.setVolume(this.prefs.volume - 0.1),
                'Comma': () => this.adjustSpeed(-0.25),
                'Period': () => this.adjustSpeed(0.25),
                'Digit0': () => { this.dom.video.currentTime = 0; },
                'Home': () => { this.dom.video.currentTime = 0; },
                'End': () => { this.dom.video.currentTime = this.dom.video.duration; },
            };
            // Number keys for percentage seek
            for (let i = 1; i <= 9; i++) {
                if (e.code === `Digit${i}`) {
                    e.preventDefault();
                    this.dom.video.currentTime = (this.dom.video.duration || 0) * (i / 10);
                    return;
                }
            }
            if (map[e.code]) { e.preventDefault(); map[e.code](); }
        }

        _handleWheel(e) {
            e.preventDefault();
            if (e.target.closest('#progressContainer')) this.skip(e.deltaY < 0 ? 5 : -5);
            else this.setVolume(this.prefs.volume + (e.deltaY < 0 ? 0.05 : -0.05));
        }

        _scrubTo(e) {
            e.preventDefault();
            const rect = this.dom.progress.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.gesture.target = pct * this.dom.video.duration;
            if (this.dom.progressBar) this.dom.progressBar.style.transform = `scaleX(${pct})`;
            this._showOverlay('seek', this.gesture.target);
        }

        // ─── BACKGROUND ENGINES ──────────────────────────────────────────────
        _startBackgroundEngines() {
            // Stall detection
            Registry.interval(() => {
                if (!this.state.playing || this.state.seeking || this.state.buffering || !this.dom.video) return;
                const ct = this.dom.video.currentTime;
                if (ct === this.network.lastTime && !this.dom.video.paused) {
                    this.network.stallCount++;
                    if (this.network.stallCount >= 3) {
                        Bus.emit('error', ErrorTaxonomy.NETWORK_STALL);
                        this._recoverStream();
                        this.network.stallCount = 0;
                    }
                } else this.network.stallCount = 0;
                this.network.lastTime = ct;
            }, 2500);
            // Telemetry push
            Registry.listen(this.dom.video, 'timeupdate', () => {
                if (!this.state.playing || this.state.seeking || !this.state.currentMsgId) return;
                const ct = Math.floor(this.dom.video.currentTime);
                if (Math.abs(ct - this.network.lastSave) >= 10) {
                    this.network.lastSave = ct;
                    const payload = { msgId: this.state.currentMsgId, time: ct, dur: this.dom.video.duration };
                    if (this.telemetryWorker) this.telemetryWorker.postMessage({ type: 'PUSH', payload });
                }
            });
            // Periodic flush attempt
            Registry.interval(() => { if (this.state.isOnline) this._flushTelemetry(); }, 30000);
        }
        _flushTelemetry() {
            if (this.state.isOnline && this.telemetryWorker) {
                this.telemetryWorker.postMessage({ type: 'FLUSH', apiUrl: '/api/sync/batch' });
            }
        }

        _recoverStream() {
            if (!this.dom.video?.src && !this.network.hlsObj) return;
            if (this.network.retryCount >= 5) { this.toast('🚨 فشل البث النهائي', 'error'); return; }
            this.network.retryCount++;
            const t = this.dom.video.currentTime;
            const wasPlaying = this.state.playing;
            this.toast(`🔄 جاري إصلاح البث (${this.network.retryCount}/5)`, 'warning');
            const delay = Math.min(8000, 500 * Math.pow(2, this.network.retryCount));
            Registry.setTimeout('streamRecover', () => {
                if (this.network.hlsObj) {
                    try { this.network.hlsObj.recoverMediaError(); } catch {}
                } else {
                    this.dom.video.pause();
                    this.dom.video.load();
                    const onReady = () => {
                        this.dom.video.currentTime = t;
                        if (wasPlaying) this.dom.video.play().catch(()=>{});
                        this.dom.video.removeEventListener('loadedmetadata', onReady);
                    };
                    this.dom.video.addEventListener('loadedmetadata', onReady);
                }
            }, delay);
        }

        // ─── PUBLIC API ──────────────────────────────────────────────────────
        togglePlay() {
            if (!this.dom.video) return;
            if (!this.state.hasInteracted) { this.state.hasInteracted = true; this.audio.init(); }
            this.audio.resume();
            this.dom.video.paused ? this.dom.video.play().catch(()=>{}) : this.dom.video.pause();
        }
        skip(sec) {
            if (!this.dom.video || !isFinite(this.dom.video.duration)) return;
            this.dom.video.currentTime = Math.max(0, Math.min(this.dom.video.duration, this.dom.video.currentTime + sec));
            this._showOverlay('seek', this.dom.video.currentTime);
            Registry.setTimeout('hideSeek', () => this._hideOverlays(), 500);
            this._resetIdle();
        }
        setVolume(val) {
            const level = Math.max(0, Math.min(3, val));
            this.prefs.volume = level;
            this._savePrefs();
            if (this.audio.active) {
                this.dom.video.volume = 1;
                this.dom.video.muted = level === 0;
                this.audio.setVolume(level);
            } else {
                this.dom.video.volume = Math.min(1, level);
                this.dom.video.muted = level === 0;
            }
            this._updateVolumeUI(level);
        }
        adjustSpeed(delta) {
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
            const idx = speeds.indexOf(this.prefs.speed);
            const newIdx = Math.max(0, Math.min(speeds.length - 1, (idx === -1 ? 3 : idx) + (delta > 0 ? 1 : -1)));
            this.prefs.speed = speeds[newIdx];
            this.dom.video.playbackRate = this.prefs.speed;
            this._savePrefs();
            this.toast(`السرعة ${this.prefs.speed}×`);
            if (this.dom.speedBtn) this.dom.speedBtn.textContent = `${this.prefs.speed}×`;
        }
        cycleSpeed() {
            const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
            const next = speeds[(speeds.indexOf(this.prefs.speed) + 1) % speeds.length];
            this.prefs.speed = next;
            this.dom.video.playbackRate = next;
            this._savePrefs();
            if (this.dom.speedBtn) this.dom.speedBtn.textContent = `${next}×`;
            this.toast(`السرعة ${next}×`);
        }
        cycleEQ() {
            const keys = Object.keys(EQ_PRESETS);
            const next = keys[(keys.indexOf(this.prefs.eqPreset) + 1) % keys.length];
            this.setEQPreset(next);
        }
        setEQPreset(name) {
            const preset = EQ_PRESETS[name] || EQ_PRESETS.flat;
            this.audio.applyEQ(preset);
            this.prefs.eqPreset = name;
            this._savePrefs();
            this.toast(`🎚️ ${name}`);
        }
        cycleMode() {
            const keys = Object.keys(MODE_PROFILES);
            const next = keys[(keys.indexOf(this.prefs.mode) + 1) % keys.length];
            this.setMode(next);
        }
        setMode(name) {
            const profile = MODE_PROFILES[name] || MODE_PROFILES.standard;
            this.prefs.mode = name;
            this.prefs.ambient = profile.ambient;
            this.ambient?.setEnabled(profile.ambient);
            this.setEQPreset(profile.eq);
            this.state.brightness = profile.brightness;
            this.dom.video.style.filter = `brightness(${profile.brightness})`;
            this._savePrefs();
            this.toast(`🎬 ${name}`);
        }
        toggleFullscreen() {
            const el = this.dom.container;
            try {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                } else {
                    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
                }
            } catch (e) { Bus.emit('error', ErrorTaxonomy.FULLSCREEN_DENIED, e); }
        }
        async togglePiP() {
            if (!Capabilities.pictureInPicture) return;
            try {
                if (document.pictureInPictureElement) await document.exitPictureInPicture();
                else await this.dom.video.requestPictureInPicture();
            } catch {}
        }

        async destroy() {
            this._stopRenderLoop();
            this._releaseWakeLock();
            this._flushTelemetry();
            try { this.telemetryWorker?.terminate(); } catch {}
            try { this.network.hlsObj?.destroy(); } catch {}
            try { this.network.dashObj?.reset(); } catch {}
            this.audio?.destroy();
            this.ambient?.destroy();
            this.subtitles?.clear();
            if (this.dom.video) {
                this.dom.video.pause();
                this.dom.video.removeAttribute('src');
                this.dom.video.srcObject = null;
                this.dom.video.load();
            }
            Registry.destroy();
            Bus.clear();
            document.getElementById('titanium-quantum-styles')?.remove();
            console.log('%c🛑 TitaniumQuantum Destroyed', 'color:#ef4444;font-weight:700');
        }

        // ─── UI ──────────────────────────────────────────────────────────────
        _resetIdle() {
            this.state.idle = false;
            Registry.setTimeout('idleTimer', () => {
                if (this.state.playing && !this.state.seeking && !this.state.buffering) this.state.idle = true;
            }, 3000);
        }
        _formatTime(s) {
            if (!isFinite(s)) return '0:00';
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60).toString().padStart(2, '0');
            return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
        }
        _updateVolumeUI(val) {
            if (this.dom.volumeFill) this.dom.volumeFill.style.transform = `scaleX(${Math.min(1, val)})`;
            if (this.dom.muteBtn) {
                const muted = val === 0;
                this.dom.muteBtn.classList.toggle('is-muted', muted);
                this.dom.muteBtn.setAttribute('aria-pressed', String(muted));
            }
            const badge = document.getElementById('tq-boost');
            if (badge) {
                if (val > 1) { badge.classList.add('is-visible'); badge.textContent = `🚀 ${(val * 100).toFixed(0)}%`; }
                else badge.classList.remove('is-visible');
            }
        }
        _showOverlay(type, val) {
            let el = document.getElementById(`tq-${type}`);
            if (!el) {
                el = document.createElement('div');
                el.id = `tq-${type}`;
                el.className = `tq-overlay tq-${type}`;
                this.dom.container.appendChild(el);
            }
            el.classList.add('is-visible');
            if (type === 'seek') {
                while (el.firstChild) el.removeChild(el.firstChild);
                const span = document.createElement('span');
                span.textContent = this._formatTime(val);
                el.appendChild(span);
            } else {
                while (el.firstChild) el.removeChild(el.firstChild);
                const fill = document.createElement('div');
                fill.className = 'tq-bar-fill';
                fill.style.height = `${Math.min(100, val * 100)}%`;
                el.appendChild(fill);
            }
            Registry.setTimeout(`hide_${type}`, () => el.classList.remove('is-visible'), type === 'seek' ? 0 : 800);
        }
        _hideOverlays() {
            this.dom.container.querySelectorAll('.tq-overlay').forEach(el => el.classList.remove('is-visible'));
        }
        toast(msg, type = 'info') {
            let q = document.getElementById('tq-toasts');
            if (!q) { q = document.createElement('div'); q.id = 'tq-toasts'; q.className = 'tq-toasts'; this.dom.container.appendChild(q); }
            if (q.children.length > 2) q.firstElementChild.remove();
            const t = document.createElement('div');
            t.className = `tq-toast tq-${type}`;
            t.textContent = msg;
            q.appendChild(t);
            Registry.setTimeout(`toast_${Date.now()}_${Math.random()}`, () => {
                t.style.opacity = 0;
                setTimeout(() => t.remove(), 300);
            }, 3000);
        }
        _createDebugHUD() {
            this.dom.debugHud = document.createElement('div');
            this.dom.debugHud.id = 'tq-debug';
            this.dom.debugHud.style.display = 'none';
            this.dom.container.appendChild(this.dom.debugHud);
        }
        _createBoostBadge() {
            const b = document.createElement('div');
            b.id = 'tq-boost';
            this.dom.container.appendChild(b);
        }
        _updateDebugHUD() {
            if (!this.dom.debugHud || !this.dom.video) return;
            const v = this.dom.video;
            const q = v.getVideoPlaybackQuality?.() || {};
            const res = `${v.videoWidth}×${v.videoHeight}`;
            const vol = (this.prefs.volume * 100).toFixed(0);
            const buf = v.buffered.length ? `${(v.buffered.end(v.buffered.length-1) - v.currentTime).toFixed(1)}s` : '0s';
            const lines = [
                `▸ TitaniumQuantum v12 — ${Capabilities.tier.toUpperCase()}`,
                `RES ${res}  |  FPS ${this.governor.fps}  |  DROP ${(this.governor.dropRate * 100).toFixed(1)}%`,
                `VOL ${vol}%  |  EQ ${this.prefs.eqPreset}  |  MODE ${this.prefs.mode}`,
                `BUF ${buf}  |  THERMAL ${this.governor.thermalLevel}`,
                `HLS ${!!this.network.hlsObj}  |  DASH ${!!this.network.dashObj}  |  AUDIO ${this.audio.active}`,
                `BAT ${(this.governor.batteryLevel * 100).toFixed(0)}%${this.governor.charging ? '⚡' : ''}  |  NET ${this.state.isOnline ? '✓' : '✗'}`,
            ];
            while (this.dom.debugHud.firstChild) this.dom.debugHud.removeChild(this.dom.debugHud.firstChild);
            lines.forEach(line => {
                const div = document.createElement('div');
                div.textContent = line;
                this.dom.debugHud.appendChild(div);
            });
        }

        async _acquireWakeLock() {
            if (!Capabilities.wakeLock || this.network.wakelock) return;
            try { this.network.wakelock = await navigator.wakeLock.request('screen'); } catch {}
        }
        _releaseWakeLock() {
            try { this.network.wakelock?.release(); } catch {}
            this.network.wakelock = null;
        }

        _setupAccessibility() {
            if (this.dom.progress) {
                this.dom.progress.setAttribute('role', 'slider');
                this.dom.progress.setAttribute('aria-valuemin', '0');
                this.dom.progress.setAttribute('aria-valuemax', '100');
                this.dom.progress.setAttribute('aria-label', 'موضع التشغيل');
                this.dom.progress.tabIndex = 0;
            }
            if (this.dom.playBtn) this.dom.playBtn.setAttribute('aria-label', 'تشغيل/إيقاف');
            if (this.dom.muteBtn) this.dom.muteBtn.setAttribute('aria-label', 'كتم الصوت');
        }

        _loadPrefs() { try { const p = JSON.parse(localStorage.getItem(this._raw.storageKey)); if (p) this.prefs = { ...this.prefs, ...p }; } catch {} }
        _savePrefs() { try { localStorage.setItem(this._raw.storageKey, JSON.stringify(this.prefs)); } catch {} }
        _applyPrefs() {
            if (!this.dom.video) return;
            this.dom.video.playbackRate = this.prefs.speed;
            this.setVolume(this.prefs.volume);
            if (this.dom.speedBtn) this.dom.speedBtn.textContent = `${this.prefs.speed}×`;
        }

        _injectStyles() {
            if (document.getElementById('titanium-quantum-styles')) return;
            const style = document.createElement('style');
            style.id = 'titanium-quantum-styles';
            style.textContent = `
                .tq-ambient {
                    position:absolute; inset:0; width:100%; height:100%;
                    filter:blur(80px) saturate(260%) contrast(125%);
                    transform:scale(1.15); opacity:0.6; pointer-events:none;
                    z-index:-1; transition:opacity 0.5s ease, filter 0.4s ease;
                    will-change:transform, opacity; mix-blend-mode:screen;
                }
                .tq-ambient.tq-ambient-noblur { filter:blur(20px) saturate(180%); transform:scale(1.05); }
                .is-fullscreen video { width:100% !important; height:100% !important; object-fit:cover !important; }
                #progressBar, #bufferedBar { transform-origin:left center; transform:scaleX(0); will-change:transform; pointer-events:none; }
                #bufferedBar { opacity:0.3; background:#fff; }
                .is-seeking * { user-select:none !important; cursor:ew-resize !important; }
                .is-buffering::after {
                    content:''; position:absolute; top:50%; left:50%;
                    width:48px; height:48px; margin:-24px 0 0 -24px;
                    border:3px solid rgba(255,255,255,0.2);
                    border-top-color:#0ea5e9;
                    border-radius:50%; animation:tqSpin 0.8s linear infinite;
                    z-index:1000; pointer-events:none;
                }
                @keyframes tqSpin { to { transform:rotate(360deg); } }

                .tq-captions {
                    position:absolute; bottom:80px; left:0; width:100%;
                    text-align:center; pointer-events:none; opacity:0;
                    transition:opacity 0.2s; z-index:100;
                }
                .tq-captions span {
                    display:inline-block; background:rgba(0,0,0,0.85);
                    color:#fff; padding:6px 14px; font-size:22px; font-weight:700;
                    border-radius:6px; text-shadow:0 2px 6px rgba(0,0,0,0.9);
                    backdrop-filter:blur(6px); line-height:1.4;
                    font-family:system-ui, -apple-system, 'Segoe UI', sans-serif;
                    box-shadow:0 4px 20px rgba(0,0,0,0.4);
                }

                #tq-debug {
                    position:absolute; top:10px; left:10px;
                    background:rgba(0,0,0,0.85); color:#0fffa0;
                    font-family:'SF Mono', Menlo, monospace; font-size:11px;
                    padding:12px 14px; border-radius:8px; z-index:9999;
                    pointer-events:none; backdrop-filter:blur(12px);
                    border:1px solid rgba(15,255,160,0.3);
                    box-shadow:0 0 30px rgba(15,255,160,0.15);
                    line-height:1.6; white-space:pre;
                }
                #tq-debug div:first-child { color:#0ea5e9; font-weight:700; margin-bottom:4px; }

                .tq-toasts {
                    position:absolute; top:20px; left:50%;
                    transform:translateX(-50%); display:flex;
                    flex-direction:column; gap:10px; z-index:9999; pointer-events:none;
                }
                .tq-toast {
                    background:rgba(15,15,20,0.95); color:#fff;
                    padding:12px 24px; border-radius:14px; font-weight:700;
                    backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1);
                    box-shadow:0 10px 40px rgba(0,0,0,0.6);
                    animation:tqIn 0.35s cubic-bezier(0.2,0.8,0.2,1) forwards;
                    transition:opacity 0.3s; font-family:system-ui, sans-serif;
                }
                .tq-error { border-color:rgba(239,68,68,0.5); color:#fca5a5; }
                .tq-warning { border-color:rgba(234,179,8,0.5); color:#fde047; }
                .tq-info { border-color:rgba(14,165,233,0.4); }
                @keyframes tqIn {
                    from { opacity:0; transform:translateY(-24px) scale(0.92); }
                    to { opacity:1; transform:translateY(0) scale(1); }
                }

                .tq-overlay { position:absolute; pointer-events:none; z-index:200; opacity:0; transition:opacity 0.2s; }
                .tq-overlay.is-visible { opacity:1; }
                .tq-seek { top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
                .tq-seek span {
                    background:rgba(0,0,0,0.85); backdrop-filter:blur(14px);
                    padding:18px 36px; border-radius:14px; font-size:36px;
                    font-weight:900; color:#fff; box-shadow:0 12px 40px rgba(0,0,0,0.6);
                    border:1px solid rgba(255,255,255,0.12); font-family:system-ui, sans-serif;
                    letter-spacing:1px;
                }
                .tq-volume, .tq-brightness {
                    top:50%; transform:translateY(-50%); width:6px; height:160px;
                    background:rgba(255,255,255,0.12); border-radius:3px;
                    overflow:hidden; backdrop-filter:blur(8px);
                }
                .tq-volume { right:36px; }
                .tq-brightness { left:36px; }
                .tq-bar-fill {
                    position:absolute; bottom:0; left:0; width:100%;
                    transition:height 0.1s linear;
                }
                .tq-volume .tq-bar-fill { background:linear-gradient(to top, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%); box-shadow:0 0 14px rgba(139,92,246,0.6); }
                .tq-brightness .tq-bar-fill { background:linear-gradient(to top, #f59e0b, #fde047); box-shadow:0 0 14px rgba(253,224,71,0.6); }

                #tq-boost {
                    position:absolute; top:20px; right:20px;
                    background:linear-gradient(135deg, #ef4444, #f97316);
                    color:#fff; padding:6px 14px; border-radius:10px;
                    font-size:12px; font-weight:900; opacity:0;
                    transition:opacity 0.3s; z-index:50;
                    box-shadow:0 6px 20px rgba(239,68,68,0.4);
                    font-family:system-ui, sans-serif;
                }
                #tq-boost.is-visible { opacity:1; animation:tqPulse 1.5s ease-in-out infinite; }
                @keyframes tqPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }

                .is-idle .controls, .is-idle [data-controls] { opacity:0; transition:opacity 0.4s; }
            `;
            document.head.appendChild(style);
        }
    }

    const instance = new TitaniumQuantumPlayer();
    instance.Bus = Bus;
    instance.Capabilities = Capabilities;
    instance.ErrorTaxonomy = ErrorTaxonomy;
    instance.EQ_PRESETS = EQ_PRESETS;
    instance.MODE_PROFILES = MODE_PROFILES;
    return instance;
})();

window.playerEngine = TitaniumQuantum;
window.TitaniumQuantum = TitaniumQuantum;
