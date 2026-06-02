const SysUI = (() => {
    const $esc = (str) => String(str ?? '').replace(/[&<>"'`=\/]/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;','=':'&#61;','/':'&#47;'}[s]));
    const $safeJSON = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
    const $rafThrottle = (fn) => { let t = false, lastArgs; return (...args) => { lastArgs = args; if (!t) { t = true; requestAnimationFrame(() => { fn(...lastArgs); t = false; }); } }; };
    const $debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
    const $throttle = (fn, ms) => { let last = 0, id; return (...a) => { const now = performance.now(); if (now - last >= ms) { last = now; fn(...a); } else { clearTimeout(id); id = setTimeout(() => { last = performance.now(); fn(...a); }, ms - (now - last)); } }; };
    const $idle = (fn, timeout = 200) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 1));
    const $uid = () => 'sys_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    const $clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const $lerp = (a, b, t) => a + (b - a) * t;
    const $smoothstep = (a, b, t) => { const x = $clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
    const $hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i); return (h >>> 0).toString(36); };
    const $wait = (ms) => new Promise(r => setTimeout(r, ms));
    const $range = (n) => Array.from({ length: n }, (_, i) => i);
    const $map = (v, a1, a2, b1, b2) => b1 + (b2 - b1) * ((v - a1) / (a2 - a1));
    const $round = (v, p = 2) => { const m = 10 ** p; return Math.round(v * m) / m; };
    const $dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
    const SVGNS = 'http://www.w3.org/2000/svg';
    const $prm = matchMedia('(prefers-reduced-motion: reduce)');
    const $isTouch = matchMedia('(pointer: coarse)').matches;
    const $isHighRefresh = matchMedia('(min-resolution: 120dpi)').matches;
    let $reducedMotion = $prm.matches;
    $prm.addEventListener?.('change', e => { $reducedMotion = e.matches; });

    const Scheduler = (() => {
        const reads = [], writes = [];
        let scheduled = false;
        const flush = () => {
            const r = reads.splice(0), w = writes.splice(0);
            for (const fn of r) { try { fn(); } catch (e) { console.error('[SysUI:read]', e); } }
            for (const fn of w) { try { fn(); } catch (e) { console.error('[SysUI:write]', e); } }
            scheduled = false;
            if (reads.length || writes.length) schedule();
        };
        const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } };
        return {
            read: (fn) => { reads.push(fn); schedule(); },
            write: (fn) => { writes.push(fn); schedule(); },
            measure: (fn) => new Promise(res => { reads.push(() => res(fn())); schedule(); }),
            mutate: (fn) => new Promise(res => { writes.push(() => res(fn())); schedule(); })
        };
    })();

    const Easing = (() => {
        const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = (2 * Math.PI) / 3, c5 = (2 * Math.PI) / 4.5;
        const bounceOut = (x) => {
            const n1 = 7.5625, d1 = 2.75;
            if (x < 1 / d1) return n1 * x * x;
            if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
            if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
            return n1 * (x -= 2.625 / d1) * x + 0.984375;
        };
        return {
            linear: (x) => x,
            inQuad: (x) => x * x,
            outQuad: (x) => 1 - (1 - x) * (1 - x),
            inOutQuad: (x) => x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2,
            inCubic: (x) => x ** 3,
            outCubic: (x) => 1 - (1 - x) ** 3,
            inOutCubic: (x) => x < 0.5 ? 4 * x ** 3 : 1 - ((-2 * x + 2) ** 3) / 2,
            inQuart: (x) => x ** 4,
            outQuart: (x) => 1 - (1 - x) ** 4,
            inOutQuart: (x) => x < 0.5 ? 8 * x ** 4 : 1 - ((-2 * x + 2) ** 4) / 2,
            inExpo: (x) => x === 0 ? 0 : 2 ** (10 * x - 10),
            outExpo: (x) => x === 1 ? 1 : 1 - 2 ** (-10 * x),
            inOutExpo: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? (2 ** (20 * x - 10)) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
            inBack: (x) => c3 * x ** 3 - c1 * x ** 2,
            outBack: (x) => 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2,
            inOutBack: (x) => x < 0.5 ? ((2 * x) ** 2 * ((c2 + 1) * 2 * x - c2)) / 2 : ((2 * x - 2) ** 2 * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,
            inElastic: (x) => x === 0 ? 0 : x === 1 ? 1 : -(2 ** (10 * x - 10)) * Math.sin((x * 10 - 10.75) * c4),
            outElastic: (x) => x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1,
            inOutElastic: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -((2 ** (20 * x - 10)) * Math.sin((20 * x - 11.125) * c5)) / 2 : ((2 ** (-20 * x + 10)) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1,
            outBounce: bounceOut,
            inBounce: (x) => 1 - bounceOut(1 - x),
            inOutBounce: (x) => x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2
        };
    })();

    const Motion = (() => {
        const tokens = {
            duration: { instant: 80, micro: 120, fast: 180, normal: 240, emphasized: 340, slow: 480, slower: 680, glacial: 920 },
            ease: {
                standard: 'cubic-bezier(0.2, 0, 0, 1)',
                emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
                decelerate: 'cubic-bezier(0, 0, 0, 1)',
                accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
                spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
                springSoft: 'cubic-bezier(0.34, 1.26, 0.64, 1)',
                springBounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                springSnappy: 'cubic-bezier(0.22, 1, 0.36, 1)',
                elastic: 'cubic-bezier(0.68, -0.4, 0.265, 1.4)',
                smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
                anticipate: 'cubic-bezier(0.75, -0.5, 0.25, 1.5)'
            },
            spring: {
                gentle: { stiffness: 120, damping: 14, mass: 1 },
                wobbly: { stiffness: 180, damping: 12, mass: 1 },
                stiff: { stiffness: 300, damping: 22, mass: 1 },
                slow: { stiffness: 80, damping: 20, mass: 1 },
                snappy: { stiffness: 400, damping: 28, mass: 1 },
                bouncy: { stiffness: 260, damping: 9, mass: 1.1 }
            },
            stagger: { tight: 22, normal: 38, relaxed: 60, dramatic: 90 }
        };
        const reduce = (ms) => $reducedMotion ? Math.min(ms, 80) : ms;
        const springCurve = (preset = 'gentle', steps = 40) => {
            const { stiffness, damping, mass } = tokens.spring[preset] || tokens.spring.gentle;
            const w0 = Math.sqrt(stiffness / mass);
            const zeta = damping / (2 * Math.sqrt(stiffness * mass));
            const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
            const frames = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                let v;
                if (zeta < 1) v = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
                else v = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
                frames.push(v);
            }
            return frames;
        };
        const animate = (el, keyframes, opts = {}) => {
            if (!el) return Promise.resolve();
            const { duration = tokens.duration.normal, easing = tokens.ease.standard, delay = 0, fill = 'forwards', composite = 'replace' } = opts;
            const d = reduce(duration);
            try {
                const anim = el.animate(keyframes, { duration: d, easing, delay: reduce(delay), fill, composite });
                return anim.finished.catch(() => {});
            } catch { return Promise.resolve(); }
        };
        const spring = (el, props, preset = 'gentle') => {
            if (!el || $reducedMotion) {
                if (el && props) Object.entries(props).forEach(([k, v]) => { el.style[k] = Array.isArray(v) ? v[v.length - 1] : v; });
                return Promise.resolve();
            }
            const curve = springCurve(preset, 32);
            const keys = Object.keys(props);
            const frames = curve.map(t => {
                const f = {};
                for (const k of keys) {
                    const val = props[k];
                    if (Array.isArray(val) && val.length === 2) {
                        const [from, to] = val;
                        if (typeof from === 'number') f[k] = $lerp(from, to, t);
                        else f[k] = t < 1 ? from : to;
                    } else f[k] = val;
                }
                return f;
            });
            const dur = reduce(tokens.duration.emphasized);
            try {
                const anim = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
                return anim.finished.catch(() => {});
            } catch { return Promise.resolve(); }
        };
        const stagger = async (els, fn, gap = tokens.stagger.normal) => {
            const promises = [];
            for (let i = 0; i < els.length; i++) promises.push(new Promise(r => setTimeout(() => { fn(els[i], i); r(); }, reduce(i * gap))));
            return Promise.all(promises);
        };
        const enter = {
            fade: (el, opts = {}) => animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: tokens.duration.normal, easing: tokens.ease.standard, ...opts }),
            scale: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideUp: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideDown: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideLeft: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateX(20px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideRight: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            pop: (el) => spring(el, { transform: ['scale(0.85)', 'scale(1)'], opacity: [0, 1] }, 'bouncy'),
            blur: (el, opts = {}) => animate(el, [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: tokens.duration.slow, easing: tokens.ease.smooth, ...opts }),
            zoomBlur: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'scale(1.12)', filter: 'blur(12px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: tokens.duration.slow, easing: tokens.ease.spring, ...opts }),
            flipIn: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'perspective(800px) rotateX(-40deg)' }, { opacity: 1, transform: 'perspective(800px) rotateX(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts })
        };
        const exit = {
            fade: (el, opts = {}) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            scale: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            slideUp: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-12px)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            slideDown: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(12px)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            slideLeft: (el, opts = {}) => animate(el, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(20px)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts }),
            blur: (el, opts = {}) => animate(el, [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: tokens.duration.fast, easing: tokens.ease.accelerate, ...opts })
        };
        const shake = (el, intensity = 8) => animate(el, [
            { transform: 'translateX(0)' }, { transform: `translateX(-${intensity}px)` },
            { transform: `translateX(${intensity}px)` }, { transform: `translateX(-${intensity * 0.6}px)` },
            { transform: `translateX(${intensity * 0.6}px)` }, { transform: 'translateX(0)' }
        ], { duration: 380, easing: tokens.ease.smooth });
        const pulse = (el) => animate(el, [
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.04)', filter: 'brightness(1.15)' },
            { transform: 'scale(1)', filter: 'brightness(1)' }
        ], { duration: 420, easing: tokens.ease.springSoft });
        const wobble = (el) => animate(el, [
            { transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(4deg)' },
            { transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0deg)' }
        ], { duration: 500, easing: tokens.ease.springBounce });
        const flip = (el, from, to) => {
            if ($reducedMotion) return Promise.resolve();
            const dx = from.left - to.left, dy = from.top - to.top;
            const sx = from.width / to.width, sy = from.height / to.height;
            return animate(el, [
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                { transform: 'translate(0, 0) scale(1, 1)' }
            ], { duration: tokens.duration.emphasized, easing: tokens.ease.spring });
        };
        return { tokens, animate, spring, stagger, enter, exit, shake, pulse, wobble, flip, reduce, springCurve };
    })();

    const Tween = (() => {
        const active = new Set();
        const to = (opts) => {
            const { from = 0, to: target = 1, duration = 400, ease = 'outCubic', onUpdate, onComplete, delay = 0 } = opts;
            const fn = typeof ease === 'function' ? ease : (Easing[ease] || Easing.outCubic);
            return new Promise(resolve => {
                const start = performance.now() + delay;
                const ctrl = { cancelled: false };
                active.add(ctrl);
                const step = (now) => {
                    if (ctrl.cancelled) { active.delete(ctrl); return; }
                    const t = $clamp((now - start) / ($reducedMotion ? Math.min(duration, 80) : duration), 0, 1);
                    if (t < 0) { requestAnimationFrame(step); return; }
                    const v = from + (target - from) * fn(t);
                    onUpdate?.(v, t);
                    if (t < 1) requestAnimationFrame(step);
                    else { active.delete(ctrl); onComplete?.(); resolve(); }
                };
                requestAnimationFrame(step);
                resolve.cancel = () => { ctrl.cancelled = true; };
            });
        };
        return { to, killAll: () => active.forEach(c => c.cancelled = true) };
    })();

    const Timeline = () => {
        const steps = [];
        let position = 0;
        const api = {
            add: (fn, at = null) => { steps.push({ fn, at: at == null ? position : at }); position = (at == null ? position : at); return api; },
            wait: (ms) => { position += ms; return api; },
            then: (fn) => { steps.push({ fn, at: position }); return api; },
            play: async () => { for (const s of steps.sort((a, b) => a.at - b.at)) { await $wait(Math.max(0, s.at - 0)); await s.fn?.(); } return api; }
        };
        return api;
    };

    const Color = (() => {
        const hexToRgb = (hex) => {
            const h = hex.replace('#', '');
            const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
            const n = parseInt(f, 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        };
        const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => $clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
        const mix = (a, b, t = 0.5) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex($lerp(x.r, y.r, t), $lerp(x.g, y.g, t), $lerp(x.b, y.b, t)); };
        const lighten = (hex, amt = 0.1) => mix(hex, '#ffffff', amt);
        const darken = (hex, amt = 0.1) => mix(hex, '#000000', amt);
        const alpha = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
        const rgbToHsl = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h = 0, s = 0, l = (max + min) / 2;
            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h /= 6;
            }
            return { h: h * 360, s: s * 100, l: l * 100 };
        };
        const contrast = (hex) => { const { r, g, b } = hexToRgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000000' : '#ffffff'; };
        const random = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        return { hexToRgb, rgbToHex, mix, lighten, darken, alpha, rgbToHsl, contrast, random };
    })();

    const Events = (() => {
        const listeners = new Map();
        const wildcards = new Set();
        const queue = [];
        let flushing = false;
        const flush = () => {
            flushing = true;
            while (queue.length) {
                const { event, data } = queue.shift();
                listeners.get(event)?.forEach(cb => { try { cb(data); } catch (e) { console.error('[SysUI:Events]', event, e); } });
                wildcards.forEach(cb => { try { cb({ event, data }); } catch (e) { console.error('[SysUI:Events]', e); } });
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
            once: (event, cb) => { const off = Events.on(event, (d) => { off(); cb(d); }); return off; },
            emit: (event, data) => { queue.push({ event, data }); if (!flushing) queueMicrotask(flush); },
            emitSync: (event, data) => {
                listeners.get(event)?.forEach(cb => { try { cb(data); } catch (e) { console.error('[SysUI:Events]', e); } });
                wildcards.forEach(cb => { try { cb({ event, data }); } catch (e) {} });
            },
            off: (event, cb) => listeners.get(event)?.delete(cb),
            clear: (event) => event ? listeners.delete(event) : listeners.clear(),
            listenerCount: (event) => listeners.get(event)?.size || 0
        };
    })();

    const Signal = (() => {
        let currentEffect = null;
        const signal = (initial) => {
            let value = initial;
            const subs = new Set();
            const read = () => { if (currentEffect) subs.add(currentEffect); return value; };
            read.set = (next) => {
                const v = typeof next === 'function' ? next(value) : next;
                if (Object.is(v, value)) return;
                value = v;
                [...subs].forEach(fn => fn());
            };
            read.peek = () => value;
            read.subscribe = (fn) => { const w = () => fn(value); subs.add(w); return () => subs.delete(w); };
            return read;
        };
        const effect = (fn) => {
            const run = () => { currentEffect = run; try { fn(); } finally { currentEffect = null; } };
            run();
            return run;
        };
        const computed = (fn) => {
            const s = signal(undefined);
            effect(() => s.set(fn()));
            return s;
        };
        return { signal, effect, computed };
    })();

    const Store = (() => {
        const state = new Map();
        const subs = new Map();
        const computedCache = new Map();
        const middleware = [];
        return {
            get: (k) => state.get(k),
            set: (k, v) => {
                const prev = state.get(k);
                let next = v;
                for (const mw of middleware) next = mw(k, next, prev) ?? next;
                if (Object.is(prev, next)) return;
                state.set(k, next);
                computedCache.clear();
                subs.get(k)?.forEach(cb => { try { cb(next, prev); } catch (e) { console.error('[SysUI:Store]', e); } });
                Events.emit('store:change', { key: k, value: next, prev });
            },
            update: (k, fn) => Store.set(k, fn(state.get(k))),
            subscribe: (k, cb) => {
                if (!subs.has(k)) subs.set(k, new Set());
                subs.get(k).add(cb);
                return () => subs.get(k)?.delete(cb);
            },
            persist: (k, v) => { Store.set(k, v); try { localStorage.setItem('sysui_' + k, JSON.stringify(v)); } catch {} },
            hydrate: (k, fallback) => { const v = $safeJSON('sysui_' + k, fallback); Store.set(k, v); return v; },
            compute: (key, deps, fn) => {
                const cacheKey = key + ':' + deps.join(',');
                if (computedCache.has(cacheKey)) return computedCache.get(cacheKey);
                const result = fn(...deps.map(d => state.get(d)));
                computedCache.set(cacheKey, result);
                return result;
            },
            use: (mw) => middleware.push(mw),
            snapshot: () => Object.fromEntries(state),
            restore: (snap) => { Object.entries(snap).forEach(([k, v]) => Store.set(k, v)); }
        };
    })();

    const Storage = (() => {
        const ns = 'sysx_';
        return {
            set: (k, v, ttl = null) => { try { localStorage.setItem(ns + k, JSON.stringify({ v, e: ttl ? Date.now() + ttl : null })); } catch {} },
            get: (k, fallback = null) => {
                try {
                    const raw = localStorage.getItem(ns + k);
                    if (!raw) return fallback;
                    const { v, e } = JSON.parse(raw);
                    if (e && Date.now() > e) { localStorage.removeItem(ns + k); return fallback; }
                    return v;
                } catch { return fallback; }
            },
            remove: (k) => { try { localStorage.removeItem(ns + k); } catch {} },
            clear: () => { try { Object.keys(localStorage).filter(x => x.startsWith(ns)).forEach(x => localStorage.removeItem(x)); } catch {} },
            keys: () => { try { return Object.keys(localStorage).filter(x => x.startsWith(ns)).map(x => x.slice(ns.length)); } catch { return []; } }
        };
    })();

    const Net = (() => {
        const request = async (url, opts = {}) => {
            const { retries = 2, timeout = 12000, backoff = 600, ...init } = opts;
            let lastErr;
            for (let attempt = 0; attempt <= retries; attempt++) {
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), timeout);
                try {
                    const res = await fetch(url, { ...init, signal: ctrl.signal });
                    clearTimeout(tid);
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res;
                } catch (e) {
                    clearTimeout(tid);
                    lastErr = e;
                    if (attempt < retries) await $wait(backoff * (attempt + 1));
                }
            }
            throw lastErr;
        };
        return {
            get: async (url, opts) => (await request(url, { ...opts, method: 'GET' })).json(),
            getText: async (url, opts) => (await request(url, { ...opts, method: 'GET' })).text(),
            post: async (url, body, opts = {}) => (await request(url, { ...opts, method: 'POST', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: JSON.stringify(body) })).json(),
            request
        };
    })();

    const Validators = {
        required: (v) => (v == null || String(v).trim() === '') ? 'هذا الحقل مطلوب' : null,
        email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'بريد إلكتروني غير صالح',
        min: (n) => (v) => String(v).length >= n ? null : `الحد الأدنى ${n} أحرف`,
        max: (n) => (v) => String(v).length <= n ? null : `الحد الأقصى ${n} أحرف`,
        number: (v) => /^-?\d+(\.\d+)?$/.test(v) ? null : 'أدخل رقماً صالحاً',
        url: (v) => { try { new URL(v); return null; } catch { return 'رابط غير صالح'; } },
        match: (re, msg = 'تنسيق غير صالح') => (v) => re.test(v) ? null : msg,
        compose: (...fns) => (v) => { for (const f of fns) { const e = f(v); if (e) return e; } return null; }
    };

    const Audio = (() => {
        let ctx = null, master = null, compressor = null, reverb = null;
        let muted = $safeJSON('sysui_audio_muted', false);
        let volume = $safeJSON('sysui_audio_volume', 0.4);
        const init = async () => {
            if (!ctx) {
                try {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return false;
                    ctx = new AC({ latencyHint: 'interactive' });
                    compressor = ctx.createDynamicsCompressor();
                    compressor.threshold.value = -18; compressor.knee.value = 12; compressor.ratio.value = 6;
                    compressor.attack.value = 0.003; compressor.release.value = 0.15;
                    master = ctx.createGain();
                    master.gain.value = volume;
                    const wet = ctx.createGain();
                    wet.gain.value = 0.08;
                    try {
                        reverb = ctx.createConvolver();
                        const len = ctx.sampleRate * 0.6;
                        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
                        for (let ch = 0; ch < 2; ch++) {
                            const d = buf.getChannelData(ch);
                            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
                        }
                        reverb.buffer = buf;
                        master.connect(reverb); reverb.connect(wet); wet.connect(compressor);
                    } catch {}
                    master.connect(compressor);
                    compressor.connect(ctx.destination);
                } catch { return false; }
            }
            if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
            return ctx.state === 'running';
        };
        const tone = async (freq, type, dur, vol, detune = 0, attack = 0.004, filterFreq = null) => {
            if (muted) return;
            if (!(await init())) return;
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = filterFreq ?? freq * 5;
                filter.Q.value = 1.2;
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                osc.detune.setValueAtTime(detune, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
                osc.connect(filter); filter.connect(gain); gain.connect(master);
                osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
                osc.onended = () => { try { osc.disconnect(); filter.disconnect(); gain.disconnect(); } catch {} };
            } catch {}
        };
        const sweep = async (f1, f2, type, dur, vol, curve = 'exp') => {
            if (muted) return;
            if (!(await init())) return;
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(f1, ctx.currentTime);
                if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur);
                else osc.frequency.linearRampToValueAtTime(f2, ctx.currentTime + dur);
                gain.gain.setValueAtTime(vol, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
                osc.connect(gain); gain.connect(master);
                osc.start(); osc.stop(ctx.currentTime + dur + 0.05);
                osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
            } catch {}
        };
        const chord = (freqs, type, dur, vol) => freqs.forEach((f, i) => setTimeout(() => tone(f, type, dur, vol), i * 30));
        const noise = async (dur, vol, filterFreq = 2000) => {
            if (muted) return;
            if (!(await init())) return;
            try {
                const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.8);
                const src = ctx.createBufferSource();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass'; filter.frequency.value = filterFreq; filter.Q.value = 2;
                src.buffer = buf; gain.gain.value = vol;
                src.connect(filter); filter.connect(gain); gain.connect(master);
                src.start();
                src.onended = () => { try { src.disconnect(); filter.disconnect(); gain.disconnect(); } catch {} };
            } catch {}
        };
        const presets = {
            pop: () => tone(880, 'sine', 0.08, 0.08),
            click: () => { tone(1600, 'triangle', 0.03, 0.05); tone(2400, 'sine', 0.02, 0.03, 0, 0.001); },
            tap: () => tone(2200, 'sine', 0.018, 0.035),
            success: () => chord([523.25, 659.25, 783.99, 1046.5], 'sine', 0.25, 0.09),
            error: () => { tone(220, 'sawtooth', 0.18, 0.1, 0, 0.001, 800); setTimeout(() => tone(165, 'sawtooth', 0.22, 0.1, 0, 0.001, 600), 110); },
            open: () => { sweep(280, 880, 'sine', 0.18, 0.07); tone(1760, 'sine', 0.15, 0.04, 0, 0.05); },
            close: () => sweep(880, 280, 'sine', 0.14, 0.06),
            hover: () => tone(2400, 'sine', 0.012, 0.018),
            notify: () => chord([880, 1318.51], 'sine', 0.18, 0.08),
            warn: () => { tone(520, 'triangle', 0.12, 0.09); setTimeout(() => tone(520, 'triangle', 0.12, 0.09), 160); },
            tick: () => tone(2800, 'square', 0.008, 0.018),
            magic: () => { for (let i = 0; i < 5; i++) setTimeout(() => tone(880 + i * 220, 'sine', 0.12, 0.05 - i * 0.008), i * 50); },
            whoosh: () => noise(0.25, 0.06, 1200),
            bell: () => { tone(1760, 'sine', 0.6, 0.08); tone(2640, 'sine', 0.5, 0.04); },
            select: () => { tone(1200, 'sine', 0.04, 0.05); setTimeout(() => tone(1800, 'sine', 0.05, 0.04), 30); },
            delete: () => { sweep(600, 200, 'sawtooth', 0.18, 0.07); noise(0.15, 0.04, 800); },
            swoosh: () => { sweep(400, 1200, 'sine', 0.12, 0.05); noise(0.12, 0.04, 2400); },
            crystal: () => { tone(2093, 'sine', 0.4, 0.05); tone(3136, 'sine', 0.35, 0.03); tone(4186, 'sine', 0.3, 0.02); },
            morph: () => sweep(440, 880, 'triangle', 0.2, 0.05, 'lin'),
            coin: () => { tone(987.77, 'square', 0.07, 0.06); setTimeout(() => tone(1318.51, 'square', 0.18, 0.06), 70); },
            powerup: () => { for (let i = 0; i < 6; i++) setTimeout(() => tone(392 * Math.pow(1.18, i), 'square', 0.09, 0.05), i * 45); },
            laser: () => sweep(1800, 220, 'sawtooth', 0.16, 0.06, 'exp'),
            heartbeat: () => { tone(120, 'sine', 0.12, 0.12); setTimeout(() => tone(110, 'sine', 0.14, 0.1), 180); },
            zen: () => { chord([261.63, 329.63, 392, 523.25], 'sine', 1.2, 0.05); },
            glitch: () => { for (let i = 0; i < 8; i++) setTimeout(() => tone(200 + Math.random() * 2000, 'square', 0.02, 0.03), i * 30); }
        };
        return {
            play: (name) => presets[name]?.(),
            tone, sweep, chord, noise,
            mute: (v) => { muted = !!v; try { localStorage.setItem('sysui_audio_muted', JSON.stringify(muted)); } catch {} Events.emit('audio:mute', muted); },
            isMuted: () => muted,
            setVolume: (v) => { volume = $clamp(v, 0, 1); if (master) master.gain.value = volume; try { localStorage.setItem('sysui_audio_volume', JSON.stringify(volume)); } catch {} },
            getVolume: () => volume
        };
    })();

    const Haptics = {
        light: () => navigator.vibrate?.(8),
        medium: () => navigator.vibrate?.(15),
        heavy: () => navigator.vibrate?.(30),
        success: () => navigator.vibrate?.([10, 30, 10]),
        error: () => navigator.vibrate?.([30, 50, 30, 50, 30]),
        warn: () => navigator.vibrate?.([20, 40, 20]),
        select: () => navigator.vibrate?.(5),
        soft: () => navigator.vibrate?.(3),
        impact: () => navigator.vibrate?.([5, 10, 20])
    };

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
        animations: new Set(),
        observers: new Map(),
        focusStack: [],
        themeMode: $safeJSON('sysui_theme', 'auto'),
        notifications: []
    };

    const Theme = (() => {
        let injected = false;
        const palettes = {
            obsidian: { accent: '#a855f7', pink: '#ec4899', cyan: '#06b6d4' },
            azure: { accent: '#3b82f6', pink: '#06b6d4', cyan: '#22d3ee' },
            emerald: { accent: '#10b981', pink: '#22c55e', cyan: '#14b8a6' },
            crimson: { accent: '#ef4444', pink: '#f97316', cyan: '#f59e0b' },
            solar: { accent: '#f59e0b', pink: '#ef4444', cyan: '#fbbf24' },
            mono: { accent: '#e5e5e5', pink: '#a3a3a3', cyan: '#737373' }
        };
        const apply = (name) => {
            const p = palettes[name] || palettes.obsidian;
            const r = document.documentElement.style;
            r.setProperty('--sys-accent-primary', p.accent);
            r.setProperty('--sys-accent-purple', p.accent);
            r.setProperty('--sys-accent-pink', p.pink);
            r.setProperty('--sys-accent-cyan', p.cyan);
            r.setProperty('--sys-border-glow', Color.alpha(p.accent, 0.3));
            r.setProperty('--sys-gradient-aurora', `linear-gradient(135deg, ${p.accent} 0%, ${p.pink} 50%, ${p.cyan} 100%)`);
            try { localStorage.setItem('sysui_palette', JSON.stringify(name)); } catch {}
            Events.emit('theme:palette', name);
        };
        const inject = () => {
            if (injected || document.getElementById('sys-theme-tokens')) { injected = true; return; }
            const style = document.createElement('style');
            style.id = 'sys-theme-tokens';
            style.textContent = `
                :root {
                    --sys-bg-base: #000000; --sys-bg-surface: #0a0a0a; --sys-bg-elevated: #111111; --sys-bg-overlay: rgba(0,0,0,0.72);
                    --sys-border-subtle: rgba(255,255,255,0.04); --sys-border-base: rgba(255,255,255,0.08); --sys-border-strong: rgba(255,255,255,0.16); --sys-border-glow: rgba(168,85,247,0.3);
                    --sys-text-primary: rgba(255,255,255,0.94); --sys-text-secondary: rgba(255,255,255,0.55); --sys-text-muted: rgba(255,255,255,0.32);
                    --sys-accent-base: #ffffff; --sys-accent-primary: #a855f7; --sys-accent-success: #22c55e; --sys-accent-danger: #ef4444; --sys-accent-warn: #eab308; --sys-accent-info: #3b82f6; --sys-accent-purple: #a855f7; --sys-accent-pink: #ec4899; --sys-accent-cyan: #06b6d4;
                    --sys-radius-xs: 4px; --sys-radius-sm: 6px; --sys-radius-md: 10px; --sys-radius-lg: 16px; --sys-radius-xl: 24px; --sys-radius-2xl: 32px;
                    --sys-dur-instant: 80ms; --sys-dur-micro: 120ms; --sys-dur-fast: 180ms; --sys-dur-normal: 240ms; --sys-dur-emphasized: 340ms; --sys-dur-slow: 480ms; --sys-dur-slower: 680ms;
                    --sys-ease-standard: cubic-bezier(0.2,0,0,1); --sys-ease-emphasized: cubic-bezier(0.3,0,0,1); --sys-ease-decelerate: cubic-bezier(0,0,0,1); --sys-ease-accelerate: cubic-bezier(0.3,0,1,1);
                    --sys-ease-spring: cubic-bezier(0.16,1,0.3,1); --sys-ease-spring-soft: cubic-bezier(0.34,1.26,0.64,1); --sys-ease-spring-bounce: cubic-bezier(0.34,1.56,0.64,1); --sys-ease-spring-snappy: cubic-bezier(0.22,1,0.36,1); --sys-ease-smooth: cubic-bezier(0.4,0,0.2,1); --sys-ease-elastic: cubic-bezier(0.68,-0.4,0.265,1.4);
                    --sys-motion-instant: 80ms; --sys-motion-fast: 180ms; --sys-motion-normal: 240ms; --sys-motion-slow: 480ms; --sys-motion-slower: 680ms; --sys-ease-bounce: cubic-bezier(0.34,1.56,0.64,1); --sys-ease-snap: cubic-bezier(0.22,1,0.36,1);
                    --sys-glow-sm: 0 0 12px rgba(255,255,255,0.1); --sys-glow-md: 0 0 32px rgba(255,255,255,0.15); --sys-glow-lg: 0 0 64px rgba(255,255,255,0.2); --sys-glow-accent: 0 0 32px rgba(168,85,247,0.35);
                    --sys-shadow-xs: 0 1px 2px rgba(0,0,0,0.2); --sys-shadow-sm: 0 2px 8px rgba(0,0,0,0.35); --sys-shadow-md: 0 8px 24px rgba(0,0,0,0.45); --sys-shadow-lg: 0 24px 64px rgba(0,0,0,0.55); --sys-shadow-xl: 0 40px 96px rgba(0,0,0,0.7);
                    --sys-gradient-aurora: linear-gradient(135deg,#a855f7 0%,#ec4899 50%,#06b6d4 100%);
                    --sys-gradient-fire: linear-gradient(135deg,#ef4444 0%,#f59e0b 100%);
                    --sys-gradient-mesh: radial-gradient(at 40% 20%, rgba(168,85,247,0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59,130,246,0.12) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(236,72,153,0.1) 0px, transparent 50%), radial-gradient(at 80% 50%, rgba(6,182,212,0.1) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(168,85,247,0.12) 0px, transparent 50%);
                    --sys-safe-top: env(safe-area-inset-top, 0px); --sys-safe-bottom: env(safe-area-inset-bottom, 0px); --sys-safe-left: env(safe-area-inset-left, 0px); --sys-safe-right: env(safe-area-inset-right, 0px);
                    --sys-fluid-xs: clamp(0.7rem, 0.66rem + 0.2vw, 0.8rem); --sys-fluid-sm: clamp(0.8rem, 0.74rem + 0.3vw, 0.95rem); --sys-fluid-base: clamp(0.95rem, 0.88rem + 0.35vw, 1.1rem); --sys-fluid-lg: clamp(1.2rem, 1.05rem + 0.7vw, 1.6rem); --sys-fluid-xl: clamp(1.8rem, 1.4rem + 2vw, 3rem);
                }
                @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }
                @media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) { .sys-reveal-scroll { animation: sysRevealScroll linear; animation-timeline: view(); animation-range: entry 0% cover 30%; } @keyframes sysRevealScroll { from { opacity: 0; transform: translateY(40px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } } } }
                ::selection { background: rgba(168,85,247,0.35); color: #fff; } ::-moz-selection { background: rgba(168,85,247,0.35); color: #fff; }
                html { scroll-behavior: smooth; } body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; overscroll-behavior-y: none; }
                body::before { content: ""; position: fixed; inset: 0; z-index: -2; pointer-events: none; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='${SVGNS}'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E"); opacity: 0.03; }
                body::after { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none; background: var(--sys-gradient-mesh); animation: sysMeshDrift 30s ease-in-out infinite alternate; will-change: transform; }
                @keyframes sysMeshDrift { 0% { transform: scale(1) rotate(0deg); } 100% { transform: scale(1.15) rotate(8deg); } }
                .sys-glass { background: rgba(10,10,12,0.72); backdrop-filter: blur(28px) saturate(190%); -webkit-backdrop-filter: blur(28px) saturate(190%); border: 1px solid var(--sys-border-base); box-shadow: var(--sys-shadow-md), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.4); will-change: transform, opacity; }
                .sys-glass-strong { background: rgba(14,14,18,0.88); backdrop-filter: blur(48px) saturate(210%); -webkit-backdrop-filter: blur(48px) saturate(210%); border: 1px solid var(--sys-border-strong); box-shadow: var(--sys-shadow-xl), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02); will-change: transform, opacity; }
                .sys-glass-glow { background: rgba(14,14,18,0.85); backdrop-filter: blur(40px) saturate(200%); border: 1px solid rgba(168,85,247,0.25); box-shadow: var(--sys-shadow-lg), 0 0 48px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.08); }
                .sys-glass::before, .sys-glass-strong::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: linear-gradient(135deg, rgba(255,255,255,0.12), transparent 40%, transparent 60%, rgba(255,255,255,0.05)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
                .sys-page-wrap { transition: opacity var(--sys-dur-normal) var(--sys-ease-smooth), transform var(--sys-dur-normal) var(--sys-ease-spring), filter var(--sys-dur-normal); will-change: opacity, transform, filter; transform-origin: center center; }
                .sys-page-exit { opacity: 0; transform: scale(0.97) translateY(6px); filter: blur(6px) brightness(0.7); }
                .sys-page-enter { opacity: 0; transform: scale(1.03) translateY(-6px); filter: blur(3px) brightness(1.1); }
                .sys-page-active { opacity: 1; transform: scale(1) translateY(0); filter: blur(0) brightness(1); }
                .sys-fade-in { animation: sysFadeIn var(--sys-dur-normal) var(--sys-ease-spring) forwards; }
                .sys-slide-up { animation: sysSlideUp var(--sys-dur-emphasized) var(--sys-ease-spring) forwards; }
                .sys-slide-down { animation: sysSlideDown var(--sys-dur-emphasized) var(--sys-ease-spring) forwards; }
                .sys-scale-in { animation: sysScaleIn var(--sys-dur-emphasized) var(--sys-ease-spring-bounce) forwards; transform-origin: center; }
                .sys-rotate-in { animation: sysRotateIn var(--sys-dur-slow) var(--sys-ease-elastic) forwards; }
                .sys-blur-in { animation: sysBlurIn var(--sys-dur-slow) var(--sys-ease-smooth) forwards; }
                .sys-pulse-glow { animation: sysPulseGlow 2.4s ease-in-out infinite; }
                .sys-float { animation: sysFloat 4s ease-in-out infinite; will-change: transform; }
                .sys-breathe { animation: sysBreathe 3s ease-in-out infinite; will-change: transform; }
                .sys-shimmer-text { background: linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 100%); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: sysShimmerText 3s linear infinite; }
                @keyframes sysFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes sysSlideUp { from { transform: translate3d(0,16px,0); opacity: 0; } to { transform: translate3d(0,0,0); opacity: 1; } }
                @keyframes sysSlideDown { from { transform: translate3d(0,-16px,0); opacity: 0; } to { transform: translate3d(0,0,0); opacity: 1; } }
                @keyframes sysScaleIn { from { transform: scale3d(0.92,0.92,1); opacity: 0; } to { transform: scale3d(1,1,1); opacity: 1; } }
                @keyframes sysRotateIn { from { transform: rotate(-12deg) scale(0.8); opacity: 0; } to { transform: rotate(0) scale(1); opacity: 1; } }
                @keyframes sysBlurIn { from { filter: blur(12px); opacity: 0; } to { filter: blur(0); opacity: 1; } }
                @keyframes sysPulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.0); } 50% { box-shadow: 0 0 32px 6px rgba(168,85,247,0.25); } }
                @keyframes sysFloat { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-6px,0); } }
                @keyframes sysBreathe { 0%,100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.04); opacity: 1; } }
                @keyframes sysShimmer { 0% { background-position: -1200px 0; } 100% { background-position: 1200px 0; } }
                @keyframes sysShimmerText { to { background-position: 200% center; } }
                @keyframes sysSpin { to { transform: rotate(360deg); } }
                @keyframes sysOrbit { from { transform: rotate(0deg) translateX(20px) rotate(0deg); } to { transform: rotate(360deg) translateX(20px) rotate(-360deg); } }
                @keyframes sysAuroraShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
                .sys-skeleton-bg { background: linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 75%); background-size: 1200px 100%; animation: sysShimmer 1.8s infinite linear; }
                .sys-magnetic { transition: transform 220ms var(--sys-ease-spring), box-shadow 280ms var(--sys-ease-smooth); will-change: transform; transform-origin: center; }
                .sys-progress { animation: sysProgress linear forwards; transform-origin: left; will-change: transform; }
                @keyframes sysProgress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
                .sys-ripple { position: absolute; border-radius: 50%; transform: scale(0); animation: sysRipple 700ms var(--sys-ease-smooth); background: radial-gradient(circle, rgba(255,255,255,0.45), rgba(255,255,255,0.1) 60%, transparent); pointer-events: none; will-change: transform, opacity; }
                @keyframes sysRipple { to { transform: scale(4.5); opacity: 0; } }
                .sys-no-scroll::-webkit-scrollbar { width: 6px; height: 6px; } .sys-no-scroll::-webkit-scrollbar-track { background: transparent; }
                .sys-no-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(168,85,247,0.4), rgba(168,85,247,0.15)); border-radius: 6px; transition: background 200ms; }
                .sys-no-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(168,85,247,0.7), rgba(168,85,247,0.35)); }
                .sys-spotlight-cursor { position: fixed; top: 0; left: 0; width: 24px; height: 24px; border-radius: 50%; background: radial-gradient(circle, rgba(168,85,247,0.55), transparent 70%); pointer-events: none; mix-blend-mode: screen; transition: width 0.22s var(--sys-ease-spring), height 0.22s var(--sys-ease-spring), background 0.3s; will-change: transform; z-index: 10004; }
                .sys-spotlight-cursor::after { content: ""; position: absolute; inset: -20px; border-radius: 50%; background: radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%); animation: sysBreathe 2.4s ease-in-out infinite; }
                .sys-cursor-trail { position: fixed; width: 6px; height: 6px; border-radius: 50%; background: rgba(168,85,247,0.6); pointer-events: none; z-index: 10003; mix-blend-mode: screen; will-change: transform, opacity; }
                .sys-tooltip { position: fixed; padding: 7px 11px; background: rgba(0,0,0,0.96); border: 1px solid rgba(168,85,247,0.28); border-radius: 8px; font-size: 11px; color: rgba(255,255,255,0.95); pointer-events: none; white-space: nowrap; z-index: 10005; opacity: 0; transform: translateY(6px) scale(0.94); transition: opacity 200ms var(--sys-ease-spring), transform 240ms var(--sys-ease-spring-bounce); box-shadow: var(--sys-shadow-md), 0 0 20px rgba(168,85,247,0.22); font-weight: 500; letter-spacing: 0.01em; will-change: transform, opacity; }
                .sys-tooltip.sys-tooltip-show { opacity: 1; transform: translateY(0) scale(1); }
                .sys-focus-ring:focus-visible, button:focus-visible, [role="button"]:focus-visible, a:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 2px solid rgba(168,85,247,0.7); outline-offset: 3px; border-radius: 4px; transition: outline-offset 180ms var(--sys-ease-spring); }
                button, [role="button"] { position: relative; overflow: hidden; }
                .sys-particle { position: fixed; pointer-events: none; border-radius: 50%; will-change: transform, opacity; }
                .sys-aurora-text { background: var(--sys-gradient-aurora); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: sysShimmerText 4s linear infinite; }
                .sys-grid-bg { background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 32px 32px; }
                .sys-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.1); border-top-color: var(--sys-accent-primary); border-radius: 50%; animation: sysSpin 0.7s linear infinite; will-change: transform; }
                .sys-button-press { transition: transform 100ms var(--sys-ease-spring-snappy), filter 150ms; will-change: transform; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
                .sys-button-press:active { transform: scale(0.95); filter: brightness(0.92); }
                @media (hover: hover) and (pointer: fine) { .sys-button-press:hover { transform: translateY(-1px); } .sys-elevate:hover { transform: translateY(-3px); box-shadow: var(--sys-shadow-lg); } .sys-bloom:hover::before { opacity: 1; } .sys-shimmer-sweep:hover::after { animation: sysSweep 900ms var(--sys-ease-smooth); } }
                .sys-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.1); border-bottom-width: 2px; border-radius: 4px; font-size: 10px; font-family: ui-monospace, monospace; color: rgba(255,255,255,0.7); letter-spacing: 0.05em; transition: transform 80ms var(--sys-ease-spring-snappy); }
                .sys-kbd:active { transform: translateY(1px); border-bottom-width: 1px; }
                .sys-divider-glow { height: 1px; background: linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent); }
                .sys-toast-enter { animation: sysToastIn 460ms var(--sys-ease-spring-bounce) forwards; }
                .sys-toast-exit { animation: sysToastOut 280ms var(--sys-ease-accelerate) forwards; }
                @keyframes sysToastIn { 0% { transform: translate3d(0,-36px,0) scale(0.82); opacity: 0; filter: blur(4px); } 60% { transform: translate3d(0,4px,0) scale(1.025); opacity: 1; filter: blur(0); } 100% { transform: translate3d(0,0,0) scale(1); opacity: 1; } }
                @keyframes sysToastOut { to { transform: translate3d(0,-20px,0) scale(0.88); opacity: 0; filter: blur(3px); } }
                .sys-noise-overlay::before { content: ""; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='${SVGNS}'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); opacity: 0.04; pointer-events: none; mix-blend-mode: overlay; border-radius: inherit; }
                .sys-glow-border { position: relative; }
                .sys-glow-border::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; background: conic-gradient(from var(--sys-glow-angle, 0deg), transparent, rgba(168,85,247,0.6), rgba(236,72,153,0.6), rgba(6,182,212,0.6), transparent 60%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; animation: sysGlowRotate 6s linear infinite; }
                @property --sys-glow-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
                @keyframes sysGlowRotate { to { --sys-glow-angle: 360deg; } }
                .sys-shimmer-sweep { position: relative; overflow: hidden; }
                .sys-shimmer-sweep::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%); transform: translateX(-100%); pointer-events: none; }
                @keyframes sysSweep { to { transform: translateX(100%); } }
                .sys-tilt { transform-style: preserve-3d; transition: transform 280ms var(--sys-ease-spring); will-change: transform; }
                .sys-overlay-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0); backdrop-filter: blur(0); -webkit-backdrop-filter: blur(0); transition: background var(--sys-dur-normal) var(--sys-ease-standard), backdrop-filter var(--sys-dur-normal) var(--sys-ease-standard), -webkit-backdrop-filter var(--sys-dur-normal) var(--sys-ease-standard); pointer-events: none; will-change: backdrop-filter, background; }
                .sys-overlay-backdrop.sys-open { background: rgba(0,0,0,0.76); backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%); pointer-events: auto; }
                .sys-drawer { position: fixed; background: rgba(10,10,12,0.92); backdrop-filter: blur(40px) saturate(200%); border: 1px solid var(--sys-border-strong); box-shadow: var(--sys-shadow-xl); transition: transform var(--sys-dur-emphasized) var(--sys-ease-spring); will-change: transform; }
                .sys-accordion-content { overflow: hidden; transition: grid-template-rows var(--sys-dur-emphasized) var(--sys-ease-spring); display: grid; grid-template-rows: 0fr; }
                .sys-accordion-content.sys-open { grid-template-rows: 1fr; }
                .sys-accordion-content > div { overflow: hidden; min-height: 0; }
                .sys-icon-spin { animation: sysSpin 0.7s linear infinite; }
                .sys-tab-indicator { position: absolute; bottom: 0; height: 2px; background: var(--sys-accent-primary); border-radius: 2px; box-shadow: 0 0 8px var(--sys-accent-primary); transition: transform var(--sys-dur-emphasized) var(--sys-ease-spring), width var(--sys-dur-emphasized) var(--sys-ease-spring); will-change: transform, width; }
                .sys-elevate { transition: transform 280ms var(--sys-ease-spring), box-shadow 320ms var(--sys-ease-smooth); will-change: transform, box-shadow; }
                .sys-bloom { position: relative; }
                .sys-bloom::before { content: ""; position: absolute; inset: -20%; background: radial-gradient(circle at center, rgba(168,85,247,0.3), transparent 60%); opacity: 0; transition: opacity 400ms; pointer-events: none; filter: blur(20px); z-index: -1; }
                .sys-iridescent { background: linear-gradient(135deg,#a855f7,#ec4899,#06b6d4,#a855f7); background-size: 300% 300%; animation: sysAuroraShift 8s ease infinite; }
                .sys-sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 88vh; border-radius: 26px 26px 0 0; padding-bottom: calc(16px + var(--sys-safe-bottom)); transform: translateY(100%); transition: transform var(--sys-dur-emphasized) var(--sys-ease-spring); will-change: transform; touch-action: pan-y; display: flex; flex-direction: column; }
                .sys-sheet.sys-open { transform: translateY(0); }
                .sys-sheet-handle { width: 40px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.25); margin: 10px auto 6px; flex-shrink: 0; }
                .sys-segment { display: inline-flex; padding: 3px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--sys-border-base); position: relative; }
                .sys-segment-thumb { position: absolute; top: 3px; bottom: 3px; border-radius: 9px; background: rgba(255,255,255,0.1); box-shadow: var(--sys-shadow-sm); transition: transform var(--sys-dur-fast) var(--sys-ease-spring), width var(--sys-dur-fast) var(--sys-ease-spring); }
                .sys-switch { width: 44px; height: 26px; border-radius: 999px; background: rgba(255,255,255,0.1); border: 1px solid var(--sys-border-base); position: relative; cursor: pointer; transition: background var(--sys-dur-fast); flex-shrink: 0; }
                .sys-switch.sys-on { background: var(--sys-accent-primary); }
                .sys-switch-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: var(--sys-shadow-sm); transition: transform var(--sys-dur-fast) var(--sys-ease-spring-bounce); }
                .sys-switch.sys-on .sys-switch-knob { transform: translateX(18px); }
                @media (max-width: 640px) { .sys-hide-mobile { display: none !important; } .sys-glass, .sys-glass-strong { backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); } }
                @media (min-width: 641px) { .sys-show-mobile { display: none !important; } }
                .sys-matrix-canvas { position: fixed; inset: 0; z-index: -1; opacity: 0.5; pointer-events: none; }
            `;
            document.head.appendChild(style);
            injected = true;
            const saved = $safeJSON('sysui_palette', null);
            if (saved) apply(saved);
        };
        return { inject, palettes, apply };
    })();

    const DOM = {
        mount: (id, zIndex, className) => {
            let el = document.getElementById(id);
            if (!el) { el = document.createElement('div'); el.id = id; el.style.zIndex = zIndex; el.className = className; document.body.appendChild(el); }
            return el;
        },
        create: (tag, attrs = {}, children = []) => {
            const el = document.createElement(tag);
            for (const k in attrs) {
                const v = attrs[k];
                if (k === 'class') el.className = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
                else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
                else if (k === 'dataset') Object.assign(el.dataset, v);
                else if (k === 'text') el.textContent = v;
                else if (k === 'html') el.innerHTML = v;
                else if (k === 'ref' && typeof v === 'function') v(el);
                else el.setAttribute(k, v);
            }
            const arr = Array.isArray(children) ? children : [children];
            for (const c of arr) { if (c == null) continue; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
            return el;
        },
        svg: (html, cls = '') => { const w = document.createElement('span'); w.className = cls; w.innerHTML = html; return w; },
        inert: (el, on) => { if (!el) return; if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); } },
        siblingsInert: (target, on) => { Array.from(document.body.children).forEach(c => { if (c === target || c.id?.startsWith('sys-')) return; DOM.inert(c, on); }); },
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
            if (focusable.length) setTimeout(() => focusable[0].focus(), 80);
            return () => container.removeEventListener('keydown', handler);
        },
        pushOverlay: (id, closeCb) => {
            if (!State.activeOverlays.length) State.previousFocus = document.activeElement;
            State.activeOverlays.push({ id, closeCb });
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = (window.innerWidth - document.documentElement.clientWidth) + 'px';
        },
        popOverlay: () => {
            const overlay = State.activeOverlays.pop();
            if (!State.activeOverlays.length) {
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
                if (State.previousFocus?.focus) try { State.previousFocus.focus(); } catch {}
            }
            return overlay;
        },
        addRipple: (e, el) => {
            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const ripple = document.createElement('span');
            ripple.className = 'sys-ripple';
            const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
            const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
            ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 700);
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && State.activeOverlays.length > 0) {
            e.preventDefault();
            const top = DOM.popOverlay();
            if (top?.closeCb) top.closeCb();
        }
    });

    const Input = (() => {
        const mqHover = matchMedia('(hover: hover)');
        const mqFine = matchMedia('(pointer: fine)');
        const mqCoarse = matchMedia('(pointer: coarse)');
        const isTouchDevice = () => mqCoarse.matches || ('ontouchstart' in window) || navigator.maxT
