(function () {
    'use strict';

    /**
     * 🚀 QuizEngine Ultra™ - High Performance Edition
     * Zero dependencies, GPU-Accelerated, Spring Physics, Custom Audio/Particle Synth.
     */

    // --- 1. Core Utilities & State Management ---
    const EventBus = {
        events: new Map(),
        on(event, listener) {
            if (!this.events.has(event)) this.events.set(event, new Set());
            this.events.get(event).add(listener);
        },
        emit(event, data) {
            if (this.events.has(event)) this.events.get(event).forEach(l => l(data));
        }
    };

    const UIState = {
        IDLE: 'idle', TRANSITIONING: 'transitioning', SUBMITTING: 'submitting',
        current: 'idle',
        set(state) { this.current = state; EventBus.emit('STATE_CHANGE', state); },
        is(state) { return this.current === state; }
    };

    const Scheduler = {
        idle(task) { ('requestIdleCallback' in window) ? requestIdleCallback(task, { timeout: 500 }) : setTimeout(task, 16); },
        frame(task) { requestAnimationFrame(task); },
        debounce(func, wait) {
            let timeout;
            return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
        }
    };

    // --- 2. Advanced Environment & Physics Engine ---
    const EngineCore = {
        isLowEnd: false, isCalmMode: false, batterySaver: false,
        lastInteraction: performance.now(),
        trackInteraction() { this.lastInteraction = performance.now(); },

        async detectEnvironment() {
            const memory = navigator.deviceMemory || 4;
            const cores = navigator.hardwareConcurrency || 4;
            this.isLowEnd = memory < 4 || cores < 4 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            
            if ('getBattery' in navigator) {
                try {
                    const battery = await navigator.getBattery();
                    this.batterySaver = battery.level < 0.2 || (!battery.charging && this.isLowEnd);
                    battery.addEventListener('levelchange', () => this.batterySaver = battery.level < 0.2);
                } catch(e) {}
            }
            if (this.isLowEnd || this.batterySaver) document.documentElement.classList.add('qe-low-perf');
        },

        // Spring physics for buttery smooth animations calculating tension and friction
        spring(t, b, c, d) {
            const ts = (t /= d) * t;
            const tc = ts * t;
            return b + c * (33 * tc * ts + -106 * ts * ts + 126 * tc + -67 * ts + 15 * t);
        }
    };

    // --- 3. Premium Sensory Engine (Custom ADSR Synth + Haptics) ---
    const Sensory = {
        ctx: null, masterGain: null,
        init() { 
            if (!this.ctx && !EngineCore.isCalmMode && !EngineCore.batterySaver && !EngineCore.isLowEnd) {
                const CtxClass = window.AudioContext || window.webkitAudioContext;
                if(CtxClass) {
                    this.ctx = new CtxClass();
                    this.masterGain = this.ctx.createGain();
                    this.masterGain.gain.value = 0.3; // Global volume
                    this.masterGain.connect(this.ctx.destination);
                }
            }
        },
        playSynth(freq, type = 'sine', attack = 0.01, decay = 0.1, sustain = 0, release = 0.1, vol = 0.05) {
            if (EngineCore.isLowEnd || EngineCore.batterySaver || !this.ctx) return;
            try {
                if (this.ctx.state === 'suspended') this.ctx.resume();
                const osc = this.ctx.createOscillator();
                const vca = this.ctx.createGain();
                const now = this.ctx.currentTime;
                
                osc.type = type;
                osc.frequency.setValueAtTime(freq, now);
                
                // ADSR Envelope for premium sound design
                vca.gain.setValueAtTime(0, now);
                vca.gain.linearRampToValueAtTime(vol, now + attack);
                vca.gain.linearRampToValueAtTime(sustain * vol, now + attack + decay);
                vca.gain.linearRampToValueAtTime(0, now + attack + decay + release);
                
                osc.connect(vca);
                vca.connect(this.masterGain);
                
                osc.start(now);
                osc.stop(now + attack + decay + release);
            } catch (e) {}
        },
        vibrate(pattern) { if (navigator.vibrate && !EngineCore.isCalmMode) navigator.vibrate(pattern); },
        select() { this.playSynth(850, 'sine', 0.01, 0.05, 0.01, 0.05, 0.02); this.vibrate([15]); },
        nav(dir) { this.playSynth(dir > 0 ? 600 : 400, 'triangle', 0.02, 0.05, 0, 0.05, 0.015); this.vibrate([10]); },
        success() { 
            this.playSynth(440, 'sine', 0.05, 0.1, 0.2, 0.2, 0.03); 
            setTimeout(() => this.playSynth(554.37, 'sine', 0.05, 0.1, 0.2, 0.2, 0.03), 100);
            setTimeout(() => this.playSynth(659.25, 'sine', 0.05, 0.1, 0.2, 0.4, 0.04), 200);
            setTimeout(() => this.playSynth(880, 'sine', 0.05, 0.1, 0.2, 0.6, 0.05), 350);
            this.vibrate([30, 40, 30, 50, 60]); 
        }
    };

    // --- 4. High-Performance DOM Factory ---
    const $el = (tag, attrs = {}, children = []) => {
        const el = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'polyline' 
            ? document.createElementNS('http://www.w3.org/2000/svg', tag) 
            : document.createElement(tag);
            
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'className') el.setAttribute('class', v);
            else if (k === 'innerHTML') el.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2).toLowerCase(), v);
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else el.setAttribute(k, v);
        }
        children.forEach(c => {
            if (typeof c === 'string') el.appendChild(document.createTextNode(c));
            else if (c instanceof Node) el.appendChild(c);
        });
        return el;
    };

    const escapeHTML = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    // --- 5. Nano Particle Engine (Zero Dependency Confetti) ---
    const NanoParticles = {
        canvas: null, ctx: null, particles: [], w: 0, h: 0, animationId: null,
        fire(intensity = 1) {
            if (EngineCore.isLowEnd) return;
            if (!this.canvas) {
                this.canvas = document.createElement('canvas');
                this.canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999999999;';
                document.body.appendChild(this.canvas);
                this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
            }
            this.w = this.canvas.width = window.innerWidth;
            this.h = this.canvas.height = window.innerHeight;
            
            const count = Math.floor(100 * intensity);
            const colors = ['#facc15', '#ffffff', '#22c55e', '#eab308'];
            
            for(let i=0; i<count; i++) {
                this.particles.push({
                    x: this.w / 2, y: this.h / 1.2,
                    vx: (Math.random() - 0.5) * 25 * intensity,
                    vy: (Math.random() - 1) * 25 * intensity - 10,
                    size: Math.random() * 8 + 4,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    rot: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 10,
                    life: 1, decay: Math.random() * 0.015 + 0.005
                });
            }
            if (!this.animationId) this.loop();
        },
        loop() {
            this.ctx.clearRect(0, 0, this.w, this.h);
            let active = false;
            for(let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.vy += 0.4; // Gravity
                p.x += p.vx; p.y += p.vy;
                p.rot += p.rotSpeed; p.life -= p.decay;
                
                if (p.life > 0) {
                    active = true;
                    this.ctx.save();
                    this.ctx.translate(p.x, p.y);
                    this.ctx.rotate(p.rot * Math.PI / 180);
                    this.ctx.globalAlpha = p.life;
                    this.ctx.fillStyle = p.color;
                    this.ctx.beginPath();
                    // Render squares & circles based on index
                    if(i % 2 === 0) this.ctx.arc(0, 0, p.size/2, 0, Math.PI*2);
                    else this.ctx.rect(-p.size/2, -p.size/2, p.size, p.size);
                    this.ctx.fill();
                    this.ctx.restore();
                } else {
                    this.particles.splice(i, 1);
                }
            }
            if (active) this.animationId = requestAnimationFrame(() => this.loop());
            else { cancelAnimationFrame(this.animationId); this.animationId = null; this.ctx.clearRect(0,0,this.w,this.h); }
        }
    };

    // --- 6. Styles Injection (GPU Optimized & Premium UI) ---
    const injectStyles = () => {
        if (document.getElementById('qe-vX-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-vX-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #facc15; 
                --qe-primary-rgb: 250, 204, 21;
                --qe-bg: #030303; 
                --qe-surface: #0a0a0a;
                --qe-border: rgba(255, 255, 255, 0.04);
                --qe-text: #f4f4f5; 
                --qe-text-muted: #a1a1aa;
                --qe-success: #22c55e;
                --qe-ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
                --qe-ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
                --qe-width: 900px;
            }

            html.qe-active, html.qe-active body {
                overflow: hidden !important; height: 100dvh !important; width: 100vw !important; margin: 0; padding: 0;
                background: var(--qe-bg) !important; overscroll-behavior: none;
            }

            #quizModal {
                position: fixed; inset: 0; z-index: 9999999;
                background: radial-gradient(circle at 50% 0%, rgba(250,204,21,0.03) 0%, var(--qe-bg) 60%) !important;
                font-family: 'Cairo', system-ui, -apple-system, sans-serif;
                display: flex; flex-direction: column;
                height: 100dvh; width: 100vw;
                opacity: 0; transform: translateY(10px) scale(0.99);
                transition: opacity 0.4s var(--qe-ease-smooth), transform 0.4s var(--qe-ease-smooth);
                contain: strict; color: var(--qe-text);
            }
            #quizModal:not(.hidden) { opacity: 1; transform: translateY(0) scale(1); }

            .qe-top-bar {
                background: rgba(3, 3, 3, 0.95); 
                border-bottom: 1px solid var(--qe-border);
                position: relative; z-index: 10;
                display: flex; flex-direction: column;
                contain: layout paint;
            }
            .qe-header-info {
                display: flex; justify-content: space-between; align-items: center;
                padding: 1.2rem 2rem; max-width: var(--qe-width); width: 100%; margin: 0 auto; box-sizing: border-box;
            }
            .qe-quiz-title { margin: 0; color: white; font-size: 1.4rem; font-weight: 800; letter-spacing: -0.5px; }
            .qe-timer {
                font-family: 'SF Mono', 'Courier New', monospace; font-size: 1.15rem; font-weight: 900;
                background: rgba(250,204,21,0.05); border: 1px solid rgba(250,204,21,0.15);
                padding: 0.5rem 1.2rem; border-radius: 100px; color: var(--qe-primary);
                display: flex; align-items: center; gap: 0.5rem; transition: all 0.3s;
            }
            .qe-timer.warning { color: #ef4444; background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2); animation: pulseTimer 1s infinite alternate; }
            @keyframes pulseTimer { to { transform: scale(1.05); box-shadow: 0 0 15px rgba(239,68,68,0.2); } }

            .qe-pagination-scroll {
                width: 100%; overflow-x: auto; padding: 0 2rem 1.2rem 2rem; box-sizing: border-box;
                scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth;
            }
            .qe-pagination-scroll::-webkit-scrollbar { display: none; }
            .qe-pagination-track { display: flex; gap: 0.8rem; max-width: var(--qe-width); margin: 0 auto; }
            .qe-page-num {
                flex: 0 0 auto; width: 44px; height: 44px; border-radius: 14px;
                display: flex; align-items: center; justify-content: center;
                font-weight: 800; font-size: 1.1rem; cursor: pointer; user-select: none;
                border: 1px solid var(--qe-border); color: var(--qe-text-muted);
                background: var(--qe-surface); transition: all 0.25s var(--qe-ease-bounce);
                position: relative; overflow: hidden; transform: translateZ(0);
            }
            .qe-page-num:hover { border-color: rgba(255,255,255,0.2); transform: translateY(-2px); }
            .qe-page-num.answered { color: var(--qe-primary); border-color: rgba(250,204,21,0.3); background: rgba(250,204,21,0.03); }
            .qe-page-num.active { 
                background: var(--qe-primary); color: #000; font-size: 1.2rem; border-color: var(--qe-primary);
                transform: scale(1.1) translateY(-2px); box-shadow: 0 8px 20px rgba(250,204,21,0.25);
            }
            .qe-mobile-progress { display: none; }

            #quizModalContent {
                flex: 1; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                padding: 2.5rem 1.5rem calc(120px + env(safe-area-inset-bottom)); 
                display: flex; flex-direction: column; align-items: center;
                width: 100%; box-sizing: border-box; contain: layout size;
            }
            
            #qe-virtual-dom { position: relative; width: 100%; max-width: var(--qe-width); min-height: 60vh; touch-action: pan-y; perspective: 1000px; }
            
            /* --- The Khariq Card UI --- */
            .qe-card-layer {
                display: none; width: 100%;
                background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005));
                border: 1px solid rgba(255,255,255,0.04);
                border-top: 1px solid rgba(255,255,255,0.08);
                border-right: 3px solid var(--qe-primary);
                border-radius: 24px; padding: 2rem;
                box-shadow: 0 10px 40px -10px rgba(0,0,0,0.5);
                transition: opacity 0.25s ease-out, transform 0.35s var(--qe-ease-bounce);
                will-change: transform, opacity; contain: content;
            }
            .qe-card-layer.active { display: block; opacity: 1; transform: translate3d(0, 0, 0); position: relative; z-index: 2; }
            .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translate3d(-40px, 0, 0) scale(0.98); position: absolute; top: 0; pointer-events: none; }
            .qe-card-layer.exit-next { display: block; opacity: 0; transform: translate3d(40px, 0, 0) scale(0.98); position: absolute; top: 0; pointer-events: none; }

            .qe-q-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.03);
            }
            .qe-q-title { color: var(--qe-primary); font-size: 1.2rem; font-weight: 900; display: flex; align-items: center; gap: 0.6rem; margin: 0; }

            .qe-q-text-box {
                background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255,255,255,0.03);
                border-radius: 16px; padding: 1.5rem; color: #fff;
                font-size: 1.45rem; font-weight: 800; line-height: 1.7;
                margin-bottom: 2rem; text-align: right; letter-spacing: -0.3px;
                box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);
            }
            
            .qe-options-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
            @media (min-width: 768px) { .qe-options-grid { grid-template-columns: 1fr 1fr; gap: 1.2rem; } }
            
            .qe-option {
                display: flex; align-items: center; padding: 1rem 1.2rem;
                background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.05);
                border-radius: 16px; cursor: pointer; position: relative; overflow: hidden;
                transition: all 0.2s ease-out; transform: translateZ(0);
            }
            .qe-option::before {
                content: ''; position: absolute; inset: 0; background: var(--qe-primary); 
                opacity: 0; transition: opacity 0.2s ease; z-index: 0;
            }
            .qe-option:hover { background: rgba(255,255,255,0.04); border-color: rgba(250,204,21,0.3); transform: translateY(-2px); }
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            
            .qe-option.selected { 
                border-color: var(--qe-primary); box-shadow: 0 8px 25px rgba(250,204,21,0.12);
                transform: scale(1.01) translateY(-2px);
            }
            .qe-option.selected::before { opacity: 0.08; }
            
            .qe-option-letter { 
                width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.05); 
                display: flex; align-items: center; justify-content: center; 
                font-weight: 900; font-size: 1.1rem; margin-left: 1rem; transition: 0.3s; color: var(--qe-text-muted); 
                flex-shrink: 0; z-index: 1; border: 1px solid rgba(255,255,255,0.02);
            }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: #000; box-shadow: 0 4px 10px rgba(250,204,21,0.3); border-color: transparent; }
            .qe-opt-text { font-size: 1.15rem; font-weight: 700; color: #e4e4e7; line-height: 1.6; flex: 1; text-align: right; z-index: 1; } 

            /* --- Bottom Navigation (Magnetic & Premium) --- */
            .qe-bottom-bar {
                position: fixed; bottom: 0; left: 0; width: 100%;
                background: linear-gradient(0deg, rgba(3,3,3,0.98) 20%, rgba(3,3,3,0.85) 100%);
                border-top: 1px solid rgba(255,255,255,0.05); padding: 1.5rem;
                display: flex; justify-content: center; z-index: 100;
                box-sizing: border-box; contain: layout paint;
            }
            .qe-nav-container { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: var(--qe-width); gap: 1.5rem; }
            .qe-nav-group { display: flex; gap: 1rem; flex: 1; }
            
            .qe-btn { 
                padding: 0 2.5rem; height: 60px; border-radius: 18px; font-weight: 800; font-size: 1.15rem; 
                cursor: pointer; border: none; font-family: inherit; transition: all 0.25s var(--qe-ease-bounce); 
                display: flex; align-items: center; justify-content: center; user-select: none; position: relative; overflow: hidden;
            }
            .qe-btn::after { content:''; position:absolute; inset:0; background:white; opacity:0; transition:opacity 0.2s; }
            .qe-btn:active::after { opacity:0.1; }
            .qe-btn-primary { background: var(--qe-primary); color: #000; box-shadow: 0 4px 15px rgba(250,204,21,0.15); }
            .qe-btn-primary:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 8px 25px rgba(250,204,21,0.3); }
            .qe-btn-secondary { background: rgba(255,255,255,0.03); color: white; border: 1px solid rgba(255,255,255,0.08); }
            .qe-btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); transform: translateY(-2px); }
            .qe-btn:disabled { opacity: 0.3 !important; cursor: not-allowed; transform: none !important; box-shadow: none !important; filter: grayscale(1); }
            
            #btnSubmitQuiz { min-width: 180px; background: var(--qe-success); color: white; box-shadow: 0 4px 15px rgba(34,197,94,0.15); }
            #btnSubmitQuiz:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 8px 25px rgba(34,197,94,0.35); }

            /* --- Ultra Submit Overlay & Animated Results --- */
            .qe-submitting-overlay { 
                position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 99999999; 
                display: none; flex-direction: column; align-items: center; justify-content: center; 
                opacity: 0; transition: opacity 0.3s ease; 
            }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            
            .qe-spinner-container { transition: all 0.3s ease; display: flex; flex-direction: column; align-items: center; }
            .qe-spinner-container.hide { opacity: 0; transform: scale(0.8) translateY(-20px); pointer-events: none; position: absolute; }
            
            /* High-tech CSS Only Spinner */
            .qe-cyber-loader {
                width: 80px; height: 80px; position: relative; margin-bottom: 2rem;
            }
            .qe-cyber-loader::before, .qe-cyber-loader::after {
                content: ''; position: absolute; inset: 0; border-radius: 50%;
                border: 4px solid transparent; 
            }
            .qe-cyber-loader::before { border-top-color: var(--qe-primary); border-right-color: var(--qe-primary); animation: qeSpin 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite; }
            .qe-cyber-loader::after { border-bottom-color: white; border-left-color: white; animation: qeSpin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite reverse; }
            @keyframes qeSpin { 100% { transform: rotate(360deg); } }

            .qe-result-card {
                background: linear-gradient(145deg, #111 0%, #050505 100%);
                border: 1px solid rgba(250,204,21,0.2); border-top: 2px solid var(--qe-primary);
                padding: 4rem 3rem; border-radius: 32px; text-align: center;
                max-width: 450px; width: 90%;
                box-shadow: 0 40px 100px rgba(0,0,0,0.8), inset 0 0 40px rgba(250,204,21,0.05);
                opacity: 0; transform: scale(0.8) translateY(60px);
                animation: qeSpringUp 0.7s var(--qe-ease-bounce) forwards;
                position: relative; overflow: hidden;
            }
            @keyframes qeSpringUp { 100% { transform: scale(1) translateY(0); opacity: 1; } }
            
            .qe-result-icon { font-size: 5.5rem; margin-bottom: 1.5rem; filter: drop-shadow(0 10px 20px rgba(250,204,21,0.4)); animation: qeFloat 4s ease-in-out infinite; line-height: 1; }
            @keyframes qeFloat { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-15px) rotate(3deg); } }
            
            .qe-result-title { color: var(--qe-text-muted); font-size: 1.4rem; margin-bottom: 0.5rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; }
            .qe-result-score { 
                font-size: 6rem; font-weight: 900; color: white; margin-bottom: 1rem; line-height: 1; 
                background: linear-gradient(135deg, #fff 0%, #facc15 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                filter: drop-shadow(0 4px 20px rgba(250,204,21,0.2));
            }
            .qe-result-details { color: #888; font-size: 1.3rem; margin-bottom: 3rem; font-weight: 700; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 16px; }
            .qe-result-details span { color: white; font-weight: 900; font-size: 1.5rem; }
            
            #qe-finish-btn {
                background: var(--qe-primary); color: #000; border: none;
                height: 65px; border-radius: 20px; font-size: 1.3rem; font-weight: 900; cursor: pointer; width: 100%;
                box-shadow: 0 10px 30px rgba(250,204,21,0.25); transition: all 0.3s var(--qe-ease-bounce);
                display: flex; align-items: center; justify-content: center; gap: 12px;
            }
            #qe-finish-btn:hover { transform: translateY(-4px); box-shadow: 0 15px 40px rgba(250,204,21,0.4); }

            /* Mobile Optimizations */
            @media (max-width: 768px) {
                .qe-pagination-scroll { display: none !important; }
                .qe-header-info { padding: 1rem 1.2rem; }
                .qe-quiz-title { font-size: 1.1rem; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .qe-timer { font-size: 1rem; padding: 0.4rem 0.8rem; border: none; background: transparent; }
                
                .qe-mobile-progress {
                    display: block; width: 100%; text-align: center; font-size: 1rem; color: var(--qe-primary); 
                    font-weight: 800; padding: 0.5rem 0 1rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);
                    background: rgba(3,3,3,0.95);
                }

                #quizModalContent { padding: 1.5rem 1rem calc(110px + env(safe-area-inset-bottom)); }
                
                .qe-card-layer { padding: 1.5rem; border-radius: 20px; }
                .qe-q-text-box { font-size: 1.25rem; padding: 1.2rem; margin-bottom: 1.5rem; }
                .qe-option { padding: 0.8rem; border-radius: 12px; }
                .qe-option-letter { width: 32px; height: 32px; font-size: 1rem; margin-left: 0.8rem; }
                .qe-opt-text { font-size: 1.05rem; }

                .qe-bottom-bar { padding: 1rem; background: #050505; }
                .qe-nav-container { gap: 0.8rem; }
                .qe-nav-group { gap: 0.8rem; }
                .qe-btn { height: 54px; border-radius: 14px; font-size: 1.05rem; padding: 0 1.2rem; }
                #btnSubmitQuiz { flex: 1; min-width: auto; }

                .qe-result-card { padding: 3rem 1.5rem; border-radius: 28px; }
                .qe-result-score { font-size: 5rem; }
            }

            .qe-low-perf * { transition-duration: 0ms !important; transform: none !important; animation: none !important; box-shadow: none !important; }
        `;
        document.head.appendChild(style);
    };

    // --- 7. The Core Engine (State, Render, Interaction) ---
    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        isMobile: false, vDOM: null, pageNodes: [], gestureData: { startX: 0, startY: 0, tracking: false },

        async open(quiz) {
            this.isMobile = window.innerWidth <= 768;
            await EngineCore.detectEnvironment();
            Sensory.init();
            injectStyles();
            
            // Interaction with DahihApp Dashboard
            if (typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.setQuizState === 'function') {
                window.DahihApp.setQuizState(true);
            }
            
            document.documentElement.classList.add('qe-active');
            this.quiz = quiz; UIState.set(UIState.IDLE);
            
            const saved = JSON.parse(localStorage.getItem(`dq_${quiz.id}`)) || {};
            this.answers = saved.answers || {};
            this.totalTime = saved.timeLeft || (quiz.duration || quiz.questions.length * 60);
            
            this.currentIndex = 0;
            while(this.answers[`q_${this.currentIndex}`] !== undefined && this.currentIndex < quiz.questions.length - 1) this.currentIndex++;

            const modal = document.createElement('div');
            modal.id = 'quizModal';
            document.body.appendChild(modal);

            modal.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div class="qe-spinner-container" id="qe-spinner-container">
                        <div class="qe-cyber-loader"></div>
                        <div style="color:white;font-weight:900;font-size:1.5rem;letter-spacing:1px;text-shadow:0 0 20px rgba(250,204,21,0.5);">جاري التوثيق...</div>
                    </div>
                </div>
                <div class="qe-top-bar">
                    <div class="qe-header-info">
                        <h2 class="qe-quiz-title">${escapeHTML(quiz.title)}</h2>
                        <div class="qe-timer" id="qe-timer">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span id="qe-timer-text">--:--</span>
                        </div>
                    </div>
                    <div class="qe-mobile-progress" id="qe-mobile-progress"></div>
                    <div class="qe-pagination-scroll"><div class="qe-pagination-track" id="qe-pagination-container"></div></div>
                </div>
                <div id="quizModalContent">
                    <form id="activeQuizForm" onsubmit="return false;" style="width:100%;max-width:var(--qe-width);">
                        <div id="qe-virtual-dom"></div>
                    </form>
                </div>
                <div class="qe-bottom-bar">
                    <div class="qe-nav-container">
                        <div class="qe-nav-group">
                            <button type="button" class="qe-btn qe-btn-secondary" id="qe-btn-prev">السابق</button>
                            <button type="button" class="qe-btn qe-btn-primary" id="qe-btn-next">التالي</button>
                        </div>
                        <button type="button" class="qe-btn" id="btnSubmitQuiz" disabled>تسليم الإجابات</button>
                    </div>
                </div>
            `;

            Scheduler.frame(() => {
                modal.classList.remove('hidden');
                this.vDOM = document.getElementById('qe-virtual-dom');
                this.buildPagination();
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupAdvancedGestures();
                this.attachEvents();
            });
        },

        attachEvents() {
            document.getElementById('qe-btn-prev').onclick = () => { EngineCore.trackInteraction(); this.prev(); };
            document.getElementById('qe-btn-next').onclick = () => { EngineCore.trackInteraction(); this.next(); };
            document.getElementById('btnSubmitQuiz').onclick = () => this.submitCheck();
            
            this.resizeHandler = Scheduler.debounce(() => { 
                const wasMobile = this.isMobile;
                this.isMobile = window.innerWidth <= 768; 
                if(wasMobile !== this.isMobile) this.renderVirtualDOM(); 
            }, 250);
            window.addEventListener('resize', this.resizeHandler);
        },

        buildPagination() {
            const container = document.getElementById('qe-pagination-container');
            if (!container) return;
            const frag = document.createDocumentFragment();
            this.pageNodes = Array.from({length: this.quiz.questions.length}, (_, i) => {
                const node = $el('div', {
                    className: `qe-page-num ${this.answers[`q_${i}`] !== undefined ? 'answered' : ''} ${i === this.currentIndex ? 'active' : ''}`,
                    onclick: () => this.jumpTo(i)
                }, [(i + 1).toString()]);
                frag.appendChild(node);
                return node;
            });
            container.appendChild(frag);
            this.scrollPagination();
        },

        scrollPagination() {
            if(this.isMobile) return;
            const activeEl = this.pageNodes[this.currentIndex];
            if (activeEl) {
                const scrollContainer = activeEl.parentElement.parentElement;
                const targetLeft = activeEl.offsetLeft - (scrollContainer.offsetWidth / 2) + (activeEl.offsetWidth / 2);
                scrollContainer.scrollTo({ left: targetLeft, behavior: EngineCore.isLowEnd ? 'auto' : 'smooth' });
            }
        },

        jumpTo(index) {
            if (index === this.currentIndex || UIState.is(UIState.TRANSITIONING) || UIState.is(UIState.SUBMITTING)) return;
            const dir = index > this.currentIndex ? 1 : -1;
            EngineCore.trackInteraction(); Sensory.nav(dir);
            this.updatePaginationState(index);
            this.currentIndex = index;
            this.renderVirtualDOM(dir);
            this.updateUI();
            this.scrollTop();
        },

        updatePaginationState(newIndex) {
            this.pageNodes[this.currentIndex].classList.remove('active');
            this.pageNodes[newIndex].classList.add('active');
            this.scrollPagination();
        },

        scrollTop() {
            const content = document.getElementById('quizModalContent');
            if(content) content.scrollTo({ top: 0, behavior: EngineCore.isLowEnd ? 'auto' : 'smooth' });
        },

        renderVirtualDOM(direction = 0) {
            UIState.set(UIState.TRANSITIONING);
            const total = this.quiz.questions.length;
            const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
            const indices = [this.currentIndex - 1, this.currentIndex, this.currentIndex + 1].filter(i => i >= 0 && i < total);

            const children = Array.from(this.vDOM.children);
            children.forEach(child => {
                const idx = parseInt(child.dataset.index);
                if (!indices.includes(idx)) child.remove();
                else if (idx !== this.currentIndex) {
                    const exitClass = direction === 0 ? (idx < this.currentIndex ? 'exit-prev' : 'exit-next') : (direction > 0 ? 'exit-prev' : 'exit-next');
                    child.className = `qe-card-layer ${exitClass}`;
                    child.style.transform = ''; // reset inline physics
                }
            });

            const frag = document.createDocumentFragment();
            indices.forEach(idx => {
                let card = this.vDOM.querySelector(`[data-index="${idx}"]`);
                if (!card) {
                    const q = this.quiz.questions[idx];
                    let enterClass = idx === this.currentIndex ? 'active' : (direction === 0 ? (idx < this.currentIndex ? 'exit-prev' : 'exit-next') : (direction > 0 ? 'exit-next' : 'exit-prev'));

                    card = $el('div', { className: `qe-card-layer ${enterClass}`, 'data-index': idx });
                    
                    const header = $el('div', { className: 'qe-q-header' }, [
                        $el('h3', { className: 'qe-q-title', innerHTML: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> السؤال ${idx + 1} من ${total}` })
                    ]);
                    card.appendChild(header);
                    card.appendChild($el('div', { className: 'qe-q-text-box' }, [escapeHTML(q.questionText)]));
                    
                    const group = $el('div', { className: 'qe-options-grid', role: 'radiogroup' });
                    q.options.forEach((opt, oi) => {
                        const isChecked = this.answers[`q_${idx}`] == oi;
                        const label = $el('label', { className: `qe-option ${isChecked ? 'selected' : ''}` });
                        label.appendChild($el('input', { type: 'radio', name: `q_${idx}`, value: oi, checked: isChecked }));
                        label.appendChild($el('div', { className: 'qe-option-letter' }, [letters[oi] || oi+1]));
                        label.appendChild($el('span', { className: 'qe-opt-text' }, [escapeHTML(opt)]));
                        
                        label.onclick = (e) => { e.preventDefault(); this.selectOption(idx, oi, label, group); };
                        group.appendChild(label);
                    });
                    
                    card.appendChild(group);
                    frag.appendChild(card);
                } else if (idx === this.currentIndex) {
                    Scheduler.frame(() => {
                        card.className = 'qe-card-layer active';
                        card.style.transform = ''; 
                    });
                }
            });
            
            if(frag.childNodes.length > 0) this.vDOM.appendChild(frag);
            setTimeout(() => UIState.set(UIState.IDLE), this.isMobile ? 180 : 300);
        },

        selectOption(qIndex, optIndex, labelElement, group) {
            if (UIState.is(UIState.TRANSITIONING) || UIState.is(UIState.SUBMITTING)) return;
            EngineCore.trackInteraction(); Sensory.select();
            
            const prevSelected = group.querySelector('.selected');
            if (prevSelected) prevSelected.classList.remove('selected');
            labelElement.classList.add('selected');
            labelElement.querySelector('input').checked = true;

            this.answers[`q_${qIndex}`] = optIndex;
            Scheduler.idle(() => localStorage.setItem(`dq_${this.quiz.id}`, JSON.stringify({ answers: this.answers, timeLeft: this.totalTime })));
            
            if(!this.pageNodes[qIndex].classList.contains('answered')) {
                this.pageNodes[qIndex].classList.add('answered');
                Sensory.playSynth(1200, 'sine', 0.01, 0.05, 0, 0.05, 0.01); // Extra tick for first answer
            }
            this.updateUI();

            if (!this.isMobile && this.currentIndex < this.quiz.questions.length - 1) {
                setTimeout(() => this.next(), 300);
            }
        },

        updateUI() {
            Scheduler.frame(() => {
                const total = this.quiz.questions.length;
                const mobileProgress = document.getElementById('qe-mobile-progress');
                if(mobileProgress) mobileProgress.innerText = `السؤال ${this.currentIndex + 1} / ${total}`;

                const btnPrev = document.getElementById('qe-btn-prev');
                const btnNext = document.getElementById('qe-btn-next');
                const btnSubmit = document.getElementById('btnSubmitQuiz');

                btnPrev.disabled = this.currentIndex === 0;
                const isLast = this.currentIndex === total - 1;
                
                if (this.isMobile) {
                    btnNext.style.display = isLast ? 'none' : 'flex';
                    btnSubmit.style.display = isLast ? 'flex' : 'none';
                    btnNext.disabled = isLast;
                    btnSubmit.disabled = false; 
                } else {
                    btnNext.disabled = isLast;
                    btnSubmit.disabled = !isLast;
                    if(isLast) {
                        btnSubmit.style.background = 'var(--qe-success)';
                        btnSubmit.style.color = 'white';
                        btnSubmit.style.boxShadow = '0 4px 15px rgba(34,197,94,0.15)';
                    } else {
                        btnSubmit.style.background = 'rgba(255,255,255,0.03)';
                        btnSubmit.style.color = 'var(--qe-text-muted)';
                        btnSubmit.style.boxShadow = 'none';
                    }
                }
            });
        },

        next() {
            if (this.currentIndex < this.quiz.questions.length - 1 && !UIState.is(UIState.TRANSITIONING)) {
                Sensory.nav(1); 
                this.updatePaginationState(this.currentIndex + 1);
                this.currentIndex++;
                this.renderVirtualDOM(1); this.updateUI(); this.scrollTop();
            }
        },
        prev() {
            if (this.currentIndex > 0 && !UIState.is(UIState.TRANSITIONING)) {
                Sensory.nav(-1); 
                this.updatePaginationState(this.currentIndex - 1);
                this.currentIndex--;
                this.renderVirtualDOM(-1); this.updateUI(); this.scrollTop();
            }
        },

        // Custom Spring Physics Gesture Engine
        setupAdvancedGestures() {
            let activeCard = null;
            
            this.vDOM.addEventListener('touchstart', e => {
                if(EngineCore.isLowEnd || UIState.is(UIState.TRANSITIONING)) return;
                this.gestureData.startX = e.touches[0].clientX;
                this.gestureData.startY = e.touches[0].clientY;
                this.gestureData.tracking = true;
                activeCard = this.vDOM.querySelector('.qe-card-layer.active');
                if(activeCard) activeCard.style.transition = 'none';
            }, { passive: true });

            this.vDOM.addEventListener('touchmove', e => {
                if(!this.gestureData.tracking || !activeCard) return;
                const dx = e.touches[0].clientX - this.gestureData.startX;
                const dy = e.touches[0].clientY - this.gestureData.startY;
                
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
                    const resist = dx * 0.4; // Friction
                    activeCard.style.transform = `translate3d(${resist}px, 0, 0) rotateY(${resist * 0.05}deg)`;
                } else {
                    this.gestureData.tracking = false;
                    activeCard.style.transition = '';
                    activeCard.style.transform = '';
                }
            }, { passive: true });

            this.vDOM.addEventListener('touchend', e => {
                if(!this.gestureData.tracking || !activeCard) return;
                this.gestureData.tracking = false;
                activeCard.style.transition = '';
                
                const dx = e.changedTouches[0].clientX - this.gestureData.startX;
                const threshold = window.innerWidth * 0.2;
                
                if (Math.abs(dx) > threshold) {
                    if (dx > 0) this.prev(); else this.next();
                } else {
                    activeCard.style.transform = ''; // Snap back
                }
            }, { passive: true });
        },

        startTimer() {
            clearInterval(this.timerId);
            const timerEl = document.getElementById('qe-timer');
            const timerText = document.getElementById('qe-timer-text');
            
            this.timerId = setInterval(() => {
                if(this.totalTime <= 0) { clearInterval(this.timerId); this.submit(); return; }
                this.totalTime--;
                
                Scheduler.frame(() => {
                    const mins = String(Math.floor(this.totalTime / 60)).padStart(2, '0');
                    const secs = String(this.totalTime % 60).padStart(2, '0');
                    timerText.innerText = `${mins}:${secs}`;
                    
                    if (this.totalTime === 60) { 
                        timerEl.classList.add('warning'); 
                        Sensory.playSynth(300, 'square', 0.1, 0.1, 0, 0.1, 0.03); 
                    }
                });
            }, 1000);
        },

        submitCheck() {
            const answeredCount = Object.keys(this.answers).length;
            const total = this.quiz.questions.length;
            if (answeredCount < total) {
                if(!confirm(`يوجد ${total - answeredCount} أسئلة لم تقم بالإجابة عليها.\nهل أنت متأكد من رغبتك في إنهاء الاختبار؟`)) return;
            }
            this.submit();
        },

        async submit() {
            UIState.set(UIState.SUBMITTING);
            clearInterval(this.timerId);
            
            const overlay = document.getElementById('qe-submit-layer');
            const spinnerContainer = document.getElementById('qe-spinner-container');
            if(overlay) overlay.classList.add('show');
            Sensory.playSynth(800, 'sine', 0.1, 0.5, 0.1, 0.5, 0.02); // Processing sound
            
            let score = 0;
            this.quiz.questions.forEach((q, qi) => { if (parseInt(this.answers[`q_${qi}`]) === q.correctAnswer) score++; });
            const percentage = Math.round((score / this.quiz.questions.length) * 100);

            try {
                const appState = typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.getState === 'function' ? window.DahihApp.getState() : {};
                
                if (typeof window.DahihApp !== 'undefined' && window.DahihApp.fetchWithTimeout) {
                    await window.DahihApp.fetchWithTimeout('/api/student/submit-quiz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.token}` },
                        body: JSON.stringify({ email: appState.user?.email, quizId: this.quiz.id, score, percentage })
                    });
                }
                
                this.quiz.attempted = true;
                this.quiz.score = percentage;
                
                Scheduler.idle(() => localStorage.removeItem(`dq_${this.quiz.id}`));
                Sensory.success();
                
                // Fire built-in NanoParticles Confetti
                if(percentage >= 50) NanoParticles.fire(percentage >= 85 ? 1.5 : 0.8);

                if (overlay) {
                    setTimeout(() => {
                        if (spinnerContainer) spinnerContainer.classList.add('hide');
                        
                        const emoji = percentage >= 85 ? '🏆' : (percentage >= 50 ? '🔥' : '💪');
                        const resultCard = $el('div', { className: 'qe-result-card' });
                        resultCard.innerHTML = `
                            <div class="qe-result-icon">${emoji}</div>
                            <h2 class="qe-result-title">تم إنجاز المهمة</h2>
                            <div class="qe-result-score">${percentage}%</div>
                            <div class="qe-result-details">
                                حصدت <span>${score}</span> من <span>${this.quiz.questions.length}</span> نقاط
                            </div>
                            <button id="qe-finish-btn">
                                العودة للمنصة
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </button>
                        `;
                        overlay.appendChild(resultCard);

                        document.getElementById('qe-finish-btn').onclick = () => {
                            EngineCore.trackInteraction(); Sensory.select();
                            overlay.style.opacity = '0';
                            
                            setTimeout(() => {
                                overlay.classList.remove('show');
                                this.close();
                                
                                setTimeout(() => {
                                    if (typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.startDashboardPolling === 'function') {
                                        window.DahihApp.startDashboardPolling();
                                    }
                                    if (typeof QuizApp !== 'undefined' && QuizApp.reload) QuizApp.reload();
                                }, 300);

                            }, 350);
                        };
                    }, 600); 
                } else {
                    this.close();
                }

            } catch (err) { 
                console.error("Critical Submission Error:", err);
                alert("عذراً، حدث خطأ أثناء حفظ الإجابات. يرجى مراجعة اتصالك بالإنترنت.");
                if(overlay) overlay.classList.remove('show');
                UIState.set(UIState.IDLE);
            }
        },

        close() {
            clearInterval(this.timerId);
            window.removeEventListener('resize', this.resizeHandler);
            document.documentElement.classList.remove('qe-active');
            
            if (typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.setQuizState === 'function') {
                window.DahihApp.setQuizState(false);
            }

            const modal = document.getElementById('quizModal');
            if (modal) {
                modal.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                setTimeout(() => { 
                    modal.remove();
                    this.vDOM = null; 
                    this.pageNodes = []; 
                }, 400);
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();
