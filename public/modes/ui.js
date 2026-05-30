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
                try { task(t); } catch (e) { console.warn('[Scheduler]', e); }
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
                    for (const fn of cleanups) { try { fn(); } catch (e) { console.warn('[Lifecycle]', e); } }
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
                if (set) for (const cb of set) { try { cb(data); } catch (e) { console.error('[Bus]', event, e); } }
                for (const cb of wildcards) { try { cb({ event, data }); } catch (e) { console.error('[Bus]', e); } }
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
                if (set) for (const cb of set) { try { cb(data); } catch (e) { console.error('[Bus]', e); } }
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
                for (const mw of middleware) { try { next = mw(k, next, prev) ?? next; } catch (e) { console.error('[Store:mw]', e); } }
                if (Object.is(prev, next)) return;
                state.set(k, next);
                history.push({ k, prev, next, t: $now() });
                if (history.length > MAX_HISTORY) history.shift();
                const set = subs.get(k);
                if (set) for (const cb of set) { try { cb(next, prev); } catch (e) { console.error('[Store]', e); } }
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
            const first = el.getBoundingClientRect();
            mutator();
            const last = el.getBoundingClientRect();
            return flip(el, first, last);
        };

        const inertial = (el, velocity, friction = 0.92) => {
            if ($reducedMotion || !el) return Promise.resolve();
            return new Promise(resolve => {
                let vx = velocity.vx * 16, vy = velocity.vy * 16;
                let tx = 0, ty = 0;
                let raf;
                const tick = () => {
                    tx += vx; ty += vy;
                    vx *= friction; vy *= friction;
                    el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
                    if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) raf = requestAnimationFrame(tick);
                    else resolve();
                };
                raf = requestAnimationFrame(tick);
            });
        };

        const countUp = (el, from, to, duration = 1200, format = (n) => Math.round(n)) => {
            if (!el) return Promise.resolve();
            if ($reducedMotion) { el.textContent = format(to); return Promise.resolve(); }
            return new Promise(resolve => {
                const start = $now();
                const tick = (t) => {
                    const p = $clamp((t - start) / duration, 0, 1);
                    const eased = $easeOutExpo(p);
                    el.textContent = format($lerp(from, to, eased));
                    if (p < 1) requestAnimationFrame(tick);
                    else resolve();
                };
                requestAnimationFrame(tick);
            });
        };

        return { tokens, animate, spring, stagger, enter, exit, shake, pulse, glitch, flip, morphLayout, inertial, countUp, reduce, springCurve, springDuration, cancel: cancelOn };
    })();

    const Audio = (() => {
        let ctx = null, master = null, compressor = null, reverb = null, lowShelf = null, initialized = false;
        let muted = $safeJSON('sysui_audio_muted', false);
        let volume = $safeJSON('sysui_audio_volume', 0.32);
        const activeNodes = new Set();
        const MAX_CONCURRENT = $perfTier === 'low' ? 8 : 24;

        const init = async () => {
            if (initialized && ctx) {
                if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
                return ctx.state === 'running';
            }
            if (!ctx) {
                try {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return false;
                    ctx = new AC({ latencyHint: 'interactive' });
                    compressor = ctx.createDynamicsCompressor();
                    compressor.threshold.value = -16;
                    compressor.knee.value = 14;
                    compressor.ratio.value = 5;
                    compressor.attack.value = 0.002;
                    compressor.release.value = 0.18;
                    lowShelf = ctx.createBiquadFilter();
                    lowShelf.type = 'lowshelf';
                    lowShelf.frequency.value = 240;
                    lowShelf.gain.value = -3;
                    master = ctx.createGain();
                    master.gain.value = volume;
                    if ($perfTier !== 'low') {
                        try {
                            reverb = ctx.createConvolver();
                            const len = ctx.sampleRate * 0.55;
                            const buf = ctx.createBuffer(2, len, ctx.sampleRate);
                            for (let ch = 0; ch < 2; ch++) {
                                const d = buf.getChannelData(ch);
                                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
                            }
                            reverb.buffer = buf;
                            const wet = ctx.createGain();
                            wet.gain.value = 0.06;
                            master.connect(reverb); reverb.connect(wet); wet.connect(lowShelf);
                        } catch {}
                    }
                    master.connect(lowShelf);
                    lowShelf.connect(compressor);
                    compressor.connect(ctx.destination);
                    initialized = true;
                } catch { return false; }
            }
            if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
            return ctx.state === 'running';
        };

        const cleanup = (nodes) => {
            for (const n of nodes) { try { n.disconnect(); } catch {} }
            activeNodes.delete(nodes);
        };

        const tone = async (freq, type, dur, vol, detune = 0, attack = 0.003, filterFreq = null) => {
            if (muted || activeNodes.size >= MAX_CONCURRENT) return;
            if (!(await init())) return;
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                const nodes = [osc, gain, filter];
                activeNodes.add(nodes);
                filter.type = 'lowpass';
                filter.frequency.value = filterFreq ?? freq * 5;
                filter.Q.value = 1.1;
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                osc.detune.setValueAtTime(detune, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
                osc.connect(filter); filter.connect(gain); gain.connect(master);
                osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
                osc.onended = () => cleanup(nodes);
            } catch {}
        };

        const sweep = async (f1, f2, type, dur, vol, curve = 'exp') => {
            if (muted || activeNodes.size >= MAX_CONCURRENT) return;
            if (!(await init())) return;
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const nodes = [osc, gain];
                activeNodes.add(nodes);
                osc.type = type;
                osc.frequency.setValueAtTime(f1, ctx.currentTime);
                if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, f2), ctx.currentTime + dur);
                else osc.frequency.linearRampToValueAtTime(f2, ctx.currentTime + dur);
                gain.gain.setValueAtTime(vol, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
                osc.connect(gain); gain.connect(master);
                osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
                osc.onended = () => cleanup(nodes);
            } catch {}
        };

        const chord = (freqs, type, dur, vol) => freqs.forEach((f, i) => setTimeout(() => tone(f, type, dur, vol), i * 28));

        const noise = async (dur, vol, filterFreq = 2000, type = 'bandpass') => {
            if (muted || activeNodes.size >= MAX_CONCURRENT) return;
            if (!(await init())) return;
            try {
                const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.8);
                const src = ctx.createBufferSource();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                const nodes = [src, gain, filter];
                activeNodes.add(nodes);
                filter.type = type;
                filter.frequency.value = filterFreq;
                filter.Q.value = 2;
                src.buffer = buf;
                gain.gain.value = vol;
                src.connect(filter); filter.connect(gain); gain.connect(master);
                src.start();
                src.onended = () => cleanup(nodes);
            } catch {}
        };

        const presets = {
            pop: () => { tone(1200, 'sine', 0.05, 0.05, 0, 0.002); tone(1800, 'sine', 0.03, 0.02, 0, 0.001); },
            click: () => { tone(2200, 'triangle', 0.018, 0.035, 0, 0.0005); tone(3200, 'sine', 0.012, 0.02, 0, 0.0003); },
            tap: () => tone(2800, 'sine', 0.012, 0.025, 0, 0.0005),
            success: () => chord([523.25, 659.25, 783.99, 1046.5], 'sine', 0.22, 0.07),
            error: () => { tone(220, 'sawtooth', 0.16, 0.08, 0, 0.001, 700); setTimeout(() => tone(165, 'sawtooth', 0.2, 0.08, 0, 0.001, 550), 105); },
            open: () => { sweep(320, 960, 'sine', 0.16, 0.05); tone(1920, 'sine', 0.14, 0.025, 0, 0.04); },
            close: () => sweep(960, 320, 'sine', 0.13, 0.045),
            hover: () => tone(3200, 'sine', 0.008, 0.012, 0, 0.001),
            notify: () => chord([880, 1318.51], 'sine', 0.16, 0.06),
            warn: () => { tone(520, 'triangle', 0.11, 0.07); setTimeout(() => tone(520, 'triangle', 0.11, 0.07), 150); },
            tick: () => tone(3400, 'square', 0.006, 0.014),
            magic: () => { for (let i = 0; i < 6; i++) setTimeout(() => tone(880 + i * 180, 'sine', 0.11, 0.04 - i * 0.005), i * 42); },
            whoosh: () => noise(0.22, 0.045, 1400),
            bell: () => { tone(1760, 'sine', 0.55, 0.06); tone(2640, 'sine', 0.45, 0.03); tone(3520, 'sine', 0.35, 0.018); },
            select: () => { tone(1400, 'sine', 0.035, 0.04); setTimeout(() => tone(2100, 'sine', 0.045, 0.03), 28); },
            delete: () => { sweep(700, 220, 'sawtooth', 0.16, 0.055); noise(0.13, 0.03, 900); },
            swoosh: () => { sweep(420, 1240, 'sine', 0.11, 0.04); noise(0.11, 0.03, 2600); },
            crystal: () => { tone(2093, 'sine', 0.38, 0.045); tone(3136, 'sine', 0.33, 0.025); tone(4186, 'sine', 0.28, 0.015); },
            morph: () => sweep(440, 880, 'triangle', 0.18, 0.04, 'lin'),
            focus: () => tone(1600, 'sine', 0.04, 0.022, 0, 0.002),
            unfocus: () => tone(1100, 'sine', 0.035, 0.018, 0, 0.002),
            slide: () => sweep(1800, 900, 'sine', 0.09, 0.025),
            confirm: () => { tone(1318, 'sine', 0.06, 0.05); setTimeout(() => tone(1760, 'sine', 0.09, 0.045), 50); },
            quantum: () => { for (let i = 0; i < 8; i++) setTimeout(() => tone(440 * Math.pow(2, i / 4), 'sine', 0.18, 0.025), i * 35); },
            zap: () => { sweep(2400, 200, 'sawtooth', 0.08, 0.06); noise(0.05, 0.04, 4000, 'highpass'); },
            chime: () => { chord([1046.5, 1318.5, 1568, 2093], 'sine', 0.6, 0.045); }
        };

        return {
            play: (name) => presets[name]?.(),
            tone, sweep, chord, noise,
            mute: (v) => { muted = !!v; $safeSet('sysui_audio_muted', muted); Bus.emit('audio:mute', muted); },
            isMuted: () => muted,
            setVolume: (v) => { volume = $clamp(v, 0, 1); if (master) master.gain.value = volume; $safeSet('sysui_audio_volume', volume); },
            getVolume: () => volume,
            suspend: async () => { if (ctx?.state === 'running') await ctx.suspend(); }
        };
    })();

    const Haptics = {
        light: () => $isTouch && navigator.vibrate?.(6),
        medium: () => $isTouch && navigator.vibrate?.(12),
        heavy: () => $isTouch && navigator.vibrate?.(24),
        success: () => $isTouch && navigator.vibrate?.([8, 28, 8]),
        error: () => $isTouch && navigator.vibrate?.([24, 48, 24, 48, 24]),
        warn: () => $isTouch && navigator.vibrate?.([18, 36, 18]),
        select: () => $isTouch && navigator.vibrate?.(4),
        soft: () => $isTouch && navigator.vibrate?.(2),
        impact: () => $isTouch && navigator.vibrate?.([4, 8, 16]),
        pulse: () => $isTouch && navigator.vibrate?.([6, 18, 6, 18, 6])
    };

    const Theme = (() => {
        let injected = false;
        const palettes = {
            obsidian: { accent: '#a855f7', bg: '#000000', surface: '#0a0a0a' },
            azure: { accent: '#3b82f6', bg: '#000814', surface: '#001233' },
            emerald: { accent: '#10b981', bg: '#000a06', surface: '#001f12' },
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
                    --sys-bg-overlay: rgba(0, 0, 0, 0.72);
                    --sys-border-subtle: rgba(255, 255, 255, 0.04);
                    --sys-border-base: rgba(255, 255, 255, 0.08);
                    --sys-border-strong: rgba(255, 255, 255, 0.16);
                    --sys-border-glow: rgba(168, 85, 247, 0.3);
                    --sys-text-primary: rgba(255, 255, 255, 0.96);
                    --sys-text-secondary: rgba(255, 255, 255, 0.58);
                    --sys-text-muted: rgba(255, 255, 255, 0.34);
                    --sys-accent-base: #ffffff;
                    --sys-accent-primary: #a855f7;
                    --sys-accent-success: #22c55e;
                    --sys-accent-danger: #ef4444;
                    --sys-accent-warn: #eab308;
                    --sys-accent-info: #3b82f6;
                    --sys-accent-purple: #a855f7;
                    --sys-accent-pink: #ec4899;
                    --sys-accent-cyan: #06b6d4;
                    --sys-touch-target: max(44px, 2.75rem);
                    --sys-touch-target-sm: max(36px, 2.25rem);
                    --sys-radius-xs: clamp(3px, 0.4vw, 4px);
                    --sys-radius-sm: clamp(5px, 0.5vw, 6px);
                    --sys-radius-md: clamp(8px, 0.8vw, 10px);
                    --sys-radius-lg: clamp(12px, 1.2vw, 16px);
                    --sys-radius-xl: clamp(18px, 1.8vw, 24px);
                    --sys-radius-2xl: clamp(24px, 2.4vw, 32px);
                    --sys-space-1: clamp(0.25rem, 0.5vw, 0.375rem);
                    --sys-space-2: clamp(0.5rem, 1vw, 0.75rem);
                    --sys-space-3: clamp(0.75rem, 1.5vw, 1rem);
                    --sys-space-4: clamp(1rem, 2vw, 1.5rem);
                    --sys-space-5: clamp(1.25rem, 2.5vw, 2rem);
                    --sys-space-6: clamp(1.5rem, 3vw, 2.5rem);
                    --sys-text-xs: clamp(0.6875rem, 0.65vw + 0.5rem, 0.75rem);
                    --sys-text-sm: clamp(0.8125rem, 0.7vw + 0.6rem, 0.875rem);
                    --sys-text-base: clamp(0.875rem, 0.8vw + 0.7rem, 1rem);
                    --sys-text-lg: clamp(1rem, 1vw + 0.8rem, 1.125rem);
                    --sys-text-xl: clamp(1.125rem, 1.2vw + 0.9rem, 1.375rem);
                    --sys-text-2xl: clamp(1.375rem, 1.6vw + 1rem, 1.75rem);
                    --sys-text-3xl: clamp(1.75rem, 2vw + 1.2rem, 2.25rem);
                    --sys-content-max: min(1440px, 92vw);
                    --sys-content-narrow: min(640px, 92vw);
                    --sys-content-prose: min(72ch, 92vw);
                    --sys-dur-instant: 60ms;
                    --sys-dur-micro: 110ms;
                    --sys-dur-fast: 170ms;
                    --sys-dur-normal: 230ms;
                    --sys-dur-emphasized: 320ms;
                    --sys-dur-slow: 460ms;
                    --sys-dur-slower: 640ms;
                    --sys-ease-standard: cubic-bezier(0.2, 0, 0, 1);
                    --sys-ease-emphasized: cubic-bezier(0.3, 0, 0, 1);
                    --sys-ease-decelerate: cubic-bezier(0, 0, 0, 1);
                    --sys-ease-accelerate: cubic-bezier(0.3, 0, 1, 1);
                    --sys-ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
                    --sys-ease-spring-soft: cubic-bezier(0.34, 1.26, 0.64, 1);
                    --sys-ease-spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
                    --sys-ease-spring-snappy: cubic-bezier(0.22, 1, 0.36, 1);
                    --sys-ease-spring-precise: cubic-bezier(0.32, 0.72, 0, 1);
                    --sys-ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
                    --sys-ease-elastic: cubic-bezier(0.68, -0.4, 0.265, 1.4);
                    --sys-ease-apple: cubic-bezier(0.32, 0.72, 0, 1);
                    --sys-ease-inertia: cubic-bezier(0.05, 0.7, 0.1, 1);
                    --sys-ease-magnetic: cubic-bezier(0.18, 0.89, 0.32, 1.28);
                    --sys-motion-instant: 60ms;
                    --sys-motion-fast: 170ms;
                    --sys-motion-normal: 230ms;
                    --sys-motion-slow: 460ms;
                    --sys-motion-slower: 640ms;
                    --sys-ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
                    --sys-ease-snap: cubic-bezier(0.22, 1, 0.36, 1);
                    --sys-glow-sm: 0 0 12px rgba(255, 255, 255, 0.1);
                    --sys-glow-md: 0 0 32px rgba(255, 255, 255, 0.15);
                    --sys-glow-lg: 0 0 64px rgba(255, 255, 255, 0.2);
                    --sys-glow-accent: 0 0 32px rgba(168, 85, 247, 0.35);
                    --sys-shadow-xs: 0 1px 2px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(255,255,255,0.04);
                    --sys-shadow-sm: 0 2px 6px -1px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(255,255,255,0.05);
                    --sys-shadow-md: 0 6px 20px -4px rgba(0,0,0,0.5), 0 4px 8px -2px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(255,255,255,0.06);
                    --sys-shadow-lg: 0 20px 50px -12px rgba(0,0,0,0.65), 0 12px 24px -8px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.07);
                    --sys-shadow-xl: 0 36px 88px -16px rgba(0,0,0,0.75), 0 22px 44px -12px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08);
                    --sys-shadow-2xl: 0 56px 128px -20px rgba(0,0,0,0.85), 0 32px 64px -16px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.09);
                    --sys-gradient-aurora: linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #06b6d4 100%);
                    --sys-gradient-fire: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%);
                    --sys-gradient-ocean: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%);
                    --sys-gradient-sunset: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #a855f7 100%);
                    --sys-gradient-cyber: linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%);
                    --sys-gradient-mesh: radial-gradient(at 40% 20%, rgba(168,85,247,0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59,130,246,0.12) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(236,72,153,0.1) 0px, transparent 50%), radial-gradient(at 80% 50%, rgba(6,182,212,0.1) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(168,85,247,0.12) 0px, transparent 50%);
                    --sys-safe-top: env(safe-area-inset-top, 0px);
                    --sys-safe-bottom: env(safe-area-inset-bottom, 0px);
                    --sys-safe-left: env(safe-area-inset-left, 0px);
                    --sys-safe-right: env(safe-area-inset-right, 0px);
                    --sys-mx: 50%;
                    --sys-my: 50%;
                    --sys-blur-strength: 32px;
                    --sys-noise-opacity: 0.025;
                }
                [data-perf="low"] { --sys-blur-strength: 12px; --sys-noise-opacity: 0; }
                [data-perf="mid"] { --sys-blur-strength: 20px; }
                @media (prefers-contrast: more) {
                    :root {
                        --sys-border-base: rgba(255,255,255,0.3);
                        --sys-border-strong: rgba(255,255,255,0.5);
                        --sys-text-secondary: rgba(255,255,255,0.85);
                        --sys-text-muted: rgba(255,255,255,0.65);
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    *, *::before, *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                        scroll-behavior: auto !important;
                    }
                }
                @media (prefers-reduced-motion: no-preference) {
                    @supports (animation-timeline: view()) {
                        .sys-reveal-scroll { animation: sysRevealScroll linear; animation-timeline: view(); animation-range: entry 0% cover 30%; }
                        @keyframes sysRevealScroll { from { opacity: 0; transform: translateY(40px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
                        .sys-parallax-scroll { animation: sysParallax linear; animation-timeline: view(); animation-range: entry 0% exit 100%; }
                        @keyframes sysParallax { from { transform: translateY(60px); } to { transform: translateY(-60px); } }
                    }
                }
                ::selection { background: rgba(168, 85, 247, 0.4); color: #fff; text-shadow: 0 0 8px rgba(168,85,247,0.6); }
                ::-moz-selection { background: rgba(168, 85, 247, 0.4); color: #fff; }
                html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
                body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; font-feature-settings: 'ss01', 'ss02', 'cv01', 'cv11'; padding-top: var(--sys-safe-top); padding-bottom: var(--sys-safe-bottom); padding-left: var(--sys-safe-left); padding-right: var(--sys-safe-right); overflow-x: hidden; min-height: 100vh; min-height: 100dvh; }
                body::before {
                    content: ""; position: fixed; inset: 0; z-index: -2; pointer-events: none;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='[w3.org](http://www.w3.org/2000/svg)'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
                    opacity: var(--sys-noise-opacity);
                }
                body::after {
                    content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
                    background: var(--sys-gradient-mesh);
                    animation: sysMeshDrift 36s ease-in-out infinite alternate;
                    will-change: transform;
                }
                [data-perf="low"] body::after { animation: none; }
                @keyframes sysMeshDrift { 0% { transform: scale(1) rotate(0deg); } 100% { transform: scale(1.18) rotate(10deg); } }
                .sys-glass {
                    background: rgba(10, 10, 12, 0.62);
                    backdrop-filter: blur(var(--sys-blur-strength)) saturate(200%) contrast(1.05);
                    -webkit-backdrop-filter: blur(var(--sys-blur-strength)) saturate(200%) contrast(1.05);
                    border: 0.5px solid var(--sys-border-base);
                    box-shadow: var(--sys-shadow-md), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5);
                    will-change: transform, opacity;
                    position: relative;
                }
                .sys-glass-strong {
                    background: rgba(14, 14, 18, 0.82);
                    backdrop-filter: blur(calc(var(--sys-blur-strength) * 1.75)) saturate(220%) contrast(1.08);
                    -webkit-backdrop-filter: blur(calc(var(--sys-blur-strength) * 1.75)) saturate(220%) contrast(1.08);
                    border: 0.5px solid var(--sys-border-strong);
                    box-shadow: var(--sys-shadow-xl), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.03);
                    will-change: transform, opacity;
                    position: relative;
                }
                @supports not (backdrop-filter: blur(1px)) {
                    .sys-glass { background: rgba(14, 14, 18, 0.95); }
                    .sys-glass-strong { background: rgba(18, 18, 22, 0.98); }
                }
                .sys-glass-glow {
                    background: rgba(14, 14, 18, 0.78);
                    backdrop-filter: blur(calc(var(--sys-blur-strength) * 1.4)) saturate(210%);
                    border: 0.5px solid rgba(168, 85, 247, 0.28);
                    box-shadow: var(--sys-shadow-lg), 0 0 56px rgba(168, 85, 247, 0.22), inset 0 1px 0 rgba(255,255,255,0.09);
                }
                .sys-glass::before, .sys-glass-strong::before {
                    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 0.5px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.14), transparent 35%, transparent 65%, rgba(255,255,255,0.06));
                    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                    -webkit-mask-composite: xor; mask-composite: exclude;
                    pointer-events: none;
                }
                .sys-glass::after, .sys-glass-strong::after {
                    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
                    background: radial-gradient(600px circle at var(--sys-mx) var(--sys-my), rgba(255,255,255,0.04), transparent 40%);
                    opacity: 0; transition: opacity 400ms var(--sys-ease-smooth);
                }
                @media (hover: hover) {
                    .sys-glass:hover::after, .sys-glass-strong:hover::after { opacity: 1; }
                }
                .sys-page-wrap { transition: opacity var(--sys-dur-normal) var(--sys-ease-smooth), transform var(--sys-dur-normal) var(--sys-ease-apple), filter var(--sys-dur-normal); will-change: opacity, transform, filter; transform-origin: center center; }
                .sys-page-exit { opacity: 0; transform: scale(0.97) translateY(6px); filter: blur(6px) brightness(0.7); }
                .sys-page-enter { opacity: 0; transform: scale(1.03) translateY(-6px); filter: blur(3px) brightness(1.1); }
                .sys-page-active { opacity: 1; transform: scale(1) translateY(0); filter: blur(0) brightness(1); }
                .sys-fade-in { animation: sysFadeIn var(--sys-dur-normal) var(--sys-ease-spring) forwards; }
                .sys-slide-up { animation: sysSlideUp var(--sys-dur-emphasized) var(--sys-ease-apple) forwards; }
                .sys-slide-down { animation: sysSlideDown var(--sys-dur-emphasized) var(--sys-ease-apple) forwards; }
                .sys-scale-in { animation: sysScaleIn var(--sys-dur-emphasized) var(--sys-ease-spring-bounce) forwards; transform-origin: center; }
                .sys-rotate-in { animation: sysRotateIn var(--sys-dur-slow) var(--sys-ease-elastic) forwards; }
                .sys-blur-in { animation: sysBlurIn var(--sys-dur-slow) var(--sys-ease-smooth) forwards; }
                .sys-pulse-glow { animation: sysPulseGlow 2.4s ease-in-out infinite; }
                .sys-float { animation: sysFloat 4s ease-in-out infinite; will-change: transform; }
                .sys-breathe { animation: sysBreathe 3s ease-in-out infinite; will-change: transform; }
                .sys-shimmer-text { background: linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 100%); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: sysShimmerText 3s linear infinite; }
                @keyframes sysFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes sysSlideUp { from { transform: translate3d(0, 14px, 0); opacity: 0; } to { transform: translate3d(0, 0, 0); opacity: 1; } }
                @keyframes sysSlideDown { from { transform: translate3d(0, -14px, 0); opacity: 0; } to { transform: translate3d(0, 0, 0); opacity: 1; } }
                @keyframes sysScaleIn { from { transform: scale3d(0.94, 0.94, 1); opacity: 0; } to { transform: scale3d(1, 1, 1); opacity: 1; } }
                @keyframes sysRotateIn { from { transform: rotate(-12deg) scale(0.8); opacity: 0; } to { transform: rotate(0) scale(1); opacity: 1; } }
                @keyframes sysBlurIn { from { filter: blur(12px); opacity: 0; } to { filter: blur(0); opacity: 1; } }
                @keyframes sysPulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.0); } 50% { box-shadow: 0 0 32px 6px rgba(168,85,247,0.25); } }
                @keyframes sysFloat { 0%,100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -6px, 0); } }
                @keyframes sysBreathe { 0%,100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.035); opacity: 1; } }
                @keyframes sysShimmer { 0% { background-position: -1200px 0; } 100% { background-position: 1200px 0; } }
                @keyframes sysShimmerText { to { background-position: 200% center; } }
                @keyframes sysSpin { to { transform: rotate(360deg); } }
                @keyframes sysOrbit { from { transform: rotate(0deg) translateX(20px) rotate(0deg); } to { transform: rotate(360deg) translateX(20px) rotate(-360deg); } }
                @keyframes sysAuroraShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
                .sys-skeleton-bg { background: linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.02) 75%); background-size: 1200px 100%; animation: sysShimmer 1.6s infinite linear; }
                .sys-magnetic { transition: transform 380ms var(--sys-ease-apple), box-shadow 320ms var(--sys-ease-smooth); will-change: transform; transform-origin: center; }
                @media (hover: none) { .sys-magnetic { transform: none !important; } }
                .sys-progress { animation: sysProgress linear forwards; transform-origin: left; will-change: transform; }
                @keyframes sysProgress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
                .sys-ripple { position: absolute; border-radius: 50%; transform: scale(0); animation: sysRipple 800ms var(--sys-ease-inertia); background: radial-gradient(circle, rgba(255,255,255,0.5), rgba(255,255,255,0.12) 60%, transparent); pointer-events: none; will-change: transform, opacity; }
                @keyframes sysRipple { to { transform: scale(5); opacity: 0; } }
                .sys-no-scroll { scrollbar-width: thin; scrollbar-color: rgba(168,85,247,0.4) transparent; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
                .sys-no-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
                .sys-no-scroll::-webkit-scrollbar-track { background: transparent; }
                .sys-no-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(168,85,247,0.4), rgba(168,85,247,0.15)); border-radius: 6px; transition: background 200ms; }
                .sys-no-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(168,85,247,0.7), rgba(168,85,247,0.35)); }
                .sys-spotlight-cursor { position: fixed; top: 0; left: 0; width: 18px; height: 18px; border-radius: 50%; background: rgba(168,85,247,0.0); border: 1.5px solid rgba(255,255,255,0.85); pointer-events: none; mix-blend-mode: difference; transition: width 0.32s var(--sys-ease-apple), height 0.32s var(--sys-ease-apple), border-color 0.3s, border-radius 0.3s, background 0.3s; will-change: transform; z-index: 10004; backdrop-filter: invert(1); }
                .sys-spotlight-cursor.sys-cursor-text { width: 3px; height: 22px; border-radius: 1px; }
                .sys-spotlight-cursor.sys-cursor-pointer { width: 38px; height: 38px; background: rgba(168,85,247,0.18); border-color: rgba(168,85,247,0.6); }
                .sys-cursor-dot { position: fixed; top: 0; left: 0; width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.95); pointer-events: none; z-index: 10005; mix-blend-mode: difference; will-change: transform; }
                .sys-cursor-trail { position: fixed; pointer-events: none; z-index: 10003; width: 8px; height: 8px; border-radius: 50%; background: radial-gradient(circle, rgba(168,85,247,0.6), transparent); will-change: transform, opacity; }
                .sys-tooltip { position: fixed; padding: 6px 10px; background: rgba(8,8,10,0.96); backdrop-filter: blur(20px) saturate(180%); border: 0.5px solid rgba(168,85,247,0.3); border-radius: 7px; font-size: var(--sys-text-xs); color: rgba(255,255,255,0.96); pointer-events: none; white-space: nowrap; z-index: 10005; opacity: 0; transform: translateY(4px) scale(0.96); transition: opacity 200ms var(--sys-ease-apple), transform 280ms var(--sys-ease-spring-precise); box-shadow: var(--sys-shadow-md), 0 0 24px rgba(168,85,247,0.18); font-weight: 500; letter-spacing: 0.01em; will-change: transform, opacity; max-width: min(280px, 80vw); white-space: normal; }
                .sys-tooltip.sys-tooltip-show { opacity: 1; transform: translateY(0) scale(1); }
                .sys-focus-ring:focus-visible { outline: 2px solid rgba(168, 85, 247, 0.7); outline-offset: 3px; border-radius: 4px; transition: outline-offset 180ms var(--sys-ease-spring); }
                button, [role="button"] { position: relative; overflow: hidden; min-height: var(--sys-touch-target-sm); }
                @media (pointer: coarse) {
                    button, [role="button"], a, input, select, textarea { min-height: var(--sys-touch-target); }
                }
                .sys-particle { position: fixed; pointer-events: none; border-radius: 50%; will-change: transform, opacity; }
                .sys-aurora-text { background: var(--sys-gradient-aurora); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: sysShimmerText 4s linear infinite; }
                .sys-grid-bg { background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 32px 32px; }
                .sys-spinner { width: clamp(14px, 1.2vw, 16px); height: clamp(14px, 1.2vw, 16px); border: 1.5px solid rgba(255,255,255,0.12); border-top-color: var(--sys-accent-primary); border-right-color: rgba(168,85,247,0.4); border-radius: 50%; animation: sysSpin 0.65s linear infinite; will-change: transform; }
                .sys-button-press { transition: transform 140ms var(--sys-ease-spring-precise), filter 180ms, box-shadow 220ms; will-change: transform; position: relative; transform-origin: center; touch-action: manipulation; user-select: none; -webkit-tap-highlight-color: transparent; }
                .sys-button-press::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(120px circle at var(--sys-mx) var(--sys-my), rgba(255,255,255,0.12), transparent 50%); opacity: 0; transition: opacity 280ms; pointer-events: none; }
                @media (hover: hover) {
                    .sys-button-press:hover::before { opacity: 1; }
                    .sys-button-press:hover { transform: translateY(-1px); }
                }
                .sys-button-press:active { transform: scale(0.96); filter: brightness(0.94); transition: transform 80ms var(--sys-ease-accelerate); }
                .sys-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.025)); border: 0.5px solid rgba(255,255,255,0.14); border-bottom-width: 1.5px; border-radius: 5px; font-size: 10px; font-family: ui-monospace, 'SF Mono', monospace; color: rgba(255,255,255,0.78); letter-spacing: 0.04em; transition: transform 100ms var(--sys-ease-spring-precise), background 160ms; box-shadow: 0 1px 0 rgba(0,0,0,0.3), inset 0 0.5px 0 rgba(255,255,255,0.1); }
                .sys-kbd:active, .sys-kbd.sys-kbd-press { transform: translateY(1px); border-bottom-width: 0.5px; background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)); }
                .sys-divider-glow { height: 1px; background: linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent); }
                .sys-toast-enter { animation: sysToastIn 520ms var(--sys-ease-spring-bounce) forwards; }
                .sys-toast-exit { animation: sysToastOut 240ms var(--sys-ease-accelerate) forwards; }
                @keyframes sysToastIn { 0% { transform: translate3d(0, -32px, 0) scale(0.84); opacity: 0; filter: blur(4px); } 55% { transform: translate3d(0, 3px, 0) scale(1.02); opacity: 1; filter: blur(0); } 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; } }
                @keyframes sysToastOut { to { transform: translate3d(0, -16px, 0) scale(0.9); opacity: 0; filter: blur(3px); } }
                .sys-noise-overlay::before { content: ""; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='[w3.org](http://www.w3.org/2000/svg)'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); opacity: 0.035; pointer-events: none; mix-blend-mode: overlay; border-radius: inherit; }
                .sys-glow-border { position: relative; }
                .sys-glow-border::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; background: conic-gradient(from var(--sys-glow-angle, 0deg), transparent, rgba(168,85,247,0.6), rgba(236,72,153,0.6), rgba(6,182,212,0.6), transparent 60%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; animation: sysGlowRotate 6s linear infinite; }
                @property --sys-glow-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
                @keyframes sysGlowRotate { to { --sys-glow-angle: 360deg; } }
                .sys-shimmer-sweep { position: relative; overflow: hidden; }
                .sys-shimmer-sweep::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%); transform: translateX(-100%); pointer-events: none; }
                @media (hover: hover) {
                    .sys-shimmer-sweep:hover::after { animation: sysSweep 900ms var(--sys-ease-smooth); }
                }
                @keyframes sysSweep { to { transform: translateX(100%); } }
                .sys-tilt { transform-style: preserve-3d; transition: transform 380ms var(--sys-ease-apple); will-change: transform; }
                .sys-overlay-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0); backdrop-filter: blur(0); -webkit-backdrop-filter: blur(0); transition: background var(--sys-dur-normal) var(--sys-ease-standard), backdrop-filter var(--sys-dur-normal) var(--sys-ease-standard), -webkit-backdrop-filter var(--sys-dur-normal) var(--sys-ease-standard); pointer-events: none; will-change: backdrop-filter, background; }
                .sys-overlay-backdrop.sys-open { background: rgba(0,0,0,0.62); backdrop-filter: blur(var(--sys-blur-strength)) saturate(160%) brightness(0.85); -webkit-backdrop-filter: blur(var(--sys-blur-strength)) saturate(160%) brightness(0.85); pointer-events: auto; }
                .sys-drawer { position: fixed; background: rgba(10,10,12,0.88); backdrop-filter: blur(calc(var(--sys-blur-strength) * 1.5)) saturate(210%); border: 0.5px solid var(--sys-border-strong); box-shadow: var(--sys-shadow-2xl); transition: transform var(--sys-dur-emphasized) var(--sys-ease-apple); will-change: transform; }
                .sys-accordion-content { overflow: hidden; transition: grid-template-rows var(--sys-dur-emphasized) var(--sys-ease-apple); display: grid; grid-template-rows: 0fr; }
                .sys-accordion-content.sys-open { grid-template-rows: 1fr; }
                .sys-accordion-content > div { overflow: hidden; min-height: 0; }
                .sys-icon-spin { animation: sysSpin 0.7s linear infinite; }
                .sys-tab-indicator { position: absolute; bottom: 0; height: 2px; background: var(--sys-accent-primary); border-radius: 2px; box-shadow: 0 0 12px var(--sys-accent-primary); transition: transform var(--sys-dur-emphasized) var(--sys-ease-apple), width var(--sys-dur-emphasized) var(--sys-ease-apple); will-change: transform, width; }
                .sys-list-item-enter { animation: sysListItemIn 320ms var(--sys-ease-spring) backwards; }
                @keyframes sysListItemIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
                .sys-flip-card { transform-style: preserve-3d; transition: transform 600ms var(--sys-ease-spring); }
                .sys-flip-card.sys-flipped { transform: rotateY(180deg); }
                .sys-elevate { transition: transform 380ms var(--sys-ease-apple), box-shadow 420ms var(--sys-ease-smooth); will-change: transform, box-shadow; }
                @media (hover: hover) {
                    .sys-elevate:hover { transform: translateY(-4px) scale(1.008); box-shadow: var(--sys-shadow-xl); }
                }
                .sys-bloom { position: relative; }
                .sys-bloom::before { content: ""; position: absolute; inset: -20%; background: radial-gradient(circle at var(--sys-mx) var(--sys-my), rgba(168,85,247,0.32), transparent 60%); opacity: 0; transition: opacity 480ms var(--sys-ease-smooth); pointer-events: none; filter: blur(24px); z-index: -1; }
                @media (hover: hover) {
                    .sys-bloom:hover::before { opacity: 1; }
                }
                @keyframes sysGlowPulse { 0%,100% { box-shadow: 0 0 20px rgba(168,85,247,0.2), 0 0 40px rgba(168,85,247,0.1); } 50% { box-shadow: 0 0 30px rgba(168,85,247,0.4), 0 0 60px rgba(168,85,247,0.2); } }
                .sys-iridescent { background: linear-gradient(135deg, #a855f7, #ec4899, #06b6d4, #a855f7); background-size: 300% 300%; animation: sysAuroraShift 8s ease infinite; }
                .sys-input-field { position: relative; }
                .sys-input-field input, .sys-input-field textarea { caret-color: var(--sys-accent-primary); transition: border-color 240ms var(--sys-ease-apple), box-shadow 320ms var(--sys-ease-apple), background 240ms; font-size: max(16px, var(--sys-text-base)); }
                .sys-input-field input:focus, .sys-input-field textarea:focus { box-shadow: 0 0 0 3px rgba(168,85,247,0.18), inset 0 0 0 0.5px rgba(168,85,247,0.5); }
                .sys-input-field::after { content: ""; position: absolute; left: 50%; bottom: 0; width: 0; height: 1.5px; background: linear-gradient(90deg, transparent, var(--sys-accent-primary), transparent); transition: width 380ms var(--sys-ease-apple), left 380ms var(--sys-ease-apple); }
                .sys-input-field:focus-within::after { width: 100%; left: 0; }
                .sys-pressure-hint { transition: transform 200ms var(--sys-ease-spring-precise); }
                .sys-spotlight-overlay { mix-blend-mode: normal; }
                @keyframes sysCaretBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.3; } }
                .sys-focus-glow { position: absolute; pointer-events: none; border-radius: inherit; opacity: 0; transition: opacity 280ms; box-shadow: 0 0 0 2px rgba(168,85,247,0.4), 0 0 32px rgba(168,85,247,0.25); }
                .sys-focus-glow.sys-show { opacity: 1; }
                .sys-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
                .sys-container { width: 100%; max-width: var(--sys-content-max); margin-inline: auto; padding-inline: var(--sys-space-3); }
                @media (min-width: 1920px) {
                    .sys-container { max-width: min(1680px, 88vw); }
                }
                .sys-sheet-handle { width: 36px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.3); margin: 8px auto 4px; }
                @media (max-width: 480px) {
                    .sys-tooltip { display: none; }
                }
                .sys-holo {
                    background: linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.15), rgba(6,182,212,0.15));
                    background-size: 200% 200%;
                    animation: sysAuroraShift 6s ease infinite;
                    border: 1px solid rgba(255,255,255,0.1);
                    backdrop-filter: blur(20px) saturate(180%);
                    position: relative;
                    overflow: hidden;
                }
                .sys-holo::before {
                    content: ""; position: absolute; inset: 0;
                    background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
                    transform: translateX(-100%);
                    animation: sysHoloShine 4s ease infinite;
                }
                @keyframes sysHoloShine { 0%, 60% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .sys-neon-text { color: #fff; text-shadow: 0 0 5px rgba(168,85,247,0.8), 0 0 10px rgba(168,85,247,0.6), 0 0 20px rgba(168,85,247,0.4), 0 0 40px rgba(168,85,247,0.2); }
                .sys-pixel-corner { clip-path: polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px)); }
                .sys-scan-lines::before {
                    content: ""; position: absolute; inset: 0;
                    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px);
                    pointer-events: none; border-radius: inherit;
                }
                .sys-text-gradient-purple { background: linear-gradient(135deg, #a855f7, #ec4899); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
                .sys-text-gradient-cyan { background: linear-gradient(135deg, #06b6d4, #3b82f6); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
                .sys-text-gradient-fire { background: linear-gradient(135deg, #ef4444, #f59e0b); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
                .sys-text-3d { text-shadow: 0 1px 0 #ccc, 0 2px 0 #c9c9c9, 0 3px 0 #bbb, 0 4px 0 #b9b9b9, 0 5px 0 #aaa, 0 6px 1px rgba(0,0,0,.1), 0 0 5px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.3), 0 3px 5px rgba(0,0,0,.2), 0 5px 10px rgba(0,0,0,.25); }
                .sys-mask-fade-y { mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent); -webkit-mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent); }
                .sys-mask-fade-x { mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
                .sys-orbit-loader { position: relative; width: 48px; height: 48px; }
                .sys-orbit-loader::before, .sys-orbit-loader::after { content: ""; position: absolute; border-radius: 50%; }
                .sys-orbit-loader::before { inset: 0; border: 2px solid rgba(168,85,247,0.2); }
                .sys-orbit-loader::after { width: 8px; height: 8px; background: var(--sys-accent-primary); top: -4px; left: 50%; transform-origin: 4px 28px; animation: sysOrbitDot 1.2s linear infinite; box-shadow: 0 0 12px var(--sys-accent-primary); }
                @keyframes sysOrbitDot { to { transform: rotate(360deg); } }
                .sys-data-grid { background-image: linear-gradient(rgba(168,85,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.06) 1px, transparent 1px); background-size: 24px 24px; }
                .sys-blink-cursor::after { content: "▊"; color: var(--sys-accent-primary); animation: sysCaretBlink 1s infinite; margin-left: 2px; }
            `;
            document.head.appendChild(style);
            injected = true;
        };
        return { inject, palettes };
    })();

    const DOM = {
        mount: (id, zIndex, className) => {
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.style.zIndex = zIndex;
                el.className = className;
                document.body.appendChild(el);
            }
            return el;
        },
        create: (tag, attrs = {}, children = []) => {
            const el = document.createElement(tag);
            for (const k in attrs) {
                const v = attrs[k];
                if (v == null) continue;
                if (k === 'class') el.className = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
                else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
                else if (k === 'dataset') Object.assign(el.dataset, v);
                else if (k === 'text') el.textContent = v;
                else if (k === 'html') {
                    const tpl = document.createElement('template');
                    tpl.innerHTML = String(v);
                    tpl.content.querySelectorAll('script,iframe,object,embed').forEach(n => n.remove());
                    tpl.content.querySelectorAll('*').forEach(n => {
                        for (const a of Array.from(n.attributes)) {
                            if (/^on/i.test(a.name)) n.removeAttribute(a.name);
                            if ((a.name === 'href' || a.name === 'src') && !$isSafeURL(a.value)) n.removeAttribute(a.name);
                        }
                    });
                    el.appendChild(tpl.content);
                }
                else if (k === 'ref' && typeof v === 'function') v(el);
                else if (k === 'href' || k === 'src') el.setAttribute(k, $sanitizeURL(v));
                else el.setAttribute(k, v);
            }
            const arr = Array.isArray(children) ? children : [children];
            for (const c of arr) {
                if (c == null) continue;
                el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            }
            return el;
        },
        trapFocus: (container) => {
            const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            const handler = (e) => {
                if (e.key !== 'Tab') return;
                const focusable = container.querySelectorAll(sel);
                if (!focusable.length) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            };
            container.addEventListener('keydown', handler);
            const focusable = container.querySelectorAll(sel);
            if (focusable.length) setTimeout(() => { try { focusable[0].focus(); } catch {} }, 80);
            return () => container.removeEventListener('keydown', handler);
        },
        pushOverlay: (id, closeCb) => {
            if (!State.activeOverlays.length) {
                State.previousFocus = document.activeElement;
                const sbw = window.innerWidth - document.documentElement.clientWidth;
                document.body.style.overflow = 'hidden';
                if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
            }
            State.activeOverlays.push({ id, closeCb });
        },
        popOverlay: () => {
            const overlay = State.activeOverlays.pop();
            if (!State.activeOverlays.length) {
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
                if (State.previousFocus?.focus && document.contains(State.previousFocus)) {
                    try { State.previousFocus.focus(); } catch {}
                }
                State.previousFocus = null;
            }
            return overlay;
        },
        addRipple: (e, el) => {
            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height) * 1.4;
            const ripple = document.createElement('span');
            ripple.className = 'sys-ripple';
            const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
            const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
            ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 800);
        }
    };

    rootOwner.listen(document, 'keydown', (e) => {
        if (e.key === 'Escape' && State.activeOverlays.length > 0) {
            e.preventDefault();
            const top = DOM.popOverlay();
            if (top?.closeCb) try { top.closeCb(); } catch {}
        }
    });

    rootOwner.listen(document, 'pointermove', $rafThrottle((e) => {
        if ($isTouch) return;
        const t = e.target?.closest?.('.sys-glass, .sys-glass-strong, .sys-button-press, .sys-bloom');
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty('--sys-mx', ((e.clientX - r.left) / r.width * 100) + '%');
        t.style.setProperty('--sys-my', ((e.clientY - r.top) / r.height * 100) + '%');
    }), { passive: true });

    const Magnetic = (() => {
        let raf = null;
        let observed = new WeakSet();
        let registry = new Set();
        const move = (e) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                const { speed } = $velocity.get();
                const velocityBoost = Math.min(1.4, 1 + speed * 0.08);
                for (const el of registry) {
                    if (!el.isConnected) { registry.delete(el); continue; }
                    const r = el.getBoundingClientRect();
                    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
                        if (el.style.transform) el.style.transform = '';
                        continue;
                    }
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    const dx = e.clientX - cx, dy = e.clientY - cy;
                    const dist = Math.hypot(dx, dy);
                    const range = Math.max(r.width, r.height) / 2 + 100;
                    if (dist < range) {
                        const t = 1 - dist / range;
                        const strength = (t * t * (3 - 2 * t)) * 0.34 * velocityBoost;
                        const rx = (dy / range) * -7 * strength;
                        const ry = (dx / range) * 7 * strength;
                        el.style.transform = `perspective(900px) translate3d(${dx * strength}px, ${dy * strength}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale(${1 + 0.06 * strength * 3})`;
                    } else if (el.style.transform) {
                        el.style.transform = '';
                    }
                }
                raf = null;
            });
        };
        const scan = $debounce(() => {
            document.querySelectorAll('.sys-magnetic').forEach(el => {
                if (!observed.has(el)) { observed.add(el); registry.add(el); }
            });
            for (const el of registry) if (!el.isConnected) registry.delete(el);
        }, 220);
        const init = () => {
            if ($reducedMotion || $isTouch || $isLowEnd || !$hasHover) return;
            rootOwner.listen(document, 'mousemove', move, { passive: true });
            rootOwner.listen(window, 'resize', scan, { passive: true });
            const mo = new MutationObserver(scan);
            mo.observe(document.body, { childList: true, subtree: true });
            rootOwner.add(() => mo.disconnect());
            scan();
        };
        return { init, refresh: scan };
    })();

    const Cursor = (() => {
        let cursor, dot, active = false, raf = null, tx = 0, ty = 0, x = 0, y = 0, dx = 0, dy = 0;
        let owner = null;
        const trails = [];
        const MAX_TRAILS = $perfTier === 'high' ? 8 : 0;
        const loop = () => {
            x = $lerp(x, tx, 0.28); y = $lerp(y, ty, 0.28);
            dx = $lerp(dx, tx, 0.6); dy = $lerp(dy, ty, 0.6);
            if (cursor) cursor.style.transform = `translate3d(${x - 9}px, ${y - 9}px, 0)`;
            if (dot) dot.style.transform = `translate3d(${dx - 2}px, ${dy - 2}px, 0)`;
            for (let i = 0; i < trails.length; i++) {
                const trail = trails[i];
                const next = i === trails.length - 1 ? { x: dx, y: dy } : trails[i + 1];
                trail.x = $lerp(trail.x, next.x, 0.4);
                trail.y = $lerp(trail.y, next.y, 0.4);
                if (trail.el) {
                    trail.el.style.transform = `translate3d(${trail.x - 4}px, ${trail.y - 4}px, 0)`;
                    trail.el.style.opacity = (1 - i / trails.length) * 0.5;
                }
            }
            raf = requestAnimationFrame(loop);
        };
        const move = (e) => { tx = e.clientX; ty = e.clientY; };
        const detectTarget = (e) => {
            const t = e.target;
            if (!cursor) return;
            cursor.classList.remove('sys-cursor-pointer', 'sys-cursor-text');
            if (t.matches?.('input, textarea, [contenteditable]')) cursor.classList.add('sys-cursor-text');
            else if (t.closest?.('button, a, [role="button"], .sys-magnetic')) cursor.classList.add('sys-cursor-pointer');
        };
        const enable = () => {
            if (active || $isTouch) return; active = true;
            owner = Lifecycle.createOwner();
            cursor = DOM.mount('sys-cursor', Layers.cursor, 'sys-spotlight-cursor');
            dot = DOM.mount('sys-cursor-dot', Layers.cursor + 1, 'sys-cursor-dot');
            for (let i = 0; i < MAX_TRAILS; i++) {
                const t = DOM.create('div', { class: 'sys-cursor-trail' });
                document.body.appendChild(t);
                trails.push({ el: t, x: 0, y: 0 });
                owner.add(() => t.remove());
            }
            document.documentElement.style.cursor = 'none';
            owner.listen(document, 'mousemove', move, { passive: true });
            owner.listen(document, 'mouseover', detectTarget, { passive: true });
            loop();
        };
        const disable = () => {
            active = false;
            if (raf) { cancelAnimationFrame(raf); raf = null; }
            cursor?.remove(); dot?.remove();
            cursor = dot = null;
            trails.length = 0;
            document.documentElement.style.cursor = '';
            owner?.dispose(); owner = null;
        };
        return { enable, disable, toggle: () => active ? disable() : enable() };
    })();

    const Actions = (() => {
        const registry = new Map();
        const groups = new Map();
        return {
            register: (id, def) => {
                registry.set(id, { id, ...def });
                if (def.group) {
                    if (!groups.has(def.group)) groups.set(def.group, new Set());
                    groups.get(def.group).add(id);
                }
                Bus.emit('action:registered', { id, ...def });
            },
            registerBatch: (actions) => actions.forEach(a => Actions.register(a.id, a)),
            unregister: (id) => { const a = registry.get(id); if (a?.group) groups.get(a.group)?.delete(id); registry.delete(id); },
            execute: async (id, payload = null) => {
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
                const results = [];
                for (const a of registry.values()) {
                    const title = (a.title || '').toLowerCase();
                    const desc = (a.description || '').toLowerCase();
                    const keys = (a.keywords || []).join(' ').toLowerCase();
                    let score = 0;
                    if (title === q) score += 200;
                    if (title.startsWith(q)) score += 100;
                    if (title.includes(q)) score += 50;
                    if (keys.includes(q)) score += 30;
                    if (desc.includes(q)) score += 15;
                    const histIdx = State.cmdState.history.indexOf(a.id);
                    if (histIdx > -1) score += 40 - histIdx * 2;
                    if (State.cmdState.favorites.has(a.id)) score += 60;
                    let qi = 0, lastMatch = -1, bonus = 0;
                    for (let i = 0; i < title.length; i++) {
                        if (title[i] === q[qi]) {
                            if (lastMatch === i - 1) bonus += 3;
                            lastMatch = i;
                            qi++;
                            if (qi === q.length) break;
                        }
                    }
                    if (qi === q.length) score += 10 + bonus;
                    if (score > 0) results.push({ ...a, _score: score });
                }
                return results.sort((a, b) => b._score - a._score);
            }
        };
    })();

    const Page = (() => {
        const transition = (cb) => {
            Theme.inject();
            let wrapper = document.getElementById('sys-app-wrapper');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.id = 'sys-app-wrapper';
                wrapper.className = 'sys-page-wrap sys-page-active w-full min-h-screen';
                while (document.body.firstChild) {
                    const c = document.body.firstChild;
                    if (c.id?.startsWith('sys-')) break;
                    wrapper.appendChild(c);
                }
                document.body.insertBefore(wrapper, document.body.firstChild);
            }
            const useVT = $supportsVT && !$reducedMotion;
            if (useVT) {
                Audio.play('swoosh');
                document.startViewTransition(() => {
                    if (cb) cb();
                    window.scrollTo({ top: 0, behavior: 'instant' });
                });
                return;
            }
            wrapper.classList.remove('sys-page-active', 'sys-page-enter');
            wrapper.classList.add('sys-page-exit');
            Audio.play('whoosh');
            setTimeout(() => {
                if (cb) cb();
                window.scrollTo({ top: 0, behavior: 'instant' });
                wrapper.classList.remove('sys-page-exit');
                wrapper.classList.add('sys-page-enter');
                requestAnimationFrame(() => {
                    wrapper.classList.remove('sys-page-enter');
                    wrapper.classList.add('sys-page-active');
                });
            }, 260);
        };
        return { transition };
    })();

    const SmartLoader = {
        execute: async (promiseOrFn, containerId, opts = {}) => {
            const { skeletonType = 'card', count = 3, restore = true } = opts;
            const container = document.getElementById(containerId);
            const run = typeof promiseOrFn === 'function' ? promiseOrFn : () => promiseOrFn;
            if (!container) return await run();
            const originalHTML = container.innerHTML;
            let resolved = false;
            const timers = [];
            timers.push(setTimeout(() => { if (!resolved) { container.innerHTML = UIHelpers.generateSkeleton(skeletonType, count); container.querySelectorAll('[data-stagger]').forEach((el, i) => { el.style.animationDelay = (i * 60) + 'ms'; }); } }, 320));
            timers.push(setTimeout(() => {
                if (!resolved) container.innerHTML = `<div class="flex flex-col items-center justify-center p-10 text-center sys-fade-in"><div class="sys-orbit-loader mb-5"></div><p class="text-sm text-gray-300 font-medium sys-shimmer-text">جاري معالجة البيانات</p></div>`;
            }, 2100));
            timers.push(setTimeout(() => {
                if (!resolved) container.innerHTML = `<div class="flex flex-col items-center justify-center p-10 text-center sys-fade-in"><svg class="w-12 h-12 text-yellow-500 mb-4 sys-breathe" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg><p class="text-sm text-yellow-300 font-medium">الاتصال بطيء، جاري المحاولة...</p></div>`;
            }, 5500));
            try {
                const result = await run();
                resolved = true;
                timers.forEach(clearTimeout);
                if (restore) container.innerHTML = originalHTML;
                return result;
            } catch (err) {
                resolved = true;
                timers.forEach(clearTimeout);
                const errId = $uid();
                container.innerHTML = `<div class="flex flex-col items-center justify-center p-10 text-center sys-fade-in"><div class="w-14 h-14 mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center"><svg class="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p class="text-sm text-red-300 font-medium mb-5">حدث خطأ أثناء جلب البيانات</p><button id="${errId}" class="sys-magnetic sys-button-press px-5 py-2.5 bg-gradient-to-br from-white/15 to-white/5 border border-white/15 hover:border-white/30 rounded-lg text-sm text-white font-medium transition-all shadow-lg">إعادة المحاولة</button></div>`;
                document.getElementById(errId)?.addEventListener('click', () => location.reload(), { once: true });
                throw err;
            }
        }
    };

    const Spotlight = (() => {
        const show = (targetId, message, opts = {}) => {
            const { placement = 'bottom', persist = true, dismissLabel = 'حسناً، فهمت' } = opts;
            const target = document.getElementById(targetId);
            if (!target) return;
            if (persist && localStorage.getItem(`sysui_spotlight_${targetId}`)) return;
            Theme.inject();
            Audio.play('magic');
            const overlay = DOM.mount('sys-spotlight-overlay', Layers.spotlight, 'fixed inset-0 pointer-events-none opacity-0 transition-opacity duration-500 sys-spotlight-overlay');
            const owner = Lifecycle.createOwner();
            const update = () => {
                const rect = target.getBoundingClientRect();
                overlay.innerHTML = '';
                const hole = DOM.create('div', { class: 'absolute rounded-2xl pointer-events-auto transition-all duration-700 sys-breathe', style: { top: (rect.top - 10) + 'px', left: (rect.left - 10) + 'px', width: (rect.width + 20) + 'px', height: (rect.height + 20) + 'px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.82), inset 0 0 30px rgba(168,85,247,0.35), 0 0 40px rgba(168,85,247,0.4)' } });
                const tipTop = placement === 'bottom' ? rect.bottom + 24 : rect.top - 90;
                const tooltip = DOM.create('div', { class: 'absolute flex flex-col items-center pointer-events-auto sys-scale-in', style: { top: tipTop + 'px', left: (rect.left + rect.width / 2) + 'px', transform: 'translateX(-50%)', maxWidth: '90vw' } });
                const bubble = DOM.create('div', { class: 'sys-glass-glow text-white px-5 py-3 rounded-xl text-sm font-medium shadow-2xl mb-3 text-center', text: message });
                const btn = DOM.create('button', { class: 'sys-magnetic text-xs text-white/70 hover:text-white transition-colors px-4 py-1.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md', text: dismissLabel });
                tooltip.append(bubble, btn);
                overlay.append(hole, tooltip);
                btn.addEventListener('click', close, { once: true });
            };
            requestAnimationFrame(() => overlay.classList.remove('opacity-0'));
            const origZ = target.style.zIndex, origPos = target.style.position;
            target.style.position = 'relative';
            target.style.zIndex = Layers.spotlight + 1;
            update();
            const onResize = $debounce(update, 100);
            owner.listen(window, 'resize', onResize);
            owner.listen(window, 'scroll', onResize, true);
            const close = () => {
                overlay.classList.add('opacity-0');
                owner.dispose();
                setTimeout(() => {
                    overlay.remove();
                    target.style.zIndex = origZ;
                    target.style.position = origPos;
                }, 500);
                if (persist) $safeSet(`sysui_spotlight_${targetId}`, '1');
            };
        };
        const reset = (targetId) => { try { targetId ? localStorage.removeItem(`sysui_spotlight_${targetId}`) : Object.keys(localStorage).filter(k => k.startsWith('sysui_spotlight_')).forEach(k => localStorage.removeItem(k)); } catch {} };
        return { show, reset };
    })();

    const PerfHUD = (() => {
        let active = false, frames = 0, lastTime = performance.now(), fps = 0, fpsHistory = [], rafId = null;
        const toggle = () => {
            active = !active;
            const el = DOM.mount('sys-hud', Layers.hud, 'fixed bottom-4 left-4 sys-glass-strong rounded-xl text-[10px] font-mono text-green-400 pointer-events-auto transition-all flex flex-col gap-1.5 opacity-0 select-none sys-noise-overlay');
            el.style.padding = 'clamp(10px, 1.4vw, 14px)';
            el.style.width = 'min(260px, 70vw)';
            el.style.bottom = 'calc(1rem + var(--sys-safe-bottom))';
            el.style.left = 'calc(1rem + var(--sys-safe-left))';
            if (!active) {
                Motion.exit.scale(el).then(() => el.remove());
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                return;
            }
            el.style.opacity = '1';
            Motion.enter.pop(el);
            const loop = (t) => {
                if (!active) return;
                frames++;
                if (t - lastTime >= 1000) {
                    fps = frames; frames = 0; lastTime = t;
                    fpsHistory.push(fps); if (fpsHistory.length > 40) fpsHistory.shift();
                    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB' : 'N/A';
                    const memMax = performance.memory ? (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + 'MB' : '';
                    const avgFps = Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
                    const minFps = Math.min(...fpsHistory);
                    const bars = fpsHistory.map(f => `<div style="height:${Math.min(24, f / 2.6)}px;width:3px;background:${f < 30 ? '#ef4444' : f < 50 ? '#eab308' : '#22c55e'};border-radius:1px;opacity:0.8;transition:height 200ms cubic-bezier(0.16,1,0.3,1)"></div>`).join('');
                    const fpsColor = fps < 30 ? 'text-red-400' : fps < 50 ? 'text-yellow-400' : 'text-green-400';
                    const vp = Viewport.get();
                    el.innerHTML = `
                        <div class="flex justify-between items-center"><span class="text-gray-500">⚡ FPS</span><span class="${fpsColor} font-bold">${fps} <span class="text-gray-500 text-[8px]">avg ${avgFps} · min ${minFps}</span></span></div>
                        <div class="flex items-end gap-[1px] h-6 bg-black/40 p-1 rounded">${bars}</div>
                        <div class="flex justify-between"><span class="text-gray-500">🧠 MEM</span><span class="text-blue-400">${mem} <span class="text-gray-600 text-[8px]">/ ${memMax}</span></span></div>
                        <div class="flex justify-between"><span class="text-gray-500">🌐 DOM</span><span class="text-yellow-400">${document.getElementsByTagName('*').length}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">📐 VP</span><span class="text-cyan-400">${vp.w}×${vp.h} ${vp.breakpoint}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">🪟 OVR</span><span class="text-purple-400">${State.activeOverlays.length}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">📢 TST</span><span class="text-cyan-400">${State.toasts.size}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">🎯 ACT</span><span class="text-pink-400">${Actions.getAll().length}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">⚙️ TIER</span><span class="text-orange-400">${$perfTier} · ${$cores}c · ${$memory}gb</span></div>
                        <div class="sys-divider-glow my-1"></div>
                        <div class="text-[8px] text-gray-500 text-center tracking-[0.3em] sys-shimmer-text">SYS_UI · v9.0 · ONLINE</div>
                    `;
                }
                rafId = requestAnimationFrame(loop);
            };
            rafId = requestAnimationFrame(loop);
        };
        return { toggle };
    })();

    const Toasts = (() => {
        const icons = {
            success: `<svg class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`,
            error: `<svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>`,
            loading: `<div class="sys-spinner"></div>`,
            info: `<svg class="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
            warn: `<svg class="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
        };
        const colors = { success: 'bg-green-500/40', error: 'bg-red-500/40', loading: 'bg-purple-500/40', info: 'bg-blue-500/40', warn: 'bg-yellow-500/40' };
        const borders = { success: 'border-green-500/30', error: 'border-red-500/30', loading: 'border-purple-500/30', info: 'border-blue-500/30', warn: 'border-yellow-500/30' };
        const sounds = { success: 'success', error: 'error', loading: 'tap', info: 'pop', warn: 'warn' };
        const haptics = { success: 'success', error: 'error', loading: 'light', info: 'light', warn: 'warn' };

        const renderContent = (type, message, duration) => {
            const wrap = DOM.create('div', { class: 'flex items-center gap-3 z-10 font-medium tracking-wide flex-1 min-w-0' });
            const iconWrap = DOM.create('div', { class: 'shrink-0' });
            iconWrap.innerHTML = icons[type] || icons.info;
            wrap.appendChild(iconWrap);
            wrap.appendChild(DOM.create('span', { class: 'flex-1 break-words', text: String(message) }));
            const bar = duration !== Infinity ? DOM.create('div', { class: `absolute bottom-0 left-0 right-0 h-[2px] origin-left ${colors[type] || colors.info} sys-progress`, style: { animationDuration: duration + 'ms' } }) : null;
            return { wrap, bar };
        };

        const reflow = () => {
            const container = document.getElementById('sys-toasts');
            if (!container) return;
            const items = Array.from(container.children);
            items.forEach((el, i) => {
                const offset = i * 5;
                const scale = 1 - i * 0.045;
                const opacity = 1 - i * 0.2;
                el.style.transition = 'transform 460ms cubic-bezier(0.32,0.72,0,1), opacity 460ms cubic-bezier(0.32,0.72,0,1)';
                el.style.transform = `translate3d(0, ${-offset}px, 0) scale(${Math.max(scale, 0.84)})`;
                el.style.opacity = Math.max(opacity, 0.45);
                el.style.zIndex = 100 - i;
            });
        };

        const create = (type, message, duration = 4000, opts = {}) => {
            Theme.inject();
            Audio.play(opts.sound || sounds[type] || 'pop');
            Haptics[haptics[type] || 'light']?.();
            const container = DOM.mount('sys-toasts', Layers.toast, 'fixed left-1/2 -translate-x-1/2 flex flex-col items-stretch gap-2 pointer-events-none w-full px-3');
            container.style.top = 'calc(1rem + var(--sys-safe-top))';
            container.style.maxWidth = 'min(28rem, calc(100vw - 1.5rem))';
            const id = opts.id || $uid();
            const borderCls = borders[type] || borders.info;
            const el = DOM.create('div', { class: `sys-glass flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-gray-100 shadow-2xl relative overflow-hidden pointer-events-auto sys-toast-enter border ${borderCls} sys-noise-overlay w-full`, role: 'status', 'aria-live': type === 'error' ? 'assertive' : 'polite', 'aria-atomic': 'true' });
            const owner = Lifecycle.createOwner();
            Lifecycle.attach(el, owner);
            const { wrap, bar } = renderContent(type, message, duration);
            el.appendChild(wrap);
            if (bar) el.appendChild(bar);
            if (opts.action) {
                const actionBtn = DOM.create('button', { class: 'sys-button-press text-xs text-white/90 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 ml-2 z-10 font-medium transition-all shrink-0', text: opts.action.label });
                actionBtn.addEventListener('click', () => { try { opts.action.handler?.(); } catch {} remove(id); }, { once: true });
                el.appendChild(actionBtn);
            }
            container.prepend(el);
            requestAnimationFrame(reflow);
            const data = { id, el, timeout: null, type, owner };
            State.toasts.set(id, data);
            if (duration !== Infinity) data.timeout = setTimeout(() => remove(id), duration);
            if (State.toasts.size > 5) remove(State.toasts.keys().next().value);
            let startX = 0, currentX = 0, dragging = false, startT = 0;
            owner.listen(el, 'pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; startX = e.clientX; startT = performance.now(); dragging = true; el.style.transition = 'none'; try { el.setPointerCapture(e.pointerId); } catch {} });
            owner.listen(el, 'pointermove', (e) => { if (!dragging) return; currentX = e.clientX - startX; el.style.transform = `translate3d(${currentX}px, 0, 0) rotate(${currentX * 0.025}deg)`; el.style.opacity = Math.max(0, 1 - Math.abs(currentX) / 220); });
            owner.listen(el, 'pointerup', () => {
                if (!dragging) return; dragging = false;
                const dt = performance.now() - startT;
                const vel = currentX / Math.max(1, dt);
                if (Math.abs(currentX) > 90 || Math.abs(vel) > 0.5) {
                    el.style.transition = 'transform 280ms cubic-bezier(0.05,0.7,0.1,1), opacity 240ms';
                    el.style.transform = `translate3d(${currentX > 0 ? 500 : -500}px, 0, 0) rotate(${currentX > 0 ? 15 : -15}deg)`;
                    el.style.opacity = '0';
                    setTimeout(() => remove(id), 240);
                } else {
                    Motion.spring(el, { transform: [`translate3d(${currentX}px, 0, 0)`, 'translate3d(0, 0, 0)'], opacity: [parseFloat(el.style.opacity) || 1, 1] }, 'bouncy');
                }
                currentX = 0;
            });
            owner.listen(el, 'click', (e) => { if (e.target.tagName !== 'BUTTON' && !dragging && Math.abs(currentX) < 5) remove(id); });
            owner.listen(el, 'mouseenter', () => { if (data.timeout) { clearTimeout(data.timeout); data.timeout = null; bar?.style.setProperty('animation-play-state', 'paused'); } });
            owner.listen(el, 'mouseleave', () => { if (duration !== Infinity && !data.timeout) { data.timeout = setTimeout(() => remove(id), 1500); bar?.style.setProperty('animation-play-state', 'running'); } });
            return id;
        };

        const update = (id, type, message, duration = 4000) => {
            const t = State.toasts.get(id);
            if (!t) return create(type, message, duration);
            Audio.play(sounds[type] || 'pop');
            if (t.timeout) { clearTimeout(t.timeout); t.timeout = null; }
            Motion.animate(t.el, [{ filter: 'blur(0)' }, { filter: 'blur(4px)' }], { duration: 120, easing: 'ease-out' }).then(() => {
                t.el.innerHTML = '';
                t.el.className = t.el.className.replace(/border-\w+-500\/30/g, '') + ' ' + (borders[type] || borders.info);
                const { wrap, bar } = renderContent(type, message, duration);
                t.el.appendChild(wrap);
                if (bar) t.el.appendChild(bar);
                Motion.animate(t.el, [{ filter: 'blur(4px)', transform: 'scale(0.96)' }, { filter: 'blur(0)', transform: 'scale(1)' }], { duration: 320, easing: Motion.tokens.ease.springBounce });
            });
            if (duration !== Infinity) t.timeout = setTimeout(() => remove(id), duration);
            return id;
        };

        const remove = (id) => {
            const t = State.toasts.get(id);
            if (!t) return;
            if (t.timeout) { clearTimeout(t.timeout); t.timeout = null; }
            t.el.classList.remove('sys-toast-enter');
            t.el.classList.add('sys-toast-exit');
            setTimeout(() => {
                t.owner?.dispose();
                t.el.remove();
                State.toasts.delete(id);
                reflow();
            }, 280);
        };

        const clear = () => { Array.from(State.toasts.keys()).forEach(remove); };

        const promise = async (fn, opts) => {
            const { loading = 'جاري المعالجة...', success = 'تم بنجاح', error = 'حدث خطأ' } = opts || {};
            const id = create('loading', loading, Infinity);
            try {
                const result = await (typeof fn === 'function' ? fn() : fn);
                update(id, 'success', typeof success === 'function' ? success(result) : success, 3000);
                return result;
            } catch (e) {
                update(id, 'error', typeof error === 'function' ? error(e) : error, 4000);
                throw e;
            }
        };
        return { create, update, remove, clear, promise };
    })();

    const Modals = (() => {
        const getBackdrop = () => DOM.mount('sys-backdrop', Layers.backdrop, 'sys-overlay-backdrop');
        const toggleBackdrop = (show) => {
            const bd = getBackdrop();
            if (show) requestAnimationFrame(() => bd.classList.add('sys-open'));
            else bd.classList.remove('sys-open');
        };

        const open = (config) => {
            const { title, description = '', inputId = null, placeholder = '', confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', onConfirm, onCancel, type = 'default', validator = null, icon = null } = config;
            Theme.inject();
            toggleBackdrop(true);
            Audio.play('open');
            Haptics.medium();
            const vp = Viewport.get();
            const isSheet = vp.isMobile;
            const container = DOM.mount('sys-modal-root', Layers.modal, `fixed inset-0 hidden ${isSheet ? 'items-end' : 'items-center'} justify-center pointer-events-none`);
            container.style.padding = isSheet ? '0' : 'clamp(0.75rem, 2vw, 1.5rem)';
            container.style.paddingBottom = isSheet ? 'var(--sys-safe-bottom)' : 'clamp(0.75rem, 2vw, 1.5rem)';
            const owner = Lifecycle.createOwner();
            const titleId = 'sys-modal-title-' + $uid();
            const descId = description ? 'sys-modal-desc-' + $uid() : null;
            const boxCls = isSheet
                ? 'relative sys-glass-strong w-full pointer-events-auto sys-noise-overlay'
                : 'relative sys-glass-strong w-full pointer-events-auto sys-noise-overlay';
            const box = DOM.create('div', { class: boxCls, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, ...(descId ? { 'aria-describedby': descId } : {}), tabindex: '-1', style: { transformOrigin: isSheet ? 'bottom' : 'center', padding: 'clamp(1.25rem, 2.5vw, 1.75rem)', borderRadius: isSheet ? '24px 24px 0 0' : 'var(--sys-radius-xl)', maxWidth: isSheet ? '100%' : 'min(28rem, calc(100vw - 2rem))', maxHeight: '88dvh', overflowY: 'auto' } });
            box.classList.add('sys-no-scroll');
            Lifecycle.attach(box, owner);
            if (isSheet) {
                const handle = DOM.create('div', { class: 'sys-sheet-handle', 'aria-hidden': 'true' });
                box.appendChild(handle);
            }
            if (icon || type === 'danger') {
                const iconBox = DOM.create('div', { class: `w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${type === 'danger' ? 'bg-red-500/15 border border-red-500/30' : 'bg-purple-500/15 border border-purple-500/30'} sys-breathe`, 'aria-hidden': 'true' });
                iconBox.innerHTML = icon || `<svg class="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
                box.appendChild(iconBox);
            }
            const titleEl = DOM.create('h3', { id: titleId, class: 'text-white font-semibold mb-2 tracking-tight', style: { fontSize: 'var(--sys-text-lg)' }, text: title });
            box.appendChild(titleEl);
            if (description) box.appendChild(DOM.create('p', { id: descId, class: 'text-gray-400 mb-5 leading-relaxed', style: { fontSize: 'var(--sys-text-sm)' }, text: description }));
            else box.appendChild(DOM.create('div', { class: 'mb-5' }));
            let input = null, errorEl = null;
            if (inputId) {
                const inputWrap = DOM.create('div', { class: 'sys-input-field mb-2' });
                const errId = 'sys-modal-err-' + $uid();
                input = DOM.create('input', { type: 'text', id: inputId, class: 'w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500/60 transition-all placeholder-gray-600', placeholder, autocomplete: 'off', 'aria-describedby': errId, 'aria-invalid': 'false' });
                inputWrap.appendChild(input);
                box.appendChild(inputWrap);
                errorEl = DOM.create('p', { id: errId, class: 'text-xs text-red-400 mb-4 min-h-[16px]', role: 'alert' });
                box.appendChild(errorEl);
                if (State.sessionDrafts[inputId]) input.value = State.sessionDrafts[inputId];
                owner.listen(input, 'input', (e) => { State.sessionDrafts[inputId] = e.target.value; $safeSet('sysui_drafts', State.sessionDrafts); if (errorEl) { errorEl.textContent = ''; input.setAttribute('aria-invalid', 'false'); } });
                owner.listen(input, 'focus', () => Audio.play('focus'));
            }
            const btnRow = DOM.create('div', { class: `flex ${isSheet ? 'flex-col-reverse' : 'justify-end'} gap-3 mt-2` });
            const cancelBtn = DOM.create('button', { class: `sys-magnetic sys-button-press ${isSheet ? 'w-full' : ''} px-5 py-3 rounded-xl font-medium text-gray-300 hover:bg-white/5 border border-white/10 transition-all outline-none focus:ring-2 focus:ring-white/20`, style: { fontSize: 'var(--sys-text-sm)' }, text: cancelLabel });
            const confirmClass = type === 'danger' ? 'bg-gradient-to-br from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-gradient-to-br from-white to-gray-200 text-black hover:from-gray-100 hover:to-white shadow-[0_0_20px_rgba(255,255,255,0.3)]';
            const confirmBtn = DOM.create('button', { class: `sys-magnetic sys-button-press ${isSheet ? 'w-full' : ''} px-5 py-3 rounded-xl font-semibold ${confirmClass} transition-all outline-none focus:ring-2 focus:ring-white/40`, style: { fontSize: 'var(--sys-text-sm)' }, text: confirmLabel });
            btnRow.append(cancelBtn, confirmBtn);
            box.appendChild(btnRow);
            container.innerHTML = '';
            container.appendChild(box);
            container.classList.remove('hidden');
            container.classList.add('flex');
            if (isSheet) {
                Motion.spring(box, { transform: ['translateY(100%)', 'translateY(0)'], opacity: [0.5, 1] }, 'ios');
            } else {
                Motion.spring(box, { transform: ['scale(0.86) translateY(24px)', 'scale(1) translateY(0)'], opacity: [0, 1] }, 'ios');
            }
            const children = Array.from(box.children);
            Motion.stagger(children, (el) => { Motion.enter.slideUp(el); }, 28);
            const releaseFocus = DOM.trapFocus(box);
            owner.add(releaseFocus);
            const close = (res) => {
                if (inputId && res != null) { delete State.sessionDrafts[inputId]; $safeSet('sysui_drafts', State.sessionDrafts); }
                Audio.play('close');
                if (isSheet) {
                    Motion.animate(box, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 280, easing: Motion.tokens.ease.accelerate });
                } else {
                    Motion.animate(box, [{ transform: 'scale(1) translateY(0)', opacity: 1, filter: 'blur(0)' }, { transform: 'scale(0.94) translateY(8px)', opacity: 0, filter: 'blur(4px)' }], { duration: 220, easing: Motion.tokens.ease.accelerate });
                }
                toggleBackdrop(false);
                owner.dispose();
                setTimeout(() => {
                    container.classList.add('hidden');
                    container.classList.remove('flex');
                    container.innerHTML = '';
                    try {
                        if (res !== null && res !== undefined) onConfirm?.(res);
                        else onCancel?.();
                    } catch (e) { console.error('[Modal:cb]', e); }
                }, 300);
            };
            DOM.pushOverlay('modal', () => close(null));
            owner.listen(cancelBtn, 'click', () => { DOM.popOverlay(); close(null); });
            owner.listen(confirmBtn, 'click', () => {
                const value = inputId ? input.value : true;
                if (validator && inputId) {
                    let err;
                    try { err = validator(value); } catch (e) { err = 'خطأ في التحقق'; }
                    if (err) { if (errorEl) { errorEl.textContent = err; input.setAttribute('aria-invalid', 'true'); } Audio.play('error'); Haptics.error(); input.focus(); Motion.shake(box); return; }
                }
                DOM.popOverlay();
                close(value);
            });
            if (inputId) owner.listen(input, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); } });
            if (isSheet) {
                let startY = 0, currentY = 0, dragging = false;
                owner.listen(box, 'pointerdown', (e) => {
                    if (e.target.closest('button, input, textarea')) return;
                    startY = e.clientY; dragging = true;
                    box.style.transition = 'none';
                });
                owner.listen(box, 'pointermove', (e) => {
                    if (!dragging) return;
                    currentY = Math.max(0, e.clientY - startY);
                    box.style.transform = `translateY(${currentY}px)`;
                });
                owner.listen(box, 'pointerup', () => {
                    if (!dragging) return; dragging = false;
                    if (currentY > 100) { DOM.popOverlay(); close(null); }
                    else { Motion.spring(box, { transform: [`translateY(${currentY}px)`, 'translateY(0)'] }, 'bouncy'); }
                    currentY = 0;
                });
            }
        };

        return {
            confirm: (title, descOrCb, maybeCb) => {
                let description = '', cb;
                if (typeof descOrCb === 'function') cb = descOrCb;
                else { description = descOrCb || ''; cb = maybeCb; }
                const handler = typeof cb === 'function' ? cb : () => {};
                open({ title, description, onConfirm: () => handler(true), onCancel: () => handler(false) });
            },
            prompt: (title, placeholderOrCb, cbOrId, maybeId) => {
                let placeholder = '', cb, id;
                if (typeof placeholderOrCb === 'function') { cb = placeholderOrCb; id = cbOrId || $uid(); }
                else { placeholder = placeholderOrCb || ''; cb = cbOrId; id = maybeId || $uid(); }
                const handler = typeof cb === 'function' ? cb : () => {};
                open({ title, placeholder, inputId: id, confirmLabel: 'حفظ', onConfirm: handler, onCancel: () => handler(null) });
            },
            danger: (title, description, onConfirm) => open({ title, description, type: 'danger', confirmLabel: 'حذف', onConfirm: () => onConfirm?.(true), onCancel: () => onConfirm?.(false) }),
            open
        };
    })();

    const Cmd = (() => {
        let lastScored = [];
        let cmdOwner = null;

        const renderResults = (container) => {
            const query = State.cmdState.query;
            let scored = query ? Actions.search(query) : Actions.getAll().sort((a, b) => {
                const af = State.cmdState.favorites.has(a.id) ? -1000 : 0;
                const bf = State.cmdState.favorites.has(b.id) ? -1000 : 0;
                if (af !== bf) return af - bf;
                const ai = State.cmdState.history.indexOf(a.id);
                const bi = State.cmdState.history.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
            });
            if (query.length > 2 && !scored.length) {
                scored.push({ id: '__ai__', title: `الذكاء الاصطناعي: "${query}"`, description: 'اطلب من المساعد الذكي', icon: '✨', isAI: true, handler: () => Toasts.create('loading', 'جاري معالجة طلبك...', 2200) });
            }
            if (State.cmdState.selectedIndex >= scored.length) State.cmdState.selectedIndex = 0;
            lastScored = scored;
            State.cmdState.results = scored;
            const frag = document.createDocumentFragment();
            if (!scored.length) {
                const empty = DOM.create('div', { class: 'px-4 py-16 text-center sys-fade-in', role: 'status' });
                empty.innerHTML = `<div class="w-12 h-12 rounded-full bg-white/5 border border-white/10 mx-auto mb-3 flex items-center justify-center sys-breathe"><svg class="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p class="text-sm text-gray-500 font-medium">لا توجد نتائج</p>`;
                frag.appendChild(empty);
                container.innerHTML = '';
                container.appendChild(frag);
                return;
            }
            const groups = new Map();
            scored.forEach(cmd => {
                let g;
                if (cmd.isAI) g = '✨ ذكاء اصطناعي';
                else if (!query && State.cmdState.favorites.has(cmd.id)) g = '⭐ المفضلة';
                else if (!query && State.cmdState.history.includes(cmd.id)) g = '🕒 مستخدم مؤخراً';
                else g = cmd.group || 'الأوامر';
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g).push(cmd);
            });
            let idx = 0;
            const allRows = [];
            const highlight = (text, q) => {
                if (!q) return $esc(text);
                const safe = $esc(text);
                const safeQ = $esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`(${safeQ})`, 'gi');
                return safe.replace(re, '<mark style="background:rgba(168,85,247,0.35);color:#fff;border-radius:3px;padding:0 2px;font-weight:600">$1</mark>');
            };
            groups.forEach((items, groupName) => {
                const header = DOM.create('div', { class: 'px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold', text: groupName, role: 'presentation' });
                frag.appendChild(header);
                items.forEach(cmd => {
                    const currentIdx = idx++;
                    const isActive = currentIdx === State.cmdState.selectedIndex;
                    const isFav = State.cmdState.favorites.has(cmd.id);
                    const baseCls = isActive ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/10 border-purple-500/30' : 'hover:bg-white/5 border-transparent';
                    const aiCls = cmd.isAI ? 'border-purple-500/40 bg-purple-900/15' : '';
                    const row = DOM.create('div', { class: `flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all border ${baseCls} ${aiCls} group`, dataset: { idx: currentIdx }, role: 'option', 'aria-selected': isActive ? 'true' : 'false', id: 'sys-cmd-row-' + currentIdx, style: { opacity: '0', transform: 'translateX(-8px)', minHeight: 'var(--sys-touch-target)' } });
                    const left = DOM.create('div', { class: 'flex items-center gap-3 min-w-0 flex-1' });
                    const iconBox = DOM.create('div', { class: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base transition-transform group-hover:scale-110 ${cmd.isAI ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/20 border border-purple-500/30' : 'bg-white/5 border border-white/10'}`, text: cmd.icon || '⌘', 'aria-hidden': 'true' });
                    const textWrap = DOM.create('div', { class: 'flex flex-col min-w-0 flex-1' });
                    textWrap.appendChild(DOM.create('span', { class: `${cmd.isAI ? 'text-purple-200' : 'text-gray-100'} font-medium truncate`, style: { fontSize: 'var(--sys-text-sm)' }, html: highlight(cmd.title, query) }));
                    if (cmd.description) textWrap.appendChild(DOM.create('span', { class: 'text-[11px] text-gray-500 truncate mt-0.5', text: cmd.description }));
                    left.append(iconBox, textWrap);
                    row.appendChild(left);
                    const right = DOM.create('div', { class: 'flex items-center gap-2 shrink-0 ml-2' });
                    if (isFav) right.appendChild(DOM.create('span', { class: 'text-yellow-400 text-xs', text: '★', 'aria-label': 'مفضلة' }));
                    if (cmd.shortcut && Viewport.atLeast('md')) right.appendChild(DOM.create('span', { class: 'sys-kbd', text: cmd.shortcut }));
                    row.appendChild(right);
                    row.addEventListener('mouseenter', () => { State.cmdState.selectedIndex = currentIdx; updateActive(container); Audio.play('hover'); });
                    row.addEventListener('click', () => { close(); cmd.isAI ? cmd.handler() : Actions.execute(cmd.id); });
                    frag.appendChild(row);
                    allRows.push(row);
                });
            });
            container.innerHTML = '';
            container.appendChild(frag);
            Motion.stagger(allRows, (el) => { Motion.spring(el, { opacity: [0, 1], transform: ['translateX(-8px)', 'translateX(0)'] }, 'precise'); }, 14);
        };

        const updateActive = (container) => {
            const input = document.getElementById('sys-cmd-input');
            container.querySelectorAll('[data-idx]').forEach(el => {
                const i = parseInt(el.dataset.idx);
                if (i === State.cmdState.selectedIndex) {
                    el.classList.add('bg-gradient-to-r', 'from-purple-500/20', 'to-pink-500/10', 'border-purple-500/30');
                    el.classList.remove('hover:bg-white/5', 'border-transparent');
                    el.setAttribute('aria-selected', 'true');
                    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    if (input) input.setAttribute('aria-activedescendant', el.id);
                } else {
                    el.classList.remove('bg-gradient-to-r', 'from-purple-500/20', 'to-pink-500/10', 'border-purple-500/30');
                    el.classList.add('hover:bg-white/5', 'border-transparent');
                    el.setAttribute('aria-selected', 'false');
                }
            });
        };

        const open = () => {
            Theme.inject();
            Audio.play('open');
            Haptics.medium();
            const vp = Viewport.get();
            const container = DOM.mount('sys-cmd-root', Layers.cmd, 'fixed inset-0 hidden items-start justify-center pointer-events-none');
            container.style.padding = 'clamp(0.75rem, 2vw, 1.5rem)';
            container.style.paddingTop = vp.isMobile ? 'calc(var(--sys-safe-top) + 4vh)' : '12vh';
            const bd = DOM.mount('sys-cmd-backdrop', Layers.backdrop, 'sys-overlay-backdrop');
            State.cmdState = { ...State.cmdState, query: '', selectedIndex: 0, results: [] };
            cmdOwner?.dispose();
            cmdOwner = Lifecycle.createOwner();
            const listId = 'sys-cmd-list-' + $uid();
            const box = DOM.create('div', { class: 'w-full sys-glass-strong rounded-2xl overflow-hidden pointer-events-auto flex flex-col sys-noise-overlay shadow-2xl', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'لوحة الأوامر', style: { transformOrigin: 'center top', maxWidth: 'min(42rem, calc(100vw - 1.5rem))', maxHeight: '80dvh' } });
            Lifecycle.attach(box, cmdOwner);
            const header = DOM.create('div', { class: 'flex items-center px-5 py-4 border-b border-white/10 relative sys-input-field' });
            header.innerHTML = `<svg class="w-5 h-5 text-purple-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`;
            const input = DOM.create('input', { type: 'text', id: 'sys-cmd-input', class: 'w-full bg-transparent text-white outline-none placeholder-gray-500 font-medium', style: { fontSize: 'var(--sys-text-base)' }, placeholder: 'ابحث، تنقل، أو اطلب من الذكاء الاصطناعي...', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list' });
            const escTag = DOM.create('span', { class: 'sys-kbd ml-2 shrink-0', text: 'ESC' });
            if (!vp.isMobile) header.append(input, escTag);
            else header.appendChild(input);
            const results = DOM.create('div', { id: listId, class: 'overflow-y-auto sys-no-scroll p-2', style: { maxHeight: 'min(420px, 60dvh)' }, role: 'listbox' });
            const footer = DOM.create('div', { class: 'flex items-center justify-between px-5 py-3 border-t border-white/10 text-[10px] text-gray-500 bg-black/20' });
            footer.innerHTML = vp.isMobile
                ? `<div>اضغط على عنصر للتنفيذ</div><div class="sys-shimmer-text font-semibold tracking-[0.3em]">SYS_UI</div>`
                : `<div class="flex gap-4"><span class="flex items-center gap-1.5"><span class="sys-kbd">↑↓</span> تنقل</span><span class="flex items-center gap-1.5"><span class="sys-kbd">↵</span> تنفيذ</span><span class="flex items-center gap-1.5"><span class="sys-kbd">⇥</span> مفضلة</span></div><div class="sys-shimmer-text font-semibold tracking-[0.3em]">SYS_UI</div>`;
            box.append(header, results, footer);
            container.innerHTML = '';
            container.appendChild(box);
            container.classList.remove('hidden');
            container.classList.add('flex');
            requestAnimationFrame(() => bd.classList.add('sys-open'));
            Motion.spring(box, { transform: ['scale(0.92) translateY(-24px)', 'scale(1) translateY(0)'], opacity: [0, 1] }, 'ios');
            setTimeout(() => { try { input.focus(); } catch {} }, 80);
            const debouncedRender = $debounce(() => renderResults(results), 30);
            cmdOwner.listen(input, 'input', (e) => { State.cmdState.query = e.target.value; State.cmdState.selectedIndex = 0; debouncedRender(); Audio.play('tap'); });
            cmdOwner.listen(input, 'keydown', (e) => {
                const len = lastScored.length || 1;
                if (e.key === 'ArrowDown') { e.preventDefault(); State.cmdState.selectedIndex = (State.cmdState.selectedIndex + 1) % len; updateActive(results); Audio.play('tick'); Haptics.soft(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); State.cmdState.selectedIndex = (State.cmdState.selectedIndex - 1 + len) % len; updateActive(results); Audio.play('tick'); Haptics.soft(); }
                else if (e.key === 'Enter') { e.preventDefault(); const cmd = lastScored[State.cmdState.selectedIndex]; if (cmd) { close(); cmd.isAI ? cmd.handler() : Actions.execute(cmd.id); } }
                else if (e.key === 'Tab') { e.preventDefault(); const cmd = lastScored[State.cmdState.selectedIndex]; if (cmd && !cmd.isAI) { Actions.toggleFavorite(cmd.id); renderResults(results); Audio.play('select'); Haptics.select(); } }
            });
            cmdOwner.listen(bd, 'click', close);
            DOM.pushOverlay('cmd', close);
            renderResults(results);
        };
        const close = () => {
            Audio.play('close');
            const container = document.getElementById('sys-cmd-root');
            const bd = document.getElementById('sys-cmd-backdrop');
            const box = container?.children[0];
            if (box) Motion.animate(box, [{ transform: 'scale(1) translateY(0)', opacity: 1, filter: 'blur(0)' }, { transform: 'scale(0.96) translateY(-12px)', opacity: 0, filter: 'blur(6px)' }], { duration: 220, easing: Motion.tokens.ease.accelerate });
            if (bd) bd.classList.remove('sys-open');
            DOM.popOverlay();
            cmdOwner?.dispose(); cmdOwner = null;
            setTimeout(() => { if (container) { container.classList.add('hidden'); container.classList.remove('flex'); container.innerHTML = ''; } }, 220);
        };
        const toggle = () => { const c = document.getElementById('sys-cmd-root'); (c && !c.classList.contains('hidden')) ? close() : open(); };
        return { open, close, toggle };
    })();

    const ContextMenu = (() => {
        let activeOwner = null;
        const show = (e, items) => {
            e.preventDefault();
            Theme.inject();
            close();
            Audio.play('pop');
            Haptics.light();
            activeOwner = Lifecycle.createOwner();
            const vp = Viewport.get();
            const isSheet = vp.isMobile;
            if (isSheet) {
                const bd = DOM.create('div', { class: 'fixed inset-0 bg-black/50 backdrop-blur-sm', style: { zIndex: Layers.context - 1 } });
                document.body.appendChild(bd);
                bd.id = 'sys-context-bd';
                activeOwner.add(() => bd.remove());
                activeOwner.listen(bd, 'click', close);
            }
            const menuStyle = isSheet
                ? { zIndex: Layers.context, bottom: 'var(--sys-safe-bottom)', left: '12px', right: '12px', borderRadius: '20px 20px 0 0', padding: '8px', maxHeight: '70dvh', overflowY: 'auto', transform: 'translateY(100%)' }
                : { zIndex: Layers.context, top: e.clientY + 'px', left: e.clientX + 'px', transformOrigin: 'top left', opacity: '0', minWidth: '200px' };
            const menu = DOM.create('div', { class: `fixed sys-glass-strong ${isSheet ? '' : 'rounded-xl'} py-1.5 sys-noise-overlay sys-no-scroll`, role: 'menu', style: menuStyle });
            Lifecycle.attach(menu, activeOwner);
            if (isSheet) menu.appendChild(DOM.create('div', { class: 'sys-sheet-handle', 'aria-hidden': 'true' }));
            const rows = [];
            items.forEach(item => {
                if (item.divider) { menu.appendChild(DOM.create('div', { class: 'sys-divider-glow my-1.5 mx-2', role: 'separator' })); return; }
                const row = DOM.create('button', { class: `w-full flex items-center gap-3 px-3 py-3 ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-200 hover:bg-white/10'} transition-colors text-right rounded-lg`, style: { fontSize: 'var(--sys-text-sm)', minHeight: 'var(--sys-touch-target)' }, role: 'menuitem' });
                if (!isSheet) row.style.opacity = '0';
                if (item.icon) row.appendChild(DOM.create('span', { class: 'text-base shrink-0 w-5', text: item.icon, 'aria-hidden': 'true' }));
                row.appendChild(DOM.create('span', { class: 'flex-1 text-right font-medium', text: item.label }));
                if (item.shortcut && !isSheet) row.appendChild(DOM.create('span', { class: 'sys-kbd', text: item.shortcut }));
                activeOwner.listen(row, 'mouseenter', () => Audio.play('hover'));
                activeOwner.listen(row, 'click', () => { close(); Audio.play('click'); try { item.handler?.(); } catch {} });
                menu.appendChild(row);
                rows.push(row);
            });
            document.body.appendChild(menu);
            menu.id = 'sys-context-menu';
            if (isSheet) {
                requestAnimationFrame(() => Motion.spring(menu, { transform: ['translateY(100%)', 'translateY(0)'] }, 'ios'));
            } else {
                const rect = menu.getBoundingClientRect();
                if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
                if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
                Motion.spring(menu, { transform: ['scale(0.86) translateY(-8px)', 'scale(1) translateY(0)'], opacity: [0, 1] }, 'ios');
                Motion.stagger(rows, (el) => { Motion.spring(el, { opacity: [0, 1], transform: ['translateX(-6px)', 'translateX(0)'] }, 'precise'); }, 18);
                setTimeout(() => { activeOwner?.listen(document, 'click', close, { once: true }); activeOwner?.listen(document, 'contextmenu', close, { once: true }); }, 50);
            }
            DOM.pushOverlay('ctx', close);
        };
        const close = () => {
            const m = document.getElementById('sys-context-menu');
            if (m) {
                const isSheet = m.style.bottom !== '';
                if (isSheet) Motion.animate(m, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: 200, easing: Motion.tokens.ease.accelerate }).then(() => m.remove());
                else Motion.animate(m, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92)' }], { duration: 160, easing: Motion.tokens.ease.accelerate }).then(() => m.remove());
            }
            if (State.activeOverlays.length && State.activeOverlays[State.activeOverlays.length - 1].id === 'ctx') DOM.popOverlay();
            activeOwner?.dispose(); activeOwner = null;
        };
        return { show, close };
    })();

    const Tooltip = (() => {
        let el, hideTimer, showTimer;
        const ensure = () => { if (!el) { el = DOM.create('div', { class: 'sys-tooltip', id: 'sys-tooltip-root', role: 'tooltip' }); document.body.appendChild(el); } return el; };
        const show = (target, text, placement = 'top') => {
            if ($isTouch) return;
            clearTimeout(hideTimer);
            clearTimeout(showTimer);
            showTimer = setTimeout(() => {
                ensure().textContent = text;
                el.dataset.placement = placement;
                const rect = target.getBoundingClientRect();
                const tRect = el.getBoundingClientRect();
                let top, left;
                if (placement === 'top') { top = rect.top - tRect.height - 10; left = rect.left + rect.width / 2 - tRect.width / 2; }
                else if (placement === 'bottom') { top = rect.bottom + 10; left = rect.left + rect.width / 2 - tRect.width / 2; }
                else if (placement === 'left') { top = rect.top + rect.height / 2 - tRect.height / 2; left = rect.left - tRect.width - 10; }
                else { top = rect.top + rect.height / 2 - tRect.height / 2; left = rect.right + 10; }
                el.style.top = $clamp(top, 8, window.innerHeight - tRect.height - 8) + 'px';
                el.style.left = $clamp(left, 8, window.innerWidth - tRect.width - 8) + 'px';
                el.classList.add('sys-tooltip-show');
            }, 280);
        };
        const hide = () => { clearTimeout(showTimer); hideTimer = setTimeout(() => el?.classList.remove('sys-tooltip-show'), 60); };
        const attach = (selector, getText, placement = 'top') => {
            const owner = Lifecycle.createOwner();
            document.querySelectorAll(selector).forEach(target => {
                Lifecycle.attach(target, owner);
                const text = typeof getText === 'function' ? () => getText(target) : () => getText;
                owner.listen(target, 'mouseenter', () => show(target, text(), placement));
                owner.listen(target, 'mouseleave', hide);
                owner.listen(target, 'focus', () => show(target, text(), placement));
                owner.listen(target, 'blur', hide);
            });
            return () => owner.dispose();
        };
        return { show, hide, attach };
    })();

    const Confetti = (count = 120, opts = {}) => {
        const { colors = ['#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4', '#ffffff', '#f59e0b'], spread = 120, originX = 50, gravity = 1, shapes = ['circle', 'square', 'triangle', 'star'] } = opts;
        Theme.inject();
        const layer = DOM.mount('sys-confetti', Layers.particles, 'fixed inset-0 pointer-events-none overflow-hidden');
        Audio.play('success');
        Haptics.success();
        const tierFactor = $perfTier === 'low' ? 0.35 : $perfTier === 'mid' ? 0.65 : 1;
        const actualCount = Math.floor(count * tierFactor);
        for (let i = 0; i < actualCount; i++) {
            const piece = document.createElement('div');
            const size = 5 + Math.random() * 10;
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const color = colors[i % colors.length];
            let shapeStyle = '';
            if (shape === 'circle') shapeStyle = `border-radius:50%;background:${color};`;
            else if (shape === 'square') shapeStyle = `background:${color};`;
            else if (shape === 'triangle') shapeStyle = `width:0;height:0;border-left:${size/2}px solid transparent;border-right:${size/2}px solid transparent;border-bottom:${size}px solid ${color};background:transparent;`;
            else shapeStyle = `background:${color};clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);`;
            piece.style.cssText = `position:absolute;top:-30px;left:${originX + (Math.random() - 0.5) * spread}%;width:${size}px;height:${size}px;${shapeStyle}opacity:${0.7 + Math.random() * 0.3};will-change:transform,opacity;`;
            layer.appendChild(piece);
            const driftX = (Math.random() - 0.5) * 400;
            const duration = (1600 + Math.random() * 2400) / gravity;
            const rotation = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 1080);
            piece.animate([
                { transform: `translate3d(0,0,0) rotate(0deg) scale(1)`, opacity: 1 },
                { transform: `translate3d(${driftX * 0.5}px, 40vh, 0) rotate(${rotation * 0.5}deg) scale(1.1)`, opacity: 0.95, offset: 0.5 },
                { transform: `translate3d(${driftX}px, 110vh, 0) rotate(${rotation}deg) scale(0.8)`, opacity: 0 }
            ], { duration, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)' }).onfinish = () => piece.remove();
        }
        setTimeout(() => { if (layer && !layer.children.length) layer.remove(); }, 5000);
    };

    const Fireworks = (count = 5) => {
        Theme.inject();
        const layer = DOM.mount('sys-fireworks', Layers.particles, 'fixed inset-0 pointer-events-none overflow-hidden');
        Audio.play('bell');
        const actual = $perfTier === 'low' ? Math.min(count, 2) : $perfTier === 'mid' ? Math.min(count, 4) : count;
        for (let f = 0; f < actual; f++) {
            setTimeout(() => {
                const cx = 20 + Math.random() * 60;
                const cy = 20 + Math.random() * 40;
                const hue = Math.floor(Math.random() * 360);
                const particles = $perfTier === 'low' ? 16 : $perfTier === 'mid' ? 28 : 40;
                Audio.play('pop');
                for (let i = 0; i < particles; i++) {
                    const angle = (Math.PI * 2 * i) / particles;
                    const velocity = 80 + Math.random() * 120;
                    const p = document.createElement('div');
                    p.style.cssText = `position:absolute;top:${cy}%;left:${cx}%;width:6px;height:6px;border-radius:50%;background:hsl(${hue + Math.random() * 60},90%,65%);box-shadow:0 0 8px hsl(${hue},90%,65%);will-change:transform,opacity;`;
                    layer.appendChild(p);
                    p.animate([
                        { transform: 'translate(0,0) scale(1)', opacity: 1 },
                        { transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity + 80}px) scale(0)`, opacity: 0 }
                    ], { duration: 1200 + Math.random() * 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }).onfinish = () => p.remove();
                }
            }, f * 350);
        }
        setTimeout(() => { if (layer && !layer.children.length) layer.remove(); }, 5000);
    };

    const Ripple = {
        attach: (selector = '[data-ripple], button, [role="button"]') => {
            rootOwner.listen(document, 'pointerdown', (e) => {
                const target = e.target.closest?.(selector);
                if (target && !target.dataset.noRipple) DOM.addRipple(e, target);
            });
        }
    };

    const Sparkline = (values, opts = {}) => {
        const { width = 100, height = 28, color = '#22c55e', fill = true, smooth = true } = opts;
        if (!values?.length) return '';
        const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
        const points = values.map((v, i) => [(i / (values.length - 1)) * width, height - ((v - min) / range) * (height - 4) - 2]);
        let path;
        if (smooth && points.length > 2) {
            path = `M ${points[0][0]},${points[0][1]}`;
            for (let i = 1; i < points.length; i++) {
                const [x, y] = points[i];
                const [px, py] = points[i - 1];
                const cx = (px + x) / 2;
                path += ` Q ${px},${py} ${cx},${(py + y) / 2}`;
            }
            path += ` T ${points[points.length - 1][0]},${points[points.length - 1][1]}`;
        } else {
            path = 'M ' + points.map(p => `${p[0]},${p[1]}`).join(' L ');
        }
        const gradId = 'sg' + $hash(values.join(','));
        const safeColor = $esc(color);
        const fillPath = fill ? `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${safeColor}" stop-opacity="0.4"/><stop offset="100%" stop-color="${safeColor}" stop-opacity="0"/></linearGradient></defs><path d="${path} L ${width},${height} L 0,${height} Z" fill="url(#${gradId})"/>` : '';
        return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="[w3.org](http://www.w3.org/2000/svg)" aria-hidden="true" style="max-width:${width}px">${fillPath}<path d="${path}" fill="none" stroke="${safeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ${safeColor}80)"/></svg>`;
    };

    const UIHelpers = {
        presence: (msg, duration = 8000) => {
            Theme.inject();
            const container = DOM.mount('sys-presence-bar', Layers.base + 50, 'fixed flex flex-col gap-2 pointer-events-none');
            container.style.top = 'calc(1rem + var(--sys-safe-top))';
            container.style.right = 'calc(1rem + var(--sys-safe-right))';
            container.style.maxWidth = 'calc(100vw - 2rem)';
            const el = DOM.create('div', { class: 'flex items-center gap-2.5 px-4 py-2 rounded-full sys-glass shadow-xl pointer-events-auto w-max max-w-full sys-noise-overlay', role: 'status' });
            el.innerHTML = `<div class="relative" aria-hidden="true"><div class="w-2 h-2 rounded-full bg-green-500"></div><div class="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping"></div></div>`;
            el.appendChild(DOM.create('span', { class: 'text-gray-200 font-medium tracking-wide truncate', style: { fontSize: 'var(--sys-text-xs)' }, text: msg }));
            container.appendChild(el);
            Motion.enter.slideLeft(el);
            setTimeout(() => Motion.exit.slideLeft(el).then(() => el.remove()), duration);
        },
        statCard: (title, value, trend = 0, trendLabel = '', sparkData = null) => {
            const trendIcon = trend > 0 ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>` : trend < 0 ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6"/></svg>` : '';
            const trendColor = trend > 0 ? 'text-green-400 bg-green-500/10 border-green-500/20' : trend < 0 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-400 bg-white/5 border-white/10';
            const sign = trend > 0 ? '+' : '';
            const spark = sparkData ? `<div class="mt-3 relative z-10 w-full">${Sparkline(sparkData, { color: trend >= 0 ? '#22c55e' : '#ef4444', width: 140, height: 32 })}</div>` : '';
            return `<div class="sys-glass sys-magnetic sys-elevate sys-bloom rounded-2xl flex flex-col relative overflow-hidden group sys-noise-overlay" style="padding:clamp(1rem,2vw,1.25rem)"><div class="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-pink-500/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div><span class="text-gray-400 font-medium mb-1.5 relative z-10 tracking-wide" style="font-size:var(--sys-text-xs)">${$esc(title)}</span><div class="flex items-baseline gap-3 relative z-10 flex-wrap"><span class="font-bold text-white tracking-tight" style="font-size:var(--sys-text-2xl)">${$esc(value)}</span>${trend !== 0 ? `<div class="flex items-center gap-1 ${trendColor} px-2 py-0.5 rounded-md text-[10px] font-semibold border">${trendIcon}<span>${sign}${trend}% ${$esc(trendLabel)}</span></div>` : ''}</div>${spark}</div>`;
        },
        emptyState: (containerId, type, title, desc, actionLabel = null, actionId = null) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = '';
            const wrap = DOM.create('div', { class: 'flex flex-col items-center justify-center text-center w-full mx-auto', style: { padding: 'clamp(2.5rem,5vw,5rem) 1rem', maxWidth: 'min(24rem, 92vw)' } });
            const iconBox = DOM.create('div', { class: 'relative mb-5 rounded-2xl sys-glass border border-white/10 flex items-center justify-center shadow-inner sys-breathe sys-bloom', style: { width: 'clamp(64px, 8vw, 80px)', height: 'clamp(64px, 8vw, 80px)' }, 'aria-hidden': 'true' });
            iconBox.innerHTML = `<svg style="width:60%;height:60%" class="text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.4"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg><div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/10 to-transparent"></div>`;
            wrap.appendChild(iconBox);
            const titleEl = DOM.create('h3', { class: 'text-white font-semibold mb-2 tracking-tight', style: { fontSize: 'var(--sys-text-lg)' }, text: title });
            const descEl = DOM.create('p', { class: 'text-gray-500 mb-6 leading-relaxed', style: { fontSize: 'var(--sys-text-sm)' }, text: desc });
            wrap.append(titleEl, descEl);
            if (actionLabel) {
                const btn = DOM.create('button', { class: 'sys-magnetic sys-button-press sys-shimmer-sweep px-6 py-3 rounded-xl font-semibold bg-gradient-to-br from-white to-gray-200 text-black hover:from-gray-100 hover:to-white transition-all shadow-[0_0_24px_rgba(255,255,255,0.25)]', style: { fontSize: 'var(--sys-text-sm)' }, text: actionLabel });
                if (actionId) btn.addEventListener('click', () => Actions.execute(actionId));
                wrap.appendChild(btn);
            }
            el.appendChild(wrap);
            const children = Array.from(wrap.children);
            children.forEach(c => { c.style.opacity = '0'; });
            Motion.stagger(children, (c) => Motion.enter.slideUp(c), 70);
        },
        generateSkeleton: (type = 'card', count = 1) => {
            Theme.inject();
            const variants = {
                card: () => `<div data-stagger class="p-5 border border-white/5 rounded-2xl bg-white/[0.015] flex flex-col gap-4 w-full sys-fade-in shadow-inner mb-3" aria-hidden="true"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full sys-skeleton-bg"></div><div class="flex flex-col gap-2 flex-1"><div class="h-3 w-1/3 sys-skeleton-bg rounded-full"></div><div class="h-2 w-1/4 sys-skeleton-bg rounded-full opacity-60"></div></div></div><div class="h-20 w-full sys-skeleton-bg rounded-xl mt-2"></div></div>`,
                list: () => `<div data-stagger class="flex items-center gap-3 p-3 border-b border-white/5 sys-fade-in" aria-hidden="true"><div class="w-9 h-9 rounded-lg sys-skeleton-bg shrink-0"></div><div class="flex-1 flex flex-col gap-2 min-w-0"><div class="h-3 w-2/5 sys-skeleton-bg rounded-full"></div><div class="h-2 w-3/5 sys-skeleton-bg rounded-full opacity-60"></div></div></div>`,
                            text: () => `<div data-stagger class="flex flex-col gap-2 sys-fade-in mb-2"><div class="h-3 w-full sys-skeleton-bg rounded-full"></div><div class="h-3 w-4/5 sys-skeleton-bg rounded-full opacity-75"></div></div>`
            };
            // تكرار الهيكل بناءً على العدد المطلوب (count)
            return Array(count).fill(0).map(() => (variants[type] || variants.card)()).join('');
        }
    };

    // تصدير كافه المكونات المكتوبة في الملف لتصبح متاحة عبر الكائن الرئيسي SysUI
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
        Ripple: typeof Ripple !== 'undefined' ? Ripple : undefined,
        Sparkline: typeof Sparkline !== 'undefined' ? Sparkline : undefined
    };
})();
