// ============================================================================
// منصة الدحيح التعليمية - لوحة تحكم الإدارة (Ultra Enhanced Enterprise Version)
// ============================================================================

// ==================== 1. نظام الإشعارات والنوافذ والاحتفال الذكي ====================
const SysUI = {
    init() {
        if(!document.getElementById('sys-toast-container')) {
            const tCont = document.createElement('div');
            tCont.id = 'sys-toast-container';
            tCont.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4';
            document.body.appendChild(tCont);
        }
        if(!document.getElementById('sys-modal-container')) {
            const mCont = document.createElement('div');
            mCont.id = 'sys-modal-container';
            mCont.className = 'fixed inset-0 z-[10000] hidden items-center justify-center pointer-events-none px-4';
            document.body.appendChild(mCont);
        }
    },
    toast(type, message) {
        this.init();
        const container = document.getElementById('sys-toast-container');
        const toast = document.createElement('div');
        
        let bgClass, iconHtml;
        if(type === 'success') {
            bgClass = 'bg-[#0f291e] border-green-500/50 text-green-100 shadow-[0_0_20px_rgba(34,197,94,0.2)]';
            iconHtml = `<svg class="w-7 h-7 text-green-400 shrink-0 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)] transition-transform duration-500 scale-0 animate-[toastIconPop_0.5s_ease-out_forwards]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        } else if(type === 'error') {
            bgClass = 'bg-[#3b0a0a] border-red-500/50 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.2)]';
            iconHtml = `<svg class="w-7 h-7 text-red-400 shrink-0 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] transition-transform duration-500 scale-0 animate-[toastIconShake_0.5s_ease-out_forwards]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        } else {
            bgClass = 'bg-[#422006] border-yellow-500/50 text-yellow-100 shadow-[0_0_20px_rgba(234,179,8,0.2)]';
            iconHtml = `<svg class="w-7 h-7 text-yellow-400 shrink-0 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)] transition-transform duration-500 scale-0 animate-[toastIconPop_0.5s_ease-out_forwards]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        }

        toast.className = `flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl border ${bgClass} backdrop-blur-xl transform -translate-y-10 opacity-0 transition-all duration-500 pointer-events-auto w-full`;
        toast.innerHTML = `${iconHtml} <span class="font-bold text-xs sm:text-sm tracking-wide drop-shadow-md">${message}</span>`;
        
        if(!document.getElementById('sys-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'sys-toast-styles';
            style.innerHTML = `
                @keyframes toastIconPop { 0% { transform: scale(0); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
                @keyframes toastIconShake { 0% { transform: scale(0); } 25% { transform: scale(1.2) rotate(-10deg); } 50% { transform: scale(1.2) rotate(10deg); } 75% { transform: scale(1.2) rotate(-10deg); } 100% { transform: scale(1) rotate(0); } }
            `;
            document.head.appendChild(style);
        }

        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.remove('-translate-y-10', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');
        });

        setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('-translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    },
    confirm(message, callback) {
        this.init();
        const container = document.getElementById('sys-modal-container');
        container.innerHTML = `
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 opacity-0" id="sys-modal-bg"></div>
            <div class="relative bg-gradient-to-b from-gray-900 to-black border border-white/10 p-5 sm:p-6 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] transform scale-95 opacity-0 transition-all duration-300 w-full max-w-sm mx-auto pointer-events-auto" id="sys-modal-box">
                <div class="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right gap-4 mb-6">
                    <div class="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                        <svg class="w-7 h-7 text-red-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </div>
                    <p class="text-white font-bold text-sm sm:text-base leading-relaxed mt-2 sm:mt-0">${message}</p>
                </div>
                <div class="flex flex-col sm:flex-row gap-3 justify-end">
                    <button id="sys-modal-cancel" class="px-5 py-3 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 transition-colors text-sm font-bold w-full sm:w-auto">إلغاء</button>
                    <button id="sys-modal-confirm" class="px-5 py-3 sm:py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 transition-colors text-sm font-bold shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] w-full sm:w-auto">تأكيد الحذف</button>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
        container.classList.add('flex');
        
        const bg = document.getElementById('sys-modal-bg');
        const box = document.getElementById('sys-modal-box');
        
        requestAnimationFrame(() => {
            bg.classList.remove('opacity-0');
            box.classList.remove('scale-95', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
        });

        const close = (res) => {
            bg.classList.add('opacity-0');
            box.classList.remove('scale-100', 'opacity-100');
            box.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                container.classList.add('hidden');
                container.classList.remove('flex');
                container.innerHTML = '';
                callback(res);
            }, 300);
        };

        document.getElementById('sys-modal-cancel').onclick = () => close(false);
        document.getElementById('sys-modal-confirm').onclick = () => close(true);
    },
    prompt(message, callback) {
        this.init();
        const container = document.getElementById('sys-modal-container');
        container.innerHTML = `
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 opacity-0" id="sys-modal-bg"></div>
            <div class="relative bg-gradient-to-b from-gray-900 to-black border border-white/10 p-5 sm:p-6 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] transform scale-95 opacity-0 transition-all duration-300 w-full max-w-sm mx-auto pointer-events-auto" id="sys-modal-box">
                <h3 class="text-white font-bold text-base sm:text-lg mb-4 flex items-center gap-3">
                    <svg class="w-6 h-6 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${message}
                </h3>
                <input type="text" id="sys-modal-input" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3.5 sm:py-3 text-white outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 transition-all mb-6 text-sm placeholder-gray-600" placeholder="اكتب هنا (اختياري)...">
                <div class="flex flex-col sm:flex-row gap-3 justify-end">
                    <button id="sys-modal-cancel" class="px-5 py-3 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 transition-colors text-sm font-bold w-full sm:w-auto">إلغاء</button>
                    <button id="sys-modal-submit" class="px-5 py-3 sm:py-2.5 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 border border-yellow-500/30 transition-colors text-sm font-bold w-full sm:w-auto">تأكيد التنفيذ</button>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
        container.classList.add('flex');
        
        const bg = document.getElementById('sys-modal-bg');
        const box = document.getElementById('sys-modal-box');
        const input = document.getElementById('sys-modal-input');
        
        requestAnimationFrame(() => {
            bg.classList.remove('opacity-0');
            box.classList.remove('scale-95', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
            input.focus();
        });

        const close = (isSubmit) => {
            const val = isSubmit ? input.value.trim() : null;
            bg.classList.add('opacity-0');
            box.classList.remove('scale-100', 'opacity-100');
            box.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                container.classList.add('hidden');
                container.classList.remove('flex');
                container.innerHTML = '';
                callback(val);
            }, 300);
        };

        document.getElementById('sys-modal-cancel').onclick = () => close(false);
        document.getElementById('sys-modal-submit').onclick = () => close(true);
        input.addEventListener('keypress', (e) => { if(e.key === 'Enter') close(true); });
    },
    
    confetti() {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 99999; overflow: hidden;';
        document.body.appendChild(wrap);
        
        const colors = ['#eab308', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#ffffff'];
        
        for (let i = 0; i < 60; i++) {
            const conf = document.createElement('div');
            conf.className = 'absolute rounded-sm shadow-md';
            conf.style.width = (Math.random() * 8 + 4) + 'px';
            conf.style.height = (Math.random() * 16 + 6) + 'px';
            conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            
            conf.style.left = (Math.random() * 100) + 'vw';
            conf.style.top = '-20px';
            
            wrap.appendChild(conf);
            
            const tx = (Math.random() - 0.5) * 150; 
            const ty = window.innerHeight + 50; 
            const rot = Math.random() * 720; 
            const duration = Math.random() * 2 + 2; 
            
            conf.animate([
                { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
                { transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`, opacity: 0.5 }
            ], {
                duration: duration * 1000,
                easing: 'cubic-bezier(.37,0,.63,1)',
                fill: 'forwards'
            });
        }
        
        setTimeout(() => wrap.remove(), 5000);
    }
};

