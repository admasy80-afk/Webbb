import { Scheduler } from './scheduler.js';

// 1. Shared RAF Engine (محرك الإطارات المركزي)
const MotionEngine = (() => {
    const tasks = new Set();
    let isRunning = false;
    let lastTime = 0;
    let _isStressed = false;

    const tick = (time) => {
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;
        _isStressed = delta > 17; 
        lastTime = time;

        tasks.forEach(task => task(time, delta));

        if (tasks.size > 0) {
            requestAnimationFrame(tick);
        } else {
            isRunning = false;
            lastTime = 0;
        }
    };

    return {
        add: (task) => {
            tasks.add(task);
            if (!isRunning) {
                isRunning = true;
                requestAnimationFrame(tick);
            }
        },
        remove: (task) => tasks.delete(task),
        get isStressed() { return _isStressed; }
    };
})();

export const Anim = (() => {
    const _activeAnimations = new WeakMap(); 
    const _elementStates = new WeakMap(); 
    const _numberCache = new WeakMap();
    const _observedCache = new WeakSet();

    const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let _prefersReduced = mediaQuery ? mediaQuery.matches : false;
    if (mediaQuery && mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', e => { _prefersReduced = e.matches; });
    }

    const _hasWAAPI = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
    const _hasObserver = typeof IntersectionObserver !== 'undefined';

    const TOKENS = { fast: 200, normal: 400, slow: 800, spring: 550 };
    const EASING = {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)' 
    };

    const PRESETS = {
        fadeIn: (y = '10px') => [{ opacity: 0, transform: `translateY(${y})` }, { opacity: 1, transform: 'translateY(0)' }],
        slideOutRight: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(28px) scale(0.97)' }],
        slideOutScale: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }],
        pulse: [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }]
    };

    const _cleanupStyles = (el) => {
        el.style.willChange = 'auto';
        el.style.pointerEvents = 'auto';
    };

    const run = (el, keyframes, options = {}) => {
        return new Promise((resolve) => {
            if (!el) return resolve({ status: 'skipped' });

            if (_prefersReduced) {
                Scheduler.write(() => {
                    el.style.opacity = '1';
                    el.style.transform = 'none';
                    resolve({ status: 'reduced' });
                });
                return;
            }

            if (_activeAnimations.has(el)) {
                _activeAnimations.get(el).cancel();
            }

            if (!_hasWAAPI) {
                Scheduler.write(() => resolve({ status: 'fallback' }));
                return;
            }

            const duration = typeof options.duration === 'string' ? (TOKENS[options.duration] || TOKENS.normal) : (options.duration || 400);
            const easing = EASING[options.easing] || options.easing || 'ease';
            const delay = (options.delay || 0) * 1000;

            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                if (options.pointerEvents === 'none') el.style.pointerEvents = 'none';

                const anim = el.animate(keyframes, { duration, delay, easing, fill: options.fill || 'both' });
                _activeAnimations.set(el, anim);

                anim.oncancel = () => {
                    _cleanupStyles(el);
                    _activeAnimations.delete(el);
                    resolve({ status: 'cancelled' });
                };

                anim.onfinish = () => {
                    _cleanupStyles(el);
                    _activeAnimations.delete(el);

                    if (options.removeOnFinish) {
                        el.remove();
                    } else if (options.fill === 'forwards') {
                        try { if (anim.commitStyles) anim.commitStyles(); } catch (e) {}
                        anim.cancel(); 
                    }
                    resolve({ status: 'completed' });
                };
            });
        });
    };

    const _globalObserver = _hasObserver ? new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const target = e.target;

            if (target.hasAttribute('data-w')) {
                Scheduler.write(() => {
                    target.style.width = target.dataset.w;
                    _globalObserver.unobserve(target);
                });
            } else if (target.dataset.anim) {
                const animType = target.dataset.anim;
                const delay = parseFloat(target.dataset.animDelay) || 0;
                
                if (animType === 'fade-in') Anim.fadeIn(target, delay);
                _globalObserver.unobserve(target);
            }
        });
    }, { threshold: 0.1 }) : null;

    return {
        // ✨ الدوال اللي كانت مفقودة وسببت الانهيار رجعناها هنا:

        triggerRipple(btn) {
            if (!btn) return;
            Scheduler.write(() => { 
                btn.classList.remove('__run-ripple'); 
                void btn.offsetWidth; 
                btn.classList.add('__run-ripple'); 
            });
        },

        progressBars(container) {
            if (!container || !_globalObserver) return;
            container.querySelectorAll('[data-w]').forEach(bar => _globalObserver.observe(bar));
        },

        staggerFadeIn(container, selector, baseDelay = 0.05) {
            if (!container) return;
            const els = container.querySelectorAll(selector);
            els.forEach((el, i) => this.fadeIn(el, i * baseDelay));
        },

        // دعم التوافقية للبارامترات القديمة
        fadeIn(el, optionsOrDelay = 0) {
            const delay = typeof optionsOrDelay === 'number' ? optionsOrDelay : (optionsOrDelay.delay || 0);
            return run(el, PRESETS.fadeIn('10px'), { duration: 400, delay: delay, easing: 'ease' });
        },

        slideOut(el, mode = 'right') {
            return run(el, mode === 'right' ? PRESETS.slideOutRight : PRESETS.slideOutScale, {
                duration: 380,
                easing: 'cubic-bezier(0.4,0,0.2,1)',
                pointerEvents: 'none',
                fill: 'forwards'
            });
        },

        pulse(el) {
            return run(el, PRESETS.pulse, { duration: 550, easing: 'ease' });
        },

        // دعم التوافقية لدالة الأرقام
        animateValue(id, endValue, durationOrOptions = 1200, suffixString = '') {
            return new Promise((resolve) => {
                const obj = typeof id === 'string' ? document.getElementById(id) : id;
                if (!obj) return resolve();

                const duration = typeof durationOrOptions === 'object' ? (durationOrOptions.duration || 1200) : durationOrOptions;
                const suffix = typeof durationOrOptions === 'object' ? (durationOrOptions.suffix || '') : suffixString;
                
                const sanitizeNum = v => parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) || 0;
                const targetVal = sanitizeNum(endValue);
                const startVal  = _numberCache.get(obj) || 0;
                
                if (startVal === targetVal) {
                    obj.textContent = targetVal.toLocaleString('ar-SA') + suffix;
                    return resolve();
                }

                let startTime = null;
                const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

                const task = (timestamp) => {
                    if (!document.body.contains(obj)) {
                        MotionEngine.remove(task);
                        return resolve();
                    }
                    if (!startTime) startTime = timestamp;
                    
                    const progress = Math.min((timestamp - startTime) / duration, 1);
                    const current = Math.floor(easeOutCubic(progress) * (targetVal - startVal) + startVal);
                    
                    obj.textContent = current.toLocaleString('ar-SA') + suffix;

                    if (progress >= 1) {
                        MotionEngine.remove(task);
                        _numberCache.set(obj, targetVal);
                        obj.textContent = targetVal.toLocaleString('ar-SA') + suffix;
                        resolve();
                    }
                };

                MotionEngine.add(task);
            });
        },

        observe(container = document.body) {
            if (!_globalObserver) return;
            container.querySelectorAll('[data-w], [data-anim]').forEach(el => {
                if (!_observedCache.has(el)) {
                    _observedCache.add(el);
                    _globalObserver.observe(el);
                }
            });
        }
    };
})();
