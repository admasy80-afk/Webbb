(function () {
    'use strict';

    const state = {
        user: null,
        token: null,
        currentMsgId: null,
        currentPoints: -1,
        coursesHash: '',
        quizzesHash: '',
        pointsHash: '',
        questionsHash: '',
        rawQuizzes: [], // حفظ البيانات الأصلية للاختبارات
        currentQuizFilter: 'all', // حفظ حالة الفلتر الحالي
        speedIndex: 0,
        speeds: [1, 1.25, 1.5, 2],
        pollTimer: null,
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };

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
        try { return JSON.stringify(obj); } catch (e) { return Math.random().toString(); }
    };

    const formatTime = (t) => {
        if (!isFinite(t)) return '00:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const haptic = (ms = 30) => {
        if (state.reduceMotion) return;
        if ('vibrate' in navigator) { try { navigator.vibrate(ms); } catch (e) {} }
    };

    function authGate() {
        const userStr = localStorage.getItem('dahih_user');
        const token = localStorage.getItem('dahih_token');
        if (!userStr || !token) {
            alert("⚠️ المصادقة فشلت: لم يتم العثور على التوكن أو بيانات المستخدم. سيتم توجيهك لصفحة تسجيل الدخول.");
            window.location.replace('/logina.html');
            return false;
        }
        try {
            state.user = JSON.parse(userStr);
            state.token = token;
            return true;
        } catch (e) {
            alert("🚨 خطأ في قراءة بيانات الجلسة: " + e.message);
            window.location.replace('/logina.html');
            return false;
        }
    }

    function logout() {
        localStorage.removeItem('dahih_user');
        localStorage.removeItem('dahih_token');
        window.location.replace('/logina.html');
    }

    async function fetchWithTimeout(url, options = {}, timeout = 15000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(id);
        }
    }

    const player = {
        video: null, poster: null, container: null, progress: null, progressBar: null,
        currentTimeEl: null, durationEl: null, speedBtn: null, muteBtn: null,
        centerPlay: null, skipIndicatorLeft: null, skipIndicatorRight: null, skipTextLeft: null, skipTextRight: null, titleEl: null,
        tapLeft: null, tapRight: null, lastSentTime: -1,

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
            this.skipIndicatorLeft = $('skipIndicatorLeft');
            this.skipIndicatorRight = $('skipIndicatorRight');
            this.skipTextLeft  = $('skipTextLeft');
            this.skipTextRight = $('skipTextRight');
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

            this.tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(-10, '-10', 'left'); });
            this.tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(10, '+10', 'right'); });

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
            if (String(state.currentMsgId) === String(msgId)) {
                this.togglePlay();
                return;
            }

            state.currentMsgId = String(msgId);
            this.titleEl.textContent = title || 'جاري التحميل...';
            this.lastSentTime = -1;

            this.poster.classList.add('hidden');
            this.video.classList.remove('hidden');
            this.video.style.display = 'block';
            this.container.classList.add('is-active');
            this.video.pause();
            
            const videoUrl = `/api/student/video/stream/${encodeURIComponent(msgId)}?token=${encodeURIComponent(state.token)}`;

            fetch(videoUrl, { headers: { 'Range': 'bytes=0-100' } })
                .then(async (response) => {
                    if (!response.ok) {
                        const errorText = await response.text();
                        alert(`🚨 خطأ سيرفر الفيديو (${response.status}):\n${errorText}`);
                    }
                })
                .catch(err => {
                    alert(`🚨 خطأ في شبكة البث الفيديوي:\n${err.message}`);
                });

            this.video.src = videoUrl;
            this.video.load();

            const playPromise = this.video.play();
            if (playPromise && playPromise.catch) {
                playPromise.catch(() => {
                    this.centerPlay.classList.add('is-visible');
                    this.centerPlay.style.opacity = "1";
                    this.centerPlay.style.transform = "scale(1)";
                    this.centerPlay.style.pointerEvents = "auto";
                });
            }

            document.querySelectorAll('.course-card-v4').forEach(c => {
                c.classList.remove('border-yellow-500/40', 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]');
                c.classList.add('border-white/10', 'shadow-lg');
            });
            const card = $(`course_${msgId}`);
            if (card) {
                card.classList.remove('border-white/10', 'shadow-lg');
                card.classList.add('border-yellow-500/40', 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]');
            }
            this.container.scrollIntoView({ behavior: state.reduceMotion ? 'auto' : 'smooth', block: 'center' });
        },

        togglePlay() {
            if (!this.video.src) return;
            if (this.video.paused) { this.video.play().catch(() => {}); } else { this.video.pause(); }
        },

        onPlay() {
            this.centerPlay.classList.remove('is-visible');
            this.centerPlay.style.opacity = "0";
            this.centerPlay.style.transform = "scale(1.5)";
            this.centerPlay.style.pointerEvents = "none";
        },

        onPause() {
            this.centerPlay.classList.add('is-visible');
            this.centerPlay.style.opacity = "1";
            this.centerPlay.style.transform = "scale(1)";
            this.centerPlay.style.pointerEvents = "auto";
        },

        onTimeUpdate() {
            if (!isFinite(this.video.duration)) return;
            const pct = (this.video.currentTime / this.video.duration) * 100;
            this.progressBar.style.width = pct + '%';
            this.currentTimeEl.textContent = formatTime(this.video.currentTime);

            const currentSec = Math.floor(this.video.currentTime);
            if (currentSec > 0 && currentSec % 10 === 0 && this.lastSentTime !== currentSec) {
                this.lastSentTime = currentSec;
                fetch('/api/student/save-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                    body: JSON.stringify({ msgId: state.currentMsgId, currentTime: this.video.currentTime })
                }).catch(() => {});
            }
        },
        onError() {
            const err = this.video.error;
            alert(`🚨 خطأ في مشغل الفيديو:\nالكود: ${err ? err.code : 'مجهول'}\nالرسالة: ${err ? err.message : 'لا توجد تفاصيل'}`);
        },
        skip(seconds, label, side) {
            if (!this.video.src || !isFinite(this.video.duration)) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            
            const indicator = side === 'left' ? this.skipIndicatorLeft : this.skipIndicatorRight;
            const textEl = side === 'left' ? this.skipTextLeft : this.skipTextRight;
            
            if(indicator && textEl) {
                textEl.textContent = label;
                indicator.classList.remove('is-active');
                void indicator.offsetWidth;
                indicator.classList.add('is-active');
            }
            haptic(35);
        },
        updateMuteIcon() {
            this.muteBtn.innerHTML = this.video.muted
                ? '<svg style="width:1.4rem;height:1.4rem;color:#f87171;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4"/></svg>'
                : '<svg style="width:1.4rem;height:1.4rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"/></svg>';
        }
    };

    function toggleFullscreen() {
        const wrapper = $('fs-wrapper');
        if (!wrapper) return;
        if (!document.fullscreenElement) {
            const req = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
            if (req) {
                req.call(wrapper).then(() => {
                    if (screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(() => {}); }
                }).catch(() => {});
            }
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document).catch(() => {});
        }
    }

    function animateNumber(el, from, to, duration = 1200) {
        if (!el) return;
        if (state.reduceMotion) { el.textContent = to + '%'; return; }
        const start = performance.now();
        const step = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.floor(from + (to - from) * eased) + '%';
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    async function fetchData(initial = false) {
        const container = $('studentCoursesContainer');
        if (initial && container) {
            container.innerHTML = `
                <div class="text-center py-16 text-gray-500 flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10 w-full">
                    <svg class="animate-spin h-10 w-10 text-yellow-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="font-bold text-lg text-gray-300">جاري جلب البيانات...</p>
                </div>`;
        }

        try {
            const res = await fetchWithTimeout('/api/student/dashboard-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({ email: state.user.email, grade: state.user.grade })
            }, 15000);

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    alert("🚨 انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول.");
                    logout();
                    return;
                }
                throw new Error(`رفض السيرفر الطلب برمز الحالة: ${res.status}`);
            }

            const data = await res.json();
            renderAll(data, initial);
            
        } catch (err) {
            if (container && initial) {
                container.innerHTML = `
                    <div class="text-center py-16 text-red-400 bg-red-500/5 rounded-2xl border border-red-500/20 w-full">
                        <p class="font-bold text-xl mb-2">فشل تحميل البيانات 😔</p>
                        <p class="text-sm text-gray-400 mb-6">${err.message}</p>
                        <button onclick="DahihApp.refresh()" class="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 px-6 py-2 rounded-xl transition-colors font-bold">🔄 أعد المحاولة</button>
                    </div>`;
            }
        }
    }

    function renderAll(data, initial) {
        try {
            renderCourses(data.courses || data.content?.courses || [], initial);
            renderQuizzes(data.content?.quizzes || []);
            renderPoints(data.content?.points || []);
            renderQuestions(data.content?.questions || []);
            renderScore(parseInt(data.studentPoints || 0));
        } catch(e) {
            console.error("Error rendering DOM:", e);
        }
    }

    function renderCourses(list, initial) {
        const container = $('studentCoursesContainer');
        if (!container) return;
        list = list || [];

        const h = hash(list.map(c => [c.telegramMsgId, c.courseName, c.description, c.duration, c.lastWatched, c.image]));
        if (h === state.coursesHash && !initial) return;
        state.coursesHash = h;

        if (list.length === 0) {
            container.className = "flex flex-col gap-8";
            container.innerHTML = '<div class="text-center py-16 text-gray-400 bg-white/5 rounded-2xl border border-white/10 w-full">لا توجد محاضرات متاحة حالياً لصفك الدراسي.</div>';
            return;
        }

        container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
        const html = list.map((course, idx) => {
            const id = course.telegramMsgId;
            const num = idx + 1;
            const isActive = String(state.currentMsgId) === String(id);
            const title = escapeHTML(course.courseName || 'محاضرة');
            const desc = escapeHTML(course.description || 'لا يوجد وصف');
            const duration = escapeHTML(course.duration || 'غير محدد');
            const image = course.image && course.image.length > 10 ? course.image : 'https://images.unsplash.com/photo-1632516643720-e7f5d7d6ecc9?q=80&w=600&auto=format&fit=crop';
            const lastWatched = course.lastWatched;
            
            const borderColor = isActive ? 'border-yellow-500/40' : 'border-white/10';
            const shadow = isActive ? 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]' : 'shadow-lg';
            const badgeBg = isActive ? 'border-yellow-500/40 text-yellow-500' : 'border-white/10 text-white';

            const actionBtn = isActive 
                ? `<button class="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2.5 rounded-lg transition-colors">استكمال المشاهدة</button>`
                : `<button class="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 rounded-lg transition-colors border border-white/10">تشغيل المحاضرة</button>`;

            const lastWatchedHTML = lastWatched 
                ? `<div class="inline-flex items-center gap-2 text-[0.75rem] text-white bg-white/5 px-3 py-1.5 rounded-md mb-4 border border-white/10 w-fit"><span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>آخر مشاهدة: الدقيقة ${lastWatched}</div>` 
                : '<div class="h-8 mb-4"></div>';

            return `
                <div class="flex flex-col bg-white/5 border ${borderColor} rounded-xl overflow-hidden hover:-translate-y-1 hover:border-white/20 transition-all duration-300 ${shadow} course-card-v4" id="course_${id}">
                    <div class="relative h-36 p-4 flex flex-col justify-between border-b border-white/10" style="background: linear-gradient(to bottom right, rgba(0,0,0,0.3), rgba(0,0,0,0.8)), url('${image}'); background-size: cover; background-position: center;">
                        <span class="self-start px-2.5 py-1 rounded-md text-[0.7rem] font-bold bg-black/50 backdrop-blur-sm border ${badgeBg}">الدرس ${num}</span>
                        <div class="text-white/90 text-xs font-medium drop-shadow-md truncate">${desc}</div>
                    </div>
                    <div class="p-5 flex flex-col flex-grow">
                        <h3 class="text-lg font-bold text-white mb-3 truncate" title="${title}">${title}</h3>
                        <div class="flex items-center gap-2 text-xs text-gray-400 mb-4">
                            <span class="bg-black/30 px-2 py-1 rounded border border-white/5">⏱️ ${duration}</span>
                        </div>
                        ${lastWatchedHTML}
                        <div class="mt-auto pt-4 border-t border-white/10 course-play cursor-pointer" data-msgid="${id}" data-title="${title}">
                            ${actionBtn}
                        </div>
                    </div>
                </div>`;
        }).join('');

        container.innerHTML = html;
        container.querySelectorAll('.course-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.switchTab === 'function') { window.switchTab('dashboard'); }
                player.load(btn.dataset.msgid, btn.dataset.title);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    // --- نظام الاختبارات المحدث ---
    const updateQuizStats = (quizzes) => {
        if(!quizzes || quizzes.length === 0) {
             if($('stat-total')) $('stat-total').textContent = '0';
             if($('stat-completed')) $('stat-completed').textContent = '0';
             if($('stat-remaining')) $('stat-remaining').textContent = '0';
             if($('stat-average')) $('stat-average').textContent = '0%';
             return;
        }

        const total = quizzes.length;
        const completed = quizzes.filter(q => q.attempted).length;
        const remaining = total - completed;
        
        let avgScore = 0;
        if (completed > 0) {
            const totalScore = quizzes.filter(q => q.attempted).reduce((acc, q) => acc + (q.score || 0), 0);
            avgScore = Math.round(totalScore / completed);
        }

        if($('stat-total')) $('stat-total').textContent = total;
        if($('stat-completed')) $('stat-completed').textContent = completed;
        if($('stat-remaining')) $('stat-remaining').textContent = remaining;
        if($('stat-average')) $('stat-average').textContent = completed > 0 ? `${avgScore}%` : '-';
    };

    function renderQuizzes(list) {
        const container = $('onlineQuizzesContainer');
        const emptyState = $('empty-state');
        if (!container) return;

        // تحديث البيانات الخام في الـ state للاستخدام وقت الفلترة
        if (list) {
            state.rawQuizzes = list.slice().reverse();
        }
        
        const workingList = state.rawQuizzes;

        // تجهيز البيانات بإضافة حالة (مكتمل / النتيجة)
        const processedQuizzes = workingList.map(quiz => {
            const result = quiz.results ? quiz.results.find(r => r.email === state.user.email) : null;
            return {
                ...quiz,
                attempted: !!result,
                score: result ? result.percentage : 0,
                attempts: result ? 1 : 0, 
                questionsCount: quiz.questions ? quiz.questions.length : 0,
                duration: quiz.duration || 15
            };
        });

        // الـ Hash بيحمي من الـ Re-render لو مفيش تغيير في البيانات أو الفلتر
        const h = hash(processedQuizzes.map(q => [q.id, q.attempted, q.score, state.currentQuizFilter]));
        if (h === state.quizzesHash) return;
        state.quizzesHash = h;

        // تحديث الإحصائيات بالبيانات الكلية (قبل الفلترة)
        updateQuizStats(processedQuizzes);

        // تطبيق الفلتر
        let filteredQuizzes = processedQuizzes;
        if (state.currentQuizFilter === 'new') {
            filteredQuizzes = processedQuizzes.filter(q => !q.attempted);
        } else if (state.currentQuizFilter === 'completed') {
            filteredQuizzes = processedQuizzes.filter(q => q.attempted);
        }

        // ترتيب: الجديدة أولاً ثم المكتملة
        filteredQuizzes.sort((a, b) => (a.attempted === b.attempted) ? 0 : a.attempted ? 1 : -1);

        // عرض الـ Empty State لو مفيش نتايج للفلتر
        if (filteredQuizzes.length === 0) {
            container.innerHTML = '';
            if (emptyState) {
                emptyState.classList.remove('hidden');
                emptyState.classList.add('flex');
            }
            return;
        }

        // إخفاء الـ Empty State لو في بيانات
        if (emptyState) {
            emptyState.classList.add('hidden');
            emptyState.classList.remove('flex');
        }

        // بناء الـ HTML للكروت بناءً على الحالة
        const html = filteredQuizzes.map(quiz => {
            if (!quiz.attempted) {
                return `
                <div tabindex="0" role="button" aria-label="بدء اختبار ${escapeHTML(quiz.title)}" class="quiz-card animate-fade" style="animation-delay: ${Math.random() * 0.1}s;" data-id="${quiz.id}">
                    <div class="relative z-10">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-[11px] font-bold text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-[10px] tracking-wider">جديد</span>
                            <span class="text-xs text-gray-500">${quiz.duration} دقيقة</span>
                        </div>
                        <h3 class="text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">${escapeHTML(quiz.title || 'بدون عنوان')}</h3>
                        <p class="text-sm text-gray-400 flex items-center gap-1.5">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            ${quiz.questionsCount} سؤال
                        </p>
                    </div>
                    <div class="relative z-10 flex items-center justify-between mt-auto pt-5 border-t border-white/[0.03]">
                        <span class="text-sm font-medium text-gray-400">اضغط للبدء</span>
                        <div class="action-icon w-8 h-8 rounded-[10px] bg-white/5 flex items-center justify-center text-gray-400">
                            <svg class="w-4 h-4 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>
                </div>`;
            } else {
                return `
                <div tabindex="0" role="button" aria-label="عرض نتيجة اختبار ${escapeHTML(quiz.title)}" class="quiz-card completed-card animate-fade" style="animation-delay: ${Math.random() * 0.1}s;" data-id="${quiz.id}">
                    <div class="relative z-10 flex justify-between items-start mb-3">
                        <span class="text-[11px] font-bold text-white bg-white/10 px-2 py-1 rounded-[10px] tracking-wider">مكتمل</span>
                    </div>
                    <h3 class="relative z-10 text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">${escapeHTML(quiz.title || 'بدون عنوان')}</h3>
                    <div class="relative z-10 text-xs text-gray-500 space-y-1 mb-4">
                        ${quiz.attempts ? `<p>المحاولات: ${quiz.attempts}</p>` : ''}
                    </div>
                    <div class="relative z-10 mt-auto pt-4 border-t border-white/[0.03] flex items-end justify-between">
                        <span class="text-xs text-gray-400 mb-1">النتيجة النهائية</span>
                        <div class="text-3xl font-black ${quiz.score >= 50 ? 'text-yellow-400' : 'text-red-400'} leading-none">
                            ${quiz.score}%
                        </div>
                    </div>
                </div>`;
            }
        }).join('');

        container.innerHTML = html;
    }

    function renderPoints(list) {
        const container = $('pointsContainer');
        if (!container) return;
        const h = hash(list);
        if (h === state.pointsHash) return;
        state.pointsHash = h;
        if (!list.length) { container.innerHTML = '<p class="empty text-gray-500 py-10 text-center">لا توجد ملاحظات حالياً.</p>'; return; }
        container.innerHTML = `<ul class="fade-in-stagger flex flex-col gap-3">${list.map(p => `<li class="flex gap-3 text-slate-300 text-sm leading-relaxed"><span class="text-yellow-500 shrink-0">▸</span><span>${escapeHTML(p)}</span></li>`).join('')}</ul>`;
    }

    function renderQuestions(list) {
        const container = $('questionsContainer');
        if (!container) return;
        const h = hash(list);
        if (h === state.questionsHash) return;
        state.questionsHash = h;
        if (!list.length) { container.innerHTML = '<p class="empty text-gray-500 py-10 text-center">لا توجد أسئلة مقالية حالياً.</p>'; return; }
        container.innerHTML = `<div class="fade-in-stagger flex flex-col gap-4">${list.map((q, i) => `<article class="bg-black/30 border border-white/5 rounded-xl p-4"><h3 class="text-sm font-bold text-white mb-2 leading-relaxed"><span class="text-gray-500 ml-2">${i + 1}.</span>${escapeHTML(q.question)}</h3><p class="text-gray-400 text-xs leading-relaxed border-t border-white/5 pt-2 mt-0"><span class="text-yellow-500 font-bold ml-2">الإجابة:</span>${escapeHTML(q.hint)}</p></article>`).join('')}</div>`;
    }

    function renderScore(newPoints) {
        const el = $('studentPointsDisplay');
        if (!el || state.currentPoints === newPoints) return;
        const start = state.currentPoints === -1 ? 0 : state.currentPoints;
        animateNumber(el, start, newPoints, 1200);
        state.currentPoints = newPoints;
    }

    function init() {
        if (!authGate()) return;

        const firstName = state.user.name ? state.user.name.split(' ')[0] : 'طالب';
        if($('studentName')) $('studentName').textContent = firstName;
        if($('studentGrade')) $('studentGrade').textContent = state.user.grade || 'الصف غير محدد';

        player.init();
        fetchData(true);

        if (!state.pollTimer) {
            state.pollTimer = setInterval(() => fetchData(false), 10000);
        }

        // --- Event Listeners الخاصة بصفحة الاختبارات ---
        const quizContainer = $('onlineQuizzesContainer');
        if (quizContainer) {
            // Event Delegation لفتح الاختبار عند الضغط على الكارت
            quizContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.quiz-card');
                if (!card) return;
                const quizId = card.getAttribute('data-id');
                const quizData = state.rawQuizzes.find(q => String(q.id) === String(quizId));
                
                if (quizData && typeof QuizEngine !== 'undefined') {
                    QuizEngine.open(quizData);
                }
            });

            // دعم لوحة المفاتيح
            quizContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    const card = e.target.closest('.quiz-card');
                    if (card) { e.preventDefault(); card.click(); }
                }
            });
        }

        // أزرار الفلترة
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                state.currentQuizFilter = e.target.getAttribute('data-filter');
                state.quizzesHash = ''; // مسح الـ Hash لإجبار الكود على إعادة الرسم
                renderQuizzes(); // إعادة الرسم فورا بدون انتظار الـ Polling
            });
        });
    }

    window.DahihApp = {
        logout, 
        toggleFullscreen, 
        refresh: () => fetchData(true),
        getState: () => state,
        fetchWithTimeout: fetchWithTimeout
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
