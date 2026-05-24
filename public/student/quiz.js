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
        },

        trackInteraction() {
            const now = Date.now();
            this.erraticClicks = (now - this.lastInteraction < 600) ? this.erraticClicks + 1 : Math.max(0, this.erraticClicks - 1);
            this.lastInteraction = now;
            
            if (this.erraticClicks > 4 && !this.isCalmMode) {
                this.isCalmMode = true;
                this.applyProfiles();
                A11yNarrator.announce("تم تفعيل وضع الهدوء لمساعدتك على التركيز.");
            }
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

    const A11yNarrator = {
        el: null,
        init() {
            if(!this.el) {
                this.el = document.createElement('div');
                this.el.setAttribute('aria-live', 'polite');
                this.el.className = 'qe-sr-only';
                document.body.appendChild(this.el);
            }
        },
        announce(text) { this.init(); this.el.textContent = text; }
    };

    const injectStyles = () => {
        if (document.getElementById('qe-v4-styles')) return;
        const style = document.createElement('style');
        style.id = 'qe-v4-styles';
        style.innerHTML = `
            :root {
                --qe-primary: #2563eb; --qe-primary-soft: rgba(37, 99, 235, 0.1);
                --qe-bg: #0f172a; --qe-surface: #1e293b;
                --qe-border: rgba(255, 255, 255, 0.08);
                --qe-text: #f8fafc; --qe-text-muted: #94a3b8;
                --qe-ease: cubic-bezier(0.25, 1, 0.5, 1);
                --qe-reading-width: 65ch;
                --qe-accent: #f59e0b;
                --qe-success: #10b981;
                --qe-danger: #ef4444;
            }

            #quizModal {
                background: radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.15) 0%, rgba(15, 23, 42, 0.95) 70%) !important;
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                display: flex; align-items: center; justify-content: center; z-index: 9999;
                font-family: 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif;
                transition: opacity 0.4s var(--qe-ease), background 1s ease;
            }
            
            #quizModalContent {
                background: var(--qe-surface) !important;
                border: 1px solid var(--qe-border);
                border-radius: clamp(1rem, 3vw, 1.5rem) !important;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
                width: 100%; max-width: 800px; position: relative; overflow: hidden;
                transform: translateY(20px) scale(0.98); opacity: 0;
                transition: transform 0.5s var(--qe-ease), opacity 0.4s var(--qe-ease);
                will-change: transform, opacity;
            }
            #quizModal:not(.hidden) #quizModalContent { transform: translateY(0) scale(1); opacity: 1; }

            .qe-spotlight {
                position: absolute; inset: -50%; pointer-events: none; z-index: 10;
                background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 60%);
                opacity: 0; transition: opacity 0.5s ease; mix-blend-mode: screen;
            }
            #quizModal:not(.hidden) .qe-spotlight { opacity: 1; }

            .qe-low-perf #quizModal { backdrop-filter: none !important; background: rgba(15,23,42,0.98) !important; }
            .qe-low-perf * { transition-duration: 0.1s !important; box-shadow: none !important; }
            .qe-calm-mode { --qe-primary: #64748b; --qe-primary-soft: rgba(100, 116, 139, 0.1); }
            .qe-calm-mode #quizModal { background: rgba(15,23,42,0.98) !important; }
            .qe-calm-mode .qe-q-text { line-height: 2; letter-spacing: 0.5px; }

            .qe-progress-container { height: 4px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; margin: 1.5rem 0; }
            .qe-progress-fill {
                height: 100%; width: 0%; background: var(--qe-primary);
                transition: width 0.6s var(--qe-ease); will-change: width;
            }
            .qe-momentum-pulse { animation: qePulse 0.5s var(--qe-ease); }
            @keyframes qePulse { 50% { filter: brightness(1.5); box-shadow: 0 0 15px var(--qe-primary); } }

            .qe-q-text { 
                font-size: clamp(1.1rem, 2.5vw, 1.35rem); font-weight: 700; line-height: 1.7; 
                margin: 0 auto 2rem; color: white; max-width: var(--qe-reading-width); 
                transition: all 0.3s ease; text-align: right;
            }
            
            .qe-option {
                display: flex; align-items: center; padding: clamp(0.875rem, 2vw, 1.125rem); margin-bottom: 0.75rem;
                background: rgba(255,255,255,0.02); border: 1px solid var(--qe-border);
                border-radius: 1rem; cursor: pointer; position: relative; overflow: hidden;
                transition: transform 0.2s var(--qe-ease), background 0.2s, border-color 0.2s;
                transform: translateZ(0); max-width: var(--qe-reading-width); margin-left: auto; margin-right: auto;
            }
            .qe-option:hover { transform: scale(1.015) translateX(-4px); background: rgba(255,255,255,0.04); }
            .qe-option input[type="radio"] { opacity: 0; position: absolute; }
            .qe-option.selected { border-color: var(--qe-primary); background: var(--qe-primary-soft); transform: scale(1.02); }
            .qe-option-letter { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-weight: bold; margin-left: 1rem; transition: 0.3s; }
            .qe-option.selected .qe-option-letter { background: var(--qe-primary); color: white; }

            .qe-card-layer {
                display: none; opacity: 0; transform: translateX(30px);
                transition: opacity 0.4s var(--qe-ease), transform 0.4s var(--qe-ease);
            }
            .qe-card-layer.active { display: block; opacity: 1; transform: translateX(0); }
            .qe-card-layer.exit-prev { display: block; opacity: 0; transform: translateX(-30px); position: absolute; top:0; width:100%; }
            .qe-card-layer.exit-next { display: block; opacity: 0; transform: translateX(30px); position: absolute; top:0; width:100%; }

            .qe-nav-container { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 2.5rem; padding-bottom: max(env(safe-area-inset-bottom), 1rem); }
            .qe-nav-group { display: flex; gap: 0.75rem; }
            .qe-btn { padding: 0.875rem 2rem; border-radius: 1rem; font-weight: 700; cursor: pointer; border: none; font-family: inherit; transition: all 0.3s var(--qe-ease); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
            .qe-btn-primary { background: var(--qe-primary); color: white; }
            .qe-btn-primary:hover:not(:disabled) { transform: scale(1.03); box-shadow: 0 4px 15px var(--qe-primary-soft); }
            .qe-btn-secondary { background: transparent; border: 1px solid var(--qe-border); color: var(--qe-text); }
            .qe-btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.05); transform: scale(1.02); }
            .qe-btn:disabled { cursor: not-allowed; transform: none !important; }

            .qe-submitting-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.85); backdrop-filter: blur(8px); z-index: 50; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease; }
            .qe-submitting-overlay.show { display: flex; opacity: 1; }
            .qe-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; }
        `;
        document.head.appendChild(style);
    };

    const escapeHTML = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    const QuizEngine = {
        quiz: null, currentIndex: 0, totalTime: 0, timerId: null, answers: {},
        touchStartX: 0, isTransitioning: false, focusableEls: [], firstFocus: null, lastFocus: null,

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
            const content = document.getElementById('quizModalContent');
            if (!content || !modal) return;

            modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
            
            content.innerHTML = `
                <div class="qe-submitting-overlay" id="qe-submit-layer">
                    <div style="color:white;font-weight:bold;font-size:1.2rem;display:flex;align-items:center;gap:12px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite;color:var(--qe-primary);"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                        جاري تشفير وتسليم الإجابات...
                    </div>
                </div>
                <div class="qe-spotlight"></div>
                <div style="padding: clamp(1.5rem, 4vw, 3rem); position: relative; z-index: 2;">
                    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--qe-border);padding-bottom:1.5rem;">
                        <h2 style="margin:0;color:white;font-size:clamp(1.1rem, 2vw, 1.25rem);opacity:0.9;">${escapeHTML(quiz.title)}</h2>
                        <div id="qe-timer" style="font-family:monospace;font-size:1.2rem;color:var(--qe-text-muted);font-weight:bold;background:rgba(0,0,0,0.2);padding:0.4rem 1rem;border-radius:2rem;transition:color 0.3s;">--:--</div>
                    </div>
                    <div class="qe-progress-container"><div class="qe-progress-fill" id="qe-progress-bar"></div></div>
                    
                    <form id="activeQuizForm" onsubmit="return false;">
                        <div id="qe-virtual-dom" style="min-height: 300px; position:relative;"></div>
                        
                        <div class="qe-nav-container">
                            <div class="qe-nav-group">
                                <button type="button" class="qe-btn qe-btn-secondary" id="qe-btn-prev">السابق</button>
                                <button type="button" class="qe-btn qe-btn-primary" id="qe-btn-next">التالي</button>
                            </div>
                            <button type="button" class="qe-btn qe-btn-primary" id="btnSubmitQuiz" disabled style="background:var(--qe-success);min-width:160px;opacity:0.5;">تسليم الإجابات</button>
                        </div>
                    </form>
                </div>
            `;

            modal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            document.body.style.overflow = 'hidden'; 
            
            Scheduler.frame(() => {
                this.renderVirtualDOM();
                this.updateUI();
                this.startTimer();
                this.setupGestures();
                this.setupA11yFocusTrap(modal);
                this.attachNavEvents();
                A11yNarrator.announce(`بدأ الاختبار: ${quiz.title}. السؤال الأول.`);
            });
        },

        attachNavEvents() {
            document.getElementById('qe-btn-prev').onclick = () => this.prev();
            document.getElementById('qe-btn-next').onclick = () => this.next();
            document.getElementById('btnSubmitQuiz').onclick = () => this.submitCheck();
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
                    child.className = `qe-card-layer ${idx < this.currentIndex ? 'exit-prev' : 'exit-next'}`;
                    child.querySelectorAll('input').forEach(i => i.setAttribute('tabindex', '-1'));
                }
            });

            indices.forEach(idx => {
                if (!container.querySelector(`[data-index="${idx}"]`)) {
                    const q = this.quiz.questions[idx];
                    const div = document.createElement('div');
                    div.className = `qe-card-layer ${idx === this.currentIndex ? 'active' : (idx < this.currentIndex ? 'exit-prev' : 'exit-next')}`;
                    div.dataset.index = idx;

                    div.innerHTML = `
                        <h4 class="qe-q-text">${escapeHTML(q.questionText)}</h4>
                        <div role="radiogroup" aria-label="الخيارات">
                            ${q.options.map((opt, oi) => {
                                const isChecked = this.answers[`q_${idx}`] == oi;
                                return `
                                <label class="qe-option ${isChecked ? 'selected' : ''}">
                                    <input type="radio" name="q_${idx}" value="${oi}" ${isChecked ? 'checked' : ''} tabindex="${idx === this.currentIndex ? '0' : '-1'}">
                                    <div class="qe-option-letter">${letters[oi] || oi+1}</div>
                                    <span style="font-size:clamp(0.95rem, 2vw, 1.05rem); font-weight:600; margin-right:1rem;">${escapeHTML(opt)}</span>
                                </label>`;
                            }).join('')}
                        </div>`;
                    
                    div.querySelectorAll('.qe-option').forEach((lbl, oi) => {
                        lbl.addEventListener('click', (e) => { e.preventDefault(); this.selectOption(idx, oi, lbl); });
                    });
                    container.appendChild(div);
                } else if (idx === this.currentIndex) {
                    const child = container.querySelector(`[data-index="${idx}"]`);
                    child.className = 'qe-card-layer active';
                    child.querySelectorAll('input').forEach(i => i.setAttribute('tabindex', '0'));
                }
            });
            this.refreshFocusTrap();
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
            
            this.updateUI(true);

            if (this.currentIndex < this.quiz.questions.length - 1) {
                this.isTransitioning = true;
                setTimeout(() => { this.next(); this.isTransitioning = false; }, EngineCore.isCalmMode ? 600 : 400);
            }
        },

        updateUI(isAnswer = false) {
            Scheduler.frame(() => {
                const total = this.quiz.questions.length;
                const answered = Object.keys(this.answers).length;
                const bar = document.getElementById('qe-progress-bar');
                
                bar.style.width = `${(answered / total) * 100}%`;
                if (isAnswer) {
                    bar.classList.remove('qe-momentum-pulse');
                    void bar.offsetWidth; 
                    bar.classList.add('qe-momentum-pulse');
                }
                
                const btnPrev = document.getElementById('qe-btn-prev');
                const btnNext = document.getElementById('qe-btn-next');
                const btnSubmit = document.getElementById('btnSubmitQuiz');

                btnPrev.disabled = this.currentIndex === 0;
                btnPrev.style.opacity = this.currentIndex === 0 ? '0.4' : '1';

                btnNext.disabled = this.currentIndex === total - 1;
                btnNext.style.opacity = this.currentIndex === total - 1 ? '0.4' : '1';

                const isLast = this.currentIndex === total - 1;
                btnSubmit.disabled = !isLast;
                btnSubmit.style.opacity = isLast ? '1' : '0.4';
                btnSubmit.style.transform = isLast ? 'scale(1.02)' : 'scale(1)';
                btnSubmit.style.boxShadow = isLast ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none';
            });
        },

        next() {
            if (this.currentIndex < this.quiz.questions.length - 1) {
                Sensory.nav(-1); this.currentIndex++;
                this.renderVirtualDOM(1); this.updateUI();
                A11yNarrator.announce(`السؤال ${this.currentIndex + 1}`);
            }
        },
        prev() {
            if (this.currentIndex > 0) {
                Sensory.nav(1); this.currentIndex--;
                this.renderVirtualDOM(-1); this.updateUI();
                A11yNarrator.announce(`السؤال ${this.currentIndex + 1}`);
            }
        },

        setupGestures() {
            this.touchHandler = e => {
                if(EngineCore.isLowEnd) return;
                const dx = e.changedTouches[0].screenX - this.touchStartX;
                if (dx > 60) this.next(); 
                if (dx < -60) this.prev(); 
            };
            document.addEventListener('touchstart', e => this.touchStartX = e.changedTouches[0].screenX, { passive: true });
            document.addEventListener('touchend', this.touchHandler, { passive: true });
        },

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
            clearInterval(this.timerId);
            const timerEl = document.getElementById('qe-timer');
            this.timerId = setInterval(() => {
                if(this.totalTime <= 0) { clearInterval(this.timerId); this.submit(); return; }
                this.totalTime--;
                
                Scheduler.frame(() => {
                    const mins = String(Math.floor(this.totalTime / 60)).padStart(2, '0');
                    const secs = String(this.totalTime % 60).padStart(2, '0');
                    timerEl.innerText = `${mins}:${secs}`;
                    
                    if (this.totalTime === 60) { timerEl.style.color = 'var(--qe-accent)'; Sensory.warn(); }
                    if (this.totalTime === 15) { timerEl.style.color = 'var(--qe-danger)'; Sensory.warn(); }
                });
            }, 1000);
        },

        submitCheck() {
            const answeredCount = Object.keys(this.answers).length;
            const total = this.quiz.questions.length;
            if (answeredCount < total) {
                if(!confirm(`يوجد ${total - answeredCount} أسئلة بلا إجابة. هل أنت متأكد من التسليم؟`)) return;
            }
            this.submit();
        },

        async submit() {
            UIState.set(UIState.SUBMITTING);
            clearInterval(this.timerId);
            document.removeEventListener('keydown', this.keyHandler);
            document.removeEventListener('touchend', this.touchHandler);
            
            const overlay = document.getElementById('qe-submit-layer');
            if(overlay) overlay.classList.add('show');
            
            let score = 0;
            this.quiz.questions.forEach((q, qi) => { if (parseInt(this.answers[`q_${qi}`]) === q.correctAnswer) score++; });
            const percentage = Math.round((score / this.quiz.questions.length) * 100);

            try {
                const appState = typeof window.DahihApp.getState === 'function' ? window.DahihApp.getState() : {};
                await window.DahihApp.fetchWithTimeout('/api/student/submit-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.token}` },
                    body: JSON.stringify({ email: appState.user?.email, quizId: this.quiz.id, score, percentage })
                });
                
                Scheduler.idle(() => localStorage.removeItem(`dq_${this.quiz.id}`));
                Sensory.success();
                
                if (percentage >= 85 && !EngineCore.isLowEnd && typeof confetti === 'function') {
                    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 10000 });
                }

                if(overlay) overlay.classList.remove('show');
                this.close();
                
                setTimeout(() => { if(window.DahihApp.refresh) window.DahihApp.refresh(); }, 200);

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
