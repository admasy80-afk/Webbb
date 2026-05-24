(function () {
    'use strict';

    // --- 1. State Machine (SaaS Level Architecture) ---
    const EventBus = {
        events: {},
        on(event, listener) { (this.events[event] || (this.events[event] = [])).push(listener); },
        emit(event, data) { (this.events[event] || []).forEach(l => l(data)); }
    };

    const UIState = {
        IDLE: 'idle', ANSWERING: 'answering', TRANSITIONING: 'transitioning', SUBMITTING: 'submitting',
        current: 'idle',
        set(state) { this.current = state; EventBus.emit('STATE_CHANGE', state); },
        is(state) { return this.current === state; }
    };

    // --- 2. Advanced Scheduling & Partial Hydration ---
    const Scheduler = {
        idle(task) { ('requestIdleCallback' in window) ? requestIdleCallback(task, { timeout: 800 }) : setTimeout(task, 16); },
        frame(task) { requestAnimationFrame(task); },
        debounce(func, wait) {
            let timeout;
            return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
        }
    };

    // --- 3. Engine Core (Optimized & Bug Fixed) ---
    const EngineCore = {
        isLowEnd: false, isCalmMode: false, batterySaver: false,
        lastInteraction: Date.now(), erraticClicks: 0,
        
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
            this.applyProfiles();
        },

        applyProfiles() {
            const root = document.documentElement;
            if (this.isLowEnd || this.batterySaver) root.classList.add('qe-low-perf');
            if (this.isCalmMode) root.classList.add('qe-calm-mode');
        }
    };

    // --- 4. Sensory Feedback (Web Audio API & Haptics) ---
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
        select() { this.play(800, 'sine', 0.1, 0.02, 0); this.vibrate(15); },
        nav(dir) { this.play(500, 'triangle', 0.08, 0.01, dir); },
        success() { 
            this.play(400, 'sine', 0.1, 0.02, 0); 
            setTimeout(() => this.play(600, 'sine', 0.15, 0.03, 0), 100);
            setTimeout(() => this.play(800, 'sine', 0.3, 0.04, 0), 250);
            this.vibrate([30, 50, 30, 50, 40]); 
        }
    };

    // --- 5. DOM Builder (Escaping String HTML Hell) ---
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

    // --- 6. Styles Architecture (CSS Containment & GPU Transforms) ---
    const injectStyles = () => {
        if (document.getElementById('qe-v7-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-v7-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #facc15; 
                --qe-primary-soft: rgba(250, 204, 21, 0.12);
                --qe-primary-glow: rgba(250, 204, 21, 0.4);
                --qe-bg: #050505; 
                --qe-surface: #111111;
                --qe-surface-2: #181818; /* Depth Layer */
                --qe-surface-hover: #1a1a1a;
                --qe-border: rgba(255, 255, 255, 0.06);
                --qe-text: #ffffff; 
                --qe-text-muted: #a1a1aa;
                --qe-ease: cubic-bezier(0.175, 0.885, 0.32, 1.1); /* Spring Animation */
                --qe-reading-width: 850px;
                --qe-success: #22c55e;
                --qe-danger: #ef4444;
            }

            html.qe-active, html.qe-active body {
                overflow: hidden !important; height: 100dvh !important; width: 100vw !important; margin: 0; padding: 0;
            }

            #quizModal {
                position: fixed; inset: 0; z-index: 9999999;
                background: var(--qe-bg) !important;
                background-image: radial-gradient(circle at top, rgba(250,204,21,0.03), transparent 60%), #050505 !important;
                font-family: 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif;
                display: flex; flex-direction: column;
                height: 100dvh; width: 100vw;
                opacity: 0; transform: scale(0.98);
                transition: opacity 0.4s ease-out, transform 0.4s var(--qe-ease);
                contain: strict; /* CSS Containment for max perf */
            }
            #quizModal:not(.hidden) { opacity: 1; transform: scale(1); }

            .qe-top-bar {
                background: rgba(5, 5, 5, 0.92); 
                backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); /* Fixed Blur */
                border-bottom: 1px solid var(--qe-border);
                position: sticky; top: 0; z-index: 100;
                display: flex; flex-direction: column;
                contain: layout paint;
            }

            .qe-header-info {
                display: flex; justify-content: space-between; align-items: center;
                padding: 1rem 1.5rem; max-width: var(--qe-reading-width); width: 100%; margin: 0 auto; box-sizing: border-box;
            }

            .qe-quiz-title { margin: 0; color: white; font-size: clamp(1.1rem, 2.5vw, 1.4rem); font-weight: 800; letter-spacing: 0.5px; }
            
            .qe-timer {
                font-family: 'Courier New', Courier, monospace; font-size: 1.1rem; font-weight: 900;
                background: var(--qe-surface-2); border: 1px solid var(--qe-border);
                padding: 0.4rem 1rem; border-radius: 2rem; color: var(--qe-primary);
                display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 0 10px rgba(250,204,21,0.05);
            }

            .qe-pagination-scroll {
                width: 100%; overflow-x: auto; scroll-behavior: smooth;
                padding: 0 1.5rem 1rem 1.5rem; box-sizing: border-box; scrollbar-width: none;
                -webkit-overflow-scrolling: touch;
            }
            .qe-pagination-scroll::-webkit-scrollbar { display: none; }
            
            .qe-pagination-track { display: flex; gap: 0.8rem; max-width: var(--qe-reading-width); margin: 0 auto; }

            /* Accessibility Fixed (48px) */
            .qe-page-num {
                flex: 0 0 auto; width: 48px; height: 48px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; font-size: 1.1rem; cursor: pointer;
                border: 2px solid transparent; color: var(--qe-text-muted);
                background: var(--qe-surface); transition: all 0.3s var(--qe-ease);
                position: relative; overflow: hidden; will-change: transform, background-color;
            }
            .qe-page-num::after { content:''; position:absolute; inset:0; border:2px solid var(--qe-border); border-radius:50%; transition:all 0.3s; }
            .qe-page-num:hover::after { border-color: rgba(255,255,255,0.2); }
            .qe-page-num.answered { color: var(--qe-primary); background: var(--qe-primary-soft); }
            .qe-page-num.answered::after { border-color: var(--qe-primary); opacity: 0.5; }
            .qe-page-num.active { 
                background: var(--qe-primary); color: #000; font-size: 1.25rem; font-weight: 900;
                transform: scale(1.1); box-shadow: 0 0 20px var(--qe-primary-glow);
            }
            .qe-page-num.active::after { display: none; }

            #quizModalContent {
                flex: 1; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                padding: 2rem 1.5rem calc(140px + env(safe-area-inset-bottom)); /* Fixed Mobile Spacing */
                display: flex; flex-direction: column;
                max-width: var(--qe-reading-width); margin: 0 auto; width: 100%; box-sizing: border-box;
                contain: layout size;
            }
            
            /* Virtual DOM Container */
            #qe-virtual-dom { position: relative; width: 100%; min-height: 50vh; touch-action: pan-y; }
            
            .qe-card-layer {
                display: none; opacity: 0; width: 100%;
                transition: opacity 0.3s ease, transform 0.4s var(--qe-ease);
                will-change: transform, opacity;
                contain: content; /* Massive perf boost */
            }
            
            /* GPU Optimized Transforms */
            @media (min-width: 769px) {
                .qe-card-layer { transform: translate3d(30px, 0, 0); }
                .qe-card-layer.active { display: block; opacity: 1; transform: translate3d(0, 0, 0); position: relative; }
                .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translate3d(-30px, 0, 0); position: absolute; top: 0; }
                .qe-card-layer.exit-next { display: block; opacity: 0; transform: translate3d(30px, 0, 0); position: absolute; top: 0; }
            }
            @media (max-width: 768px) {
                .qe-card-layer, .qe-card-layer.active, .qe-card-layer.exit-prev, .qe-card-layer.exit-next { transform: translate3d(0,0,0) !important; }
                .qe-card-layer.active { display: block; opacity: 1; position: relative; }
                .qe-card-layer.exit-prev, .qe-card-layer.exit-next { display: block; opacity: 0; position: absolute; top: 0; pointer-events: none; }
            }

            /* Typography Hierarchy */
            .qe-q-text { font-size: clamp(1.3rem, 4vw, 1.8rem); font-weight: 900; line-height: 1.7; margin: 0 0 2.5rem 0; color: white; text-align: right; letter-spacing: 0.5px; }
            
            .qe-option {
                display: flex; align-items: center; padding: clamp(1rem, 3vw, 1.4rem); margin-bottom: 1rem;
                background: var(--qe-surface); border: 2px solid transparent;
                border-radius: 1rem; cursor: pointer; position: relative; overflow: hidden;
                transition: all 0.2s ease-out; transform: translateZ(0);
                box-shadow: inset 0 0 0 1px var(--qe-border);
            }
            
            @media (min-width: 769px) { .qe-option:hover { background: var(--qe-surface-hover); transform: translate3d(-4px, 0, 0); } }
            
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            .qe-option.selected { 
                background: var(--qe-surface-2); /* Deep layer for selection */
                box-shadow: inset 0 0 0 2px var(--qe-primary), 0 4px 15px rgba(0,0,0,0.5); /* Fixed expensive shadow */
                transform: scale(1.01); 
            }
            
            .qe-option-letter { 
                width: 44px; height: 44px; border-radius: 10px; background: rgba(255,255,255,0.03); 
                display: flex; align-items: center; justify-content: center; 
                font-weight: 900; font-size: 1.2rem; margin-left: 1.2rem; transition: 0.3s; color: var(--qe-text-muted); 
                border: 1px solid rgba(255,255,255,0.1);
            }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: #000; border-color: var(--qe-primary); box-shadow: 0 0 15px rgba(250,204,21,0.3); }
            
            .qe-opt-text { font-size: clamp(1.05rem, 2.5vw, 1.2rem); font-weight: 600; color: var(--qe-text); line-height: 1.6; flex: 1; text-align: right; } /* Typography hierarchy */

            .qe-bottom-bar {
                position: fixed; bottom: 0; left: 0; width: 100%;
                background: rgba(5,5,5,0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                border-top: 1px solid var(--qe-border); padding: 1rem 1.5rem;
                display: flex; justify-content: center; z-index: 100;
                padding-bottom: max(env(safe-area-inset-bottom, 1rem), 1rem);
                box-sizing: border-box; contain: layout paint;
            }
            
            .qe-nav-container { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: var(--qe-reading-width); gap: 1rem; }
            .qe-nav-group { display: flex; gap: 0.8rem; flex: 1; }
            
            /* Buttons Typography & Ripple */
            .qe-btn { 
                padding: 0 2rem; height: 56px; border-radius: 14px; font-weight: 700; font-size: 1.1rem; 
                cursor: pointer; border: none; font-family: inherit; transition: all 0.2s var(--qe-ease); 
                display: flex; align-items: center; justify-content: center; user-select: none;
                position: relative; overflow: hidden;
            }
            .qe-btn-primary { background: var(--qe-primary); color: #000; box-shadow: 0 2px 10px rgba(250,204,21,0.15); }
            .qe-btn-secondary { background: var(--qe-surface-2); color: white; border: 1px solid var(--qe-border); }
            .qe-btn:disabled { opacity: 0.4 !important; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
            
            #btnSubmitQuiz { min-width: 160px; background: var(--qe-success); color: white; box-shadow: 0 2px 10px rgba(34,197,94,0.2); }

            @media (min-width: 769px) {
                .qe-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(250,204,21,0.3); }
                .qe-btn-secondary:hover:not(:disabled) { background: var(--qe-surface-hover); }
                #btnSubmitQuiz:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(34,197,94,0.4); }
            }

            @media (max-width: 768px) {
                .qe-nav-container { flex-direction: column-reverse; }
                .qe-nav-group { width: 100%; }
                .qe-btn { flex: 1; padding: 0; width: 100%; }
                #btnSubmitQuiz { width: 100%; }
            }

            .qe-submitting-overlay { 
                position: fixed; inset: 0; background: rgba(5,5,5,0.95); z-index: 99999999; 
                display: none; flex-direction: column; align-items: center; justify-content: center; 
                opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(10px);
            }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            
            .qe-spinner-core { 
                width: 60px; height: 60px; border: 4px solid rgba(250,204,21,0.1); 
                border-top-color: var(--qe-primary); border-radius: 50%; 
                animation: qeSpin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin-bottom: 2rem; 
                box-shadow: 0 0 30px rgba(250,204,21,0.2);
            }
            @keyframes qeSpin { 100% { transform: rotate(360deg); } }
            
            /* Extreme Perf override */
            .qe-low-perf { --qe-ease: linear !important; }
            .qe-low-perf * { transition-duration: 0ms !important; box-shadow: none !important; transform: none !important; backdrop-filter: none !important; animation: none !important; }
            .qe-low-perf .qe-top-bar, .qe-low-perf .qe-bottom-bar { background: rgba(5,5,5,1); }
        `;
        document.head.appendChild(style);
    };

    // --- 7. Quiz Engine (The Core Orchestrator) ---
    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        isMobile: false, vDOM: null, pageNodes: [],

        async open(quiz) {
            this.isMobile = window.innerWidth <= 768;
            await EngineCore.detectEnvironment();
            injectStyles();
            
            document.documentElement.classList.add('qe-active');
            this.quiz = quiz; UIState.set(UIState.IDLE);
            
            const saved = JSON.parse(localStorage.getItem(`dq_${quiz.id}`)) || {};
            this.answers = saved.answers || {};
            this.totalTime = saved.timeLeft || (quiz.duration || quiz.questions.length * 60);
            
            this.currentIndex = 0;
            while(this.answers[`q_${this.currentIndex}`] !== undefined && this.currentIndex < quiz.questions.length - 1) this.currentIndex++;

            const modal = document.getElementById('quizModal');
            if (!modal) return;

            // Strict String Template Initialization (One Time)
            modal.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div class="qe-spinner-core"></div>
                    <div style="color:white;font-weight:900;font-size:1.5rem;letter-spacing:1px;text-align:center;">جاري معالجة الإجابات<br><span style="color:var(--qe-primary);font-size:1.1rem;">يرجى الانتظار</span></div>
                </div>
                <div class="qe-top-bar">
                    <div class="qe-header-info">
                        <h2 class="qe-quiz-title">${escapeHTML(quiz.title)}</h2>
                        <div class="qe-timer" id="qe-timer">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span id="qe-timer-text">--:--</span>
                        </div>
                    </div>
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

            modal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            this.vDOM = document.getElementById('qe-virtual-dom');
            
            Scheduler.frame(() => {
                this.buildPagination();
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupGesturePhysics(); // Updated to Physics
                this.attachEvents();
            });
        },

        attachEvents() {
            document.getElementById('qe-btn-prev').onclick = () => { EngineCore.trackInteraction(); this.prev(); };
            document.getElementById('qe-btn-next').onclick = () => { EngineCore.trackInteraction(); this.next(); };
            document.getElementById('btnSubmitQuiz').onclick = () => this.submitCheck();
            
            this.resizeHandler = Scheduler.debounce(() => { this.isMobile = window.innerWidth <= 768; }, 250);
            window.addEventListener('resize', this.resizeHandler);
        },

        // Virtualized DOM for Pagination
        buildPagination() {
            const container = document.getElementById('qe-pagination-container');
            if (!container) return;
            container.innerHTML = '';
            this.pageNodes = [];
            
            const frag = document.createDocumentFragment();
            for (let i = 0; i < this.quiz.questions.length; i++) {
                const node = $el('div', {
                    className: `qe-page-num ${this.answers[`q_${i}`] !== undefined ? 'answered' : ''} ${i === this.currentIndex ? 'active' : ''}`,
                    id: `qe-page-${i}`,
                    onclick: () => this.jumpTo(i)
                }, [(i + 1).toString()]);
                this.pageNodes.push(node);
                frag.appendChild(node);
            }
            container.appendChild(frag);
            this.scrollPagination();
        },

        scrollPagination() {
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

        // Real Virtual DOM Renderer (No String HTML for active state transitions)
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
                    card.appendChild($el('h4', { className: 'qe-q-text' }, [escapeHTML(q.questionText)]));
                    
                    const group = $el('div', { role: 'radiogroup' });
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
                    if(!EngineCore.isLowEnd) void child.offsetWidth; // Force Reflow
                    child.className = 'qe-card-layer active';
                }
            });

            setTimeout(() => UIState.set(UIState.IDLE), 350); // Release lock after transition
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

            // Auto-next ONLY on Desktop (Bug 10 applied natively)
            if (!this.isMobile && this.currentIndex < this.quiz.questions.length - 1) {
                setTimeout(() => this.next(), 350);
            }
        },

        updateUI() {
            Scheduler.frame(() => {
                const total = this.quiz.questions.length;
                const btnPrev = document.getElementById('qe-btn-prev');
                const btnNext = document.getElementById('qe-btn-next');
                const btnSubmit = document.getElementById('btnSubmitQuiz');

                btnPrev.disabled = this.currentIndex === 0;
                btnNext.disabled = this.currentIndex === total - 1;

                const isLast = this.currentIndex === total - 1;
                btnSubmit.disabled = !isLast;
                btnSubmit.className = isLast ? 'qe-btn qe-btn-primary' : 'qe-btn';
                if(isLast) {
                    btnSubmit.style.background = 'var(--qe-success)';
                    btnSubmit.style.boxShadow = '0 2px 10px rgba(34,197,94,0.3)';
                    btnSubmit.style.opacity = '1';
                } else {
                    btnSubmit.style.background = 'var(--qe-surface-2)';
                    btnSubmit.style.boxShadow = 'none';
                    btnSubmit.style.color = 'var(--qe-text-muted)';
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

        // Physics-Based Gesture Control (Bug 2 Fixed - Scoped to Virtual DOM)
        setupGesturePhysics() {
            let startX = 0, startY = 0, startTime = 0;
            
            this.touchStartHandler = e => {
                if(EngineCore.isLowEnd) return;
                startX = e.changedTouches[0].screenX;
                startY = e.changedTouches[0].screenY;
                startTime = Date.now();
            };
            
            this.touchEndHandler = e => {
                if(EngineCore.isLowEnd) return;
                const dx = e.changedTouches[0].screenX - startX;
                const dy = e.changedTouches[0].screenY - startY;
                const dt = Date.now() - startTime;
                
                const velocityX = Math.abs(dx / dt);
                
                // Intent detection: Must be mostly horizontal, fast enough, or long enough
                if (Math.abs(dx) > Math.abs(dy) * 2 && (Math.abs(dx) > 50 || velocityX > 0.5)) {
                    if (dx > 0) this.prev(); else this.next();
                }
            };
            
            // Scope specifically to the Virtual DOM to prevent scroll interference
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
                    
                    if (this.totalTime === 60) { timerEl.style.color = 'var(--qe-accent)'; Sensory.play(300, 'square', 0.1, 0.05); }
                    if (this.totalTime <= 15) { 
                        timerEl.style.color = 'var(--qe-danger)'; 
                        if(this.totalTime % 2 === 0) Sensory.play(200, 'sawtooth', 0.1, 0.05);
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
            if(this.vDOM) {
                this.vDOM.removeEventListener('touchstart', this.touchStartHandler);
                this.vDOM.removeEventListener('touchend', this.touchEndHandler);
            }
            
            const overlay = document.getElementById('qe-submit-layer');
            if(overlay) overlay.classList.add('show');
            
            let score = 0;
            this.quiz.questions.forEach((q, qi) => { if (parseInt(this.answers[`q_${qi}`]) === q.correctAnswer) score++; });
            const percentage = Math.round((score / this.quiz.questions.length) * 100);

            try {
                // Client Platform Integration (Al-Dahih / Supabase readiness)
                const appState = typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.getState === 'function' ? window.DahihApp.getState() : {};
                
                if (typeof window.DahihApp !== 'undefined' && window.DahihApp.fetchWithTimeout) {
                    await window.DahihApp.fetchWithTimeout('/api/student/submit-quiz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.token}` },
                        body: JSON.stringify({ email: appState.user?.email, quizId: this.quiz.id, score, percentage })
                    });
                }
                
                Scheduler.idle(() => localStorage.removeItem(`dq_${this.quiz.id}`));
                Sensory.success();
                
                if (percentage >= 85 && !EngineCore.isLowEnd && typeof confetti === 'function') {
                    confetti({ particleCount: 250, spread: 100, origin: { y: 0.5 }, colors: ['#facc15', '#22c55e', '#ffffff'], zIndex: 99999999 });
                }

                if(overlay) overlay.classList.remove('show');
                this.close();
                
                setTimeout(() => { 
                    if(typeof window.DahihApp !== 'undefined' && window.DahihApp.refresh) window.DahihApp.refresh(); 
                }, 250);

            } catch (err) { 
                alert(`حدث خطأ أثناء المعالجة: ${err.message}`); 
                if(overlay) overlay.classList.remove('show');
                UIState.set(UIState.IDLE);
            }
        },

        close() {
            clearInterval(this.timerId);
            window.removeEventListener('resize', this.resizeHandler);
            document.documentElement.classList.remove('qe-active');
            const modal = document.getElementById('quizModal');
            if (modal) {
                modal.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                setTimeout(() => { modal.classList.add('hidden'); modal.innerHTML = ''; this.vDOM = null; this.pageNodes = []; }, 400);
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();
