/* ════════════════════════════════════════════════════════════
   منصة الدحيح | لوحة الطالب — JavaScript محسّن (إصدار الـ Premium)
   مع نظام كشف الأخطاء للجوال + دعم كامل لمشغل الفيديو
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
        video: null, poster: null, container: null, progress: null, progressBar: null,
        currentTimeEl: null, durationEl: null, speedBtn: null, muteBtn: null,
        playPauseBtn: null, volumeSlider: null, pipBtn: null, centerPlay: null,
        skipIndicator: null, skipText: null, titleEl: null, tapLeft: null, tapRight: null,

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
            this.playPauseBtn  = $('playPauseBtn');
            this.volumeSlider  = $('volumeSlider');
            this.pipBtn        = $('pipBtn');
            this.centerPlay    = $('centerPlay');
            this.skipIndicator = $('skipIndicator');
            this.skipText      = $('skipText');
            this.titleEl       = $('playingVideoTitle');
            this.tapLeft       = $('tapLeft');
            this.tapRight      = $('tapRight');

            if (!this.video) return; // توقف هنا إذا كنا في صفحة لا تحتوي على مشغل (مثل courses.html)

            const togglePlayHandler = () => this.togglePlay();
            this.video.addEventListener('click', togglePlayHandler);
            this.centerPlay.addEventListener('click', togglePlayHandler);
            if (this.playPauseBtn) this.playPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePlay(); });

            this.video.addEventListener('play',  () => this.onPlay());
            this.video.addEventListener('pause', () => this.onPause());
            this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.video.addEventListener('loadedmetadata', () => {
                this.durationEl.textContent = formatTime(this.video.duration);
            });
            this.video.addEventListener('error', () => this.onError());

            let lastTapLeft = 0, lastTapRight = 0;
            this.tapLeft.addEventListener('touchstart', (e) => {
                const now = Date.now();
                if (now - lastTapLeft < 300) { e.preventDefault(); this.skip(10, '+10 ثواني'); }
                lastTapLeft = now;
            });
            this.tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(10, '+10 ثواني'); });

            this.tapRight.addEventListener('touchstart', (e) => {
                const now = Date.now();
                if (now - lastTapRight < 300) { e.preventDefault(); this.skip(-10, '-10 ثواني'); }
                lastTapRight = now;
            });
            this.tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(-10, '-10 ثواني'); });

            if (this.speedBtn) {
                this.speedBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
                    this.video.playbackRate = state.speeds[state.speedIndex];
                    this.speedBtn.textContent = state.speeds[state.speedIndex] + 'x';
                });
            }

            if (this.muteBtn) {
                this.muteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.video.muted = !this.video.muted;
                    if(this.volumeSlider) this.volumeSlider.value = this.video.muted ? 0 : this.video.volume;
                    this.updateMuteIcon();
                });
            }

            if (this.volumeSlider) {
                this.volumeSlider.addEventListener('input', (e) => {
                    e.stopPropagation();
                    this.video.volume = e.target.value;
                    this.video.muted = (e.target.value === '0');
                    this.updateMuteIcon();
                });
            }

            if (this.pipBtn) {
                this.pipBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (document.pictureInPictureElement) {
                            await document.exitPictureInPicture();
                        } else if (this.video !== document.pictureInPictureElement) {
                            await this.video.requestPictureInPicture();
                        }
                    } catch (err) { console.warn('PiP غير مدعوم', err); }
                });
            }

            if (this.progress) {
                this.progress.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!this.video.src) return;
                    const r = this.progress.getBoundingClientRect();
                    const isRTL = getComputedStyle(this.progress).direction === 'rtl';
                    let pos = (e.clientX - r.left) / r.width;
                    if (isRTL) pos = 1 - pos; 
                    
                    if (isFinite(this.video.duration)) {
                        this.video.currentTime = pos * this.video.duration;
                    }
                });
            }
        },

        load(msgId, title) {
            if (!this.video) return;

            if (String(state.currentMsgId) === String(msgId)) {
                this.togglePlay();
                return;
            }

            state.currentMsgId = String(msgId);
            if(this.titleEl) this.titleEl.textContent = title || 'جاري التحميل...';

            if(this.poster) this.poster.classList.add('is-hidden');
            this.video.style.display = 'block';
            this.container.classList.add('is-active');

            this.video.pause();
            
            const videoUrl = `/api/video/stream/${encodeURIComponent(msgId)}?token=${encodeURIComponent(state.token)}`;

            fetch(videoUrl, { headers: { 'Range': 'bytes=0-100' } })
                .then(async (response) => {
                    if (!response.ok) {
                        const errorText = await response.text();
                        alert(`🚨 السيرفر زعلان!\nكود الخطأ: ${response.status}\nرسالة السيرفر: ${errorText}\nرقم الـ ID المطلوب: ${msgId}`);
                        if(this.titleEl) this.titleEl.textContent = `خطأ ${response.status}: ${errorText}`;
                    }
                })
                .catch(err => {
                    alert(`🚨 مشكلة في الاتصال بالإنترنت أو السيرفر طافي:\n${err.message}`);
                });

            this.video.src = videoUrl;
            this.video.load();

            const playPromise = this.video.play();
            if (playPromise && playPromise.catch) {
                playPromise.catch(() => {
                    if(this.centerPlay) this.centerPlay.classList.add('is-visible');
                });
            }

            document.querySelectorAll('.card-course').forEach(c => c.classList.remove('is-active'));
            const card = $(`course_${msgId}`);
            if (card) card.classList.add('is-active');

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
            if(this.centerPlay) this.centerPlay.classList.remove('is-visible');
            this.video.classList.remove('is-paused');
            if(this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '<svg class="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            }
        },

        onPause() {
            if(this.centerPlay) this.centerPlay.classList.add('is-visible');
            this.video.classList.add('is-paused');
            if(this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '<svg class="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            }
        },

        onTimeUpdate() {
            if (!isFinite(this.video.duration)) return;
            const pct = (this.video.currentTime / this.video.duration) * 100;
            if(this.progressBar) this.progressBar.style.width = pct + '%';
            if(this.currentTimeEl) this.currentTimeEl.textContent = formatTime(this.video.currentTime);
        },

        onError() {
            const err = this.video.error;
            const code = err ? err.code : 0;
            const message = err ? err.message : 'بدون تفاصيل';
            
            const codes = {
                1: 'تم إيقاف تحميل الفيديو.',
                2: 'خطأ في الشبكة.',
                3: 'صيغة الفيديو غير مدعومة.',
                4: 'الفيديو غير متاح حالياً.'
            };
            const text = codes[code] || 'تعذّر تشغيل المحاضرة';
            if(this.titleEl) this.titleEl.textContent = text;
        },

        skip(seconds, label) {
            if (!this.video.src || !isFinite(this.video.duration)) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            if(this.skipText) this.skipText.textContent = label;
            if(this.skipIndicator) {
                this.skipIndicator.classList.remove('is-active');
                void this.skipIndicator.offsetWidth; 
                this.skipIndicator.classList.add('is-active');
            }
            haptic(35);
        },

        updateMuteIcon() {
            if(!this.muteBtn) return;
            this.muteBtn.innerHTML = this.video.muted || this.video.volume === 0
                ? '<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4"/></svg>'
                : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"/></svg>';
        }
    };

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
                if (res.status === 401 || res.status === 403) logout();
                return;
            }

            const data = await res.json();
            renderAll(data, initial);
        } catch (err) {
            console.warn('[Dahih] فشل جلب البيانات:', err.message);
        }
    }

    function renderAll(data, initial) {
        renderCourses(data.courses || data.content?.courses || [], initial);
        renderScore(parseInt(data.studentPoints || 0));
    }

    // 🔥 التعديل الجوهري هنا ليتطابق مع تصميم V4
    function renderCourses(list, initial) {
        const container = $('studentCoursesContainer');
        if (!container) return;

        const h = hash(list.map(c => [c.telegramMsgId, c.courseName, c.description]));
        if (h === state.coursesHash && !initial) return;
        state.coursesHash = h;

        if (!list.length) {
            container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500 loading"><p class="font-bold">لا توجد محاضرات متاحة حالياً.</p></div>';
            return;
        }

        const reversed = list.slice().reverse();
        
        // رسم الكروت بتصميم V4 الجديد
        const html = reversed.map((course, idx) => {
            const id = course.telegramMsgId;
            const num = list.length - idx;
            const isActive = String(state.currentMsgId) === String(id);
            const title = escapeHTML(course.courseName || 'محاضرة');
            const desc = escapeHTML(course.description || 'لا يوجد وصف');

            return `
                <article id="course_${id}" class="card-course ${isActive ? 'is-active' : ''}">
                    <div class="card-thumb">
                        <span class="thumb-badge ${isActive ? 'accent' : ''}">الدرس ${num}</span>
                        <div class="text-white/60 text-sm font-medium">محتوى المنهج</div>
                    </div>
                    <div class="card-body">
                        <h3 class="card-title">${title}</h3>
                        
                        <div class="meta-row">
                            <span class="meta-item"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> متاح للمشاهدة</span>
                        </div>
                        
                        <p class="text-xs text-muted mb-4 line-clamp-2">${desc}</p>
                        
                        <div class="card-footer mt-auto">
                            <button class="btn ${isActive ? 'btn-primary' : 'btn-ghost'} w-full course-play" data-msgid="${id}" data-title="${title}" type="button">
                                ${isActive ? 'استكمال المشاهدة' : 'بدء المحاضرة'}
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        container.innerHTML = html;

        container.querySelectorAll('.course-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const msgId = btn.dataset.msgid;
                const title = btn.dataset.title;
                
                // ميزة ذكية: إذا كنا في صفحة لا يوجد بها مشغل فيديو (مثل courses.html) 
                // نأخذ الطالب لصفحة index.html ونشغل له الفيديو تلقائياً
                if (!player.video) {
                    window.location.href = `../index.html?play=${msgId}`;
                } else {
                    player.load(msgId, title);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
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

        // ميزة إضافية: إذا جاء من صفحة أخرى وكان الرابط فيه id للفيديو (play=...)
        const urlParams = new URLSearchParams(window.location.search);
        const playId = urlParams.get('play');
        if (playId && player.video) {
            setTimeout(() => player.load(playId, 'جاري تهيئة المحاضرة...'), 300);
        }

        fetchData(true);

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

    window.DahihApp = {
        logout,
        toggleFullscreen,
        refresh: () => fetchData(false)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