// ==================== 2. نظام مسودة الطوارئ الذكي ====================
const DraftSystem = {
    save() {
        const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
        if(blocks.length === 0) return;
        
        const draftData = {
            title: document.getElementById('quizTitle').value,
            grade: document.getElementById('quizGrade').value,
            questions: []
        };
        
        blocks.forEach(block => {
            draftData.questions.push({
                q: block.querySelector('.mcq-q-text').value,
                opts: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correct: block.querySelector('.mcq-correct').value
            });
        });
        
        localStorage.setItem('dahih_quiz_draft', JSON.stringify(draftData));
        
        let saveIndicator = document.getElementById('save-indicator');
        if(!saveIndicator) {
            saveIndicator = document.createElement('div');
            saveIndicator.id = 'save-indicator';
            saveIndicator.className = 'fixed bottom-5 left-1/2 sm:left-5 -translate-x-1/2 sm:-translate-x-0 text-gray-500 text-xs flex items-center gap-2 transition-opacity duration-500 opacity-0 bg-black/90 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md z-40 shadow-lg';
            saveIndicator.innerHTML = `<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> تم الحفظ مسودة`;
            document.body.appendChild(saveIndicator);
        }
        saveIndicator.style.opacity = '1';
        clearTimeout(this.indicatorTimeout);
        this.indicatorTimeout = setTimeout(() => saveIndicator.style.opacity = '0', 2500);
    },
    
    check() {
        const saved = localStorage.getItem('dahih_quiz_draft');
        if(saved) {
            const data = JSON.parse(saved);
            if(data.questions.length > 0 && (data.questions[0].q !== '' || data.title !== '')) {
                SysUI.confirm('يوجد امتحان تم العمل عليه سابقاً ولم يُنشر، هل تريد استعادة المسودة؟', (yes) => {
                    if(yes) {
                        document.getElementById('quizTitle').value = data.title;
                        document.getElementById('quizGrade').value = data.grade;
                        document.getElementById('dynamicQuestionsContainer').innerHTML = ''; 
                        questionCounter = 0;
                        
                        data.questions.forEach(qData => {
                            addMCQBlock(); 
                            const lastBlock = document.getElementById('dynamicQuestionsContainer').lastElementChild;
                            lastBlock.querySelector('.mcq-q-text').value = qData.q;
                            lastBlock.querySelector('.mcq-opt-0').value = qData.opts[0];
                            lastBlock.querySelector('.mcq-opt-1').value = qData.opts[1];
                            lastBlock.querySelector('.mcq-opt-2').value = qData.opts[2];
                            lastBlock.querySelector('.mcq-opt-3').value = qData.opts[3];
                            lastBlock.querySelector('.mcq-correct').value = qData.correct;
                        });
                        SysUI.toast('success', 'تم استعادة المسودة بنجاح!');
                    } else {
                        localStorage.removeItem('dahih_quiz_draft'); 
                    }
                });
            }
        }
    }
};

// ==================== 3. الأساسيات والتهيئة ====================
const trashSVG = `<svg class="w-5 h-5 transition-transform duration-300 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

const userDataStr = localStorage.getItem('dahih_user');
let user = null;
let sessionToken = null;

if (!userDataStr) {
    window.location.href = "/logina.html";
} else {
    user = JSON.parse(userDataStr);
    sessionToken = user.token || localStorage.getItem('dahih_token') || ""; 
    if (user.role !== 'dev' && user.role !== 'owner') {
        window.location.href = "/dashboard.html";
    } else {
        const adminNameEl = document.getElementById('adminWelcomeName');
        if (adminNameEl) {
            adminNameEl.innerText = user.name || "إدارة";
            adminNameEl.classList.add('animate-pulse');
            setTimeout(() => adminNameEl.classList.remove('animate-pulse'), 2000);
        }
    }
}

let currentGradeData = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const activeTab = document.getElementById(`tab-${tabId}`);
    activeTab.classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');
    
    setTimeout(() => {
        activeTab.style.opacity = '1';
        activeTab.style.transform = 'translateY(0)';
    }, 50);

    if(tabId === 'requests') fetchPendingRequests();
    if(tabId === 'dashboard') fetchStats();
}

// ==================== 4. سكريبت البث المباشر ====================
const rawToken = "TmV68hFTctxYq"; 
const WS_URL = `wss://mohepfy10-d7e7.hf.space/?token=${encodeURIComponent(rawToken)}`; 

let streamSocket;
let mediaRecorder;
let localStream;
let isAudioMuted = false;
let isVideoHidden = false;

const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('localVideo');
const camOverlay = document.getElementById('camOverlay');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const streamStatusBadge = document.getElementById('streamStatusBadge');

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(err => SysUI.toast('error', `تعذر تكبير الشاشة: ${err.message}`));
    } else { document.exitFullscreen(); }
});

startStreamBtn.addEventListener('click', async () => {
    try {
        startStreamBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> جاري التجهيز...`;
        startStreamBtn.disabled = true;

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true
            });
        } catch (fallbackError) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        
        if (!localStream) throw new Error("الكاميرا غير متوفرة.");

        videoElement.srcObject = null;
        videoElement.srcObject = localStream;
        camOverlay.classList.add('hidden');
        
        videoElement.style.opacity = '0';
        videoElement.style.transition = 'opacity 0.5s ease';
        setTimeout(() => videoElement.style.opacity = '1', 100);

        if (streamSocket && streamSocket.readyState === WebSocket.OPEN) streamSocket.close();
        streamSocket = new WebSocket(WS_URL);

        streamSocket.onopen = async () => {
            streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-green-500 block pulse-live"></span> البث قيد التشغيل`;
            streamStatusBadge.className = "bg-green-900/30 border border-green-500/50 text-green-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors duration-300";
            
            startStreamBtn.classList.add('hidden');
            stopStreamBtn.classList.remove('hidden');
            startStreamBtn.innerHTML = `بدء البث`; 
            startStreamBtn.disabled = false;

            mediaRecorder = new MediaRecorder(localStream, {
                mimeType: 'video/webm; codecs=vp8,opus',
                videoBitsPerSecond: 2500000 
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0 && streamSocket.readyState === WebSocket.OPEN) {
                    streamSocket.send(event.data);
                }
            };
            mediaRecorder.start(1000);

            try {
                await fetch('/api/admin/toggle-stream', { 
                    method: 'POST', headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ role: user.role, sessionToken: sessionToken, isLive: true }) 
                });
            } catch (e) { console.warn("Stream toggle API silent fail", e); }
        };

        streamSocket.onclose = () => { stopLiveStream(true); SysUI.toast('warning', "انتهى الاتصال بالسيرفر."); };
        streamSocket.onerror = (e) => { console.error("WS Error:", e); stopLiveStream(true); };

    } catch (err) { 
        SysUI.toast('error', `خطأ: ${err.message}`); 
        startStreamBtn.innerHTML = `بدء البث`; 
        startStreamBtn.disabled = false;
        stopLiveStream(true); 
    }
});

toggleMicBtn.addEventListener('click', () => {
    if (localStream && localStream.getAudioTracks().length > 0) {
        isAudioMuted = !isAudioMuted;
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        toggleMicBtn.className = isAudioMuted ? "bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-lg border border-red-500 transition-all duration-300 scale-95" : "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300 scale-100";
        toggleMicBtn.innerHTML = isAudioMuted ? 
            `<svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>` : 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    }
});

toggleCamBtn.addEventListener('click', () => {
    if (localStream && localStream.getVideoTracks().length > 0) {
        isVideoHidden = !isVideoHidden;
        localStream.getVideoTracks()[0].enabled = !isVideoHidden;
        toggleCamBtn.className = isVideoHidden ? "bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-lg border border-red-500 transition-all duration-300 scale-95" : "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300 scale-100";
        toggleCamBtn.innerHTML = isVideoHidden ? 
            `<svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>` : 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    }
});

