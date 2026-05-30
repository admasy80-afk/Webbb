import { Scheduler } from './scheduler.js';

const MotionEngine = (() => {
    const tasks = new Set();
    let isRunning = false;
    let lastTime = 0;
    let _isStressed = false;
    let _fps = 60;
    let _frameCount = 0;
    let _fpsLastTime = 0;

    const tick = (time) => {
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;
        _isStressed = delta > 20;
        lastTime = time;

        _frameCount++;
        if (time - _fpsLastTime >= 1000) {
            _fps = _frameCount;
            _frameCount = 0;
            _fpsLastTime = time;
        }

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
        get isStressed() { return _isStressed; },
        get fps() { return _fps; },
        get taskCount() { return tasks.size; }
    };
})();

export const Anim = (() => {
    const _activeAnimations = new WeakMap();
    const _elementStates = new WeakMap();
    const _numberCache = new WeakMap();
    const _observedCache = new WeakSet();
    const _magnetTargets = new WeakMap();
    const _trailCleanup = new WeakMap();
    const _springStates = new WeakMap();

    const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let _prefersReduced = mediaQuery ? mediaQuery.matches : false;
    if (mediaQuery && mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', e => { _prefersReduced = e.matches; });
    }

    const _hasWAAPI = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
    const _hasObserver = typeof IntersectionObserver !== 'undefined';

    const TOKENS = {
        micro: 80,
        snap: 120,
        fast: 180,
        normal: 300,
        smooth: 420,
        slow: 560,
        spring: 650,
        cinematic: 900
    };

    const EASING = {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        expo: 'cubic-bezier(0.22, 1, 0.36, 1)',
        back: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        elastic: 'cubic-bezier(0.5, 1.8, 0.5, 0.8)',
        decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
        accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
        sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
        linear: 'linear'
    };

    const PRESETS = {
        fadeIn: (y = '12px') => [
            { opacity: 0, transform: `translate3d(0,${y},0) scale(0.97)`, filter: 'blur(4px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
        ],
        fadeInUp: [
            { opacity: 0, transform: 'translate3d(0,24px,0) scale(0.96)', filter: 'blur(6px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
        ],
        fadeInDown: [
            { opacity: 0, transform: 'translate3d(0,-20px,0) scale(0.97)', filter: 'blur(4px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
        ],
        fadeInLeft: [
            { opacity: 0, transform: 'translate3d(-28px,0,0) scale(0.96)', filter: 'blur(6px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
        ],
        fadeInRight: [
            { opacity: 0, transform: 'translate3d(28px,0,0) scale(0.96)', filter: 'blur(6px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
        ],
        slideOutRight: [
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' },
            { opacity: 0, transform: 'translate3d(32px,0,0) scale(0.96)', filter: 'blur(4px)' }
        ],
        slideOutLeft: [
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' },
            { opacity: 0, transform: 'translate3d(-32px,0,0) scale(0.96)', filter: 'blur(4px)' }
        ],
        slideOutScale: [
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' },
            { opacity: 0, transform: 'translate3d(0,12px,0) scale(0.92)', filter: 'blur(8px)' }
        ],
        pulse: [
            { transform: 'translate3d(0,0,0) scale(1)' },
            { transform: 'translate3d(0,0,0) scale(1.06)' },
            { transform: 'translate3d(0,0,0) scale(1)' }
        ],
        heartbeat: [
            { transform: 'scale(1)' },
            { transform: 'scale(1.08)' },
            { transform: 'scale(0.96)' },
            { transform: 'scale(1.04)' },
            { transform: 'scale(1)' }
        ],
        shake: [
            { transform: 'translate3d(0,0,0)' },
            { transform: 'translate3d(-8px,0,0)' },
            { transform: 'translate3d(8px,0,0)' },
            { transform: 'translate3d(-6px,0,0)' },
            { transform: 'translate3d(6px,0,0)' },
            { transform: 'translate3d(-3px,0,0)' },
            { transform: 'translate3d(3px,0,0)' },
            { transform: 'translate3d(0,0,0)' }
        ],
        jelly: [
            { transform: 'scale3d(1,1,1)' },
            { transform: 'scale3d(1.18,0.82,1)' },
            { transform: 'scale3d(0.84,1.16,1)' },
            { transform: 'scale3d(1.1,0.9,1)' },
            { transform: 'scale3d(0.95,1.05,1)' },
            { transform: 'scale3d(1.02,0.98,1)' },
            { transform: 'scale3d(1,1,1)' }
        ],
        popIn: [
            { opacity: 0, transform: 'translate3d(0,0,0) scale(0.5)', filter: 'blur(12px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1.08)', filter: 'blur(0px)', offset: 0.7 },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(0.96)', offset: 0.85 },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
        ],
        popOut: [
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' },
            { opacity: 0, transform: 'translate3d(0,0,0) scale(0.6)', filter: 'blur(10px)' }
        ],
        flipIn: [
            { opacity: 0, transform: 'perspective(600px) rotateX(-25deg) translate3d(0,20px,0)', filter: 'blur(4px)' },
            { opacity: 1, transform: 'perspective(600px) rotateX(0deg) translate3d(0,0,0)', filter: 'blur(0px)' }
        ],
        flipOut: [
            { opacity: 1, transform: 'perspective(600px) rotateX(0deg) translate3d(0,0,0)', filter: 'blur(0px)' },
            { opacity: 0, transform: 'perspective(600px) rotateX(20deg) translate3d(0,-15px,0)', filter: 'blur(4px)' }
        ],
        rotateIn: [
            { opacity: 0, transform: 'translate3d(0,0,0) rotate(-8deg) scale(0.92)', filter: 'blur(4px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', filter: 'blur(0px)' }
        ],
        glowPulse: (color = 'rgba(99,102,241,0.6)') => [
            { boxShadow: `0 0 0 0 ${color}` },
            { boxShadow: `0 0 0 12px transparent` }
        ],
        morphIn: [
            { opacity: 0, transform: 'translate3d(0,30px,0) scale(0.88) skewY(3deg)', filter: 'blur(8px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1) skewY(0deg)', filter: 'blur(0px)' }
        ],
        spotlight: [
            { opacity: 0, transform: 'translate3d(0,0,0) scale(0.94)', filter: 'brightness(0.3) blur(6px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'brightness(1) blur(0px)' }
        ],
        typewriter: null,
        liquidIn: [
            { opacity: 0, transform: 'translate3d(0,20px,0) scaleX(0.85) scaleY(0.9)', filter: 'blur(6px)' },
            { opacity: 0.6, transform: 'translate3d(0,-4px,0) scaleX(1.04) scaleY(0.97)', filter: 'blur(2px)', offset: 0.6 },
            { opacity: 1, transform: 'translate3d(0,0,0) scaleX(1) scaleY(1)', filter: 'blur(0px)' }
        ]
    };

    const _stressMultiplier = () => {
        if (MotionEngine.fps < 30) return 0.4;
        if (MotionEngine.isStressed) return 0.65;
        return 1;
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
                    el.style.filter = 'none';
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

            const mult = _stressMultiplier();
            const baseDuration = typeof options.duration === 'string' ? (TOKENS[options.duration] || TOKENS.normal) : (options.duration || 400);
            const duration = Math.round(baseDuration * mult);
            const easing = EASING[options.easing] || options.easing || EASING.expo;
            const delay = (options.delay || 0) * 1000;

            const filteredKeyframes = (mult < 0.65)
                ? keyframes.map(k => {
                    const f = { ...k };
                    if (f.filter) delete f.filter;
                    return f;
                })
                : keyframes;

            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                if (options.pointerEvents === 'none') el.style.pointerEvents = 'none';

                const anim = el.animate(filteredKeyframes, {
                    duration,
                    delay,
                    easing,
                    fill: options.fill || 'both',
                    composite: options.composite || 'replace'
                });

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
                    target.style.transition = 'width 800ms cubic-bezier(0.22,1,0.36,1)';
                    target.style.width = target.dataset.w;
                    _globalObserver.unobserve(target);
                });
            } else if (target.dataset.anim) {
                const animType = target.dataset.anim;
                const delay = parseFloat(target.dataset.animDelay) || 0;

                const animMap = {
                    'fade-in': () => Anim.fadeIn(target, delay),
                    'fade-up': () => Anim.run(target, PRESETS.fadeInUp, { duration: TOKENS.smooth, delay, easing: 'expo' }),
                    'fade-left': () => Anim.run(target, PRESETS.fadeInLeft, { duration: TOKENS.smooth, delay, easing: 'expo' }),
                    'fade-right': () => Anim.run(target, PRESETS.fadeInRight, { duration: TOKENS.smooth, delay, easing: 'expo' }),
                    'flip': () => Anim.run(target, PRESETS.flipIn, { duration: TOKENS.spring, delay, easing: 'expo' }),
                    'pop': () => Anim.run(target, PRESETS.popIn, { duration: TOKENS.spring, delay, easing: 'expo' }),
                    'morph': () => Anim.run(target, PRESETS.morphIn, { duration: TOKENS.cinematic, delay, easing: 'expo' }),
                    'spotlight': () => Anim.run(target, PRESETS.spotlight, { duration: TOKENS.slow, delay, easing: 'expo' }),
                    'liquid': () => Anim.run(target, PRESETS.liquidIn, { duration: TOKENS.spring, delay, easing: 'expo' }),
                    'rotate': () => Anim.run(target, PRESETS.rotateIn, { duration: TOKENS.smooth, delay, easing: 'back' })
                };

                if (animMap[animType]) animMap[animType]();
                _globalObserver.unobserve(target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }) : null;

    const _setupMagnet = (el, strength = 0.35) => {
        if (!el || _magnetTargets.has(el)) return;

        const handleMove = (e) => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) * strength;
            const dy = (e.clientY - cy) * strength;

            Scheduler.write(() => {
                el.style.transition = 'transform 200ms cubic-bezier(0.22,1,0.36,1)';
                el.style.transform = `translate3d(${dx}px,${dy}px,0) scale(1.04)`;
            });
        };

        const handleLeave = () => {
            Scheduler.write(() => {
                el.style.transition = 'transform 500ms cubic-bezier(0.34,1.56,0.64,1)';
                el.style.transform = 'translate3d(0,0,0) scale(1)';
            });
        };

        el.addEventListener('mousemove', handleMove);
        el.addEventListener('mouseleave', handleLeave);

        _magnetTargets.set(el, { handleMove, handleLeave });
    };

    const _removeMagnet = (el) => {
        if (!el || !_magnetTargets.has(el)) return;
        const { handleMove, handleLeave } = _magnetTargets.get(el);
        el.removeEventListener('mousemove', handleMove);
        el.removeEventListener('mouseleave', handleLeave);
        _magnetTargets.delete(el);
    };

    const _springPhysics = (el, targetX, targetY) => {
        if (!el) return;

        const state = _springStates.get(el) || { x: 0, y: 0, vx: 0, vy: 0 };
        const stiffness = 0.12;
        const damping = 0.75;

        const task = () => {
            state.vx += (targetX - state.x) * stiffness;
            state.vy += (targetY - state.y) * stiffness;
            state.vx *= damping;
            state.vy *= damping;
            state.x += state.vx;
            state.y += state.vy;

            Scheduler.write(() => {
                el.style.transform = `translate3d(${state.x}px,${state.y}px,0)`;
            });

            if (Math.abs(state.vx) < 0.01 && Math.abs(state.vy) < 0.01 &&
                Math.abs(targetX - state.x) < 0.1 && Math.abs(targetY - state.y) < 0.1) {
                MotionEngine.remove(task);
                _springStates.delete(el);
            }
        };

        _springStates.set(el, state);
        MotionEngine.add(task);
    };

    const _createParticleExplosion = (x, y, colors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981']) => {
        const container = document.createElement('div');
        container.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;overflow:hidden;`;
        document.body.appendChild(container);

        const count = MotionEngine.isStressed ? 8 : 16;

        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 4 + Math.random() * 6;
            const angle = (i / count) * Math.PI * 2;
            const velocity = 60 + Math.random() * 80;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity;

            p.style.cssText = `
                position:absolute;
                left:${x}px;top:${y}px;
                width:${size}px;height:${size}px;
                border-radius:50%;
                background:${color};
                pointer-events:none;
                box-shadow:0 0 ${size * 2}px ${color};
            `;
            container.appendChild(p);

            p.animate([
                { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
                { opacity: 0, transform: `translate3d(${tx}px,${ty - 30}px,0) scale(0)` }
            ], {
                duration: 600 + Math.random() * 400,
                delay: Math.random() * 80,
                easing: EASING.accelerate,
                fill: 'forwards'
            });
        }

        setTimeout(() => container.remove(), 1200);
    };

    const _createMouseTrail = (container = document.body) => {
        if (_trailCleanup.has(container)) return;

        const dots = [];
        const DOT_COUNT = MotionEngine.isStressed ? 6 : 12;
        const positions = [];
        let mouse = { x: 0, y: 0 };
        let animFrame;

        for (let i = 0; i < DOT_COUNT; i++) {
            const d = document.createElement('div');
            const size = Math.max(3, 10 - i * 0.6);
            const alpha = 1 - (i / DOT_COUNT) * 0.85;
            d.style.cssText = `
                position:fixed;
                width:${size}px;height:${size}px;
                border-radius:50%;
                background:rgba(99,102,241,${alpha});
                pointer-events:none;
                z-index:99998;
                transition:none;
                box-shadow: 0 0 ${size * 1.5}px rgba(99,102,241,${alpha * 0.6});
            `;
            document.body.appendChild(d);
            dots.push(d);
            positions.push({ x: 0, y: 0 });
        }

        const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
        document.addEventListener('mousemove', onMove);

        const lerp = (a, b, t) => a + (b - a) * t;

        const update = () => {
            positions[0].x = lerp(positions[0].x, mouse.x, 0.35);
            positions[0].y = lerp(positions[0].y, mouse.y, 0.35);

            for (let i = 1; i < DOT_COUNT; i++) {
                positions[i].x = lerp(positions[i].x, positions[i - 1].x, 0.5);
                positions[i].y = lerp(positions[i].y, positions[i - 1].y, 0.5);
            }

            for (let i = 0; i < DOT_COUNT; i++) {
                const half = dots[i].offsetWidth / 2;
                dots[i].style.transform = `translate3d(${positions[i].x - half}px,${positions[i].y - half}px,0)`;
            }

            animFrame = requestAnimationFrame(update);
        };

        animFrame = requestAnimationFrame(update);

        const cleanup = () => {
            document.removeEventListener('mousemove', onMove);
            cancelAnimationFrame(animFrame);
            dots.forEach(d => d.remove());
            _trailCleanup.delete(container);
        };

        _trailCleanup.set(container, cleanup);
        return cleanup;
    };

    const _typewriterAnim = (el, text, speed = 40) => {
        return new Promise((resolve) => {
            if (!el) return resolve();
            el.textContent = '';
            el.style.opacity = '1';
            let i = 0;
            const cursor = document.createElement('span');
            cursor.textContent = '|';
            cursor.style.cssText = 'animation: __blink 0.7s step-end infinite; opacity:1;';

            if (!document.getElementById('__blink-style')) {
                const s = document.createElement('style');
                s.id = '__blink-style';
                s.textContent = '@keyframes __blink{0%,100%{opacity:1}50%{opacity:0}}';
                document.head.appendChild(s);
            }

            el.appendChild(cursor);

            const type = () => {
                if (i < text.length) {
                    cursor.insertAdjacentText('beforebegin', text[i]);
                    i++;
                    setTimeout(type, speed + Math.random() * 20);
                } else {
                    cursor.animate([{ opacity: 1 }, { opacity: 0 }], {
                        duration: 300, delay: 800, fill: 'forwards'
                    }).onfinish = () => { cursor.remove(); resolve(); };
                }
            };
            type();
        });
    };

    const _createRippleAt = (el, x, y) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2.2;
        const ripple = document.createElement('span');
        ripple.style.cssText = `
            position:absolute;
            border-radius:50%;
            width:${size}px;height:${size}px;
            left:${x - rect.left - size / 2}px;
            top:${y - rect.top - size / 2}px;
            pointer-events:none;
            background:rgba(255,255,255,0.18);
            transform:scale(0);
        `;

        const prev = el.style.position;
        if (!prev || prev === 'static') el.style.position = 'relative';
        el.style.overflow = 'hidden';
        el.appendChild(ripple);

        ripple.animate([
            { transform: 'scale(0)', opacity: 1 },
            { transform: 'scale(1)', opacity: 0 }
        ], { duration: 600, easing: EASING.decelerate, fill: 'forwards' }).onfinish = () => ripple.remove();
    };

    const _shimmer = (el) => {
        if (!el) return;
        if (!document.getElementById('__shimmer-style')) {
            const s = document.createElement('style');
            s.id = '__shimmer-style';
            s.textContent = `
                @keyframes __shimmer {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                .__shimmer-active {
                    background: linear-gradient(90deg,
                        transparent 0%,
                        rgba(255,255,255,0.08) 30%,
                        rgba(255,255,255,0.22) 50%,
                        rgba(255,255,255,0.08) 70%,
                        transparent 100%
                    ) !important;
                    background-size: 200% auto !important;
                    animation: __shimmer 1.6s linear infinite !important;
                }
            `;
            document.head.appendChild(s);
        }
        el.classList.add('__shimmer-active');
        return () => el.classList.remove('__shimmer-active');
    };

    const _tiltEffect = (el, maxTilt = 12) => {
        if (!el) return;

        const handleMove = (e) => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / (rect.width / 2);
            const dy = (e.clientY - cy) / (rect.height / 2);
            const rotX = -dy * maxTilt;
            const rotY = dx * maxTilt;

            Scheduler.write(() => {
                el.style.transition = 'transform 100ms linear';
                el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.03,1.03,1.03)`;
            });
        };

        const handleLeave = () => {
            Scheduler.write(() => {
                el.style.transition = 'transform 500ms cubic-bezier(0.34,1.56,0.64,1)';
                el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
            });
        };

        el.addEventListener('mousemove', handleMove);
        el.addEventListener('mouseleave', handleLeave);

        return () => {
            el.removeEventListener('mousemove', handleMove);
            el.removeEventListener('mouseleave', handleLeave);
        };
    };

    const _countUp = (el, endValue, duration, suffix) => {
        return new Promise((resolve) => {
            if (!el) return resolve();

            const sanitizeNum = v => parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) || 0;
            const targetVal = sanitizeNum(endValue);
            const startVal = _numberCache.get(el) || 0;

            if (startVal === targetVal) {
                el.textContent = targetVal.toLocaleString('ar-SA') + suffix;
                return resolve();
            }

            let startTime = null;
            const easeOutExpo = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

            const task = (timestamp) => {
                if (!document.body.contains(el)) {
                    MotionEngine.remove(task);
                    return resolve();
                }
                if (!startTime) startTime = timestamp;

                const progress = Math.min((timestamp - startTime) / duration, 1);
                const current = Math.floor(easeOutExpo(progress) * (targetVal - startVal) + startVal);

                el.textContent = current.toLocaleString('ar-SA') + suffix;

                if (progress >= 1) {
                    MotionEngine.remove(task);
                    _numberCache.set(el, targetVal);
                    el.textContent = targetVal.toLocaleString('ar-SA') + suffix;
                    resolve();
                }
            };

            MotionEngine.add(task);
        });
    };

    const _floatElement = (el, amplitude = 4, period = 3000) => {
        if (!el) return;
        let startTime = null;

        const task = (timestamp) => {
            if (!startTime) startTime = timestamp;
            if (!document.body.contains(el)) {
                MotionEngine.remove(task);
                return;
            }
            const t = (timestamp - startTime) / period;
            const y = Math.sin(t * Math.PI * 2) * amplitude;
            const x = Math.sin(t * Math.PI * 1.3) * (amplitude * 0.3);
            el.style.transform = `translate3d(${x}px,${y}px,0)`;
        };

        MotionEngine.add(task);
        return () => MotionEngine.remove(task);
    };

    const _breatheElement = (el, scale = 0.025, period = 2800) => {
        if (!el) return;
        let startTime = null;

        const task = (timestamp) => {
            if (!startTime) startTime = timestamp;
            if (!document.body.contains(el)) {
                MotionEngine.remove(task);
                return;
            }
            const t = (timestamp - startTime) / period;
            const s = 1 + Math.sin(t * Math.PI * 2) * scale;
            el.style.transform = `scale3d(${s},${s},1)`;
        };

        MotionEngine.add(task);
        return () => MotionEngine.remove(task);
    };

    const _morphBetween = (el, fromKeyframes, toKeyframes, progress) => {
        if (!el) return;
        const lerp = (a, b, t) => a + (b - a) * t;

        const merged = fromKeyframes.map((fk, i) => {
            const tk = toKeyframes[i] || {};
            const result = {};
            Object.keys(fk).forEach(key => {
                if (typeof fk[key] === 'number' && typeof tk[key] === 'number') {
                    result[key] = lerp(fk[key], tk[key], progress);
                } else {
                    result[key] = progress < 0.5 ? fk[key] : (tk[key] || fk[key]);
                }
            });
            return result;
        });

        return merged;
    };

    const _glitchEffect = (el, duration = 600) => {
        if (!el) return;
        if (!document.getElementById('__glitch-style')) {
            const s = document.createElement('style');
            s.id = '__glitch-style';
            s.textContent = `
                @keyframes __glitch1 {
                    0%,100%{clip-path:inset(0 0 100% 0);transform:translate3d(0,0,0)}
                    10%{clip-path:inset(20% 0 60% 0);transform:translate3d(-3px,0,0)}
                    20%{clip-path:inset(50% 0 30% 0);transform:translate3d(3px,0,0)}
                    30%{clip-path:inset(10% 0 80% 0);transform:translate3d(0,0,0)}
                    40%{clip-path:inset(70% 0 10% 0);transform:translate3d(-2px,0,0)}
                    50%{clip-path:inset(40% 0 40% 0);transform:translate3d(2px,0,0)}
                    60%{clip-path:inset(0 0 100% 0);transform:translate3d(0,0,0)}
                }
                .__glitch { position:relative; }
                .__glitch::before,.__glitch::after {
                    content:attr(data-text);
                    position:absolute;top:0;left:0;width:100%;height:100%;
                }
                .__glitch::before {
                    color:#00ffff;
                    animation:__glitch1 0.3s steps(1) infinite;
                    mix-blend-mode:screen;
                }
                .__glitch::after {
                    color:#ff00ff;
                    animation:__glitch1 0.3s steps(1) reverse infinite;
                    mix-blend-mode:screen;
                    animation-delay:0.05s;
                }
            `;
            document.head.appendChild(s);
        }

        el.setAttribute('data-text', el.textContent);
        el.classList.add('__glitch');
        setTimeout(() => el.classList.remove('__glitch'), duration);
    };

    const _waveText = (el, baseDelay = 0.04) => {
        if (!el) return;
        const text = el.textContent;
        el.innerHTML = '';

        const spans = text.split('').map((char, i) => {
            const s = document.createElement('span');
            s.style.cssText = 'display:inline-block;';
            s.textContent = char === ' ' ? '\u00A0' : char;
            el.appendChild(s);
            return s;
        });

        spans.forEach((s, i) => {
            s.animate([
                { transform: 'translate3d(0,0,0)' },
                { transform: 'translate3d(0,-8px,0)' },
                { transform: 'translate3d(0,0,0)' }
            ], {
                duration: 500,
                delay: i * (baseDelay * 1000),
                easing: EASING.spring,
                fill: 'both'
            });
        });
    };

    const _revealText = (el, delay = 0) => {
        if (!el) return;
        const wrapper = document.createElement('span');
        wrapper.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;';
        const inner = document.createElement('span');
        inner.style.cssText = 'display:inline-block;';
        inner.textContent = el.textContent;
        wrapper.appendChild(inner);
        el.innerHTML = '';
        el.appendChild(wrapper);

        return run(inner, [
            { transform: 'translate3d(0,110%,0)', opacity: 0 },
            { transform: 'translate3d(0,0,0)', opacity: 1 }
        ], { duration: TOKENS.smooth, delay, easing: 'expo', fill: 'forwards' });
    };

    return {
        run,
        TOKENS,
        EASING,
        PRESETS,

        triggerRipple(btn, event) {
            if (!btn) return;
            if (event) {
                _createRippleAt(btn, event.clientX, event.clientY);
            } else {
                Scheduler.write(() => {
                    btn.classList.remove('__run-ripple');
                    void btn.offsetWidth;
                    btn.classList.add('__run-ripple');
                });
            }
        },

        progressBars(container) {
            if (!container || !_globalObserver) return;
            container.querySelectorAll('[data-w]').forEach(bar => _globalObserver.observe(bar));
        },

        staggerFadeIn(container, selector, baseDelay = 0.04) {
            if (!container) return;
            const els = container.querySelectorAll(selector);
            const promises = [];
            els.forEach((el, i) => promises.push(this.fadeIn(el, i * baseDelay)));
            return Promise.all(promises);
        },

        stagger(elements, keyframes, options = {}, baseDelay = 0.05) {
            const els = Array.isArray(elements) ? elements : Array.from(elements);
            const promises = [];
            els.forEach((el, i) => {
                promises.push(run(el, keyframes, { ...options, delay: (options.delay || 0) + i * baseDelay }));
            });
            return Promise.all(promises);
        },

        fadeIn(el, optionsOrDelay = 0) {
            const delay = typeof optionsOrDelay === 'number' ? optionsOrDelay : (optionsOrDelay.delay || 0);
            return run(el, PRESETS.fadeIn('12px'), { duration: TOKENS.smooth, delay, easing: 'expo' });
        },

        fadeInUp(el, delay = 0) {
            return run(el, PRESETS.fadeInUp, { duration: TOKENS.smooth, delay, easing: 'expo' });
        },

        fadeInDown(el, delay = 0) {
            return run(el, PRESETS.fadeInDown, { duration: TOKENS.smooth, delay, easing: 'expo' });
        },

        fadeInLeft(el, delay = 0) {
            return run(el, PRESETS.fadeInLeft, { duration: TOKENS.smooth, delay, easing: 'expo' });
        },

        fadeInRight(el, delay = 0) {
            return run(el, PRESETS.fadeInRight, { duration: TOKENS.smooth, delay, easing: 'expo' });
        },

        slideOut(el, mode = 'right') {
            const kf = mode === 'right' ? PRESETS.slideOutRight : mode === 'left' ? PRESETS.slideOutLeft : PRESETS.slideOutScale;
            return run(el, kf, { duration: TOKENS.normal, easing: 'smooth', pointerEvents: 'none', fill: 'forwards' });
        },

        pulse(el) {
            return run(el, PRESETS.pulse, { duration: TOKENS.spring, easing: 'expo' });
        },

        heartbeat(el) {
            return run(el, PRESETS.heartbeat, { duration: TOKENS.fast, easing: 'ease' });
        },

        shake(el) {
            return run(el, PRESETS.shake, { duration: TOKENS.normal, easing: 'ease' });
        },

        jelly(el) {
            return run(el, PRESETS.jelly, { duration: TOKENS.spring, easing: 'expo' });
        },

        popIn(el, delay = 0) {
            return run(el, PRESETS.popIn, { duration: TOKENS.spring, delay, easing: 'expo' });
        },

        popOut(el) {
            return run(el, PRESETS.popOut, { duration: TOKENS.normal, easing: 'accelerate', fill: 'forwards', removeOnFinish: true });
        },

        flipIn(el, delay = 0) {
            return run(el, PRESETS.flipIn, { duration: TOKENS.spring, delay, easing: 'expo' });
        },

        flipOut(el) {
            return run(el, PRESETS.flipOut, { duration: TOKENS.normal, easing: 'accelerate', fill: 'forwards' });
        },

        rotateIn(el, delay = 0) {
            return run(el, PRESETS.rotateIn, { duration: TOKENS.smooth, delay, easing: 'back' });
        },

        morphIn(el, delay = 0) {
            return run(el, PRESETS.morphIn, { duration: TOKENS.cinematic, delay, easing: 'expo' });
        },

        spotlight(el, delay = 0) {
            return run(el, PRESETS.spotlight, { duration: TOKENS.slow, delay, easing: 'expo' });
        },

        liquidIn(el, delay = 0) {
            return run(el, PRESETS.liquidIn, { duration: TOKENS.spring, delay, easing: 'expo' });
        },

        glowPulse(el, color) {
            return run(el, PRESETS.glowPulse(color), { duration: TOKENS.slow, easing: 'expo' });
        },

        typewriter(el, text, speed) {
            return _typewriterAnim(el, text, speed);
        },

        waveText(el, baseDelay) {
            return _waveText(el, baseDelay);
        },

        revealText(el, delay) {
            return _revealText(el, delay);
        },

        glitch(el, duration) {
            return _glitchEffect(el, duration);
        },

        tilt(el, maxTilt) {
            return _tiltEffect(el, maxTilt);
        },

        magnet(el, strength) {
            return _setupMagnet(el, strength);
        },

        removeMagnet(el) {
            return _removeMagnet(el);
        },

        spring(el, targetX, targetY) {
            return _springPhysics(el, targetX, targetY);
        },

        float(el, amplitude, period) {
            return _floatElement(el, amplitude, period);
        },

        breathe(el, scale, period) {
            return _breatheElement(el, scale, period);
        },

        shimmer(el) {
            return _shimmer(el);
        },

        particles(x, y, colors) {
            return _createParticleExplosion(x, y, colors);
        },

        trail(container) {
            return _createMouseTrail(container);
        },

        removeTrail(container = document.body) {
            if (_trailCleanup.has(container)) {
                _trailCleanup.get(container)();
            }
        },

        animateValue(id, endValue, durationOrOptions = 1200, suffixString = '') {
            const obj = typeof id === 'string' ? document.getElementById(id) : id;
            const duration = typeof durationOrOptions === 'object' ? (durationOrOptions.duration || 1200) : durationOrOptions;
            const suffix = typeof durationOrOptions === 'object' ? (durationOrOptions.suffix || '') : suffixString;
            return _countUp(obj, endValue, duration * _stressMultiplier(), suffix);
        },

        cancel(el) {
            if (!el || !_activeAnimations.has(el)) return;
            _activeAnimations.get(el).cancel();
        },

        cancelAll(container) {
            if (!container) return;
            container.querySelectorAll('*').forEach(el => {
                if (_activeAnimations.has(el)) _activeAnimations.get(el).cancel();
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
        },

        sequence(...fns) {
            return fns.reduce((p, fn) => p.then(fn), Promise.resolve());
        },

        parallel(...promises) {
            return Promise.all(promises);
        }
    };
})();
