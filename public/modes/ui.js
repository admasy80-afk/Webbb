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
    const $easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    const $easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const $prm = matchMedia('(prefers-reduced-motion: reduce)');
    const $isTouch = matchMedia('(pointer: coarse)').matches;
    const $isHighRefresh = matchMedia('(min-resolution: 120dpi)').matches;
    const $isMobile = matchMedia('(max-width: 768px)').matches;
    const $isSmallMobile = matchMedia('(max-width: 480px)').matches;
    let $reducedMotion = $prm.matches;
    $prm.addEventListener?.('change', e => { $reducedMotion = e.matches; });

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
                anticipate: 'cubic-bezier(0.75, -0.5, 0.25, 1.5)',
                gravity: 'cubic-bezier(0.5, 0, 0.75, 0)',
                liquid: 'cubic-bezier(0.45, 0, 0.15, 1)'
            },
            spring: {
                gentle: { stiffness: 120, damping: 14, mass: 1 },
                wobbly: { stiffness: 180, damping: 12, mass: 1 },
                stiff: { stiffness: 300, damping: 22, mass: 1 },
                slow: { stiffness: 80, damping: 20, mass: 1 },
                snappy: { stiffness: 400, damping: 28, mass: 1 },
                bouncy: { stiffness: 260, damping: 9, mass: 1.1 },
                molasses: { stiffness: 60, damping: 30, mass: 1.5 },
                ethereal: { stiffness: 200, damping: 18, mass: 0.8 }
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
            const dur = 1;
            for (let i = 0; i <= steps; i++) {
                const t = (i / steps) * dur;
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
            for (let i = 0; i < els.length; i++) {
                promises.push(new Promise(r => setTimeout(() => { fn(els[i], i); r(); }, reduce(i * gap))));
            }
            return Promise.all(promises);
        };

        const enter = {
            fade: (el, opts = {}) => animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: tokens.duration.normal, easing: tokens.ease.standard, ...opts }),
            scale: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideUp: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideDown: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideLeft: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateX(20px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            slideRight: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: tokens.duration.emphasized, easing: tokens.ease.spring, ...opts }),
            pop: (el, opts = {}) => spring(el, { transform: ['scale(0.85)', 'scale(1)'], opacity: [0, 1] }, 'bouncy'),
            blur: (el, opts = {}) => animate(el, [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: tokens.duration.slow, easing: tokens.ease.smooth, ...opts }),
            liquid: (el, opts = {}) => animate(el, [{ opacity: 0, transform: 'scale(0.6) rotate(-8deg)', filter: 'blur(20px)' }, { opacity: 1, transform: 'scale(1) rotate(0)', filter: 'blur(0)' }], { duration: tokens.duration.slow, easing: tokens.ease.elastic, ...opts })
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
            { transform: 'rotate(0deg) scale(1)' },
            { transform: 'rotate(-3deg) scale(1.02)' },
            { transform: 'rotate(3deg) scale(1.02)' },
            { transform: 'rotate(-2deg) scale(1.01)' },
            { transform: 'rotate(2deg) scale(1.01)' },
            { transform: 'rotate(0deg) scale(1)' }
        ], { duration: 600, easing: tokens.ease.springSoft });

        const flip = (el, from, to) => {
            if ($reducedMotion) return Promise.resolve();
            const dx = from.left - to.left, dy = from.top - to.top;
            const sx = from.width / to.width, sy = from.height / to.height;
            return animate(el, [
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                { transform: 'translate(0, 0) scale(1, 1)' }
            ], { duration: tokens.duration.emphasized, easing: tokens.ease.spring });
        };

        const morph = (el, from, to, opts = {}) => animate(el, [
            { clipPath: from },
            { clipPath: to }
        ], { duration: tokens.duration.slow, easing: tokens.ease.liquid, ...opts });

        return { tokens, animate, spring, stagger, enter, exit, shake, pulse, wobble, flip, morph, reduce, springCurve };
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
                    compressor.threshold.value = -18;
                    compressor.knee.value = 12;
                    compressor.ratio.value = 6;
                    compressor.attack.value = 0.003;
                    compressor.release.value = 0.15;
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
                filter.type = 'bandpass';
                filter.frequency.value = filterFreq;
                filter.Q.value = 2;
                src.buffer = buf;
                gain.gain.value = vol;
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
            scroll: () => tone(3200, 'sine', 0.006, 0.012),
            slide: () => { sweep(800, 1400, 'sine', 0.08, 0.03); }
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
        themeMode: $safeJSON('sysui_theme', 'auto')
    };

    const Theme = (() => {
        let injected = false;
        const palettes = {
            obsidian: { accent: '#a855f7', bg: '#000000', surface: '#0a0a0a' },
            azure: { accent: '#3b82f6', bg: '#000814', surface: '#001233' },
            emerald: { accent: '#10b981', bg: '#000a06', surface: '#001f12' },
            crimson: { accent: '#ef4444', bg: '#0a0000', surface: '#1f0606' },
            solar: { accent: '#f59e0b', bg: '#0a0700', surface: '#1f1500' }
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
                    --sys-text-primary: rgba(255, 255, 255, 0.94);
                    --sys-text-secondary: rgba(255, 255, 255, 0.55);
                    --sys-text-muted: rgba(255, 255, 255, 0.32);
                    --sys-accent-base: #ffffff;
                    --sys-accent-primary: #a855f7;
                    --sys-accent-success: #22c55e;
                    --sys-accent-danger: #ef4444;
                    --sys-accent-warn: #eab308;
                    --sys-accent-info: #3b82f6;
                    --sys-accent-purple: #a855f7;
                    --sys-accent-pink: #ec4899;
                    --sys-accent-cyan: #06b6d4;
                    --sys-radius-xs: 4px;
                    --sys-radius-sm: 6px;
                    --sys-radius-md: 10px;
                    --sys-radius-lg: 16px;
                    --sys-radius-xl: 24px;
                    --sys-radius-2xl: 32px;
                    --sys-dur-instant: 80ms;
                    --sys-dur-micro: 120ms;
                    --sys-dur-fast: 180ms;
                    --sys-dur-normal: 240ms;
                    --sys-dur-emphasized: 340ms;
                    --sys-dur-slow: 480ms;
                    --sys-dur-slower: 680ms;
                    --sys-ease-standard: cubic-bezier(0.2, 0, 0, 1);
                    --sys-ease-emphasized: cubic-bezier(0.3, 0, 0, 1);
                    --sys-ease-decelerate: cubic-bezier(0, 0, 0, 1);
                    --sys-ease-accelerate: cubic-bezier(0.3, 0, 1, 1);
                    --sys-ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
                    --sys-ease-spring-soft: cubic-bezier(0.34, 1.26, 0.64, 1);
                    --sys-ease-spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
                    --sys-ease-spring-snappy: cubic-bezier(0.22, 1, 0.36, 1);
                    --sys-ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
                    --sys-ease-elastic: cubic-bezier(0.68, -0.4, 0.265, 1.4);
                    --sys-ease-liquid: cubic-bezier(0.45, 0, 0.15, 1);
                    --sys-motion-instant: 80ms;
                    --sys-motion-fast: 180ms;
                    --sys-motion-normal: 240ms;
                    --sys-motion-slow: 480ms;
                    --sys-motion-slower: 680ms;
                    --sys-ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
                    --sys-ease-snap: cubic-bezier(0.22, 1, 0.36, 1);
                    --sys-glow-sm: 0 0 12px rgba(255, 255, 255, 0.1);
                    --sys-glow-md: 0 0 32px rgba(255, 255, 255, 0.15);
                    --sys-glow-lg: 0 0 64px rgba(255, 255, 255, 0.2);
                    --sys-glow-accent: 0 0 32px rgba(168, 85, 247, 0.35);
                    --sys-shadow-xs: 0 1px 2px rgba(0,0,0,0.2);
                    --sys-shadow-sm: 0 2px 8px rgba(0,0,0,0.35);
                    --sys-shadow-md: 0 8px 24px rgba(0,0,0,0.45);
                    --sys-shadow-lg: 0 24px 64px rgba(0,0,0,0.55);
                    --sys-shadow-xl: 0 40px 96px rgba(0,0,0,0.7);
                    --sys-gradient-aurora: linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #06b6d4 100%);
                    --sys-gradient-fire: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%);
                    --sys-gradient-ocean: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%);
                    --sys-gradient-sunset: linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #ec4899 100%);
                    --sys-gradient-mesh: radial-gradient(at 40% 20%, rgba(168,85,247,0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59,130,246,0.12) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(236,72,153,0.1) 0px, transparent 50%), radial-gradient(at 80% 50%, rgba(6,182,212,0.1) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(168,85,247,0.12) 0px, transparent 50%);
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
                    }
                }
                ::selection { background: rgba(168, 85, 247, 0.35); color: #fff; }
                ::-moz-selection { background: rgba(168, 85, 247, 0.35); color: #fff; }
                html { scroll-behavior: smooth; }
                body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
                body::before {
                    content: ""; position: fixed; inset: 0; z-index: -2; pointer-events: none;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='[w3.org](http://www.w3.org/2000/svg)'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
                    opacity: 0.03;
                }
                body::after {
                    content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
                    background: var(--sys-gradient-mesh);
                    animation: sysMeshDrift 30s ease-in-out infinite alternate;
                    will-change: transform;
                }
                @keyframes sysMeshDrift { 0% { transform: scale(1) rotate(0deg); } 100% { transform: scale(1.15) rotate(8deg); } }
                .sys-glass {
                    background: rgba(10, 10, 12, 0.72);
                    backdrop-filter: blur(28px) saturate(190%);
                    -webkit-backdrop-filter: blur(28px) saturate(190%);
                    border: 1px solid var(--sys-border-base);
                    box-shadow: var(--sys-shadow-md), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.4);
                    will-change: transform, opacity;
                }
                .sys-glass-strong {
                    background: rgba(14, 14, 18, 0.88);
                    backdrop-filter: blur(48px) saturate(210%);
                    -webkit-backdrop-filter: blur(48px) saturate(210%);
                    border: 1px solid var(--sys-border-strong);
                    box-shadow: var(--sys-shadow-xl), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02);
                    will-change: transform, opacity;
                }
                .sys-glass-glow {
                    background: rgba(14, 14, 18, 0.85);
                    backdrop-filter: blur(40px) saturate(200%);
                    border: 1px solid rgba(168, 85, 247, 0.25);
                    box-shadow: var(--sys-shadow-lg), 0 0 48px rgba(168, 85, 247, 0.18), inset 0 1px 0 rgba(255,255,255,0.08);
                }
                .sys-glass::before, .sys-glass-strong::before {
                    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.12), transparent 40%, transparent 60%, rgba(255,255,255,0.05));
                    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                    -webkit-mask-composite: xor; mask-composite: exclude;
                    pointer-events: none;
                }
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
                @keyframes sysSlideUp { from { transform: translate3d(0, 16px, 0); opacity: 0; } to { transform: translate3d(0, 0, 0); opacity: 1; } }
                @keyframes sysSlideDown { from { transform: translate3d(0, -16px, 0); opacity: 0; } to { transform: translate3d(0, 0, 0); opacity: 1; } }
                @keyframes sysScaleIn { from { transform: scale3d(0.92, 0.92, 1); opacity: 0; } to { transform: scale3d(1, 1, 1); opacity: 1; } }
                @keyframes sysRotateIn { from { transform: rotate(-12deg) scale(0.8); opacity: 0; } to { transform: rotate(0) scale(1); opacity: 1; } }
                @keyframes sysBlurIn { from { filter: blur(12px); opacity: 0; } to { filter: blur(0); opacity: 1; } }
                @keyframes sysPulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.0); } 50% { box-shadow: 0 0 32px 6px rgba(168,85,247,0.25); } }
                @keyframes sysFloat { 0%,100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -6px, 0); } }
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
                .sys-no-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
                .sys-no-scroll::-webkit-scrollbar-track { background: transparent; }
                .sys-no-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(168,85,247,0.4), rgba(168,85,247,0.15)); border-radius: 6px; transition: background 200ms; }
                .sys-no-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(168,85,247,0.7), rgba(168,85,247,0.35)); }
                .sys-spotlight-cursor { position: fixed; top: 0; left: 0; width: 24px; height: 24px; border-radius: 50%; background: radial-gradient(circle, rgba(168,85,247,0.55), transparent 70%); pointer-events: none; mix-blend-mode: screen; transition: width 0.22s var(--sys-ease-spring), height 0.22s var(--sys-ease-spring), background 0.3s; will-change: transform; z-index: 10004; }
                .sys-spotlight-cursor::after { content: ""; position: absolute; inset: -20px; border-radius: 50%; background: radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%); animation: sysBreathe 2.4s ease-in-out infinite; }
                .sys-cursor-trail { position: fixed; width: 6px; height: 6px; border-radius: 50%; background: rgba(168,85,247,0.6); pointer-events: none; z-index: 10003; mix-blend-mode: screen; will-change: transform, opacity; }
                .sys-tooltip { position: fixed; padding: 7px 11px; background: rgba(0,0,0,0.96); border: 1px solid rgba(168,85,247,0.28); border-radius: 8px; font-size: 11px; color: rgba(255,255,255,0.95); pointer-events: none; white-space: nowrap; z-index: 10005; opacity: 0; transform: translateY(6px) scale(0.94); transition: opacity 200ms var(--sys-ease-spring), transform 240ms var(--sys-ease-spring-bounce); box-shadow: var(--sys-shadow-md), 0 0 20px rgba(168,85,247,0.22); font-weight: 500; letter-spacing: 0.01em; will-change: transform, opacity; }
                .sys-tooltip.sys-tooltip-show { opacity: 1; transform: translateY(0) scale(1); }
                .sys-tooltip::before { content: ""; position: absolute; width: 8px; height: 8px; background: inherit; border: inherit; border-right: 0; border-top: 0; }
                .sys-tooltip[data-placement="top"]::before { bottom: -5px; left: 50%; transform: translateX(-50%) rotate(-45deg); border-left: 0; border-bottom: 1px solid rgba(168,85,247,0.28); border-right: 1px solid rgba(168,85,247,0.28); border-top: 0; }
                .sys-focus-ring:focus-visible { outline: 2px solid rgba(168, 85, 247, 0.7); outline-offset: 3px; border-radius: 4px; transition: outline-offset 180ms var(--sys-ease-spring); }
                button, [role="button"] { position: relative; overflow: hidden; }
                .sys-particle { position: fixed; pointer-events: none; border-radius: 50%; will-change: transform, opacity; }
                .sys-aurora-text { background: var(--sys-gradient-aurora); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: sysShimmerText 4s linear infinite; }
                .sys-grid-bg { background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 32px 32px; }
                .sys-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.1); border-top-color: var(--sys-accent-primary); border-radius: 50%; animation: sysSpin 0.7s linear infinite; will-change: transform; }
                .sys-button-press { transition: transform 100ms var(--sys-ease-spring-snappy), filter 150ms; will-change: transform; }
                .sys-button-press:active { transform: scale(0.95); filter: brightness(0.92); }
                .sys-button-press:hover { transform: translateY(-1px); }
                .sys-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.1); border-bottom-width: 2px; border-radius: 4px; font-size: 10px; font-family: ui-monospace, monospace; color: rgba(255,255,255,0.7); letter-spacing: 0.05em; transition: transform 80ms var(--sys-ease-spring-snappy); }
                .sys-kbd:active { transform: translateY(1px); border-bottom-width: 1px; }
                .sys-divider-glow { height: 1px; background: linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent); }
                .sys-toast-enter { animation: sysToastIn 460ms var(--sys-ease-spring-bounce) forwards; }
                .sys-toast-exit { animation: sysToastOut 280ms var(--sys-ease-accelerate) forwards; }
                @keyframes sysToastIn { 0% { transform: translate3d(0, -36px, 0) scale(0.82); opacity: 0; filter: blur(4px); } 60% { transform: translate3d(0, 4px, 0) scale(1.025); opacity: 1; filter: blur(0); } 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; } }
                @keyframes sysToastOut { to { transform: translate3d(0, -20px, 0) scale(0.88); opacity: 0; filter: blur(3px); } }
                .sys-noise-overlay::before { content: ""; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='[w3.org](http://www.w3.org/2000/svg)'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); opacity: 0.04; pointer-events: none; mix-blend-mode: overlay; border-radius: inherit; }
                .sys-glow-border { position: relative; }
                .sys-glow-border::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; background: conic-gradient(from var(--sys-glow-angle, 0deg), transparent, rgba(168,85,247,0.6), rgba(236,72,153,0.6), rgba(6,182,212,0.6), transparent 60%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; animation: sysGlowRotate 6s linear infinite; }
                @property --sys-glow-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
                @keyframes sysGlowRotate { to { --sys-glow-angle: 360deg; } }
                .sys-shimmer-sweep { position: relative; overflow: hidden; }
                .sys-shimmer-sweep::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%); transform: translateX(-100%); pointer-events: none; }
                .sys-shimmer-sweep:hover::after { animation: sysSweep 900ms var(--sys-ease-smooth); }
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
                .sys-list-item-enter { animation: sysListItemIn 320ms var(--sys-ease-spring) backwards; }
                @keyframes sysListItemIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
                .sys-flip-card { transform-style: preserve-3d; transition: transform 600ms var(--sys-ease-spring); }
                .sys-flip-card.sys-flipped { transform: rotateY(180deg); }
                .sys-elevate { transition: transform 280ms var(--sys-ease-spring), box-shadow 320ms var(--sys-ease-smooth); will-change: transform, box-shadow; }
                .sys-elevate:hover { transform: translateY(-3px); box-shadow: var(--sys-shadow-lg); }
                .sys-bloom { position: relative; }
                .sys-bloom::before { content: ""; position: absolute; inset: -20%; background: radial-gradient(circle at center, rgba(168,85,247,0.3), transparent 60%); opacity: 0; transition: opacity 400ms; pointer-events: none; filter: blur(20px); z-index: -1; }
                .sys-bloom:hover::before { opacity: 1; }
                @keyframes sysGlowPulse { 0%,100% { box-shadow: 0 0 20px rgba(168,85,247,0.2), 0 0 40px rgba(168,85,247,0.1); } 50% { box-shadow: 0 0 30px rgba(168,85,247,0.4), 0 0 60px rgba(168,85,247,0.2); } }
                .sys-iridescent { background: linear-gradient(135deg, #a855f7, #ec4899, #06b6d4, #a855f7); background-size: 300% 300%; animation: sysAuroraShift 8s ease infinite; }

                .sys-tabs-scroller {
                    display: flex !important;
                    flex-wrap: nowrap !important;
                    gap: 0.5rem;
                    overflow-x: auto !important;
                    overflow-y: hidden;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                    -webkit-overflow-scrolling: touch;
                    scroll-snap-type: x proximity;
                    scroll-padding: 0 1rem;
                    padding: 0.5rem 1rem 0.75rem 1rem;
                    mask-image: linear-gradient(to left, transparent 0%, black 4%, black 96%, transparent 100%);
                    -webkit-mask-image: linear-gradient(to left, transparent 0%, black 4%, black 96%, transparent 100%);
                    position: relative;
                    width: 100%;
                    max-width: 100vw;
                    box-sizing: border-box;
                    overscroll-behavior-x: contain;
                    scroll-behavior: smooth;
                }
                .sys-tabs-scroller::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                .sys-tabs-scroller > * {
                    flex: 0 0 auto !important;
                    white-space: nowrap !important;
                    word-break: keep-all !important;
                    overflow-wrap: normal !important;
                    -webkit-hyphens: none !important;
                    hyphens: none !important;
                    text-overflow: clip !important;
                    min-width: max-content !important;
                    width: auto !important;
                    scroll-snap-align: start;
                    padding: 0.6rem 1.1rem;
                    border-radius: 0.75rem;
                    font-size: 0.875rem;
                    line-height: 1.4;
                    transition: all 220ms cubic-bezier(0.16, 1, 0.3, 1);
                    cursor: pointer;
                    user-select: none;
                    position: relative;
                    direction: rtl;
                    unicode-bidi: plaintext;
                }
                @media (max-width: 768px) {
                    .sys-tabs-scroller { padding: 0.5rem 0.75rem; gap: 0.4rem; }
                    .sys-tabs-scroller > * { padding: 0.55rem 0.9rem; font-size: 0.825rem; }
                }
                @media (max-width: 480px) {
                    .sys-tabs-scroller { padding: 0.5rem 0.5rem; gap: 0.35rem; mask-image: linear-gradient(to left, transparent 0%, black 6%, black 94%, transparent 100%); -webkit-mask-image: linear-gradient(to left, transparent 0%, black 6%, black 94%, transparent 100%); }
                    .sys-tabs-scroller > * { padding: 0.5rem 0.85rem; font-size: 0.8rem; }
                }
                .sys-tab-arrow {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, rgba(20,20,24,0.95), rgba(10,10,14,0.95));
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 50%;
                    color: rgba(255,255,255,0.85);
                    cursor: pointer;
                    z-index: 5;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 240ms var(--sys-ease-spring), transform 220ms var(--sys-ease-spring);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                }
                .sys-tab-arrow.sys-visible { opacity: 1; pointer-events: auto; }
                .sys-tab-arrow:hover { transform: translateY(-50%) scale(1.1); background: linear-gradient(135deg, rgba(168,85,247,0.3), rgba(236,72,153,0.2)); border-color: rgba(168,85,247,0.5); }
                .sys-tab-arrow.sys-tab-arrow-left { left: 4px; }
                .sys-tab-arrow.sys-tab-arrow-right { right: 4px; }
                @media (max-width: 480px) { .sys-tab-arrow { display: none; } }

                * { -webkit-tap-highlight-color: transparent; }
                @media (max-width: 768px) {
                    button, [role="button"], a, input, select, textarea { min-height: 40px; }
                }

                .sys-cmd-mobile {
                    padding-top: 8vh !important;
                }
                @media (max-width: 480px) {
                    .sys-cmd-mobile { padding-top: 4vh !important; padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
                }

                .sys-magnetic-glow {
                    position: absolute;
                    pointer-events: none;
                    width: 200px;
                    height: 200px;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(168,85,247,0.18), transparent 60%);
                    opacity: 0;
                    transition: opacity 300ms;
                    mix-blend-mode: screen;
                    z-index: -1;
                    filter: blur(20px);
                }

                .sys-particle-trail {
                    position: fixed;
                    pointer-events: none;
                    border-radius: 50%;
                    background: radial-gradient(circle, currentColor, transparent 70%);
                    will-change: transform, opacity;
                    z-index: 10003;
                    mix-blend-mode: screen;
                }

                @keyframes sysGlitch {
                    0%,100% { transform: translate(0); filter: hue-rotate(0deg); }
                    20% { transform: translate(-2px, 2px); filter: hue-rotate(90deg); }
                    40% { transform: translate(-2px, -2px); filter: hue-rotate(180deg); }
                    60% { transform: translate(2px, 2px); filter: hue-rotate(270deg); }
                    80% { transform: translate(2px, -2px); filter: hue-rotate(360deg); }
                }
                .sys-glitch { animation: sysGlitch 300ms steps(2) infinite; }

                @keyframes sysNeonPulse {
                    0%,100% { text-shadow: 0 0 8px currentColor, 0 0 16px currentColor; }
                    50% { text-shadow: 0 0 16px currentColor, 0 0 32px currentColor, 0 0 48px currentColor; }
                }
                .sys-neon { animation: sysNeonPulse 2s ease-in-out infinite; }

                .sys-3d-card {
                    transform-style: preserve-3d;
                    perspective: 1000px;
                    transition: transform 400ms var(--sys-ease-spring);
                }
                .sys-3d-card-inner {
                    transform-style: preserve-3d;
                    transition: transform 400ms var(--sys-ease-spring);
                }

                .sys-liquid-button {
                    position: relative;
                    overflow: hidden;
                    isolation: isolate;
                }
                .sys-liquid-button::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(168,85,247,0.4), transparent 50%);
                    opacity: 0;
                    transition: opacity 280ms;
                    z-index: -1;
                }
                .sys-liquid-button:hover::before { opacity: 1; }

                @keyframes sysOrbitalRing {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .sys-orbital-ring {
                    position: absolute;
                    inset: -8px;
                    border: 1px dashed rgba(168,85,247,0.3);
                    border-radius: inherit;
                    animation: sysOrbitalRing 12s linear infinite;
                    pointer-events: none;
                }

                .sys-snap-y { scroll-snap-type: y mandatory; }
                .sys-snap-item { scroll-snap-align: start; }

                .sys-stagger-child { opacity: 0; transform: translateY(20px); animation: sysStaggerIn 500ms var(--sys-ease-spring) forwards; }
                @keyframes sysStaggerIn { to { opacity: 1; transform: translateY(0); } }

                @keyframes sysHeartbeat {
                    0%,100% { transform: scale(1); }
                    14% { transform: scale(1.1); }
                    28% { transform: scale(1); }
                    42% { transform: scale(1.1); }
                    70% { transform: scale(1); }
                }
                .sys-heartbeat { animation: sysHeartbeat 1.5s ease-in-out infinite; }

                .sys-blob {
                    border-radius: 64% 36% 27% 73% / 55% 58% 42% 45%;
                    animation: sysBlobMorph 8s ease-in-out infinite;
                }
                @keyframes sysBlobMorph {
                    0%,100% { border-radius: 64% 36% 27% 73% / 55% 58% 42% 45%; }
                    25% { border-radius: 45% 55% 68% 32% / 38% 62% 38% 62%; }
                    50% { border-radius: 32% 68% 38% 62% / 65% 35% 65% 35%; }
                    75% { border-radius: 55% 45% 52% 48% / 42% 58% 42% 58%; }
                }

                .sys-haze {
                    position: relative;
                    overflow: hidden;
                }
                .sys-haze::before {
                    content: "";
                    position: absolute;
                    inset: -50%;
                    background: conic-gradient(from var(--haze-angle, 0deg), transparent 0%, rgba(168,85,247,0.15) 25%, transparent 50%, rgba(236,72,153,0.15) 75%, transparent 100%);
                    animation: sysHazeRotate 10s linear infinite;
                    pointer-events: none;
                    z-index: -1;
                    filter: blur(40px);
                }
                @keyframes sysHazeRotate { to { transform: rotate(360deg); } }

                .sys-input-glow {
                    transition: all 280ms var(--sys-ease-spring);
                }
                .sys-input-glow:focus {
                    box-shadow: 0 0 0 3px rgba(168,85,247,0.2), 0 0 24px rgba(168,85,247,0.2);
                    border-color: rgba(168,85,247,0.6);
                }

                .sys-magic-border {
                    position: relative;
                    background-clip: padding-box;
                    border: 1px solid transparent;
                }
                .sys-magic-border::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    z-index: -1;
                    margin: -1px;
                    border-radius: inherit;
                    background: conic-gradient(from var(--angle, 0deg), #a855f7, #ec4899, #06b6d4, #a855f7);
                    animation: sysMagicRotate 4s linear infinite;
                }
                @keyframes sysMagicRotate { to { --angle: 360deg; } }
                @property --angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

                @media (max-width: 768px) {
                    .sys-glass, .sys-glass-strong { backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); }
                }
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

    const TabsFixer = (() => {
        const NAV_SELECTORS = [
            'nav', '[role="tablist"]', '.tabs', '.nav-tabs', '.tab-list',
            '[class*="tabs"]', '[class*="Tabs"]', '[class*="tab-bar"]',
            '[class*="navbar"]', '[class*="NavBar"]', '[data-tabs]'
        ];
        const arrows = new WeakMap();
        const fixed = new WeakSet();

        const isLikelyTabBar = (el) => {
            if (!el || fixed.has(el)) return false;
            const children = Array.from(el.children).filter(c => c.offsetWidth > 0);
            if (children.length < 3 || children.length > 20) return false;
            const styles = getComputedStyle(el);
            const isFlex = styles.display.includes('flex');
            const isGrid = styles.display.includes('grid');
            if (!isFlex && !isGrid) return false;
            let textChildren = 0;
            for (const c of children) {
                const txt = c.textContent?.trim() || '';
                if (txt.length > 0 && txt.length < 50) textChildren++;
            }
            return textChildren >= children.length * 0.6;
        };

        const fix = (el) => {
            if (!el || fixed.has(el)) return;
            fixed.add(el);
            el.classList.add('sys-tabs-scroller');
            const children = Array.from(el.children);
            children.forEach(c => {
                c.style.flex = '0 0 auto';
                c.style.whiteSpace = 'nowrap';
                c.style.wordBreak = 'keep-all';
                c.style.overflowWrap = 'normal';
                c.style.minWidth = 'max-content';
                c.style.width = 'auto';
                c.style.textOverflow = 'clip';
            });
            const wrap = el.parentElement;
            if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

            const leftArrow = DOM.create('button', { class: 'sys-tab-arrow sys-tab-arrow-left', 'aria-label': 'سابق' });
            const rightArrow = DOM.create('button', { class: 'sys-tab-arrow sys-tab-arrow-right', 'aria-label': 'التالي' });
            leftArrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
            rightArrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

            if (wrap) {
                wrap.appendChild(leftArrow);
                wrap.appendChild(rightArrow);
                arrows.set(el, { left: leftArrow, right: rightArrow });
            }

            const updateArrows = () => {
                const isRTL = getComputedStyle(el).direction === 'rtl';
                const scrollLeft = el.scrollLeft;
                const maxScroll = el.scrollWidth - el.clientWidth;
                const atStart = isRTL ? Math.abs(scrollLeft) < 8 : scrollLeft < 8;
                const atEnd = isRTL ? Math.abs(scrollLeft) >= maxScroll - 8 : scrollLeft >= maxScroll - 8;
                if (isRTL) {
                    leftArrow.classList.toggle('sys-visible', !atEnd);
                    rightArrow.classList.toggle('sys-visible', !atStart);
                } else {
                    leftArrow.classList.toggle('sys-visible', !atStart);
                    rightArrow.classList.toggle('sys-visible', !atEnd);
                }
            };

            const scrollBy = (dir) => {
                const isRTL = getComputedStyle(el).direction === 'rtl';
                const amount = el.clientWidth * 0.7;
                el.scrollBy({ left: isRTL ? -dir * amount : dir * amount, behavior: 'smooth' });
                Audio.play('slide');
            };

            leftArrow.addEventListener('click', () => scrollBy(-1));
            rightArrow.addEventListener('click', () => scrollBy(1));
            el.addEventListener('scroll', $rafThrottle(updateArrows), { passive: true });
            new ResizeObserver(updateArrows).observe(el);
            setTimeout(updateArrows, 100);

            let dragStart = null, dragScrollStart = 0, isDragging = false;
            el.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button, a, [role="button"], [role="tab"]')) return;
                dragStart = e.clientX;
                dragScrollStart = el.scrollLeft;
                isDragging = false;
            });
            el.addEventListener('pointermove', (e) => {
                if (dragStart === null) return;
                const dx = e.clientX - dragStart;
                if (Math.abs(dx) > 5) {
                    isDragging = true;
                    el.style.cursor = 'grabbing';
                    el.scrollLeft = dragScrollStart - dx;
                }
            });
            const endDrag = () => { dragStart = null; el.style.cursor = ''; setTimeout(() => isDragging = false, 50); };
            el.addEventListener('pointerup', endDrag);
            el.addEventListener('pointerleave', endDrag);
            el.addEventListener('pointercancel', endDrag);
            el.addEventListener('click', (e) => { if (isDragging) { e.preventDefault(); e.stopPropagation(); } }, true);

            el.addEventListener('wheel', (e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY; }
            }, { passive: false });

            const activeChild = el.querySelector('[aria-selected="true"], .active, .sys-active, [data-active="true"]');
            if (activeChild) setTimeout(() => activeChild.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 200);
        };

        const scan = () => {
            const candidates = new Set();
            NAV_SELECTORS.forEach(sel => {
                try { document.querySelectorAll(sel).forEach(el => candidates.add(el)); } catch {}
            });
            document.querySelectorAll('div, ul, ol').forEach(el => { if (isLikelyTabBar(el)) candidates.add(el); });
            candidates.forEach(el => { if (isLikelyTabBar(el) || el.matches?.(NAV_SELECTORS.join(','))) fix(el); });
        };

        const init = () => {
            scan();
            const obs = new MutationObserver($debounce(scan, 200));
            obs.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('resize', $debounce(() => {
                document.querySelectorAll('.sys-tabs-scroller').forEach(el => {
                    const evt = new Event('scroll');
                    el.dispatchEvent(evt);
                });
            }, 150));
        };

        return { init, fix, scan };
    })();

    const Magnetic = (() => {
        let cache = [], lastUpdate = 0, raf = null;
        const refresh = $debounce(() => {
            cache = Array.from(document.querySelectorAll('.sys-magnetic')).map(el => ({ el, rect: el.getBoundingClientRect() }));
        }, 220);
        const move = (e) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                const now = performance.now();
                if (now - lastUpdate > 600) { refresh(); lastUpdate = now; }
                for (let i = 0; i < cache.length; i++) {
                    const { el } = cache[i];
                    if (!el.isConnected) continue;
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    const dx = e.clientX - cx, dy = e.clientY - cy;
                    const dist = Math.hypot(dx, dy);
                    const range = Math.max(r.width, r.height) / 2 + 90;
                    if (dist < range) {
                        const strength = (1 - dist / range) * 0.32;
                        const rx = (dy / range) * -6 * strength;
                        const ry = (dx / range) * 6 * strength;
                        el.style.transform = `perspective(800px) translate3d(${dx * strength}px, ${dy * strength}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale(${1 + 0.05 * strength * 3})`;
                    } else {
                        el.style.transform = '';
                    }
                }
                raf = null;
            });
        };
        const init = () => {
            if ($reducedMotion || $isTouch) return;
            document.addEventListener('mousemove', move, { passive: true });
            window.addEventListener('resize', refresh, { passive: true });
            window.addEventListener('scroll', refresh, { passive: true, capture: true });
            new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
            refresh();
        };
        return { init, refresh };
    })();

    const Cursor = (() => {
        let cursor, active = false, raf = null, tx = 0, ty = 0, x = 0, y = 0;
        const trails = [];
        const trailCount = 8;
        const loop = () => {
            x = $lerp(x, tx, 0.22); y = $lerp(y, ty, 0.22);
            if (cursor) cursor.style.transform = `translate3d(${x - 12}px, ${y - 12}px, 0)`;
            for (let i = 0; i < trails.length; i++) {
                const t = trails[i];
                t.x = $lerp(t.x, i === 0 ? x : trails[i-1].x, 0.35 - i * 0.03);
                t.y = $lerp(t.y, i === 0 ? y : trails[i-1].y, 0.35 - i * 0.03);
                if (t.el) {
                    const scale = 1 - i * 0.11;
                    t.el.style.transform = `translate3d(${t.x - 3}px, ${t.y - 3}px, 0) scale(${scale})`;
                    t.el.style.opacity = `${0.5 - i * 0.05}`;
                }
            }
            raf = requestAnimationFrame(loop);
        };
        const move = (e) => { tx = e.clientX; ty = e.clientY; };
        const enable = () => {
            if (active || $isTouch) return; active = true;
            cursor = DOM.mount('sys-cursor', Layers.cursor, 'sys-spotlight-cursor');
            for (let i = 0; i < trailCount; i++) {
                const el = DOM.create('div', { class: 'sys-cursor-trail' });
                document.body.appendChild(el);
                trails.push({ el, x: 0, y: 0 });
            }
            document.addEventListener('mousemove', move, { passive: true });
            document.querySelectorAll('button, a, [role="button"]').forEach(el => {
                el.addEventListener('mouseenter', () => { if (cursor) { cursor.style.width = '44px'; cursor.style.height = '44px'; cursor.style.background = 'radial-gradient(circle, rgba(236,72,153,0.65), transparent 70%)'; } });
                el.addEventListener('mouseleave', () => { if (cursor) { cursor.style.width = '24px'; cursor.style.height = '24px'; cursor.style.background = 'radial-gradient(circle, rgba(168,85,247,0.55), transparent 70%)'; } });
            });
            loop();
        };
        const disable = () => { active = false; cancelAnimationFrame(raf); cursor?.remove(); trails.forEach(t => t.el?.remove()); trails.length = 0; document.removeEventListener('mousemove', move); };
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
                Events.emit('action:registered', { id, ...def });
            },
            registerBatch: (actions) => actions.forEach(a => Actions.register(a.id, a)),
            unregister: (id) => { const a = registry.get(id); if (a?.group) groups.get(a.group)?.delete(id); registry.delete(id); },
            execute: async (id, payload = null) => {
                const action = registry.get(id);
                if (!action?.handler) return;
                Audio.play(action.sound || 'click');
                Haptics.light();
                Events.emit('action:before', { id, payload });
                try {
                    const result = await action.handler(payload);
                    Events.emit('action:executed', { id, payload, result });
                    const history = State.cmdState.history;
                    history.unshift(id);
                    State.cmdState.history = [...new Set(history)].slice(0, 24);
                    try { localStorage.setItem('sysui_cmd_history', JSON.stringify(State.cmdState.history)); } catch {}
                    return result;
                } catch (e) {
                    Events.emit('action:error', { id, payload, error: e });
                    throw e;
                }
            },
            get: (id) => registry.get(id),
            getAll: () => Array.from(registry.values()),
            getGroup: (g) => Array.from(groups.get(g) || []).map(id => registry.get(id)).filter(Boolean),
            toggleFavorite: (id) => {
                if (State.cmdState.favorites.has(id)) State.cmdState.favorites.delete(id);
                else State.cmdState.favorites.add(id);
                try { localStorage.setItem('sysui_cmd_favs', JSON.stringify([...State.cmdState.favorites])); } catch {}
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
            const useVT = 'startViewTransition' in document && !$reducedMotion;
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
                if (!resolved) container.innerHTML = `<div class="flex flex-col items-center justify-center p-10 text-center sys-fade-in"><div class="relative w-14 h-14 mb-5"><div class="absolute inset-0 rounded-full border-2 border-white/5"></div><div class="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-500 border-r-purple-500/40 animate-spin"></div><div class="absolute inset-2 rounded-full bg-purple-500/10 sys-breathe"></div></div><p class="text-sm text-gray-300 font-medium sys-shimmer-text">جاري معالجة البيانات</p></div>`;
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
            const overlay = DOM.mount('sys-spotlight-overlay', Layers.spotlight, 'fixed inset-0 pointer-events-none opacity-0 transition-opacity duration-500');
            const update = () => {
                const rect = target.getBoundingClientRect();
                overlay.innerHTML = '';
                const hole = DOM.create('div', { class: 'absolute rounded-2xl pointer-events-auto transition-all duration-700 sys-breathe', style: { top: (rect.top - 10) + 'px', left: (rect.left - 10) + 'px', width: (rect.width + 20) + 'px', height: (rect.height + 20) + 'px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.82), inset 0 0 30px rgba(168,85,247,0.35), 0 0 40px rgba(168,85,247,0.4)' } });
                const tipTop = placement === 'bottom' ? rect.bottom + 24 : rect.top - 90;
                const tooltip = DOM.create('div', { class: 'absolute flex flex-col items-center pointer-events-auto sys-scale-in', style: { top: tipTop + 'px', left: (rect.left + rect.width / 2) + 'px', transform: 'translateX(-50%)' } });
                const bubble = DOM.create('div', { class: 'sys-glass-glow text-white px-5 py-3 rounded-xl text-sm font-medium shadow-2xl whitespace-nowrap mb-3', text: message });
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
            window.addEventListener('resize', onResize);
            window.addEventListener('scroll', onResize, true);
            const close = () => {
                overlay.classList.add('opacity-0');
                window.removeEventListener('resize', onResize);
                window.removeEventListener('scroll', onResize, true);
                setTimeout(() => {
                    overlay.remove();
                    target.style.zIndex = origZ;
                    target.style.position = origPos;
                }, 500);
                if (persist) try { localStorage.setItem(`sysui_spotlight_${targetId}`, '1'); } catch {}
            };
        };
        const reset = (targetId) => { try { targetId ? localStorage.removeItem(`sysui_spotlight_${targetId}`) : Object.keys(localStorage).filter(k => k.startsWith('sysui_spotlight_')).forEach(k => localStorage.removeItem(k)); } catch {} };
        return { show, reset };
    })();

    const PerfHUD = (() => {
        let active = false, frames = 0, lastTime = performance.now(), fps = 0, fpsHistory = [], rafId = null;
        const toggle = () => {
            active = !active;
            const el = DOM.mount('sys-hud', Layers.hud, 'fixed bottom-4 left-4 sys-glass-strong p-3.5 rounded-xl text-[10px] font-mono text-green-400 pointer-events-auto transition-all flex flex-col gap-1.5 w-64 opacity-0 select-none sys-noise-overlay');
            if (!active) {
                Motion.exit.scale(el).then(() => el.remove());
                cancelAnimationFrame(rafId);
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
                    el.innerHTML = `
                        <div class="flex justify-between items-center"><span class="text-gray-500">⚡ FPS</span><span class="${fpsColor} font-bold">${fps} <span class="text-gray-500 text-[8px]">avg ${avgFps} · min ${minFps}</span></span></div>
                        <div class="flex items-end gap-[1px] h-6 bg-black/40 p-1 rounded">${bars}</div>
                        <div class="flex justify-between"><span class="text-gray-500">🧠 MEM</span><span class="text-blue-400">${mem} <span class="text-gray-600 text-[8px]">/ ${memMax}</span></span></div>
                        <div class="flex justify-between"><span class="text-gray-500">🌐 DOM</span><span class="text-yellow-400">${document.getElementsByTagName('*').length}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">🪟 OVR</span><span class="text-purple-400">${State.activeOverlays.length}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">📢 TST</span><span class="text-cyan-400">${State.toasts.size}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">🎯 ACT</span><span class="text-pink-400">${Actions.getAll().length}</span></div>
                        <div class="sys-divider-glow my-1"></div>
                        <div class="text-[8px] text-gray-500 text-center tracking-[0.3em] sys-shimmer-text">SYS_UI · v6.0 · ONLINE</div>
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
            const wrap = DOM.create('div', { class: 'flex items-center gap-3 z-10 font-medium tracking-wide flex-1' });
            const iconWrap = DOM.create('div', { class: 'shrink-0' });
            iconWrap.innerHTML = icons[type] || icons.info;
            wrap.appendChild(iconWrap);
            wrap.appendChild(DOM.create('span', { class: 'flex-1', text: String(message) }));
            const bar = duration !== Infinity ? DOM.create('div', { class: `absolute bottom-0 left-0 right-0 h-[2px] origin-left ${colors[type] || colors.info} sys-progress`, style: { animationDuration: duration + 'ms' } }) : null;
            return { wrap, bar };
        };

        const reflow = () => {
            const container = document.getElementById('sys-toasts');
            if (!container) return;
            const items = Array.from(container.children);
            items.forEach((el, i) => {
                const offset = i * 4;
                const scale = 1 - i * 0.04;
                const opacity = 1 - i * 0.18;
                el.style.transition = 'transform 360ms cubic-bezier(0.16,1,0.3,1), opacity 360ms';
                el.style.transform = `translateY(${-offset}px) scale(${Math.max(scale, 0.86)})`;
                el.style.opacity = Math.max(opacity, 0.5);
                el.style.zIndex = 100 - i;
            });
        };

        const create = (type, message, duration = 4000, opts = {}) => {
            Theme.inject();
            Audio.play(opts.sound || sounds[type] || 'pop');
            Haptics[haptics[type] || 'light']?.();
            const container = DOM.mount('sys-toasts', Layers.toast, 'fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4');
            const id = opts.id || $uid();
            const borderCls = borders[type] || borders.info;
            const el = DOM.create('div', { class: `sys-glass flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-gray-100 shadow-2xl relative overflow-hidden pointer-events-auto sys-toast-enter border ${borderCls} sys-noise-overlay min-w-[280px]`, role: 'status', 'aria-live': type === 'error' ? 'assertive' : 'polite' });
            const { wrap, bar } = renderContent(type, message, duration);
            el.appendChild(wrap);
            if (bar) el.appendChild(bar);
            if (opts.action) {
                const actionBtn = DOM.create('button', { class: 'sys-button-press text-xs text-white/90 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 ml-2 z-10 font-medium transition-all', text: opts.action.label });
                actionBtn.addEventListener('click', () => { opts.action.handler?.(); remove(id); }, { once: true });
                el.appendChild(actionBtn);
            }
            container.prepend(el);
            requestAnimationFrame(reflow);
            const data = { id, el, timeout: null, type };
            State.toasts.set(id, data);
            if (duration !== Infinity) data.timeout = setTimeout(() => remove(id), duration);
            if (State.toasts.size > 5) remove(State.toasts.keys().next().value);
            let startX = 0, currentX = 0, dragging = false;
            el.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; startX = e.clientX; dragging = true; el.style.transition = 'none'; el.setPointerCapture(e.pointerId); });
            el.addEventListener('pointermove', (e) => { if (!dragging) return; currentX = e.clientX - startX; el.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.03}deg)`; el.style.opacity = Math.max(0, 1 - Math.abs(currentX) / 200); });
            el.addEventListener('pointerup', (e) => {
                if (!dragging) return; dragging = false;
                if (Math.abs(currentX) > 100) { el.style.transition = 'transform 240ms cubic-bezier(0.3,0,1,1), opacity 240ms'; el.style.transform = `translateX(${currentX > 0 ? 400 : -400}px)`; el.style.opacity = '0'; setTimeout(() => remove(id), 240); }
                else { el.style.transition = 'transform 320ms cubic-bezier(0.34,1.56,0.64,1), opacity 320ms'; el.style.transform = ''; el.style.opacity = ''; }
                currentX = 0;
            });
            el.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON' && !dragging && Math.abs(currentX) < 5) remove(id); });
            el.addEventListener('mouseenter', () => { if (data.timeout) { clearTimeout(data.timeout); data.timeout = null; bar?.style.setProperty('animation-play-state', 'paused'); } });
            el.addEventListener('mouseleave', () => { if (duration !== Infinity && !data.timeout) { data.timeout = setTimeout(() => remove(id), 1500); bar?.style.setProperty('animation-play-state', 'running'); } });
            return id;
        };
        const update = (id, type, message, duration = 4000) => {
            const t = State.toasts.get(id);
            if (!t) return create(type, message, duration);
            Audio.play(sounds[type] || 'pop');
            if (t.timeout) clearTimeout(t.timeout);
            Motion.animate(t.el, [{ filter: 'blur(0)' }, { filter: 'blur(4px)' }], { duration: 120, easing: 'ease-out' }).then(() => {
                t.el.innerHTML = '';
                t.el.className = t.el.className.replace(/border-\w+-500\/30/g, '') + ' ' + (borders[type] || borders.info);
                const { wrap, bar } = renderContent(type, message, duration);
                t.el.appendChild(wrap);
                if (bar) t.el.appendChild(bar);
                Motion.animate(t.el, [{ filter: 'blur(4px)', transform: 'scale(0.96)' }, { filter: 'blur(0)', transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
            });
            if (duration !== Infinity) t.timeout = setTimeout(() => remove(id), duration);
            return id;
        };
        const remove = (id) => {
            const t = State.toasts.get(id);
            if (!t) return;
            if (t.timeout) clearTimeout(t.timeout);
            t.el.classList.remove('sys-toast-enter');
            t.el.classList.add('sys-toast-exit');
            setTimeout(() => { t.el.remove(); State.toasts.delete(id); reflow(); }, 280);
        };
        const clear = () => { State.toasts.forEach((_, id) => remove(id)); };
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
            const container = DOM.mount('sys-modal-root', Layers.modal, 'fixed inset-0 hidden items-center justify-center px-4 pointer-events-none');
            const box = DOM.create('div', { class: 'relative sys-glass-strong p-7 rounded-2xl w-full max-w-md pointer-events-auto sys-noise-overlay', role: 'dialog', 'aria-modal': 'true', tabindex: '-1', style: { transformOrigin: 'center' } });
            if (icon || type === 'danger') {
                const iconBox = DOM.create('div', { class: `w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${type === 'danger' ? 'bg-red-500/15 border border-red-500/30' : 'bg-purple-500/15 border border-purple-500/30'} sys-breathe` });
                iconBox.innerHTML = icon || `<svg class="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
                box.appendChild(iconBox);
            }
            const titleEl = DOM.create('h3', { class: 'text-white font-semibold text-lg mb-2 tracking-tight', text: title });
            box.appendChild(titleEl);
            if (description) box.appendChild(DOM.create('p', { class: 'text-gray-400 text-sm mb-5 leading-relaxed', text: description }));
            else box.appendChild(DOM.create('div', { class: 'mb-5' }));
            let input = null, errorEl = null;
            if (inputId) {
                input = DOM.create('input', { type: 'text', id: inputId, class: 'sys-input-glow w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 transition-all mb-2 placeholder-gray-600', placeholder, autocomplete: 'off' });
                box.appendChild(input);
                errorEl = DOM.create('p', { class: 'text-xs text-red-400 mb-4 min-h-[16px]' });
                box.appendChild(errorEl);
                if (State.sessionDrafts[inputId]) input.value = State.sessionDrafts[inputId];
                input.addEventListener('input', (e) => { State.sessionDrafts[inputId] = e.target.value; try { localStorage.setItem('sysui_drafts', JSON.stringify(State.sessionDrafts)); } catch {} if (errorEl) errorEl.textContent = ''; });
            }
            const btnRow = DOM.create('div', { class: 'flex justify-end gap-3 mt-2' });
            const cancelBtn = DOM.create('button', { class: 'sys-magnetic sys-button-press px-5 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/5 border border-white/10 transition-all outline-none focus:ring-2 focus:ring-white/20', text: cancelLabel });
            const confirmClass = type === 'danger' ? 'bg-gradient-to-br from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-gradient-to-br from-white to-gray-200 text-black hover:from-gray-100 hover:to-white shadow-[0_0_20px_rgba(255,255,255,0.3)]';
            const confirmBtn = DOM.create('button', { class: `sys-magnetic sys-button-press sys-liquid-button px-5 py-2.5 rounded-xl text-sm font-semibold ${confirmClass} transition-all outline-none focus:ring-2 focus:ring-white/40`, text: confirmLabel });
            btnRow.append(cancelBtn, confirmBtn);
            box.appendChild(btnRow);
            container.innerHTML = '';
            container.appendChild(box);
            container.classList.remove('hidden');
            container.classList.add('flex');
            Motion.spring(box, { transform: ['scale(0.88) translateY(20px)', 'scale(1) translateY(0)'], opacity: [0, 1] }, 'bouncy');
            const children = Array.from(box.children);
            Motion.stagger(children, (el) => { Motion.enter.slideUp(el, { duration: 320 }); }, 30);
            const releaseFocus = DOM.trapFocus(box);
            const close = (res) => {
                if (inputId && res != null) { delete State.sessionDrafts[inputId]; try { localStorage.setItem('sysui_drafts', JSON.stringify(State.sessionDrafts)); } catch {} }
                Audio.play('close');
                Motion.animate(box, [{ transform: 'scale(1) translateY(0)', opacity: 1, filter: 'blur(0)' }, { transform: 'scale(0.94) translateY(8px)', opacity: 0, filter: 'blur(4px)' }], { duration: 220, easing: Motion.tokens.ease.accelerate });
                toggleBackdrop(false);
                releaseFocus();
                setTimeout(() => {
                    container.classList.add('hidden');
                    container.classList.remove('flex');
                    container.innerHTML = '';
                    if (res !== null && res !== undefined) onConfirm?.(res);
                    else onCancel?.();
                }, 220);
            };
            DOM.pushOverlay('modal', () => close(null));
            cancelBtn.addEventListener('click', () => { DOM.popOverlay(); close(null); }, { once: true });
            confirmBtn.addEventListener('click', () => {
                const value = inputId ? input.value : true;
                if (validator && inputId) {
                    const err = validator(value);
                    if (err) { if (errorEl) errorEl.textContent = err; Audio.play('error'); Haptics.error(); input.focus(); Motion.shake(box); return; }
                }
                DOM.popOverlay();
                close(value);
            });
            if (inputId) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); } });
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
            container.innerHTML = '';
            if (!scored.length) {
                const empty = DOM.create('div', { class: 'px-4 py-16 text-center sys-fade-in' });
                empty.innerHTML = `<div class="w-12 h-12 rounded-full bg-white/5 border border-white/10 mx-auto mb-3 flex items-center justify-center sys-breathe"><svg class="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p class="text-sm text-gray-500 font-medium">لا توجد نتائج</p>`;
                container.appendChild(empty);
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
            groups.forEach((items, groupName) => {
                const header = DOM.create('div', { class: 'px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold', text: groupName });
                container.appendChild(header);
                items.forEach(cmd => {
                    const currentIdx = idx++;
                    const isActive = currentIdx === State.cmdState.selectedIndex;
                    const isFav = State.cmdState.favorites.has(cmd.id);
                    const baseCls = isActive ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/10 border-purple-500/30' : 'hover:bg-white/5 border-transparent';
                    const aiCls = cmd.isAI ? 'border-purple-500/40 bg-purple-900/15' : '';
                    const row = DOM.create('div', { class: `flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all border ${baseCls} ${aiCls} group`, dataset: { idx: currentIdx }, style: { opacity: '0', transform: 'translateX(-8px)' } });
                    const left = DOM.create('div', { class: 'flex items-center gap-3 min-w-0 flex-1' });
                    const iconBox = DOM.create('div', { class: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base transition-transform group-hover:scale-110 ${cmd.isAI ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/20 border border-purple-500/30' : 'bg-white/5 border border-white/10'}`, text: cmd.icon || '⌘' });
                    const textWrap = DOM.create('div', { class: 'flex flex-col min-w-0 flex-1' });
                    textWrap.appendChild(DOM.create('span', { class: `text-sm ${cmd.isAI ? 'text-purple-200' : 'text-gray-100'} font-medium truncate`, text: cmd.title }));
                    if (cmd.description) textWrap.appendChild(DOM.create('span', { class: 'text-[11px] text-gray-500 truncate mt-0.5', text: cmd.description }));
                    left.append(iconBox, textWrap);
                    row.appendChild(left);
                    const right = DOM.create('div', { class: 'flex items-center gap-2 shrink-0 ml-2' });
                    if (isFav) right.appendChild(DOM.create('span', { class: 'text-yellow-400 text-xs', text: '★' }));
                    if (cmd.shortcut) {
                        const kbd = DOM.create('span', { class: 'sys-kbd', text: cmd.shortcut });
                        right.appendChild(kbd);
                    }
                    row.appendChild(right);
                    row.addEventListener('mouseenter', () => { State.cmdState.selectedIndex = currentIdx; updateActive(container); Audio.play('hover'); });
                    row.addEventListener('click', () => { close(); cmd.isAI ? cmd.handler() : Actions.execute(cmd.id); });
                    container.appendChild(row);
                    allRows.push(row);
                });
            });
            Motion.stagger(allRows, (el) => { Motion.animate(el, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 240, easing: Motion.tokens.ease.spring }); }, 18);
        };

        const updateActive = (container) => {
            container.querySelectorAll('[data-idx]').forEach(el => {
                const i = parseInt(el.dataset.idx);
                if (i === State.cmdState.selectedIndex) {
                    el.classList.add('bg-gradient-to-r', 'from-purple-500/20', 'to-pink-500/10', 'border-purple-500/30');
                    el.classList.remove('hover:bg-white/5', 'border-transparent');
                    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    el.classList.remove('bg-gradient-to-r', 'from-purple-500/20', 'to-pink-500/10', 'border-purple-500/30');
                    el.classList.add('hover:bg-white/5', 'border-transparent');
                }
            });
        };

        const open = () => {
            Theme.inject();
            Audio.play('open');
            Haptics.medium();
            const container = DOM.mount('sys-cmd-root', Layers.cmd, 'sys-cmd-mobile fixed inset-0 hidden items-start justify-center pt-[12vh] px-4 pointer-events-none');
            const bd = DOM.mount('sys-cmd-backdrop', Layers.backdrop, 'sys-overlay-backdrop');
            State.cmdState = { ...State.cmdState, query: '', selectedIndex: 0, results: [] };
            const box = DOM.create('div', { class: 'w-full max-w-2xl sys-glass-strong rounded-2xl overflow-hidden pointer-events-auto flex flex-col sys-noise-overlay shadow-2xl', style: { transformOrigin: 'center top' } });
            const header = DOM.create('div', { class: 'flex items-center px-5 py-4 border-b border-white/10 relative' });
            header.innerHTML = `<svg class="w-5 h-5 text-purple-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`;
            const input = DOM.create('input', { type: 'text', id: 'sys-cmd-input', class: 'w-full bg-transparent text-white text-base outline-none placeholder-gray-500 font-medium', placeholder: 'ابحث، تنقل، أو اطلب من الذكاء الاصطناعي...', autocomplete: 'off', spellcheck: 'false' });
            const escTag = DOM.create('span', { class: 'sys-kbd ml-2 shrink-0', text: 'ESC' });
            header.append(input, escTag);
            const results = DOM.create('div', { id: 'sys-cmd-results', class: 'max-h-[420px] overflow-y-auto sys-no-scroll p-2' });
            const footer = DOM.create('div', { class: 'flex items-center justify-between px-5 py-3 border-t border-white/10 text-[10px] text-gray-500 bg-black/20' });
            footer.innerHTML = `<div class="flex gap-4 flex-wrap"><span class="flex items-center gap-1.5"><span class="sys-kbd">↑↓</span> تنقل</span><span class="flex items-center gap-1.5"><span class="sys-kbd">↵</span> تنفيذ</span><span class="flex items-center gap-1.5"><span class="sys-kbd">⇥</span> مفضلة</span></div><div class="sys-shimmer-text font-semibold tracking-[0.3em]">SYS_UI</div>`;
            box.append(header, results, footer);
            container.innerHTML = '';
            container.appendChild(box);
            container.classList.remove('hidden');
            container.classList.add('flex');
            requestAnimationFrame(() => bd.classList.add('sys-open'));
            Motion.spring(box, { transform: ['scale(0.94) translateY(-20px)', 'scale(1) translateY(0)'], opacity: [0, 1] }, 'snappy');
            setTimeout(() => input.focus(), 80);
            input.addEventListener('input', (e) => { State.cmdState.query = e.target.value; State.cmdState.selectedIndex = 0; renderResults(results); });
            input.addEventListener('keydown', (e) => {
                const len = lastScored.length || 1;
                if (e.key === 'ArrowDown') { e.preventDefault(); State.cmdState.selectedIndex = (State.cmdState.selectedIndex + 1) % len; updateActive(results); Audio.play('tick'); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); State.cmdState.selectedIndex = (State.cmdState.selectedIndex - 1 + len) % len; updateActive(results); Audio.play('tick'); }
                else if (e.key === 'Enter') { e.preventDefault(); const cmd = lastScored[State.cmdState.selectedIndex]; if (cmd) { close(); cmd.isAI ? cmd.handler() : Actions.execute(cmd.id); } }
                else if (e.key === 'Tab') { e.preventDefault(); const cmd = lastScored[State.cmdState.selectedIndex]; if (cmd && !cmd.isAI) { Actions.toggleFavorite(cmd.id); renderResults(results); Audio.play('select'); Haptics.select(); } }
            });
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
            setTimeout(() => { if (container) { container.classList.add('hidden'); container.classList.remove('flex'); container.innerHTML = ''; } }, 220);
        };
        const toggle = () => { const c = document.getElementById('sys-cmd-root'); (c && !c.classList.contains('hidden')) ? close() : open(); };
        return { open, close, toggle };
    })();

    const ContextMenu = (() => {
        const show = (e, items) => {
            e.preventDefault();
            Theme.inject();
            close();
            Audio.play('pop');
            Haptics.light();
            const menu = DOM.create('div', { class: 'fixed sys-glass-strong rounded-xl py-1.5 min-w-[200px] sys-noise-overlay', style: { zIndex: Layers.context, top: e.clientY + 'px', left: e.clientX + 'px', transformOrigin: 'top left', opacity: '0' } });
            const rows = [];
            items.forEach(item => {
                if (item.divider) { menu.appendChild(DOM.create('div', { class: 'sys-divider-glow my-1.5 mx-2' })); return; }
                const row = DOM.create('button', { class: `w-full flex items-center gap-3 px-3 py-2 text-xs ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-200 hover:bg-white/10'} transition-colors text-right`, style: { opacity: '0' } });
                if (item.icon) row.appendChild(DOM.create('span', { class: 'text-sm shrink-0 w-4', text: item.icon }));
                row.appendChild(DOM.create('span', { class: 'flex-1 text-right font-medium', text: item.label }));
                if (item.shortcut) row.appendChild(DOM.create('span', { class: 'sys-kbd', text: item.shortcut }));
                row.addEventListener('click', () => { close(); Audio.play('click'); item.handler?.(); });
                menu.appendChild(row);
                rows.push(row);
            });
            document.body.appendChild(menu);
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
            if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
            menu.id = 'sys-context-menu';
            Motion.spring(menu, { transform: ['scale(0.88) translateY(-6px)', 'scale(1) translateY(0)'], opacity: [0, 1] }, 'snappy');
            Motion.stagger(rows, (el) => { Motion.animate(el, [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 200, easing: Motion.tokens.ease.spring }); }, 22);
            setTimeout(() => document.addEventListener('click', close, { once: true }), 50);
        };
        const close = () => {
            const m = document.getElementById('sys-context-menu');
            if (m) { Motion.animate(m, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92)' }], { duration: 160, easing: Motion.tokens.ease.accelerate }).then(() => m.remove()); }
        };
        return { show, close };
    })();

    const Tooltip = (() => {
        let el, hideTimer;
        const ensure = () => { if (!el) { el = DOM.create('div', { class: 'sys-tooltip', id: 'sys-tooltip-root' }); document.body.appendChild(el); } return el; };
        const show = (target, text, placement = 'top') => {
            clearTimeout(hideTimer);
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
        };
        const hide = () => { hideTimer = setTimeout(() => el?.classList.remove('sys-tooltip-show'), 80); };
        const attach = (selector, getText, placement = 'top') => {
            document.querySelectorAll(selector).forEach(target => {
                target.addEventListener('mouseenter', () => show(target, typeof getText === 'function' ? getText(target) : getText, placement));
                target.addEventListener('mouseleave', hide);
                target.addEventListener('focus', () => show(target, typeof getText === 'function' ? getText(target) : getText, placement));
                target.addEventListener('blur', hide);
            });
        };
        return { show, hide, attach };
    })();

    const Confetti = (count = 120, opts = {}) => {
        const { colors = ['#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4', '#ffffff', '#f59e0b'], spread = 120, originX = 50, gravity = 1, shapes = ['circle', 'square', 'triangle', 'star'] } = opts;
        Theme.inject();
        const layer = DOM.mount('sys-confetti', Layers.particles, 'fixed inset-0 pointer-events-none overflow-hidden');
        Audio.play('success');
        Haptics.success();
        for (let i = 0; i < count; i++) {
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
            ], { duration, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }).onfinish = () => piece.remove();
        }
        setTimeout(() => { if (layer && !layer.children.length) layer.remove(); }, 5000);
    };

    const Fireworks = (count = 5) => {
        Theme.inject();
        const layer = DOM.mount('sys-fireworks', Layers.particles, 'fixed inset-0 pointer-events-none overflow-hidden');
        Audio.play('bell');
        for (let f = 0; f < count; f++) {
            setTimeout(() => {
                const cx = 20 + Math.random() * 60;
                const cy = 20 + Math.random() * 40;
                const hue = Math.floor(Math.random() * 360);
                const particles = 40;
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
            document.addEventListener('click', (e) => {
                const target = e.target.closest(selector);
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
        const fillPath = fill ? `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.4"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${path} L ${width},${height} L 0,${height} Z" fill="url(#${gradId})"/>` : '';
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="[w3.org](http://www.w3.org/2000/svg)">${fillPath}<path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ${color}80)"/></svg>`;
    };

    const UIHelpers = {
        presence: (msg, duration = 8000) => {
            Theme.inject();
            const container = DOM.mount('sys-presence-bar', Layers.base + 50, 'fixed top-4 right-4 flex flex-col gap-2 pointer-events-none');
            const el = DOM.create('div', { class: 'flex items-center gap-2.5 px-4 py-2 rounded-full sys-glass shadow-xl pointer-events-auto w-max sys-noise-overlay' });
            el.innerHTML = `<div class="relative"><div class="w-2 h-2 rounded-full bg-green-500"></div><div class="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping"></div></div>`;
            el.appendChild(DOM.create('span', { class: 'text-[11px] text-gray-200 font-medium tracking-wide', text: msg }));
            container.appendChild(el);
            Motion.enter.slideLeft(el);
            setTimeout(() => Motion.exit.slideLeft(el).then(() => el.remove()), duration);
        },
        statCard: (title, value, trend = 0, trendLabel = '', sparkData = null) => {
            const trendIcon = trend > 0 ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>` : trend < 0 ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6"/></svg>` : '';
            const trendColor = trend > 0 ? 'text-green-400 bg-green-500/10 border-green-500/20' : trend < 0 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-400 bg-white/5 border-white/10';
            const sign = trend > 0 ? '+' : '';
            const spark = sparkData ? `<div class="mt-3 relative z-10">${Sparkline(sparkData, { color: trend >= 0 ? '#22c55e' : '#ef4444', width: 140, height: 32 })}</div>` : '';
            return `<div class="sys-glass sys-magnetic sys-elevate sys-bloom p-5 rounded-2xl flex flex-col relative overflow-hidden group sys-noise-overlay"><div class="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-pink-500/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div><span class="text-xs text-gray-400 font-medium mb-1.5 relative z-10 tracking-wide">${$esc(title)}</span><div class="flex items-baseline gap-3 relative z-10"><span class="text-2xl font-bold text-white tracking-tight">${$esc(value)}</span>${trend !== 0 ? `<div class="flex items-center gap-1 ${trendColor} px-2 py-0.5 rounded-md text-[10px] font-semibold border">${trendIcon}<span>${sign}${trend}% ${$esc(trendLabel)}</span></div>` : ''}</div>${spark}</div>`;
        },
        emptyState: (containerId, type, title, desc, actionLabel = null, actionId = null) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = '';
            const wrap = DOM.create('div', { class: 'flex flex-col items-center justify-center py-20 px-4 text-center w-full max-w-sm mx-auto' });
            const iconBox = DOM.create('div', { class: 'relative w-20 h-20 mb-5 rounded-2xl sys-glass border border-white/10 flex items-center justify-center shadow-inner sys-breathe sys-bloom' });
            iconBox.innerHTML = `<svg class="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.4"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg><div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/10 to-transparent"></div>`;
            wrap.appendChild(iconBox);
            const titleEl = DOM.create('h3', { class: 'text-white font-semibold text-lg mb-2 tracking-tight', text: title });
            const descEl = DOM.create('p', { class: 'text-gray-500 text-sm mb-6 leading-relaxed', text: desc });
            wrap.append(titleEl, descEl);
            if (actionLabel) {
                const btn = DOM.create('button', { class: 'sys-magnetic sys-button-press sys-shimmer-sweep sys-liquid-button px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-br from-white to-gray-200 text-black hover:from-gray-100 hover:to-white transition-all shadow-[0_0_24px_rgba(255,255,255,0.25)]', text: actionLabel });
                if (actionId) btn.addEventListener('click', () => Actions.execute(actionId));
                wrap.appendChild(btn);
            }
            el.appendChild(wrap);
            const children = Array.from(wrap.children);
            children.forEach(c => { c.style.opacity = '0'; });
            Motion.stagger(children, (c) => Motion.enter.slideUp(c, { duration: 380 }), 70);
        },
        generateSkeleton: (type = 'card', count = 1) => {
            Theme.inject();
            const variants = {
                card: () => `<div data-stagger class="p-5 border border-white/5 rounded-2xl bg-white/[0.015] flex flex-col gap-4 w-full sys-fade-in shadow-inner mb-3"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full sys-skeleton-bg"></div><div class="flex flex-col gap-2 flex-1"><div class="h-3 w-1/3 sys-skeleton-bg rounded-full"></div><div class="h-2 w-1/4 sys-skeleton-bg rounded-full opacity-60"></div></div></div><div class="h-20 w-full sys-skeleton-bg rounded-xl mt-2"></div></div>`,
                list: () => `<div data-stagger class="flex items-center gap-3 p-3 border-b border-white/5 sys-fade-in"><div class="w-9 h-9 rounded-lg sys-skeleton-bg"></div><div class="flex-1 flex flex-col gap-2"><div class="h-3 w-2/5 sys-skeleton-bg rounded-full"></div><div class="h-2 w-3/5 sys-skeleton-bg rounded-full opacity-60"></div></div></div>`,
                text: () => `<div data-stagger class="flex flex-col gap-2 sys-fade-in mb-2"><div class="h-3 w-full sys-skeleton-bg rounded-full"></div><div class="h-3 w-5/6 sys-skeleton-bg rounded-full"></div><div class="h-3 w-4/6 sys-skeleton-bg rounded-full"></div></div>`,
                stat: () => `<div data-stagger class="p-5 border border-white/5 rounded-2xl bg-white/[0.015] sys-fade-in mb-3"><div class="h-2 w-1/3 sys-skeleton-bg rounded-full mb-3"></div><div class="h-6 w-2/3 sys-skeleton-bg rounded-full"></div><div class="h-8 w-full sys-skeleton-bg rounded-lg mt-3 opacity-50"></div></div>`
            };
            const gen = variants[type] || variants.card;
            return Array.from({ length: count }, gen).join('');
        }
    };

    const Hotkeys = (() => {
        const map = new Map();
        const fmt = (e) => `${e.ctrlKey || e.metaKey ? 'mod+' : ''}${e.shiftKey ? 'shift+' : ''}${e.altKey ? 'alt+' : ''}${e.key.toLowerCase()}`;
        document.addEventListener('keydown', (e) => {
            const key = fmt(e);
            const cb = map.get(key);
            if (cb && !(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                e.preventDefault(); cb(e);
            }
        });
        return {
            bind: (combo, cb) => { map.set(combo.toLowerCase(), cb); return () => map.delete(combo.toLowerCase()); },
            unbind: (combo) => map.delete(combo.toLowerCase()),
            list: () => Array.from(map.keys())
        };
    })();

    const Observe = {
        intersect: (selector, cb, opts = {}) => {
            const obs = new IntersectionObserver((entries) => entries.forEach(e => e.isIntersecting && cb(e.target, e)), { threshold: 0.1, ...opts });
            document.querySelectorAll(selector).forEach(el => obs.observe(el));
            return obs;
        },
        revealOnScroll: (selector = '[data-reveal]') => {
            const obs = new IntersectionObserver((entries) => {
                entries.forEach((e, i) => {
                    if (e.isIntersecting) {
                        e.target.style.opacity = '0';
                        e.target.style.transform = 'translateY(24px)';
                        setTimeout(() => Motion.enter.slideUp(e.target, { duration: Motion.tokens.duration.emphasized }), i * 60);
                        obs.unobserve(e.target);
                    }
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });
            document.querySelectorAll(selector).forEach(el => obs.observe(el));
            return obs;
        }
    };

    const ScrollProgress = {
        enable: () => {
            Theme.inject();
            const bar = DOM.mount('sys-scroll-progress', Layers.hud, 'fixed top-0 left-0 h-[3px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 origin-left shadow-[0_0_12px_rgba(168,85,247,0.6)]');
            bar.style.width = '100%';
            bar.style.transform = 'scaleX(0)';
            bar.style.transition = 'transform 120ms cubic-bezier(0.2,0,0,1)';
            const update = $rafThrottle(() => {
                const scrolled = window.scrollY;
                const max = document.documentElement.scrollHeight - window.innerHeight;
                bar.style.transform = `scaleX(${max > 0 ? scrolled / max : 0})`;
            });
            window.addEventListener('scroll', update, { passive: true });
            window.addEventListener('resize', update, { passive: true });
            update();
        }
    };

    const Drawer = (() => {
        const open = (config = {}) => {
            const { side = 'right', width = 360, title = '', content = '', onClose = null } = config;
            Theme.inject();
            Audio.play('swoosh');
            Haptics.medium();
            const bd = DOM.mount('sys-drawer-backdrop', Layers.backdrop, 'sys-overlay-backdrop');
            const id = $uid();
            const isRight = side === 'right';
            const drawer = DOM.create('div', { class: 'sys-drawer flex flex-col sys-noise-overlay', style: { top: '0', bottom: '0', [side]: '0', width: width + 'px', maxWidth: '92vw', transform: `translateX(${isRight ? '100%' : '-100%'})`, zIndex: Layers.modal } });
            const header = DOM.create('div', { class: 'flex items-center justify-between px-5 py-4 border-b border-white/10' });
            header.appendChild(DOM.create('h3', { class: 'text-white font-semibold tracking-tight', text: title }));
            const closeBtn = DOM.create('button', { class: 'sys-button-press w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white transition-colors', html: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' });
            header.appendChild(closeBtn);
            const body = DOM.create('div', { class: 'flex-1 overflow-y-auto sys-no-scroll p-5', html: content });
            drawer.append(header, body);
            document.body.appendChild(drawer);
            requestAnimationFrame(() => { bd.classList.add('sys-open'); drawer.style.transform = 'translateX(0)'; });
            const close = () => {
                Audio.play('close');
                drawer.style.transform = `translateX(${isRight ? '100%' : '-100%'})`;
                bd.classList.remove('sys-open');
                DOM.popOverlay();
                setTimeout(() => { drawer.remove(); onClose?.(); }, 340);
            };
            DOM.pushOverlay('drawer-' + id, close);
            closeBtn.addEventListener('click', close);
            bd.addEventListener('click', close);
            return { close, el: drawer };
        };
        return { open };
    })();

    const Accordion = {
        mount: (containerSelector) => {
            document.querySelectorAll(containerSelector).forEach(container => {
                container.querySelectorAll('[data-accordion-trigger]').forEach(trigger => {
                    const targetId = trigger.dataset.accordionTrigger;
                    const target = container.querySelector(`[data-accordion-content="${targetId}"]`);
                    if (!target) return;
                    if (!target.classList.contains('sys-accordion-content')) {
                        const inner = DOM.create('div');
                        while (target.firstChild) inner.appendChild(target.firstChild);
                        target.appendChild(inner);
                        target.classList.add('sys-accordion-content');
                    }
                    trigger.addEventListener('click', () => {
                        const isOpen = target.classList.toggle('sys-open');
                        Audio.play(isOpen ? 'pop' : 'tap');
                        Haptics.soft();
                        trigger.setAttribute('aria-expanded', isOpen);
                    });
                });
            });
        }
    };

    const Tabs = {
        mount: (containerSelector) => {
            document.querySelectorAll(containerSelector).forEach(container => {
                const list = container.querySelector('[data-tabs-list]');
                if (!list) return;
                list.style.position = 'relative';
                const indicator = DOM.create('div', { class: 'sys-tab-indicator' });
                list.appendChild(indicator);
                const update = (active) => {
                    const r = active.getBoundingClientRect();
                    const lr = list.getBoundingClientRect();
                    indicator.style.width = r.width + 'px';
                    indicator.style.transform = `translateX(${r.left - lr.left}px)`;
                };
                const tabs = list.querySelectorAll('[data-tab]');
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        tabs.forEach(t => t.classList.remove('sys-active'));
                        tab.classList.add('sys-active');
                        update(tab);
                        Audio.play('tap');
                        const panelId = tab.dataset.tab;
                        container.querySelectorAll('[data-panel]').forEach(p => {
                            if (p.dataset.panel === panelId) { p.style.display = ''; Motion.enter.fade(p, { duration: 220 }); }
                            else p.style.display = 'none';
                        });
                    });
                });
                const active = list.querySelector('.sys-active') || tabs[0];
                if (active) requestAnimationFrame(() => update(active));
            });
        }
    };

    let initialized = false;
    const boot = () => {
        if (initialized) return; initialized = true;
        Theme.inject();
        Magnetic.init();
        Ripple.attach();
        ScrollProgress.enable();
        Observe.revealOnScroll();
        TabsFixer.init();
        Hotkeys.bind('mod+k', () => Cmd.toggle());
        Hotkeys.bind('mod+/', () => Cmd.toggle());
        Hotkeys.bind('shift+?', () => Toasts.create('info', 'Cmd+K: بحث · F12: HUD · ESC: إغلاق', 5000));
        Hotkeys.bind('f12', () => PerfHUD.toggle());
        Hotkeys.bind('mod+shift+m', () => { Audio.mute(!Audio.isMuted()); Toasts.create('info', Audio.isMuted() ? '🔇 تم كتم الأصوات' : '🔊 تم تفعيل الأصوات', 2000); });
        Events.emit('sysui:ready');
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    return {
        version: '6.0.0',
        Events, Actions, Theme, Audio, Haptics, Store, Hotkeys, Observe, Cursor, ContextMenu, Tooltip, ScrollProgress, Motion, Drawer, Accordion, Tabs, TabsFixer,
        pageTransition: Page.transition,
        load: SmartLoader.execute,
        spotlight: Spotlight.show,
        resetSpotlight: Spotlight.reset,
        hud: PerfHUD.toggle,
        toast: Toasts.create,
        updateToast: Toasts.update,
        removeToast: Toasts.remove,
        clearToasts: Toasts.clear,
        toastPromise: Toasts.promise,
        confirm: Modals.confirm,
        prompt: Modals.prompt,
        danger: Modals.danger,
        modal: Modals.open,
        cmd: Cmd,
        confetti: Confetti,
        fireworks: Fireworks,
        sparkline: Sparkline,
        contextMenu: ContextMenu.show,
        tooltip: Tooltip,
        presence: UIHelpers.presence,
        statCard: UIHelpers.statCard,
        emptyState: UIHelpers.emptyState,
        skeleton: UIHelpers.generateSkeleton,
        ripple: Ripple,
        drawer: Drawer.open,
        animate: Motion.animate,
        spring: Motion.spring,
        stagger: Motion.stagger,
        fixTabs: TabsFixer.fix,
        utils: { esc: $esc, uid: $uid, debounce: $debounce, throttle: $throttle, idle: $idle, clamp: $clamp, lerp: $lerp, smoothstep: $smoothstep, hash: $hash, safeJSON: $safeJSON },
        icons: {
            trash: `<svg class="w-4 h-4 transition-transform hover:scale-110 active:scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`,
            check: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
            close: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            search: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
            settings: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
            sparkles: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L23 12l-6.714 2.143L14 21l-2.286-6.857L5 12l6.714-2.143L14 3z"/></svg>`,
            lightning: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    SysUI.Actions.registerBatch([
        { id: 'hud.toggle', title: 'تفعيل/إلغاء أدوات المطوّر (HUD)', shortcut: 'F12', icon: '📊', group: 'النظام', keywords: ['fps', 'performance', 'debug'], handler: SysUI.hud },
        { id: 'cursor.toggle', title: 'تفعيل/إلغاء المؤشر المتقدم', icon: '🎯', group: 'النظام', handler: SysUI.Cursor.toggle },
        { id: 'audio.toggle', title: 'كتم/تفعيل الأصوات', icon: '🔊', group: 'النظام', handler: () => { const m = !SysUI.Audio.isMuted(); SysUI.Audio.mute(m); SysUI.toast('info', m ? 'تم كتم الأصوات' : 'تم تفعيل الأصوات', 2000); } },
        { id: 'tabs.rescan', title: 'إعادة فحص شرائط التبويبات', icon: '🔄', group: 'النظام', handler: () => { SysUI.TabsFixer.scan(); SysUI.toast('success', 'تم إعادة فحص التبويبات', 2000); } },
        { id: 'settings', title: 'إعدادات النظام', shortcut: 'S', icon: '⚙️', group: 'التطبيق', handler: () => SysUI.toast('info', 'فتح الإعدادات') },
        { id: 'users', title: 'إدارة الطلاب', shortcut: 'U', icon: '👥', group: 'التطبيق', handler: () => SysUI.load(new Promise(r => setTimeout(r, 2500)), 'main-content') },
        { id: 'celebrate', title: 'احتفال!', icon: '🎉', group: 'مرح', handler: () => SysUI.confetti(120) },
        { id: 'fireworks', title: 'ألعاب نارية', icon: '🎆', group: 'مرح', handler: () => SysUI.fireworks(6) }
    ]);
});

export const trashSVG = SysUI.icons.trash;
export { SysUI };
