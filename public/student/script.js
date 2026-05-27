(function () {
    'use strict';

    // منع تكرار تهيئة السكربت (SPA Protection)
    if (window.__DAHIH_INITIALIZED__) return;
    window.__DAHIH_INITIALIZED__ = true;

    const state = {
        user: null,
        token: null,
        currentMsgId: null,
        currentPoints: -1,
        coursesHash: '',
        quizzesHash: '',
        pointsHash: '',
        questionsHash: '',
        lastDataHash: null,
        availableQuizzes: [],
        speedIndex: 0,
        speeds: [1, 1.25, 1.5, 2],
        isTesting: false,
        dashboardAbortController: null,
        videoAbortController: null, 
        videoRequestId: 0, 
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };

    const poller = { timer: null };
    const $ = (id) => document.getElementById(id);

    // 🚀 [إصلاح]: منع Memory Leak في الـ Toast + تحسين الأداء
    const showToast = (message, type = 'info') => {
        let container = $('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'fixed bottom-5 left-5 z-[9999] flex flex-col gap-2 pointer-events-none';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const baseClass = 'pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-xl border font-bold text-sm shadow-2xl backdrop-blur-md translate-y-4 opacity-0 transition-all duration-300';
        const themes = {
            success: 'bg-green-500/10 border-green-500/20 text-green-400',
            error: 'bg-red-500/10 border-red-500/20 text-red-400',
            info: 'bg-blue-500/10 border-blue-500/20 text-blue-400'
        };

        toast.className = `${baseClass} ${themes[type] || themes.info}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-4', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-y-2', 'opacity-0');
            // استخدام ontransitionend أأمن من addEventListener لتجنب تسريب الذاكرة
            toast.ontransitionend = (e) => {
                if(e.propertyName === 'opacity') {
                    toast.remove();
                    toast.ontransitionend = null;
                }
            };
            // Fallback
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
        }, 4000);
    };

    const escapeHTML = (str) => {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    };

    // 🚀 [إصلاح]: استبدال JSON.stringify بـ Hash سريع جدًا لتوفير CPU/RAM
    const fastHash = (list, keys = ['id']) => {
        if (!Array.isArray(list)) return String(list);
        let hash = '';
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            for (let j = 0; j < keys.length; j++) {
                hash += (item?.[keys[j]] ?? '') + ':';
            }
            hash += '|';
        }
        return hash;
    };

    const generateGlobalHash = (data) => {
        const content = data.content || {};
        const courses = data.courses || content.courses || [];
        return [
            fastHash(courses, ['telegramMsgId', 'lastWatched']),
            fastHash(content.quizzes || [], ['id', 'updatedAt', 'score', 'attempted']),
            fastHash(content.points || [], ['length']),
            fastHash(content.questions || [], ['id', 'question']),
            data.studentPoints || 0
        ].join('#');
    };

    // 🚀 [إصلاح أمني]: Whitelist للصور
    const getSafeImageUrl = (url) => {
        const defaultImg = 'https://images.unsplash.com/photo-1632516643720-e7f5d7d6ecc9?q=80&w=600&auto=format&fit=crop';
        if (!url || typeof url !== 'string') return defaultImg;
        
        const allowedHosts = ['images.unsplash.com', location.host, 'i.ytimg.com', 'res.cloudinary.com'];
        try {
            const parsed = new URL(url.trim(), location.origin);
            if (allowedHosts.includes(parsed.hostname)) {
                return parsed.href;
            }
            return defaultImg;
        } catch {
            return defaultImg;
        }
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
            window.location.replace('/login.html');
            return false;
        }
        try {
            state.user = JSON.parse(userStr);
            state.token = token;
            return true;
        } catch (e) {
            window.location.replace('/login.html');
            return false;
        }
    }

    function logout() {
        if (player && player.video) {
            try {
                player.video.pause();
                player.video.removeAttribute('src');
                player.video.load();
            } catch (e) {}
        }
        localStorage.removeItem('dahih_user');
        localStorage.removeItem('dahih_token');
        window.location.replace('/login.html');
    }

    async function fetchWithTimeout(url, options = {}, timeout = 15000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const abortHandler = () => controller.abort();

        if (options.signal) {
            if (options.signal.aborted) {
                controller.abort();
            } else {
                options.signal.addEventListener('abort', abortHandler, { once: true });
            }
        }

        try {
            return await fetch(url, { ...options, signal: controller.signal, credentials: 'omit' });
        } finally {
            clearTimeout(timeoutId);
            if (options.signal) {
                options.signal.removeEventListener('abort', abortHandler);
            }
        }
    }

    function updateActiveCourseCard(msgId) {
        document.querySelectorAll('.course-card-v4').forEach(c => {
            c.classList.remove('border-yellow-500/40', 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]');
            c.classList.add('border-white/10', 'shadow-lg');
            const btn = c.querySelector('.course-play button');
            if (btn) {
                btn.className = "w-full bg-white/5 text-white border border-white/10 font-bold py-2.5 rounded-lg transition-colors pointer-events-none";
                btn.textContent = 'تشغيل المحاضرة';
            }
        });

        const card = $(`course_${msgId}`);
        if (card) {
            card.classList.remove('border-white/10', 'shadow-lg');
            card.classList.add('border-yellow-500/40', 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]');
            const btn = card.querySelector('.course-play button');
            if (btn) {
                btn.className = "w-full bg-yellow-500 text-black font-bold py-2.5 rounded-lg transition-colors pointer-events-none";
                btn.textContent = 'استكمال المشاهدة';
            }
        }
    }

    const player = {
        video: null, poster: null, container: null, progress: null, progressBar: null,
        currentTimeEl: null, durationEl: null, speedBtn: null, muteBtn: null,
        centerPlay: null, skipIndicator: null, skipText: null, titleEl: null,
        tapLeft: null, tapRight: null, lastSentTime: -1, currentVideoId: null,
        lastProgressSave: 0, playPromise: null,

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

            this.video.preload = 'metadata';
            this.video.crossOrigin = 'anonymous';
            this.video.playsInline = true;
            this.video.disablePictureInPicture = true;

            this.video.addEventListener('click', () => this.togglePlay());
            this.centerPlay.addEventListener('click', () => this.togglePlay());
            this.video.addEventListener('play',  () => this.onPlay());
            this.video.addEventListener('pause', () => { this.onPause(); this.forceSaveProgress(); });
            this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.video.addEventListener('loadedmetadata', () => { this.durationEl.textContent = formatTime(this.video.duration); });
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

        async load(msgId, title) {
            if (!this.video) return;
            if (String(state.currentMsgId) === String(msgId)) {
                this.togglePlay();
                return;
            }

            state.currentMsgId = String(msgId);
            this.titleEl.textContent = title || 'جاري التحميل...';

            if (state.videoAbortController) {
                state.videoAbortController.abort();
            }
            state.videoAbortController = new AbortController();

            const currentReqId = ++state.videoRequestId;

            this.poster.classList.add('hidden', 'is-hidden'); 
            this.video.classList.remove('hidden');
            this.video.style.display = 'block';
            this.container.classList.add('is-active');

            // 🚀 [إصلاح]: معالجة Race Condition بشكل صحيح قبل طلب الـ URL
            try {
                if (!this.video.paused && this.playPromise !== undefined) {
                    await this.playPromise;
                    this.video.pause();
                } else {
                    this.video.pause();
                }
            } catch (e) {}
            
            try {
                const access = await fetchWithTimeout('/api/student/video/access', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ msgId }),
                    signal: state.videoAbortController.signal
                }, 15000);

                if (!access.ok) throw new Error('Failed to fetch signed URL');
                
                const data = await access.json();

                if (currentReqId !== state.videoRequestId) return;

                // 🚀 [إصلاح]: الاعتماد على الـ ID وليس الـ URL لتجنب التحديث العشوائي
                if (this.currentVideoId !== msgId) {
                    this.currentVideoId = msgId;
                    this.lastSentTime = -1; // Reset tracking
                    this.video.src = data.signedUrl;
                    this.video.load();
                }

                this.playPromise = this.video.play();
                if (this.playPromise !== undefined) {
                    this.playPromise.catch(() => {
                        this.centerPlay.classList.add('is-visible');
                        this.centerPlay.style.opacity = "1";
                        this.centerPlay.style.transform = "scale(1)";
                        this.centerPlay.style.pointerEvents = "auto";
                    });
                }

                updateActiveCourseCard(msgId);
                this.container.scrollIntoView({ behavior: state.reduceMotion ? 'auto' : 'smooth', block: 'center' });

            } catch (err) {
                if (err.name === 'AbortError') return; 
                if (currentReqId !== state.videoRequestId) return; 
                console.error("Video Access Error:", err);
                showToast("🚨 تعذر جلب رابط الفيديو. يرجى المحاولة لاحقاً.", "error");
            }
        },

        togglePlay() {
            if (!this.video.src) return;
            if (this.video.paused) { 
                this.playPromise = this.video.play();
                if(this.playPromise !== undefined) this.playPromise.catch(() => {}); 
            } else { 
                this.video.pause(); 
            }
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
            // 🚀 [إصلاح]: التاكد من الحفظ بناءً على فارق الثواني بدل قسمة الموديولو لحل مشكلة تخطي الفريمات
            if (currentSec > 0 && Math.abs(currentSec - this.lastSentTime) >= 10) {
                this.lastSentTime = currentSec;
                this.saveProgressBackground();
            }
        },

        forceSaveProgress() {
            if (this.video && this.video.currentTime > 0) {
                this.saveProgressBackground(true);
            }
        },

        // 🚀 [إصلاح]: استخدام SendBeacon إذا كان force (أثناء إغلاق الصفحة)
        saveProgressBackground(force = false) {
            const now = Date.now();
            if (!force && now - this.lastProgressSave < 5000) return;
            this.lastProgressSave = now;

            const payload = { msgId: state.currentMsgId, currentTime: this.video.currentTime };

            if (force && navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon('/api/student/save-progress', blob);
                return;
            }

            fetch('/api/student/save-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify(payload),
                keepalive: force
            }).catch(() => {});
        },

        onError() {
            const err = this.video.error;
            if(err) {
                console.error(`Video Error: ${err.code} - ${err.message}`);
                showToast("🚨 تعذر تشغيل الفيديو. يرجى التحقق من اتصالك بالإنترنت.", "error");
            }
        },

        skip(seconds, label) {
            if (!this.video.src || !isFinite(this.video.duration)) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            this.skipText.textContent = label;
            this.skipIndicator.classList.remove('is-active');
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

    function toggleFullscreen() {
        const wrapper = $('fs-wrapper');
        if (!wrapper) return;
        if (!document.fullscreenElement) {
            const req = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
            if (req) {
                req.call(wrapper).then(() => {
                    if (screen.orientation && typeof screen.orientation.lock === 'function') { 
                        screen.orientation.lock('landscape').catch(() => {}); 
                    }
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
        if (state.isTesting) return; 

        if (state.dashboardAbortController) {
            state.dashboardAbortController.abort();
        }
        state.dashboardAbortController = new AbortController();

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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify({ email: state.user.email, grade: state.user.grade }),
                signal: state.dashboardAbortController.signal
            }, 15000);

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) { logout(); return; }
                throw new Error(`Error: ${res.status}`);
            }

            const data = await res.json();

            // 🚀 [إصلاح]: استخدام الـ Smart Hash بدل JSON.stringify
            const newDataHash = generateGlobalHash(data);
            if (!initial && state.lastDataHash === newDataHash) {
                return; 
            }
            state.lastDataHash = newDataHash;

            renderAll(data, initial);
            
        } catch (err) {
            if (err.name === 'AbortError') return; 
            if (container && initial) {
                container.innerHTML = `
                    <div class="text-center py-16 text-red-400 bg-red-500/5 rounded-2xl border border-red-500/20 w-full">
                        <p class="font-bold text-xl mb-2">فشل تحميل المحاضرات 😔</p>
                        <button onclick="DahihApp.refresh()" class="mt-4 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 px-6 py-2 rounded-xl transition-colors font-bold">🔄 أعد المحاولة</button>
                    </div>`;
            }
            showToast("⚠️ حدث خطأ أثناء الاتصال بالسيرفر لتحديث البيانات.", "error");
        }
    }

    function renderAll(data, initial) {
        try {
            const courses = data.courses || data.content?.courses || [];
            const quizzes = data.content?.quizzes || [];
            const points = data.content?.points || [];
            const questions = data.content?.questions || [];

            if (data.studentName) $('studentName').textContent = data.studentName;
            if (data.studentGrade) $('studentGrade').textContent = data.studentGrade;

            renderCourses(courses, initial);
            renderQuizzes(quizzes);

            if (window.QuizApp && typeof window.QuizApp.init === 'function') {
                window.QuizApp.init(quizzes);
            }

            renderPoints(points);
            renderQuestions(questions);
            renderScore(parseInt(data.studentPoints || 0));

        } catch(e) {
            console.error("Render Error:", e);
        }
    }

    // 🚀 [إصلاح]: منع بناء الـ HTML مجدداً بالكامل للـ DOM Diffing المبسط عبر Hash Container
    function renderCourses(list, initial) {
        const container = $('studentCoursesContainer');
        if (!container) return;
        
        const h = fastHash(list, ['telegramMsgId', 'lastWatched']);
        if (h === state.coursesHash && !initial) {
            if (state.currentMsgId) updateActiveCourseCard(state.currentMsgId);
            return;
        }
        state.coursesHash = h;

        if (list.length === 0) {
            container.className = "flex flex-col gap-8";
            container.innerHTML = '<div class="text-center py-16 text-gray-400 bg-white/5 rounded-2xl border border-white/10 w-full">لا توجد محاضرات متاحة حالياً.</div>';
            return;
        }

        container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
        
        // استخدام Fragment لتحسين الأداء
        const frag = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        
        wrapper.innerHTML = list.map((course, idx) => {
            const id = course.telegramMsgId;
            const num = idx + 1;
            const isActive = String(state.currentMsgId) === String(id);
            const title = escapeHTML(course.courseName || 'محاضرة');
            const safeImage = getSafeImageUrl(course.image);
            const lastWatchedHTML = course.lastWatched 
                ? `<div class="inline-flex items-center gap-2 text-[0.75rem] text-white bg-white/5 px-3 py-1.5 rounded-md mb-4 border border-white/10 w-fit"><span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>آخر مشاهدة: الدقيقة ${course.lastWatched}</div>` 
                : '<div class="h-8 mb-4"></div>';

            return `
                <div class="flex flex-col bg-white/5 border ${isActive ? 'border-yellow-500/40 shadow-[0_4px_20px_rgba(234,179,8,0.1)]' : 'border-white/10 shadow-lg'} rounded-xl overflow-hidden hover:-translate-y-1 transition-all duration-300 course-card-v4" id="course_${id}">
                    <div class="relative h-36 p-4 flex flex-col justify-between overflow-hidden">
                        <img src="${safeImage}" loading="lazy" class="absolute inset-0 w-full h-full object-cover z-0 filter brightness-50" alt="غلاف الكورس">
                        <div class="relative z-10 flex flex-col justify-between h-full">
                            <span class="self-start px-2.5 py-1 rounded-md text-[0.7rem] font-bold bg-black/50 backdrop-blur-sm border ${isActive ? 'border-yellow-500/40 text-yellow-500' : 'border-white/10 text-white'}">الدرس ${num}</span>
                        </div>
                    </div>
                    <div class="p-5 flex flex-col flex-grow">
                        <h3 class="text-lg font-bold text-white mb-3 truncate" title="${title}">${title}</h3>
                        ${lastWatchedHTML}
                        <div class="mt-auto pt-4 border-t border-white/10 course-play cursor-pointer" data-msgid="${id}" data-title="${title}">
                            <div class="w-full text-center ${isActive ? 'bg-yellow-500 text-black' : 'bg-white/5 text-white border border-white/10'} font-bold py-2.5 rounded-lg transition-colors pointer-events-none">${isActive ? 'استكمال المشاهدة' : 'تشغيل المحاضرة'}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
        
        while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
        container.innerHTML = '';
        container.appendChild(frag);

        if (state.currentMsgId) updateActiveCourseCard(state.currentMsgId);
    }

    function renderQuizzes(list) {
        const container = $('onlineQuizzesContainer');
        if (!container) return;
        
        const h = fastHash(list, ['id', 'updatedAt', 'score']); // إدراج النتيجة ليتحدث تلقائياً
        if (h === state.quizzesHash) return;
        state.quizzesHash = h;
        state.availableQuizzes = list;

        if (!list.length) {
            container.innerHTML = '<div id="empty-state" class="flex justify-center items-center py-10 w-full text-gray-500">لا توجد اختبارات متاحة حالياً.</div>';
            return;
        }

        const html = list.slice().reverse().map(quiz => {
            const result = quiz.results ? quiz.results.find(r => r.email === state.user.email) : null;
            const formattedQuiz = {
                ...quiz,
                attempted: !!result,
                score: result ? result.percentage : 0,
                attempts: result ? 1 : 0, 
                questionsCount: quiz.questions ? quiz.questions.length : 0,
                duration: quiz.duration || 15
            };
            return generateQuizCardHTML(formattedQuiz);
        }).join('');
        
        container.innerHTML = `<div class="fade-in-stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">${html}</div>`;
    }

    function renderPoints(list) {
        const container = $('pointsContainer');
        if (!container) return;
        const h = fastHash(list, ['length']);
        if (h === state.pointsHash) return;
        state.pointsHash = h;
        container.innerHTML = !list.length ? '<p class="empty">لا توجد ملاحظات.</p>' : `<ul class="fade-in-stagger" style="list-style:none;padding:0;display:flex;flex-direction:column;gap:0.65rem;">${list.map(p => `<li style="color:#cbd5e1;font-size:0.9rem;">▸ ${escapeHTML(p)}</li>`).join('')}</ul>`;
    }

    function renderQuestions(list) {
        const container = $('questionsContainer');
        if (!container) return;
        const h = fastHash(list, ['id', 'question']);
        if (h === state.questionsHash) return;
        state.questionsHash = h;
        container.innerHTML = !list.length ? '<p class="empty">لا توجد أسئلة.</p>' : `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${list.map((q, i) => `<article style="background:rgba(0,0,0,0.3);border:1px solid #333;border-radius:0.75rem;padding:1rem;"><h3 style="font-size:0.9rem;color:#fff;margin:0 0 0.5rem;">${i + 1}. ${escapeHTML(q.question)}</h3><p style="color:#aaa;font-size:0.85rem;margin:0;">الإجابة: ${escapeHTML(q.hint)}</p></article>`).join('')}</div>`;
    }

    function renderScore(newPoints) {
        const el = $('studentPointsDisplay');
        if (!el || state.currentPoints === newPoints) return;
        animateNumber(el, Math.max(0, state.currentPoints), newPoints, 1200);
        state.currentPoints = newPoints;
    }

    const generateQuizCardHTML = (quiz) => {
        const titleSafe = escapeHTML(quiz.title) || 'بدون عنوان';
        if (!quiz.attempted) {
            return `
            <div tabindex="0" role="button" aria-label="بدء اختبار: ${titleSafe}" class="quiz-card card-new animate-fade bg-white/5 border border-white/10 p-5 rounded-2xl hover:-translate-y-1 hover:border-blue-500/30 hover:shadow-lg transition-all duration-300 flex flex-col h-full cursor-pointer" data-id="${quiz.id}">
                <div class="flex-grow pointer-events-none">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-[11px] font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded-md tracking-wider">جديد</span>
                        <span class="text-xs text-gray-500">${quiz.duration || 0} دقيقة</span>
                    </div>
                    <h3 class="text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">${titleSafe}</h3>
                    <p class="text-sm text-gray-400 flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${quiz.questionsCount || 0} سؤال
                    </p>
                </div>
                <div class="flex items-center justify-between mt-auto pt-5 border-t border-white/5 pointer-events-none">
                    <span class="text-sm font-medium text-gray-400">اضغط للبدء</span>
                    <div class="action-icon w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-400">
                        <svg class="w-4 h-4 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
            </div>`;
        } else {
            return `
            <div tabindex="0" role="button" aria-label="عرض نتيجة اختبار: ${titleSafe}" class="quiz-card animate-fade bg-white/5 border border-white/10 border-r-4 border-r-green-500/80 p-5 rounded-2xl hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col h-full cursor-pointer" data-id="${quiz.id}">
                <div class="flex justify-between items-start mb-3 flex-grow pointer-events-none">
                    <div>
                        <span class="text-[11px] font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded-md tracking-wider mb-3 inline-block">مكتمل</span>
                        <h3 class="text-base font-semibold text-white mb-2 line-clamp-2 leading-snug">${titleSafe}</h3>
                    </div>
                </div>
                <div class="text-xs text-gray-500 space-y-1 mb-4 flex-grow pointer-events-none">
                    ${quiz.attempts ? `<p>المحاولات: ${quiz.attempts}</p>` : ''}
                </div>
                <div class="mt-auto pt-4 border-t border-white/5 flex items-end justify-between pointer-events-none">
                    <span class="text-xs text-gray-400 mb-1">النتيجة النهائية</span>
                    <div class="text-3xl font-black ${quiz.score >= 50 ? 'text-green-400' : 'text-red-400'} leading-none">
                        ${quiz.score || 0}%
                    </div>
                </div>
            </div>`;
        }
    };

    function startDashboardPolling() {
        if (poller.timer) return;
        poller.timer = setInterval(async () => {
            if (state.isTesting) return;
            await fetchData(false);
        }, 30000); 
    }

    function stopDashboardPolling() {
        if (poller.timer) {
            clearInterval(poller.timer);
            poller.timer = null;
        }
    }

    // 🚀 [إصلاح]: تحديد نطاق Delegation لتجنب الـ Bottleneck
    function setupDelegatedListeners() {
        const quizzesContainer = $('onlineQuizzesContainer');
        const coursesContainer = $('studentCoursesContainer');
        const tabsContainer = document.querySelector('.tabs-wrapper') || document.body;

        if (tabsContainer) {
            tabsContainer.addEventListener('click', (e) => {
                const filterBtn = e.target.closest('.filter-btn');
                if (filterBtn) {
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    filterBtn.classList.add('active');
                    const filter = filterBtn.getAttribute('data-filter');
                    const cards = document.querySelectorAll('.quiz-card');
                    cards.forEach(card => {
                        const isNew = card.classList.contains('card-new');
                        card.hidden = filter === 'all' ? false : (filter === 'new' ? !isNew : isNew);
                    });
                }
            });
        }

        if (quizzesContainer) {
            quizzesContainer.addEventListener('click', (e) => {
                const quizCard = e.target.closest('.quiz-card');
                if (quizCard) {
                    const quizId = quizCard.getAttribute('data-id');
                    const quiz = state.availableQuizzes.find(q => String(q.id) === String(quizId));
                    if (quiz && window.QuizEngine) window.QuizEngine.open(quiz);
                }
            });
            quizzesContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    const quizCard = e.target.closest('.quiz-card');
                    if (quizCard) { e.preventDefault(); quizCard.click(); }
                }
            });
        }

        if (coursesContainer) {
            coursesContainer.addEventListener('click', (e) => {
                const coursePlay = e.target.closest('.course-play');
                if (coursePlay) {
                    if (typeof window.switchTab === 'function') window.switchTab('dashboard');
                    player.load(coursePlay.dataset.msgid, coursePlay.dataset.title);
                }
            });
        }
    }

    function setupGlobalListeners() {
        setupDelegatedListeners();

        let lastVisibilityFetch = 0; 
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) {
                stopDashboardPolling();
                if (player.video && !player.video.paused) player.saveProgressBackground(true);
                return;
            }
            if(!state.isTesting) startDashboardPolling();
            const now = Date.now();
            if (now - lastVisibilityFetch > 15000) {
                lastVisibilityFetch = now;
                await fetchData(false);
            }
        });

        window.addEventListener('beforeunload', () => {
            if (state.dashboardAbortController) state.dashboardAbortController.abort();
            if (state.videoAbortController) state.videoAbortController.abort();
            player.forceSaveProgress();
        });
    }

    function init() {
        if (!authGate()) return;

        const firstName = state.user.name ? state.user.name.split(' ')[0] : 'طالب';
        $('studentName').textContent = firstName;
        $('studentGrade').textContent = state.user.grade || 'الصف غير محدد';

        player.init();
        setupGlobalListeners();
        
        fetchData(true).then(() => {
            if (!document.hidden && !state.isTesting) {
                startDashboardPolling();
            }
        });
    }

    Object.freeze(window.DahihApp = {
        logout, 
        toggleFullscreen, 
        refresh: () => fetchData(true),
        getState: () => state,
        fetchWithTimeout: fetchWithTimeout,
        toast: showToast,
        startDashboardPolling,
        stopDashboardPolling,
        setQuizState: (isTesting) => { 
            state.isTesting = isTesting; 
            if (isTesting) stopDashboardPolling();
            else startDashboardPolling();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
