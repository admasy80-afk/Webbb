const TitaniumQuantum = (() => {
    'use strict';

    const RingBuffer = class {
        constructor(size) { this.size = size; this.buf = new Array(size); this.head = 0; this.count = 0; }
        push(v) { this.buf[this.head] = v; this.head = (this.head + 1) % this.size; if (this.count < this.size) this.count++; }
        get(i) { return this.buf[(this.head - this.count + i + this.size) % this.size]; }
        last() { return this.count ? this.buf[(this.head - 1 + this.size) % this.size] : null; }
        first() { return this.count ? this.buf[(this.head - this.count + this.size) % this.size] : null; }
        toArray() { const r = []; for (let i = 0; i < this.count; i++) r.push(this.get(i)); return r; }
        forEach(fn) { for (let i = 0; i < this.count; i++) fn(this.get(i), i); }
        reduce(fn, init) { let acc = init; for (let i = 0; i < this.count; i++) acc = fn(acc, this.get(i), i); return acc; }
        clear() { this.head = 0; this.count = 0; }
        get length() { return this.count; }
    };

    const ObjectPool = class {
        constructor(factory, reset, initial = 16, max = 128) {
            this.factory = factory; this.reset = reset; this.pool = []; this.max = max;
            this.acquired = 0; this.created = initial;
            for (let i = 0; i < initial; i++) this.pool.push(factory());
        }
        acquire() { this.acquired++; if (this.pool.length) return this.pool.pop(); this.created++; return this.factory(); }
        release(obj) { this.acquired--; this.reset?.(obj); if (this.pool.length < this.max) this.pool.push(obj); }
        stats() { return { pooled: this.pool.length, acquired: this.acquired, created: this.created }; }
        drain() { this.pool.length = 0; }
    };

    const WeakCache = class {
        constructor(ttlMs = 60000) { this.map = new Map(); this.ttl = ttlMs; }
        set(k, v) { this.map.set(k, { v, t: performance.now() }); }
        get(k) { const e = this.map.get(k); if (!e) return null; if (performance.now() - e.t > this.ttl) { this.map.delete(k); return null; } return e.v; }
        has(k) { return this.get(k) !== null; }
        delete(k) { this.map.delete(k); }
        prune() { const now = performance.now(); for (const [k, e] of this.map) if (now - e.t > this.ttl) this.map.delete(k); }
        clear() { this.map.clear(); }
        get size() { return this.map.size; }
    };

    const Capabilities = (() => {
        const test = (fn) => { try { return !!fn(); } catch { return false; } };
        const caps = {
            rvfc: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            webAudio: !!(window.AudioContext || window.webkitAudioContext),
            webGL: test(() => document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')),
            webGL2: test(() => document.createElement('canvas').getContext('webgl2')),
            webGPU: 'gpu' in navigator,
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
            pageLifecycle: 'onfreeze' in document,
            networkInfo: 'connection' in navigator,
            deviceMemory: 'deviceMemory' in navigator,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            schedulerPostTask: 'scheduler' in window && 'postTask' in window.scheduler,
            requestIdleCallback: 'requestIdleCallback' in window,
            abortController: typeof AbortController !== 'undefined',
            intersectionObserver: 'IntersectionObserver' in window,
            resizeObserver: 'ResizeObserver' in window,
            performanceObserver: 'PerformanceObserver' in window,
            mediaCapabilities: 'mediaCapabilities' in navigator,
            hls: typeof window.Hls !== 'undefined',
            dash: typeof window.dashjs !== 'undefined',
            vibrate: 'vibrate' in navigator,
            battery: 'getBattery' in navigator,
            broadcastChannel: typeof BroadcastChannel !== 'undefined',
            crypto: 'crypto' in window && 'subtle' in window.crypto,
            webCodecs: 'VideoDecoder' in window,
            audioWorklet: !!(window.AudioContext && AudioContext.prototype.audioWorklet),
            userActivation: 'userActivation' in navigator,
            storage: 'storage' in navigator && 'estimate' in navigator.storage,
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            transferableStreams: test(() => { const ts = new TransformStream(); return ts; }),
            compressionStream: typeof CompressionStream !== 'undefined',
            permissions: 'permissions' in navigator,
            badging: 'setAppBadge' in navigator,
            virtualKeyboard: 'virtualKeyboard' in navigator,
            windowControlsOverlay: 'windowControlsOverlay' in navigator,
            pointerEvents: 'PointerEvent' in window,
            cssBackdropFilter: CSS.supports('backdrop-filter', 'blur(10px)') || CSS.supports('-webkit-backdrop-filter', 'blur(10px)'),
            cssContainerQueries: CSS.supports('container-type', 'inline-size'),
        };
        const memory = caps.deviceMemory || 4;
        const cores = caps.hardwareConcurrency;
        if (memory >= 8 && cores >= 8 && caps.webGL2 && caps.webCodecs) caps.tier = 'apex';
        else if (memory >= 4 && cores >= 4 && caps.webGL) caps.tier = 'high';
        else if (memory >= 2 && cores >= 2) caps.tier = 'mid';
        else caps.tier = 'low';
        caps.mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        caps.ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        caps.android = /Android/i.test(navigator.userAgent);
        caps.lowPower = caps.tier === 'low' || (caps.mobile && memory < 4);
        caps.touchOnly = caps.mobile && !window.matchMedia('(pointer: fine)').matches;
        caps.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        caps.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        caps.highDpi = window.devicePixelRatio > 1.5;
        return Object.freeze(caps);
    })();

    class EventBus {
        constructor() { this.channels = new Map(); this.wildcards = new Set(); this.metrics = new Map(); }
        on(channel, handler, priority = 0) {
            if (channel === '*') { this.wildcards.add(handler); return () => this.wildcards.delete(handler); }
            if (!this.channels.has(channel)) this.channels.set(channel, []);
            const list = this.channels.get(channel);
            list.push({ handler, priority });
            list.sort((a, b) => b.priority - a.priority);
            return () => { const idx = list.findIndex(h => h.handler === handler); if (idx >= 0) list.splice(idx, 1); };
        }
        once(channel, handler) { const off = this.on(channel, (...a) => { off(); handler(...a); }); return off; }
        emit(channel, ...args) {
            this.metrics.set(channel, (this.metrics.get(channel) || 0) + 1);
            const h = this.channels.get(channel);
            if (h) for (let i = 0; i < h.length; i++) { try { h[i].handler(...args); } catch(e) {} }
            this.wildcards.forEach(fn => { try { fn(channel, ...args); } catch(e) {} });
        }
        emitAsync(channel, ...args) { return new Promise(r => queueMicrotask(() => { this.emit(channel, ...args); r(); })); }
        clear() { this.channels.clear(); this.wildcards.clear(); this.metrics.clear(); }
        getMetrics() { return Object.fromEntries(this.metrics); }
    }

    class CentralScheduler {
        constructor() {
            this.tasks = new Map();
            this.priorityQueues = { critical: [], high: [], normal: [], low: [], idle: [] };
            this.frameBudget = 8;
            this.running = false;
            this.frameId = null;
            this.lastFrame = 0;
            this.frameCount = 0;
            this.skipCount = 0;
        }
        register(id, fn, options = {}) {
            const task = {
                id, fn,
                priority: options.priority || 'normal',
                budgetMs: options.budget || 1,
                interval: options.interval || 0,
                lastRun: 0,
                runs: 0,
                skips: 0,
                totalMs: 0,
                avgMs: 0,
                paused: false,
                condition: options.condition || (() => true),
            };
            this.tasks.set(id, task);
            this.priorityQueues[task.priority].push(task);
            return () => this.unregister(id);
        }
        unregister(id) {
            const t = this.tasks.get(id);
            if (!t) return;
            const q = this.priorityQueues[t.priority];
            const idx = q.indexOf(t);
            if (idx >= 0) q.splice(idx, 1);
            this.tasks.delete(id);
        }
        pause(id) { const t = this.tasks.get(id); if (t) t.paused = true; }
        resume(id) { const t = this.tasks.get(id); if (t) t.paused = false; }
        setBudget(ms) { this.frameBudget = ms; }
        start() {
            if (this.running) return;
            this.running = true;
            const tick = (now) => {
                if (!this.running) return;
                this.frameCount++;
                const frameStart = performance.now();
                let spent = 0;
                const order = ['critical', 'high', 'normal', 'low', 'idle'];
                for (const prio of order) {
                    const queue = this.priorityQueues[prio];
                    for (let i = 0; i < queue.length; i++) {
                        const t = queue[i];
                        if (t.paused) continue;
                        if (t.interval && now - t.lastRun < t.interval) continue;
                        if (!t.condition()) continue;
                        const remaining = this.frameBudget - spent;
                        if (remaining < t.budgetMs && prio !== 'critical') { t.skips++; this.skipCount++; continue; }
                        const t0 = performance.now();
                        try { t.fn(now); } catch(e) {}
                        const dt = performance.now() - t0;
                        spent += dt;
                        t.lastRun = now;
                        t.runs++;
                        t.totalMs += dt;
                        t.avgMs = t.totalMs / t.runs;
                    }
                }
                this.lastFrame = performance.now() - frameStart;
                this.frameId = requestAnimationFrame(tick);
            };
            this.frameId = requestAnimationFrame(tick);
        }
        stop() { this.running = false; if (this.frameId) cancelAnimationFrame(this.frameId); }
        getStats() {
            const stats = {};
            this.tasks.forEach((t, id) => { stats[id] = { priority: t.priority, runs: t.runs, skips: t.skips, avgMs: t.avgMs.toFixed(3), paused: t.paused }; });
            return { tasks: stats, frameMs: this.lastFrame.toFixed(2), frames: this.frameCount, totalSkips: this.skipCount };
        }
        drainIdle() {
            if (Capabilities.requestIdleCallback) {
                requestIdleCallback(deadline => {
                    const queue = this.priorityQueues.idle;
                    while (deadline.timeRemaining() > 1 && queue.length) {
                        const t = queue.find(x => !x.paused && x.condition());
                        if (!t) break;
                        try { t.fn(performance.now()); } catch {}
                        t.lastRun = performance.now();
                    }
                });
            }
        }
    }

    const Scheduler = {
        critical(cb) { if (Capabilities.schedulerPostTask) return scheduler.postTask(cb, { priority: 'user-blocking' }); queueMicrotask(cb); },
        normal(cb) { if (Capabilities.schedulerPostTask) return scheduler.postTask(cb, { priority: 'user-visible' }); setTimeout(cb, 0); },
        idle(cb) { if (Capabilities.requestIdleCallback) return requestIdleCallback(cb, { timeout: 2000 }); setTimeout(cb, 16); },
        microtask(cb) { queueMicrotask(cb); },
        nextFrame(cb) { return requestAnimationFrame(cb); },
        afterPaint(cb) { requestAnimationFrame(() => requestAnimationFrame(cb)); },
        debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; },
        throttle(fn, wait) {
            let last = 0, pending = null;
            return (...a) => {
                const now = performance.now();
                if (now - last >= wait) { last = now; fn(...a); }
                else { clearTimeout(pending); pending = setTimeout(() => { last = performance.now(); fn(...a); }, wait - (now - last)); }
            };
        },
        rafThrottle(fn) {
            let scheduled = false, lastArgs;
            return (...a) => {
                lastArgs = a;
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => { scheduled = false; fn(...lastArgs); });
            };
        },
        coalesce(fn, wait = 16) {
            let pending = false, args;
            return (...a) => {
                args = a;
                if (pending) return;
                pending = true;
                setTimeout(() => { pending = false; fn(...args); }, wait);
            };
        }
    };

    class LifecycleRegistry {
        constructor() {
            this.controller = Capabilities.abortController ? new AbortController() : null;
            this.intervals = new Set();
            this.namedTimeouts = new Map();
            this.namedRafs = new Map();
            this.observers = new Set();
            this.cleanupTasks = new Set();
            this.workers = new Set();
            this.audioNodes = new Set();
            this.blobUrls = new Set();
            this.bitmaps = new Set();
            this.textures = new Set();
            this.leakStats = { listeners: 0, timers: 0, rafs: 0 };
        }
        get signal() { return this.controller?.signal; }
        listen(target, event, handler, options = {}) {
            if (!target) return () => {};
            const opts = typeof options === 'object' ? { ...options, signal: this.signal } : { signal: this.signal };
            try { target.addEventListener(event, handler, opts); this.leakStats.listeners++; } catch { target.addEventListener(event, handler, options); }
            return () => { try { target.removeEventListener(event, handler, opts); this.leakStats.listeners--; } catch {} };
        }
        setTimeout(key, cb, ms) {
            if (this.namedTimeouts.has(key)) clearTimeout(this.namedTimeouts.get(key));
            const id = setTimeout(() => { this.namedTimeouts.delete(key); this.leakStats.timers--; cb(); }, ms);
            this.namedTimeouts.set(key, id);
            this.leakStats.timers++;
            return id;
        }
        clearTimeout(key) { if (this.namedTimeouts.has(key)) { clearTimeout(this.namedTimeouts.get(key)); this.namedTimeouts.delete(key); this.leakStats.timers--; } }
        setRaf(key, cb) {
            if (this.namedRafs.has(key)) cancelAnimationFrame(this.namedRafs.get(key));
            const id = requestAnimationFrame(t => { this.namedRafs.delete(key); this.leakStats.rafs--; cb(t); });
            this.namedRafs.set(key, id);
            this.leakStats.rafs++;
            return id;
        }
        clearRaf(key) { if (this.namedRafs.has(key)) { cancelAnimationFrame(this.namedRafs.get(key)); this.namedRafs.delete(key); this.leakStats.rafs--; } }
        interval(cb, ms) { const id = setInterval(cb, ms); this.intervals.add(id); return id; }
        observe(o) { this.observers.add(o); return o; }
        addWorker(w) { this.workers.add(w); return w; }
        addAudioNode(n) { this.audioNodes.add(n); return n; }
        addBlobUrl(u) { this.blobUrls.add(u); return u; }
        addBitmap(b) { this.bitmaps.add(b); return b; }
        addTexture(t) { this.textures.add(t); return t; }
        addCleanup(fn) { this.cleanupTasks.add(fn); }
        getLeakReport() {
            return {
                ...this.leakStats,
                intervals: this.intervals.size,
                observers: this.observers.size,
                workers: this.workers.size,
                audioNodes: this.audioNodes.size,
                blobUrls: this.blobUrls.size,
                bitmaps: this.bitmaps.size,
                textures: this.textures.size,
            };
        }
        partialCleanup() {
            this.bitmaps.forEach(b => { try { b.close?.(); } catch {} });
            this.bitmaps.clear();
        }
        destroy() {
            try { this.controller?.abort(); } catch {}
            this.intervals.forEach(clearInterval);
            this.namedTimeouts.forEach(clearTimeout);
            this.namedRafs.forEach(cancelAnimationFrame);
            this.observers.forEach(o => { try { o.disconnect(); } catch {} });
            this.workers.forEach(w => { try { w.terminate(); } catch {} });
            this.audioNodes.forEach(n => { try { n.disconnect(); } catch {} });
            this.blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
            this.bitmaps.forEach(b => { try { b.close?.(); } catch {} });
            this.cleanupTasks.forEach(fn => { try { fn(); } catch {} });
            this.intervals.clear(); this.namedTimeouts.clear(); this.namedRafs.clear();
            this.observers.clear(); this.workers.clear(); this.audioNodes.clear();
            this.blobUrls.clear(); this.bitmaps.clear(); this.textures.clear(); this.cleanupTasks.clear();
        }
    }

    const Registry = new LifecycleRegistry();
    const Bus = new EventBus();
    const Engine = new CentralScheduler();

    const ErrorTaxonomy = Object.freeze({
        NETWORK_STALL: { code: 'E_NET_STALL', severity: 'warn', recoverable: true },
        NETWORK_OFFLINE: { code: 'E_NET_OFFLINE', severity: 'warn', recoverable: true },
        MEDIA_DECODE_ERROR: { code: 'E_DECODE', severity: 'error', recoverable: true },
        MEDIA_ABORTED: { code: 'E_ABORT', severity: 'info', recoverable: true },
        SOURCE_UNSUPPORTED: { code: 'E_SOURCE', severity: 'error', recoverable: false },
        BUFFER_UNDERFLOW: { code: 'E_BUFFER', severity: 'warn', recoverable: true },
        AUDIO_CONTEXT_FAILED: { code: 'E_AUDIO', severity: 'warn', recoverable: false },
        DRM_FAILURE: { code: 'E_DRM', severity: 'error', recoverable: false },
        FULLSCREEN_DENIED: { code: 'E_FS', severity: 'info', recoverable: false },
        SUBTITLE_PARSE: { code: 'E_VTT', severity: 'warn', recoverable: false },
        WORKER_FAILURE: { code: 'E_WORKER', severity: 'warn', recoverable: false },
        GL_CONTEXT_LOST: { code: 'E_GL_LOST', severity: 'warn', recoverable: true },
        FRAME_BUDGET_EXCEEDED: { code: 'E_BUDGET', severity: 'info', recoverable: true },
        MEMORY_PRESSURE: { code: 'E_MEM', severity: 'warn', recoverable: true },
        THERMAL_CRITICAL: { code: 'E_THERMAL', severity: 'warn', recoverable: true },
    });

    const telemetryWorkerCode = `
        const DB='TQ_Hyperion_v17',ST='analytics',HM='heatmap',SE='sessions',PROFILES='profiles',CHUNK=80;
        let db=null,bo=1000;const MAX_BO=60000;
        function open(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,5);
            r.onupgradeneeded=e=>{const d=e.target.result;
                if(!d.objectStoreNames.contains(ST)){const s=d.createObjectStore(ST,{keyPath:'_id',autoIncrement:true});s.createIndex('ts','timestamp');}
                if(!d.objectStoreNames.contains(HM))d.createObjectStore(HM,{keyPath:'msgId'});
                if(!d.objectStoreNames.contains(SE))d.createObjectStore(SE,{keyPath:'sessionId'});
                if(!d.objectStoreNames.contains(PROFILES))d.createObjectStore(PROFILES,{keyPath:'key'});};
            r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error);});}
        async function init(){try{db=await open();self.postMessage({type:'READY'});}catch(e){self.postMessage({type:'ERROR'});}}
        async function push(p){if(!db)return;try{const t=db.transaction(ST,'readwrite');t.objectStore(ST).add({...p,timestamp:Date.now()});}catch{}}
        async function hm(m,s,k){if(!db)return;try{const t=db.transaction(HM,'readwrite'),st=t.objectStore(HM),r=st.get(m);
            r.onsuccess=()=>{const d=r.result||{msgId:m,watched:{},seeks:{},replays:{},skips:{},totalWatched:0};
                const b=k==='seek'?'seeks':k==='replay'?'replays':k==='skip'?'skips':'watched';
                d[b][s]=(d[b][s]||0)+1;if(k==='watched')d.totalWatched++;st.put(d);};}catch{}}
        async function saveProfile(key,data){if(!db)return;try{const t=db.transaction(PROFILES,'readwrite');t.objectStore(PROFILES).put({key,data,ts:Date.now()});}catch{}}
        async function getProfile(key){if(!db)return null;return new Promise(r=>{try{const t=db.transaction(PROFILES,'readonly'),rq=t.objectStore(PROFILES).get(key);rq.onsuccess=()=>r(rq.result?.data||null);rq.onerror=()=>r(null);}catch{r(null);}});}
        async function sess(s){if(!db)return;try{const t=db.transaction(SE,'readwrite');t.objectStore(SE).put(s);}catch{}}
        async function chunk(url){if(!db)return false;return new Promise(res=>{const t=db.transaction(ST,'readwrite'),s=t.objectStore(ST),r=s.openCursor(),b=[],k=[];
            r.onsuccess=async e=>{const c=e.target.result;if(c&&b.length<CHUNK){b.push(c.value);k.push(c.primaryKey);c.continue();}
                else{if(!b.length)return res(true);try{const x=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),keepalive:true});
                    if(x.ok){const d=db.transaction(ST,'readwrite');k.forEach(kk=>d.objectStore(ST).delete(kk));bo=1000;res(true);}else res(false);}catch{res(false);}}};
            r.onerror=()=>res(false);});}
        async function flush(url){let ok=true;while(ok){ok=await chunk(url);if(!ok){setTimeout(()=>flush(url),bo);bo=Math.min(MAX_BO,bo*2);break;}}}
        async function getHM(m){if(!db)return null;return new Promise(r=>{try{const t=db.transaction(HM,'readonly'),q=t.objectStore(HM).get(m);q.onsuccess=()=>r(q.result);q.onerror=()=>r(null);}catch{r(null);}});}
        async function prune(){if(!db)return;try{const cutoff=Date.now()-30*24*60*60*1000;const t=db.transaction(ST,'readwrite'),s=t.objectStore(ST),idx=s.index('ts'),r=idx.openCursor(IDBKeyRange.upperBound(cutoff));
            r.onsuccess=e=>{const c=e.target.result;if(c){s.delete(c.primaryKey);c.continue();}};}catch{}}
        init();
        self.onmessage=async e=>{const{type,payload,apiUrl,msgId,second,kind,reqId,session,key,data,batch}=e.data;
            if(type==='PUSH')push(payload);
            else if(type==='PUSH_BATCH'&&batch){for(const p of batch)push(p);}
            else if(type==='HEATMAP')hm(msgId,second,kind);
            else if(type==='SESSION')sess(session);
            else if(type==='SAVE_PROFILE')saveProfile(key,data);
            else if(type==='GET_PROFILE'){const d=await getProfile(key);self.postMessage({type:'PROFILE',reqId,data:d});}
            else if(type==='GET_HEATMAP'){const d=await getHM(msgId);self.postMessage({type:'HEATMAP_DATA',reqId,data:d});}
            else if(type==='FLUSH')flush(apiUrl);
            else if(type==='PRUNE')prune();};
    `;

    const subtitleWorkerCode = `
        self.onmessage=async e=>{const{type,url,text,reqId}=e.data;try{let r=text;if(url&&!r){const x=await fetch(url);r=await x.text();}
            const c=parse(r);self.postMessage({type:'PARSED',reqId,cues:c});}catch(err){self.postMessage({type:'ERROR',reqId,error:String(err)});}};
        function parse(d){const c=[];const lines=d.replace(/\\r/g,'').split('\\n');let i=0;
            while(i<lines.length){const m=lines[i].match(/(\\d{1,2}):?(\\d{2}):(\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{1,2}):?(\\d{2}):(\\d{2})[.,](\\d{3})(.*)/);
                if(m){const s=(+m[1]||0)*3600+(+m[2])*60+(+m[3])+(+m[4])/1000;
                    const e=(+m[5]||0)*3600+(+m[6])*60+(+m[7])+(+m[8])/1000;
                    const set=m[9]||'',pm=set.match(/position:(\\d+)%/),lm=set.match(/line:(\\d+)%?/),am=set.match(/align:(start|center|end)/);
                    const txt=[];i++;while(i<lines.length&&lines[i].trim()!==''){txt.push(lines[i]);i++;}
                    c.push({start:s,end:e,text:txt.join('\\n'),position:pm?+pm[1]:null,line:lm?+lm[1]:null,align:am?am[1]:'center'});}i++;}
            c.sort((a,b)=>a.start-b.start);return c;}
    `;

    const intelligenceWorkerCode = `
        const HIST=24;let prevHist=null,prevColor=null,prevFrame=null;
        const scenes=[],motion=[],colorProf=[];
        function histogram(d){const h=new Uint32Array(HIST);let r=0,g=0,b=0,n=0;
            for(let i=0;i<d.length;i+=32){const R=d[i],G=d[i+1],B=d[i+2];const l=R*0.299+G*0.587+B*0.114;
                h[Math.min(HIST-1,l>>4)]++;r+=R;g+=G;b+=B;n++;}return{h,avg:{r:r/n,g:g/n,b:b/n}};}
        function dist(a,b){let d=0,t=0;for(let i=0;i<HIST;i++){d+=Math.abs(a[i]-b[i]);t+=a[i]+b[i];}return t>0?d/t:0;}
        function colorD(a,b){return Math.sqrt((a.r-b.r)**2+(a.g-b.g)**2+(a.b-b.b)**2)/441.67;}
        function motionEst(c,p){let s=0,n=0;for(let i=0;i<c.length;i+=64){s+=Math.abs(c[i]-p[i]);n++;}return s/n/255;}
        self.onmessage=e=>{const{type,frame,time}=e.data;
            if(type==='ANALYZE'){const{h,avg}=histogram(frame);
                colorProf.push({time,color:avg});if(colorProf.length>200)colorProf.shift();
                let sceneDetected=null,motionVal=0;
                if(prevHist){const d=dist(h,prevHist),cd=prevColor?colorD(avg,prevColor):0;
                    if(d>0.32||cd>0.38){sceneDetected={time,intensity:d,colorShift:cd,avgColor:avg};scenes.push(sceneDetected);}}
                if(prevFrame){motionVal=motionEst(frame,prevFrame);motion.push({time,value:motionVal});if(motion.length>120)motion.shift();}
                prevHist=h;prevColor=avg;prevFrame=frame;
                self.postMessage({type:'RESULT',scene:sceneDetected,motion:motionVal,avgColor:avg,time});}
            else if(type==='COLOR_ONLY'){const{avg}=histogram(frame);self.postMessage({type:'COLOR',avgColor:avg,time});}
            else if(type==='GET_DATA')self.postMessage({type:'DATA',scenes,motion,colorProf});
            else if(type==='RESET'){prevHist=null;prevColor=null;prevFrame=null;scenes.length=0;motion.length=0;colorProf.length=0;}};
    `;

    const thumbnailWorkerCode = `
        const cache=new Map();const MAX=300;
        self.onmessage=async e=>{const{type,url,reqId,time}=e.data;
            if(type==='PRELOAD'){try{if(cache.has(url)){self.postMessage({type:'PRELOADED',url});return;}
                const r=await fetch(url),b=await r.blob(),bm=await createImageBitmap(b);
                if(cache.size>=MAX){const k=cache.keys().next().value;try{cache.get(k).close?.();}catch{}cache.delete(k);}
                cache.set(url,bm);self.postMessage({type:'PRELOADED',url});}catch(err){self.postMessage({type:'ERROR',reqId});}}
            else if(type==='GET'){const bm=cache.get(url);self.postMessage({type:'THUMB',reqId,time,bitmap:bm});}
            else if(type==='CLEAR'){cache.forEach(b=>{try{b.close?.();}catch{}});cache.clear();}};
    `;

    function spawnWorker(code, name) {
        if (!Capabilities.worker || !Capabilities.blob) return null;
        try {
            const blob = new Blob([code], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            Registry.addBlobUrl(url);
            const w = new Worker(url, { name });
            Registry.addWorker(w);
            return w;
        } catch (e) { Bus.emit('error', ErrorTaxonomy.WORKER_FAILURE, e); return null; }
    }

    class SystemStateMachine {
        constructor() {
            this.states = new Map();
            this.current = 'boot';
            this.history = new RingBuffer(50);
            this.transitions = new Map();
        }
        define(name, config) { this.states.set(name, config); }
        addTransition(from, to, guard) { const key = `${from}->${to}`; this.transitions.set(key, guard || (() => true)); }
        async transition(to) {
            const from = this.current;
            const key = `${from}->${to}`;
            const guard = this.transitions.get(key);
            if (guard && !(await guard())) return false;
            const fromState = this.states.get(from);
            const toState = this.states.get(to);
            try { await fromState?.exit?.(); } catch {}
            this.history.push({ from, to, t: performance.now() });
            this.current = to;
            try { await toState?.enter?.(); } catch {}
            Bus.emit('state:transition', { from, to });
            return true;
        }
        is(name) { return this.current === name; }
        getHistory() { return this.history.toArray(); }
    }

    class SubsystemController {
        constructor() {
            this.systems = new Map();
        }
        register(name, config) {
            this.systems.set(name, {
                name,
                state: 'sleep',
                sleep: config.sleep || (() => {}),
                warm: config.warm || (() => {}),
                active: config.active || (() => {}),
                destroy: config.destroy || (() => {}),
                priority: config.priority || 50,
            });
        }
        async setState(name, state) {
            const sys = this.systems.get(name);
            if (!sys || sys.state === state) return;
            const prev = sys.state;
            sys.state = state;
            try { await sys[state]?.(); } catch (e) {}
            Bus.emit('subsystem:change', { name, from: prev, to: state });
        }
        async setAll(state) {
            const list = Array.from(this.systems.values()).sort((a, b) => a.priority - b.priority);
            for (const sys of list) await this.setState(sys.name, state);
        }
        get(name) { return this.systems.get(name); }
        getStates() {
            const out = {};
            this.systems.forEach((s, n) => out[n] = s.state);
            return out;
        }
    }

    class FrameBudget {
        constructor(targetMs = 8) {
            this.targetMs = targetMs; this.start = 0; this.spent = 0;
            this.history = new RingBuffer(120);
            this.overruns = 0;
        }
        begin() { this.start = performance.now(); this.spent = 0; }
        consume(label, ms) { this.spent += ms; this.history.push({ label, ms }); if (this.spent > this.targetMs) this.overruns++; }
        remaining() { return Math.max(0, this.targetMs - this.spent); }
        canAfford(estimateMs) { return this.remaining() >= estimateMs; }
        avgSpend(label) {
            let sum = 0, n = 0;
            for (let i = 0; i < this.history.length; i++) {
                const e = this.history.get(i);
                if (e.label === label) { sum += e.ms; n++; }
            }
            return n ? sum / n : 0;
        }
        getOverrunRate() { return this.history.length ? this.overruns / Math.max(1, this.history.length / 10) : 0; }
    }

    class WebGLAmbientRenderer {
        constructor(container, video, governor, subsystems) {
            this.container = container; this.video = video; this.governor = governor; this.subsystems = subsystems;
            this.canvas = null; this.gl = null; this.program = null;
            this.texture = null; this.lastDraw = 0;
            this.rvfcHandle = null; this.bloomStrength = 0.85;
            this.saturation = 1.85; this.contextLost = false;
            this.targetColor = [0, 0, 0]; this.currentColor = [0, 0, 0];
            this.colorLerp = 0.06;
            this.state = 'sleep';
            this.minIntervalMs = 33;
            this.mounted = false;
            this.pulseEnergy = 0;
        }
        mount() {
            if (this.mounted) return;
            this.mounted = true;
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'tq-ambient';
            const tier = Capabilities.tier;
            const dim = tier === 'apex' ? 320 : tier === 'high' ? 224 : tier === 'mid' ? 144 : 96;
            this.canvas.width = dim; this.canvas.height = Math.round(dim * 0.5625);
            this.container.prepend(this.canvas);
            if (!Capabilities.webGL || Capabilities.lowPower) { this._fallbackMount(); return; }
            try {
                this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, desynchronized: true, powerPreference: 'low-power', preserveDrawingBuffer: false })
                       || this.canvas.getContext('webgl', { alpha: false, antialias: false, desynchronized: true, powerPreference: 'low-power' });
                if (!this.gl) { this._fallbackMount(); return; }
                this._initGL();
                Registry.listen(this.canvas, 'webglcontextlost', e => { e.preventDefault(); this.contextLost = true; Bus.emit('error', ErrorTaxonomy.GL_CONTEXT_LOST); });
                Registry.listen(this.canvas, 'webglcontextrestored', () => { this.contextLost = false; this._initGL(); });
            } catch(e) { this._fallbackMount(); }
        }
        _fallbackMount() {
            this.fallback = true;
            this.ctx2d = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
        }
        _initGL() {
            const gl = this.gl;
            const vs = `attribute vec2 p; varying vec2 v; void main(){ v = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;
            const fs = `precision highp float; varying vec2 v; uniform sampler2D t; uniform float bloom; uniform float sat; uniform float time; uniform vec3 tint; uniform float vignette; uniform float pulse;
                vec3 chromaShift(sampler2D tex, vec2 uv, float amt){
                    vec2 dir = (uv - 0.5);
                    float r = texture2D(tex, uv - dir * amt * 0.6).r;
                    float g = texture2D(tex, uv).g;
                    float b = texture2D(tex, uv + dir * amt * 0.6).b;
                    return vec3(r, g, b);
                }
                void main(){
                    vec3 c = chromaShift(t, v, 0.004 + pulse * 0.006);
                    vec3 b = vec3(0.0);
                    float off = 0.016 + pulse * 0.008;
                    b += texture2D(t, v + vec2( off, 0.0)).rgb;
                    b += texture2D(t, v + vec2(-off, 0.0)).rgb;
                    b += texture2D(t, v + vec2(0.0,  off)).rgb;
                    b += texture2D(t, v + vec2(0.0, -off)).rgb;
                    b += texture2D(t, v + vec2( off,  off)).rgb * 0.7;
                    b += texture2D(t, v + vec2(-off, -off)).rgb * 0.7;
                    b += texture2D(t, v + vec2( off*1.8, 0.0)).rgb * 0.5;
                    b += texture2D(t, v + vec2(-off*1.8, 0.0)).rgb * 0.5;
                    b /= 5.4;
                    b = max(b - 0.32, 0.0) * bloom * (4.5 + pulse * 2.0);
                    vec3 col = c + b;
                    col = mix(col, tint, 0.22 + pulse * 0.08);
                    float lum = dot(col, vec3(0.299, 0.587, 0.114));
                    col = mix(vec3(lum), col, sat);
                    vec2 d = v - 0.5;
                    float vig = 1.0 - dot(d, d) * vignette;
                    col *= vig;
                    float wave = sin(time * 0.7 + d.x * 4.0) * 0.04 * pulse;
                    col += wave * tint;
                    col = col / (col + vec3(1.0));
                    col = pow(col, vec3(1.0/2.2));
                    gl_FragColor = vec4(col, 1.0);
                }`;
            const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
            const vsObj = compile(gl.VERTEX_SHADER, vs);
            const fsObj = compile(gl.FRAGMENT_SHADER, fs);
            this.program = gl.createProgram();
            gl.attachShader(this.program, vsObj); gl.attachShader(this.program, fsObj);
            gl.linkProgram(this.program); gl.useProgram(this.program);
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(this.program, 'p');
            gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            this.texture = gl.createTexture();
            Registry.addTexture(this.texture);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            this.uBloom = gl.getUniformLocation(this.program, 'bloom');
            this.uSat = gl.getUniformLocation(this.program, 'sat');
            this.uTime = gl.getUniformLocation(this.program, 'time');
            this.uTint = gl.getUniformLocation(this.program, 'tint');
            this.uVignette = gl.getUniformLocation(this.program, 'vignette');
            this.uPulse = gl.getUniformLocation(this.program, 'pulse');
        }
        setTint(r, g, b) { this.targetColor[0] = r/255; this.targetColor[1] = g/255; this.targetColor[2] = b/255; }
        setPulse(energy) { this.pulseEnergy = Math.max(0, Math.min(1, energy)); }
        sleep() { this.state = 'sleep'; if (this.canvas) this.canvas.style.opacity = '0'; }
        warm() { this.state = 'warm'; this.minIntervalMs = 500; }
        active() { this.state = 'active'; this.minIntervalMs = 33; }
        draw() {
            if (this.state === 'sleep' || document.hidden || this.contextLost || !this.mounted) return;
            const profile = this.governor.getProfile();
            if (!profile.ambient) { if (this.canvas) this.canvas.style.opacity = '0'; return; }
            const now = performance.now();
            const interval = this.state === 'warm' ? 500 : Math.max(this.minIntervalMs, 1000 / profile.ambientFPS);
            if (now - this.lastDraw < interval) return;
            this.lastDraw = now;
            for (let i = 0; i < 3; i++) this.currentColor[i] += (this.targetColor[i] - this.currentColor[i]) * this.colorLerp;
            this.pulseEnergy *= 0.92;
            if (this.fallback) { this._draw2D(); return; }
            const gl = this.gl;
            try {
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.video);
                gl.uniform1f(this.uBloom, this.bloomStrength * (profile.blur ? 1 : 0.4));
                gl.uniform1f(this.uSat, this.saturation);
                gl.uniform1f(this.uTime, now / 1000);
                gl.uniform3f(this.uTint, this.currentColor[0], this.currentColor[1], this.currentColor[2]);
                gl.uniform1f(this.uVignette, 0.55);
                gl.uniform1f(this.uPulse, this.pulseEnergy);
                gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            } catch {}
            this.canvas.style.opacity = profile.blur ? '0.85' : '0.5';
        }
        _draw2D() {
            try { this.ctx2d.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height); } catch {}
            this.canvas.style.opacity = '0.6';
        }
        destroy() {
            try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
            this.canvas?.remove();
            this.mounted = false;
        }
    }

    class ParticleField {
        constructor(container) {
            this.container = container;
            this.canvas = null;
            this.ctx = null;
            this.particles = [];
            this.maxParticles = Capabilities.tier === 'apex' ? 80 : Capabilities.tier === 'high' ? 50 : 30;
            this.active = false;
            this.tint = { r: 14, g: 165, b: 233 };
        }
        mount() {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'tq-particles';
            this.container.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
            this._resize();
            Registry.observe(new ResizeObserver(() => this._resize())).observe(this.container);
        }
        _resize() {
            if (!this.canvas) return;
            const rect = this.container.getBoundingClientRect();
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.canvas.style.width = rect.width + 'px';
            this.canvas.style.height = rect.height + 'px';
            this.ctx.scale(dpr, dpr);
            this.w = rect.width; this.h = rect.height;
        }
        burst(x, y, count = 12, color = null) {
            const c = color || this.tint;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
                const speed = 1 + Math.random() * 4;
                this.particles.push({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1,
                    decay: 0.012 + Math.random() * 0.015,
                    size: 2 + Math.random() * 4,
                    color: c,
                });
                if (this.particles.length > this.maxParticles) this.particles.shift();
            }
            this.active = true;
        }
        ambient() {
            if (this.particles.length < this.maxParticles / 3 && Math.random() < 0.05) {
                this.particles.push({
                    x: Math.random() * this.w,
                    y: this.h + 10,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.3 - Math.random() * 0.6,
                    life: 1,
                    decay: 0.004,
                    size: 1 + Math.random() * 2,
                    color: this.tint,
                    ambient: true,
                });
                this.active = true;
            }
        }
        setTint(r, g, b) { this.tint = { r, g, b }; }
        tick() {
            if (!this.active || !this.ctx) return;
            this.ctx.clearRect(0, 0, this.w, this.h);
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                if (!p.ambient) p.vy += 0.05;
                p.vx *= 0.98;
                p.life -= p.decay;
                if (p.life <= 0) { this.particles.splice(i, 1); continue; }
                this.ctx.globalAlpha = p.life * (p.ambient ? 0.4 : 0.9);
                this.ctx.fillStyle = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = p.size * 4;
                this.ctx.shadowColor = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
            this.ctx.globalAlpha = 1;
            if (this.particles.length === 0) this.active = false;
        }
        clear() { this.particles.length = 0; if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h); }
    }

    class SubtitleEngine {
        constructor(container) {
            this.container = container; this.cues = [];
            this.lastIndex = -1; this.lastTime = -1; this.visible = false;
            this.worker = spawnWorker(subtitleWorkerCode, 'tq-vtt');
            this.reqCounter = 0; this.pending = new Map();
            this.fontSize = 22; this.fontFamily = 'system-ui'; this.color = '#fff';
            this.bgOpacity = 0.85; this.shadowEnabled = true;
            this.adaptivePosition = true;
            this._wrap = null; this._spans = [];
            this._cuesByBucket = null;
            this._bucketSize = 5;
            this.minimal = false;
            this._initDOM();
            if (this.worker) {
                this.worker.onmessage = e => {
                    const { type, reqId, cues, error } = e.data;
                    if (type === 'PARSED') { this.cues = cues; this._buildIndex(); this.lastIndex = -1; Bus.emit('subtitles:loaded', { count: cues.length }); this.pending.get(reqId)?.resolve(cues); }
                    else if (type === 'ERROR') { Bus.emit('error', ErrorTaxonomy.SUBTITLE_PARSE, error); this.pending.get(reqId)?.reject(error); }
                    this.pending.delete(reqId);
                };
            }
        }
        _initDOM() {
            if (!this.container) return;
            this._wrap = document.createElement('div');
            this._wrap.className = 'tq-cue-wrap';
            this.container.appendChild(this._wrap);
            for (let i = 0; i < 4; i++) {
                const span = document.createElement('span');
                span.style.display = 'none';
                this._wrap.appendChild(span);
                this._spans.push(span);
            }
        }
        _buildIndex() {
            this._cuesByBucket = new Map();
            for (let i = 0; i < this.cues.length; i++) {
                const c = this.cues[i];
                const startB = Math.floor(c.start / this._bucketSize);
                const endB = Math.floor(c.end / this._bucketSize);
                for (let b = startB; b <= endB; b++) {
                    if (!this._cuesByBucket.has(b)) this._cuesByBucket.set(b, []);
                    this._cuesByBucket.get(b).push(i);
                }
            }
        }
        loadVTT(url) {
            if (!this.worker) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const reqId = ++this.reqCounter;
                this.pending.set(reqId, { resolve, reject });
                this.worker.postMessage({ type: 'PARSE', url, reqId });
            }).catch(() => {});
        }
        loadText(text) {
            if (!this.worker) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const reqId = ++this.reqCounter;
                this.pending.set(reqId, { resolve, reject });
                this.worker.postMessage({ type: 'PARSE', text, reqId });
            }).catch(() => {});
        }
        _findCue(time) {
            if (!this._cuesByBucket) return -1;
            const bucket = Math.floor(time / this._bucketSize);
            const candidates = this._cuesByBucket.get(bucket);
            if (!candidates) return -1;
            for (let i = 0; i < candidates.length; i++) {
                const idx = candidates[i];
                const c = this.cues[idx];
                if (time >= c.start && time <= c.end) return idx;
            }
            return -1;
        }
        setMinimal(v) { this.minimal = v; this.lastIndex = -2; }
        update(time) {
            if (!this.cues.length || !this.container) return;
            if (Math.abs(time - this.lastTime) < 0.08) return;
            this.lastTime = time;
            const idx = this._findCue(time);
            if (idx === this.lastIndex) return;
            this.lastIndex = idx;
            if (idx === -1) { if (this.visible) { this.container.style.opacity = '0'; this.visible = false; } return; }
            const cue = this.cues[idx];
            const lines = cue.text.split('\n');
            this._wrap.style.textAlign = cue.align === 'start' ? 'left' : cue.align === 'end' ? 'right' : 'center';
            if (cue.line !== null && this.adaptivePosition) this._wrap.style.bottom = `${100 - cue.line}%`;
            while (this._spans.length < lines.length) {
                const span = document.createElement('span');
                this._wrap.appendChild(span);
                this._spans.push(span);
            }
            const shadow = this.shadowEnabled && !this.minimal ? 'text-shadow:0 2px 8px rgba(0,0,0,0.95),0 0 2px rgba(0,0,0,1);' : '';
            const blur = this.minimal ? '' : 'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);';
            for (let i = 0; i < this._spans.length; i++) {
                const span = this._spans[i];
                if (i < lines.length) {
                    span.textContent = lines[i];
                    span.style.cssText = `display:inline-block;font-size:${this.fontSize}px;font-family:${this.fontFamily};color:${this.color};background:rgba(0,0,0,${this.bgOpacity});${shadow}${blur}`;
                    if (i < lines.length - 1) span.style.marginBottom = '4px';
                } else span.style.display = 'none';
            }
            if (!this.visible) { this.container.style.opacity = '1'; this.visible = true; }
        }
        setStyle(opts) { Object.assign(this, opts); this.lastIndex = -2; }
        clear() {
            this.cues = []; this._cuesByBucket = null; this.lastIndex = -1;
            this._spans.forEach(s => s.style.display = 'none');
            if (this.container) this.container.style.opacity = '0';
            this.visible = false;
        }
    }

    class PerformanceGovernor {
        constructor() {
            this.fps = 60; this.dropRate = 0; this.thermalLevel = 'normal';
            this.batteryLevel = 1; this.charging = true; this.dataSaver = false;
            this.effectiveType = '4g'; this.downlink = 10;
            this.cpuBudget = 1; this.gpuBudget = 1; this.memBudget = 1;
            this.frameTimes = new RingBuffer(60); this.lastDecoded = 0; this.lastDropped = 0;
            this.longTasks = 0; this.jankScore = 0;
            this.sustainedFrameMs = new RingBuffer(60);
            this.predictedThermal = 'normal';
            this.sustainedHighLoad = 0;
            this.memoryPressure = 0;
            this._initBattery(); this._initNetwork(); this._initLongTasks();
            this._initFrameTime(); this._initMemoryMonitor();
        }
        async _initBattery() {
            if (!Capabilities.battery) return;
            try {
                const bat = await navigator.getBattery();
                const update = () => { this.batteryLevel = bat.level; this.charging = bat.charging; this._reassess(); };
                bat.addEventListener('levelchange', update); bat.addEventListener('chargingchange', update); update();
            } catch {}
        }
        _initNetwork() {
            if (!Capabilities.networkInfo) return;
            const conn = navigator.connection;
            const update = () => {
                this.dataSaver = conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType);
                this.effectiveType = conn.effectiveType || '4g';
                this.downlink = conn.downlink || 10;
                this._reassess();
            };
            conn.addEventListener?.('change', update); update();
        }
        _initLongTasks() {
            if (!Capabilities.performanceObserver) return;
            try {
                const obs = new PerformanceObserver(list => {
                    const entries = list.getEntries();
                    this.longTasks += entries.length;
                    entries.forEach(e => { this.jankScore = Math.min(100, this.jankScore + e.duration / 10); });
                    this._reassess();
                });
                obs.observe({ entryTypes: ['longtask'] });
                Registry.observe(obs);
            } catch {}
        }
        _initFrameTime() {
            let last = performance.now();
            const tick = () => {
                const now = performance.now();
                this.sustainedFrameMs.push(now - last);
                last = now;
                if (!document.hidden) requestAnimationFrame(tick);
                else setTimeout(() => requestAnimationFrame(tick), 1000);
            };
            requestAnimationFrame(tick);
        }
        _initMemoryMonitor() {
            if (!performance.memory) return;
            Registry.interval(() => {
                try {
                    const used = performance.memory.usedJSHeapSize;
                    const limit = performance.memory.jsHeapSizeLimit;
                    this.memoryPressure = used / limit;
                    if (this.memoryPressure > 0.85) { Bus.emit('error', ErrorTaxonomy.MEMORY_PRESSURE, { ratio: this.memoryPressure }); Bus.emit('memory:high'); }
                } catch {}
            }, 10000);
        }
        sample(video) {
            if (!video?.getVideoPlaybackQuality) return;
            const q = video.getVideoPlaybackQuality();
            const decDelta = q.totalVideoFrames - this.lastDecoded;
            const dropDelta = q.droppedVideoFrames - this.lastDropped;
            this.lastDecoded = q.totalVideoFrames; this.lastDropped = q.droppedVideoFrames;
            this.fps = decDelta; this.dropRate = decDelta > 0 ? dropDelta / decDelta : 0;
            this.jankScore = Math.max(0, this.jankScore - 2);
            this._predictThermal();
            this._reassess();
        }
        _predictThermal() {
            if (this.sustainedFrameMs.length < 20) return;
            let sum = 0;
            for (let i = 0; i < this.sustainedFrameMs.length; i++) sum += this.sustainedFrameMs.get(i);
            const avgFrameMs = sum / this.sustainedFrameMs.length;
            if (avgFrameMs > 25) { this.predictedThermal = 'hot'; this.sustainedHighLoad++; }
            else if (avgFrameMs > 18) { this.predictedThermal = 'warm'; this.sustainedHighLoad++; }
            else { this.predictedThermal = 'normal'; this.sustainedHighLoad = Math.max(0, this.sustainedHighLoad - 2); }
        }
        _reassess() {
            let level = 'normal';
            const memHigh = this.memoryPressure > 0.75;
            if (this.dropRate > 0.15 || this.fps < 20 || this.longTasks > 30 || this.jankScore > 60 || this.predictedThermal === 'hot' || this.sustainedHighLoad > 60 || memHigh) level = 'critical';
            else if (this.dropRate > 0.08 || this.fps < 30 || this.longTasks > 15 || this.jankScore > 30 || this.sustainedHighLoad > 30) level = 'hot';
            else if (this.dropRate > 0.03 || (this.batteryLevel < 0.15 && !this.charging) || this.predictedThermal === 'warm') level = 'warm';
            this.cpuBudget = level === 'normal' ? 1 : level === 'warm' ? 0.7 : level === 'hot' ? 0.4 : 0.2;
            this.gpuBudget = Capabilities.webGL2 ? this.cpuBudget : this.cpuBudget * 0.6;
            this.memBudget = (Capabilities.deviceMemory || 4) / 8;
            if (level !== this.thermalLevel) { const old = this.thermalLevel; this.thermalLevel = level; Bus.emit('thermal:change', { old, level }); }
            this.longTasks = Math.max(0, this.longTasks - 1);
        }
        canEnableHeavyFeatures() {
            return this.thermalLevel === 'normal' && this.fps >= 50 && this.dropRate < 0.02 && (this.charging || this.batteryLevel > 0.3) && this.memoryPressure < 0.7;
        }
        getProfile() {
            const lvl = this.thermalLevel;
            return {
                ambient: lvl === 'normal' || lvl === 'warm',
                ambientResolution: lvl === 'normal' ? 224 : lvl === 'warm' ? 144 : 80,
                ambientFPS: lvl === 'normal' ? 30 : lvl === 'warm' ? 15 : 8,
                blur: lvl !== 'critical',
                particles: lvl === 'normal',
                debugUpdateMs: lvl === 'critical' ? 2000 : 1000,
                uiUpdateMs: lvl === 'critical' ? 500 : 200,
                sceneDetection: this.cpuBudget > 0.5,
                motionEstimation: false,
                bufferGoal: Math.round(60 * this.cpuBudget * (this.dataSaver ? 0.3 : 1)),
                preloadAhead: Math.round(120 * this.cpuBudget),
                frameBudgetMs: lvl === 'normal' ? 8 : lvl === 'warm' ? 10 : lvl === 'hot' ? 14 : 20,
                allowAdvancedAudio: this.cpuBudget > 0.5,
                allowSpectrum: this.cpuBudget > 0.7,
            };
        }
    }

    class PredictiveBuffer {
        constructor(video, governor) {
            this.video = video; this.governor = governor;
            this.seekHistory = new RingBuffer(50);
            this.replayZones = new Map();
            this.watchPatterns = new RingBuffer(100);
        }
        recordSeek(from, to) {
            this.seekHistory.push({ from, to, t: Date.now() });
            const second = Math.floor(to);
            this.replayZones.set(second, (this.replayZones.get(second) || 0) + 1);
        }
        recordWatch(time) { this.watchPatterns.push({ time, t: Date.now() }); }
        getHotZones() {
            const zones = [];
            this.replayZones.forEach((count, sec) => { if (count >= 2) zones.push({ second: sec, weight: count }); });
            return zones.sort((a,b) => b.weight - a.weight).slice(0, 10);
        }
        predictNextSeek() {
            if (this.seekHistory.length < 3) return null;
            const recent = [];
            for (let i = Math.max(0, this.seekHistory.length - 5); i < this.seekHistory.length; i++) recent.push(this.seekHistory.get(i));
            const deltas = [];
            for (let i = 1; i < recent.length; i++) deltas.push(recent[i].to - recent[i-1].to);
            const avg = deltas.reduce((a,b) => a + b, 0) / deltas.length;
            return this.video.currentTime + avg;
        }
        suggestPreload() {
            const profile = this.governor.getProfile();
            const ahead = profile.preloadAhead;
            const ct = this.video.currentTime;
            return { from: ct, to: Math.min(this.video.duration || 0, ct + ahead) };
        }
        adjustHlsConfig(hls) {
            if (!hls?.config) return;
            const profile = this.governor.getProfile();
            try {
                hls.config.maxBufferLength = profile.bufferGoal;
                hls.config.maxMaxBufferLength = profile.bufferGoal * 6;
                hls.config.maxBufferSize = 60 * 1000 * 1000 * this.governor.memBudget;
            } catch {}
        }
    }

    class AudioEngine {
        constructor(video) {
            this.video = video; this.ctx = null; this.src = null;
            this.gain = null; this.compressor = null; this.limiter = null;
            this.bands = []; this.panner = null; this.analyser = null;
            this.dialogueFilter = null; this.loudnessGain = null;
            this.convolver = null; this.dryGain = null; this.wetGain = null;
            this.subBass = null; this.harmonic = null;
            this.active = false; this.targetLUFS = -16;
            this.dialogueMode = false; this.spatialMode = false;
            this.peakLevel = 0; this.bassEnergy = 0; this.midEnergy = 0; this.trebleEnergy = 0;
            this._lazyConvolverConnected = false;
            this._lazyAnalyserConnected = false;
            this._loudnessMonitorActive = false;
            this._loudnessMonitorInterval = null;
            this.state = 'sleep';
            this.basicOnly = false;
        }
        init() {
            if (this.active || !Capabilities.webAudio) return false;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
                this.src = this.ctx.createMediaElementSource(this.video);
                this.loudnessGain = this.ctx.createGain(); this.loudnessGain.gain.value = 1;
                this.dialogueFilter = this.ctx.createBiquadFilter();
                this.dialogueFilter.type = 'peaking'; this.dialogueFilter.frequency.value = 2500;
                this.dialogueFilter.Q.value = 1.2; this.dialogueFilter.gain.value = 0;
                this.subBass = this.ctx.createBiquadFilter();
                this.subBass.type = 'lowshelf'; this.subBass.frequency.value = 80; this.subBass.gain.value = 0;
                this.harmonic = this.ctx.createWaveShaper();
                this.harmonic.curve = this._makeHarmonicCurve(0);
                this.harmonic.oversample = '2x';
                this.compressor = this.ctx.createDynamicsCompressor();
                this.compressor.threshold.value = -24; this.compressor.ratio.value = 6;
                this.compressor.attack.value = 0.003; this.compressor.release.value = 0.25;
                this.compressor.knee.value = 30;
                this.limiter = this.ctx.createDynamicsCompressor();
                this.limiter.threshold.value = -1; this.limiter.ratio.value = 20;
                this.limiter.attack.value = 0.001; this.limiter.release.value = 0.05;
                this.gain = this.ctx.createGain();
                this.panner = this.ctx.createStereoPanner();
                this.dryGain = this.ctx.createGain(); this.dryGain.gain.value = 1;
                this.wetGain = this.ctx.createGain(); this.wetGain.gain.value = 0;
                const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
                let prev = this.src;
                prev.connect(this.loudnessGain); prev = this.loudnessGain;
                prev.connect(this.subBass); prev = this.subBass;
                prev.connect(this.dialogueFilter); prev = this.dialogueFilter;
                this.bands = freqs.map((freq, i) => {
                    const f = this.ctx.createBiquadFilter();
                    f.type = i === 0 ? 'lowshelf' : i === freqs.length - 1 ? 'highshelf' : 'peaking';
                    f.frequency.value = freq; f.Q.value = 1.414; f.gain.value = 0;
                    prev.connect(f); prev = f; return f;
                });
                prev.connect(this.harmonic); prev = this.harmonic;
                prev.connect(this.panner);
                this.panner.connect(this.dryGain);
                this.dryGain.connect(this.gain);
                this.gain.connect(this.compressor);
                this.compressor.connect(this.limiter);
                this.limiter.connect(this.ctx.destination);
                [this.loudnessGain, this.dialogueFilter, this.compressor, this.limiter, this.gain, this.panner, this.dryGain, this.wetGain, this.subBass, this.harmonic, ...this.bands].forEach(n => Registry.addAudioNode(n));
                this.active = true; this.state = 'active'; Bus.emit('audio:ready');
                return true;
            } catch(e) { Bus.emit('error', ErrorTaxonomy.AUDIO_CONTEXT_FAILED, e); return false; }
        }
        sleep() {
            this.state = 'sleep';
            if (this._loudnessMonitorInterval) { clearInterval(this._loudnessMonitorInterval); this._loudnessMonitorInterval = null; this._loudnessMonitorActive = false; }
        }
        warm() { this.state = 'warm'; }
        wake() { this.state = 'active'; }
        _ensureConvolver() {
            if (this._lazyConvolverConnected) return;
            try {
                this.convolver = this.ctx.createConvolver();
                this.convolver.buffer = this._makeImpulse(2, 0.3);
                this.panner.connect(this.convolver);
                this.convolver.connect(this.wetGain);
                this.wetGain.connect(this.gain);
                Registry.addAudioNode(this.convolver);
                this._lazyConvolverConnected = true;
            } catch {}
        }
        _ensureAnalyser() {
            if (this._lazyAnalyserConnected) return;
            try {
                this.analyser = this.ctx.createAnalyser();
                this.analyser.fftSize = 1024;
                this.limiter.disconnect();
                this.limiter.connect(this.analyser);
                this.analyser.connect(this.ctx.destination);
                Registry.addAudioNode(this.analyser);
                this._lazyAnalyserConnected = true;
                this._startLoudnessMonitor();
            } catch {}
        }
        _makeHarmonicCurve(amount) {
            const samples = 4096;
            const curve = new Float32Array(samples);
            const k = amount * 5;
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                curve[i] = (3 + k) * x * 20 * (Math.PI / 180) / (Math.PI + k * Math.abs(x));
            }
            return curve;
        }
        _makeImpulse(duration, decay) {
            const rate = this.ctx.sampleRate;
            const length = rate * duration;
            const impulse = this.ctx.createBuffer(2, length, rate);
            for (let c = 0; c < 2; c++) {
                const ch = impulse.getChannelData(c);
                for (let i = 0; i < length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay * 3);
            }
            return impulse;
        }
        _startLoudnessMonitor() {
            if (this._loudnessMonitorActive || !this.analyser) return;
            this._loudnessMonitorActive = true;
            const buf = new Float32Array(this.analyser.fftSize);
            this._loudnessMonitorInterval = Registry.interval(() => {
                if (!this.active || this.ctx.state !== 'running' || !this._lazyAnalyserConnected || this.state === 'sleep') return;
                this.analyser.getFloatTimeDomainData(buf);
                let sum = 0, peak = 0;
                for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; const a = Math.abs(buf[i]); if (a > peak) peak = a; }
                const rms = Math.sqrt(sum / buf.length);
                const lufs = rms > 0 ? 20 * Math.log10(rms) - 0.691 : -70;
                this.peakLevel = peak;
                const diff = this.targetLUFS - lufs;
                if (lufs > -60) {
                    const target = Math.max(0.5, Math.min(2.5, Math.pow(10, diff / 40)));
                    this.loudnessGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.5);
                }
            }, 750);
        }
        async resume() { if (this.ctx?.state === 'suspended') { try { await this.ctx.resume(); } catch {} } }
        setVolume(level) {
            if (!this.active) return false;
            this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
            return true;
        }
        setPan(value) { if (!this.active) return; this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), this.ctx.currentTime, 0.1); }
        applyEQ(gains) {
            if (!this.active) return;
            gains.forEach((g, i) => { if (this.bands[i]) this.bands[i].gain.setTargetAtTime(g, this.ctx.currentTime, 0.2); });
        }
        setDialogueMode(on) { this.dialogueMode = on; if (!this.active) return; this.dialogueFilter.gain.setTargetAtTime(on ? 6 : 0, this.ctx.currentTime, 0.3); }
        setSpatialMode(on) {
            this.spatialMode = on; if (!this.active) return;
            if (on) this._ensureConvolver();
            if (this._lazyConvolverConnected) {
                this.wetGain.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.5);
                this.dryGain.gain.setTargetAtTime(on ? 0.85 : 1, this.ctx.currentTime, 0.5);
            }
        }
        setSubBass(level) { if (!this.active) return; this.subBass.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3); }
        setHarmonic(amount) { if (!this.active) return; this.harmonic.curve = this._makeHarmonicCurve(amount); }
        setLoudnessTarget(lufs) { this.targetLUFS = Math.max(-30, Math.min(-6, lufs)); this._ensureAnalyser(); }
        getSpectrum() {
            if (this.state === 'sleep') return null;
            if (!this._lazyAnalyserConnected) this._ensureAnalyser();
            if (!this.analyser) return null;
            const data = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(data);
            const third = Math.floor(data.length / 3);
            let bass = 0, mid = 0, treble = 0;
            for (let i = 0; i < third; i++) bass += data[i];
            for (let i = third; i < third * 2; i++) mid += data[i];
            for (let i = third * 2; i < data.length; i++) treble += data[i];
            this.bassEnergy = bass / third / 255;
            this.midEnergy = mid / third / 255;
            this.trebleEnergy = treble / (data.length - third * 2) / 255;
            return data;
        }
        destroy() { try { this.ctx?.close(); } catch {} this.ctx = null; this.active = false; }
    }

    const EQ_PRESETS = Object.freeze({
        flat:        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bassBoost:   [7, 6, 4, 2, 0, 0, 0, 0, 0, 0],
        trebleBoost: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
        vocal:       [-3, -2, 0, 2, 4, 5, 4, 2, 0, -1],
        cinematic:   [6, 5, 3, 0, -1, 0, 2, 4, 5, 6],
        rock:        [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
        electronic:  [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
        podcast:     [-4, -3, -1, 2, 4, 4, 3, 1, -1, -2],
        nightMode:   [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2],
        epic:        [8, 6, 3, 0, 1, 2, 3, 5, 6, 7],
        crystal:     [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
        warm:        [4, 5, 4, 3, 2, 1, 0, -1, -2, -3],
        anime:       [3, 2, 1, 2, 3, 4, 3, 2, 4, 5],
        gaming:      [6, 4, 2, 0, -2, 0, 2, 4, 5, 6],
        hyperion:    [9, 7, 4, 1, 0, 2, 4, 6, 8, 9],
        studio:      [0, 1, 2, 1, 0, -1, 0, 1, 2, 1],
        cinemaMax:   [7, 6, 4, 1, 0, 1, 3, 5, 7, 8],
        nebula:      [5, 6, 4, 2, 1, 3, 5, 7, 8, 9],
    });

    const MODE_PROFILES = Object.freeze({
        cinema:       { ambient: true,  blur: true,  bufferGoal: 60,  eq: 'cinematic',  brightness: 1.0, dialogue: false, spatial: true,  lufs: -18, subBass: 3, harmonic: 0.1 },
        batterySaver: { ambient: false, blur: false, bufferGoal: 20,  eq: 'flat',       brightness: 0.85, dialogue: false, spatial: false, lufs: -16, subBass: 0, harmonic: 0 },
        dataSaver:    { ambient: false, blur: false, bufferGoal: 15,  eq: 'flat',       brightness: 1.0, dialogue: false, spatial: false, lufs: -16, subBass: 0, harmonic: 0 },
        ultraSmooth:  { ambient: true,  blur: true,  bufferGoal: 90,  eq: 'flat',       brightness: 1.0, dialogue: false, spatial: false, lufs: -16, subBass: 0, harmonic: 0 },
        audioOnly:    { ambient: false, blur: false, bufferGoal: 30,  eq: 'flat',       brightness: 0.0, dialogue: false, spatial: false, lufs: -16, subBass: 0, harmonic: 0 },
        standard:     { ambient: true,  blur: true,  bufferGoal: 30,  eq: 'flat',       brightness: 1.0, dialogue: false, spatial: false, lufs: -16, subBass: 0, harmonic: 0 },
        nightOwl:     { ambient: true,  blur: true,  bufferGoal: 30,  eq: 'nightMode',  brightness: 0.75, dialogue: true,  spatial: false, lufs: -22, subBass: -2, harmonic: 0 },
        dialogue:     { ambient: true,  blur: true,  bufferGoal: 30,  eq: 'vocal',      brightness: 1.0, dialogue: true,  spatial: false, lufs: -14, subBass: 0, harmonic: 0 },
        epic:         { ambient: true,  blur: true,  bufferGoal: 60,  eq: 'epic',       brightness: 1.1, dialogue: false, spatial: true,  lufs: -16, subBass: 5, harmonic: 0.2 },
        anime:        { ambient: true,  blur: true,  bufferGoal: 45,  eq: 'anime',      brightness: 1.05, dialogue: true,  spatial: true,  lufs: -16, subBass: 2, harmonic: 0.15 },
        gaming:       { ambient: true,  blur: false, bufferGoal: 30,  eq: 'gaming',     brightness: 1.0, dialogue: true,  spatial: true,  lufs: -14, subBass: 4, harmonic: 0.1 },
        lecture:      { ambient: false, blur: false, bufferGoal: 40,  eq: 'podcast',    brightness: 1.0, dialogue: true,  spatial: false, lufs: -14, subBass: -3, harmonic: 0 },
        hyperion:     { ambient: true,  blur: true,  bufferGoal: 90,  eq: 'hyperion',   brightness: 1.15, dialogue: true,  spatial: true,  lufs: -16, subBass: 6, harmonic: 0.25 },
        studio:       { ambient: false, blur: false, bufferGoal: 60,  eq: 'studio',     brightness: 1.0, dialogue: false, spatial: false, lufs: -23, subBass: 0, harmonic: 0 },
        cinemaMax:    { ambient: true,  blur: true,  bufferGoal: 120, eq: 'cinemaMax',  brightness: 1.1, dialogue: true,  spatial: true,  lufs: -16, subBass: 5, harmonic: 0.2 },
        nebula:       { ambient: true,  blur: true,  bufferGoal: 80,  eq: 'nebula',     brightness: 1.12, dialogue: false, spatial: true,  lufs: -15, subBass: 5, harmonic: 0.22 },
    });

    class GesturePhysics {
        constructor(container, video, callbacks) {
            this.container = container; this.video = video; this.cb = callbacks;
            this.active = false; this.lock = null;
            this.startX = 0; this.startY = 0; this.lastX = 0; this.lastY = 0; this.lastT = 0;
            this.vx = 0; this.vy = 0; this.startTime = 0; this.startVol = 0; this.startBright = 0;
            this.target = null; this.hapticBudget = 3;
            this.pinchStart = null;
            this.longPressTimer = null;
            this.longPressActive = false;
            this.tapHistory = new RingBuffer(5);
        }
        _haptic(ms) { if (Capabilities.vibrate && this.hapticBudget > 0) { try { navigator.vibrate(ms); this.hapticBudget--; } catch {} } }
        start(e) {
            if (e.touches.length === 2) {
                const t1 = e.touches[0], t2 = e.touches[1];
                this.pinchStart = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                return;
            }
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            this.startX = this.lastX = t.clientX; this.startY = this.lastY = t.clientY;
            this.lastT = performance.now(); this.startTime = this.video.currentTime;
            this.startVol = this.cb.getVolume(); this.startBright = this.cb.getBrightness();
            this.lock = null; this.active = false; this.vx = this.vy = 0; this.hapticBudget = 3;
            this.tapHistory.push({ x: t.clientX, y: t.clientY, t: performance.now() });
            this.longPressTimer = setTimeout(() => {
                if (!this.lock) {
                    this.longPressActive = true;
                    this.cb.onLongPress?.();
                    this._haptic(20);
                }
            }, 400);
        }
        move(e) {
            if (e.touches.length === 2 && this.pinchStart) {
                const t1 = e.touches[0], t2 = e.touches[1];
                const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                this.cb.onPinch?.(dist / this.pinchStart);
                e.preventDefault();
                return;
            }
            if (e.touches.length !== 1) return;
            const t = e.touches[0]; const now = performance.now();
            const dt = Math.max(1, now - this.lastT);
            this.vx = (t.clientX - this.lastX) / dt; this.vy = (t.clientY - this.lastY) / dt;
            this.lastX = t.clientX; this.lastY = t.clientY; this.lastT = now;
            const dx = t.clientX - this.startX; const dy = t.clientY - this.startY;
            if (!this.lock) {
                if (Math.abs(dx) > 18 || Math.abs(dy) > 18) {
                    clearTimeout(this.longPressTimer);
                    this.lock = Math.abs(dx) > Math.abs(dy) ? 'seek' : 'vertical';
                    this.active = true; this._haptic(8);
                    this.cb.onLockAcquired?.(this.lock);
                }
                return;
            }
            e.preventDefault();
            if (this.lock === 'seek') {
                const w = this.container.offsetWidth || window.innerWidth;
                const linear = (dx / w) * 90;
                const velocityBonus = Math.sign(this.vx) * Math.min(15, Math.abs(this.vx) * 8);
                const offset = linear + velocityBonus * 0.2;
                const target = Math.max(0, Math.min(this.video.duration || 0, this.startTime + offset));
                this.target = target; this.cb.onSeek(target);
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
            clearTimeout(this.longPressTimer);
            this.pinchStart = null;
            if (this.longPressActive) { this.longPressActive = false; this.cb.onLongPressEnd?.(); return; }
            if (!this.active) return;
            if (this.lock === 'seek' && this.target !== null) { this.cb.onSeekCommit(this.target); this.target = null; }
            this.cb.onEnd(); this.lock = null; this.active = false;
        }
    }

    class ThumbnailTimeline {
        constructor(container, video) {
            this.container = container; this.video = video;
            this.spriteUrl = null; this.spriteCols = 10; this.spriteRows = 10;
            this.thumbW = 180; this.thumbH = 102; this.interval = 10;
            this.preview = null; this.bitmap = null;
        }
        configure({ url, cols, rows, w, h, interval }) {
            this.spriteUrl = url; this.spriteCols = cols || 10; this.spriteRows = rows || 10;
            this.thumbW = w || 180; this.thumbH = h || 102; this.interval = interval || 10;
            if (this.spriteUrl) {
                fetch(this.spriteUrl).then(r => r.blob()).then(createImageBitmap).then(b => { this.bitmap = b; Registry.addBitmap(b); }).catch(() => {});
            }
        }
        mount() {
            this.preview = document.createElement('div');
            this.preview.className = 'tq-thumb-preview';
            this.canvas = document.createElement('canvas');
            this.canvas.width = this.thumbW; this.canvas.height = this.thumbH;
            this.ctx = this.canvas.getContext('2d', { desynchronized: true });
            this.timeLabel = document.createElement('div');
            this.timeLabel.className = 'tq-thumb-time';
            this.chapterLabel = document.createElement('div');
            this.chapterLabel.className = 'tq-thumb-chapter';
            this.preview.appendChild(this.canvas);
            this.preview.appendChild(this.timeLabel);
            this.preview.appendChild(this.chapterLabel);
            this.container.appendChild(this.preview);
        }
        show(time, x, chapterTitle = '') {
            if (!this.preview) return;
            this.preview.style.opacity = '1';
            this.preview.style.left = `${x}px`;
            this.timeLabel.textContent = this._fmt(time);
            this.chapterLabel.textContent = chapterTitle;
            this.chapterLabel.style.display = chapterTitle ? 'block' : 'none';
            if (this.bitmap && this.ctx) {
                const idx = Math.floor(time / this.interval);
                const sx = (idx % this.spriteCols) * this.thumbW;
                const sy = Math.floor(idx / this.spriteCols) * this.thumbH;
                this.ctx.clearRect(0, 0, this.thumbW, this.thumbH);
                try { this.ctx.drawImage(this.bitmap, sx, sy, this.thumbW, this.thumbH, 0, 0, this.thumbW, this.thumbH); } catch {}
            } else if (this.ctx && this.video.readyState >= 2) {
                try { this.ctx.drawImage(this.video, 0, 0, this.thumbW, this.thumbH); } catch {}
            }
        }
        hide() { if (this.preview) this.preview.style.opacity = '0'; }
        _fmt(s) {
            if (!isFinite(s)) return '0:00';
            const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60).toString().padStart(2,'0');
            return h>0 ? `${h}:${m.toString().padStart(2,'0')}:${sec}` : `${m}:${sec}`;
        }
        destroy() { this.preview?.remove(); try { this.bitmap?.close(); } catch {} }
    }

    class IntelligenceEngine {
        constructor(video, governor) {
            this.video = video; this.governor = governor;
            this.worker = spawnWorker(intelligenceWorkerCode, 'tq-intel');
            this.scenes = []; this.motion = new RingBuffer(120);
            this.canvas = document.createElement('canvas');
            this.canvas.width = 64; this.canvas.height = 36;
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            this.lastSample = 0;
            this.currentMotion = 0;
            this.motionAverage = 0;
            this.dominantColor = { r: 0, g: 0, b: 0 };
            this.sampleInterval = 1500;
            this.state = 'sleep';
            this.mode = 'full';
            if (this.worker) {
                this.worker.onmessage = e => {
                    const { type, scene, motion, avgColor } = e.data;
                    if (type === 'RESULT' || type === 'COLOR') {
                        if (scene) { this.scenes.push(scene); if (this.scenes.length > 200) this.scenes.shift(); Bus.emit('scene:detected', scene); }
                        if (motion !== undefined) {
                            this.currentMotion = motion;
                            this.motionAverage = this.motionAverage * 0.9 + motion * 0.1;
                            this.motion.push({ time: e.data.time, value: motion });
                        }
                        if (avgColor) { this.dominantColor = avgColor; Bus.emit('intel:color', avgColor); }
                    }
                };
            }
        }
        sleep() { this.state = 'sleep'; }
        warm() { this.state = 'warm'; this.sampleInterval = 3000; this.mode = 'color'; }
        active() { this.state = 'active'; this.sampleInterval = 1500; this.mode = 'full'; }
        sample() {
            if (this.state === 'sleep' || !this.worker || document.hidden) return;
            const profile = this.governor.getProfile();
            const now = performance.now();
            if (now - this.lastSample < this.sampleInterval) return;
            this.lastSample = now;
            try {
                this.ctx.drawImage(this.video, 0, 0, 64, 36);
                const data = this.ctx.getImageData(0, 0, 64, 36).data;
                const type = this.mode === 'color' || !profile.sceneDetection ? 'COLOR_ONLY' : 'ANALYZE';
                this.worker.postMessage({ type, frame: data, time: this.video.currentTime }, [data.buffer]);
            } catch {}
        }
        setInterval(ms) { this.sampleInterval = Math.max(500, Math.min(8000, ms)); }
        reset() { this.scenes.length = 0; this.motion.clear(); this.currentMotion = 0; this.motionAverage = 0; this.worker?.postMessage({ type: 'RESET' }); }
        getScenes() { return this.scenes.slice(); }
        getDominantColor() { return this.dominantColor; }
    }

    class ContentClassifier {
        constructor(intel, audio) {
            this.intel = intel; this.audio = audio;
            this.classification = 'unknown';
            this.confidence = 0;
            this.evaluations = 0;
        }
        evaluate() {
            this.evaluations++;
            if (this.evaluations < 5) return this.classification;
            const m = this.intel?.motionAverage || 0;
            const sceneCount = this.intel?.scenes?.length || 0;
            const peak = this.audio?.peakLevel || 0;
            const scores = { movie: 0, anime: 0, lecture: 0, gaming: 0, podcast: 0, music: 0 };
            if (m > 0.4) { scores.gaming += 3; scores.anime += 2; }
            if (m < 0.1) { scores.lecture += 4; scores.podcast += 3; }
            if (m > 0.15 && m < 0.35) { scores.movie += 3; scores.anime += 2; }
            if (sceneCount > 20) { scores.movie += 2; scores.anime += 3; scores.gaming += 2; }
            if (sceneCount < 5) { scores.lecture += 3; scores.podcast += 4; }
            if (peak > 0.7) { scores.gaming += 2; scores.music += 3; scores.anime += 1; }
            if (peak < 0.3) { scores.lecture += 2; scores.podcast += 2; }
            let best = 'movie', bestScore = 0;
            for (const k in scores) if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }
            this.classification = best;
            this.confidence = bestScore / 10;
            return best;
        }
        suggestMode() {
            const c = this.classification;
            if (c === 'movie') return 'cinema';
            if (c === 'anime') return 'anime';
            if (c === 'lecture' || c === 'podcast') return 'lecture';
            if (c === 'gaming') return 'gaming';
            if (c === 'music') return 'epic';
            return 'standard';
        }
    }

    class TemporalSmoother {
        constructor(initial = 0, lerp = 0.1) { this.value = initial; this.target = initial; this.lerp = lerp; }
        setTarget(t) { this.target = t; }
        tick() { this.value += (this.target - this.value) * this.lerp; return this.value; }
        snap(v) { this.value = this.target = v; }
    }

    class PerformanceRecorder {
        constructor() {
            this.samples = new RingBuffer(600);
            this.events = new RingBuffer(200);
            this.recording = true;
        }
        record(metrics) { if (!this.recording) return; this.samples.push({ t: performance.now(), ...metrics }); }
        logEvent(name, data) { this.events.push({ t: performance.now(), name, data }); }
        export() {
            return {
                samples: this.samples.toArray(),
                events: this.events.toArray(),
                summary: this._summarize()
            };
        }
        _summarize() {
            const arr = this.samples.toArray();
            if (!arr.length) return {};
            const fps = arr.map(s => s.fps || 0).filter(v => v > 0);
            const drops = arr.map(s => s.dropRate || 0);
            return {
                avgFps: fps.reduce((a,b) => a+b, 0) / Math.max(1, fps.length),
                minFps: Math.min(...fps),
                maxDropRate: Math.max(...drops),
                totalEvents: this.events.length,
            };
        }
        downloadJSON() {
            const data = JSON.stringify(this.export(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `tq-perf-${Date.now()}.json`; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        clear() { this.samples.clear(); this.events.clear(); }
    }

    class PluginRegistry {
        constructor() { this.plugins = new Map(); this.hooks = new Map(); this.permissions = new Map(); }
        register(name, plugin, permissions = []) {
            this.plugins.set(name, plugin);
            this.permissions.set(name, new Set(permissions));
            if (plugin.hooks) for (const [hook, fn] of Object.entries(plugin.hooks)) {
                if (!this.hooks.has(hook)) this.hooks.set(hook, []);
                this.hooks.get(hook).push({ name, fn });
            }
            try { plugin.install?.(); } catch(e) {}
            return this;
        }
        unregister(name) {
            const p = this.plugins.get(name);
            if (!p) return;
            try { p.uninstall?.(); } catch {}
            this.plugins.delete(name);
            this.permissions.delete(name);
            this.hooks.forEach((arr, hook) => { this.hooks.set(hook, arr.filter(h => h.name !== name)); });
        }
        async invoke(hook, ctx) {
            const list = this.hooks.get(hook) || [];
            for (const h of list) {
                try { ctx = await h.fn(ctx) ?? ctx; } catch(e) {}
            }
            return ctx;
        }
        get(name) { return this.plugins.get(name); }
    }

    function setupMediaSession(player) {
        if (!Capabilities.mediaSession) return;
        try { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Titanium Quantum Hyperion Stream' }); } catch {}
        const actions = {
            play: () => player.togglePlay(),
            pause: () => player.togglePlay(),
            seekbackward: e => player.skip(e?.seekOffset ? -e.seekOffset : -10),
            seekforward: e => player.skip(e?.seekOffset ? e.seekOffset : 10),
            seekto: e => { if (e.fastSeek && 'fastSeek' in player.dom.video) player.dom.video.fastSeek(e.seekTime); else player.dom.video.currentTime = e.seekTime; },
            stop: () => { player.dom.video.pause(); player.dom.video.currentTime = 0; },
            nexttrack: () => Bus.emit('media:next'),
            previoustrack: () => Bus.emit('media:prev'),
        };
        for (const [action, handler] of Object.entries(actions)) {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
        }
    }

    class IdleController {
        constructor(container, callbacks) {
            this.container = container;
            this.cb = callbacks || {};
            this.idleTimeout = 2800;
            this.lastActivity = performance.now();
            this.isIdle = false;
            this.timer = null;
            this.locked = false;
        }
        start() {
            const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'keydown', 'wheel', 'pointermove'];
            const activity = () => this.poke();
            events.forEach(ev => Registry.listen(this.container, ev, activity, { passive: true }));
            Registry.listen(this.container, 'mouseleave', () => { if (!this.locked) this._setIdle(true); });
            Registry.listen(this.container, 'pointerleave', () => { if (!this.locked) this._setIdle(true); });
            this.poke();
        }
        poke() {
            this.lastActivity = performance.now();
            if (this.isIdle) this._setIdle(false);
            clearTimeout(this.timer);
            if (!this.locked) {
                this.timer = setTimeout(() => this._setIdle(true), this.idleTimeout);
            }
        }
        forceShow() { this.locked = true; this.poke(); this._setIdle(false); }
        release() { this.locked = false; this.poke(); }
        setTimeout(ms) { this.idleTimeout = ms; this.poke(); }
        _setIdle(idle) {
            if (this.isIdle === idle) return;
            this.isIdle = idle;
            this.container.classList.toggle('is-idle', idle);
            this.cb.onChange?.(idle);
        }
        destroy() { clearTimeout(this.timer); }
    }

    class TitaniumQuantumPlayer {
        constructor() {
            this.dom = {}; this.audio = null; this.ambient = null;
            this.governor = new PerformanceGovernor();
            this.subtitles = null; this.gesture = null; this.thumbnails = null;
            this.intel = null;
            this.predictiveBuffer = null; this.classifier = null;
            this.telemetryWorker = null; this.thumbWorker = null;
            this.plugins = new PluginRegistry();
            this.subsystems = new SubsystemController();
            this.fsm = new SystemStateMachine();
            this.recorder = new PerformanceRecorder();
            this.brightnessSmoother = new TemporalSmoother(1, 0.12);
            this.particles = null;
            this.idleCtrl = null;
            this.network = { stallCount: 0, retryCount: 0, lastSave: 0, lastTime: 0, hlsObj: null, dashObj: null, wakelock: null };
            this.prefs = { volume: 1, muted: false, speed: 1, quality: 'auto', ambient: true, eqPreset: 'flat', mode: 'standard', spatial: false, dialogue: false, subFontSize: 22, autoMode: false };
            this.chapters = []; this.heatmap = null;
            this._stateBatch = new Set(); this._batchScheduled = false;
            this.sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            this.sessionStart = Date.now();
            this._scrubActive = false;
            this._scrubTimer = null;
            this._stableSince = 0;
            this._bootStage = 'core';
            this._telemetryBuffer = [];
            this._telemetryFlushTimer = null;
            this._raw = {
                storageKey: 'TitaniumQuantum_Hyperion_v17',
                playing: false, seeking: false, buffering: false, idle: false,
                fullscreen: false, pip: false, isOnline: navigator.onLine,
                gestureLock: null, hasInteracted: false, debugMode: false,
                currentChapter: null, brightness: 1, currentMsgId: null,
                pageVisible: !document.hidden, frozen: false,
                contentType: 'unknown', zoom: 1, locked: false,
                userInteracting: false,
            };
            this.state = new Proxy(this._raw, {
                set: (t, p, v) => { const old = t[p]; t[p] = v; if (old !== v) this._batchStateChange(p, v, old); return true; }
            });
            this._throttledProgress = Scheduler.rafThrottle(() => this._updateProgress());
            this._throttledUI = Scheduler.throttle(() => this._updateUI(), 250);
            this._setupFSM();
        }

        _setupFSM() {
            this.fsm.define('boot', { enter: () => Bus.emit('fsm:boot') });
            this.fsm.define('core', { enter: () => this._bootStage = 'core' });
            this.fsm.define('warm', { enter: () => this._bootStage = 'warm' });
            this.fsm.define('cinematic', { enter: () => this._bootStage = 'cinematic' });
            this.fsm.define('scrub', {
                enter: () => this._enterScrubMode(),
                exit: () => this._exitScrubMode()
            });
            this.fsm.define('background', {
                enter: () => this._enterBackground(),
                exit: () => this._exitBackground()
            });
            this.fsm.define('critical', {
                enter: () => this._enterCriticalMode(),
                exit: () => this._exitCriticalMode()
            });
        }

        async init(videoId = 'dahihPlayer', containerId = 'videoContainer') {
            this.dom.video = document.getElementById(videoId);
            this.dom.container = document.getElementById(containerId);
            if (!this.dom.video || !this.dom.container) { console.warn('[TitaniumQuantum] Video or container not found.'); return; }
            await this.fsm.transition('core');
            this._injectStyles(); this._bindUI(); this._loadPrefs();
            this.dom.video.crossOrigin = 'anonymous'; this.dom.video.preload = 'auto'; this.dom.video.playsInline = true;
            this.audio = new AudioEngine(this.dom.video);
            this.ambient = new WebGLAmbientRenderer(this.dom.container, this.dom.video, this.governor, this.subsystems);
            this.subtitles = new SubtitleEngine(this.dom.captionsContainer);
            this.thumbnails = new ThumbnailTimeline(this.dom.container, this.dom.video);
            this.intel = new IntelligenceEngine(this.dom.video, this.governor);
            this.predictiveBuffer = new PredictiveBuffer(this.dom.video, this.governor);
            this.classifier = new ContentClassifier(this.intel, this.audio);
            this.particles = new ParticleField(this.dom.container);
            this.particles.mount();
            this.idleCtrl = new IdleController(this.dom.container, {
                onChange: (idle) => {
                    this.state.idle = idle;
                    Bus.emit(idle ? 'ui:hide' : 'ui:show');
                }
            });
            this._registerSubsystems();
            this.gesture = new GesturePhysics(this.dom.container, this.dom.video, {
                getVolume: () => this.prefs.volume,
                getBrightness: () => this.state.brightness,
                onSeek: (t) => this._showOverlay('seek', t),
                onSeekCommit: (t) => { this.predictiveBuffer.recordSeek(this.dom.video.currentTime, t); this.dom.video.currentTime = t; this._reportHeatmap(t, 'seek'); this._burstAt(window.innerWidth / 2, window.innerHeight / 2, 18); },
                onVolume: (v) => { this.setVolume(v); this._showOverlay('volume', v / 3); },
                onBrightness: (b) => { this.state.brightness = b; this.brightnessSmoother.setTarget(b); this._showOverlay('brightness', b / 2); },
                onPinch: (scale) => { this.setZoom(this.state.zoom * scale); },
                onLongPress: () => { this.dom.video.playbackRate = Math.min(3, this.prefs.speed * 2); this.toast('⚡ 2× سرعة فائقة'); this._showSpeedRing(true); },
                onLongPressEnd: () => { this.dom.video.playbackRate = this.prefs.speed; this._showSpeedRing(false); },
                onLockAcquired: (lock) => { if (lock === 'seek') this.fsm.transition('scrub'); },
                onEnd: () => { this._hideOverlays(); if (this.fsm.is('scrub')) this._scheduleScrubExit(); },
            });
            this._initWorkers();
            this._attachListeners(); this._wireBus();
            setupMediaSession(this); this._setupAccessibility();
            this.thumbnails.mount();
            this._createDebugHUD(); this._createBoostBadge(); this._createHeatmapBar();
            this._createSpectrumVisualizer(); this._createLoadingRing();
            this._createSpeedRing(); this._createFlashLayer(); this._createWaveform();
            this._createCornerGlow(); this._createScanLine();
            this._registerEngineTasks();
            this.idleCtrl.start();
            Engine.start();
            this._startBackgroundEngines(); this._applyPrefs();
            this._loadUserProfile();
            this._scheduleProgressiveEnhancement();
            console.log('%c⚡ TitaniumQuantum v17 Hyperion-Optimized', 'color:#0ea5e9;font-weight:900;font-size:18px;text-shadow:0 0 10px #0ea5e9;');
            console.log('%cTier:', 'color:#fbbf24;font-weight:700', Capabilities.tier, '| Cores:', Capabilities.hardwareConcurrency, '| Memory:', (Capabilities.deviceMemory || '?') + 'GB', '| WebGL2:', Capabilities.webGL2);
            Bus.emit('player:ready');
        }

        _registerSubsystems() {
            this.subsystems.register('ambient', {
                priority: 60,
                sleep: () => { this.ambient.sleep(); },
                warm: () => { this.ambient.mount(); this.ambient.warm(); },
                active: () => { this.ambient.mount(); this.ambient.active(); },
                destroy: () => this.ambient.destroy(),
            });
            this.subsystems.register('intel', {
                priority: 70,
                sleep: () => this.intel.sleep(),
                warm: () => this.intel.warm(),
                active: () => this.intel.active(),
            });
            this.subsystems.register('audio-advanced', {
                priority: 50,
                sleep: () => this.audio.sleep(),
                warm: () => this.audio.warm(),
                active: () => this.audio.wake(),
            });
            this.subsystems.register('spectrum', {
                priority: 90,
                sleep: () => { if (this.dom.spectrum) this.dom.spectrum.style.opacity = '0'; },
                warm: () => {},
                active: () => {},
            });
            this.subsystems.register('particles', {
                priority: 95,
                sleep: () => { this.particles?.clear(); if (this.particles?.canvas) this.particles.canvas.style.opacity = '0'; },
                warm: () => { if (this.particles?.canvas) this.particles.canvas.style.opacity = '0.5'; },
                active: () => { if (this.particles?.canvas) this.particles.canvas.style.opacity = '1'; },
            });
            this.subsystems.register('telemetry', {
                priority: 80,
                sleep: () => { Engine.pause('telemetry-sample'); },
                warm: () => { Engine.resume('telemetry-sample'); },
                active: () => { Engine.resume('telemetry-sample'); },
            });
        }

        _registerEngineTasks() {
            Engine.register('progress-update', () => { if (!this.state.seeking) this._throttledProgress(); }, { priority: 'high', budget: 0.5, condition: () => this.state.playing });
            Engine.register('ui-update', () => this._throttledUI(), { priority: 'normal', budget: 0.4, interval: 250, condition: () => this.state.playing });
            Engine.register('subtitles', () => this.subtitles?.update(this.dom.video.currentTime), { priority: 'high', budget: 0.5, condition: () => this.state.playing && !this._scrubActive });
            Engine.register('ambient-draw', () => this.ambient?.draw(), { priority: 'low', budget: 1.5, condition: () => this.state.playing && !this._scrubActive && this.ambient?.state !== 'sleep' });
            Engine.register('intel-sample', () => this.intel?.sample(), { priority: 'idle', budget: 1.5, interval: 1500, condition: () => this.state.playing && !this._scrubActive && this.intel?.state !== 'sleep' });
            Engine.register('brightness-smooth', () => {
                const b = this.brightnessSmoother.tick();
                const current = parseFloat(this.dom.video.style.filter.match(/brightness\(([\d.]+)\)/)?.[1] || 1);
                if (Math.abs(b - current) > 0.015) {
                    const sat = 1 + (this.classifier.classification === 'anime' ? 0.15 : 0);
                    this.dom.video.style.filter = `brightness(${b.toFixed(2)}) saturate(${sat})`;
                }
            }, { priority: 'low', budget: 0.2 });
            Engine.register('spectrum', () => this._updateSpectrum(), { priority: 'idle', budget: 0.4, interval: 60, condition: () => this.state.playing && this.dom.spectrum && this.dom.spectrum.style.opacity !== '0' && !this._scrubActive });
            Engine.register('particles', () => { this.particles?.ambient(); this.particles?.tick(); }, { priority: 'idle', budget: 1.0, condition: () => !this._scrubActive && this.particles && this.subsystems.get('particles')?.state !== 'sleep' });
            Engine.register('audio-pulse', () => {
                if (!this.audio.active) return;
                this.audio.getSpectrum();
                const energy = (this.audio.bassEnergy + this.audio.midEnergy * 0.5) * 0.7;
                if (this.ambient) this.ambient.setPulse(energy);
                if (this.dom.glowL) {
                    const intensity = this.audio.bassEnergy;
                    this.dom.glowL.style.opacity = intensity.toFixed(2);
                    this.dom.glowR.style.opacity = intensity.toFixed(2);
                }
                if (this.dom.waveformBars && this.dom.waveformBars.length) this._updateWaveform();
            }, { priority: 'idle', budget: 0.3, interval: 50, condition: () => this.state.playing && this.audio?.active && !this._scrubActive }),
            Engine.register('telemetry-sample', () => { this.governor.sample(this.dom.video); this.recorder.record({ fps: this.governor.fps, dropRate: this.governor.dropRate, motion: this.intel.currentMotion, thermal: this.governor.thermalLevel }); }, { priority: 'idle', budget: 0.4, interval: 1000, condition: () => this.state.playing });
            Engine.register('debug-hud', () => this._updateDebugHUD(), { priority: 'idle', budget: 0.6, interval: 1000, condition: () => this.state.debugMode });
            Engine.register('stability-check', () => this._checkStability(), { priority: 'idle', budget: 0.2, interval: 2000 });
        }

        _scheduleProgressiveEnhancement() {
            Registry.setTimeout('enhance-warm', async () => {
                if (this._bootStage !== 'core') return;
                await this.fsm.transition('warm');
                if (this.prefs.ambient && !Capabilities.lowPower) this.subsystems.setState('ambient', 'warm');
                this.subsystems.setState('intel', 'warm');
                this.subsystems.setState('telemetry', 'warm');
                this.subsystems.setState('particles', 'warm');
            }, 2000);
            Registry.setTimeout('enhance-cinematic', async () => {
                if (!this.governor.canEnableHeavyFeatures()) return;
                await this.fsm.transition('cinematic');
                if (this.prefs.ambient && !Capabilities.lowPower) this.subsystems.setState('ambient', 'active');
                this.subsystems.setState('intel', 'active');
                this.subsystems.setState('audio-advanced', 'active');
                if (this.governor.getProfile().particles) this.subsystems.setState('particles', 'active');
            }, 5000);
        }

        _checkStability() {
            if (this.governor.canEnableHeavyFeatures()) {
                this._stableSince = this._stableSince || performance.now();
                if (performance.now() - this._stableSince > 8000 && this.fsm.current !== 'cinematic' && !this.fsm.is('scrub') && !this.fsm.is('background')) {
                    this.fsm.transition('cinematic');
                    if (this.prefs.ambient && !Capabilities.lowPower) this.subsystems.setState('ambient', 'active');
                    this.subsystems.setState('intel', 'active');
                }
            } else {
                this._stableSince = 0;
            }
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

        _initWorkers() {
            this.telemetryWorker = spawnWorker(telemetryWorkerCode, 'tq-telemetry');
            this.thumbWorker = spawnWorker(thumbnailWorkerCode, 'tq-thumbs');
            if (this.telemetryWorker) {
                this.telemetryWorker.onmessage = e => Bus.emit('worker:msg', e.data);
                this.telemetryWorker.onerror = e => Bus.emit('error', ErrorTaxonomy.WORKER_FAILURE, e);
            }
        }

        _wireBus() {
            Bus.on('thermal:change', ({ level }) => {
                if (level === 'critical') { this.toast(`⚠️ تخفيف الأداء — وضع حماية`, 'warning'); this.fsm.transition('critical'); }
                if (level === 'normal' && this.fsm.is('critical')) { this.fsm.transition(this._bootStage === 'cinematic' ? 'cinematic' : 'warm'); this.toast(`✅ الأداء عاد طبيعي`, 'info'); }
                if (this.network.hlsObj) this.predictiveBuffer.adjustHlsConfig(this.network.hlsObj);
                this.recorder.logEvent('thermal', { level });
            });
            Bus.on('intel:color', (c) => { this.ambient?.setTint(c.r, c.g, c.b); this.particles?.setTint(c.r, c.g, c.b); this._updateAccentColor(c); });
            Bus.on('memory:high', () => { this.toast('🧹 تنظيف الذاكرة...', 'warning'); Registry.partialCleanup(); if (this.thumbWorker) this.thumbWorker.postMessage({ type: 'CLEAR' }); });
            Bus.on('scene:detected', ({ time }) => {
                if (!this.chapters?.length) {
                    const last = this._autoChapters?.[this._autoChapters?.length - 1];
                    if (!last || time - last.start > 30) {
                        this._autoChapters = this._autoChapters || [];
                        this._autoChapters.push({ start: time, end: time + 60, title: `مشهد ${this._autoChapters.length + 1}`, auto: true });
                    }
                }
                this._flashScene();
            });
            Bus.on('error', (taxonomy, raw) => {
                this.recorder.logEvent('error', { code: taxonomy.code });
                if (taxonomy.severity === 'error') this.toast(`❌ ${taxonomy.code}`, 'error');
            });
            Bus.on('worker:msg', (msg) => { if (msg.type === 'ERROR') Bus.emit('error', ErrorTaxonomy.WORKER_FAILURE, msg.error); });
        }

        _enterScrubMode() {
            if (this._scrubActive) return;
            this._scrubActive = true;
            this.subsystems.setState('ambient', 'sleep');
            this.subsystems.setState('intel', 'sleep');
            this.subsystems.setState('spectrum', 'sleep');
            this.subsystems.setState('particles', 'sleep');
            this.subtitles?.setMinimal(true);
            this.dom.container.classList.add('is-scrubbing');
            this._stableSince = 0;
        }
        _exitScrubMode() {
            this._scrubActive = false;
            this.dom.container.classList.remove('is-scrubbing');
            this.subtitles?.setMinimal(false);
            const target = this.fsm.current === 'cinematic' ? 'active' : 'warm';
            if (this.prefs.ambient && !Capabilities.lowPower) this.subsystems.setState('ambient', target);
            this.subsystems.setState('intel', target);
            this.subsystems.setState('spectrum', target);
            if (this.governor.getProfile().particles) this.subsystems.setState('particles', target);
        }
        _scheduleScrubExit() {
            clearTimeout(this._scrubTimer);
            this._scrubTimer = setTimeout(() => { if (this.fsm.is('scrub')) this.fsm.transition(this._bootStage); }, 400);
        }

        _enterBackground() {
            this.subsystems.setAll('sleep');
            Engine.setBudget(20);
            this._flushTelemetry();
        }
        _exitBackground() {
            Engine.setBudget(this.governor.getProfile().frameBudgetMs);
            const target = this.fsm.current === 'cinematic' ? 'active' : 'warm';
            if (this.prefs.ambient && !Capabilities.lowPower) this.subsystems.setState('ambient', target);
            this.subsystems.setState('intel', target);
            this.subsystems.setState('telemetry', target);
        }
        _enterCriticalMode() {
            this.subsystems.setState('ambient', 'sleep');
            this.subsystems.setState('intel', 'sleep');
            this.subsystems.setState('spectrum', 'sleep');
            this.subsystems.setState('particles', 'sleep');
            this.subsystems.setState('audio-advanced', 'sleep');
            Engine.setBudget(20);
        }
        _exitCriticalMode() {
            Engine.setBudget(this.governor.getProfile().frameBudgetMs);
            if (this.prefs.ambient && !Capabilities.lowPower) this.subsystems.setState('ambient', 'warm');
            this.subsystems.setState('intel', 'warm');
        }

        _batchStateChange(prop, val, old) {
            this._stateBatch.add({ prop, val, old });
            if (this._batchScheduled) return;
            this._batchScheduled = true;
            queueMicrotask(() => {
                const changes = Array.from(this._stateBatch);
                this._stateBatch.clear(); this._batchScheduled = false;
                changes.forEach(c => this._applyStateChange(c.prop, c.val, c.old));
            });
        }

        _applyStateChange(prop, val, old) {
            if (!this.dom.container) return;
            switch (prop) {
                case 'playing':
                    if (this.dom.playBtn) this.dom.playBtn.classList.toggle('is-visible', !val);
                    if (Capabilities.mediaSession) navigator.mediaSession.playbackState = val ? 'playing' : 'paused';
                    if (val) { this.idleCtrl.poke(); } else { this.idleCtrl.forceShow(); }
                    val ? this._acquireWakeLock() : this._releaseWakeLock();
                    this.recorder.logEvent(val ? 'play' : 'pause', { time: this.dom.video?.currentTime });
                    if (val) this._flashLayer('play');
                    break;
                case 'buffering':
                    this.dom.container.classList.toggle('is-buffering', val);
                    if (val) { this.recorder.logEvent('buffer-start', {}); }
                    else this.recorder.logEvent('buffer-end', {});
                    break;
                case 'idle': this.dom.container.classList.toggle('is-idle', val); break;
                case 'seeking':
                    this.dom.container.classList.toggle('is-seeking', val);
                    if (val) this.fsm.transition('scrub'); else if (this.fsm.is('scrub')) this._scheduleScrubExit();
                    break;
                case 'fullscreen':
                    this.dom.container.classList.toggle('is-fullscreen', val);
                    if (Capabilities.screenOrientation) {
                        try { val ? screen.orientation.lock('landscape').catch(()=>{}) : screen.orientation.unlock(); } catch {}
                    }
                    break;
                case 'debugMode': if (this.dom.debugHud) this.dom.debugHud.style.display = val ? 'block' : 'none'; break;
                case 'pageVisible':
                    if (!val) this.fsm.transition('background');
                    else if (this.fsm.is('background')) this.fsm.transition(this._bootStage);
                    break;
                case 'frozen': if (val) { this.dom.video.pause(); this._flushTelemetry(); } break;
                case 'zoom': this.dom.video.style.transform = `scale(${val})`; break;
                case 'locked': this.dom.container.classList.toggle('is-locked', val); break;
            }
        }

        async loadMedia(src, type, msgId = null, chapters = [], subtitlesUrl = null, thumbnailConfig = null) {
            this.state.currentMsgId = msgId;
            this.chapters = chapters; this._autoChapters = null;
            this.state.buffering = true; this.network.retryCount = 0;
            this.intel.reset();
            this.recorder.logEvent('media-load', { msgId });
            this._loadHeatmap(msgId);
            this._renderChapterMarkers();
            if (subtitlesUrl) this.subtitles.loadVTT(subtitlesUrl); else this.subtitles.clear();
            if (thumbnailConfig) this.thumbnails.configure(thumbnailConfig);
            if (this.network.hlsObj) { try { this.network.hlsObj.destroy(); } catch {} this.network.hlsObj = null; }
            if (this.network.dashObj) { try { this.network.dashObj.reset(); } catch {} this.network.dashObj = null; }
            this.dom.video.pause();
            const isHls = type === 'application/x-mpegURL' || src.includes('.m3u8');
            const isDash = type === 'application/dash+xml' || src.includes('.mpd');
            if (isHls) {
                if (Capabilities.hls && Hls.isSupported()) {
                    const profile = this.governor.getProfile();
                    this.network.hlsObj = new Hls({
                        maxBufferLength: profile.bufferGoal,
                        maxMaxBufferLength: profile.bufferGoal * 6,
                        capLevelToPlayerSize: true,
                        startLevel: -1,
                        abrEwmaDefaultEstimate: 500000,
                        enableWorker: true,
                        lowLatencyMode: false,
                        backBufferLength: 30,
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
                } else Bus.emit('error', ErrorTaxonomy.SOURCE_UNSUPPORTED);
            } else if (isDash) {
                if (Capabilities.dash) {
                    this.network.dashObj = dashjs.MediaPlayer().create();
                    this.network.dashObj.initialize(this.dom.video, src, false);
                } else Bus.emit('error', ErrorTaxonomy.SOURCE_UNSUPPORTED);
            } else this.dom.video.src = src;
            this.dom.video.load();
            try { await this.dom.video.play(); } catch { this.toast('اضغط للتشغيل', 'info'); }
            this._tryInstantResume(msgId);
        }

        _tryInstantResume(msgId) {
            if (!msgId) return;
            try {
                const saved = JSON.parse(localStorage.getItem(`${this._raw.storageKey}_resume_${msgId}`));
                if (saved && saved.time > 5) {
                    const onMeta = () => {
                        if (saved.time < this.dom.video.duration - 5) {
                            this.dom.video.currentTime = saved.time;
                            this.toast(`⏯️ تمت المتابعة من ${this._formatTime(saved.time)}`);
                        }
                        this.dom.video.removeEventListener('loadedmetadata', onMeta);
                    };
                    if (this.dom.video.readyState >= 1) onMeta();
                    else this.dom.video.addEventListener('loadedmetadata', onMeta);
                }
            } catch {}
        }

        _saveResume() {
            if (!this.state.currentMsgId || !this.dom.video) return;
            try {
                localStorage.setItem(`${this._raw.storageKey}_resume_${this.state.currentMsgId}`,
                    JSON.stringify({ time: this.dom.video.currentTime, dur: this.dom.video.duration, ts: Date.now() }));
            } catch {}
        }

        _loadUserProfile() {
            if (!this.telemetryWorker) return;
            const reqId = Date.now();
            const handler = (msg) => {
                if (msg.type === 'PROFILE' && msg.reqId === reqId) {
                    if (msg.data) Object.assign(this.prefs, msg.data);
                    off();
                }
            };
            const off = Bus.on('worker:msg', handler);
            this.telemetryWorker.postMessage({ type: 'GET_PROFILE', key: 'user_prefs', reqId });
        }

        _saveUserProfile() {
            if (!this.telemetryWorker) return;
            this.telemetryWorker.postMessage({ type: 'SAVE_PROFILE', key: 'user_prefs', data: this.prefs });
        }

        _loadHeatmap(msgId) {
            if (!msgId || !this.telemetryWorker) return;
            const reqId = Date.now();
            const handler = (msg) => {
                if (msg.type === 'HEATMAP_DATA' && msg.reqId === reqId) {
                    this.heatmap = msg.data; this._renderHeatmap();
                    off();
                }
            };
            const off = Bus.on('worker:msg', handler);
            this.telemetryWorker.postMessage({ type: 'GET_HEATMAP', msgId, reqId });
        }

        _reportHeatmap(time, kind = 'watched') {
            if (!this.state.currentMsgId || !this.telemetryWorker) return;
            this.telemetryWorker.postMessage({ type: 'HEATMAP', msgId: this.state.currentMsgId, second: Math.floor(time / 5) * 5, kind });
        }

        _bufferTelemetry(payload) {
            this._telemetryBuffer.push(payload);
            if (!this._telemetryFlushTimer) {
                this._telemetryFlushTimer = setTimeout(() => {
                    if (this.telemetryWorker && this._telemetryBuffer.length) {
                        this.telemetryWorker.postMessage({ type: 'PUSH_BATCH', batch: this._telemetryBuffer });
                        this._telemetryBuffer = [];
                    }
                    this._telemetryFlushTimer = null;
                }, 5000);
            }
        }

        _renderHeatmap() {
            if (!this.dom.heatmapBar || !this.heatmap || !this.dom.video.duration) return;
            const dur = this.dom.video.duration;
            const buckets = 80;
            const arr = new Array(buckets).fill(0);
            const data = this.heatmap.replays || {};
            for (const k in data) {
                const idx = Math.min(buckets - 1, Math.floor((+k / dur) * buckets));
                arr[idx] += data[k];
            }
            const max = Math.max(1, ...arr);
            while (this.dom.heatmapBar.firstChild) this.dom.heatmapBar.removeChild(this.dom.heatmapBar.firstChild);
            const frag = document.createDocumentFragment();
            arr.forEach(v => {
                const seg = document.createElement('div');
                seg.className = 'tq-heat-seg';
                seg.style.height = `${(v / max) * 100}%`;
                frag.appendChild(seg);
            });
            this.dom.heatmapBar.appendChild(frag);
        }

        _renderChapterMarkers() {
            if (!this.dom.chapterMarkers || !this.dom.video.duration) return;
            while (this.dom.chapterMarkers.firstChild) this.dom.chapterMarkers.removeChild(this.dom.chapterMarkers.firstChild);
            const chapters = this.chapters?.length ? this.chapters : (this._autoChapters || []);
            const dur = this.dom.video.duration;
            const frag = document.createDocumentFragment();
            chapters.forEach(ch => {
                const marker = document.createElement('div');
                marker.className = 'tq-chapter-marker';
                marker.style.left = `${(ch.start / dur) * 100}%`;
                marker.title = ch.title;
                frag.appendChild(marker);
            });
            this.dom.chapterMarkers.appendChild(frag);
        }

        _updateProgress() {
            const v = this.dom.video;
            if (!v || !isFinite(v.duration) || this.state.seeking) return;
            const pct = v.currentTime / v.duration;
            if (this.dom.progressBar) this.dom.progressBar.style.transform = `scaleX(${pct})`;
            if (Math.floor(v.currentTime) % 5 === 0) { this._reportHeatmap(v.currentTime, 'watched'); this.predictiveBuffer.recordWatch(v.currentTime); }
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
            const chapters = this.chapters?.length ? this.chapters : (this._autoChapters || []);
            if (chapters.length && this.dom.chapterEl) {
                const ct = v.currentTime;
                const ch = chapters.find(c => ct >= c.start && ct < c.end);
                if (ch && ch !== this.state.currentChapter) {
                    this.state.currentChapter = ch;
                    this.dom.chapterEl.textContent = ch.title || '';
                }
            }
        }

        _updateSpectrum() {
            const data = this.audio.getSpectrum();
            if (!data || !this.dom.spectrum) return;
            const bars = this.dom.spectrum.children;
            const step = Math.floor(data.length / bars.length);
            for (let i = 0; i < bars.length; i++) {
                const v = data[i * step] / 255;
                bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
            }
        }

        _updateWaveform() {
            const data = this.audio.getSpectrum();
            if (!data || !this.dom.waveformBars) return;
            const step = Math.floor(data.length / this.dom.waveformBars.length);
            for (let i = 0; i < this.dom.waveformBars.length; i++) {
                const v = data[i * step] / 255;
                this.dom.waveformBars[i].style.height = `${(v * 100).toFixed(0)}%`;
            }
        }

        _updateAccentColor(c) {
            const bright = (c.r + c.g + c.b) / 3;
            const factor = bright < 80 ? 1.8 : bright < 150 ? 1.3 : 1;
            const r = Math.min(255, Math.round(c.r * factor));
            const g = Math.min(255, Math.round(c.g * factor));
            const b = Math.min(255, Math.round(c.b * factor));
            document.documentElement.style.setProperty('--tq-accent', `rgb(${r},${g},${b})`);
            document.documentElement.style.setProperty('--tq-accent-soft', `rgba(${r},${g},${b},0.4)`);
        }

        _attachListeners() {
            const v = this.dom.video;
            const l = Registry.listen.bind(Registry);
            l(v, 'play', () => { this.state.playing = true; this.state.hasInteracted = true; if (!this.audio.active) this.audio.init(); this.audio.resume(); });
            l(v, 'pause', () => { this.state.playing = false; this._saveResume(); });
            l(v, 'waiting', () => this.state.buffering = true);
            l(v, 'playing', () => { this.state.buffering = false; this.network.retryCount = 0; });
            l(v, 'seeking', () => this.state.seeking = true);
            l(v, 'seeked', () => this.state.seeking = false);
            l(v, 'ended', () => { this.state.playing = false; this._flushTelemetry(); this._saveResume(); Bus.emit('media:ended'); });
            l(v, 'error', e => { Bus.emit('error', ErrorTaxonomy.MEDIA_DECODE_ERROR, e); this._recoverStream(); });
            l(v, 'loadedmetadata', () => { Bus.emit('media:metadata', { duration: v.duration }); this._renderHeatmap(); this._renderChapterMarkers(); });
            l(v, 'click', (e) => { this.togglePlay(); this._burstAt(e.clientX, e.clientY, 12); });
            l(v, 'enterpictureinpicture', () => this.state.pip = true);
            l(v, 'leavepictureinpicture', () => this.state.pip = false);
            l(v, 'touchstart', e => this.gesture.start(e), { passive: true });
            l(v, 'touchmove', e => this.gesture.move(e), { passive: false });
            l(v, 'touchend', () => this.gesture.end(), { passive: true });
            l(v, 'wheel', e => this._handleWheel(e), { passive: false });
            if (this.dom.playBtn) l(this.dom.playBtn, 'click', () => this.togglePlay());
            if (this.dom.muteBtn) l(this.dom.muteBtn, 'click', e => { e.stopPropagation(); this.setVolume(this.dom.video.muted ? 1 : 0); });
            if (this.dom.speedBtn) l(this.dom.speedBtn, 'click', e => { e.stopPropagation(); this.cycleSpeed(); });
            if (this.dom.progress) {
                l(this.dom.progress, 'pointerdown', e => { this.state.seeking = true; e.target.setPointerCapture?.(e.pointerId); this._scrubTo(e); });
                l(this.dom.progress, 'pointermove', e => { if (!this.state.seeking) this._hoverScrub(e); }, { passive: true });
                l(this.dom.progress, 'pointerleave', () => { this.thumbnails.hide(); });
                l(document, 'pointermove', e => { if (this.state.seeking) this._scrubTo(e); }, { passive: false });
                l(document, 'pointerup', e => {
                    if (!this.state.seeking) return;
                    this.state.seeking = false;
                    e.target.releasePointerCapture?.(e.pointerId);
                    if (this.gesture.target !== null) { this.predictiveBuffer.recordSeek(this.dom.video.currentTime, this.gesture.target); this.dom.video.currentTime = this.gesture.target; }
                    this.thumbnails.hide(); this._hideOverlays();
                });
            }
            l(document, 'keydown', e => this._handleKeys(e));
            l(document, 'fullscreenchange', () => this.state.fullscreen = !!document.fullscreenElement);
            l(document, 'webkitfullscreenchange', () => this.state.fullscreen = !!document.webkitFullscreenElement);
            l(window, 'online', () => { this.state.isOnline = true; this._flushTelemetry(); this.toast('✅ عاد الاتصال'); });
            l(window, 'offline', () => { this.state.isOnline = false; this.toast('❌ أنت الآن دون اتصال', 'error'); Bus.emit('error', ErrorTaxonomy.NETWORK_OFFLINE); });
            l(document, 'visibilitychange', () => { this.state.pageVisible = !document.hidden; });
            if (Capabilities.pageLifecycle) {
                l(document, 'freeze', () => this.state.frozen = true);
                l(document, 'resume', () => this.state.frozen = false);
            }
            l(window, 'pagehide', () => { this._flushTelemetry(); this._saveResume(); this._saveSession(); this._saveUserProfile(); });
            l(window, 'beforeunload', () => { this._flushTelemetry(); this._saveResume(); this._saveSession(); this._saveUserProfile(); });
            if (this.dom.tapLeft) l(this.dom.tapLeft, 'dblclick', (e) => { this.skip(-10); this._burstAt(e.clientX, e.clientY, 16, { r: 239, g: 68, b: 68 }); });
            if (this.dom.tapRight) l(this.dom.tapRight, 'dblclick', (e) => { this.skip(10); this._burstAt(e.clientX, e.clientY, 16, { r: 34, g: 197, b: 94 }); });
        }

        _handleKeys(e) {
            const tag = document.activeElement?.tagName;
            if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement?.isContentEditable || !this.dom.video) return;
            if (this.state.locked && e.code !== 'KeyU') return;
            const map = {
                'Space': () => this.togglePlay(),
                'KeyK': () => this.togglePlay(),
                'KeyF': () => this.toggleFullscreen(),
                'KeyM': () => this.setVolume(this.dom.video.muted ? 1 : 0),
                'KeyP': () => this.togglePiP(),
                'KeyD': () => this.state.debugMode = !this.state.debugMode,
                'KeyE': () => this.cycleEQ(),
                'KeyC': () => this.cycleMode(),
                'KeyS': () => this.toggleSpatial(),
                'KeyV': () => this.toggleDialogue(),
                'KeyA': () => this.toggleAutoMode(),
                'KeyR': () => this.recorder.downloadJSON(),
                'KeyJ': () => this.skip(-10),
                'KeyL': () => this.skip(10),
                'KeyN': () => this.jumpToNextScene(),
                'KeyB': () => this.jumpToPrevScene(),
                'KeyU': () => this.toggleLock(),
                'KeyH': () => this.jumpToHotZone(),
                'Equal': () => this.setZoom(this.state.zoom + 0.1),
                'Minus': () => this.setZoom(this.state.zoom - 0.1),
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
            for (let i = 1; i <= 9; i++) {
                if (e.code === `Digit${i}`) { e.preventDefault(); this.dom.video.currentTime = (this.dom.video.duration || 0) * (i / 10); return; }
            }
            if (map[e.code]) { e.preventDefault(); map[e.code](); }
        }

        _handleWheel(e) {
            e.preventDefault();
            if (e.target.closest('#progressContainer')) this.skip(e.deltaY < 0 ? 5 : -5);
            else if (e.ctrlKey || e.metaKey) this.setZoom(this.state.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
            else this.setVolume(this.prefs.volume + (e.deltaY < 0 ? 0.05 : -0.05));
        }

        _scrubTo(e) {
            e.preventDefault();
            const rect = this.dom.progress.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.gesture.target = pct * this.dom.video.duration;
            if (this.dom.progressBar) this.dom.progressBar.style.transform = `scaleX(${pct})`;
            const chapters = this.chapters?.length ? this.chapters : (this._autoChapters || []);
            const ch = chapters.find(c => this.gesture.target >= c.start && this.gesture.target < c.end);
            this.thumbnails.show(this.gesture.target, e.clientX - rect.left, ch?.title || '');
            this._showOverlay('seek', this.gesture.target);
        }
        _hoverScrub(e) {
            const rect = this.dom.progress.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const t = pct * (this.dom.video.duration || 0);
            const chapters = this.chapters?.length ? this.chapters : (this._autoChapters || []);
            const ch = chapters.find(c => t >= c.start && t < c.end);
            this.thumbnails.show(t, e.clientX - rect.left, ch?.title || '');
        }

        _startBackgroundEngines() {
            Registry.interval(() => {
                if (!this.state.playing || this.state.seeking || this.state.buffering || !this.dom.video) return;
                const ct = this.dom.video.currentTime;
                if (ct === this.network.lastTime && !this.dom.video.paused) {
                    this.network.stallCount++;
                    if (this.network.stallCount >= 3) {
                        Bus.emit('error', ErrorTaxonomy.NETWORK_STALL);
                        this._recoverStream(); this.network.stallCount = 0;
                    }
                } else this.network.stallCount = 0;
                this.network.lastTime = ct;
            }, 2500);
            Registry.listen(this.dom.video, 'timeupdate', () => {
                if (!this.state.playing || this.state.seeking || !this.state.currentMsgId) return;
                const ct = Math.floor(this.dom.video.currentTime);
                if (Math.abs(ct - this.network.lastSave) >= 10) {
                    this.network.lastSave = ct;
                    this._bufferTelemetry({ msgId: this.state.currentMsgId, time: ct, dur: this.dom.video.duration });
                    this._saveResume();
                }
            });
            Registry.interval(() => { if (this.state.isOnline) this._flushTelemetry(); }, 30000);
            Registry.interval(() => { if (this.state.playing) this._saveResume(); }, 15000);
            Registry.interval(() => { this._saveSession(); }, 60000);
            Registry.interval(() => { this.telemetryWorker?.postMessage({ type: 'PRUNE' }); }, 3600000);
        }

        _flushTelemetry() {
            if (this._telemetryBuffer.length && this.telemetryWorker) {
                this.telemetryWorker.postMessage({ type: 'PUSH_BATCH', batch: this._telemetryBuffer });
                this._telemetryBuffer = [];
                if (this._telemetryFlushTimer) { clearTimeout(this._telemetryFlushTimer); this._telemetryFlushTimer = null; }
            }
            if (this.state.isOnline && this.telemetryWorker) this.telemetryWorker.postMessage({ type: 'FLUSH', apiUrl: '/api/sync/batch' });
        }

        _saveSession() {
            if (!this.telemetryWorker) return;
            const session = {
                sessionId: this.sessionId,
                start: this.sessionStart,
                last: Date.now(),
                msgId: this.state.currentMsgId,
                mode: this.prefs.mode,
                contentType: this.state.contentType,
                tier: Capabilities.tier,
            };
            this.telemetryWorker.postMessage({ type: 'SESSION', session });
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
                if (this.network.hlsObj) { try { this.network.hlsObj.recoverMediaError(); } catch {} }
                else {
                    this.dom.video.pause(); this.dom.video.load();
                    const onReady = () => {
                        this.dom.video.currentTime = t;
                        if (wasPlaying) this.dom.video.play().catch(()=>{});
                        this.dom.video.removeEventListener('loadedmetadata', onReady);
                    };
                    this.dom.video.addEventListener('loadedmetadata', onReady);
                }
            }, delay);
        }

        togglePlay() {
            if (!this.dom.video) return;
            if (!this.state.hasInteracted) { this.state.hasInteracted = true; this.audio.init(); }
            this.audio.resume();
            this.dom.video.paused ? this.dom.video.play().catch(()=>{}) : this.dom.video.pause();
        }
        skip(sec) {
            if (!this.dom.video || !isFinite(this.dom.video.duration)) return;
            const to = Math.max(0, Math.min(this.dom.video.duration, this.dom.video.currentTime + sec));
            this.predictiveBuffer.recordSeek(this.dom.video.currentTime, to);
            this.dom.video.currentTime = to;
            this._showOverlay('seek', this.dom.video.currentTime);
            Registry.setTimeout('hideSeek', () => this._hideOverlays(), 500);
            this.idleCtrl?.poke();
        }
        jumpToNextScene() {
            const scenes = this.intel.getScenes();
            const ct = this.dom.video.currentTime;
            const next = scenes.find(s => s.time > ct + 1);
            if (next) { this.dom.video.currentTime = next.time; this.toast(`⏭️ المشهد التالي`); }
        }
        jumpToPrevScene() {
            const scenes = this.intel.getScenes();
            const ct = this.dom.video.currentTime;
            const prev = [...scenes].reverse().find(s => s.time < ct - 1);
            if (prev) { this.dom.video.currentTime = prev.time; this.toast(`⏮️ المشهد السابق`); }
        }
        jumpToHotZone() {
            const zones = this.predictiveBuffer.getHotZones();
            if (zones.length) { this.dom.video.currentTime = zones[0].second; this.toast(`🔥 المنطقة الأكثر مشاهدة`); }
        }
        toggleLock() {
            this.state.locked = !this.state.locked;
            this.toast(this.state.locked ? '🔒 الشاشة مقفلة' : '🔓 تم فتح القفل');
        }
        setVolume(val) {
            const level = Math.max(0, Math.min(3, val));
            this.prefs.volume = level; this._savePrefs();
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
        setZoom(val) {
            this.state.zoom = Math.max(0.5, Math.min(3, val));
            this.toast(`🔍 ${Math.round(this.state.zoom * 100)}%`);
        }
        adjustSpeed(delta) {
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
            const idx = speeds.indexOf(this.prefs.speed);
            const newIdx = Math.max(0, Math.min(speeds.length - 1, (idx === -1 ? 3 : idx) + (delta > 0 ? 1 : -1)));
            this.prefs.speed = speeds[newIdx];
            this.dom.video.playbackRate = this.prefs.speed; this._savePrefs();
            this.toast(`السرعة ${this.prefs.speed}×`);
            if (this.dom.speedBtn) this.dom.speedBtn.textContent = `${this.prefs.speed}×`;
        }
        cycleSpeed() {
            const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
            const next = speeds[(speeds.indexOf(this.prefs.speed) + 1) % speeds.length];
            this.prefs.speed = next; this.dom.video.playbackRate = next; this._savePrefs();
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
            this.prefs.eqPreset = name; this._savePrefs();
            this.toast(`🎚️ ${name}`);
        }
        cycleMode() {
            const keys = Object.keys(MODE_PROFILES);
            const next = keys[(keys.indexOf(this.prefs.mode) + 1) % keys.length];
            this.setMode(next);
        }
        setMode(name) {
            const profile = MODE_PROFILES[name] || MODE_PROFILES.standard;
            this.prefs.mode = name; this.prefs.ambient = profile.ambient;
            if (profile.ambient && this.governor.canEnableHeavyFeatures()) this.subsystems.setState('ambient', 'active');
            else if (profile.ambient) this.subsystems.setState('ambient', 'warm');
            else this.subsystems.setState('ambient', 'sleep');
            this.setEQPreset(profile.eq);
            this.audio.setDialogueMode(profile.dialogue);
            this.audio.setSpatialMode(profile.spatial);
            this.audio.setLoudnessTarget(profile.lufs);
            this.audio.setSubBass(profile.subBass || 0);
            this.audio.setHarmonic(profile.harmonic || 0);
            this.prefs.dialogue = profile.dialogue; this.prefs.spatial = profile.spatial;
            this.state.brightness = profile.brightness;
            this.brightnessSmoother.setTarget(profile.brightness);
            this._savePrefs();
            this.toast(`🎬 ${name}`);
        }
        toggleAutoMode() {
            this.prefs.autoMode = !this.prefs.autoMode;
            this._savePrefs();
            this.toast(`🤖 الوضع الذكي ${this.prefs.autoMode ? 'مفعّل' : 'مغلق'}`);
        }
        toggleSpatial() {
            this.prefs.spatial = !this.prefs.spatial;
            this.audio.setSpatialMode(this.prefs.spatial);
            this._savePrefs();
            this.toast(`🌐 صوت محيطي ${this.prefs.spatial ? 'مفعّل' : 'مغلق'}`);
        }
        toggleDialogue() {
            this.prefs.dialogue = !this.prefs.dialogue;
            this.audio.setDialogueMode(this.prefs.dialogue);
            this._savePrefs();
            this.toast(`🎙️ تعزيز الحوار ${this.prefs.dialogue ? 'مفعّل' : 'مغلق'}`);
        }
        toggleFullscreen() {
            const el = this.dom.container;
            try {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                } else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
            } catch (e) { Bus.emit('error', ErrorTaxonomy.FULLSCREEN_DENIED, e); }
        }
        async togglePiP() {
            if (!Capabilities.pictureInPicture) return;
            try {
                if (document.pictureInPictureElement) await document.exitPictureInPicture();
                else await this.dom.video.requestPictureInPicture();
            } catch {}
        }

        registerPlugin(name, plugin, permissions) { this.plugins.register(name, { ...plugin, player: this }, permissions); }

        async destroy() {
            Engine.stop();
            this._releaseWakeLock(); this._flushTelemetry(); this._saveResume(); this._saveSession(); this._saveUserProfile();
            try { this.network.hlsObj?.destroy(); } catch {}
            try { this.network.dashObj?.reset(); } catch {}
            this.audio?.destroy(); this.ambient?.destroy();
            this.subtitles?.clear(); this.thumbnails?.destroy();
            this.idleCtrl?.destroy();
            if (this.dom.video) {
                this.dom.video.pause();
                this.dom.video.removeAttribute('src');
                this.dom.video.srcObject = null;
                this.dom.video.load();
            }
            Registry.destroy(); Bus.clear();
            document.getElementById('titanium-quantum-styles')?.remove();
            console.log('%c🛑 TitaniumQuantum Destroyed', 'color:#ef4444;font-weight:700');
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
            if (!el) { el = document.createElement('div'); el.id = `tq-${type}`; el.className = `tq-overlay tq-${type}`; this.dom.container.appendChild(el); }
            el.classList.add('is-visible');
            if (type === 'seek') {
                if (!el._span) { while (el.firstChild) el.removeChild(el.firstChild); el._span = document.createElement('span'); el.appendChild(el._span); }
                el._span.textContent = this._formatTime(val);
            } else {
                if (!el._fill) { while (el.firstChild) el.removeChild(el.firstChild); el._fill = document.createElement('div'); el._fill.className = 'tq-bar-fill'; el.appendChild(el._fill); }
                el._fill.style.height = `${Math.min(100, val * 100)}%`;
            }
            Registry.setTimeout(`hide_${type}`, () => el.classList.remove('is-visible'), type === 'seek' ? 0 : 800);
        }
        _hideOverlays() { this.dom.container.querySelectorAll('.tq-overlay').forEach(el => el.classList.remove('is-visible')); }
        toast(msg, type = 'info') {
            let q = document.getElementById('tq-toasts');
            if (!q) { q = document.createElement('div'); q.id = 'tq-toasts'; q.className = 'tq-toasts'; this.dom.container.appendChild(q); }
            if (q.children.length > 2) q.firstElementChild.remove();
            const t = document.createElement('div');
            t.className = `tq-toast tq-${type}`;
            t.textContent = msg;
            q.appendChild(t);
            Registry.setTimeout(`toast_${Date.now()}_${Math.random()}`, () => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 3000);
        }
        _burstAt(x, y, count = 12, color = null) {
            if (!this.particles) return;
            const rect = this.dom.container.getBoundingClientRect();
            this.particles.burst(x - rect.left, y - rect.top, count, color);
        }
        _flashLayer(type) {
            if (!this.dom.flashLayer) return;
            this.dom.flashLayer.className = 'tq-flash-layer';
            void this.dom.flashLayer.offsetWidth;
            this.dom.flashLayer.classList.add(`tq-flash-${type}`);
        }
        _flashScene() {
            if (!this.dom.scanLine) return;
            this.dom.scanLine.classList.remove('tq-scan-active');
            void this.dom.scanLine.offsetWidth;
            this.dom.scanLine.classList.add('tq-scan-active');
        }
        _showSpeedRing(show) {
            if (!this.dom.speedRing) return;
            this.dom.speedRing.classList.toggle('is-visible', show);
        }
        _createDebugHUD() {
            this.dom.debugHud = document.createElement('div');
            this.dom.debugHud.id = 'tq-debug';
            this.dom.debugHud.style.display = 'none';
            this.dom.container.appendChild(this.dom.debugHud);
        }
        _createBoostBadge() {
            const b = document.createElement('div'); b.id = 'tq-boost';
            this.dom.container.appendChild(b);
        }
        _createHeatmapBar() {
            this.dom.heatmapBar = document.createElement('div');
            this.dom.heatmapBar.className = 'tq-heatmap';
            if (this.dom.progress) this.dom.progress.appendChild(this.dom.heatmapBar);
            this.dom.chapterMarkers = document.createElement('div');
            this.dom.chapterMarkers.className = 'tq-chapter-markers';
            if (this.dom.progress) this.dom.progress.appendChild(this.dom.chapterMarkers);
        }
        _createSpectrumVisualizer() {
            this.dom.spectrum = document.createElement('div');
            this.dom.spectrum.className = 'tq-spectrum';
            for (let i = 0; i < 32; i++) {
                const bar = document.createElement('div');
                bar.className = 'tq-spec-bar';
                this.dom.spectrum.appendChild(bar);
            }
            this.dom.container.appendChild(this.dom.spectrum);
        }
        _createWaveform() {
            const wave = document.createElement('div');
            wave.className = 'tq-waveform';
            this.dom.waveformBars = [];
            for (let i = 0; i < 48; i++) {
                const bar = document.createElement('div');
                bar.className = 'tq-wave-bar';
                wave.appendChild(bar);
                this.dom.waveformBars.push(bar);
            }
            this.dom.container.appendChild(wave);
            this.dom.waveform = wave;
        }
        _createLoadingRing() {
            const ring = document.createElement('div');
            ring.className = 'tq-loading-ring';
            const inner = '<div></div><div></div><div></div><div></div><div class="tq-loading-core"></div>';
            ring.insertAdjacentHTML('beforeend', inner);
            this.dom.container.appendChild(ring);
        }
        _createSpeedRing() {
            const ring = document.createElement('div');
            ring.className = 'tq-speed-ring';
            ring.textContent = '2×';
            this.dom.container.appendChild(ring);
            this.dom.speedRing = ring;
        }
        _createFlashLayer() {
            const f = document.createElement('div');
            f.className = 'tq-flash-layer';
            this.dom.container.appendChild(f);
            this.dom.flashLayer = f;
        }
        _createCornerGlow() {
            const l = document.createElement('div');
            l.className = 'tq-corner-glow tq-glow-l';
            const r = document.createElement('div');
            r.className = 'tq-corner-glow tq-glow-r';
            this.dom.container.appendChild(l);
            this.dom.container.appendChild(r);
            this.dom.glowL = l; this.dom.glowR = r;
        }
        _createScanLine() {
            const s = document.createElement('div');
            s.className = 'tq-scan-line';
            this.dom.container.appendChild(s);
            this.dom.scanLine = s;
        }
        _updateDebugHUD() {
            if (!this.dom.debugHud || !this.dom.video) return;
            const v = this.dom.video;
            const res = `${v.videoWidth}×${v.videoHeight}`;
            const vol = (this.prefs.volume * 100).toFixed(0);
            const buf = v.buffered.length ? `${(v.buffered.end(v.buffered.length-1) - v.currentTime).toFixed(1)}s` : '0s';
            const scenes = this.intel.getScenes().length;
            const engineStats = Engine.getStats();
            const leaks = Registry.getLeakReport();
            const subStates = this.subsystems.getStates();
            const subSummary = Object.entries(subStates).map(([k,v]) => `${k}:${v[0]}`).join(' ');
            const lines = [
                `▸ TitaniumQuantum v17 — ${Capabilities.tier.toUpperCase()} — FSM:${this.fsm.current}`,
                `RES ${res}  |  FPS ${this.governor.fps}  |  DROP ${(this.governor.dropRate * 100).toFixed(1)}%`,
                `VOL ${vol}%  |  EQ ${this.prefs.eqPreset}  |  MODE ${this.prefs.mode}`,
                `BUF ${buf}  |  THERMAL ${this.governor.thermalLevel}  |  SCENES ${scenes}`,
                `CPU ${(this.governor.cpuBudget*100).toFixed(0)}% GPU ${(this.governor.gpuBudget*100).toFixed(0)}% MEM ${(this.governor.memBudget*100).toFixed(0)}% PRESSURE ${(this.governor.memoryPressure*100).toFixed(0)}%`,
                `CONTENT ${this.classifier.classification} (${(this.classifier.confidence*100).toFixed(0)}%)  |  MOTION ${(this.intel.motionAverage*100).toFixed(1)}%`,
                `AUDIO BASS ${(this.audio.bassEnergy*100).toFixed(0)}% MID ${(this.audio.midEnergy*100).toFixed(0)}% TREBLE ${(this.audio.trebleEnergy*100).toFixed(0)}%`,
                `HLS ${!!this.network.hlsObj}  |  DASH ${!!this.network.dashObj}  |  AUDIO ${this.audio.active}`,
                `WebGL2 ${Capabilities.webGL2}  |  Spatial ${this.prefs.spatial}  |  Dialogue ${this.prefs.dialogue}`,
                `BAT ${(this.governor.batteryLevel * 100).toFixed(0)}%${this.governor.charging ? '⚡' : ''}  |  NET ${this.state.isOnline ? '✓' : '✗'} ${this.governor.effectiveType}`,
                `BUDGET ${engineStats.frameMs}ms  |  SKIPS ${engineStats.totalSkips}  |  JANK ${this.governor.jankScore.toFixed(0)}  |  PREDICT ${this.governor.predictedThermal}`,
                `SUBSYSTEMS ${subSummary}`,
                `LEAKS L:${leaks.listeners} T:${leaks.timers} R:${leaks.rafs} W:${leaks.workers} A:${leaks.audioNodes} B:${leaks.bitmaps}`,
                `SCRUB ${this._scrubActive ? 'ACTIVE' : 'idle'}  |  LOCKED ${this.state.locked}  |  STAGE ${this._bootStage}`,
                `IDLE ${this.idleCtrl?.isIdle ? 'YES' : 'NO'}  |  PARTICLES ${this.particles?.particles.length || 0}`,
            ];
            while (this.dom.debugHud.firstChild) this.dom.debugHud.removeChild(this.dom.debugHud.firstChild);
            const frag = document.createDocumentFragment();
            lines.forEach(line => { const div = document.createElement('div'); div.textContent = line; frag.appendChild(div); });
            this.dom.debugHud.appendChild(frag);
        }

        async _acquireWakeLock() {
            if (!Capabilities.wakeLock || this.network.wakelock) return;
            try { this.network.wakelock = await navigator.wakeLock.request('screen'); } catch {}
        }
        _releaseWakeLock() { try { this.network.wakelock?.release(); } catch {} this.network.wakelock = null; }

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
        _savePrefs() { try { localStorage.setItem(this._raw.storageKey, JSON.stringify(this.prefs)); } catch {} this._saveUserProfile(); }
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
                :root {
                    --tq-accent: #0ea5e9;
                    --tq-accent-soft: rgba(14,165,233,0.4);
                    --tq-bg: rgba(8,10,16,0.96);
                    --tq-glass: rgba(15,15,20,0.78);
                    --tq-border: rgba(255,255,255,0.14);
                    --tq-text: #fff;
                    --tq-text-dim: rgba(255,255,255,0.7);
                }

                .tq-ambient {
                    position:absolute; inset:-8%; width:116%; height:116%;
                    filter:blur(90px) saturate(280%);
                    transform:scale(1.3); opacity:0.85; pointer-events:none;
                    z-index:-1; transition:opacity 0.7s cubic-bezier(0.4,0,0.2,1), filter 0.5s ease;
                    will-change:opacity,filter; mix-blend-mode:screen;
                }
                .is-fullscreen video { width:100% !important; height:100% !important; object-fit:cover !important; }
                .is-locked .controls, .is-locked [data-controls], .is-locked #progressContainer { pointer-events:none !important; opacity:0.25; filter:grayscale(0.7); }
                .is-scrubbing video { filter:brightness(1) !important; }
                .is-scrubbing .tq-ambient { transition:none !important; opacity:0 !important; }
                .is-scrubbing .tq-spectrum, .is-scrubbing .tq-waveform { opacity:0 !important; }
                #progressBar, #bufferedBar { transform-origin:left center; transform:scaleX(0); will-change:transform; pointer-events:none; }
                #bufferedBar { opacity:0.35; background:rgba(255,255,255,0.5); }
                #progressBar { background:linear-gradient(90deg, var(--tq-accent), #ec4899, #f59e0b); box-shadow:0 0 20px var(--tq-accent-soft); }
                .is-seeking * { user-select:none !important; cursor:ew-resize !important; }

                .tq-particles {
                    position:absolute; inset:0; pointer-events:none;
                    z-index:5; opacity:1; transition:opacity 0.5s;
                    mix-blend-mode:screen;
                }

                .tq-corner-glow {
                    position:absolute; bottom:0; width:280px; height:280px;
                    pointer-events:none; z-index:1;
                    background:radial-gradient(circle at center, var(--tq-accent-soft) 0%, transparent 60%);
                    opacity:0; transition:opacity 0.18s ease;
                    mix-blend-mode:screen;
                    will-change:opacity;
                }
                .tq-glow-l { left:-100px; }
                .tq-glow-r { right:-100px; }

                .tq-scan-line {
                    position:absolute; left:0; right:0; height:2px;
                    background:linear-gradient(90deg, transparent, var(--tq-accent), transparent);
                    box-shadow:0 0 20px var(--tq-accent), 0 0 40px var(--tq-accent-soft);
                    opacity:0; pointer-events:none; z-index:50;
                    top:-2px;
                }
                .tq-scan-line.tq-scan-active {
                    animation:tqScan 0.9s cubic-bezier(0.4,0,0.2,1) forwards;
                }
                @keyframes tqScan {
                    0% { top:0%; opacity:0; }
                    20% { opacity:1; }
                    80% { opacity:1; }
                    100% { top:100%; opacity:0; }
                }

                .tq-flash-layer {
                    position:absolute; inset:0; pointer-events:none; z-index:60;
                    opacity:0;
                }
                .tq-flash-layer.tq-flash-play {
                    animation:tqFlashPlay 0.45s ease-out;
                    background:radial-gradient(circle at center, var(--tq-accent-soft) 0%, transparent 70%);
                }
                @keyframes tqFlashPlay {
                    0% { opacity:0; transform:scale(0.85); }
                    50% { opacity:0.6; }
                    100% { opacity:0; transform:scale(1.15); }
                }

                .tq-loading-ring {
                    position:absolute; top:50%; left:50%;
                    width:80px; height:80px; margin:-40px 0 0 -40px;
                    pointer-events:none; z-index:1000;
                    opacity:0; transition:opacity 0.3s cubic-bezier(0.4,0,0.2,1);
                    transform:scale(0.85);
                }
                .is-buffering .tq-loading-ring { opacity:1; transform:scale(1); }
                .tq-loading-ring div:not(.tq-loading-core) {
                    position:absolute; inset:0; border:3px solid transparent; border-radius:50%;
                    animation:tqRing 1.6s cubic-bezier(0.5,0,0.5,1) infinite;
                    filter:drop-shadow(0 0 8px currentColor);
                }
                .tq-loading-ring div:nth-child(1) { border-top-color:var(--tq-accent); animation-delay:-0.45s; }
                .tq-loading-ring div:nth-child(2) { border-top-color:#8b5cf6; animation-delay:-0.3s; transform:scale(0.85); }
                .tq-loading-ring div:nth-child(3) { border-top-color:#ec4899; animation-delay:-0.15s; transform:scale(0.7); }
                .tq-loading-ring div:nth-child(4) { border-top-color:#f59e0b; transform:scale(0.55); }
                .tq-loading-core {
                    position:absolute; top:50%; left:50%; width:8px; height:8px;
                    margin:-4px 0 0 -4px; background:#fff; border-radius:50%;
                    box-shadow:0 0 16px var(--tq-accent), 0 0 32px var(--tq-accent-soft);
                    animation:tqPulseCore 1.4s ease-in-out infinite;
                }
                @keyframes tqRing { 0% { transform:rotate(0deg) scale(var(--s,1)); } 100% { transform:rotate(360deg) scale(var(--s,1)); } }
                @keyframes tqPulseCore { 0%,100% { transform:scale(1); opacity:0.9; } 50% { transform:scale(1.4); opacity:1; } }

                .tq-speed-ring {
                    position:absolute; top:50%; left:50%;
                    transform:translate(-50%,-50%) scale(0.7);
                    padding:16px 32px;
                    background:linear-gradient(135deg, rgba(239,68,68,0.95), rgba(251,146,60,0.95));
                    color:#fff; font-weight:900; font-size:20px;
                    border-radius:18px;
                    border:2px solid rgba(255,255,255,0.3);
                    box-shadow:0 12px 50px rgba(239,68,68,0.6), inset 0 1px 0 rgba(255,255,255,0.2);
                    backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
                    opacity:0; pointer-events:none; z-index:500;
                    transition:opacity 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
                    font-family:system-ui, sans-serif;
                    letter-spacing:1px;
                }
                .tq-speed-ring.is-visible {
                    opacity:1;
                    transform:translate(-50%,-50%) scale(1);
                    animation:tqSpeedPulse 0.6s ease-in-out infinite;
                }
                @keyframes tqSpeedPulse {
    0%,100% {
        box-shadow:0 12px 50px rgba(239,68,68,0.6),
        inset 0 1px 0 rgba(255,255,255,0.2);
    }

    50% {
        box-shadow:0 16px 70px rgba(239,68,68,0.85),
        inset 0 1px 0 rgba(255,255,255,0.3);
    }
}

.tq-cue-wrap {
    display:inline-block;
    max-width:90%;
}

.tq-captions span {
    display:inline-block;
    background:rgba(0,0,0,0.86);
    color:#fff;
    padding:7px 16px;
    font-weight:700;
    border-radius:8px;
    text-shadow:0 2px 8px rgba(0,0,0,0.95);
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
    line-height:1.45;
    font-family:system-ui, -apple-system, 'Segoe UI', sans-serif;
}