async function stopLiveStream(forced = false) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (localStream) localStream.getTracks().forEach(track => {
        track.stop();
        videoElement.srcObject = null;
    });
    if (streamSocket && streamSocket.readyState === WebSocket.OPEN) streamSocket.close();
    if (document.fullscreenElement) document.exitFullscreen();
    
    startStreamBtn.classList.remove('hidden');
    stopStreamBtn.classList.add('hidden');
    
    camOverlay.style.opacity = '0';
    camOverlay.classList.remove('hidden');
    setTimeout(() => camOverlay.style.opacity = '1', 50);
    
    streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-gray-500 block"></span> النظام في وضع الاستعداد`;
    streamStatusBadge.className = "bg-gray-800 border border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors duration-300";
    
    isAudioMuted = false;
    isVideoHidden = false;
    toggleMicBtn.className = "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300";
    toggleMicBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    toggleCamBtn.className = "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300";
    toggleCamBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    
    try {
        await fetch('/api/admin/toggle-stream', { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, isLive: false }) 
        });
    } catch (e) { console.warn("API stop stream failed silently", e); }
}

// ==================== 5. الإحصائيات وإدارة الطلاب ====================
async function fetchStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        const data = await res.json();
        
        animateValue("stats-students", parseInt(document.getElementById('stats-students').innerText) || 0, data.studentsCount || 0, 1000);
        animateValue("stats-pending", parseInt(document.getElementById('stats-pending').innerText) || 0, data.pendingCount || 0, 1000);
    } catch (err) {}
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) { window.requestAnimationFrame(step); }
    };
    window.requestAnimationFrame(step);
}

