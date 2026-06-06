(function () {
    'use strict';

    if (window.__DAHIH_INITIALIZED__) return;
    window.__DAHIH_INITIALIZED__ = true;

    (function () {
        const cores = navigator.hardwareConcurrency || 2;
        const memory = navigator.deviceMemory || 1;
        const isTouch = navigator.maxTouchPoints > 0;
        let tier = 'high';
        if (cores <= 2 || memory <= 1) tier = 'low';
        else if (cores <= 4 || memory <= 3) tier = 'medium';
        if (isTouch && tier === 'high') tier = 'medium';
        if (tier !== 'high') document.documentElement.classList.add(`perf-${tier}`);
    })();

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
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        perfTier: document.documentElement.classList.contains('perf-low') ? 'low' : document.documentElement.classList.contains('perf-medium') ? 'medium' : 'high'
    };

    const poller = { timer: null };
    const $ = (id) => document.getElementById(id);

    const showToast = (message, type = 'info') => {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `premium-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
            </div>
            <div class="toast-progress-bar">
                <div class="toast-progress"></div>
            </div>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('active');
        });

        setTimeout(() => {
            toast.classList.remove('active');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            }, { once: true });
        }, 4000);
    };

    const escapeHTML = (str) => {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const fastHash = (list, keys = ['id']) => {
        if (!Array.isArray(list)) return String(list);
        return list.map(item => keys.map(k => String(item?.[k] ?? '')).join(':')).join('|');
    };

    const getSafeImageUrl = (url) => {
        const defaultImg = 'https://images.unsplash.com/photo-1632516643720-e7f5d7d6ecc9?q=80&w=600&auto=format&fit=crop';
        if (!url || typeof url !== 'string') return defaultImg;
        try {
            const parsed = new URL(url.trim(), location.origin);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
            if (parsed.origin === location.origin) return parsed.pathname;
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

    const initObservers = () => {
        if (!window.__REVEAL_OBSERVER__) {
            window.__REVEAL_OBSERVER__ = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        window.__REVEAL_OBSERVER__.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
        }
        
        document.querySelectorAll('.reveal:not(.revealed)').forEach(el => {
            window.__REVEAL_OBSERVER__.observe(el);
        });

        requestAnimationFrame(() => {
            document.querySelectorAll('img[loading="lazy"]:not(.lazy-load)').forEach(img => {
                img.classList.add('lazy-load');
                if (img.complete) {
                    img.classList.add('loaded');
                } else {
                    img.addEventListener('load', () => {
                        img.classList.add('loaded');
                    }, { once: true });
                }
            });
        });
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
            if (options.signal) options.signal.removeEventListener('abort', abortHandler);
        }
    }

    function updateActiveCourseCard(msgId) {
        document.querySelectorAll('.course-card-v4').forEach(c => {
            c.classList.remove('border-yellow-500/40', 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]');
            c.classList.add('border-white/10', 'shadow-lg');
            const btn = c.querySelector('.course-play button');
            if (btn) {
                btn.className = "w-full bg-white/5 text-white border border-white/10 font-bold py-2.5 rounded-lg transition-colors";
                btn.textContent = 'تشغيل المحاضرة';
            }
        });

        const card = $(`course_${msgId}`);
        if (card) {
            card.classList.remove('border-white/10', 'shadow-lg');
            card.classList.add('border-yellow-500/40', 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]');
            const btn = card.querySelector('.course-play button');
            if (btn) {
                btn.className = "w-full bg-yellow-500 text-black font-bold py-2.5 rounded-lg transition-colors";
                btn.textContent = 'استكمال المشاهدة';
            }
        }
    }

    const player = {
        video: null, poster: null, container: null, progress: null, progressBar: null,
        currentTimeEl: null, durationEl: null, speedBtn: null, muteBtn: null,
        centerPlay: null, skipIndicator: null, skipText: null, titleEl: null,
        tapLeft: null, tapRight: null, lastSentTime: -1, debounceTimer: null,
        lastProgressSave: 0,
        idleTimer: null,
        idleTimeout: 3000,

        init() {
            this.video = $('dahihPlayer');
            this.poster = $('videoPoster');
            this.container = $('videoContainer');
            this.progress = $('progressContainer');
            this.progressBar = $('progressBar');
            this.currentTimeEl = $('currentTimeDisplay');
            this.durationEl = $('durationDisplay');
            this.speedBtn = $('speedBtn');
            this.muteBtn = $('muteBtn');
            this.centerPlay = $('centerPlay');
            this.titleEl = $('playingVideoTitle');
            this.tapLeft = $('tapLeft');
            this.tapRight = $('tapRight');

            if (!this.video) return;

            const styleId = 'dahih-player-perf-boost';
            if (!$(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    #dahihPlayer { will-change: transform; transform: translateZ(0); }
                `;
                document.head.appendChild(style);
            }

            this.video.preload = 'metadata';
            this.video.crossOrigin = 'anonymous';
            this.video.playsInline = true;
            this.video.disablePictureInPicture = true;

            this.video.addEventListener('click', () => this.togglePlay());
            this.centerPlay.addEventListener('click', () => this.togglePlay());
            this.video.addEventListener('play', () => this.onPlay());
            this.video.addEventListener('pause', () => { this.onPause(); this.forceSaveProgress(); });
            this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.video.addEventListener('loadedmetadata', () => { this.durationEl.textContent = formatTime(this.video.duration); });
            this.video.addEventListener('error', () => this.onError());

            if (this.container) {
                const triggerActivity = () => this.resetIdleTimer();
                this.container.addEventListener('mousemove', triggerActivity);
                this.container.addEventListener('pointermove', triggerActivity);
                this.container.addEventListener('touchmove', triggerActivity, { passive: true });
                this.container.addEventListener('touchstart', triggerActivity, { passive: true });
                this.container.addEventListener('mouseleave', () => {
                    if (this.video && !this.video.paused) this.container.classList.add('is-idle');
                });
            }

            this.tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(-10, 'left'); });
            this.tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(10, 'right'); });

            const playPauseBtn = $('playPauseBtn');
            if (playPauseBtn) playPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePlay(); });

            this.speedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
                this.video.playbackRate = state.speeds[state.speedIndex];
                this.speedBtn.textContent = state.speeds[state.speedIndex] + 'x';
                this.resetIdleTimer();
            });

            this.muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.video.muted = !this.video.muted;
                this.updateMuteIcon();
                this.resetIdleTimer();
            });

            this.progress.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.video.src) return;
                const r = this.progress.getBoundingClientRect();
                const pos = (e.clientX - r.left) / r.width;
                if (isFinite(this.video.duration)) this.video.currentTime = pos * this.video.duration;
                this.resetIdleTimer();
            });
        },

        resetIdleTimer() {
            if (!this.container) return;
            if (this.container.classList.contains('is-idle')) {
                this.container.classList.remove('is-idle');
                if (this.video && isFinite(this.video.duration)) {
                    const pct = (this.video.currentTime / this.video.duration) * 100;
                    if (this.progressBar) this.progressBar.style.width = pct + '%';
                    if (this.currentTimeEl) this.currentTimeEl.textContent = formatTime(this.video.currentTime);
                }
            }
            clearTimeout(this.idleTimer);
            if (this.video && !this.video.paused) {
                this.idleTimer = setTimeout(() => this.container.classList.add('is-idle'), this.idleTimeout);
            }
        },

        async load(msgId, title) {
            if (!this.video) return;
            if (String(state.currentMsgId) === String(msgId)) {
                this.togglePlay();
                return;
            }

            state.currentMsgId = String(msgId);
            this.titleEl.textContent = title || 'جاري التحميل...';
            this.lastSentTime = -1;

            if (state.videoAbortController) state.videoAbortController.abort();
            state.videoAbortController = new AbortController();

            const currentReqId = ++state.videoRequestId;

            this.poster.classList.add('hidden', 'is-hidden');
            this.video.classList.remove('hidden');
            this.video.style.display = 'block';
            this.container.classList.add('is-active');

            this.video.pause();
            
            try {
                const videoUrl = `/api/student/video/stream/${encodeURIComponent(msgId)}?token=${encodeURIComponent(state.token)}`;

                const response = await fetchWithTimeout(videoUrl, { 
                    headers: { 'Range': 'bytes=0-100' },
                    signal: state.videoAbortController.signal
                }, 15000);

                if (!response.ok) throw new Error('فشل الوصول إلى مسار الفيديو');
                if (currentReqId !== state.videoRequestId) return;

                if (this.video.src !== videoUrl) {
                    this.video.src = videoUrl;
                    this.video.load();
                }

                const playPromise = this.video.play();
                if (playPromise && playPromise.catch) {
                    playPromise.catch(() => {
                        this.centerPlay.classList.add('is-visible');
                        this.centerPlay.style.opacity = "1";
                        this.centerPlay.style.transform = "scale(1)";
                        this.centerPlay.style.pointerEvents = "auto";
                    });
                }

                updateActiveCourseCard(msgId);
                this.container.scrollIntoView({ behavior: state.reduceMotion ? 'auto' : 'smooth', block: 'center' });
                this.resetIdleTimer();

            } catch (err) {
                if (err.name === 'AbortError' || currentReqId !== state.videoRequestId) return;
                showToast("🚨 تعذر جلب رابط الفيديو. يرجى المحاولة لاحقاً.", "error");
            }
        },

        togglePlay() {
            if (!this.video.src) return;
            if (this.video.paused) this.video.play().catch(() => {});
            else this.video.pause();
        },

        onPlay() {
            this.centerPlay.classList.remove('is-visible');
            this.centerPlay.style.opacity = "0";
            this.centerPlay.style.transform = "scale(1.5)";
            this.centerPlay.style.pointerEvents = "none";
            this.resetIdleTimer();
        },

        onPause() {
            this.centerPlay.classList.add('is-visible');
            this.centerPlay.style.opacity = "1";
            this.centerPlay.style.transform = "scale(1)";
            this.centerPlay.style.pointerEvents = "auto";
            if (this.container) this.container.classList.remove('is-idle');
            clearTimeout(this.idleTimer);
        },

        onTimeUpdate() {
            if (!isFinite(this.video.duration)) return;
            const isIdle = this.container && this.container.classList.contains('is-idle');
            if (!isIdle) {
                const pct = (this.video.currentTime / this.video.duration) * 100;
                if (this.progressBar) this.progressBar.style.width = pct + '%';
                if (this.currentTimeEl) this.currentTimeEl.textContent = formatTime(this.video.currentTime);
            }
            const currentSec = Math.floor(this.video.currentTime);
            if (currentSec > 0 && currentSec % 10 === 0 && this.lastSentTime !== currentSec) {
                this.lastSentTime = currentSec;
                this.saveProgressBackground();
            }
        },

        forceSaveProgress() {
            if (this.video && this.video.currentTime > 0) this.saveProgressBackground(true);
        },

        saveProgressBackground(force = false) {
            const now = Date.now();
            if (!force && now - this.lastProgressSave < 5000) return;
            this.lastProgressSave = now;
            fetch('/api/student/save-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify({ msgId: state.currentMsgId, currentTime: this.video.currentTime }),
                keepalive: true
            }).catch(() => {});
        },

        onError() {
            if(this.video.error) showToast("🚨 تعذر تشغيل الفيديو. يرجى التحقق من اتصالك بالإنترنت.", "error");
        },

        skip(seconds, side) {
            if (!this.video.src || !isFinite(this.video.duration)) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            const indicator = side === 'left' ? $('skipIndicatorLeft') : $('skipIndicatorRight');
            if (indicator) {
                indicator.classList.remove('is-active');
                void indicator.offsetWidth;
                indicator.classList.add('is-active');
            }
            haptic(35);
            this.resetIdleTimer();
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
                    if (screen.orientation && typeof screen.orientation.lock === 'function') screen.orientation.lock('landscape').catch(() => {});
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
        if (state.dashboardAbortController) state.dashboardAbortController.abort();
        state.dashboardAbortController = new AbortController();

        const container = $('studentCoursesContainer');
        if (initial && container) {
            container.innerHTML = `
                <div class="text-center py-16 text-gray-500 flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10 w-full">
                    <svg class="animate-spin h-10 w-10 text-yellow-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="font-bold text-lg text-gray-300"></p>
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
                if (res.status === 401 || res.status === 403) return logout();
                throw new Error(res.status);
            }

            const data = await res.json();
            const newDataHash = JSON.stringify(data.content || data);
            if (!initial && state.lastDataHash === newDataHash) return;
            state.lastDataHash = newDataHash;
            renderAll(data, initial);
        } catch (err) {
            if (err.name === 'AbortError') return;
            if (container && initial) {
                container.innerHTML = `
                    <div class="text-center py-16 text-red-400 bg-red-500/5 rounded-2xl border border-red-500/20 w-full">
                        <p class="font-bold text-xl mb-2"></p>
                        <button onclick="DahihApp.refresh()" class="mt-4 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 px-6 py-2 rounded-xl transition-colors font-bold">🔄</button>
                    </div>`;
            }
            showToast("⚠️", "error");
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

            const formattedQuizzes = quizzes.map(q => {
                const result = q.results ? q.results.find(r => r.email === state.user.email) : null;
                return { ...q, attempted: !!result, score: result ? result.percentage : 0 };
            });
            state.availableQuizzes = formattedQuizzes;

            setTimeout(() => {
                if (window.QuizApp && typeof window.QuizApp.init === 'function') {
                    window.QuizApp.init(formattedQuizzes);
                }
            }, 0);

            renderPoints(points);
            renderQuestions(questions);
            renderTestResults(data.content?.tests || []);
            renderScore(parseInt(data.studentPoints || 0));

            if (window.DahihExtras) {
                if (typeof window.DahihExtras.setRestricted === 'function') {
                    window.DahihExtras.setRestricted(!!data.restricted);
                }
                if (typeof window.DahihExtras.setUnread === 'function') {
                    window.DahihExtras.setUnread(Number(data.unreadMessages || 0));
                }
            }
        } catch(e) {}
    }

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
            container.innerHTML = '<div class="text-center py-16 text-gray-400 bg-white/5 rounded-2xl border border-white/10 w-full"></div>';
            return;
        }

        container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
        
        container.innerHTML = list.map((course, idx) => {
            const id = course.telegramMsgId;
            const num = idx + 1;
            const isActive = String(state.currentMsgId) === String(id);
            const title = escapeHTML(course.courseName || '');
            const safeImage = getSafeImageUrl(course.image);
            const lastWatchedHTML = course.lastWatched 
                ? `<div class="inline-flex items-center gap-2 text-[0.75rem] text-white bg-white/5 px-3 py-1.5 rounded-md mb-4 border border-white/10 w-fit"><span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>${course.lastWatched}</div>` 
                : '<div class="h-8 mb-4"></div>';

            return `
                <div class="premium-card course-card-v4 flex flex-col bg-white/5 border ${isActive ? 'border-yellow-500/40 shadow-[0_4px_20px_rgba(234,179,8,0.1)]' : 'border-white/10 shadow-lg'} rounded-xl overflow-hidden" id="course_${id}">
                    <div class="relative h-36 p-4 flex flex-col justify-between overflow-hidden">
                        <img loading="lazy" src="${safeImage}" class="absolute inset-0 w-full h-full object-cover z-0 filter brightness-50" alt="">
                        <div class="relative z-10 flex flex-col justify-between h-full">
                            <span class="self-start px-2.5 py-1 rounded-md text-[0.7rem] font-bold bg-black/50 backdrop-blur-sm border ${isActive ? 'border-yellow-500/40 text-yellow-500' : 'border-white/10 text-white'}">${num}</span>
                        </div>
                    </div>
                    <div class="p-5 flex flex-col flex-grow">
                        <h3 class="text-lg font-bold text-white mb-3 truncate" title="${title}">${title}</h3>
                        ${lastWatchedHTML}
                        <div class="mt-auto pt-4 border-t border-white/10 course-play cursor-pointer" data-msgid="${id}" data-title="${title}">
                            <button class="w-full ${isActive ? 'bg-yellow-500 text-black' : 'bg-white/5 text-white border border-white/10'} font-bold py-2.5 rounded-lg transition-colors">${isActive ? 'استكمال المشاهدة' : 'تشغيل المحاضرة'}</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        requestAnimationFrame(() => {
            container.querySelectorAll('.course-card-v4').forEach(card => card.classList.add('reveal'));
            initObservers();
            requestAnimationFrame(() => {
                container.querySelectorAll('.reveal').forEach(card => {
                    setTimeout(() => card.classList.add('revealed'), 50);
                });
            });
        });

        if (state.currentMsgId) updateActiveCourseCard(state.currentMsgId);
    }

    function renderPoints(list) {
        const container = $('pointsContainer');
        if (!container) return;
        const h = fastHash(list);
        if (h === state.pointsHash) return;
        state.pointsHash = h;
        container.innerHTML = !list.length ? '<p class="empty"></p>' : `<ul class="fade-in-stagger" style="list-style:none;padding:0;display:flex;flex-direction:column;gap:0.65rem;">${list.map(p => `<li style="color:#cbd5e1;font-size:0.9rem;">▸ ${escapeHTML(p)}</li>`).join('')}</ul>`;
    }

    function renderQuestions(list) {
        const container = $('questionsContainer');
        if (!container) return;
        const h = fastHash(list, ['question']);
        if (h === state.questionsHash) return;
        state.questionsHash = h;
        container.innerHTML = !list.length ? '<p class="empty"></p>' : `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${list.map((q, i) => `<article style="background:rgba(0,0,0,0.3);border:1px solid #333;border-radius:0.75rem;padding:1rem;"><h3 style="font-size:0.9rem;color:#fff;margin:0 0 0.5rem;">${i + 1}. ${escapeHTML(q.question)}</h3><p style="color:#aaa;font-size:0.85rem;margin:0;">${escapeHTML(q.hint)}</p></article>`).join('')}</div>`;
    }

    function renderTestResults(list) {
        const container = $('paperResultsContainer');
        if (!container) return;

        const h = fastHash(list, ['id']);
        if (h === state.testResultsHash) return;
        state.testResultsHash = h;

        const cards = [];
        list.slice().reverse().forEach(test => {
            const scores = Array.isArray(test.scores) ? test.scores : [];
            if (!scores.length) return;
            const maxScore = Number(test.maxScore) > 0 ? Number(test.maxScore) : null;
            const sorted = scores.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            const medals = ['bg-yellow-500 text-black', 'bg-gray-300 text-black', 'bg-orange-400 text-black'];

            const rows = sorted.map((s, i) => {
                const score = Number(s.score) || 0;
                const pct = maxScore ? Math.round((score / maxScore) * 100) : null;
                const rankClass = medals[i] || 'bg-white/10 text-gray-300';
                return `
                    <li class="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/5 transition-colors">
                        <span class="shrink-0 w-7 h-7 grid place-items-center rounded-lg text-xs font-bold ${rankClass}">${i + 1}</span>
                        <span class="flex-1 min-w-0 truncate text-white text-sm md:text-base">${escapeHTML(s.studentName || '—')}</span>
                        <span class="shrink-0 font-bold text-yellow-400">${score}${maxScore ? `<span class="text-xs text-gray-500">/${maxScore}</span>` : ''}</span>
                        ${pct != null ? `<span class="shrink-0 text-[0.7rem] text-gray-400 w-10 text-left">${pct}%</span>` : ''}
                    </li>`;
            }).join('');

            cards.push(`
                <article class="glass-panel rounded-2xl p-5 md:p-6 border-t-4 border-yellow-500 animate-fade flex flex-col gap-3">
                    <div class="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                        <h3 class="text-lg font-bold text-white leading-snug">${escapeHTML(test.testName || '')}</h3>
                        <span class="text-xs font-bold text-gray-300 bg-white/10 px-2.5 py-1 rounded-md shrink-0">${scores.length}</span>
                    </div>
                    <ul class="flex flex-col gap-0.5">${rows}</ul>
                </article>`);
        });

        if (!cards.length) {
            container.className = 'grid grid-cols-1 gap-5';
            container.innerHTML = `<div class="text-center py-16 text-gray-400 bg-white/5 rounded-2xl border border-white/10 w-full"></div>`;
            return;
        }

        container.className = 'grid grid-cols-1 lg:grid-cols-2 gap-5';
        container.innerHTML = cards.join('');
    }

    function renderScore(newPoints) {
        const el = $('studentPointsDisplay');
        if (!el || state.currentPoints === newPoints) return;
        animateNumber(el, Math.max(0, state.currentPoints), newPoints, 1200);
        state.currentPoints = newPoints;
    }

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

    function setupGlobalListeners() {
        let lastVisibilityFetch = 0;
        let isMoving = false;

        document.addEventListener('mousemove', (e) => {
            if (isMoving) return;
            isMoving = true;
            requestAnimationFrame(() => {
                document.querySelectorAll('.premium-card').forEach(card => {
                    const rect = card.getBoundingClientRect();
                    card.style.setProperty('--x', `${e.clientX - rect.left}px`);
                    card.style.setProperty('--y', `${e.clientY - rect.top}px`);
                });
                isMoving = false;
            });
        }, { passive: true });

        document.addEventListener('click', (e) => {
            const coursePlay = e.target.closest('.course-play');
            if (coursePlay) {
                if (typeof window.switchTab === 'function') window.switchTab('dashboard');
                player.load(coursePlay.dataset.msgid, coursePlay.dataset.title);
            }
        });

        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) {
                stopDashboardPolling();
                if (player.video && !player.video.paused) player.saveProgressBackground(true);
                return;
            }
            startDashboardPolling();
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
        const firstName = state.user.name ? state.user.name.split(' ')[0] : '';
        $('studentName').textContent = firstName;
        $('studentGrade').textContent = state.user.grade || '';

        player.init();
        setupGlobalListeners();
        
        fetchData(true).then(() => {
            if (!document.hidden) startDashboardPolling();
            setTimeout(initObservers, 500);
        });
    }

    Object.freeze(window.DahihApp = {
        logout,
        toggleFullscreen,
        refresh: () => fetchData(true),
        getState: () => state,
        fetchWithTimeout,
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
