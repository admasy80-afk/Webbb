// ════════════════════════════════════════════
// منصة الدحيح | مشغل الفيديو الاحترافي
// ════════════════════════════════════════════

const player = {
    video: null, poster: null, container: null, progress: null, progressBar: null,
    currentTimeEl: null, durationEl: null, speedBtn: null, muteBtn: null,
    centerPlay: null, skipIndicator: null, skipText: null, titleEl: null,
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
            if(this.durationEl) this.durationEl.textContent = formatTime(this.video.duration);
        });
        this.video.addEventListener('error', () => this.onError());

        if(this.tapLeft) this.tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(10, '+10 ثواني'); });
        if(this.tapRight) this.tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(-10, '-10 ثواني'); });

        if(this.speedBtn) {
            this.speedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
                this.video.playbackRate = state.speeds[state.speedIndex];
                this.speedBtn.textContent = state.speeds[state.speedIndex] + 'x';
            });
        }

        if(this.muteBtn) {
            this.muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.video.muted = !this.video.muted;
                this.updateMuteIcon();
            });
        }

        if(this.progress) {
            this.progress.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.video.src) return;
                const r = this.progress.getBoundingClientRect();
                const pos = (e.clientX - r.left) / r.width;
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
        this.lastSentTime = -1;

        this.poster.classList.add('hidden');
        this.video.classList.remove('hidden');
        this.video.style.display = 'block';
        this.container.classList.add('is-active');
        this.video.pause();
        
        const videoUrl = `/api/video/stream/${encodeURIComponent(msgId)}?token=${encodeURIComponent(state.token)}`;

        fetch(videoUrl, { headers: { 'Range': 'bytes=0-100' } })
            .then(async (response) => {
                if (!response.ok) {
                    const errorText = await response.text();
                    alert(`🚨 خطأ سيرفر الفيديو (${response.status}):\n${errorText}`);
                }
            })
            .catch(err => alert(`🚨 خطأ في شبكة البث الفيديوي:\n${err.message}`));

        this.video.src = videoUrl;
        this.video.load();

        const playPromise = this.video.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
                if(this.centerPlay) {
                    this.centerPlay.classList.add('is-visible');
                    this.centerPlay.style.opacity = "1";
                    this.centerPlay.style.transform = "scale(1)";
                    this.centerPlay.style.pointerEvents = "auto";
                }
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
        if(this.centerPlay) {
            this.centerPlay.classList.remove('is-visible');
            this.centerPlay.style.opacity = "0";
            this.centerPlay.style.transform = "scale(1.5)";
            this.centerPlay.style.pointerEvents = "none";
        }
    },

    onPause() {
        if(this.centerPlay) {
            this.centerPlay.classList.add('is-visible');
            this.centerPlay.style.opacity = "1";
            this.centerPlay.style.transform = "scale(1)";
            this.centerPlay.style.pointerEvents = "auto";
        }
    },

    onTimeUpdate() {
        if (!isFinite(this.video.duration)) return;
        const pct = (this.video.currentTime / this.video.duration) * 100;
        if(this.progressBar) this.progressBar.style.width = pct + '%';
        if(this.currentTimeEl) this.currentTimeEl.textContent = formatTime(this.video.currentTime);

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
        alert(`🚨 خطأ في مشغل الفيديو المتصفح:\nالكود: ${err ? err.code : 'مجهول'}\nالرسالة: ${err ? err.message : 'لا توجد تفاصيل'}`);
    },

    skip(seconds, label) {
        if (!this.video.src || !isFinite(this.video.duration)) return;
        this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
        if(this.skipText) this.skipText.textContent = label;
        if(this.skipIndicator) {
            this.skipIndicator.classList.remove('is-active');
            void this.skipIndicator.offsetWidth;
            this.skipIndicator.classList.add('is-active');
            haptic(35);
        }
    },

    updateMuteIcon() {
        if(!this.muteBtn) return;
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