async function fetchPendingRequests() {
    const container = document.getElementById('pendingRequestsContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 animate-pulse">جاري جلب الطلبات الأساسية...</p>';
    try {
        const res = await fetch('/api/admin/pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        const students = await res.json();
        if (students.length === 0) { 
            container.innerHTML = '<p class="text-gray-500 text-center mt-10 transition-opacity duration-500 opacity-0" id="emptyReqMsg">لا توجد طلبات جديدة حالياً.</p>'; 
            setTimeout(() => document.getElementById('emptyReqMsg').style.opacity = '1', 50);
            return; 
        }
        
        let html = '';
        students.forEach((st, index) => {
            const fullName = `${st.first_name} ${st.second_name} ${st.third_name} ${st.last_name}`;
            html += `<div id="req-${st.email}" class="glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.08}s;">
                <div class="text-center md:text-right">
                    <h4 class="font-bold text-white">${fullName}</h4>
                    <p class="text-xs text-gray-400 mt-1">${st.email} | ${st.grade}</p>
                </div>
                <div class="flex gap-2 w-full md:w-auto">
                    <button onclick="updateStudentStatus('${st.email}', 'accepted', '', this)" class="w-full md:w-auto bg-green-500/10 text-green-400 px-4 py-2.5 md:py-2 rounded-lg text-sm font-bold hover:bg-green-500/20 transition-all active:scale-95">قبول</button>
                    <button onclick="rejectStudent('${st.email}', this)" class="w-full md:w-auto bg-red-500/10 text-red-400 px-4 py-2.5 md:py-2 rounded-lg text-sm font-bold hover:bg-red-500/20 transition-all active:scale-95">رفض</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { 
        container.innerHTML = '<p class="text-red-500 text-center">خطأ أساسي في الاتصال.</p>'; 
        SysUI.toast('error', 'خطأ أساسي في الاتصال.');
    }
}

async function updateStudentStatus(email, newStatus, reason = '', btnElement = null) {
    if(btnElement) {
        const row = btnElement.closest('.glass-panel');
        row.style.transition = "all 0.4s ease";
        row.style.opacity = "0";
        row.style.transform = "translateX(20px)";
    }
    
    try {
        const res = await fetch('/api/admin/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: user.role, sessionToken: sessionToken, studentEmail: email, newStatus, reason }) });
        if(res.ok) {
            SysUI.toast('success', newStatus === 'accepted' ? 'تم قبول الطالب بنجاح' : 'تم رفض الطالب');
            if(newStatus === 'accepted') SysUI.confetti();
        }
    } catch(e) {
        SysUI.toast('error', 'حدث خطأ أثناء تحديث الحالة');
    }
    
    setTimeout(() => {
        fetchPendingRequests(); 
        fetchStats();
    }, btnElement ? 300 : 0);
}

function rejectStudent(email, btnElement) { 
    SysUI.prompt("سبب الرفض الأساسي (يظهر للطالب):", (reason) => {
        if (reason !== null) {
            updateStudentStatus(email, 'rejected', reason, btnElement); 
        }
    });
}

async function fetchStudentsByGrade() {
    const grade = document.getElementById('listGradeSelect').value;
    const container = document.getElementById('studentsListContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 col-span-full animate-pulse">جاري تحميل قائمة الطلاب...</p>';
    try {
        const res = await fetch('/api/admin/students-by-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        const students = await res.json();
        if (students.length === 0) { 
            container.innerHTML = `<p class="text-gray-500 text-center py-10 col-span-full opacity-0 transition-opacity duration-500" id="emptyStMsg">لا يوجد طلاب مقبولين في هذه الدفعة.</p>`; 
            setTimeout(() => document.getElementById('emptyStMsg').style.opacity = '1', 50);
            return; 
        }
        let html = '';
        students.forEach((st, index) => {
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`;
            html += `<div class="bg-black/40 border border-white/5 rounded-xl p-4 flex justify-between items-center hover:border-yellow-500/30 transition-all animate-fade-in-up hover:-translate-y-1 hover:shadow-[0_4px_15px_rgba(234,179,8,0.1)]" style="animation-fill-mode: both; animation-delay: ${index * 0.05}s;">
                <div class="truncate">
                    <h4 class="font-bold text-white text-sm md:text-base truncate">${fullName}</h4>
                    <p class="text-[10px] text-gray-500 mt-1 truncate">${st.email}</p>
                </div>
                <div class="text-left shrink-0">
                    <p class="text-yellow-500 text-xs font-bold">${st.points || 0}%</p>
                    <p class="text-[10px] text-gray-400 truncate" dir="ltr">${st.phone || '-'}</p>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { 
        container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ في الاتصال.</p>'; 
        SysUI.toast('error', 'حدث خطأ في تحميل قائمة الطلاب.');
    }
}

// ==================== 6. إدارة المحتوى والنتائج ====================
async function fetchGradeContent() {
    const grade = document.getElementById('manageGradeSelect').value;
    const container = document.getElementById('manageContainer');
    const loading = document.getElementById('manageLoading');
    
    container.style.opacity = '0';
    setTimeout(() => container.classList.add('hidden'), 300);
    loading.classList.remove('hidden');
    
    try {
        const res = await fetch('/api/admin/get-grade-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        if (res.ok) {
            currentGradeData = await res.json();
            renderManageContent(grade);
            loading.classList.add('hidden');
            container.classList.remove('hidden');
            setTimeout(() => container.style.opacity = '1', 50);
        } else {
            SysUI.toast('error', "حدث خطأ في جلب المحتوى.");
            loading.classList.add('hidden');
        }
    } catch (err) { 
        SysUI.toast('error', "مشكلة في الاتصال."); 
        loading.classList.add('hidden');
    }
}

function renderManageContent(grade) {
    const data = currentGradeData;
    
    let htmlPubQZ = '';
    if (data.publicQuizzes && data.publicQuizzes.length > 0) {
        data.publicQuizzes.forEach((q, index) => {
            htmlPubQZ += `<div id="pubQz-${q.id}" class="bg-yellow-900/10 border border-yellow-500/20 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 group animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.06}s;">
                <div class="truncate w-full sm:w-auto"><p class="font-bold text-white text-base md:text-lg truncate">${q.title}</p><p class="text-xs text-yellow-300 mt-1">الردود: ${q.results ? q.results.length : 0} | عام (برابط)</p></div>
                <div class="flex gap-4 items-center shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                    <button onclick="showDetailedResults('${q.id}', true)" class="bg-yellow-600/20 text-yellow-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-600 hover:text-black transition-all active:scale-95 w-full sm:w-auto">النتائج</button>
                    <div onclick="deleteContent('${grade}', 'publicQuiz', '${q.id}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlPubQZ = '<p class="text-gray-500 text-sm py-4">لا توجد اختبارات عامة حالياً.</p>';
    document.getElementById('managePublicQuizzes').innerHTML = htmlPubQZ;

    let htmlQZ = '';
    if (data.quizzes && data.quizzes.length > 0) {
        data.quizzes.forEach((q, index) => {
            htmlQZ += `<div id="qz-${q.id}" class="bg-black/30 border border-white/5 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 group animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.06}s;">
                <div class="truncate w-full sm:w-auto"><p class="font-bold text-white text-base md:text-lg truncate">${q.title}</p><p class="text-xs text-gray-500 mt-1">المجيبين: ${q.results ? q.results.length : 0}</p></div>
                <div class="flex gap-4 items-center shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                    <button onclick="showDetailedResults('${q.id}', false)" class="bg-white/10 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-black transition-all active:scale-95 w-full sm:w-auto">عرض النتائج</button>
                    <div onclick="deleteContent('${grade}', 'quiz', '${q.id}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlQZ = '<p class="text-gray-500 text-sm py-4">لا توجد اختبارات منصة أساسية حالياً.</p>';
    document.getElementById('manageQuizzes').innerHTML = htmlQZ;

    let htmlTS = '';
    if (data.tests && data.tests.length > 0) {
        data.tests.forEach((t, index) => {
            htmlTS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.04}s;"><p class="font-bold text-white truncate">${t.testName}</p><div onclick="deleteContent('${grade}', 'test', '${t.testName}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div></div>`;
        });
    } else htmlTS = '<p class="text-gray-500 text-sm py-2">لا توجد سجلات أساسية.</p>';
    document.getElementById('manageTests').innerHTML = htmlTS;

    let htmlQS = '';
    if (data.questions && data.questions.length > 0) {
        data.questions.forEach((q, index) => {
            htmlQS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4 animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.04}s;"><p class="text-white text-sm truncate">${q.question}</p><div onclick="deleteContent('${grade}', 'question', '${q.question}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div></div>`;
        });
    } else htmlQS = '<p class="text-gray-500 text-sm py-2">لا توجد أسئلة مقالية أساسية.</p>';
    document.getElementById('manageQuestions').innerHTML = htmlQS;

    let htmlPT = '';
    if (data.points && data.points.length > 0) {
        data.points.forEach((p, index) => {
            htmlPT += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4 animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.04}s;"><p class="text-gray-300 text-sm truncate">${p}</p><div onclick="deleteContent('${grade}', 'point', '${p}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div></div>`;
        });
    } else htmlPT = '<p class="text-gray-500 text-sm py-2">لا توجد نقاط أساسية.</p>';
    document.getElementById('managePoints').innerHTML = htmlPT;
}

function deleteContent(grade, itemType, identifier, trashIconElement = null) {
    SysUI.confirm("هل أنت متأكد من حذف هذا العنصر الأساسي نهائياً؟", async (confirmed) => {
        if(!confirmed) return;
        
        if(trashIconElement) {
            const row = trashIconElement.closest('div.flex.justify-between.items-center');
            if(row) {
                row.style.transition = "all 0.4s ease";
                row.style.opacity = "0";
                row.style.transform = "scale(0.95)";
            }
        }

        try {
            const res = await fetch('/api/admin/delete-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade, itemType, identifier })
            });
            if (res.ok) {
                SysUI.toast('success', "تم الحذف بنجاح");
                setTimeout(() => fetchGradeContent(), trashIconElement ? 400 : 0);
            } else {
                SysUI.toast('error', "خطأ أساسي في الحذف.");
                if(trashIconElement) fetchGradeContent(); 
            }
        } catch (err) { 
            SysUI.toast('error', "مشكلة في اتصال قاعدة البيانات."); 
            if(trashIconElement) fetchGradeContent();
        }
    });
}

function showDetailedResults(quizId, isPublic) {
    const arrayToSearch = isPublic ? currentGradeData.publicQuizzes : currentGradeData.quizzes;
    if (!arrayToSearch) return;

    const quiz = arrayToSearch.find(q => q.id === quizId);
    if(!quiz) return;

    document.getElementById('resultsModalTitle').innerText = quiz.title + (isPublic ? " (عام)" : " (منصة أساسية)");
    const container = document.getElementById('resultsModalContent');
    
    if(!quiz.results || quiz.results.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-10">لم يقم أحد بحل هذا الاختبار بعد.</p>';
    } else {
        let html = '';
        
        quiz.results.sort((a,b) => b.percentage - a.percentage).forEach((res, index) => {
            let color = res.percentage >= 85 ? 'text-green-400' : (res.percentage >= 50 ? 'text-blue-400' : 'text-red-400');
            let borderColor = res.percentage >= 50 ? 'border-gray-700' : 'border-red-900/30';
            
            html += `
            <div class="bg-black/40 rounded-xl border ${borderColor} mb-3 overflow-hidden animate-fade-in-up transition-all hover:bg-black/60" style="animation-fill-mode: both; animation-delay: ${index * 0.05}s;">
                <div class="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer hover:bg-white/5 transition-colors gap-4" onclick="toggleStudentDetails('detail-${index}')">
                    <div class="flex items-center gap-4 w-full sm:w-auto truncate">
                        <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-white shrink-0 shadow-inner">${index + 1}</div>
                        <div class="truncate">
                            <p class="font-bold text-white text-sm md:text-base truncate">${res.studentName || 'طالب غير معروف'}</p>
                            <p class="text-xs text-gray-500 mt-1 truncate">${res.email || ''} ${res.visitorId ? ' | <span class="text-yellow-500" title="بصمة الجهاز">تم التحقق</span>' : ''}</p>
                        </div>
                    </div>
                    <div class="text-left flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto shrink-0 border-t border-white/5 sm:border-none pt-2 sm:pt-0">
                        <div class="text-center">
                            <p class="font-black text-xl md:text-2xl ${color}">${res.percentage || 0}%</p>
                            <p class="text-[10px] text-gray-400">${res.score} / ${quiz.questions.length}</p>
                        </div>
                        <svg class="w-5 h-5 text-gray-500 transition-transform duration-300" id="icon-detail-${index}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                
                <div id="detail-${index}" class="student-details bg-black/60 px-3 sm:px-5 pb-5 max-h-0 overflow-hidden transition-all duration-500 ease-in-out opacity-0">
                    <h4 class="text-white font-bold text-sm mb-4 border-b border-white/10 pb-2 mt-2">مراجعة الإجابات:</h4>
                    <div class="space-y-4">`;

            if (res.userAnswers && res.userAnswers.length > 0) {
                quiz.questions.forEach((q, qIdx) => {
                    const sAns = res.userAnswers[qIdx];
                    const cAns = q.correctAnswer;
                    const isCorrect = sAns === cAns;
                    
                    html += `
                        <div class="bg-black/50 p-3 sm:p-4 rounded-xl border ${isCorrect ? 'border-green-500/20' : 'border-red-500/20'} transition-all hover:scale-[1.01]">
                            <p class="text-sm font-semibold text-gray-200 mb-3 leading-relaxed">${qIdx + 1}. ${q.questionText}</p>
                            <div class="space-y-2 text-xs md:text-sm">`;
                    
                    q.options.forEach((opt, optIdx) => {
                        let optStyle = "text-gray-500 transition-colors";
                        let optIcon = "○";
                        
                        if (optIdx === sAns && !isCorrect) {
                            optStyle = "text-red-400 font-bold bg-red-500/10 px-2 py-1.5 rounded border border-red-500/20";
                            optIcon = "❌";
                        } else if (optIdx === cAns) {
                            optStyle = "text-green-400 font-bold bg-green-500/10 px-2 py-1.5 rounded border border-green-500/20";
                            optIcon = "✅";
                        } else if (optIdx === sAns && isCorrect) {
                            optStyle = "text-green-400 font-bold bg-green-500/10 px-2 py-1.5 rounded border border-green-500/20";
                            optIcon = "✅ (إجابة الطالب)";
                        }

                        html += `<div class="${optStyle} flex items-center gap-2"><span class="w-5 flex-shrink-0 text-center text-base">${optIcon}</span> <span class="leading-relaxed break-words">${opt}</span></div>`;
                    });
                    
                    html += `</div></div>`;
                });
            } else {
                html += `<p class="text-xs text-gray-500 py-2">تفاصيل الإجابات غير متوفرة لهذا السجل.</p>`;
            }

            html += `</div></div></div>`; 
        });
        
        container.innerHTML = html;
    }
    
    const modal = document.getElementById('resultsModal');
    modal.classList.remove('hidden');
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '1';
    }, 10);
}

function toggleStudentDetails(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if(el) {
        if (el.style.maxHeight && el.style.maxHeight !== "0px") {
            el.style.maxHeight = "0px";
            el.style.opacity = "0";
            icon.style.transform = "rotate(0deg)";
        } else {
            el.style.maxHeight = el.scrollHeight + 100 + "px"; 
            el.style.opacity = "1";
            icon.style.transform = "rotate(180deg)";
        }
    }
}

function closeResultsModal() { 
    const modal = document.getElementById('resultsModal');
    modal.style.opacity = '0';
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function updateQuestionNumbers(container) {
    const blocks = container.querySelectorAll('.mcq-block .q-number, .public-mcq-block .q-number');
    blocks.forEach((span, index) => {
        span.innerText = index + 1;
        span.parentElement.parentElement.parentElement.classList.add('animate-pulse');
        setTimeout(() => span.parentElement.parentElement.parentElement.classList.remove('animate-pulse'), 500);
    });
}

// ==================== 7. إنشاء اختبار (المنصة الداخلي الأساسي) ====================
let questionCounter = 0;
function addMCQBlock() {
    questionCounter++;
    const container = document.getElementById('dynamicQuestionsContainer');
    const block = document.createElement('div');
    block.className = 'mcq-block glass-panel p-4 sm:p-6 rounded-2xl relative border-l-4 border-l-yellow-500 animate-fade-in-up transition-all hover:shadow-[0_0_15px_rgba(234,179,8,0.05)]';
    block.draggable = window.innerWidth > 768; 
    
    block.style.opacity = "0";
    block.style.transform = "translateY(10px)";
    block.style.transition = "all 0.4s ease";

    block.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 class="text-base sm:text-lg font-bold text-yellow-500 flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-500 cursor-grab active:cursor-grabbing hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                السؤال رقم <span class="q-number">${questionCounter}</span>
            </h3>
            <div onclick="removeBlock(this.parentElement.parentElement)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-1 sm:p-0">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 sm:py-3 text-white outline-none focus:border-yellow-500 transition-colors text-sm mb-4" rows="2" placeholder="اكتب نص السؤال الأساسي هنا (أو الصق السؤال بالاختيارات مباشرة)..." required></textarea>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-3 mb-4">
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الأول" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثاني" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثالث" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الرابع" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 sm:p-4 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap shrink-0">الإجابة الصحيحة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm py-1">
                <option value="0" class="bg-gray-900">أ</option>
                <option value="1" class="bg-gray-900">ب</option>
                <option value="2" class="bg-gray-900">ج</option>
                <option value="3" class="bg-gray-900">د</option>
            </select>
        </div>
    `;

    const questionTextarea = block.querySelector('.mcq-q-text');
    questionTextarea.addEventListener('paste', function(e) {
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        let lines = pasteText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if(lines.length >= 5) {
            e.preventDefault(); 
            this.value = lines[0]; 
            const currentBlock = this.closest('.mcq-block, .public-mcq-block');
            currentBlock.querySelector('.mcq-opt-0').value = lines[1].replace(/^[أ-د][.-]\s*/, ''); 
            currentBlock.querySelector('.mcq-opt-1').value = lines[2].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-2').value = lines[3].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-3').value = lines[4].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.classList.add('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
            setTimeout(() => currentBlock.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]'), 1000);
            SysUI.toast('success', 'تم التوزيع الذكي للسؤال والخيارات! 🪄');
            SysUI.confetti();
        }
    });

    if (window.innerWidth > 768) {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('opacity-40', 'border-dashed', 'scale-[0.98]');
            e.dataTransfer.effectAllowed = 'move';
            window.draggedBlock = this;
        });
        block.addEventListener('dragover', function(e) {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            if(window.draggedBlock !== this) this.classList.add('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('dragleave', function(e) {
            this.classList.remove('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-yellow-500', 'bg-white/5');
            if (window.draggedBlock && window.draggedBlock !== this) {
                const allBlocks = [...container.querySelectorAll('.mcq-block')];
                const draggedIndex = allBlocks.indexOf(window.draggedBlock);
                const droppedIndex = allBlocks.indexOf(this);
                if(draggedIndex < droppedIndex) this.parentNode.insertBefore(window.draggedBlock, this.nextSibling);
                else this.parentNode.insertBefore(window.draggedBlock, this);
                updateQuestionNumbers(container); 
            }
        });
        block.addEventListener('dragend', function(e) {
            this.classList.remove('opacity-40', 'border-dashed', 'scale-[0.98]');
            window.draggedBlock = null;
        });
    }

    container.appendChild(block);
    setTimeout(() => {
        block.style.opacity = "1";
        block.style.transform = "translateY(0)";
    }, 10);
}

function removeBlock(blockElement) {
    blockElement.style.opacity = "0";
    blockElement.style.transform = "scale(0.95)";
    setTimeout(() => {
        const container = blockElement.parentElement;
        blockElement.remove();
        updateQuestionNumbers(container);
    }, 400);
}

document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveQuizBtn');
    const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
    
    if(blocks.length === 0) { 
        SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!"); 
        return; 
    }
    
    btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2 align-middle"></span> جاري النشر...`; 
    btn.disabled = true;
    
    const questions = [];
    blocks.forEach(block => {
        questions.push({
            questionText: block.querySelector('.mcq-q-text').value,
            options: [
                block.querySelector('.mcq-opt-0').value,
                block.querySelector('.mcq-opt-1').value,
                block.querySelector('.mcq-opt-2').value,
                block.querySelector('.mcq-opt-3').value
            ],
            correctAnswer: parseInt(block.querySelector('.mcq-correct').value)
        });
    });
    
    try {
        const res = await fetch('/api/admin/add-mcq-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: document.getElementById('quizGrade').value, quizTitle: document.getElementById('quizTitle').value, questionsArray: questions })
        });
        if (res.ok) {
            SysUI.toast('success', "تم نشر الاختبار الداخلي بنجاح!");
            SysUI.confetti();
            document.getElementById('quizForm').reset();
            document.getElementById('dynamicQuestionsContainer').innerHTML = '';
            questionCounter = 0; addMCQBlock();
            localStorage.removeItem('dahih_quiz_draft'); 
        } else throw new Error();
    } catch (err) {
        SysUI.toast('error', "فشل أساسي في حفظ الاختبار.");
    } finally {
        btn.innerText = "نشر الاختبار للطلاب"; 
        btn.disabled = false;
    }
});


// ==================== 🔥 8. إنشاء الاختبار العام (برابط) 🔥 ====================
let publicQuestionCounter = 0;
function addPublicMCQBlock() {
    publicQuestionCounter++;
    const container = document.getElementById('dynamicPublicQuestionsContainer');
    const block = document.createElement('div');
    block.className = 'public-mcq-block glass-panel p-4 sm:p-6 rounded-2xl relative border-l-4 border-l-yellow-500 transition-all hover:shadow-[0_0_15px_rgba(234,179,8,0.05)]';
    block.draggable = window.innerWidth > 768;
    
    block.style.opacity = "0";
    block.style.transform = "translateY(10px)";
    block.style.transition = "all 0.4s ease";

    block.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 class="text-base sm:text-lg font-bold text-yellow-500 flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-500 cursor-grab active:cursor-grabbing hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                السؤال العام رقم <span class="q-number">${publicQuestionCounter}</span>
            </h3>
            <div onclick="removeBlock(this.parentElement.parentElement)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-1 sm:p-0">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 sm:py-3 text-white outline-none focus:border-yellow-500 transition-colors text-sm mb-4" rows="2" placeholder="اكتب نص السؤال العام هنا (أو الصق السؤال بالاختيارات مباشرة)..." required></textarea>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-3 mb-4">
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الأول العام" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثاني العام" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثالث العام" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الرابع العام" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 sm:p-4 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap shrink-0">الإجابة الصحيحة العامة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm py-1">
                <option value="0" class="bg-gray-900">أ</option>
                <option value="1" class="bg-gray-900">ب</option>
                <option value="2" class="bg-gray-900">ج</option>
                <option value="3" class="bg-gray-900">د</option>
            </select>
        </div>
    `;

    const questionTextarea = block.querySelector('.mcq-q-text');
    questionTextarea.addEventListener('paste', function(e) {
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        let lines = pasteText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if(lines.length >= 5) {
            e.preventDefault(); 
            this.value = lines[0]; 
            const currentBlock = this.closest('.mcq-block, .public-mcq-block');
            currentBlock.querySelector('.mcq-opt-0').value = lines[1].replace(/^[أ-د][.-]\s*/, ''); 
            currentBlock.querySelector('.mcq-opt-1').value = lines[2].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-2').value = lines[3].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-3').value = lines[4].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.classList.add('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
            setTimeout(() => currentBlock.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]'), 1000);
            SysUI.toast('success', 'تم التوزيع الذكي للسؤال والخيارات! 🪄');
            SysUI.confetti();
        }
    });

    if (window.innerWidth > 768) {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('opacity-40', 'border-dashed', 'scale-[0.98]');
            e.dataTransfer.effectAllowed = 'move';
            window.draggedBlock = this;
        });
        block.addEventListener('dragover', function(e) {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            if(window.draggedBlock !== this) this.classList.add('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('dragleave', function(e) {
            this.classList.remove('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-yellow-500', 'bg-white/5');
            if (window.draggedBlock && window.draggedBlock !== this) {
                const allBlocks = [...container.querySelectorAll('.public-mcq-block')];
                const draggedIndex = allBlocks.indexOf(window.draggedBlock);
                const droppedIndex = allBlocks.indexOf(this);
                if(draggedIndex < droppedIndex) this.parentNode.insertBefore(window.draggedBlock, this.nextSibling);
                else this.parentNode.insertBefore(window.draggedBlock, this);
                updateQuestionNumbers(container); 
            }
        });
        block.addEventListener('dragend', function(e) {
            this.classList.remove('opacity-40', 'border-dashed', 'scale-[0.98]');
            window.draggedBlock = null;
        });
    }

    container.appendChild(block);

    setTimeout(() => {
        block.style.opacity = "1";
        block.style.transform = "translateY(0)";
    }, 10);
}

document.getElementById('publicQuizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const blocks = document.querySelectorAll('#dynamicPublicQuestionsContainer .public-mcq-block');
    if(blocks.length === 0) { 
        SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!"); 
        return; 
    }
    
    const questions = [];
    blocks.forEach(block => {
        questions.push({
            questionText: block.querySelector('.mcq-q-text').value,
            options: [
                block.querySelector('.mcq-opt-0').value,
                block.querySelector('.mcq-opt-1').value,
                block.querySelector('.mcq-opt-2').value,
                block.querySelector('.mcq-opt-3').value
            ],
            correctAnswer: parseInt(block.querySelector('.mcq-correct').value)
        });
    });

    submitPublicQuiz(questions, false);
});

async function submitPublicQuiz(questionsSourceArray, isForced = false) {
    const btn = document.getElementById('savePublicQuizBtn');
    const linkArea = document.getElementById('publicQuizLinkArea');
    const linkInput = document.getElementById('publicQuizLinkInput');

    if(questionsSourceArray.length === 0) {
        if(!isForced) SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!");
        btn.disabled = false; btn.innerText = "حفظ وتوليد رابط الاختبار ";
        return; 
    }
    
    btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full mr-2 align-middle"></span> جاري الحفظ...`;
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/add-public-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role: user.role, sessionToken: sessionToken, 
                grade: isForced ? "الصف الثاني الثانوي" : (document.getElementById('publicQuizGrade').value || "عام"), 
                quizTitle: isForced ? "امتحان سريع" : document.getElementById('publicQuizTitle').value, 
                questionsArray: questionsSourceArray 
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const fullLink = `https://webbb-production-b681.up.railway.app/public-quiz.html?id=${data.quizId}`; 
            
            document.getElementById('publicQuizForm').reset();
            document.getElementById('dynamicPublicQuestionsContainer').innerHTML = '';
            publicQuestionCounter = 0; 
            if(!isForced) addPublicMCQBlock(); 

            linkInput.value = fullLink;
            
            linkArea.classList.remove('hidden');
            linkArea.classList.add('flex', 'flex-col', 'sm:flex-row'); // دعم تجاوب الجوال للصندوق
            linkArea.style.opacity = '0';
            linkArea.style.transform = 'translateY(10px)';
            setTimeout(() => {
                linkArea.style.transition = 'all 0.5s ease';
                linkArea.style.opacity = '1';
                linkArea.style.transform = 'translateY(0)';
            }, 50);
            
            SysUI.toast('success', "تم حفظ الاختبار بنجاح.");
            SysUI.confetti();
        } else throw new Error();
    } catch (err) {
        SysUI.toast('error', "فشل في حفظ الاختبار.");
    } finally {
        btn.innerText = "حفظ وتوليد رابط الاختبار العام "; 
        btn.disabled = false;
    }
}

