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
        select() { this.play(700, 'sine', 0.15, 0.02, 0); this.vibrate(10); },
        nav(dir) { this.play(400, 'triangle', 0.1, 0.01, dir); },
        success() { this.play(500, 'sine', 0.4, 0.03, 0); this.vibrate([20, 50, 20]); }
    };

    const injectStyles = () => {
        if (document.getElementById('qe-v5-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-v5-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #2563eb; --qe-primary-soft: rgba(37, 99, 235, 0.15);
                --qe-bg: #0f172a; --qe-surface: #1e293b;
                --qe-border: rgba(255, 255, 255, 0.08);
                --qe-text: #f8fafc; --qe-text-muted: #94a3b8;
                --qe-ease: cubic-bezier(0.25, 1, 0.5, 1);
                --qe-reading-width: 800px;
                --qe-accent: #f59e0b;
                --qe-success: #10b981;
                --qe-danger: #ef4444;
            }

            /* Full Page Layout */
            #quizModal {
                position: fixed; inset: 0; z-index: 999999;
                background: var(--qe-bg) !important;
                background-image: radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.08) 0%, transparent 70%) !important;
                overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                font-family: 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif;
                transition: opacity 0.4s var(--qe-ease);
                display: block;
            }
            
            #quizModalContent {
                max-width: var(--qe-reading-width); margin: 0 auto;
                min-height: 100vh; padding: clamp(1.5rem, 4vw, 3rem) 1.5rem;
                display: flex; flex-direction: column; position: relative;
                transform: translateY(20px); opacity: 0;
                transition: transform 0.6s var(--qe-ease), opacity 0.6s var(--qe-ease);
                background: transparent !important; border: none !important; box-shadow: none !important;
            }
            #quizModal:not(.hidden) #quizModalContent { transform: translateY(0); opacity: 1; }

            /* Top Pagination Bar */
            .qe-pagination-wrapper {
                position: sticky; top: 0; z-index: 100;
                background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                padding: 1rem 0; border-bottom: 1px solid var(--qe-border); margin-bottom: 2rem;
                box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
            }
            .qe-pagination {
                display: flex; gap: 0.75rem; overflow-x: auto; scroll-behavior: smooth;
                padding: 0.5rem 1rem; max-width: var(--qe-reading-width); margin: 0 auto;
                scrollbar-width: none;
            }
            .qe-pagination::-webkit-scrollbar { display: none; }
            .qe-page-num {
                flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; font-size: 1.1rem; cursor: pointer;
                border: 2px solid var(--qe-border); color: var(--qe-text-muted);
                background: var(--qe-surface); transition: all 0.3s var(--qe-ease);
                user-select: none;
            }
            .qe-page-num:hover { border-color: rgba(255,255,255,0.3); transform: translateY(-2px); }
            .qe-page-num.answered { background: var(--qe-primary-soft); border-color: var(--qe-primary); color: var(--qe-primary); }
            .qe-page-num.active { 
                background: var(--qe-primary); color: white; border-color: var(--qe-primary);
                transform: scale(1.15) translateY(-2px); box-shadow: 0 8px 20px rgba(37,99,235,0.4); 
            }

            /* Header Info */
            .qe-header-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
            .qe-quiz-title { margin: 0; color: white; font-size: clamp(1.2rem, 3vw, 1.75rem); font-weight: 800; }
            .qe-timer {
                font-family: monospace; font-size: 1.25rem; font-weight: bold;
                background: var(--qe-surface); border: 1px solid var(--qe-border);
                padding: 0.5rem 1.25rem; border-radius: 2rem; color: var(--qe-text);
                display: flex; align-items: center; gap: 0.5rem; transition: color 0.3s;
            }

            /* Progress */
            .qe-progress-container { height: 6px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; margin-bottom: 3rem; }
            .qe-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--qe-primary), #60a5fa); transition: width 0.6s var(--qe-ease); }
            
            /* Virtual Container & Question Cards */
            #qe-virtual-dom { flex-grow: 1; position: relative; min-height: 400px; perspective: 1000px; }
            .qe-card-layer {
                display: none; opacity: 0; transform: translateZ(-50px) translateX(40px);
                transition: opacity 0.4s var(--qe-ease), transform 0.4s var(--qe-ease);
                width: 100%;
            }
            .qe-card-layer.active { display: block; opacity: 1; transform: translateZ(0) translateX(0); position: relative; }
            .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translateZ(-50px) translateX(-40px); position: absolute; top: 0; }
            .qe-card-layer.exit-next { display: block; opacity: 0; transform: translateZ(-50px) translateX(40px); position: absolute; top: 0; }

            .qe-q-text { font-size: clamp(1.2rem, 3vw, 1.6rem); font-weight: 800; line-height: 1.8; margin: 0 0 2.5rem; color: white; text-align: right; }
            
            /* Options */
            .qe-option {
                display: flex; align-items: center; padding: clamp(1rem, 2.5vw, 1.25rem); margin-bottom: 1rem;
                background: var(--qe-surface); border: 2px solid var(--qe-border);
                border-radius: 1.25rem; cursor: pointer; position: relative; overflow: hidden;
                transition: all 0.25s var(--qe-ease); transform: translateZ(0);
            }
            .qe-option:hover { transform: scale(1.01) translateY(-2px); border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.03); }
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            .qe-option.selected { border-color: var(--qe-primary); background: var(--qe-primary-soft); transform: scale(1.02); box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
            .qe-option-letter { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; margin-left: 1.25rem; transition: 0.3s; color: var(--qe-text-muted); }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: white; box-shadow: 0 0 15px rgba(37,99,235,0.5); }
            .qe-opt-text { font-size: clamp(1rem, 2vw, 1.15rem); font-weight: 600; color: var(--qe-text); }

            /* Bottom Nav */
            .qe-nav-container { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--qe-border); }
            .qe-nav-group { display: flex; gap: 1rem; }
            .qe-btn { padding: 1rem 2.5rem; border-radius: 1.25rem; font-weight: 800; font-size: 1.1rem; cursor: pointer; border: none; font-family: inherit; transition: all 0.3s var(--qe-ease); display: flex; align-items: center; justify-content: center; }
            .qe-btn-primary { background: var(--qe-primary); color: white; box-shadow: 0 8px 20px rgba(37,99,235,0.3); }
            .qe-btn-primary:hover:not(:disabled) { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 25px rgba(37,99,235,0.4); }
            .qe-btn-secondary { background: var(--qe-surface); border: 1px solid var(--qe-border); color: white; }
            .qe-btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.05); transform: translateY(-2px); }
            .qe-btn:disabled { cursor: not-allowed; transform: none !important; opacity: 0.4; box-shadow: none; }

            .qe-submitting-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.9); backdrop-filter: blur(10px); z-index: 9999999; display: none; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.4s ease; }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            .qe-spinner { width: 48px; height: 48px; border: 4px solid rgba(255,255,255,0.1); border-left-color: var(--qe-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1.5rem; }
            @keyframes spin { 100% { transform: rotate(360deg); } }
            
            .qe-low-perf * { transition-duration: 0.1s !important; box-shadow: none !important; transform: none !important; }
        `;
        document.head.appendChild(style);
    };

    const escapeHTML = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        touchStartX: 0, isTransitioning: false,

        async open(quiz) {
            await EngineCore.detectEnvironment();
            injectStyles();
            
            this.quiz = quiz; this.isTransitioning = false;
            const saved = JSON.parse(localStorage.getItem(`dq_${quiz.id}`)) || {};
            this.answers = saved.answers || {};
            this.totalTime = saved.timeLeft || (quiz.duration || quiz.questions.length * 60);
            
            this.currentIndex = 0;
            while(this.answers[`q_${this.currentIndex}`] !== undefined && this.currentIndex < quiz.questions.length - 1) this.currentIndex++;

            const modal = document.getElementById('quizModal');
            let content = document.getElementById('quizModalContent');
            if (!modal) return;

            if(!content) {
                content = document.createElement('div');
                content.id = 'quizModalContent';
                modal.appendChild(content);
            }

            modal.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div class="qe-spinner"></div>
                    <div style="color:white;font-weight:800;font-size:1.5rem;letter-spacing:1px;">جاري تشفير وتسليم الإجابات...</div>
                </div>
                
                <div class="qe-pagination-wrapper">
                    <div class="qe-pagination" id="qe-pagination-container"></div>
                </div>

                <div id="quizModalContent">
                    <div class="qe-header-info">
                        <h2 class="qe-quiz-title">${escapeHTML(quiz.title)}</h2>
                        <div class="qe-timer" id="qe-timer">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span id="qe-timer-text">--:--</span>
                        </div>
                    </div>
                    
                    <div class="qe-progress-container"><div class="qe-progress-fill" id="qe-progress-bar"></div></div>
                    
                    <form id="activeQuizForm" onsubmit="return false;" style="display:flex;flex-direction:column;flex-grow:1;">
                        <div id="qe-virtual-dom"></div>
                        
                        <div class="qe-nav-container">
                            <div class="qe-nav-group">
                                <button type="button" class="qe-btn qe-btn-secondary" id="qe-btn-prev">السابق</button>
                                <button type="button" class="qe-btn qe-btn-primary" id="qe-btn-next">التالي</button>
                            </div>
                            <button type="button" class="qe-btn qe-btn-primary" id="btnSubmitQuiz" disabled style="background:var(--qe-success);min-width:180px;">تسليم الإجابات</button>
                        </div>
                    </form>
                </div>
            `;

            modal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            document.body.style.overflow = 'hidden'; 
            
            Scheduler.frame(() => {
                this.renderPagination();
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupGestures();
                this.attachNavEvents();
            });
        },

        attachNavEvents() {
            document.getElementById('qe-btn-prev').onclick = () => this.prev();
            document.getElementById('qe-btn-next').onclick = () => this.next();
            document.getElementById('btnSubmitQuiz').onclick = () => this.submitCheck();
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
                activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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
                    let enterClass = '';
                    if (idx === this.currentIndex) enterClass = 'active';
                    else if (direction === 0) enterClass = idx < this.currentIndex ? 'exit-prev' : 'exit-next';
                    else enterClass = direction > 0 ? 'exit-next' : 'exit-prev'; // pre-position for animation

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
                    // Force reflow for animation if needed
                    void child.offsetWidth;
                    child.className = 'qe-card-layer active';
                }
            });
        },

        selectOption(qIndex, optIndex, labelElement) {
            if (this.isTransitioning || UIState.is(UIState.SUBMITTING)) return;
            Sensory.select();
            
            const group = labelElement.closest('[role="radiogroup"]');
            group.querySelectorAll('.qe-option').forEach(el => el.classList.remove('selected'));
            labelElement.classList.add('selected');
            labelElement.querySelector('input').checked = true;

            this.answers[`q_${qIndex}`] = optIndex;
            Scheduler.idle(() => localStorage.setItem(`dq_${this.quiz.id}`, JSON.stringify({ answers: this.answers, timeLeft: this.totalTime })));
            
            this.renderPagination();
            this.updateUI();

            if (this.currentIndex < this.quiz.questions.length - 1) {
                this.isTransitioning = true;
                setTimeout(() => { this.next(); this.isTransitioning = false; }, 450);
            }
        },

        updateUI() {
            Scheduler.frame(() => {
                const total = this.quiz.questions.length;
                const answered = Object.keys(this.answers).length;
                const bar = document.getElementById('qe-progress-bar');
                
                bar.style.width = `${(answered / total) * 100}%`;
                
                const btnPrev = document.getElementById('qe-btn-prev');
                const btnNext = document.getElementById('qe-btn-next');
                const btnSubmit = document.getElementById('btnSubmitQuiz');

                btnPrev.disabled = this.currentIndex === 0;
                btnNext.disabled = this.currentIndex === total - 1;

                const isAllAnswered = answered === total;
                const isLast = this.currentIndex === total - 1;
                
                btnSubmit.disabled = !isLast;
                if (isLast) {
                    btnSubmit.style.opacity = '1';
                    btnSubmit.style.transform = 'scale(1.05)';
                    btnSubmit.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.5)';
                } else {
                    btnSubmit.style.opacity = '0.4';
                    btnSubmit.style.transform = 'none';
                    btnSubmit.style.boxShadow = 'none';
                }
            });
        },

        next() {
            if (this.currentIndex < this.quiz.questions.length - 1) {
                Sensory.nav(1); this.currentIndex++;
                this.renderPagination();
                this.renderVirtualDOM(1); this.updateUI();
            }
        },
        prev() {
            if (this.currentIndex > 0) {
                Sensory.nav(-1); this.currentIndex--;
                this.renderPagination();
                this.renderVirtualDOM(-1); this.updateUI();
            }
        },

        setupGestures() {
            this.touchHandler = e => {
                if(EngineCore.isLowEnd) return;
                const dx = e.changedTouches[0].screenX - this.touchStartX;
                if (dx > 70) this.next(); 
                if (dx < -70) this.prev(); 
            };
            document.addEventListener('touchstart', e => this.touchStartX = e.changedTouches[0].screenX, { passive: true });
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
                if(!confirm(`يوجد ${total - answeredCount} أسئلة بلا إجابة. هل أنت متأكد من التسليم النهائي؟`)) return;
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
                    confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, zIndex: 99999999 });
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
            const modal = document.getElementById('quizModal');
            if (modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();
