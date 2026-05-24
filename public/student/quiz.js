(function () {
    'use strict';

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

    const Scheduler = {
        idle(task) { ('requestIdleCallback' in window) ? requestIdleCallback(task, { timeout: 1000 }) : setTimeout(task, 50); },
        frame(task) { requestAnimationFrame(task); }
    };

    const EngineCore = {
        isLowEnd: false, isCalmMode: false, batterySaver: false,
        lastInteraction: Date.now(), erraticClicks: 0,
        
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

    const injectStyles = () => {
        if (document.getElementById('qe-v6-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-v6-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #facc15; 
                --qe-primary-soft: rgba(250, 204, 21, 0.12);
                --qe-primary-glow: rgba(250, 204, 21, 0.4);
                --qe-bg: #050505; 
                --qe-surface: #111111;
                --qe-surface-hover: #1a1a1a;
                --qe-border: rgba(255, 255, 255, 0.06);
                --qe-text: #ffffff; 
                --qe-text-muted: #a1a1aa;
                --qe-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
                --qe-reading-width: 850px;
                --qe-success: #22c55e;
                --qe-danger: #ef4444;
            }

            html.qe-active, html.qe-active body {
                overflow: hidden !important;
                height: 100dvh !important;
                width: 100vw !important;
                margin: 0; padding: 0;
            }

            /* Ultra Standalone Page Mode */
            #quizModal {
                position: fixed; inset: 0; z-index: 9999999;
                background: var(--qe-bg) !important;
                background-image: radial-gradient(circle at top, rgba(250,204,21,0.05), transparent 60%), #050505 !important;
                font-family: 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif;
                display: flex; flex-direction: column;
                height: 100dvh; width: 100vw;
                opacity: 0; transform: scale(0.98);
                transition: opacity 0.5s var(--qe-ease), transform 0.5s var(--qe-ease);
            }
            #quizModal:not(.hidden) { opacity: 1; transform: scale(1); }

            /* Top Pagination Header */
            .qe-top-bar {
                background: rgba(5, 5, 5, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                border-bottom: 1px solid var(--qe-border);
                position: sticky; top: 0; z-index: 100;
                display: flex; flex-direction: column;
            }

            .qe-header-info {
                display: flex; justify-content: space-between; align-items: center;
                padding: 1rem 1.5rem; max-width: var(--qe-reading-width); width: 100%; margin: 0 auto;
                box-sizing: border-box;
            }

            .qe-quiz-title { margin: 0; color: white; font-size: clamp(1.1rem, 2.5vw, 1.4rem); font-weight: 800; letter-spacing: 0.5px; }
            
            .qe-timer {
                font-family: 'Courier New', Courier, monospace; font-size: 1.1rem; font-weight: 900;
                background: var(--qe-surface); border: 1px solid var(--qe-border);
                padding: 0.4rem 1rem; border-radius: 2rem; color: var(--qe-primary);
                display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 0 15px rgba(250,204,21,0.1);
            }

            /* Horizontal Pagination Scroll */
            .qe-pagination-scroll {
                width: 100%; overflow-x: auto; scroll-behavior: smooth;
                padding: 0 1.5rem 1rem 1.5rem; box-sizing: border-box;
                scrollbar-width: none;
            }
            .qe-pagination-scroll::-webkit-scrollbar { display: none; }
            
            .qe-pagination-track {
                display: flex; gap: 0.6rem; max-width: var(--qe-reading-width); margin: 0 auto;
            }

            .qe-page-num {
                flex: 0 0 auto; width: 42px; height: 42px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: 800; font-size: 1rem; cursor: pointer;
                border: 2px solid transparent; color: var(--qe-text-muted);
                background: var(--qe-surface); transition: all 0.3s var(--qe-ease);
                position: relative; overflow: hidden;
            }
            .qe-page-num::after { content:''; position:absolute; inset:0; border:2px solid var(--qe-border); border-radius:50%; transition:all 0.3s; }
            .qe-page-num:hover::after { border-color: rgba(255,255,255,0.2); }
            .qe-page-num.answered { color: var(--qe-primary); background: var(--qe-primary-soft); }
            .qe-page-num.answered::after { border-color: var(--qe-primary); opacity: 0.5; }
            .qe-page-num.active { 
                background: var(--qe-primary); color: #000; font-size: 1.15rem;
                transform: scale(1.1); box-shadow: 0 0 20px var(--qe-primary-glow);
            }
            .qe-page-num.active::after { display: none; }

            /* Main Content Area */
            #quizModalContent {
                flex: 1; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                padding: 2rem 1.5rem 8rem 1.5rem; display: flex; flex-direction: column;
                max-width: var(--qe-reading-width); margin: 0 auto; width: 100%; box-sizing: border-box;
            }
            #quizModalContent::-webkit-scrollbar { width: 6px; }
            #quizModalContent::-webkit-scrollbar-track { background: transparent; }
            #quizModalContent::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

            /* Virtual Question Engine */
            #qe-virtual-dom { position: relative; width: 100%; min-height: 50vh; }
            
            .qe-card-layer {
                display: none; opacity: 0; width: 100%;
                transition: opacity 0.3s var(--qe-ease), transform 0.3s var(--qe-ease);
            }
            
            /* High Performance Transitions */
            @media (min-width: 769px) {
                .qe-card-layer { transform: translateX(20px); }
                .qe-card-layer.active { display: block; opacity: 1; transform: translateX(0); position: relative; }
                .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translateX(-20px); position: absolute; top: 0; }
                .qe-card-layer.exit-next { display: block; opacity: 0; transform: translateX(20px); position: absolute; top: 0; }
            }
            @media (max-width: 768px) {
                .qe-card-layer, .qe-card-layer.active, .qe-card-layer.exit-prev, .qe-card-layer.exit-next { transform: none !important; }
                .qe-card-layer.active { display: block; opacity: 1; position: relative; }
                .qe-card-layer.exit-prev, .qe-card-layer.exit-next { display: block; opacity: 0; position: absolute; top: 0; }
            }

            .qe-q-text { font-size: clamp(1.2rem, 4vw, 1.8rem); font-weight: 900; line-height: 1.6; margin: 0 0 2rem 0; color: white; text-align: right; letter-spacing: 0.5px; }
            
            /* Extreme Options UI */
            .qe-option {
                display: flex; align-items: center; padding: clamp(1rem, 3vw, 1.4rem); margin-bottom: 1rem;
                background: var(--qe-surface); border: 2px solid transparent;
                border-radius: 1rem; cursor: pointer; position: relative; overflow: hidden;
                transition: all 0.2s var(--qe-ease); transform: translateZ(0);
                box-shadow: inset 0 0 0 1px var(--qe-border);
            }
            
            @media (min-width: 769px) { .qe-option:hover { background: var(--qe-surface-hover); transform: translateX(-4px); } }
            
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            .qe-option.selected { 
                background: var(--qe-primary-soft); box-shadow: inset 0 0 0 2px var(--qe-primary), 0 10px 30px rgba(0,0,0,0.5); 
                transform: scale(1.01); 
            }
            
            .qe-option-letter { 
                width: 44px; height: 44px; border-radius: 10px; background: rgba(255,255,255,0.03); 
                display: flex; align-items: center; justify-content: center; 
                font-weight: 900; font-size: 1.2rem; margin-left: 1.2rem; transition: 0.3s; color: var(--qe-text-muted); 
                border: 1px solid rgba(255,255,255,0.1);
            }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: #000; border-color: var(--qe-primary); box-shadow: 0 0 20px rgba(250,204,21,0.5); }
            
            .qe-opt-text { font-size: clamp(1.05rem, 2.5vw, 1.2rem); font-weight: 700; color: var(--qe-text); line-height: 1.5; flex: 1; text-align: right; }

            /* Sticky Bottom Navigation */
            .qe-bottom-bar {
                position: fixed; bottom: 0; left: 0; width: 100%;
                background: rgba(5,5,5,0.9); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                border-top: 1px solid var(--qe-border); padding: 1rem 1.5rem;
                display: flex; justify-content: center; z-index: 100;
                padding-bottom: max(env(safe-area-inset-bottom, 1rem), 1rem);
                box-sizing: border-box;
            }
            
            .qe-nav-container {
                display: flex; justify-content: space-between; align-items: center;
                width: 100%; max-width: var(--qe-reading-width); gap: 1rem;
            }
            
            .qe-nav-group { display: flex; gap: 0.8rem; flex: 1; }
            
            .qe-btn { 
                padding: 0 2rem; height: 56px; border-radius: 14px; font-weight: 900; font-size: 1.1rem; 
                cursor: pointer; border: none; font-family: inherit; transition: all 0.2s var(--qe-ease); 
                display: flex; align-items: center; justify-content: center; user-select: none;
            }
            .qe-btn-primary { background: var(--qe-primary); color: #000; box-shadow: 0 4px 15px rgba(250,204,21,0.2); }
            .qe-btn-secondary { background: var(--qe-surface); color: white; border: 1px solid var(--qe-border); }
            
            .qe-btn:disabled { opacity: 0.3 !important; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
            
            #btnSubmitQuiz { min-width: 160px; background: var(--qe-success); color: white; box-shadow: 0 4px 15px rgba(34,197,94,0.3); }

            @media (min-width: 769px) {
                .qe-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(250,204,21,0.4); }
                .qe-btn-secondary:hover:not(:disabled) { background: var(--qe-surface-hover); }
                #btnSubmitQuiz:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(34,197,94,0.5); }
            }

            @media (max-width: 768px) {
                .qe-nav-container { flex-direction: column-reverse; }
                .qe-nav-group { width: 100%; }
                .qe-btn { flex: 1; padding: 0; width: 100%; }
                #btnSubmitQuiz { width: 100%; }
                #quizModalContent { padding-bottom: 180px; }
            }

            /* Submitting Overlay */
            .qe-submitting-overlay { 
                position: fixed; inset: 0; background: #050505; z-index: 99999999; 
                display: none; flex-direction: column; align-items: center; justify-content: center; 
                opacity: 0; transition: opacity 0.3s ease; 
            }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            
            .qe-spinner-core { 
                width: 60px; height: 60px; border: 4px solid rgba(250,204,21,0.1); 
                border-top-color: var(--qe-primary); border-radius: 50%; 
                animation: qeSpin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin-bottom: 2rem; 
                box-shadow: 0 0 30px rgba(250,204,21,0.2);
            }
            @keyframes qeSpin { 100% { transform: rotate(360deg); } }
            
            .qe-low-perf * { transition-duration: 0.1s !important; box-shadow: none !important; transform: none !important; }
        `;
        document.head.appendChild(style);
    };

    const escapeHTML = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        touchStartX: 0, touchStartY: 0, isTransitioning: false, isMobile: false,

        async open(quiz) {
            this.isMobile = window.innerWidth <= 768;
            await EngineCore.detectEnvironment();
            injectStyles();
            
            document.documentElement.classList.add('qe-active');
            this.quiz = quiz; this.isTransitioning = false;
            
            const saved = JSON.parse(localStorage.getItem(`dq_${quiz.id}`)) || {};
            this.answers = saved.answers || {};
            this.totalTime = saved.timeLeft || (quiz.duration || quiz.questions.length * 60);
            
            this.currentIndex = 0;
            while(this.answers[`q_${this.currentIndex}`] !== undefined && this.currentIndex < quiz.questions.length - 1) this.currentIndex++;

            const modal = document.getElementById('quizModal');
            if (!modal) return;

            modal.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div class="qe-spinner-core"></div>
                    <div style="color:white;font-weight:900;font-size:1.5rem;letter-spacing:1px;text-align:center;">جاري تشفير الإجابات<br><span style="color:var(--qe-primary);font-size:1.1rem;">يرجى الانتظار</span></div>
                </div>
                
                <div class="qe-top-bar">
                    <div class="qe-header-info">
                        <h2 class="qe-quiz-title">${escapeHTML(quiz.title)}</h2>
                        <div class="qe-timer" id="qe-timer">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span id="qe-timer-text">--:--</span>
                        </div>
                    </div>
                    <div class="qe-pagination-scroll">
                        <div class="qe-pagination-track" id="qe-pagination-container"></div>
                    </div>
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
            
            Scheduler.frame(() => {
                this.renderPagination();
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupGestures();
                this.attachEvents();
            });
        },

        attachEvents() {
            document.getElementById('qe-btn-prev').onclick = () => this.prev();
            document.getElementById('qe-btn-next').onclick = () => this.next();
            document.getElementById('btnSubmitQuiz').onclick = () => this.submitCheck();
            
            this.resizeHandler = () => { this.isMobile = window.innerWidth <= 768; };
            window.addEventListener('resize', this.resizeHandler);
        },

        renderPagination() {
            const container = document.getElementById('qe-pagination-container');
            if (!container) return;
            
            let html = '';
            for (let i = 0; i < this.quiz.questions.length; i++) {
                const isAnswered = this.answers[`q_${i}`] !== undefined;
                const isActive = i === this.currentIndex;
                let cls = 'qe-page-num';
                if (isActive) cls += ' active';
                else if (isAnswered) cls += ' answered';
                
                html += `<div class="${cls}" onclick="QuizEngine.jumpTo(${i})" id="qe-page-${i}">${i + 1}</div>`;
            }
            container.innerHTML = html;
            
            const activeEl = document.getElementById(`qe-page-${this.currentIndex}`);
            if (activeEl) {
                const scrollContainer = container.parentElement;
                const scrollLeft = activeEl.offsetLeft - (scrollContainer.offsetWidth / 2) + (activeEl.offsetWidth / 2);
                scrollContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        },

        jumpTo(index) {
            if (index === this.currentIndex || this.isTransitioning || UIState.is(UIState.SUBMITTING)) return;
            const dir = index > this.currentIndex ? 1 : -1;
            Sensory.nav(dir);
            this.currentIndex = index;
            this.renderPagination();
            this.renderVirtualDOM(dir);
            this.updateUI();
            this.scrollTop();
        },

        scrollTop() {
            const content = document.getElementById('quizModalContent');
            if(content) content.scrollTo({ top: 0, behavior: 'smooth' });
        },

        renderVirtualDOM(direction = 0) {
            const container = document.getElementById('qe-virtual-dom');
            const total = this.quiz.questions.length;
            const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
            
            const indices = [this.currentIndex - 1, this.currentIndex, this.currentIndex + 1].filter(i => i >= 0 && i < total);

            Array.from(container.children).forEach(child => {
                const idx = parseInt(child.dataset.index);
                if (!indices.includes(idx)) child.remove();
                else if (idx !== this.currentIndex) {
                    const exitClass = direction === 0 ? (idx < this.currentIndex ? 'exit-prev' : 'exit-next') : (direction > 0 ? 'exit-prev' : 'exit-next');
                    child.className = `qe-card-layer ${exitClass}`;
                }
            });

            indices.forEach(idx => {
                if (!container.querySelector(`[data-index="${idx}"]`)) {
                    const q = this.quiz.questions[idx];
                    const div = document.createElement('div');
                    let enterClass = idx === this.currentIndex ? 'active' : (direction === 0 ? (idx < this.currentIndex ? 'exit-prev' : 'exit-next') : (direction > 0 ? 'exit-next' : 'exit-prev'));

                    div.className = `qe-card-layer ${enterClass}`;
                    div.dataset.index = idx;

                    div.innerHTML = `
                        <h4 class="qe-q-text">${escapeHTML(q.questionText)}</h4>
                        <div role="radiogroup">
                            ${q.options.map((opt, oi) => {
                                const isChecked = this.answers[`q_${idx}`] == oi;
                                return `
                                <label class="qe-option ${isChecked ? 'selected' : ''}">
                                    <input type="radio" name="q_${idx}" value="${oi}" ${isChecked ? 'checked' : ''}>
                                    <div class="qe-option-letter">${letters[oi] || oi+1}</div>
                                    <span class="qe-opt-text">${escapeHTML(opt)}</span>
                                </label>`;
                            }).join('')}
                        </div>`;
                    
                    div.querySelectorAll('.qe-option').forEach((lbl, oi) => {
                        lbl.addEventListener('click', (e) => { e.preventDefault(); this.selectOption(idx, oi, lbl); });
                    });
                    container.appendChild(div);
                } else if (idx === this.currentIndex) {
                    const child = container.querySelector(`[data-index="${idx}"]`);
                    if(!EngineCore.isLowEnd) void child.offsetWidth; 
                    child.className = 'qe-card-layer active';
                }
            });
        },

        selectOption(qIndex, optIndex, labelElement) {
            if (this.isTransitioning || UIState.is(UIState.SUBMITTING)) return;
            EngineCore.trackInteraction();
            Sensory.select();
            
            const group = labelElement.closest('[role="radiogroup"]');
            group.querySelectorAll('.qe-option').forEach(el => el.classList.remove('selected'));
            labelElement.classList.add('selected');
            labelElement.querySelector('input').checked = true;

            this.answers[`q_${qIndex}`] = optIndex;
            Scheduler.idle(() => localStorage.setItem(`dq_${this.quiz.id}`, JSON.stringify({ answers: this.answers, timeLeft: this.totalTime })));
            
            const numEl = document.getElementById(`qe-page-${qIndex}`);
            if(numEl && !numEl.classList.contains('answered')) numEl.classList.add('answered');
            
            this.updateUI(true);

            if (!this.isMobile && this.currentIndex < this.quiz.questions.length - 1) {
                this.isTransitioning = true;
                setTimeout(() => { this.next(); this.isTransitioning = false; }, 400);
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
                    btnSubmit.style.boxShadow = '0 4px 15px rgba(34,197,94,0.3)';
                    btnSubmit.style.opacity = '1';
                } else {
                    btnSubmit.style.background = 'var(--qe-surface)';
                    btnSubmit.style.boxShadow = 'none';
                    btnSubmit.style.color = 'var(--qe-text-muted)';
                }
            });
        },

        next() {
            if (this.currentIndex < this.quiz.questions.length - 1) {
                Sensory.nav(1); this.currentIndex++;
                this.renderPagination();
                this.renderVirtualDOM(1); this.updateUI(); this.scrollTop();
            }
        },
        prev() {
            if (this.currentIndex > 0) {
                Sensory.nav(-1); this.currentIndex--;
                this.renderPagination();
                this.renderVirtualDOM(-1); this.updateUI(); this.scrollTop();
            }
        },

        setupGestures() {
            this.touchHandler = e => {
                if(EngineCore.isLowEnd) return;
                const dx = e.changedTouches[0].screenX - this.touchStartX;
                const dy = e.changedTouches[0].screenY - this.touchStartY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
                    if (dx > 0) this.prev(); 
                    else this.next(); 
                }
            };
            document.addEventListener('touchstart', e => {
                this.touchStartX = e.changedTouches[0].screenX;
                this.touchStartY = e.changedTouches[0].screenY;
            }, { passive: true });
            document.addEventListener('touchend', this.touchHandler, { passive: true });
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
            document.removeEventListener('touchend', this.touchHandler);
            
            const overlay = document.getElementById('qe-submit-layer');
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
                
                Scheduler.idle(() => localStorage.removeItem(`dq_${this.quiz.id}`));
                Sensory.success();
                
                if (percentage >= 85 && !EngineCore.isLowEnd && typeof confetti === 'function') {
                    confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ['#facc15', '#22c55e', '#ffffff'], zIndex: 99999999 });
                }

                if(overlay) overlay.classList.remove('show');
                this.close();
                
                setTimeout(() => { 
                    if(typeof window.DahihApp !== 'undefined' && window.DahihApp.refresh) window.DahihApp.refresh(); 
                }, 200);

            } catch (err) { 
                alert(`خطأ في الإرسال: ${err.message}`); 
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
                modal.style.transform = 'scale(0.98)';
                setTimeout(() => { modal.classList.add('hidden'); modal.innerHTML = ''; }, 500);
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();