// التحديث الجذري لدالة نسخ الرابط لتعمل بسلاسة على كل الأجهزة
async function copyPublicLink() {
    const input = document.getElementById('publicQuizLinkInput');
    if (!input || !input.value) return;
    
    // محاولة استخدام Clipboard API الحديث (مفضل للجوالات لتجنب الكيبورد)
    try {
        await navigator.clipboard.writeText(input.value);
        triggerCopyAnimation(input);
    } catch (err) {
        // Fallback للطوارئ
        input.select();
        input.setSelectionRange(0, 99999);
        try {
            document.execCommand('copy');
            triggerCopyAnimation(input);
        } catch (err2) {
            SysUI.toast('error', 'فشل النسخ التلقائي، يرجى النسخ يدوياً.');
        }
        // إزالة التحديد حتى لا يظل الكيبورد مفتوحاً
        window.getSelection().removeAllRanges();
    }
}

function triggerCopyAnimation(inputElement) {
    // جلب الزر الذي بجانب حقل الإدخال
    const btn = inputElement.nextElementSibling;
    if(!btn) return;

    const originalHTML = btn.innerHTML;
    const originalClasses = btn.className;
    
    // أنيميشن زر النسخ الناجح
    btn.innerHTML = `<span class="flex items-center justify-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> تم النسخ</span>`;
    btn.className = 'w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 py-3 sm:py-0 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(22,163,74,0.4)] whitespace-nowrap';
    
    SysUI.toast('success', "تم نسخ الرابط بنجاح.");
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.className = originalClasses;
    }, 2500);
}

