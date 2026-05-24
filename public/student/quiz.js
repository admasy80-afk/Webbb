(function () {
    'use strict';

    // ==========================================
    // 1. EVENT BUS & STATE MACHINE (Architecture)
    // ==========================================
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

    // ==========================================
    // 2. ADAPTIVE PERFORMANCE & FPS GOVERNOR
    // ==========================================
    const DeviceProfile = {
        isLowEnd: false, isCalmMode: false,
        fpsHistory: [], lastFrameTime: 0, fpsCheckId: null,
        
        detect() {
            const memory = navigator.deviceMemory || 4;
            const cores = navigator.hardwareConcurrency || 4;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.isLowEnd = memory < 4 || cores < 4 || reduceMotion;
            if (this.isLowEnd) document.documentElement.classList.add('qe-low-perf');
        },
        
        monitorFPS(timestamp) {
            if (!this.lastFrameTime) { this.lastFrameTime = timestamp; }
            const delta = timestamp - this.lastFrameTime;
            this.lastFrameTime = timestamp;
            
            if (delta > 0) {
                const fps = 1000 / delta;
                this.fpsHistory.push(fps);
                if (this.fpsHistory.length > 30) this.fpsHistory.shift();
                
                const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
                if (avgFps < 30 && !this.isLowEnd && this.fpsHistory.length === 30) {
                    console.warn("QE: FPS drop detected. Downgrading effects for stable experience.");
                    this.isLowEnd = true;
                    document.documentElement.classList.add('qe-low-perf');
                    cancelAnimationFrame(this.fpsCheckId);
                    return;
                }
            }
            this.fpsCheckId = requestAnimationFrame(this.monitorFPS.bind(this));
        },
        
        startMonitor() { 
            if(!this.isLowEnd) {
                this.fpsHistory = []; this.lastFrameTime = 0; 
                this.fpsCheckId = requestAnimationFrame(this.monitorFPS.bind(this));
            }
        },
        stopMonitor() { cancelAnimationFrame(this.fpsCheckId); }
    };

    // ==========================================
    // 3. COGNITIVE DESIGN SYSTEM (CSS)
    // ==========================================
    const injectStyles = () => {
        if (document.getElementById('qe-enterprise-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-enterprise-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #2563eb; 
                --qe-bg: #0f172a; --qe-surface: #1e293b;
                --qe-border: rgba(255, 255, 255, 0.08);
                --qe-text: #f8fafc; --qe-text-muted: #94a3b8;
                --qe-danger: #ef4444; --qe-success: #10b981;
                /* Soft Easing for Cognitive Smoothness */
                --qe-ease: cubic-bezier(0.25, 0.8, 0.25, 1);
            }

            #quizModal {
                background: rgba(0, 0, 0, 0.7) !important; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                transition: opacity 0.3s var(--qe-ease);
                display: flex; align-items: center; justify-content: center; z-index: 9999;
                font-family: 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif;
            }
            #quizModalContent {
                background: var(--qe-bg) !important; border: 1px solid var(--qe-border);
                border-radius: clamp(1rem, 3vw, 1.5rem) !important;
                box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
                width: 100%; max-width: 760px; position: relative; overflow: hidden;
                transform: translateY(15px) scale(0.99); opacity: 0;
                transition: transform 0.4s var(--qe-ease), opacity 0.3s var(--qe-ease);
                will-change: transform, opacity;
            }
            #quizModal.is-open #quizModalContent { transform: translateY(0) scale(1); opacity: 1; }

            /* Adaptive Overrides */
            .qe-low-perf #quizModal { backdrop-filter: none !important; background: rgba(15,23,42,0.98) !important; }
            .qe-low-perf * { transition-duration: 0.1s !important; animation: none !important; box-shadow: none !important; }

            /* Progress Bar */
            .qe-progress-container { height: 4px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; margin: 1.5rem 0; }
            .qe-progress-fill {
                height: 100%; width: 0%; background: var(--qe-primary);
                transition: width 0.5s var(--qe-ease); will-change: width;
            }

            /* Options: GPU Safe Ripple & Scale */
            .qe-option {
                display: flex; align-items: center; padding: clamp(0.875rem, 2vw, 1.125rem); margin-bottom: 0.75rem;
                background: var(--qe-surface); border: 1px solid var(--qe-border);
                border-radius: 1rem; cursor: pointer; position: relative;
                transition: transform 0.2s var(--qe-ease), background 0.2s, border-color 0.2s;
                transform: translateZ(0); /* Force GPU Layer */
            }
            .qe-option:hover { transform: scale(1.01); background: rgba(255,255,255,0.03); }
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            .qe-option.selected { border-color: var(--qe-primary); background: rgba(37,99,235,0.1); }
            
            /* Smart Typography */
            .qe-q-text { font-size: clamp(1.1rem, 2.5vw, 1.25rem); font-weight: 700; line-height: 1.8; letter-spacing: 0.2px; margin: 0 0 1.5rem; color: white; }
            .qe-opt-text { font-size: clamp(0.95rem, 2vw, 1.05rem); font-weight: 500; line-height: 1.6; margin: 0 1rem; }

            /* Virtual Render Cards */
            .qe-card-layer {
                display: none; opacity: 0; transform: translateY(10px);
                transition: opacity 0.3s var(--qe-ease), transform 0.3s var(--qe-ease);
            }
            .qe-card-layer.active { display: block; opacity: 1; transform: translateY(0); }

            /* Focus Engine for A11y */
            *:focus-visible { outline: 2px solid var(--qe-primary); outline-offset: 2px; }
            
            /* Buttons */
            .qe-nav { display: flex; justify-content: space-between; margin-top: 2rem; gap: 1rem; }
            .qe-btn { padding: 0.875rem 1.5rem; border-radius: 0.75rem; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: transform 0.2s var(--qe-ease), opacity 0.2s; }
            .qe-btn-primary { background: var(--qe-primary); color: white; }
            .qe-btn-primary:hover:not(:disabled) { transform: scale(1.02); }
            .qe-btn-secondary { background: transparent; border: 1px solid var(--qe-border); color: var(--qe-text); }
            .qe-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

            /* Submitting State Layer */
            .qe-submitting-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.8); backdrop-filter: blur(4px); z-index: 10; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
        `;
        document.head.appendChild(style);
    };

    // ==========================================
    // 4. CINEMATIC AUDIO & HAPTICS
    // ==========================================
    const SensoryEngine = {
        ctx: null,
        init() { if (!this.ctx && !DeviceProfile.isCalmMode) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
        play(freq, type, duration, vol) {
            if (DeviceProfile.isLowEnd || DeviceProfile.isCalmMode) return;
            try {
                this.init(); if (this.ctx.state === 'suspended') this.ctx.resume();
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(vol, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                osc.connect(gain); gain.connect(this.ctx.destination);
                osc.start(); osc.stop(this.ctx.currentTime + duration);
            } catch (e) {}
        },
        vibrate(ms) { if (navigator.vibrate && !DeviceProfile.isCalmMode) navigator.vibrate(ms); },
        select() { this.play(600, 'sine', 0.1, 0.02); this.vibrate(10); },
        nav() { this.play(400, 'triangle', 0.1, 0.01); },
        warn() { this.play(200, 'sawtooth', 0.3, 0.03); this.vibrate([20, 50, 20]); }
    };

    const escapeHTML = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    // ==========================================
    // 5. CORE ENGINE (Virtual Render & A11y)
    // ==========================================
    const QuizEngine = {
        currentQuiz: null, currentIndex: 0, totalTime: 0, timerInterval: null,
        answers: {}, isPaused: false, cheatViolations: 0,
        focusableEls: [], firstFocus: null, lastFocus: null,

        open(quiz) {
            DeviceProfile.detect();
            injectStyles();
            
            this.currentQuiz = quiz; this.cheatViolations = 0; this.isPaused = false;
            const savedData = JSON.parse(localStorage.getItem(`dahih_quiz_${quiz.id}`)) || {};
            this.answers = savedData.answers || {};
            this.totalTime = savedData.timeLeft || (quiz.duration || quiz.questions.length * 60);
            
            // Smart Resume
            this.currentIndex = 0;
            while(this.answers[`q_${this.currentIndex}`] !== undefined && this.currentIndex < quiz.questions.length - 1) {
                this.currentIndex++;
            }

            const modal = document.getElementById('quizModal');
            const content = document.getElementById('quizModalContent');
            if (!content || !modal) return;

            // Accessibility ARIA Setup
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'qe-modal-title');

            content.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div style="color:white;font-weight:bold;font-size:1.2rem;display:flex;align-items:center;gap:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                        جاري تشفير وتسليم الإجابات...
                    </div>
                </div>
                <div style="padding: clamp(1.5rem, 4vw, 2.5rem);">
                    <div class="qe-header" style="display:flex;justify-content:space-between;border-bottom:1px solid var(--qe-border);padding-bottom:1rem;">
                        <h2 id="qe-modal-title" style="margin:0;color:white;font-size:clamp(1.1rem, 2vw, 1.25rem);">${escapeHTML(quiz.title)}</h2>
                        <div id="qe-timer" style="font-family:monospace;font-size:1.1rem;color:var(--qe-text-muted);font-weight:bold;">--:--</div>
                    </div>
                    <div class="qe-progress-container"><div class="qe-progress-fill" id="qe-progress-bar"></div></div>
                    
                    <form id="activeQuizForm" onsubmit="return false;">
                        <div id="qe-virtual-dom" style="min-height: 250px; position:relative;"></div>
                        
                        <div class="qe-nav">
                            <button type="button" class="qe-btn qe-btn-secondary" id="qe-btn-prev" onclick="QuizEngine.prev()">السابق</button>
                            <button type="button" class="qe-btn qe-btn-primary" id="qe-btn-next" onclick="QuizEngine.next()">التالي</button>
                            <button type="button" class="qe-btn qe-btn-primary" id="btnSubmitQuiz" onclick="QuizEngine.triggerSubmit()" style="display:none;background:var(--qe-success);">تسليم النهاية</button>
                        </div>
                    </form>
                </div>
            `;

            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
            
            requestAnimationFrame(() => {
                modal.classList.add('is-open');
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupA11yFocusTrap(modal);
                DeviceProfile.startMonitor();
                UIState.set(UIState.IDLE);
            });
        },

        // 🧠 Real Virtual Rendering: Render ONLY [Current-1, Current, Current+1]
        renderVirtualDOM() {
            const container = document.getElementById('qe-virtual-dom');
            const total = this.currentQuiz.questions.length;
            const letters = ['أ', 'ب', 'ج', 'د', 'هـ'];
            
            // Collect needed indices
            const indicesToRender = [this.currentIndex - 1, this.currentIndex, this.currentIndex + 1]
                .filter(i => i >= 0 && i < total);

            // Clean up old nodes not in range
            Array.from(container.children).forEach(child => {
                const idx = parseInt(child.dataset.index);
                if (!indicesToRender.includes(idx)) child.remove();
            });

            // Create missing nodes
            indicesToRender.forEach(idx => {
                if (!container.querySelector(`[data-index="${idx}"]`)) {
                    const q = this.currentQuiz.questions[idx];
                    const div = document.createElement('div');
                    div.className = `qe-card-layer ${idx === this.currentIndex ? 'active' : ''}`;
                    div.dataset.index = idx;
                    div.style.position = idx === this.currentIndex ? 'relative' : 'absolute';
                    div.style.top = '0'; div.style.left = '0'; div.style.width = '100%';

                    div.innerHTML = `
                        <h4 class="qe-q-text">${escapeHTML(q.questionText)}</h4>
                        <div role="radiogroup" aria-labelledby="q-label-${idx}">
                            ${q.options.map((opt, oi) => {
                                const isChecked = this.answers[`q_${idx}`] == oi;
                                return `
                                <label class="qe-option ${isChecked ? 'selected' : ''}">
                                    <input type="radio" name="q_${idx}" value="${oi}" ${isChecked ? 'checked' : ''} tabindex="${idx === this.currentIndex ? '0' : '-1'}">
                                    <div style="display:flex;align-items:center;width:100%;">
                                        <div style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-weight:bold;margin-left:15px;">${letters[oi] || oi+1}</div>
                                        <span class="qe-opt-text">${escapeHTML(opt)}</span>
                                    </div>
                                </label>`;
                            }).join('')}
                        </div>`;
                    
                    // Attach Event delegation logically
                    div.querySelectorAll('.qe-option').forEach((lbl, oi) => {
                        lbl.addEventListener('click', (e) => {
                            e.preventDefault(); // Prevent double triggers
                            this.selectOption(idx, oi, lbl);
                        });
                    });
                    
                    container.appendChild(div);
                } else {
                    // Update classes for existing
                    const child = container.querySelector(`[data-index="${idx}"]`);
                    if (idx === this.currentIndex) {
                        child.classList.add('active');
                        child.style.position = 'relative';
                        child.querySelectorAll('input').forEach(i => i.setAttribute('tabindex', '0'));
                    } else {
                        child.classList.remove('active');
                        child.style.position = 'absolute';
                        child.querySelectorAll('input').forEach(i => i.setAttribute('tabindex', '-1'));
                    }
                }
            });
            this.refreshFocusTrap();
        },

        selectOption(qIndex, optIndex, labelElement) {
            if(UIState.is(UIState.TRANSITIONING) || UIState.is(UIState.SUBMITTING)) return;
            SensoryEngine.select();
            
            const group = labelElement.closest('[role="radiogroup"]');
            group.querySelectorAll('.qe-option').forEach(el => el.classList.remove('selected'));
            labelElement.classList.add('selected');
            labelElement.querySelector('input').checked = true;

            this.answers[`q_${qIndex}`] = optIndex;
            localStorage.setItem(`dahih_quiz_${this.currentQuiz.id}`, JSON.stringify({ answers: this.answers, timeLeft: this.totalTime }));
            
            this.updateUI();

            // Predictive UI: Auto-next with State Machine lock
            if (this.currentIndex < this.currentQuiz.questions.length - 1) {
                UIState.set(UIState.TRANSITIONING);
                setTimeout(() => {
                    this.next();
                    UIState.set(UIState.IDLE);
                }, 350); // Cognitive delay
            }
        },

        updateUI() {
            const total = this.currentQuiz.questions.length;
            const answeredCount = Object.keys(this.answers).length;
            
            // requestAnimationFrame avoids layout thrashing
            requestAnimationFrame(() => {
                document.getElementById('qe-progress-bar').style.width = `${(answeredCount / total) * 100}%`;
                
                const btnPrev = document.getElementById('qe-btn-prev');
                const btnNext = document.getElementById('qe-btn-next');
                const btnSubmit = document.getElementById('btnSubmitQuiz');

                btnPrev.style.visibility = this.currentIndex > 0 ? 'visible' : 'hidden';
                if (this.currentIndex === total - 1) {
                    btnNext.style.display = 'none'; btnSubmit.style.display = 'block';
                } else {
                    btnNext.style.display = 'block'; btnSubmit.style.display = 'none';
                }
            });
        },

        next() {
            if (this.currentIndex < this.currentQuiz.questions.length - 1) {
                SensoryEngine.nav(); this.currentIndex++;
                this.renderVirtualDOM(); this.updateUI();
            }
        },
        prev() {
            if (this.currentIndex > 0) {
                SensoryEngine.nav(); this.currentIndex--;
                this.renderVirtualDOM(); this.updateUI();
            }
        },

        // 🛡️ Focus Trap & Accessibility
        setupA11yFocusTrap(modal) {
            this.keyHandler = (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === this.firstFocus) { e.preventDefault(); this.lastFocus.focus(); }
                    else if (!e.shiftKey && document.activeElement === this.lastFocus) { e.preventDefault(); this.firstFocus.focus(); }
                }
                if (e.key === 'ArrowLeft' && document.activeElement.tagName !== 'INPUT') this.next();
                if (e.key === 'ArrowRight' && document.activeElement.tagName !== 'INPUT') this.prev();
            };
            document.addEventListener('keydown', this.keyHandler);
        },
        refreshFocusTrap() {
            const focusable = document.getElementById('quizModal').querySelectorAll('button, [href], input[tabindex="0"], select, textarea, [tabindex]:not([tabindex="-1"])');
            if(focusable.length) {
                this.firstFocus = focusable[0];
                this.lastFocus = focusable[focusable.length - 1];
            }
        },

        startTimer() {
            clearInterval(this.timerInterval);
            const timerEl = document.getElementById('qe-timer');
            this.timerInterval = setInterval(() => {
                if(this.isPaused) return;
                if(this.totalTime <= 0) { clearInterval(this.timerInterval); this.triggerSubmit(true); return; }
                
                this.totalTime--;
                const mins = String(Math.floor(this.totalTime / 60)).padStart(2, '0');
                const secs = String(this.totalTime % 60).padStart(2, '0');
                
                requestAnimationFrame(() => {
                    timerEl.innerText = `${mins}:${secs}`;
                    if (this.totalTime <= 60 && this.totalTime > 15) timerEl.style.color = 'var(--qe-accent)';
                    if (this.totalTime <= 15) timerEl.style.color = 'var(--qe-danger)';
                });
            }, 1000);
        },

        triggerSubmit(force = false) {
            const answeredCount = Object.keys(this.answers).length;
            const total = this.currentQuiz.questions.length;
            if (!force && answeredCount < total) {
                if(!confirm(`يوجد ${total - answeredCount} أسئلة بلا إجابة. تأكيد التسليم؟`)) return;
            }
            this.submit();
        },

        async submit() {
            UIState.set(UIState.SUBMITTING);
            clearInterval(this.timerInterval);
            document.removeEventListener('keydown', this.keyHandler);
            DeviceProfile.stopMonitor();

            const overlay = document.getElementById('qe-submit-layer');
            if(overlay) overlay.classList.add('show');

            let score = 0;
            this.currentQuiz.questions.forEach((q, qi) => {
                if (parseInt(this.answers[`q_${qi}`]) === q.correctAnswer) score++;
            });
            const percentage = Math.round((score / this.currentQuiz.questions.length) * 100);

            const appState = typeof window.DahihApp.getState === 'function' ? window.DahihApp.getState() : {};

            try {
                await window.DahihApp.fetchWithTimeout('/api/student/submit-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.token}` },
                    body: JSON.stringify({ 
                        email: appState.user?.email, 
                        quizId: this.currentQuiz.id, 
                        score, percentage 
                    })
                });
                
                localStorage.removeItem(`dahih_quiz_${this.currentQuiz.id}`);
                
                if (percentage >= 85 && !DeviceProfile.isLowEnd && typeof confetti === 'function') {
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, zIndex: 10000 });
                }
                
                setTimeout(() => { this.close(); if(window.DahihApp.refresh) window.DahihApp.refresh(); }, 1500);
            } catch (err) {
                alert(`خطأ في الإرسال: ${err.message}`);
                overlay.classList.remove('show');
                UIState.set(UIState.IDLE);
            }
        },

        close() {
            clearInterval(this.timerInterval);
            document.removeEventListener('keydown', this.keyHandler);
            DeviceProfile.stopMonitor();

            const modal = document.getElementById('quizModal');
            if (modal) {
                modal.classList.remove('is-open');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 300);
            }
        }
    };

    window.QuizEngine = QuizEngine;
})();
