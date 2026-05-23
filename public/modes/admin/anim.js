import { Scheduler } from './scheduler.js';

// 1. Shared RAF Engine (محرك الإطارات المركزي ومراقب الأداء)
const MotionEngine = (() => {
    const tasks = new Set();
    let isRunning = false;
    let lastTime = 0;
    let _isStressed = false;

    const tick = (time) => {
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;
        
        // Frame Budget Monitor: إذا تجاوز الفريم 16.6ms (أقل من 60fps)
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
    // State & Memory Management
    const _activeAnimations = new WeakMap(); 
    const _elementStates = new WeakMap(); // State Machine
    const _numberCache = new WeakMap();
    const _observedCache = new WeakSet(); // لمنع تكرار الـ observe

    // Reactive Preferences
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
        fadeIn: (y = '12px') => [{ opacity: 0, transform: `translateY(${y})` }, { opacity: 1, transform: 'translateY(0)' }],
        slideOutRight: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(28px) scale(0.97)' }],
        slideOutScale: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }],
        pulse: [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }]
    };

    const _setState = (el, state) => {
        _elementStates.set(el, state);
    };

    const _cleanupStyles = (el) => {
        el.style.willChange = 'auto';
        el.style.pointerEvents = 'auto';
    };

    let _debug = false;
    const _log = (msg, ...args) => _debug && console.log(`%c[Motion]%c ${msg}`, 'color: #00ffcc; font-weight: bold;', 'color: auto;', ...args);

    /**
     * Unified Run Layer (مع حلول الـ Silent Death والـ Conflict)
     */
    const run = (el, keyframes, options = {}) => {
        return new Promise((resolve) => {
            if (!el) return resolve({ status: 'skipped' });

            if (_prefersReduced) {
                _setState(el, 'idle');
                Scheduler.write(() => {
                    el.style.opacity = '1';
                    el.style.transform = 'none';
                    resolve({ status: 'reduced' });
                });
                return;
            }

            // Conflict Resolution (State Machine)
            if (_activeAnimations.has(el)) {
                _log('Collision detected. Cancelling ghost animation on:', el);
                _setState(el, 'cancelled');
                _activeAnimations.get(el).cancel();
            }

            if (!_hasWAAPI) {
                // Graceful fallback
                Scheduler.write(() => {
                    resolve({ status: 'fallback' });
                });
                return;
            }

            // Adaptive Rendering: تقليل التأثيرات إذا كان المعالج مضغوطاً
            if (MotionEngine.isStressed && options.skipOnStress) {
                _log('Frame drop detected, skipping heavy effect.');
                return resolve({ status: 'skipped-stress' });
            }

            const duration = typeof options.duration === 'string' ? (TOKENS[options.duration] || TOKENS.normal) : (options.duration || TOKENS.normal);
            const easing = EASING[options.easing] || options.easing || EASING.smooth;
            const delay = (options.delay || 0) * 1000;

            _setState(el, 'active');

            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                if (options.pointerEvents === 'none') el.style.pointerEvents = 'none';

                const anim = el.animate(keyframes, { duration, delay, easing, fill: options.fill || 'both' });
                _activeAnimations.set(el, anim);

                // حل مشكلة الـ Silent Async Death
                anim.oncancel = () => {
                    _cleanupStyles(el);
                    _activeAnimations.delete(el);
                    resolve({ status: 'cancelled' });
                };

                anim.onfinish = () => {
                    _setState(el, 'idle');
                    _cleanupStyles(el);
                    _activeAnimations.delete(el);

                    if (options.removeOnFinish) {
                        el.remove();
                    } else if (options.fill === 'forwards') {
                        // استخدام API المتصفح الأصلي لتثبيت الـ Keyframes بدلاً من Object.assign العشوائي
                        try {
                            if (anim.commitStyles) anim.commitStyles();
                        } catch (e) {
                            _log('commitStyles not supported or failed', e);
                        }
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
                
                if (animType === 'fade-in') Anim.fadeIn(target, { delay });
                else if (animType === 'spring-up') Anim.fadeIn(target, { delay, easing: 'spring', yOffset: '20px' });
                
                _globalObserver.unobserve(target);
            }
        });
    }, { threshold: 0.05 }) : null;

    return {
        set debug(val) { _debug = !!val; },
        get tokens() { return TOKENS; },
        get state() { return MotionEngine; }, // فحص حالة المحرك برمجياً

        run,

        cancel(el) {
            if (_activeAnimations.has(el)) {
                _setState(el, 'cancelled');
                _activeAnimations.get(el).cancel(); // سيقوم oncancel بعمل الـ Cleanup واستدعاء resolve
                _log('Manually cancelled animation on:', el);
            }
        },

        // استخدام Master RAF و Math.round لحل الـ Jitter والـ Overhead
        animateValue(id, endValue, options = {}) {
            return new Promise((resolve) => {
                const obj = typeof id === 'string' ? document.getElementById(id) : id;
                if (!obj) return resolve();

                const { duration = TOKENS.slow, suffix = '', locale = 'ar-SA' } = options;
                const sanitizeNum = v => parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) || 0;
                
                const targetVal = sanitizeNum(endValue);
                const startVal  = _numberCache.get(obj) || 0;
                
                if (startVal === targetVal) {
                    obj.textContent = targetVal.toLocaleString(locale) + suffix;
                    return resolve();
                }

                let startTime = null;
                const task = (timestamp) => {
                    if (!document.body.contains(obj)) {
                        MotionEngine.remove(task);
                        return resolve();
                    }
                    if (!startTime) startTime = timestamp;
                    
                    const progress = Math.min((timestamp - startTime) / duration, 1);
                    const easeProgress = 1 - Math.pow(1 - progress, 3);
                    const current = Math.round(easeProgress * (targetVal - startVal) + startVal);
                    
                    // تحديث مباشر داخل الـ RAF بدلاً من إرهاق الـ Scheduler
                    obj.textContent = current.toLocaleString(locale) + suffix;

                    if (progress === 1) {
                        MotionEngine.remove(task);
                        _numberCache.set(obj, targetVal);
                        resolve();
                    }
                };

                MotionEngine.add(task);
            });
        },

        fadeIn(el, options = {}) {
            return run(el, PRESETS.fadeIn(options.yOffset), {
                duration: options.duration || 'normal',
                easing: options.easing || 'smooth',
                delay: options.delay || 0
            });
        },

        // Timelines & Orchestration
        async sequence(sequenceArray) {
            for (const animationFn of sequenceArray) {
                await animationFn();
            }
        },

        async parallel(parallelArray) {
            await Promise.all(parallelArray.map(fn => fn()));
        },

        observe(container = document.body) {
            if (!_globalObserver) return;
            container.querySelectorAll('[data-w], [data-anim]').forEach(el => {
                if (!_observedCache.has(el)) { // حل تكرار الـ Observe
                    _observedCache.add(el);
                    _globalObserver.observe(el);
                }
            });
        }
    };
})();