// ==================== 9. المساعد الصوتي للإدارة 🎙️ ====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG'; 
    recognition.continuous = false; 
    recognition.interimResults = false;

    const micBtn = document.createElement('button');
    micBtn.className = 'fixed bottom-5 right-5 w-14 h-14 bg-yellow-600 hover:bg-yellow-500 rounded-full shadow-[0_0_20px_rgba(202,138,4,0.4)] flex items-center justify-center text-white transition-all z-50 hover:scale-110 active:scale-95 group border border-yellow-400/30';
    micBtn.innerHTML = `
        <svg class="w-6 h-6 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        <span class="absolute -top-10 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">المساعد الصوتي</span>
    `;
    document.body.appendChild(micBtn);

    let isListening = false;

    micBtn.onclick = () => {
        if(!isListening) {
            try { recognition.start(); } catch(e){}
        } else {
            recognition.stop();
        }
    };

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.replace('bg-yellow-600', 'bg-red-500'); 
        micBtn.classList.replace('hover:bg-yellow-500', 'hover:bg-red-400');
        micBtn.classList.replace('shadow-[0_0_20px_rgba(202,138,4,0.4)]', 'shadow-[0_0_20px_rgba(239,68,68,0.6)]');
        micBtn.classList.add('animate-bounce');
        SysUI.toast('warning', 'المنصة تسمعك الآن.. تكلم!');
    };

    recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase();

        if(command.includes('سؤال جديد') || command.includes('اضف سؤال') || command.includes('إضافة سؤال')) {
            if(document.getElementById('tab-create-quiz').classList.contains('active')) addMCQBlock();
            else if (document.getElementById('tab-create-public').classList.contains('active')) addPublicMCQBlock();
            SysUI.toast('success', 'حاضر، تم إضافة سؤال جديد.');
        } else if (command.includes('احفظ الامتحان') || command.includes('ارفع الامتحان') || command.includes('نشر')) {
            if(document.getElementById('tab-create-quiz').classList.contains('active')) {
                document.getElementById('saveQuizBtn').click();
            } else if (document.getElementById('tab-create-public').classList.contains('active')) {
                document.getElementById('savePublicQuizBtn').click();
            }
            SysUI.toast('success', 'جاري تنفيذ أمر الحفظ!');
        } else if (command.includes('افتح الطلبات') || command.includes('طلبات التسجيل')) {
            switchTab('requests');
            SysUI.toast('success', 'تم فتح قسم الطلبات.');
        } else {
            SysUI.toast('error', `لم أفهم الأمر: "${command}"`);
        }
    };

    recognition.onend = () => {
        isListening = false;
        micBtn.classList.replace('bg-red-500', 'bg-yellow-600');
        micBtn.classList.replace('hover:bg-red-400', 'hover:bg-yellow-500');
        micBtn.classList.replace('shadow-[0_0_20px_rgba(239,68,68,0.6)]', 'shadow-[0_0_20px_rgba(202,138,4,0.4)]');
        micBtn.classList.remove('animate-bounce');
    };
}

