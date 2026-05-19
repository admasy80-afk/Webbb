/* ════════════════════════════════════════════════════════════
   منصة الدحيح | لوحة الطالب — JavaScript محسّن
   - بدون إعادة بناء DOM كاملة
   - تحديث ذكي (diff) للقوائم
   - مشغّل خفيف، أحداث nettoyée، احترام تفضيل الحركة
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─────────── الحالة ───────────
    const state = {
        user: null,
        token: null,
        currentMsgId: null,
        currentPoints: -1,
        coursesHash: '',
        quizzesHash: '',
        pointsHash: '',
        questionsHash: '',
        availableQuizzes: [],
        speedIndex: 0,
        speeds: [1, 1.25, 1.5, 2],
        pollTimer: null,
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };

    // ─────────── أدوات مساعدة ───────────
    const $ = (id) => document.getElementById(id);

    const escapeHTML = (str) => {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const hash = (obj) => {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return Math.random().toString();
        }
    };

    const formatTime = (t) => {
        if (!isFinite(t)) return '00:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // اهتزاز خفيف (يحترم الأجهزة الضعيفة)
    const haptic = (ms = 30) => {
        if (state.reduceMotion) return;
        if ('vibrate' in navigator) {
            try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
        }
    };

    // ─────────── المصادقة ───────────
    function authGate() {
        const userStr = localStorage.getItem('dahih_user');
        const token = localStorage.getItem('dahih_token');
        if (!userStr || !token) {
            window.location.replace('/logina.html');
            return false;
        }
        try {
            state.user = JSON.parse(userStr);
            state.token = token;
            return true;
        } catch (e) {
            window.location.replace('/logina.html');
            return false;
        }
    }

    function logout() {
        localStorage.removeItem('dahih_user');
        localStorage.removeItem('dahih_token');
        window.location.replace('/logina.html');
    }

    // ─────────── المشغّل ───────────
    const player = {
        video: null,
        poster: null,
        container: null,
        progress: null,
        progressBar: null,
        currentTimeEl: null,
        durationEl: null,
        speedBtn: null,
        muteBtn: null,
        centerPlay: null,
        skipIndicator: null,
        skipText: null,
        titleEl: null,
        tapLeft: null,
        tapRight: null,

        init() {
            this.video         = $('dahihPlayer');
            this.poster        = $('videoPoster');
            this.container     = $('videoContainer');
            this.progress      = $('progressContainer');
            this.progressBar   = $('progressBar');
            this.currentTimeEl = $('currentTimeDisplay');
            this.durationEl    = $('durationDisplay');
            this.speedBtn      = $('speedBtn');
            this.muteBtn       = $('muteBtn');
            this.centerPlay    = $('centerPlay');
            this.skipIndicator = $('skipIndicator');
            this.skipText      = $('skipText');
            this.titleEl       = $('playingVideoTitle');
            this.tapLeft       = $('tapLeft');
            this.tapRight      = $('tapRight');

            if (!this.video) return;

            this.video.addEventListener('click', () => this.togglePlay());
            this.centerPlay.addEventListener('click', () => this.togglePlay());

            this.video.addEventListener('play',  () => this.onPlay());
            this.video.addEventListener('pause', () => this.onPause());
            this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.video.addEventListener('loadedmetadata', () => {
                this.durationEl.textContent = formatTime(this.video.duration);
            });
            this.video.addEventListener('error', () => this.onError());

            this.tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(10, '+10 ثواني'); });
            this.tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(-10, '-10 ثواني'); });

            this.speedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
                this.video.playbackRate = state.speeds[state.speedIndex];
                this.speedBtn.textContent = state.speeds[state.speedIndex] + 'x';
            });

            this.muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.video.muted = !this.video.muted;
                this.updateMuteIcon();
            });

            this.progress.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.video.src) return;
                const r = this.progress.getBoundingClientRect();
                const pos = (e.clientX - r.left) / r.width;
                if (isFinite(this.video.duration)) {
                    this.video.currentTime = pos * this.video.duration;
                }
            });
        },

        load(msgId, title) {
            if (!this.video) return;

            // إذا نفس الدرس قيد التشغيل: تبديل play/pause فقط
            if (String(state.currentMsgId) === String(msgId)) {
                this.togglePlay();
                return;
            }

            state.currentMsgId = String(msgId);
            this.titleEl.textContent = title || 'محاضرة';

            // إخفاء البوستر بانتقال خفيف
            this.poster.classList.add('is-hidden');

            this.video.style.display = 'block';
            this.container.classList.add('is-active');

            this.video.pause();
            this.video.src = `/api/video/stream/${encodeURIComponent(msgId)}?token=${encodeURIComponent(state.token)}`;
            this.video.load();

            const playPromise = this.video.play();
            if (playPromise && playPromise.catch) {
                playPromise.catch(() => {
                    this.centerPlay.classList.add('is-visible');
                });
            }

            // تمييز الكرت النشط
            document.querySelectorAll('.course-card').forEach(c => c.classList.remove('is-active'));
            const card = $(`course_${msgId}`);
            if (card) card.classList.add('is-active');

            // تمرير سلس
            this.container.scrollIntoView({ behavior: state.reduceMotion ? 'auto' : 'smooth', block: 'center' });
        },

        togglePlay() {
            if (!this.video.src) return;
            if (this.video.paused) {
                this.video.play().catch(() => {});
            } else {
                this.video.pause();
            }
        },

        onPlay() {
            this.centerPlay.classList.remove('is-visible');
            this.video.classList.remove('is-paused');
        },

        onPause() {
            this.centerPlay.classList.add('is-visible');
            this.video.classList.add('is-paused');
        },

        onTimeUpdate() {
            if (!isFinite(this.video.duration)) return;
            const pct = (this.video.currentTime / this.video.duration) * 100;
            this.progressBar.style.width = pct + '%';
            this.currentTimeEl.textContent = formatTime(this.video.currentTime);
        },

        onError() {
            const codes = {
                1: 'تم إيقاف تحميل الفيديو.',
                2: 'خطأ في الشبكة.',
                3: 'صيغة الفيديو غير مدعومة.',
                4: 'الفيديو غير متاح حالياً.'
            };
            const code = this.video.error ? this.video.error.code : 0;
            this.titleEl.textContent = codes[code] || 'تعذّر تشغيل المحاضرة';
        },

        skip(seconds, label) {
            if (!this.video.src || !isFinite(this.video.duration)) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            this.skipText.textContent = label;
            this.skipIndicator.classList.remove('is-active');
            // إعادة تشغيل الأنيميشن
            void this.skipIndicator.offsetWidth;
            this.skipIndicator.classList.add('is-active');
            haptic(35);
        },

        updateMuteIcon() {
            this.muteBtn.innerHTML = this.video.muted
                ? '<svg style="width:1.4rem;height:1.4rem;color:#f87171;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4"/></svg>'
                : '<svg style="width:1.4rem;height:1.4rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"/></svg>';
        }
    };

    // ─────────── وضع السينما + ملء الشاشة ───────────
    function toggleTheater() {
        document.body.classList.toggle('theater-mode');
        const isOn = document.body.classList.contains('theater-mode');
        document.querySelectorAll('main > *:not(:has(#videoContainer))').forEach(el => {
            el.style.transition = 'opacity 0.3s ease';
            el.style.opacity = isOn ? '0.15' : '1';
        });
    }

    function toggleFullscreen() {
        const wrapper = $('fs-wrapper');
        if (!wrapper) return;

        if (!document.fullscreenElement) {
            const req = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
            if (req) {
                req.call(wrapper).then(() => {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(() => {});
                    }
                }).catch(() => {});
            }
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document).catch(() => {});
        }
    }

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
            try { screen.orientation.unlock(); } catch (e) { /* ignore */ }
        }
    });

    // ─────────── أقسام قابلة للطي ───────────
    function bindSections() {
        document.querySelectorAll('.section-head').forEach(head => {
            head.addEventListener('click', () => {
                const id = head.dataset.section;
                const body = $(id);
                if (!body) return;
                head.classList.toggle('is-collapsed');
                body.classList.toggle('is-collapsed');
            });
        });
    }

    // ─────────── أنيميشن الرقم ───────────
    function animateNumber(el, from, to, duration = 1200) {
        if (!el) return;
        if (state.reduceMotion) {
            el.textContent = to + '%';
            return;
        }
        const start = performance.now();
        const step = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.floor(from + (to - from) * eased) + '%';
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // ─────────── جلب البيانات ───────────
    async function fetchData(initial = false) {
        try {
            const res = await fetch('/api/student/dashboard-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({ email: state.user.email, grade: state.user.grade })
            });

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    logout();
                }
                return;
            }

            const data = await res.json();
            renderAll(data, initial);
        } catch (err) {
            console.warn('[Dahih] فشل جلب البيانات:', err.message);
        }
    }

    // ─────────── العرض (مع DOM diffing) ───────────
    function renderAll(data, initial) {
        renderCourses(data.courses || data.content?.courses || [], initial);
        renderQuizzes(data.content?.quizzes || []);
        renderPoints(data.content?.points || []);
        renderQuestions(data.content?.questions || []);
        renderScore(parseInt(data.studentPoints || 0));
    }

    function renderCourses(list, initial) {
        const container = $('studentCoursesContainer');
        if (!container) return;

        const h = hash(list.map(c => [c.telegramMsgId, c.courseName, c.description]));
        if (h === state.coursesHash && !initial) return;
        state.coursesHash = h;

        if (!list.length) {
            container.innerHTML = '<p class="empty">لا توجد محاضرات متاحة حالياً لهذه المرحلة.</p>';
            return;
        }

        const reversed = list.slice().reverse();
        const html = reversed.map((course, idx) => {
            const id = course.telegramMsgId;
            const num = list.length - idx;
            const isActive = String(state.currentMsgId) === String(id);
            const title = escapeHTML(course.courseName || 'محاضرة');
            const desc = escapeHTML(course.description || 'لا يوجد وصف');

            return `
                <article id="course_${id}" class="course-card${isActive ? ' is-active' : ''} flex flex-col md:flex-row justify-between h-full">
                    <div class="mb-4 md:mb-0" style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;flex-wrap:wrap;">
                            <span class="tag">الحصة ${num}</span>
                            <h3 class="text-white font-bold text-lg m-0">${title}</h3>
                        </div>
                        <p class="text-gray-400 text-sm m-0">${desc}</p>
                    </div>
                    <button class="btn btn-primary course-play w-full md:w-auto mt-auto md:mt-0" data-msgid="${id}" data-title="${title}" type="button">
                        <svg style="width:1.2rem;height:1.2rem;" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        تشغيل الحصة
                    </button>
                </article>
            `;
        }).join('');

        container.innerHTML = `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${html}</div>`;

        // ربط أحداث (مرة واحدة لكل عرض) مع التعديل المطلوب لنقل التبويب
        container.querySelectorAll('.course-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const msgId = btn.dataset.msgid;
                const title = btn.dataset.title;
                
                // 1. التبديل لتبويب لوحة المذاكرة
                if (typeof window.switchTab === 'function') {
                    window.switchTab('dashboard');
                }
                
                // 2. تشغيل الفيديو
                player.load(msgId, title);
                
                // 3. التمرير للأعلى لرؤية المشغل بوضوح
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    function renderQuizzes(list) {
        const container = $('onlineQuizzesContainer');
        if (!container) return;

        const h = hash(list.map(q => [q.id, q.title, q.questions.length, (q.results || []).length]));
        if (h === state.quizzesHash) return;
        state.quizzesHash = h;
        state.availableQuizzes = list;

        if (!list.length) {
            container.innerHTML = '<p class="empty">لا توجد اختبارات متاحة حالياً.</p>';
            return;
        }

        const html = list.slice().reverse().map(quiz => {
            const result = quiz.results ? quiz.results.find(r => r.email === state.user.email) : null;
            const action = result
                ? `<div class="btn w-full md:w-auto mt-auto md:mt-0" style="background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.25);cursor:default;">
                       <svg style="width:1rem;height:1rem;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                       مكتمل (${result.percentage}%)
                   </div>`
                : `<button class="btn btn-primary quiz-start w-full md:w-auto mt-auto md:mt-0" data-quizid="${escapeHTML(quiz.id)}" type="button">بدء الاختبار</button>`;

            return `
                <article class="course-card flex flex-col md:flex-row justify-between h-full">
                    <div class="mb-4 md:mb-0" style="flex:1;">
                        <h3 class="text-white font-bold text-lg m-0">${escapeHTML(quiz.title)}</h3>
                        <p class="text-gray-400 text-sm m-0">${quiz.questions.length} أسئلة</p>
                    </div>
                    ${action}
                </article>
            `;
        }).join('');

        container.innerHTML = `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${html}</div>`;

        container.querySelectorAll('.quiz-start').forEach(btn => {
            btn.addEventListener('click', () => openQuizModal(btn.dataset.quizid));
        });
    }

    function renderPoints(list) {
        const container = $('pointsContainer');
        if (!container) return;
        const h = hash(list);
        if (h === state.pointsHash) return;
        state.pointsHash = h;

        if (!list.length) {
            container.innerHTML = '<p class="empty">لا توجد ملاحظات حالياً.</p>';
            return;
        }
        container.innerHTML = `
            <ul class="fade-in-stagger" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.65rem;">
                ${list.map(p => `
                    <li style="display:flex;gap:0.65rem;color:#cbd5e1;font-size:0.9rem;line-height:1.7;">
                        <span style="color:var(--accent);flex-shrink:0;line-height:1.7;">▸</span>
                        <span>${escapeHTML(p)}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    function renderQuestions(list) {
        const container = $('questionsContainer');
        if (!container) return;
        const h = hash(list);
        if (h === state.questionsHash) return;
        state.questionsHash = h;

        if (!list.length) {
            container.innerHTML = '<p class="empty">لا توجد أسئلة مقالية حالياً.</p>';
            return;
        }
        container.innerHTML = `
            <div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">
                ${list.map((q, i) => `
                    <article style="background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;">
                        <h3 style="font-size:0.9rem;font-weight:700;color:#fff;margin:0 0 0.5rem;line-height:1.5;">
                            <span style="color:var(--text-dim);margin-left:0.4rem;">${i + 1}.</span>${escapeHTML(q.question)}
                        </h3>
                        <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.7;border-top:1px solid var(--border);padding-top:0.5rem;margin:0;">
                            <span style="color:var(--accent);font-weight:700;margin-left:0.4rem;">الإجابة:</span>${escapeHTML(q.hint)}
                        </p>
                    </article>
                `).join('')}
            </div>
        `;
    }

    function renderScore(newPoints) {
        const el = $('studentPointsDisplay');
        if (!el || state.currentPoints === newPoints) return;
        const start = state.currentPoints === -1 ? 0 : state.currentPoints;
        animateNumber(el, start, newPoints, 1200);
        state.currentPoints = newPoints;
    }

    // ─────────── الكويز ───────────
    function openQuizModal(quizId) {
        const quiz = state.availableQuizzes.find(q => q.id === quizId);
        if (!quiz) return;

        const content = $('quizModalContent');
        const modal = $('quizModal');
        if (!content || !modal) return;

        const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

        const questionsHTML = quiz.questions.map((q, qi) => `
            <div style="background:rgba(0,0,0,0.4);padding:1rem;border-radius:0.75rem;border:1px solid var(--border);">
                <h4 style="font-size:0.95rem;font-weight:600;margin:0 0 0.85rem;line-height:1.6;">
                    <span style="color:var(--accent);margin-left:0.4rem;">${qi + 1}.</span>${escapeHTML(q.questionText)}
                </h4>
                <div style="display:grid;grid-template-columns:1fr;gap:0.5rem;">
                    ${q.options.map((opt, oi) => `
                        <label class="quiz-option">
                            <input type="radio" name="q_${qi}" value="${oi}" required>
                            <div class="opt">
                                <span class="opt-letter">${letters[oi] || (oi + 1)}</span>
                                <span style="color:#cbd5e1;font-size:0.9rem;line-height:1.6;">${escapeHTML(opt)}</span>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');

        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:1rem;margin-bottom:1.25rem;">
                <h2 id="quizModalTitle" style="font-size:1.15rem;font-weight:700;margin:0;">${escapeHTML(quiz.title)}</h2>
                <span class="badge" style="color:var(--accent);background:var(--accent-soft);border-color:rgba(234,179,8,0.25);">${quiz.questions.length} أسئلة</span>
            </div>
            <form id="activeQuizForm" style="display:flex;flex-direction:column;gap:1rem;">
                ${questionsHTML}
                <div style="display:flex;flex-direction:column;gap:0.6rem;padding-top:1rem;border-top:1px solid var(--border);">
                    <button type="submit" id="btnSubmitQuiz" class="btn btn-primary" style="padding:0.85rem;">
                        إنهاء وتسليم الإجابات
                    </button>
                    <button type="button" class="btn" onclick="DahihApp.closeQuiz()" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);">
                        إلغاء
                    </button>
                </div>
            </form>
        `;

        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';

        $('activeQuizForm').addEventListener('submit', (e) => submitQuiz(e, quiz));
    }

    function closeQuiz() {
        $('quizModal').classList.remove('is-open');
        document.body.style.overflow = '';
    }

    async function submitQuiz(event, quiz) {
        event.preventDefault();
        const btn = $('btnSubmitQuiz');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'جاري التصحيح...';
        }

        const form = event.target;
        let score = 0;

        quiz.questions.forEach((q, qi) => {
            const el = form.elements[`q_${qi}`];
            if (el && parseInt(el.value) === q.correctAnswer) score++;
        });

        const percentage = Math.round((score / quiz.questions.length) * 100);

        try {
            await fetch('/api/student/submit-quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({
                    email: state.user.email,
                    studentName: state.user.name,
                    grade: state.user.grade,
                    quizId: quiz.id,
                    score,
                    percentage
                })
            });

            if (percentage >= 85 && typeof confetti === 'function' && !state.reduceMotion) {
                confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            }

            const color = percentage >= 85 ? '#4ade80' : (percentage >= 50 ? '#60a5fa' : '#f87171');
            $('quizModalContent').innerHTML = `
                <div style="text-align:center;padding:2.5rem 1rem;">
                    <h2 style="font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;">تم تسجيل النتيجة</h2>
                    <div style="font-size:clamp(3rem,10vw,5rem);font-weight:900;color:${color};margin:1.25rem 0;letter-spacing:-0.02em;" dir="ltr">${percentage}%</div>
                    <p style="color:var(--text-muted);margin:0 0 1.5rem;">الإجابات الصحيحة: ${score} من ${quiz.questions.length}</p>
                    <button class="btn btn-primary" onclick="DahihApp.closeQuiz();DahihApp.refresh();" style="padding:0.85rem 2rem;">العودة للوحة</button>
                </div>
            `;
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'حاول مجدداً';
            }
        }
    }

    // ─────────── إغلاق المودال بالـ Escape والكليك خارج الصندوق ───────────
    function bindModalDismiss() {
        const modal = $('quizModal');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeQuiz();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('is-open')) {
                closeQuiz();
            }
        });
    }

    // ─────────── البدء ───────────
    function init() {
        if (!authGate()) return;

        const firstName = state.user.name ? state.user.name.split(' ')[0] : 'طالب';
        $('studentName').textContent = firstName;
        $('studentGrade').textContent = state.user.grade || 'الصف غير محدد';

        player.init();
        bindSections();
        bindModalDismiss();

        // مرة أولى
        fetchData(true);

        // تحديث دوري ذكي (يتوقف عند إخفاء التبويب لتوفير الموارد)
        const startPolling = () => {
            if (state.pollTimer) return;
            state.pollTimer = setInterval(() => fetchData(false), 10000);
        };
        const stopPolling = () => {
            if (state.pollTimer) {
                clearInterval(state.pollTimer);
                state.pollTimer = null;
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopPolling();
            else { fetchData(false); startPolling(); }
        });

        startPolling();
    }

    // ─────────── الواجهة العامة ───────────
    window.DahihApp = {
        logout,
        toggleTheater,
        toggleFullscreen,
        closeQuiz,
        refresh: () => fetchData(false)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
