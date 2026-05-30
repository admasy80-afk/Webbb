const SysUI = (() => {
    'use strict';

    const $esc = (str) => String(str ?? '').replace(/[&<>"'`=\/]/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;','=':'&#61;','/':'&#47;'}[s]));
    const $sanitizeURL = (url) => { try { const u = new URL(url, location.href); return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } };
    const $safeJSON = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
    const $safeSet = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } };
    const $rafThrottle = (fn) => { let t = false, lastArgs; return (...args) => { lastArgs = args; if (!t) { t = true; requestAnimationFrame(() => { fn(...lastArgs); t = false; }); } }; };
    const $debounce = (fn, ms) => { let id; const debounced = (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; debounced.cancel = () => clearTimeout(id); return debounced; };
    const $throttle = (fn, ms) => { let last = 0, id; const throttled = (...a) => { const now = performance.now(); if (now - last >= ms) { last = now; fn(...a); } else { clearTimeout(id); id = setTimeout(() => { last = performance.now(); fn(...a); }, ms - (now - last)); } }; throttled.cancel = () => clearTimeout(id); return throttled; };
    const $idle = (fn, timeout = 200) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 1));
    const $uid = () => 'sys_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    const $clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const $lerp = (a, b, t) => a + (b - a) * t;
    const $smoothstep = (a, b, t) => { const x = $clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
    const $hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i); return (h >>> 0).toString(36); };
    const $noop = () => {};
    const $isSafeURL = (u) => /^(https?:|mailto:|tel:|\/|#)/i.test(u || '');
    const $now = () => performance.now();
    const $easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
    const $easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    const $easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const $prm = matchMedia('(prefers-reduced-motion: reduce)');
    const $prc = matchMedia('(prefers-contrast: more)');
    const $prd = matchMedia('(prefers-color-scheme: dark)');
    const $isTouch = matchMedia('(pointer: coarse)').matches;
    const $hasHover = matchMedia('(hover: hover)').matches;
    const $isHighRefresh = matchMedia('(min-resolution: 120dpi)').matches;
    const $isRetina = window.devicePixelRatio >= 2;
    const $supportsVT = 'startViewTransition' in document;
    const $supportsBackdrop = CSS.supports?.('backdrop-filter', 'blur(1px)') || CSS.supports?.('-webkit-backdrop-filter', 'blur(1px)');
    const $supportsContainer = CSS.supports?.('container-type', 'inline-size');
    const $supportsAnchor = CSS.supports?.('anchor-name', '--x');
    const $supportsPopover = HTMLElement.prototype.hasOwnProperty('popover');
    const $supportsHasSelector = CSS.supports?.('selector(:has(*))');
    const $supportsScrollTimeline = CSS.supports?.('animation-timeline', 'view()');
    const $supportsHoudini = 'registerProperty' in CSS;
    const $supportsWebGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
    const $cores = navigator.hardwareConcurrency || 4;
    const $memory = navigator.deviceMemory || 4;
    const $connection = navigator.connection || {};
    const $isLowEnd = $cores <= 4 || $memory <= 2 || ['slow-2g', '2g', '3g'].includes($connection.effectiveType);
    const $isMidEnd = $cores <= 6 || $memory <= 4;
    const $perfTier = $isLowEnd ? 'low' : $isMidEnd ? 'mid' : 'high';
    let $reducedMotion = $prm.matches;
    let $highContrast = $prc.matches;

    document.documentElement.dataset.perf = $perfTier;
    document.documentElement.dataset.touch = $isTouch ? 'true' : 'false';

    const FrameScheduler = (() => {
        const tasks = new Set();
        let running = false;
        let targetFPS = $perfTier === 'low' ? 30 : 60;
        let frameBudget = 1000 / targetFPS;
        let lastFrame = $now();
        let droppedFrames = 0;
        let avgFrameTime = 16;
        const tick = (t) => {
            const dt = t - lastFrame;
            avgFrameTime = avgFrameTime * 0.9 + dt * 0.1;
            if (dt > frameBudget * 1.5) droppedFrames++;
            lastFrame = t;
            const deadline = t + frameBudget * 0.7;
            for (const task of tasks) {
                if ($now() > deadline) break;
                try { task(t); } catch (e) { console.warn(e); }
                tasks.delete(task);
            }
            if (tasks.size) requestAnimationFrame(tick);
            else running = false;
        };
        return {
            schedule: (fn) => { tasks.add(fn); if (!running) { running = true; requestAnimationFrame(tick); } },
            metrics: () => ({ avgFrameTime, droppedFrames, fps: Math.round(1000 / avgFrameTime) })
        };
    })();

    const Viewport = (() => {
        let state = { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, breakpoint: 'md', orientation: 'portrait' };
        const breakpoints = { xs: 0, sm: 480, md: 768, lg: 1024, xl: 1280, xxl: 1536, ultra: 1920 };
        const calc = () => {
            const w = window.innerWidth, h = window.innerHeight;
            let bp = 'xs';
            for (const [k, v] of Object.entries(breakpoints)) if (w >= v) bp = k;
            state = { w, h, dpr: window.devicePixelRatio, breakpoint: bp, orientation: w > h ? 'landscape' : 'portrait', aspect: w / h, isUltrawide: w / h > 2.1, isCompact: w < 480, isMobile: w < 768, isTablet: w >= 768 && w < 1024, isDesktop: w >= 1024 };
            document.documentElement.dataset.bp = bp;
            document.documentElement.dataset.orientation = state.orientation;
            document.documentElement.style.setProperty('--sys-vw', w + 'px');
            document.documentElement.style.setProperty('--sys-vh', h + 'px');
            document.documentElement.style.setProperty('--sys-dvh', h * 0.01 + 'px');
        };
        calc();
        const onResize = $debounce(() => { calc(); Events?.emit('viewport:change', state); }, 80);
        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('orientationchange', onResize, { passive: true });
        return { get: () => ({ ...state }), breakpoints, is: (q) => state.breakpoint === q, atLeast: (q) => state.w >= breakpoints[q] };
    })();

    $prm.addEventListener?.('change', e => { $reducedMotion = e.matches; Events?.emit('motion:preference', e.matches); });
    $prc.addEventListener?.('change', e => { $highContrast = e.matches; document.documentElement.dataset.contrast = e.matches ? 'high' : 'normal'; });

    const Lifecycle = (() => {
        const ownerRegistry = new WeakMap();
        const allCleanups = new Set();
        const createOwner = (id = $uid()) => {
            const cleanups = new Set();
            const owner = {
                id,
                disposed: false,
                add: (fn) => { if (owner.disposed) { try { fn(); } catch {} return $noop; } cleanups.add(fn); return () => { cleanups.delete(fn); try { fn(); } catch {} }; },
                listen: (target, event, handler, opts) => {
                    if (!target?.addEventListener) return $noop;
                    target.addEventListener(event, handler, opts);
                    const off = () => target.removeEventListener(event, handler, opts);
                    return owner.add(off);
                },
                interval: (fn, ms) => { const id = setInterval(fn, ms); return owner.add(() => clearInterval(id)); },
                timeout: (fn, ms) => { const id = setTimeout(fn, ms); return owner.add(() => clearTimeout(id)); },
                raf: (fn) => { let id = requestAnimationFrame(function tick(t) { fn(t); id = requestAnimationFrame(tick); }); return owner.add(() => cancelAnimationFrame(id)); },
                observe: (observer) => owner.add(() => observer.disconnect()),
                child: () => { const c = createOwner(); owner.add(() => c.dispose()); return c; },
                dispose: () => {
                    if (owner.disposed) return;
                    owner.disposed = true;
                    for (const fn of cleanups) { try { fn(); } catch (e) { console.warn(e); } }
                    cleanups.clear();
                    allCleanups.delete(owner);
                }
            };
            allCleanups.add(owner);
            return owner;
        };
        const attach = (el, owner) => { if (el && owner) ownerRegistry.set(el, owner); };
        const getOwner = (el) => ownerRegistry.get(el);
        const disposeFor = (el) => { const o = ownerRegistry.get(el); if (o) { o.dispose(); ownerRegistry.delete(el); } };
        const domObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.removedNodes) {
                    if (node.nodeType !== 1) continue;
                    disposeFor(node);
                    if (node.querySelectorAll) {
                        for (const child of node.querySelectorAll('*')) disposeFor(child);
                    }
                }
            }
        });
        const init = () => { if (document.body) domObserver.observe(document.body, { childList: true, subtree: true }); };
        if (document.body) init(); else document.addEventListener('DOMContentLoaded', init, { once: true });
        window.addEventListener('beforeunload', () => { for (const o of allCleanups) try { o.dispose(); } catch {} });
        return { createOwner, attach, getOwner, disposeFor };
    })();

    const rootOwner = Lifecycle.createOwner('root');

    const $velocity = (() => {
        let lastX = 0, lastY = 0, lastT = performance.now(), vx = 0, vy = 0, speed = 0, angle = 0;
        const samples = [];
        const track = (x, y) => {
            const now = performance.now();
            const dt = Math.max(1, now - lastT);
            const nvx = (x - lastX) / dt;
            const nvy = (y - lastY) / dt;
            vx = vx * 0.65 + nvx * 0.35;
            vy = vy * 0.65 + nvy * 0.35;
            speed = Math.hypot(vx, vy);
            angle = Math.atan2(vy, vx);
            samples.push({ t: now, x, y });
            while (samples.length > 12) samples.shift();
            lastX = x; lastY = y; lastT = now;
        };
        rootOwner.listen(document, 'pointermove', (e) => track(e.clientX, e.clientY), { passive: true });
        return { get: () => ({ vx, vy, speed, angle }), track, samples: () => samples.slice() };
    })();

    const Bus = (() => {
        const listeners = new Map();
        const wildcards = new Set();
        const queue = [];
        let flushing = false;
        const flush = () => {
            flushing = true;
            while (queue.length) {
                const { event, data } = queue.shift();
                const set = listeners.get(event);
                if (set) for (const cb of set) { try { cb(data); } catch (e) { console.error(event, e); } }
                for (const cb of wildcards) { try { cb({ event, data }); } catch (e) { console.error(e); } }
            }
            flushing = false;
        };
        return {
            on: (event, cb) => {
                if (event === '*') { wildcards.add(cb); return () => wildcards.delete(cb); }
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event).add(cb);
                return () => listeners.get(event)?.delete(cb);
            },
            once: (event, cb) => { const off = Bus.on(event, (d) => { off(); cb(d); }); return off; },
            emit: (event, data) => { queue.push({ event, data }); if (!flushing) queueMicrotask(flush); },
            emitSync: (event, data) => {
                const set = listeners.get(event);
                if (set) for (const cb of set) { try { cb(data); } catch (e) { console.error(e); } }
                for (const cb of wildcards) { try { cb({ event, data }); } catch {} }
            },
            off: (event, cb) => listeners.get(event)?.delete(cb),
            clear: (event) => event ? listeners.delete(event) : (listeners.clear(), wildcards.clear()),
            count: (event) => listeners.get(event)?.size || 0
        };
    })();
    const Events = Bus;

    const Store = (() => {
        const state = new Map();
        const subs = new Map();
        const middleware = [];
        const history = [];
        const MAX_HISTORY = 50;
        return {
            get: (k) => state.get(k),
            set: (k, v) => {
                const prev = state.get(k);
                let next = v;
                for (const mw of middleware) { try { next = mw(k, next, prev) ?? next; } catch (e) { console.error(e); } }
                if (Object.is(prev, next)) return;
                state.set(k, next);
                history.push({ k, prev, next, t: $now() });
                if (history.length > MAX_HISTORY) history.shift();
                const set = subs.get(k);
                if (set) for (const cb of set) { try { cb(next, prev); } catch (e) { console.error(e); } }
                Bus.emit('store:change', { key: k, value: next, prev });
            },
            update: (k, fn) => Store.set(k, fn(state.get(k))),
            subscribe: (k, cb) => {
                if (!subs.has(k)) subs.set(k, new Set());
                subs.get(k).add(cb);
                return () => subs.get(k)?.delete(cb);
            },
            persist: (k, v) => { Store.set(k, v); $safeSet('sysui_' + k, v); },
            hydrate: (k, fallback) => { const v = $safeJSON('sysui_' + k, fallback); Store.set(k, v); return v; },
            use: (mw) => middleware.push(mw),
            snapshot: () => Object.fromEntries(state),
            restore: (snap) => { Object.entries(snap).forEach(([k, v]) => Store.set(k, v)); },
            history: () => history.slice()
        };
    })();

    const Layers = Object.freeze({
        ambient: -1, base: 0, magnetic: 100, spotlight: 8000, feed: 9000,
        backdrop: 9998, context: 9999, toast: 10000, modal: 10001, cmd: 10002, hud: 10003, cursor: 10004, particles: 10005
    });

    const State = {
        toasts: new Map(),
        activeOverlays: [],
        cmdState: { query: '', selectedIndex: 0, results: [], history: $safeJSON('sysui_cmd_history', []), favorites: new Set($safeJSON('sysui_cmd_favs', [])) },
        previousFocus: null,
        sessionDrafts: $safeJSON('sysui_drafts', {}),
        focusStack: [],
        themeMode: $safeJSON('sysui_theme', 'auto')
    };

    const Motion = (() => {
        const tierMultiplier = { low: 0.55, mid: 0.82, high: 1 }[$perfTier];
        const tokens = {
            duration: { instant: 60, micro: 110, fast: 170, normal: 230, emphasized: 320, slow: 460, slower: 640, glacial: 880 },
            ease: {
                standard: 'cubic-bezier(0.2, 0, 0, 1)',
                emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
                decelerate: 'cubic-bezier(0, 0, 0, 1)',
                accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
                spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
                springSoft: 'cubic-bezier(0.34, 1.26, 0.64, 1)',
                springBounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                springSnappy: 'cubic-bezier(0.22, 1, 0.36, 1)',
                springPrecise: 'cubic-bezier(0.32, 0.72, 0, 1)',
                elastic: 'cubic-bezier(0.68, -0.4, 0.265, 1.4)',
                smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
                anticipate: 'cubic-bezier(0.75, -0.5, 0.25, 1.5)',
                appleStandard: 'cubic-bezier(0.4, 0, 0.6, 1)',
                appleEmphasized: 'cubic-bezier(0.32, 0.72, 0, 1)',
                materialEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
                overshoot: 'cubic-bezier(0.34, 1.7, 0.64, 1)',
                inertia: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
                magnetic: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)',
                fluid: 'cubic-bezier(0.65, 0, 0.35, 1)'
            },
            spring: {
                gentle: { stiffness: 120, damping: 14, mass: 1 },
                wobbly: { stiffness: 180, damping: 12, mass: 1 },
                stiff: { stiffness: 300, damping: 22, mass: 1 },
                slow: { stiffness: 80, damping: 20, mass: 1 },
                snappy: { stiffness: 400, damping: 28, mass: 1 },
                bouncy: { stiffness: 260, damping: 9, mass: 1.1 },
                precise: { stiffness: 220, damping: 26, mass: 1 },
                ios: { stiffness: 180, damping: 20, mass: 1 },
                molasses: { stiffness: 60, damping: 30, mass: 1.4 },
                rubber: { stiffness: 340, damping: 11, mass: 1 },
                silk: { stiffness: 140, damping: 24, mass: 1 }
            },
            stagger: { tight: 18, normal: 32, relaxed: 52, dramatic: 78 }
        };

        const reduce = (ms) => $reducedMotion ? Math.min(ms, 60) : Math.round(ms * tierMultiplier);
        const activeAnimations = new WeakMap();
        const springCache = new Map();

        const springCurve = (preset = 'gentle', steps = 60) => {
            const cacheKey = `${preset}:${steps}`;
            if (springCache.has(cacheKey)) return springCache.get(cacheKey);
            const { stiffness, damping, mass } = tokens.spring[preset] || tokens.spring.gentle;
            const w0 = Math.sqrt(stiffness / mass);
            const zeta = damping / (2 * Math.sqrt(stiffness * mass));
            const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
            const frames = new Array(steps + 1);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                let v;
                if (zeta < 1) v = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
                else v = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
                frames[i] = v;
            }
            springCache.set(cacheKey, frames);
            return frames;
        };

        const springDuration = (preset = 'gentle') => {
            const { stiffness, damping, mass } = tokens.spring[preset] || tokens.spring.gentle;
            const w0 = Math.sqrt(stiffness / mass);
            const zeta = damping / (2 * Math.sqrt(stiffness * mass));
            return Math.min(1400, Math.max(180, (zeta < 1 ? 1000 / (zeta * w0) : 1000 / w0) * 0.85));
        };

        const cancelOn = (el) => {
            const set = activeAnimations.get(el);
            if (!set) return;
            for (const a of set) { try { a.cancel(); } catch {} }
            set.clear();
        };

        const track = (el, anim) => {
            if (!activeAnimations.has(el)) activeAnimations.set(el, new Set());
            const set = activeAnimations.get(el);
            set.add(anim);
            anim.finished.finally(() => set.delete(anim)).catch($noop);
        };

        const animate = (el, keyframes, opts = {}) => {
            if (!el || !el.isConnected) return Promise.resolve();
            const { duration = tokens.duration.normal, easing = tokens.ease.standard, delay = 0, fill = 'forwards', composite = 'replace', cancel = false } = opts;
            if (cancel) cancelOn(el);
            const d = reduce(duration);
            try {
                const anim = el.animate(keyframes, { duration: d, easing, delay: reduce(delay), fill, composite });
                track(el, anim);
                return anim.finished.catch(() => {});
            } catch { return Promise.resolve(); }
        };

        const spring = (el, props, preset = 'gentle', opts = {}) => {
            if (!el || !el.isConnected) return Promise.resolve();
            if ($reducedMotion) {
                if (props) Object.entries(props).forEach(([k, v]) => { el.style[k] = Array.isArray(v) ? v[v.length - 1] : v; });
                return Promise.resolve();
            }
            const steps = $perfTier === 'low' ? 24 : $perfTier === 'mid' ? 40 : 60;
            const curve = springCurve(preset, steps);
            const keys = Object.keys(props);
            const frames = curve.map(t => {
                const f = {};
                for (const k of keys) {
                    const val = props[k];
                    if (Array.isArray(val) && val.length === 2) {
                        const [from, to] = val;
                        if (typeof from === 'number') f[k] = $lerp(from, to, t);
                        else if (typeof from === 'string' && /^-?[\d.]+/.test(from)) {
                            const fm = parseFloat(from), tm = parseFloat(to);
                            const unit = from.replace(/^-?[\d.]+/, '');
                            f[k] = $lerp(fm, tm, t) + unit;
                        } else f[k] = t < 1 ? from : to;
                    } else f[k] = val;
                }
                return f;
            });
            const dur = reduce(opts.duration ?? springDuration(preset));
            try {
                if (opts.cancel) cancelOn(el);
                const anim = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
                track(el, anim);
                return anim.finished.catch(() => {});
            } catch { return Promise.resolve(); }
        };

        const stagger = async (els, fn, gap = tokens.stagger.normal) => {
            const arr = Array.from(els);
            const total = arr.length;
            if (!total) return;
            const promises = [];
            for (let i = 0; i < total; i++) {
                const eased = Math.pow(i / Math.max(1, total - 1), 0.85) * (total - 1);
                promises.push(new Promise(r => setTimeout(() => { try { fn(arr[i], i); } catch {} r(); }, reduce(eased * gap))));
            }
            return Promise.all(promises);
        };

        const enter = {
            fade: (el, opts = {}) => animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: tokens.duration.normal, easing: tokens.ease.standard, ...opts }),
            scale: (el) => spring(el, { transform: ['scale(0.94)', 'scale(1)'], opacity: [0, 1] }, 'precise'),
            slideUp: (el) => spring(el, { transform: ['translate3d(0,14px,0)', 'translate3d(0,0,0)'], opacity: [0, 1] }, 'ios'),
            slideDown: (el) => spring(el, { transform: ['translate3d(0,-14px,0)', 'translate3d(0,0,0)'], opacity: [0, 1] }, 'ios'),
            slideLeft: (el) => spring(el, { transform: ['translate3d(18px,0,0)', 'translate3d(0,0,0)'], opacity: [0, 1] }, 'ios'),
            slideRight: (el) => spring(el, { transform: ['translate3d(-18px,0,0)', 'translate3d(0,0,0)'], opacity: [0, 1] }, 'ios'),
            pop: (el) => spring(el, { transform: ['scale(0.82)', 'scale(1)'], opacity: [0, 1] }, 'bouncy'),
            blur: (el, opts = {}) => animate(el, [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: tokens.duration.slow, easing: tokens.ease.smooth, ...opts }),
            materialize: (el) => animate(el, [
                { opacity: 0, filter: 'blur(12px) brightness(1.4)', transform: 'scale(1.04)' },
                { opacity: 1, filter: 'blur(0) brightness(1)', transform: 'scale(1)' }
            ], { duration: tokens.duration.emphasized, easing: tokens.ease.appleEmphasized }),
            warp: (el) => animate(el, [
                { opacity: 0, transform: 'perspective(800px) rotateX(-25deg) translateY(40px) scale(0.85)', filter: 'blur(8px)' },
                { opacity: 1, transform: 'perspective(800px) rotateX(0) translateY(0) scale(1)', filter: 'blur(0)' }
            ], { duration: tokens.duration.emphasized, easing: tokens.ease.appleEmphasized }),
            iris: (el) => animate(el, [
                { clipPath: 'circle(0% at 50% 50%)', opacity: 0 },
                { clipPath: 'circle(150% at 50% 50%)', opacity: 1 }
            ], { duration: tokens.duration.slow, easing: tokens.ease.smooth })
        };

        const exit = {
            fade: (el, opts = {}) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            scale: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            slideUp: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,-10px,0)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            slideDown: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,10px,0)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            slideLeft: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(20px,0,0)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            blur: (el, opts = {}) => animate(el, [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            dematerialize: (el) => animate(el, [
                { opacity: 1, filter: 'blur(0) brightness(1)', transform: 'scale(1)' },
                { opacity: 0, filter: 'blur(6px) brightness(0.8)', transform: 'scale(0.97)' }
            ], { duration: tokens.duration.fast, easing: tokens.ease.accelerate })
        };

        const shake = (el, intensity = 6) => animate(el, [
            { transform: 'translate3d(0,0,0)' },
            { transform: `translate3d(-${intensity}px,0,0)` },
            { transform: `translate3d(${intensity}px,0,0)` },
            { transform: `translate3d(-${intensity * 0.6}px,0,0)` },
            { transform: `translate3d(${intensity * 0.6}px,0,0)` },
            { transform: `translate3d(-${intensity * 0.3}px,0,0)` },
            { transform: 'translate3d(0,0,0)' }
        ], { duration: 420, easing: tokens.ease.smooth });

        const pulse = (el) => animate(el, [
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.035)', filter: 'brightness(1.12)' },
            { transform: 'scale(1)', filter: 'brightness(1)' }
        ], { duration: 460, easing: tokens.ease.springSoft });

        const glitch = (el) => animate(el, [
            { transform: 'translate(0)', filter: 'hue-rotate(0)' },
            { transform: 'translate(-2px, 1px)', filter: 'hue-rotate(90deg)' },
            { transform: 'translate(2px, -1px)', filter: 'hue-rotate(-90deg)' },
            { transform: 'translate(-1px, -1px)', filter: 'hue-rotate(45deg)' },
            { transform: 'translate(0)', filter: 'hue-rotate(0)' }
        ], { duration: 280, easing: 'steps(5)' });

        const flip = (el, from, to) => {
            if ($reducedMotion) return Promise.resolve();
            const dx = from.left - to.left, dy = from.top - to.top;
            const sx = from.width / Math.max(to.width, 1), sy = from.height / Math.max(to.height, 1);
            return animate(el, [
                { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})` },
                { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
            ], { duration: tokens.duration.emphasized, easing: tokens.ease.appleEmphasized });
        };

        const morphLayout = (el, mutator) => {
            if ($reducedMotion || !el) { mutator(); return Promise.resolve(); }
            const before = el.getBoundingClientRect();
            mutator();
            const after = el.getBoundingClientRect();
            return flip(el, before, after);
        };

        return { tokens, reduce, animate, spring, stagger, enter, exit, shake, pulse, glitch, flip, morphLayout };
    })();

    const Theme = (() => {
        let injected = false;
        const variants = {
            crimson: { accent: '#ef4444', bg: '#0a0000', surface: '#1f0606' },
            solar: { accent: '#f59e0b', bg: '#0a0700', surface: '#1f1500' },
            arctic: { accent: '#06b6d4', bg: '#000a0e', surface: '#001f29' },
            sakura: { accent: '#ec4899', bg: '#0e0008', surface: '#290016' }
        };
        const inject = () => {
            if (injected || document.getElementById('sys-theme-tokens')) { injected = true; return; }
            const style = document.createElement('style');
            style.id = 'sys-theme-tokens';
            style.textContent = `
                :root {
                    --sys-bg-base: #000000;
                    --sys-bg-surface: #0a0a0a;
                    --sys-bg-elevated: #111111;
                    --sys-bg-overlay: rgba(0, 0, 0, 0.7);
                    --sys-accent: #a855f7;
                    --sys-accent-hover: #c084fc;
                    --sys-text-primary: #f3f4f6;
                    --sys-text-secondary: #9ca3af;
                    --sys-text-muted: #6b7280;
                    --sys-border: rgba(255, 255, 255, 0.08);
                    --sys-touch-target: clamp(44px, 4.5vh, 52px);
                    --sys-ease-apple: cubic-bezier(0.16, 1, 0.3, 1);
                    --sys-ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
                    --sys-ease-inertia: cubic-bezier(0.05, 0.7, 0.1, 1);
                    --sys-safe-top: env(safe-area-inset-top, 0px);
                    --sys-safe-bottom: env(safe-area-inset-bottom, 0px);
                    --sys-safe-left: env(safe-area-inset-left, 0px);
                    --sys-safe-right: env(safe-area-inset-right, 0px);
                }
                [data-theme="crimson"] {
                    --sys-accent: #ef4444; --sys-bg-base: #0a0000; --sys-bg-surface: #1f0606;
                }
                [data-theme="solar"] {
                    --sys-accent: #f59e0b; --sys-bg-base: #0a0700; --sys-bg-surface: #1f1500;
                }
                [data-theme="arctic"] {
                    --sys-accent: #06b6d4; --sys-bg-base: #000a0e; --sys-bg-surface: #001f29;
                }
                [data-theme="sakura"] {
                    --sys-accent: #ec4899; --sys-bg-base: #0e0008; --sys-bg-surface: #290016;
                }
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                body {
                    background-color: var(--sys-bg-base);
                    color: var(--sys-text-primary);
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    min-height: 100dvh;
                    padding-top: var(--sys-safe-top);
                    padding-bottom: var(--sys-safe-bottom);
                    padding-left: var(--sys-safe-left);
                    padding-right: var(--sys-safe-right);
                    overflow-x: hidden;
                }
                .sys-glass {
                    background: rgba(10, 10, 10, 0.65);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid var(--sys-border);
                }
                .sys-glass-glow {
                    background: rgba(15, 15, 15, 0.8);
                    backdrop-filter: blur(25px);
                    -webkit-backdrop-filter: blur(25px);
                    border: 1px solid rgba(168, 85, 247, 0.25);
                    box-shadow: 0 0 25px rgba(168, 85, 247, 0.15);
                }
                .sys-nav-container, .sys-tabs-wrapper {
                    display: flex;
                    align-items: center;
                    gap: clamp(0.5rem, 2vw, 1.5rem);
                    width: 100%;
                    max-width: 100%;
                    overflow-x: auto;
                    overflow-y: hidden;
                    white-space: nowrap;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                    flex-wrap: nowrap;
                    padding: 4px;
                }
                .sys-nav-container::-webkit-scrollbar, .sys-tabs-wrapper::-webkit-scrollbar {
                    display: none;
                }
                .sys-nav-item, .sys-tab-btn {
                    flex-shrink: 0;
                    min-height: var(--sys-touch-target);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-size: clamp(0.8rem, 1.2vw + 0.5rem, 1rem);
                    padding: 0.5rem clamp(0.75rem, 1.5vw, 1.5rem);
                    white-space: nowrap;
                }
                @media (max-width: 600px) {
                    .sys-grid-responsive {
                        grid-template-columns: 1fr !important;
                    }
                    .sys-nav-container, .sys-tabs-wrapper {
                        justify-content: flex-start;
                    }
                }
                .sys-skeleton-bg {
                    background: linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.02) 75%);
                    background-size: 1200px 100%;
                    animation: sysShimmer 1.6s infinite linear;
                }
                @keyframes sysShimmer {
                    0% { background-position: -600px 0; }
                    100% { background-position: 600px 0; }
                }
                .sys-magnetic {
                    transition: transform 380ms var(--sys-ease-apple), box-shadow 320ms var(--sys-ease-smooth);
                    will-change: transform;
                    transform-origin: center;
                }
                @media (hover: none) {
                    .sys-magnetic { transform: none !important; }
                }
                .sys-progress {
                    animation: sysProgress linear forwards;
                    transform-origin: left;
                    will-change: transform;
                }
                @keyframes sysProgress {
                    from { transform: scaleX(1); }
                    to { transform: scaleX(0); }
                }
                .sys-ripple {
                    position: absolute;
                    border-radius: 50%;
                    transform: scale(0);
                    animation: sysRipple 800ms var(--sys-ease-inertia);
                    background: radial-gradient(circle, rgba(255,255,255,0.5), rgba(255,255,255,0));
                    pointer-events: none;
                }
                @keyframes sysRipple {
                    to { transform: scale(4); opacity: 0; }
                }
                .sys-glow-border {
                    position: relative;
                }
                .sys-glow-border::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    padding: 1px;
                    background: conic-gradient(from var(--sys-glow-angle), transparent, var(--sys-accent), transparent, var(--sys-accent));
                    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                    -webkit-mask-composite: xor;
                    mask-composite: exclude;
                    pointer-events: none;
                    animation: sysGlowRotate 6s linear infinite;
                }
                @property --sys-glow-angle {
                    syntax: "<angle>";
                    initial-value: 0deg;
                    inherits: false;
                }
                @keyframes sysGlowRotate {
                    to { --sys-glow-angle: 360deg; }
                }
                .sys-shimmer-sweep {
                    position: relative;
                    overflow: hidden;
                }
                .sys-shimmer-sweep::after {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
                    transform: translateX(-100%);
                    pointer-events: none;
                }
                @media (hover: hover) {
                    .sys-shimmer-sweep:hover::after { animation: sysSweep 900ms var(--sys-ease-smooth); }
                }
                @keyframes sysSweep {
                    to { transform: translateX(100%); }
                }
                .sys-text-gradient-purple {
                    background: linear-gradient(135deg, #a855f7, #ec4899);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .sys-text-gradient-cyan {
                    background: linear-gradient(135deg, #06b6d4, #3b82f6);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .sys-text-gradient-fire {
                    background: linear-gradient(135deg, #ef4444, #f59e0b);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .sys-text-3d {
                    text-shadow: 0 1px 0 #ccc, 0 2px 0 #c9c9c9, 0 3px 0 #bbb, 0 4px 0 #b9b9b9, 0 5px 0 #aaa, 0 6px 1px rgba(0,0,0,.1), 0 0 5px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.3), 0 3px 5px rgba(0,0,0,.2), 0 5px 10px rgba(0,0,0,.25);
                }
                .sys-mask-fade-y {
                    mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
                    -webkit-mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
                }
                .sys-overlay-backdrop {
                    position: fixed;
                    inset: 0;
                    background: var(--sys-bg-overlay);
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 320ms var(--sys-ease-smooth);
                    z-index: 9998;
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }
                .sys-overlay-backdrop.sys-open {
                    opacity: 1;
                    pointer-events: auto;
                }
            `;
            document.head.appendChild(style);
            injected = true;
        };
        return {
            inject,
            variants,
            set: (name) => {
                inject();
                document.documentElement.dataset.theme = name;
                Store.persist('theme', name);
                Events.emit('theme:change', name);
            },
            current: () => document.documentElement.dataset.theme || 'default'
        };
    })();

    const DOM = {
        create: (tag, attrs = {}, children = []) => {
            const el = document.createElement(tag);
            Object.entries(attrs).forEach(([k, v]) => {
                if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
                else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
                else if (k === 'text') el.textContent = v;
                else if (k === 'html') {
                    const tpl = document.createElement('template');
                    tpl.innerHTML = v;
                    tpl.content.querySelectorAll('*').forEach(n => {
                        for (const a of n.attributes) {
                            if (/^on/i.test(a.name)) n.removeAttribute(a.name);
                            if ((a.name === 'href' || a.name === 'src') && !$isSafeURL(a.value)) n.removeAttribute(a.name);
                        }
                    });
                    el.appendChild(tpl.content);
                } else if (k === 'ref' && typeof v === 'function') v(el);
                else if (k === 'href' || k === 'src') el.setAttribute(k, $sanitizeURL(v));
                else el.setAttribute(k, v);
            });
            const arr = Array.isArray(children) ? children : [children];
            for (const c of arr) {
                if (c == null) continue;
                el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            }
            return el;
        },
        mount: (id, zIndex, cls) => {
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.className = cls || '';
                el.style.position = 'fixed';
                el.style.zIndex = zIndex;
                document.body.appendChild(el);
            }
            return el;
        },
        trapFocus: (container) => {
            const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            const els = Array.from(container.querySelectorAll(sel));
            if (!els.length) return $noop;
            const first = els[0], last = els[els.length - 1];
            const handler = (e) => {
                if (e.key !== 'Tab') return;
                if (e.shiftKey) {
                    if (document.activeElement === first) { last.focus(); e.preventDefault(); }
                } else {
                    if (document.activeElement === last) { first.focus(); e.preventDefault(); }
                }
            };
            container.addEventListener('keydown', handler);
            return () => container.removeEventListener('keydown', handler);
        }
    };

    const Audio = (() => {
        let ctx = null;
        const play = (type) => {
            if ($isLowEnd) return;
            try {
                if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === 'suspended') ctx.resume();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                const t = ctx.currentTime;
                if (type === 'click') {
                    osc.frequency.setValueAtTime(880, t);
                    osc.frequency.exponentialRampToValueAtTime(110, t + 0.04);
                    gain.gain.setValueAtTime(0.04, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
                    osc.start(t); osc.stop(t + 0.04);
                } else if (type === 'pop') {
                    osc.frequency.setValueAtTime(440, t);
                    osc.frequency.exponentialRampToValueAtTime(880, t + 0.06);
                    gain.gain.setValueAtTime(0.05, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                    osc.start(t); osc.stop(t + 0.06);
                } else if (type === 'success') {
                    osc.frequency.setValueAtTime(587.33, t);
                    osc.frequency.setValueAtTime(880, t + 0.08);
                    gain.gain.setValueAtTime(0.04, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                }
            } catch {}
        };
        return { play, tone: (f, d, g) => play('click') };
    })();

    const Haptics = {
        light: () => { if (navigator.vibrate) navigator.vibrate(12); },
        medium: () => { if (navigator.vibrate) navigator.vibrate(25); },
        heavy: () => { if (navigator.vibrate) navigator.vibrate(45); },
        error: () => { if (navigator.vibrate) navigator.vibrate([40, 40, 40]); }
    };

    const Actions = (() => {
        const registry = new Map();
        const groups = new Map();
        return {
            register: (action) => {
                registry.set(action.id, action);
                if (action.group) {
                    if (!groups.has(action.group)) groups.set(action.group, new Set());
                    groups.get(action.group).add(action.id);
                }
            },
            execute: async (id, payload) => {
                const action = registry.get(id);
                if (!action?.handler) return;
                Audio.play(action.sound || 'click');
                Haptics.light();
                Bus.emit('action:before', { id, payload });
                try {
                    const result = await action.handler(payload);
                    Bus.emit('action:executed', { id, payload, result });
                    const history = State.cmdState.history;
                    history.unshift(id);
                    State.cmdState.history = [...new Set(history)].slice(0, 24);
                    $safeSet('sysui_cmd_history', State.cmdState.history);
                    return result;
                } catch (e) {
                    Bus.emit('action:error', { id, payload, error: e });
                    throw e;
                }
            },
            get: (id) => registry.get(id),
            getAll: () => Array.from(registry.values()),
            getGroup: (g) => Array.from(groups.get(g) || []).map(id => registry.get(id)).filter(Boolean),
            toggleFavorite: (id) => {
                if (State.cmdState.favorites.has(id)) State.cmdState.favorites.delete(id);
                else State.cmdState.favorites.add(id);
                $safeSet('sysui_cmd_favs', [...State.cmdState.favorites]);
            },
            search: (query) => {
                const q = query.toLowerCase().trim();
                if (!q) return Actions.getAll();
                return Actions.getAll().filter(a => 
                    a.title?.toLowerCase().includes(q) || 
                    a.description?.toLowerCase().includes(q) || 
                    a.id.toLowerCase().includes(q)
                );
            }
        };
    })();

    const Toasts = (() => {
        const getContainer = () => DOM.mount('sys-toast-box', Layers.toast, 'fixed bottom-4 left-4 right-4 md:left-auto md:w-96 flex flex-col gap-2.5 pointer-events-none max-w-full');
        const create = (config) => {
            const id = $uid();
            const container = getContainer();
            const el = DOM.create('div', {
                class: 'sys-glass px-4 py-3 rounded-xl flex items-center justify-between gap-3 shadow-xl pointer-events-auto text-sm w-full sys-scale-in',
                id: 'toast-' + id,
                role: 'alert'
            });
            el.innerHTML = `<div><p class="font-medium text-white">${$esc(config.title)}</p>${config.description ? `<p class="text-xs text-gray-400 mt-0.5">${$esc(config.description)}</p>` : ''}</div>`;
            const closeBtn = DOM.create('button', { class: 'text-white/40 hover:text-white transition-colors text-xs p-1', text: '✕' });
            closeBtn.addEventListener('click', () => remove(id));
            el.appendChild(closeBtn);
            container.appendChild(el);
            State.toasts.set(id, el);
            if (config.duration !== Infinity) {
                setTimeout(() => remove(id), config.duration || 4000);
            }
            Audio.play('pop');
            return id;
        };
        const remove = (id) => {
            const el = State.toasts.get(id);
            if (!el) return;
            Motion.exit.fade(el).then(() => { el.remove(); State.toasts.delete(id); });
        };
        return { create, remove, clear: () => { State.toasts.forEach((_, id) => remove(id)); }, promise: async (promiseOrFn, opts = {}) => {
            const id = create({ title: opts.loading || 'جاري التحميل...', duration: Infinity });
            try {
                const result = await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
                remove(id);
                create({ title: opts.success || 'تمت العملية بنجاح', duration: 3000 });
                Audio.play('success');
                return result;
            } catch (e) {
                remove(id);
                create({ title: opts.error || 'فشلت العملية', description: e.message, duration: 4000 });
                Haptics.error();
                throw e;
            }
        }};
    })();

    const Modals = (() => {
        const getBackdrop = () => DOM.mount('sys-backdrop', Layers.backdrop, 'sys-overlay-backdrop');
        const toggleBackdrop = (show) => {
            const bd = getBackdrop();
            if (show) requestAnimationFrame(() => bd.classList.add('sys-open'));
            else bd.classList.remove('sys-open');
        };
        return {
            open: (config) => {
                return new Promise((resolve) => {
                    toggleBackdrop(true);
                    const container = DOM.mount('sys-modal-root', Layers.modal, 'fixed inset-0 flex items-center justify-center p-4 pointer-events-none');
                    const el = DOM.create('div', {
                        class: 'sys-glass px-6 py-5 rounded-2xl w-full max-w-md shadow-2xl pointer-events-auto flex flex-col gap-4 text-right sys-scale-in',
                        role: 'dialog',
                        'aria-modal': 'true'
                    });
                    el.innerHTML = `<h3 class="text-lg font-bold text-white">${$esc(config.title)}</h3><p class="text-sm text-gray-300">${$esc(config.description)}</p>`;
                    const foot = DOM.create('div', { class: 'flex justify-end gap-3 mt-2' });
                    const cancel = DOM.create('button', { class: 'px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 text-sm font-medium transition-colors', text: config.cancelLabel || 'إلغاء' });
                    const confirm = DOM.create('button', { class: 'px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors shadow-lg shadow-purple-600/20', text: config.confirmLabel || 'تأكيد' });
                    
                    const close = (val) => {
                        toggleBackdrop(false);
                        Motion.exit.fade(el).then(() => { el.remove(); container.remove(); resolve(val); });
                    };
                    cancel.addEventListener('click', () => close(false));
                    confirm.addEventListener('click', () => close(true));
                    foot.append(cancel, confirm);
                    el.appendChild(foot);
                    container.appendChild(el);
                    Audio.play('pop');
                });
            }
        };
    })();

    const CommandPalette = (() => {
        let active = false;
        const toggle = () => {
            if (active) close();
            else open();
        };
        const open = () => {
            active = true;
            const bd = DOM.mount('sys-backdrop', Layers.backdrop, 'sys-overlay-backdrop');
            bd.classList.add('sys-open');
            const root = DOM.mount('sys-cmd-palette', Layers.cmd, 'fixed inset-x-0 top-[10%] mx-auto w-full max-w-2xl px-4 pointer-events-none');
            const box = DOM.create('div', { class: 'sys-glass px-4 py-3 rounded-2xl shadow-2xl pointer-events-auto w-full flex flex-col gap-3 text-right sys-scale-in' });
            box.innerHTML = `<input type="text" placeholder="ابحث عن الإجراءات أو الأوامر..." class="w-full bg-transparent border-b border-white/10 py-2 px-1 text-white placeholder-gray-500 outline-none text-base" id="sys-cmd-input" dir="rtl">`;
            const resultsBox = DOM.create('div', { class: 'flex flex-col gap-1.5 max-h-72 overflow-y-auto padding-1' });
            box.appendChild(resultsBox);
            root.appendChild(box);
            
            const input = box.querySelector('#sys-cmd-input');
            input.focus();
            
            const render = (q = '') => {
                resultsBox.innerHTML = '';
                const items = Actions.search(q);
                if (!items.length) {
                    resultsBox.innerHTML = `<p class="text-sm text-muted py-3 text-center">لا توجد نتائج مطابقة</p>`;
                    return;
                }
                items.forEach((item, idx) => {
                    const row = DOM.create('div', { class: 'flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-all border border-transparent' });
                    row.innerHTML = `<span class="text-sm text-white font-medium">${$esc(item.title)}</span><span class="text-xs text-muted">${$esc(item.description || '')}</span>`;
                    row.addEventListener('click', () => {
                        Actions.execute(item.id);
                        close();
                    });
                    resultsBox.appendChild(row);
                });
            };
            
            input.addEventListener('input', (e) => render(e.target.value));
            bd.addEventListener('click', close);
            render();
        };
        const close = () => {
            active = false;
            const bd = document.getElementById('sys-backdrop');
            if (bd) bd.classList.remove('sys-open');
            const cp = document.getElementById('sys-cmd-palette');
            if (cp) cp.remove();
        };
        rootOwner.listen(window, 'keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); toggle(); }
            if (e.key === 'Escape' && active) { e.preventDefault(); close(); }
        });
        return { toggle, open, close };
    })();

    const Page = {
        setup: (config) => {
            Theme.inject();
            Bus.emit('page:ready', config);
        }
    };

    const SmartLoader = {
        wrap: async (promiseOrFn, containerId, opts = {}) => {
            const container = document.getElementById(containerId);
            if (!container) return await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
            const type = opts.skeletonType || 'card';
            container.innerHTML = UIHelpers.generateSkeleton(type, opts.count || 3);
            try {
                const res = await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
                return res;
            } catch (e) {
                container.innerHTML = `<p class="text-red-400 text-sm text-center p-5">حدث خطأ أثناء تحميل البيانات</p>`;
                throw e;
            }
        }
    };

    const UIHelpers = {
        presence: (msg, duration = 8000) => {
            Theme.inject();
            const container = DOM.mount('sys-presence-bar', Layers.base + 50, 'fixed flex flex-col gap-2 pointer-events-none');
            container.style.top = 'calc(1rem + var(--sys-safe-top))';
            container.style.right = 'calc(1rem + var(--sys-safe-right))';
            const el = DOM.create('div', { class: 'flex items-center gap-2.5 px-4 py-2 rounded-full sys-glass shadow-xl pointer-events-auto w-max max-w-full' });
            el.innerHTML = `<div class="relative"><div class="w-2 h-2 rounded-full bg-green-500"></div><div class="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping"></div></div><span class="text-xs text-white">${$esc(msg)}</span>`;
            container.appendChild(el);
            setTimeout(() => el.remove(), duration);
        },
        generateSkeleton: (type, count = 3) => {
            const skeleton = `<div class="p-4 rounded-2xl sys-glass flex flex-col gap-3 w-full animate-pulse"><div class="h-4 w-1/3 sys-skeleton-bg rounded-full"></div><div class="h-3 w-full sys-skeleton-bg rounded-full"></div><div class="h-3 w-4/5 sys-skeleton-bg rounded-full opacity-75"></div></div>`;
            return Array(count).fill(skeleton).join('');
        },
        createOnboardingSpotlight: (target, message, dismissLabel = 'فهمت') => {
            const rect = target.getBoundingClientRect();
            const overlay = DOM.mount('sys-spotlight-box', Layers.spotlight, 'fixed inset-0 pointer-events-none transition-opacity duration-300');
            overlay.innerHTML = '';
            const hole = DOM.create('div', {
                class: 'absolute transition-all duration-300',
                style: {
                    top: (rect.top - 8) + 'px',
                    left: (rect.left - 8) + 'px',
                    width: (rect.width + 16) + 'px',
                    height: (rect.height + 16) + 'px',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)'
                }
            });
            const bubble = DOM.create('div', {
                class: 'absolute sys-glass-glow px-4 py-3 rounded-xl text-sm text-white pointer-events-auto shadow-2xl flex flex-col gap-2 text-right',
                style: { top: (rect.bottom + 16) + 'px', left: rect.left + 'px', maxWidth: '85vw' }
            });
            bubble.innerHTML = `<p>${$esc(message)}</p>`;
            const btn = DOM.create('button', { class: 'px-3 py-1 bg-purple-600 rounded-lg text-xs self-end text-white', text: dismissLabel });
            btn.addEventListener('click', () => overlay.remove());
            bubble.appendChild(btn);
            overlay.append(hole, bubble);
        },
        createCustomPointerTrails: () => {
            if ($isTouch) return;
            const canvas = document.createElement('canvas');
            canvas.style.position = 'fixed';
            canvas.style.inset = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = String(Layers.particles);
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            let pts = [];
            window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
            window.addEventListener('pointermove', (e) => { pts.push({ x: e.clientX, y: e.clientY, alpha: 1 }); });
            const loop = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                pts.forEach((p, idx) => {
                    p.alpha -= 0.04;
                    if (p.alpha <= 0) return;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 4 * p.alpha, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(168, 85, 247, ${p.alpha * 0.4})`;
                    ctx.fill();
                });
                pts = pts.filter(p => p.alpha > 0);
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        },
        createStateOverlay: () => {
            const box = DOM.mount('sys-state-hud', Layers.hud, 'fixed top-4 left-4 sys-glass px-3 py-2 rounded-xl text-xs text-gray-400 font-mono hidden md:flex flex-col gap-1');
            const update = () => {
                const metrics = FrameScheduler.metrics();
                box.innerHTML = `<div>FPS: ${metrics.fps}</div><div>BP: ${Viewport.get().breakpoint}</div>`;
            };
            Lifecycle.rootOwner.interval(update, 1000);
            box.classList.remove('hidden');
        }
    };

    const Ripple = {
        attach: (el) => {
            el.addEventListener('pointerdown', (e) => {
                const rect = el.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;
                const r = DOM.create('span', {
                    class: 'sys-ripple',
                    style: { width: size + 'px', height: size + 'px', left: x + 'px', top: y + 'px' }
                });
                el.style.position = 'relative';
                el.style.overflow = 'hidden';
                el.appendChild(r);
                r.addEventListener('animationend', () => r.remove());
            });
        }
    };

    const Sparkline = {
        generate: (values, width = 120, height = 30) => {
            if (!values || !values.length) return '';
            const max = Math.max(...values);
            const min = Math.min(...values);
            const range = max - min || 1;
            const pts = values.map((v, i) => {
                const x = (i / (values.length - 1)) * width;
                const y = height - ((v - min) / range) * height;
                return `${x},${y}`;
            }).join(' ');
            return `<svg width="${width}" height="${height}" class="overflow-visible"><polyline fill="none" stroke="var(--sys-accent)" stroke-width="1.5" points="${pts}"/></svg>`;
        }
    };

    return {
        FrameScheduler,
        Viewport,
        Lifecycle,
        Events,
        Store,
        Layers,
        State,
        Motion,
        Audio,
        Actions,
        Page,
        SmartLoader,
        UIHelpers,
        Ripple,
        Sparkline
    };
})();
export const trashSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>`;