// ==================== 10. اختصارات الكيبورد (Hotkeys) ====================
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if(document.getElementById('tab-create-quiz').classList.contains('active')) {
            addMCQBlock();
            SysUI.toast('success', 'تم إضافة سؤال منصة جديد');
        } else if (document.getElementById('tab-create-public').classList.contains('active')) {
            addPublicMCQBlock();
            SysUI.toast('success', 'تم إضافة سؤال عام جديد');
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if(document.getElementById('tab-create-quiz').classList.contains('active')) {
            document.getElementById('quizForm').dispatchEvent(new Event('submit', { cancelable: true }));
        } else if (document.getElementById('tab-create-public').classList.contains('active')) {
            document.getElementById('publicQuizForm').dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }
});


// ==================== 11. الوظائف المشتركة والتهيئة النهائية ====================
function toggleContentFields() {
    const type = document.getElementById('contentType').value;
    const pointF = document.getElementById('pointField');
    const qFields = document.getElementById('questionFields');
    
    if(type !== 'point') {
        pointF.style.opacity = '0';
        setTimeout(() => {
            pointF.classList.add('hidden');
            qFields.classList.remove('hidden');
            qFields.style.opacity = '0';
            setTimeout(() => { qFields.style.transition = 'opacity 0.3s'; qFields.style.opacity = '1'; }, 50);
        }, 150);
    } else {
        qFields.style.opacity = '0';
        setTimeout(() => {
            qFields.classList.add('hidden');
            pointF.classList.remove('hidden');
            pointF.style.opacity = '0';
            setTimeout(() => { pointF.style.transition = 'opacity 0.3s'; pointF.style.opacity = '1'; }, 50);
        }, 150);
    }
}

function logout() { 
    document.body.style.transition = "opacity 0.5s ease";
    document.body.style.opacity = "0";
    setTimeout(() => {
        localStorage.removeItem('dahih_user'); 
        localStorage.removeItem('dahih_token'); 
        window.location.href = "/logina.html"; 
    }, 400);
}

document.getElementById('quizForm').addEventListener('input', () => DraftSystem.save());

document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('dynamicQuestionsContainer') && document.getElementById('dynamicQuestionsContainer').children.length === 0) addMCQBlock();
    if(document.getElementById('dynamicPublicQuestionsContainer') && document.getElementById('dynamicPublicQuestionsContainer').children.length === 0) addPublicMCQBlock();
    
    setTimeout(() => fetchStats(), 300);
    setTimeout(() => DraftSystem.check(), 1000); 
});

// ============================================================================
// 🔥 12. نظام الاستيراد الذكي للأسئلة (Smart Bulk Import) للاختبارات العامة 🔥
// ============================================================================

