(function () {
    'use strict';
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
        }
    };

    // Lightweight Sensory Engine (No AudioContext)
    const Sensory = {
        play(type) {
            if (EngineCore.isLowEnd || EngineCore.batterySaver || EngineCore.isCalmMode) return;
            try {
                const src = type === 'tick' ? '/assets/audio/tick.mp3' : '/assets/audio/success.mp3';
                const audio = new Audio(src);
                audio.volume = type === 'tick' ? 0.1 : 0.3;
                const p = audio.play();
                if (p !== undefined) p.catch(() => {});
            } catch (e) {}
        },
        vibrate(pattern) { if (navigator.vibrate && !EngineCore.isCalmMode) navigator.vibrate(pattern); },
        select() { this.play('tick'); this.vibrate([10]); },
        nav() { this.play('tick'); this.vibrate([5]); },
        success() { this.play('success'); this.vibrate([30, 40, 30]); }
    };

    const $el = (tag, attrs = {}, children = []) => {
        const el = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'polyline' || tag === 'polygon'
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

    const injectStyles = () => {
        if (document.getElementById('qe-vX-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-vX-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #facc15; 
                --qe-bg: #030303; 
                --qe-surface: #0a0a0a;
                --qe-border: rgba(255, 255, 255, 0.04);
                --qe-text: #f4f4f5; 
                --qe-text-muted: #a1a1aa;
                --qe-success: #22c55e;
                --qe-ease-smooth: cubic-bezier(.22, 1, .36, 1);
                --qe-width: 900px;
            }

            html.qe-active, html.qe-active body {
                overflow: hidden !important; height: 100dvh !important; width: 100vw !important; margin: 0; padding: 0;
                background: var(--qe-bg) !important; overscroll-behavior: none;
            }

            #quizModal {
                position: fixed; inset: 0; z-index: 9999999;
                background: var(--qe-bg) !important;
                font-family: 'Cairo', system-ui, -apple-system, sans-serif;
                display: flex; flex-direction: column;
                height: 100dvh; width: 100vw;
                opacity: 0; transform: scale(0.99);
                transition: opacity 0.3s ease-out, transform 0.3s ease-out;
                color: var(--qe-text);
            }
            #quizModal:not(.hidden) { opacity: 1; transform: scale(1); }

            .qe-top-bar {
                background: rgba(3, 3, 3, 0.98); 
                border-bottom: 1px solid var(--qe-border);
                position: relative; z-index: 10;
                display: flex; flex-direction: column;
            }
            .qe-header-info {
                display: flex; justify-content: space-between; align-items: center;
                padding: 1rem 2rem; max-width: var(--qe-width); width: 100%; margin: 0 auto; box-sizing: border-box;
            }
            .qe-quiz-title { margin: 0; color: white; font-size: 1.3rem; font-weight: 800; }
            .qe-timer {
                font-family: 'SF Mono', 'Courier New', monospace; font-size: 1.1rem; font-weight: 800;
                background: rgba(250,204,21,0.05); border: 1px solid rgba(250,204,21,0.1);
                padding: 0.4rem 1rem; border-radius: 100px; color: var(--qe-primary);
                display: flex; align-items: center; gap: 0.5rem; transition: color 0.3s ease, border-color 0.3s ease;
            }
            .qe-timer.warning { color: #ef4444; background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2); }

            .qe-pagination-scroll {
                width: 100%; overflow-x: auto; padding: 0 2rem 1rem 2rem; box-sizing: border-box;
                scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth;
            }
            .qe-pagination-scroll::-webkit-scrollbar { display: none; }
            .qe-pagination-track { display: flex; gap: 0.6rem; max-width: var(--qe-width); margin: 0 auto; }
            .qe-page-num {
                flex: 0 0 auto; width: 40px; height: 40px; border-radius: 12px;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; font-size: 1rem; cursor: pointer; user-select: none;
                border: 1px solid var(--qe-border); color: var(--qe-text-muted);
                background: var(--qe-surface); 
                transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s var(--qe-ease-smooth);
            }
            .qe-page-num.answered { color: var(--qe-primary); border-color: rgba(250,204,21,0.2); background: rgba(250,204,21,0.02); }
            .qe-page-num.active { 
                background: var(--qe-primary); color: #000; font-weight: 800; border-color: var(--qe-primary);
                transform: scale(1.05); 
            }
            .qe-mobile-progress { display: none; }

            #quizModalContent {
                flex: 1; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                padding: 2rem 1.5rem calc(100px + env(safe-area-inset-bottom)); 
                display: flex; flex-direction: column; align-items: center;
                width: 100%; box-sizing: border-box;
            }
            
            #qe-virtual-dom { position: relative; width: 100%; max-width: var(--qe-width); min-height: 50vh; }
            
            /* --- The Khariq Card UI (Optimized) --- */
            .qe-card-layer {
                display: none; width: 100%;
                background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
                border: 1px solid rgba(255,255,255,0.05);
                border-right: 3px solid var(--qe-primary);
                border-radius: 20px; padding: 1.5rem;
                box-shadow: 0 4px 14px rgba(0,0,0,0.2);
                transition: opacity 0.25s var(--qe-ease-smooth), transform 0.25s var(--qe-ease-smooth);
            }
            .qe-card-layer.active { display: block; opacity: 1; transform: translate3d(0, 0, 0); position: relative; z-index: 2; }
            .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translate3d(-20px, 0, 0); position: absolute; top: 0; pointer-events: none; }
            .qe-card-layer.exit-next { display: block; opacity: 0; transform: translate3d(20px, 0, 0); position: absolute; top: 0; pointer-events: none; }

            .qe-q-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 1rem; padding-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.03);
            }
            .qe-q-title { color: var(--qe-primary); font-size: 1.1rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; margin: 0; }

            .qe-q-text-box {
                background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255,255,255,0.03);
                border-radius: 12px; padding: 1.2rem; color: #fff;
                font-size: 1.3rem; font-weight: 700; line-height: 1.6;
                margin-bottom: 1.5rem; text-align: right;
            }
            
            .qe-options-grid { display: grid; grid-template-columns: 1fr; gap: 0.8rem; }
            @media (min-width: 768px) { .qe-options-grid { grid-template-columns: 1fr 1fr; gap: 1rem; } }
            
            .qe-option {
                display: flex; align-items: center; padding: 0.9rem 1rem;
                background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
                border-radius: 14px; cursor: pointer; position: relative;
                transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
            }
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            
            .qe-option.selected { 
                background: rgba(250,204,21,0.05);
                border-color: var(--qe-primary); 
                transform: scale(1.01);
            }
            
            .qe-option-letter { 
                width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); 
                display: flex; align-items: center; justify-content: center; 
                font-weight: 800; font-size: 1rem; margin-left: 1rem; color: var(--qe-text-muted); 
                flex-shrink: 0; transition: background 0.15s ease, color 0.15s ease;
            }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: #000; }
            .qe-opt-text { font-size: 1.1rem; font-weight: 700; color: #e4e4e7; line-height: 1.5; flex: 1; text-align: right; } 

            /* --- Bottom Navigation --- */
            .qe-bottom-bar {
                position: fixed; bottom: 0; left: 0; width: 100%;
                background: rgba(5,5,5,0.98);
                border-top: 1px solid rgba(255,255,255,0.05); padding: 1rem 1.5rem;
                display: flex; justify-content: center; z-index: 100; box-sizing: border-box;
            }
            .qe-nav-container { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: var(--qe-width); gap: 1rem; }
            .qe-nav-group { display: flex; gap: 0.8rem; flex: 1; }
            
            .qe-btn { 
                padding: 0 2rem; height: 54px; border-radius: 14px; font-weight: 700; font-size: 1.1rem; 
                cursor: pointer; border: none; font-family: inherit; 
                transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease; 
                display: flex; align-items: center; justify-content: center; user-select: none;
            }
            .qe-btn:active:not(:disabled) { transform: scale(0.98); }
            .qe-btn-primary { background: var(--qe-primary); color: #000; }
            .qe-btn-secondary { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.08); }
            .qe-btn:disabled { opacity: 0.4 !important; cursor: not-allowed; transform: none !important; }
            
            #btnSubmitQuiz { min-width: 160px; background: var(--qe-success); color: white; }

            /* --- Result Animation (No Canvas) --- */
            .qe-submitting-overlay { 
                position: fixed; inset: 0; background: rgba(5,5,5,0.98); z-index: 99999999; 
                display: none; flex-direction: column; align-items: center; justify-content: center; 
                opacity: 0; transition: opacity 0.3s ease; 
            }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            
            .qe-spinner-container { transition: opacity 0.2s ease, transform 0.2s ease; display: flex; flex-direction: column; align-items: center; }
            .qe-spinner-container.hide { opacity: 0; transform: scale(0.9); pointer-events: none; position: absolute; }
            
            .qe-cyber-loader {
                width: 60px; height: 60px; position: relative; margin-bottom: 1.5rem;
                border: 3px solid rgba(250,204,21,0.1); border-top-color: var(--qe-primary);
                border-radius: 50%; animation: qeSpin 0.8s linear infinite;
            }
            @keyframes qeSpin { 100% { transform: rotate(360deg); } }

            .qe-result-card {
                background: #0a0a0a; border: 1px solid rgba(250,204,21,0.15);
                padding: 3rem 2rem; border-radius: 24px; text-align: center;
                max-width: 400px; width: 90%;
                opacity: 0; transform: scale(0.9) translateY(20px);
                animation: qeSpringUp 0.5s var(--qe-ease-smooth) forwards;
                position: relative; overflow: hidden;
            }
            @keyframes qeSpringUp { 100% { transform: scale(1) translateY(0); opacity: 1; } }
            
            .qe-success-bg {
                position: absolute; inset: 0; pointer-events: none;
                background: radial-gradient(circle at 50% -20%, rgba(250,204,21,0.15) 0%, transparent 60%);
                animation: pulseBg 3s ease-in-out infinite alternate;
            }
            @keyframes pulseBg { 0% { opacity: 0.5; } 100% { opacity: 1; } }

            .qe-result-icon { font-size: 4.5rem; margin-bottom: 1rem; position: relative; z-index: 1; }
            .qe-result-title { color: var(--qe-text-muted); font-size: 1.2rem; margin-bottom: 0.5rem; font-weight: 700; position: relative; z-index: 1; }
            .qe-result-score { 
                font-size: 5rem; font-weight: 900; color: var(--qe-primary); margin-bottom: 0.5rem; line-height: 1; 
                position: relative; z-index: 1;
            }
            .qe-result-details { color: #888; font-size: 1.1rem; margin-bottom: 2.5rem; font-weight: 600; position: relative; z-index: 1; }
            .qe-result-details span { color: white; font-weight: 800; }
            
            #qe-finish-btn {
                background: var(--qe-primary); color: #000; border: none;
                height: 56px; border-radius: 16px; font-size: 1.2rem; font-weight: 800; cursor: pointer; width: 100%;
                transition: transform 0.15s ease, background 0.15s ease;
                display: flex; align-items: center; justify-content: center; gap: 10px; position: relative; z-index: 1;
            }
            #qe-finish-btn:active { transform: scale(0.97); }

            /* Mobile Optimizations */
            @media (max-width: 768px) {
                .qe-pagination-scroll { display: none !important; }
                .qe-header-info { padding: 0.8rem 1rem; }
                .qe-quiz-title { font-size: 1rem; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .qe-timer { font-size: 0.95rem; padding: 0.3rem 0.6rem; border: none; background: transparent; }
                
                .qe-mobile-progress {
                    display: block; width: 100%; text-align: center; font-size: 0.95rem; color: var(--qe-primary); 
                    font-weight: 700; padding: 0.4rem 0 0.8rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                #quizModalContent { padding: 1.2rem 1rem calc(90px + env(safe-area-inset-bottom)); }
                
                .qe-card-layer { padding: 1.2rem; border-radius: 16px; }
                .qe-q-text-box { font-size: 1.15rem; padding: 1rem; margin-bottom: 1.2rem; }
                .qe-option { padding: 0.8rem; border-radius: 12px; }
                .qe-option-letter { width: 30px; height: 30px; font-size: 0.9rem; margin-left: 0.6rem; }
                .qe-opt-text { font-size: 1rem; }

                .qe-bottom-bar { padding: 0.8rem; background: #050505; }
                .qe-nav-container { gap: 0.6rem; }
                .qe-nav-group { gap: 0.6rem; }
                .qe-btn { height: 48px; border-radius: 12px; font-size: 1rem; padding: 0 1rem; }
                #btnSubmitQuiz { flex: 1; min-width: auto; }

                .qe-result-card { padding: 2.5rem 1.5rem; border-radius: 20px; }
                .qe-result-score { font-size: 4rem; }
            }

            .qe-low-perf * { transition-duration: 0ms !important; transform: none !important; animation: none !important; }
        `;
        document.head.appendChild(style);
    };

    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        isMobile: false, vDOM: null, pageNodes: [], gestureData: { startX: 0, startY: 0 },
        modalEl: null,

        async open(quiz) {
            this.isMobile = window.innerWidth <= 768;
            await EngineCore.detectEnvironment();
            injectStyles();
            
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
            this.modalEl = modal; // الاحتفاظ بمرجع مباشر للنافذة لتفادي تعارض الـ ID مع العنصر الموجود مسبقاً

            modal.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div class="qe-spinner-container" id="qe-spinner-container">
                        <div class="qe-cyber-loader"></div>
                        <div style="color:white;font-weight:800;font-size:1.2rem;letter-spacing:1px;">جاري التوثيق...</div>
                    </div>
                </div>
                <div class="qe-top-bar">
                    <div class="qe-header-info">
                        <h2 class="qe-quiz-title">${escapeHTML(quiz.title)}</h2>
                        <div class="qe-timer" id="qe-timer">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
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
                        <button type="button" class="qe-btn" id="btnSubmitQuiz" disabled>تسليم</button>
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
                this.setupGestures();
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
            EngineCore.trackInteraction(); Sensory.nav();
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
                        $el('h3', { className: 'qe-q-title', innerHTML: `السؤال ${idx + 1} من ${total}` })
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
                    Scheduler.frame(() => { card.className = 'qe-card-layer active'; });
                }
            });
            
            if(frag.childNodes.length > 0) this.vDOM.appendChild(frag);
            setTimeout(() => UIState.set(UIState.IDLE), this.isMobile ? 180 : 250);
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
            }
            this.updateUI();

            if (!this.isMobile && this.currentIndex < this.quiz.questions.length - 1) {
                setTimeout(() => this.next(), 250);
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
                    } else {
                        btnSubmit.style.background = 'rgba(255,255,255,0.05)';
                        btnSubmit.style.color = 'var(--qe-text-muted)';
                    }
                }
            });
        },

        next() {
            if (this.currentIndex < this.quiz.questions.length - 1 && !UIState.is(UIState.TRANSITIONING)) {
                Sensory.nav(); 
                this.updatePaginationState(this.currentIndex + 1);
                this.currentIndex++;
                this.renderVirtualDOM(1); this.updateUI(); this.scrollTop();
            }
        },
        prev() {
            if (this.currentIndex > 0 && !UIState.is(UIState.TRANSITIONING)) {
                Sensory.nav(); 
                this.updatePaginationState(this.currentIndex - 1);
                this.currentIndex--;
                this.renderVirtualDOM(-1); this.updateUI(); this.scrollTop();
            }
        },

        setupGestures() {
            this.vDOM.addEventListener('touchstart', e => {
                if(EngineCore.isLowEnd || UIState.is(UIState.TRANSITIONING)) return;
                this.gestureData.startX = e.touches[0].clientX;
                this.gestureData.startY = e.touches[0].clientY;
            }, { passive: true });

            this.vDOM.addEventListener('touchend', e => {
                if(EngineCore.isLowEnd || UIState.is(UIState.TRANSITIONING)) return;
                const dx = e.changedTouches[0].clientX - this.gestureData.startX;
                const dy = e.changedTouches[0].clientY - this.gestureData.startY;
                
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
                    if (dx > 0) this.prev(); else this.next();
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
                    
                    if (this.totalTime === 60) timerEl.classList.add('warning'); 
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
            Sensory.play('tick');
            
            // مساعد لاستخراج الإجابات الصحيحة سواء كانت مخزّنة كـ correctAnswer (مفرد)
            // أو correctAnswers (مصفوفة) — توافقاً مع كل بُناة الاختبارات في لوحة الإدارة
            const getCorrectIndexes = (q) => {
                if (q.correctAnswers && Array.isArray(q.correctAnswers)) return q.correctAnswers.map(Number);
                if (q.correctAnswer !== undefined && q.correctAnswer !== null) return [Number(q.correctAnswer)];
                if (q.correct !== undefined && q.correct !== null) return [Number(q.correct)];
                return [];
            };

            let score = 0;
            const userAnswers = this.quiz.questions.map((q, qi) => {
                const ans = this.answers[`q_${qi}`];
                const correct = getCorrectIndexes(q);
                if (ans !== undefined && correct.includes(parseInt(ans))) score++;
                return ans === undefined ? null : parseInt(ans);
            });
            const percentage = Math.round((score / this.quiz.questions.length) * 100);

            try {
                const appState = typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.getState === 'function' ? window.DahihApp.getState() : {};

                if (typeof window.DahihApp !== 'undefined' && window.DahihApp.fetchWithTimeout) {
                    const res = await window.DahihApp.fetchWithTimeout('/api/student/submit-quiz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.token}` },
                        body: JSON.stringify({
                            email: appState.user?.email,
                            studentName: appState.user?.name,
                            grade: appState.user?.grade,
                            quizId: this.quiz.id,
                            score,
                            percentage,
                            userAnswers
                        })
                    });

                    // التحقق الفعلي من نجاح الحفظ على الخادم (عدا حالة 403 = سبق تقديمه فنعتبره مكتملاً)
                    if (res && res.ok === false && res.status !== 403) {
                        let msg = 'تعذر حفظ النتيجة على الخادم. حاول مرة أخرى.';
                        try { const data = await res.json(); if (data && data.message) msg = data.message; } catch (e) {}
                        throw new Error(msg);
                    }
                }

                this.quiz.attempted = true;
                this.quiz.score = percentage;

                Scheduler.idle(() => localStorage.removeItem(`dq_${this.quiz.id}`));

                // تحديث بطاقة الاختبار فوراً في القائمة (تحويلها لمكتملة) دون إعادة تحميل الصفحة
                if (window.QuizApp && typeof window.QuizApp.reload === 'function') {
                    try { window.QuizApp.reload(this.quiz.id, { score: percentage }); } catch (e) {}
                }
                Sensory.success();

                if (overlay) {
                    setTimeout(() => {
                        if (spinnerContainer) spinnerContainer.classList.add('hide');
                        
                        const emoji = percentage >= 85 ? 'ممتاز' : (percentage >= 50 ? 'جيد جدا' : 'مقبول');
                        const resultCard = $el('div', { className: 'qe-result-card' });
                        
                        if (percentage >= 50) {
                            resultCard.appendChild($el('div', { className: 'qe-success-bg' }));
                        }

                        resultCard.innerHTML += `
                            <div class="qe-result-icon">${emoji}</div>
                            <h2 class="qe-result-title">النتيجة النهائية</h2>
                            <div class="qe-result-score">${percentage}%</div>
                            <div class="qe-result-details">
                                حصدت <span>${score}</span> من <span>${this.quiz.questions.length}</span> نقاط
                            </div>
                            <button id="qe-finish-btn">
                                العودة 
                            </button>
                        `;
                        overlay.appendChild(resultCard);

                        document.getElementById('qe-finish-btn').onclick = () => {
                            EngineCore.trackInteraction(); Sensory.select();

                            // إغلاق النافذة بسلاسة دون عمل ريفرش كامل للصفحة
                            this.close();

                            // الانتقال لتبويب الاختبارات + مزامنة البيانات من السيرفر في الخلفية
                            if (typeof window.switchTab === 'function') {
                                try { window.switchTab('quizzes'); } catch (e) {}
                            }
                            if (window.DahihApp && typeof window.DahihApp.refresh === 'function') {
                                try { window.DahihApp.refresh(); } catch (e) {}
                            }
                        };
                    }, 500); 
                } else {
                    this.close();
                }

            } catch (err) {
                // فشل حقيقي في الحفظ: نُبقي النافذة مفتوحة ونسمح للطالب بإعادة المحاولة
                if (overlay) overlay.classList.remove('show');
                const spinner = document.getElementById('qe-spinner-container');
                if (spinner) spinner.classList.remove('hide');
                if (typeof window.DahihApp !== 'undefined' && typeof window.DahihApp.toast === 'function') {
                    window.DahihApp.toast(err.message || "تعذر حفظ الإجابات. تحقق من اتصالك وحاول مجدداً.", "error");
                } else {
                    alert(err.message || "عذراً، حدث خطأ أثناء حفظ الإجابات. يرجى مراجعة اتصالك بالإنترنت.");
                }
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

            // استخدام المرجع المباشر للنافذة بدل getElementById لتفادي إغلاق العنصر الخطأ (تعارض الـ ID)
            const modal = this.modalEl || document.getElementById('quizModal');
            if (modal) {
                modal.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                setTimeout(() => { 
                    modal.remove();
                    this.modalEl = null;
                    this.vDOM = null; 
                    this.pageNodes = []; 
                }, 300);
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();

