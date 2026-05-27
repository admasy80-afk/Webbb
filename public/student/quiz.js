(function () {
    'use strict';

    const EventBus = {
        events: {},
        on(event, listener) { (this.events[event] || (this.events[event] = [])).push(listener); },
        emit(event, data) { (this.events[event] || []).forEach(l => l(data)); }
    };

    const UIState = {
        IDLE: 'idle', TRANSITIONING: 'transitioning', SUBMITTING: 'submitting',
        current: 'idle',
        set(state) { this.current = state; EventBus.emit('STATE_CHANGE', state); },
        is(state) { return this.current === state; }
    };

    const Scheduler = {
        idle(task) { ('requestIdleCallback' in window) ? requestIdleCallback(task, { timeout: 800 }) : setTimeout(task, 16); },
        frame(task) { requestAnimationFrame(task); },
        debounce(func, wait) {
            let timeout;
            return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
        }
    };

    const EngineCore = {
        isLowEnd: false, isCalmMode: false, batterySaver: false,
        lastInteraction: Date.now(),
        
        trackInteraction() { this.lastInteraction = Date.now(); },

        async detectEnvironment() {
            const memory = navigator.deviceMemory || 4;
            const cores = navigator.hardwareConcurrency || 4;
            this.isLowEnd = memory < 4 || cores < 4 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            
            if ('getBattery' in navigator) {
                try {
                    const battery = await navigator.getBattery();
                    this.batterySaver = battery.level < 0.2 || (battery.charging === false && this.isLowEnd);
                    battery.addEventListener('levelchange', () => this.batterySaver = battery.level < 0.2);
                } catch(e) {}
            }
            const root = document.documentElement;
            if (this.isLowEnd || this.batterySaver) root.classList.add('qe-low-perf');
        }
    };

    const Sensory = {
        ctx: null, panner: null,
        init() { 
            if (!this.ctx && !EngineCore.isCalmMode && !EngineCore.batterySaver) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
            }
        },
        play(freq, type, duration, vol, pan = 0) {
            if (EngineCore.isLowEnd || EngineCore.isCalmMode || EngineCore.batterySaver) return;
            try {
                this.init(); if (this.ctx.state === 'suspended') this.ctx.resume();
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(vol, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                osc.connect(gain);
                if (this.panner) { this.panner.pan.value = pan; gain.connect(this.panner); this.panner.connect(this.ctx.destination); }
                else gain.connect(this.ctx.destination);
                osc.start(); osc.stop(this.ctx.currentTime + duration);
            } catch (e) {}
        },
        vibrate(pattern) { if (navigator.vibrate && !EngineCore.isCalmMode) navigator.vibrate(pattern); },
        select() { this.play(800, 'sine', 0.08, 0.015, 0); this.vibrate(10); },
        nav(dir) { this.play(500, 'triangle', 0.05, 0.01, dir); },
        success() { 
            this.play(400, 'sine', 0.1, 0.02, 0); 
            setTimeout(() => this.play(600, 'sine', 0.15, 0.03, 0), 100);
            setTimeout(() => this.play(800, 'sine', 0.3, 0.04, 0), 250);
            this.vibrate([30, 50, 30, 50, 40]); 
        }
    };

    const $el = (tag, attrs = {}, children = []) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'className') el.className = v;
            else if (k === 'innerHTML') el.innerHTML = v;
            else if (k === 'onclick') el.addEventListener('click', v);
            else if (k.startsWith('data-')) el.setAttribute(k, v);
            else el[k] = v;
        }
        children.forEach(c => {
            if (typeof c === 'string') el.appendChild(document.createTextNode(c));
            else if (c instanceof Node) el.appendChild(c);
        });
        return el;
    };

    const escapeHTML = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    const injectStyles = () => {
        if (document.getElementById('qe-v9-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-v9-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #facc15; 
                --qe-primary-soft: rgba(250, 204, 21, 0.12);
                --qe-bg: #050505; 
                --qe-surface: #111111;
                --qe-surface-2: #181818; 
                --qe-border: rgba(255, 255, 255, 0.06);
                --qe-text: #ffffff; 
                --qe-text-muted: #a1a1aa;
                --qe-ease: cubic-bezier(0.175, 0.885, 0.32, 1.1); 
                --qe-reading-width: 860px; /* تم التوسيع قليلاً لتناسب الـ Grid */
                --qe-success: #22c55e;
            }

            html.qe-active, html.qe-active body {
                overflow: hidden !important; height: 100dvh !important; width: 100vw !important; margin: 0; padding: 0;
            }

            #quizModal {
                position: fixed; inset: 0; z-index: 9999999;
                background: var(--qe-bg) !important;
                font-family: 'Cairo', system-ui, sans-serif;
                display: flex; flex-direction: column;
                height: 100dvh; width: 100vw;
                opacity: 0; transform: scale(0.98);
                transition: opacity 0.3s ease-out, transform 0.3s ease-out;
                contain: strict;
            }
            #quizModal:not(.hidden) { opacity: 1; transform: scale(1); }

            .qe-top-bar {
                background: rgba(5, 5, 5, 0.92); 
                backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); 
                border-bottom: 1px solid var(--qe-border);
                position: sticky; top: 0; z-index: 100;
                display: flex; flex-direction: column;
                contain: layout paint;
            }
            .qe-header-info {
                display: flex; justify-content: space-between; align-items: center;
                padding: 1rem 1.5rem; max-width: var(--qe-reading-width); width: 100%; margin: 0 auto; box-sizing: border-box;
            }
            .qe-quiz-title { margin: 0; color: white; font-size: 1.3rem; font-weight: 800; letter-spacing: 0.5px; }
            .qe-timer {
                font-family: 'Courier New', monospace; font-size: 1.1rem; font-weight: 900;
                background: var(--qe-surface-2); border: 1px solid var(--qe-border);
                padding: 0.4rem 1rem; border-radius: 2rem; color: var(--qe-primary);
                display: flex; align-items: center; gap: 0.5rem;
            }

            .qe-pagination-scroll {
                width: 100%; overflow-x: auto; scroll-behavior: smooth;
                padding: 0 1.5rem 1rem 1.5rem; box-sizing: border-box; scrollbar-width: none;
            }
            .qe-pagination-scroll::-webkit-scrollbar { display: none; }
            .qe-pagination-track { display: flex; gap: 0.8rem; max-width: var(--qe-reading-width); margin: 0 auto; }
            .qe-page-num {
                flex: 0 0 auto; width: 48px; height: 48px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; font-size: 1.1rem; cursor: pointer;
                border: 2px solid transparent; color: var(--qe-text-muted);
                background: var(--qe-surface); transition: all 0.3s var(--qe-ease);
                position: relative; overflow: hidden;
            }
            .qe-page-num::after { content:''; position:absolute; inset:0; border:2px solid var(--qe-border); border-radius:50%; transition:all 0.3s; }
            .qe-page-num.answered { color: var(--qe-primary); background: var(--qe-primary-soft); }
            .qe-page-num.answered::after { border-color: var(--qe-primary); opacity: 0.5; }
            .qe-page-num.active { 
                background: var(--qe-primary); color: #000; font-size: 1.25rem; font-weight: 900;
                transform: scale(1.1); box-shadow: 0 0 15px rgba(250,204,21,0.3);
            }
            .qe-page-num.active::after { display: none; }
            
            .qe-mobile-progress { display: none; }

            #quizModalContent {
                flex: 1; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                padding: 2.5rem 1.5rem calc(140px + env(safe-area-inset-bottom)); 
                display: flex; flex-direction: column;
                max-width: var(--qe-reading-width); margin: 0 auto; width: 100%; box-sizing: border-box;
                contain: layout size;
            }
            #qe-virtual-dom { position: relative; width: 100%; min-height: 50vh; touch-action: pan-y; }
            
            /* --- دمج ستايل لوحة التحكم مع محرك الاختبار --- */
            .qe-card-layer {
                display: none; opacity: 0; width: 100%;
                transition: opacity 0.3s ease, transform 0.4s var(--qe-ease);
                will-change: transform, opacity; contain: content;
                transform: translate3d(30px, 0, 0);
                
                /* الستايل الجديد (Glass Panel + Border) */
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-right: 4px solid var(--qe-primary);
                border-radius: 1.5rem;
                padding: 1.5rem;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            }
            .qe-card-layer.active { display: block; opacity: 1; transform: translate3d(0, 0, 0); position: relative; }
            .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translate3d(-30px, 0, 0); position: absolute; top: 0; }
            .qe-card-layer.exit-next { display: block; opacity: 0; transform: translate3d(30px, 0, 0); position: absolute; top: 0; }

            .qe-q-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .qe-q-title {
                color: var(--qe-primary); font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; margin: 0;
            }

            .qe-q-text-box {
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 0.75rem;
                padding: 1.2rem;
                color: white;
                font-size: 1.4rem; font-weight: 800; line-height: 1.8;
                margin-bottom: 1.5rem; text-align: right;
            }
            
            .qe-options-grid {
                display: grid; grid-template-columns: 1fr; gap: 1rem;
            }
            @media (min-width: 640px) {
                .qe-options-grid { grid-template-columns: 1fr 1fr; gap: 1rem 0.75rem; }
            }
            
            .qe-option {
                display: flex; align-items: center; padding: 0.8rem 1rem;
                background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 0.75rem; cursor: pointer; position: relative; overflow: hidden;
                transition: all 0.2s ease-out; transform: translateZ(0);
            }
            .qe-option:hover { background: rgba(255, 255, 255, 0.05); border-color: rgba(250, 204, 21, 0.5); }
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            .qe-option.selected { 
                background: rgba(250, 204, 21, 0.1); 
                border-color: var(--qe-primary);
                box-shadow: 0 0 15px rgba(250,204,21,0.15); 
                transform: scale(1.02); 
            }
            
            .qe-option-letter { 
                width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); 
                display: flex; align-items: center; justify-content: center; 
                font-weight: 900; font-size: 1rem; margin-left: 0.8rem; transition: 0.3s; color: var(--qe-text-muted); 
                flex-shrink: 0;
            }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: #000; }
            .qe-opt-text { font-size: 1.1rem; font-weight: 700; color: var(--qe-text); line-height: 1.6; flex: 1; text-align: right; } 
            /* ------------------------------------------------ */

            .qe-bottom-bar {
                position: fixed; bottom: 0; left: 0; width: 100%;
                background: rgba(5,5,5,0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                border-top: 1px solid var(--qe-border); padding: 1.2rem 1.5rem;
                display: flex; justify-content: center; z-index: 100;
                box-sizing: border-box; contain: layout paint;
            }
            .qe-nav-container { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: var(--qe-reading-width); gap: 1rem; }
            .qe-nav-group { display: flex; gap: 0.8rem; flex: 1; }
            
            .qe-btn { 
                padding: 0 2rem; height: 56px; border-radius: 14px; font-weight: 700; font-size: 1.1rem; 
                cursor: pointer; border: none; font-family: inherit; transition: all 0.2s ease; 
                display: flex; align-items: center; justify-content: center; user-select: none;
            }
            .qe-btn-primary { background: var(--qe-primary); color: #000; }
            .qe-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(250,204,21,0.2); }
            .qe-btn-secondary { background: var(--qe-surface-2); color: white; border: 1px solid var(--qe-border); }
            .qe-btn-secondary:hover:not(:disabled) { background: #222; }
            .qe-btn:disabled { opacity: 0.4 !important; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
            
            #btnSubmitQuiz { min-width: 160px; background: var(--qe-success); color: white; }
            #btnSubmitQuiz:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(34,197,94,0.3); }

            /* --- Super Animated Submit Overlay & Result Card --- */
            .qe-submitting-overlay { 
                position: fixed; inset: 0; background: rgba(5,5,5,0.96); z-index: 99999999; 
                display: none; flex-direction: column; align-items: center; justify-content: center; 
                opacity: 0; transition: opacity 0.4s ease; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            
            .qe-spinner-container { display: flex; flex-direction: column; align-items: center; justify-content: center; transition: opacity 0.3s ease, transform 0.3s ease; }
            .qe-spinner-container.hide { opacity: 0; transform: scale(0.9); pointer-events: none; position: absolute; }
            
            .qe-spinner-core { 
                width: 60px; height: 60px; border: 4px solid rgba(250,204,21,0.1); 
                border-top-color: var(--qe-primary); border-radius: 50%; 
                animation: qeSpin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin-bottom: 2rem; 
                box-shadow: 0 0 30px rgba(250,204,21,0.2);
            }
            @keyframes qeSpin { 100% { transform: rotate(360deg); } }

            .qe-result-card {
                background: rgba(20, 20, 20, 0.85);
                border: 1px solid rgba(255,255,255,0.08);
                padding: 3rem 2rem;
                border-radius: 28px;
                text-align: center;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 30px 60px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.05);
                opacity: 0;
                transform: scale(0.8) translateY(40px);
                animation: qeSpringUp 0.65s cubic-bezier(0.2, 0.8, 0.2, 1.15) forwards;
                position: relative;
                overflow: hidden;
            }
            
            .qe-result-card::before {
                content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent);
                transform: skewX(-25deg); animation: qeShine 2s infinite;
            }
            
            @keyframes qeSpringUp { 100% { transform: scale(1) translateY(0); opacity: 1; } }
            @keyframes qeShine { 0% { left: -100%; } 100% { left: 200%; } }
            
            .qe-result-icon { font-size: 4.5rem; margin-bottom: 1rem; animation: qeFloat 3s ease-in-out infinite; }
            @keyframes qeFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
            
            .qe-result-title { color: var(--qe-primary); font-size: 1.8rem; margin-bottom: 1rem; font-weight: 900; letter-spacing: 0.5px; }
            .qe-result-score { font-size: 4.5rem; font-weight: 900; color: white; margin-bottom: 0.5rem; line-height: 1; text-shadow: 0 0 40px rgba(255,255,255,0.15); }
            .qe-result-details { color: var(--qe-text-muted); font-size: 1.2rem; margin-bottom: 2.5rem; font-weight: 600; }
            .qe-result-details span { color: white; font-weight: 800; }
            
            #qe-finish-btn {
                background: var(--qe-success); color: white; border: none;
                height: 60px; border-radius: 18px; font-size: 1.2rem; font-weight: 800; cursor: pointer; width: 100%;
                box-shadow: 0 4px 20px rgba(34,197,94,0.3); transition: all 0.25s ease;
                display: flex; align-items: center; justify-content: center; gap: 10px;
            }
            #qe-finish-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(34,197,94,0.4); }
            #qe-finish-btn:active { transform: translateY(1px) scale(0.97); }

            @media (max-width: 768px) {
                .qe-pagination-scroll { display: none !important; }
                .qe-header-info { padding: 0.8rem 1rem; }
                .qe-quiz-title { font-size: 1rem; max-width: 55%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .qe-timer { font-size: 0.9rem; padding: 0.3rem 0.7rem; border: none; background: transparent; }
                
                .qe-mobile-progress {
                    display: block; width: 100%; text-align: center; font-size: 0.95rem; color: var(--qe-text-muted); 
                    font-weight: 700; padding-bottom: 0.8rem; border-bottom: 1px solid var(--qe-border);
                }

                #quizModalContent { padding: 1.5rem 1rem calc(130px + env(safe-area-inset-bottom)); }
                
                /* الحفاظ على الستايل الجديد حتى في الموبايل */
                .qe-card-layer { padding: 1.2rem; }
                .qe-card-layer.active { opacity: 1; }
                .qe-card-layer.exit-prev, .qe-card-layer.exit-next { opacity: 0; pointer-events: none; }
                
                .qe-q-text-box { font-size: 1.2rem; padding: 1rem; }
                
                .qe-option { padding: 0.8rem; }
                .qe-option-letter { width: 30px; height: 30px; font-size: 0.9rem; }
                .qe-opt-text { font-size: 1rem; }

                .qe-bottom-bar { padding: 0.8rem 1rem; background: #080808; border-top: 1px solid rgba(255,255,255,0.05); }
                .qe-nav-container { flex-direction: row; gap: 0.6rem; }
                .qe-nav-group { flex: 0 0 auto; gap: 0.6rem; }
                .qe-btn { height: 50px; border-radius: 12px; font-size: 1rem; padding: 0 1.2rem; }
                #btnSubmitQuiz { flex: 1; min-width: auto; }

                .qe-result-card { padding: 2.5rem 1.5rem; }
                .qe-result-score { font-size: 4rem; }
            }

            .qe-low-perf * { transition-duration: 0ms !important; transform: none !important; backdrop-filter: none !important; animation: none !important; }
        `;
        document.head.appendChild(style);
    };

    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        isMobile: false, vDOM: null, pageNodes: [],

        async open(quiz) {
            this.isMobile = window.innerWidth <= 768;
            await EngineCore.detectEnvironment();
            injectStyles();
            
            // 🚀 [Integration]: إيقاف جلب البيانات في لوحة التحكم أثناء إجراء الاختبار
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

            const modal = document.getElementById('quizModal');
            if (!modal) return;

            modal.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div class="qe-spinner-container" id="qe-spinner-container">
                        <div class="qe-spinner-core"></div>
                        <div style="color:white;font-weight:900;font-size:1.4rem;margin-top:1rem;letter-spacing:1px;">جاري المعالجة...</div>
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
                    <form id="activeQuizForm" onsubmit="return false;" style="width:100%;">
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

            modal.classList.remove('hidden');
            this.vDOM = document.getElementById('qe-virtual-dom');
            
            Scheduler.frame(() => {
                this.buildPagination();
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupGesturePhysics();
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
            container.innerHTML = '';
            this.pageNodes = [];
            
            const frag = document.createDocumentFragment();
            for (let i = 0; i < this.quiz.questions.length; i++) {
                const node = $el('div', {
                    className: `qe-page-num ${this.answers[`q_${i}`] !== undefined ? 'answered' : ''} ${i === this.currentIndex ? 'active' : ''}`,
                    onclick: () => this.jumpTo(i)
                }, [(i + 1).toString()]);
                this.pageNodes.push(node);
                frag.appendChild(node);
            }
            container.appendChild(frag);
            this.scrollPagination();
        },

        scrollPagination() {
            if(this.isMobile) return;
            const activeEl = this.pageNodes[this.currentIndex];
            if (activeEl) {
                const scrollContainer = activeEl.parentElement.parentElement;
                const scrollLeft = activeEl.offsetLeft - (scrollContainer.offsetWidth / 2) + (activeEl.offsetWidth / 2);
                scrollContainer.scrollTo({ left: scrollLeft, behavior: EngineCore.isLowEnd ? 'auto' : 'smooth' });
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

            Array.from(this.vDOM.children).forEach(child => {
                const idx = parseInt(child.dataset.index);
                if (!indices.includes(idx)) child.remove();
                else if (idx !== this.currentIndex) {
                    const exitClass = direction === 0 ? (idx < this.currentIndex ? 'exit-prev' : 'exit-next') : (direction > 0 ? 'exit-prev' : 'exit-next');
                    child.className = `qe-card-layer ${exitClass}`;
                }
            });

            indices.forEach(idx => {
                if (!this.vDOM.querySelector(`[data-index="${idx}"]`)) {
                    const q = this.quiz.questions[idx];
                    let enterClass = idx === this.currentIndex ? 'active' : (direction === 0 ? (idx < this.currentIndex ? 'exit-prev' : 'exit-next') : (direction > 0 ? 'exit-next' : 'exit-prev'));

                    const card = $el('div', { className: `qe-card-layer ${enterClass}`, 'data-index': idx });
                    
                    const header = $el('div', { className: 'qe-q-header' });
                    const title = $el('h3', { className: 'qe-q-title' });
                    title.innerHTML = `<svg style="width:1.25rem;height:1.25rem;color:#6b7280" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> السؤال رقم ${idx + 1}`;
                    header.appendChild(title);
                    card.appendChild(header);

                    card.appendChild($el('div', { className: 'qe-q-text-box' }, [escapeHTML(q.questionText)]));
                    
                    const group = $el('div', { className: 'qe-options-grid', role: 'radiogroup' });
                    q.options.forEach((opt, oi) => {
                        const isChecked = this.answers[`q_${idx}`] == oi;
                        const label = $el('label', { className: `qe-option ${isChecked ? 'selected' : ''}` });
                        label.appendChild($el('input', { type: 'radio', name: `q_${idx}`, value: oi, checked: isChecked }));
                        label.appendChild($el('div', { className: 'qe-option-letter' }, [letters[oi] || oi+1]));
                        label.appendChild($el('span', { className: 'qe-opt-text' }, [escapeHTML(opt)]));
                        
                        label.addEventListener('click', (e) => { e.preventDefault(); this.selectOption(idx, oi, label, group); });
                        group.appendChild(label);
                    });
                    
                    card.appendChild(group);
                    this.vDOM.appendChild(card);
                } else if (idx === this.currentIndex) {
                    const child = this.vDOM.querySelector(`[data-index="${idx}"]`);
                    if(!EngineCore.isLowEnd && !this.isMobile) void child.offsetWidth;
                    child.className = 'qe-card-layer active';
                }
            });

            setTimeout(() => UIState.set(UIState.IDLE), this.isMobile ? 160 : 350);
        },

        selectOption(qIndex, optIndex, labelElement, group) {
            if (UIState.is(UIState.TRANSITIONING) || UIState.is(UIState.SUBMITTING)) return;
            EngineCore.trackInteraction(); Sensory.select();
            
            group.querySelectorAll('.qe-option').forEach(el => el.classList.remove('selected'));
            labelElement.classList.add('selected');
            labelElement.querySelector('input').checked = true;

            this.answers[`q_${qIndex}`] = optIndex;
            Scheduler.idle(() => localStorage.setItem(`dq_${this.quiz.id}`, JSON.stringify({ answers: this.answers, timeLeft: this.totalTime })));
            
            if(!this.pageNodes[qIndex].classList.contains('answered')) this.pageNodes[qIndex].classList.add('answered');
            this.updateUI(true);

            if (!this.isMobile && this.currentIndex < this.quiz.questions.length - 1) {
                setTimeout(() => this.next(), 350);
            }
        },

        updateUI() {
            Scheduler.frame(() => {
                const total = this.quiz.questions.length;
                
                const mobileProgress = document.getElementById('qe-mobile-progress');
                if(mobileProgress) mobileProgress.innerText = `السؤال ${this.currentIndex + 1} من ${total}`;

                const btnPrev = document.getElementById('qe-btn-prev');
                const btnNext = document.getElementById('qe-btn-next');
                const btnSubmit = document.getElementById('btnSubmitQuiz');

                btnPrev.disabled = this.currentIndex === 0;
                
                if (this.isMobile) {
                    btnNext.disabled = this.currentIndex === total - 1;
                    btnNext.style.display = (this.currentIndex === total - 1) ? 'none' : 'flex';
                    btnSubmit.style.display = (this.currentIndex === total - 1) ? 'flex' : 'none';
                    btnSubmit.disabled = false; 
                } else {
                    btnNext.disabled = this.currentIndex === total - 1;
                    btnNext.style.display = 'flex';
                    btnSubmit.style.display = 'flex';
                    
                    const isLast = this.currentIndex === total - 1;
                    btnSubmit.disabled = !isLast;
                    if(isLast) {
                        btnSubmit.style.background = 'var(--qe-success)';
                        btnSubmit.style.color = 'white';
                    } else {
                        btnSubmit.style.background = 'var(--qe-surface-2)';
                        btnSubmit.style.color = 'var(--qe-text-muted)';
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

        setupGesturePhysics() {
            let startX = 0, startY = 0;
            
            this.touchStartHandler = e => {
                if(EngineCore.isLowEnd) return;
                startX = e.changedTouches[0].screenX;
                startY = e.changedTouches[0].screenY;
            };
            
            this.touchEndHandler = e => {
                if(EngineCore.isLowEnd) return;
                const dx = e.changedTouches[0].screenX - startX;
                const dy = e.changedTouches[0].screenY - startY;
                
                if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
                    if (dx > 0) this.prev(); else this.next();
                }
            };
            
            this.vDOM.addEventListener('touchstart', this.touchStartHandler, { passive: true });
            this.vDOM.addEventListener('touchend', this.touchEndHandler, { passive: true });
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
                    
                    if (this.totalTime === 60) { timerEl.style.color = '#ef4444'; Sensory.play(300, 'square', 0.1, 0.05); }
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
            
            if(this.vDOM) {
                this.vDOM.removeEventListener('touchstart', this.touchStartHandler);
                this.vDOM.removeEventListener('touchend', this.touchEndHandler);
            }
            
            const overlay = document.getElementById('qe-submit-layer');
            const spinnerContainer = document.getElementById('qe-spinner-container');
            if(overlay) overlay.classList.add('show');
            
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
                
                // 🚀 [إصلاح الأداء]: تغليف Confetti في Try-Catch وضبط عدد الجزيئات والـ zIndex
                try {
                    if (typeof confetti === 'function') {
                        if (percentage >= 85 && !EngineCore.isLowEnd) {
                            confetti({
                                particleCount: 80,
                                spread: 90,
                                origin: { y: 0.6 },
                                colors: ['#facc15', '#22c55e', '#ffffff'],
                                zIndex: 9999
                            });
                        } else {
                            confetti({
                                particleCount: 50,
                                spread: 70,
                                origin: { y: 0.6 },
                                zIndex: 9999
                            });
                        }
                    }
                } catch (err) {
                    console.warn('Confetti blocked safely');
                }

                if (overlay) {
                    setTimeout(() => {
                        if (spinnerContainer) spinnerContainer.classList.add('hide');
                        
                        const resultCard = document.createElement('div');
                        resultCard.className = 'qe-result-card';
                        resultCard.innerHTML = `
                            <div class="qe-result-icon">${percentage >= 85 ? 'ممتاز' : (percentage >= 50 ? 'جيد جدا' : 'مقبول')}</div>
                            <h2 class="qe-result-title">انتهى الاختبار</h2>
                            <div class="qe-result-score">${percentage}%</div>
                            <div class="qe-result-details">
                                درجتك: <span>${score}</span> من <span>${this.quiz.questions.length}</span>
                            </div>
                            <button id="qe-finish-btn">
                                إنهاء ومتابعة
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </button>
                        `;
                        
                        overlay.appendChild(resultCard);

                        document.getElementById('qe-finish-btn').onclick = () => {
                            EngineCore.trackInteraction(); Sensory.select();
                            overlay.style.opacity = '0';
                            
                            setTimeout(() => {
                                overlay.classList.remove('show');
                                overlay.style.opacity = '';
                                
                                this.close();
                                
                                setTimeout(() => {
                                    if (
                                        typeof window.DahihApp !== 'undefined' &&
                                        typeof window.DahihApp.startDashboardPolling === 'function'
                                    ) {
                                        window.DahihApp.startDashboardPolling();
                                    }
                                    if (typeof QuizApp !== 'undefined' && QuizApp.reload) {
                                        QuizApp.reload();
                                    }
                                }, 2500);

                            }, 350);
                        };
                    }, 500); 
                } else {
                    this.close();
                }

            } catch (err) { 
                console.error("خطأ حرج أثناء تسليم الاختبار:", err);
                alert("عذراً، حدث خطأ أثناء حفظ إجاباتك. يرجى مراجعة الاتصال بالإنترنت.");
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
                    modal.classList.add('hidden'); 
                    modal.innerHTML = ''; 
                    this.vDOM = null; 
                    this.pageNodes = []; 
                }, 350);
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();