const SmartImportSystem = {
    init() {
        // البحث عن الحاوية أو وضع الزر في الفورم
        const btnContainer = document.getElementById('smart-import-btn-container');
        const formContainer = document.getElementById('publicQuizForm');
        
        if (!document.getElementById('smart-import-btn') && formContainer) {
            const importBtn = document.createElement('button');
            importBtn.id = 'smart-import-btn';
            importBtn.type = 'button';
            importBtn.className = 'w-full sm:w-auto bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-6 py-3.5 sm:py-2.5 rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 hover:-translate-y-1';
            importBtn.innerHTML = `
                <svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                كتابة سريع
            `;
            importBtn.onclick = () => this.showImportModal();
            
            if(btnContainer) {
                btnContainer.appendChild(importBtn);
            } else {
                 // إذا لم يجد الحاوية، يضعه فوق الأسئلة مباشرة
                const dynContainer = document.getElementById('dynamicPublicQuestionsContainer');
                if(dynContainer) dynContainer.parentNode.insertBefore(importBtn, dynContainer);
            }
        }

        // 2. تجهيز نافذة اللصق المنبثقة (Modal)
        if (!document.getElementById('smart-import-modal')) {
            const modalHTML = `
                <div id="smart-import-modal" class="fixed inset-0 z-[10000] hidden items-center justify-center pointer-events-none px-4">
                    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 opacity-0" id="smart-modal-bg"></div>
                    <div class="relative bg-gradient-to-b from-gray-900 to-black border border-green-500/30 p-5 sm:p-6 rounded-3xl shadow-[0_20px_50px_rgba(16,185,129,0.2)] transform scale-95 opacity-0 transition-all duration-300 w-full max-w-2xl mx-auto pointer-events-auto flex flex-col max-h-[90vh]" id="smart-modal-box">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-white font-bold text-lg flex items-center gap-2">
                                <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                لصق الأسئلة  (Smart Paste)
                            </h3>
                            <button id="smart-modal-close" class="text-gray-500 hover:text-red-500 transition-colors">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <p class="text-xs text-gray-400 mb-3 leading-relaxed">
                            قم بنسخ ولصق الأسئلة بالكامل هنا.
                        </p>
                        <textarea id="smart-import-textarea" class="w-full flex-grow min-h-[300px] bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-all mb-4 text-sm resize-none custom-scrollbar" placeholder=""></textarea>
                        <button id="smart-import-execute" class="w-full bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 px-5 py-3 rounded-xl transition-all text-sm font-bold shadow-[0_0_15px_rgba(22,163,74,0.2)] hover:shadow-[0_0_20px_rgba(22,163,74,0.4)]">
                          تحليل وإدراج الأسئلة
                        </button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            document.getElementById('smart-modal-close').onclick = () => this.closeModal();
            document.getElementById('smart-modal-bg').onclick = () => this.closeModal();
            document.getElementById('smart-import-execute').onclick = () => this.processImport();
        }
    },

    showImportModal() {
        const modal = document.getElementById('smart-import-modal');
        const bg = document.getElementById('smart-modal-bg');
        const box = document.getElementById('smart-modal-box');
        
        document.getElementById('smart-import-textarea').value = '';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        requestAnimationFrame(() => {
            bg.classList.remove('opacity-0');
            box.classList.remove('scale-95', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
            document.getElementById('smart-import-textarea').focus();
        });
    },

    closeModal() {
        const modal = document.getElementById('smart-import-modal');
        const bg = document.getElementById('smart-modal-bg');
        const box = document.getElementById('smart-modal-box');
        
        bg.classList.add('opacity-0');
        box.classList.remove('scale-100', 'opacity-100');
        box.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    },

    processImport() {
        const rawText = document.getElementById('smart-import-textarea').value;
        if (!rawText.trim()) {
            SysUI.toast('error', 'الحقل فارغ.');
            return;
        }

        const parsedQuestions = this.parseText(rawText);
        
        if (parsedQuestions.length === 0) {
            SysUI.toast('error', 'لم أتمكن من التعرف على أي أسئلة. تأكد من الصيغة.');
            return;
        }

        this.closeModal();
        this.animateInsertion(parsedQuestions);
    },

    parseText(text) {
        let parsed = [];
        let currentQ = { q: '', opts: [], correct: 0 };
        
        // تنظيف النص وتقسيمه لأسطر
        let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Regex للتعرف على الخيارات (أ-، أ.، (أ)، أ) وما شابهها
        const optRegex = /^(\(?[أ-د]\)?|[أ-د][.-])\s*(.*)/;

        lines.forEach(line => {
            const match = line.match(optRegex);

            if (match) {
                // هذا السطر عبارة عن خيار (إجابة)
                let optText = match[2];
                // البحث عن علامة الصح
                let isCorrect = optText.includes('✅') || optText.includes('صح');
                // إزالة العلامة من النص النهائي
                optText = optText.replace(/✅|صح/g, '').trim();

                currentQ.opts.push(optText);
                if (isCorrect) currentQ.correct = currentQ.opts.length - 1;
            } else {
                // هذا السطر عبارة عن نص سؤال أو عنوان
                if (currentQ.opts.length > 0) {
                    // إذا كان لدينا خيارات مسبقة، فهذا يعني أننا بدأنا سؤالاً جديداً
                    // احفظ السؤال القديم أولاً (إذا كان صالحاً)
                    if (currentQ.opts.length >= 2) {
                        // إزالة كلمات مثل س1: من بداية السؤال
                        currentQ.q = currentQ.q.replace(/^(س\d+[:.-]?|السؤال \d+[:.-]?)\s*/, '');
                        // إكمال الخيارات لـ 4 إذا كانت ناقصة
                        while(currentQ.opts.length < 4) currentQ.opts.push('');
                        parsed.push({...currentQ});
                    }
                    // تفريغ الكائن لسؤال جديد
                    currentQ = { q: line, opts: [], correct: 0 };
                } else {
                    // إضافة السطر لنص السؤال الحالي (ربما السؤال مكون من أكثر من سطر)
                    currentQ.q = currentQ.q ? currentQ.q + '\n' + line : line;
                }
            }
        });

        // حفظ آخر سؤال في اللوب
        if (currentQ.opts.length >= 2) {
            currentQ.q = currentQ.q.replace(/^(س\d+[:.-]?|السؤال \d+[:.-]?)\s*/, '');
            while(currentQ.opts.length < 4) currentQ.opts.push('');
            parsed.push({...currentQ});
        }

        return parsed;
    },

    async animateInsertion(questions) {
        SysUI.toast('success', `تم التعرف على ${questions.length} أسئلة! جاري الإدراج السحري...`);
        
        const container = document.getElementById('dynamicPublicQuestionsContainer');
        
        // تنظيف أي بلوك فارغ موجود مسبقاً
        const existingBlocks = container.querySelectorAll('.public-mcq-block');
        if (existingBlocks.length === 1) {
            const firstQInput = existingBlocks[0].querySelector('.mcq-q-text');
            if (!firstQInput.value.trim()) {
                existingBlocks[0].remove();
                publicQuestionCounter = 0; // متوافق مع متغيرك في الكود الأصلي
            }
        }

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

        // إدراج الأسئلة بالترتيب مع تأثيرات بصرية
        for (let i = 0; i < questions.length; i++) {
            const pq = questions[i];
            
            // استدعاء دالة الإضافة الخاصة بك
            addPublicMCQBlock(); 
            
            // جلب البلوك الذي تم إضافته للتو
            const blocks = container.querySelectorAll('.public-mcq-block');
            const targetBlock = blocks[blocks.length - 1];
            
            // التأكد أن البلوك ظهر
            await sleep(100);

            // إنشاء تأثير الماسح الضوئي الأخضر (Scanner) من اليمين لليسار بتنعيم فائق
            const scanner = document.createElement('div');
            scanner.className = 'absolute top-0 right-0 h-full w-2 bg-green-500/50 shadow-[0_0_20px_rgba(34,197,94,1)] z-10 pointer-events-none rounded-r-xl';
            targetBlock.appendChild(scanner);

            // تحريك الماسح بحركة Cubic-Bezier حريرية
            requestAnimationFrame(() => {
                scanner.style.transition = 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)';
                scanner.style.width = '100%';
                scanner.style.backgroundColor = 'rgba(34,197,94,0.05)'; 
            });

            // جلب الحقول
            const qInput = targetBlock.querySelector('.mcq-q-text');
            const optInputs = [
                targetBlock.querySelector('.mcq-opt-0'),
                targetBlock.querySelector('.mcq-opt-1'),
                targetBlock.querySelector('.mcq-opt-2'),
                targetBlock.querySelector('.mcq-opt-3')
            ];
            const correctSelect = targetBlock.querySelector('.mcq-correct');

            // محاكاة الكتابة التلقائية السلسة مع تأثير النبض (Scale Pulse)
            await sleep(250);
            qInput.value = pq.q;
            qInput.classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500', 'bg-green-500/10');
            
            for (let j = 0; j < 4; j++) {
                await sleep(120);
                optInputs[j].value = pq.opts[j];
                optInputs[j].classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500');
                if(j === pq.correct) {
                     optInputs[j].classList.add('bg-green-500/20'); 
                }
                setTimeout(() => {
                    optInputs[j].classList.remove('scale-[1.02]');
                }, 150);
            }

            await sleep(150);
            qInput.classList.remove('scale-[1.02]');
            correctSelect.value = pq.correct;
            correctSelect.parentElement.classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.4)]');
            
            setTimeout(() => {
                correctSelect.parentElement.classList.remove('scale-[1.02]');
            }, 150);

            await sleep(400);
            
            // إزالة التأثيرات بعد الانتهاء للتهيؤ للسؤال القادم بسلاسة
            scanner.style.opacity = '0';
            setTimeout(() => scanner.remove(), 300);
            
            qInput.classList.remove('ring-2', 'ring-green-500', 'bg-green-500/10');
            optInputs.forEach((inp, idx) => {
                inp.classList.remove('ring-2', 'ring-green-500');
                if(idx !== pq.correct) inp.classList.remove('bg-green-500/20');
            });
            correctSelect.parentElement.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.4)]');
            
            // تمرير الشاشة (Scroll) إلى آخر سؤال تمت إضافته بنعومة فائقة
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        SysUI.confetti();
        SysUI.toast('success', 'تمت المهمة بنجاح');
    }
};

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // تشغيل نظام الاستيراد الذكي
    setTimeout(() => SmartImportSystem.init(), 1000); // نضع مهلة بسيطة لضمان تحميل DOM
});

// ولضمان ظهوره في حال تم التنقل بين الـ Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setTimeout(() => SmartImportSystem.init(), 100);
    });
});
