// ==================== 1. نظام الإشعارات والنوافذ والاحتفال الذكي ====================
export const SysUI = {
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

export const trashSVG = `<svg class="w-5 h-5 transition-transform duration-300 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

