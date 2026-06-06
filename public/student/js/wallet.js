(function () {
'use strict';

if (window.__DAHIH_WALLET_INITIALIZED__) return;
window.__DAHIH_WALLET_INITIALIZED__ = true;

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

const Bus = {
    events: Object.create(null),
    on(event, cb) {
        (this.events[event] ??= []).push(cb);
    },
    emit(event, data) {
        this.events[event]?.forEach(cb => {
            try { cb(data); } catch (e) {}
        });
    }
};

const State = {
    cache: { walletData: null, lastFetch: 0 },
    loading: { redeem: false, avatar: false }
};

const getAuth = () => {
    try {
        const s = window.DahihApp?.getState?.();
        if (s?.token && s.token !== 'secure_default_session_token') {
            return { token: s.token, user: s.user };
        }
    } catch {}
    const userStr = localStorage.getItem('dahih_user');
    return {
        token: localStorage.getItem('dahih_token'),
        user: userStr ? JSON.parse(userStr) : null
    };
};

const deepFreeze = obj => {
    for (const k of Reflect.ownKeys(obj)) {
        if (obj[k] && (typeof obj[k] === 'object' || typeof obj[k] === 'function')) {
            deepFreeze(obj[k]);
        }
    }
    return Object.freeze(obj);
};

const escapeHTML = str => {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const toast = (message, type = 'info') => {
    if (window.DahihApp?.toast) return window.DahihApp.toast(message, type);
    
    let container = $$('.toast-container') || $('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const t = document.createElement('div');
    t.className = `premium-toast ${type}`;
    
    const content = document.createElement('div');
    content.className = 'toast-content';
    
    const span = document.createElement('span');
    span.textContent = message;
    content.appendChild(span);
    
    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'toast-progress-bar';
    
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    
    progressWrapper.appendChild(progress);
    t.append(content, progressWrapper);
    container.appendChild(t);
    
    requestAnimationFrame(() => t.classList.add('active'));
    setTimeout(() => {
        t.classList.remove('active');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 4000);
};

const pendingGETs = new Map();
const api = async (path, options = {}, retries = 2) => {
    const isGET = !options.method || options.method.toUpperCase() === 'GET';
    
    if (isGET && pendingGETs.has(path)) return pendingGETs.get(path);

    const execute = async () => {
        const { token } = getAuth();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };
        let lastError;
        for (let i = 0; i <= retries; i++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const res = await fetch(path, { ...options, headers, signal: controller.signal, credentials: 'omit' });
                clearTimeout(timer);
                return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
            } catch (e) {
                clearTimeout(timer);
                lastError = e;
                if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }
        throw lastError;
    };

    const promise = execute();
    if (isGET) {
        pendingGETs.set(path, promise);
        promise.finally(() => pendingGETs.delete(path));
    }
    return promise;
};

const EGP = n => `${Number(n || 0).toLocaleString('en-US')} ج`;

const formatDate = d => {
    if (!d) return '—';
    const date = new Date(d);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
};

const daysLeft = end => {
    if (!end) return null;
    return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));
};

const applyWallet = wallet => {
    if (!wallet) return;
    const auth = getAuth();
    
    const balanceText = EGP(wallet.balance);
    const expiryText = wallet.subscriptionEnd ? formatDate(wallet.subscriptionEnd) : 'غير مفعّل';
    const dleft = daysLeft(wallet.subscriptionEnd);
    const expiryShort = wallet.isActive && dleft !== null ? (dleft === 0 ? 'ينتهي اليوم' : `${dleft} يوم`) : 'غير مفعّل';

    const map = {
        walletBalance: balanceText,
        walletBalanceMobile: balanceText,
        walletExpiry: expiryShort,
        redeemBalanceDisplay: balanceText,
        redeemExpiryDisplay: expiryText,
        profileBalance: balanceText,
        profileExpiry: expiryText,
        profileCodes: String(wallet.codesUsedCount || 0),
        profileStatus: wallet.isActive ? 'مفعّل ✓' : 'غير مفعّل',
        profileName: wallet.name || auth.user?.name || '—',
        profileGrade: wallet.grade || auth.user?.grade || '—'
    };

    for (const [id, val] of Object.entries(map)) {
        const el = $(id);
        if (el) el.textContent = val;
    }

    const statusEl = $('profileStatus');
    if (statusEl) statusEl.className = wallet.isActive ? 'text-sm font-black text-green-400 leading-tight' : 'text-sm font-black text-red-400 leading-tight';

    if (wallet.avatar) {
        ['studentAvatar', 'studentAvatarMobile', 'profileAvatar'].forEach(id => {
            const img = $(id);
            if (img) {
                if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
                img.src = wallet.avatar;
            }
        });
    }

    $('subscriptionBanner')?.classList.toggle('hidden', !!wallet.isActive);
    window.DAHIH_WALLET = deepFreeze(structuredClone(wallet));
};

const renderTransactions = transactions => {
    const container = $('transactionsContainer');
    if (!container) return;
    container.textContent = '';

    if (!Array.isArray(transactions) || transactions.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-center text-gray-500 text-sm py-8 font-medium';
        p.textContent = 'لا توجد عمليات مالية بعد';
        container.appendChild(p);
        return;
    }

    const frag = document.createDocumentFragment();
    transactions.slice(0, 20).forEach(t => {
        const isCredit = Number(t.amount) >= 0 && t.type !== 'deduct';
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-xl px-4 py-3';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'min-w-0';

        const descP = document.createElement('p');
        descP.className = 'text-sm text-white font-bold truncate';
        descP.textContent = t.description || 'عملية مالية';

        const dateP = document.createElement('p');
        dateP.className = 'text-[11px] text-gray-500 mt-0.5';
        dateP.textContent = formatDate(t.createdAt);

        infoDiv.append(descP, dateP);

        const amtSpan = document.createElement('span');
        amtSpan.className = `${isCredit ? 'text-green-400' : 'text-red-400'} font-black font-mono text-sm shrink-0 tabular-nums`;
        amtSpan.textContent = `${isCredit ? '+' : '-'}${Math.abs(Number(t.amount) || 0).toLocaleString('en-US')} ج`;

        div.append(infoDiv, amtSpan);
        frag.appendChild(div);
    });
    
    container.appendChild(frag);
};

const loadWallet = async (force = false) => {
    if (!navigator.onLine || !getAuth().token) return;

    if (!force && Date.now() - State.cache.lastFetch < 30000 && State.cache.walletData) {
        return Bus.emit('wallet:updated', State.cache.walletData);
    }

    try {
        const { ok, status, data } = await api('/api/student/wallet', { method: 'GET' });
        if (!ok) {
            if ((status === 401 || status === 403) && window.DahihApp?.logout) window.DahihApp.logout();
            return;
        }
        State.cache.lastFetch = Date.now();
        State.cache.walletData = deepFreeze(structuredClone(data));
        Bus.emit('wallet:updated', State.cache.walletData);
    } catch {}
};

const setRedeemResult = (message, ok) => {
    const box = $('redeemResult');
    if (!box) return;
    box.classList.remove('hidden');
    box.textContent = message;
    box.className = ok
        ? 'mt-4 rounded-xl p-4 text-sm font-bold text-center transition-all duration-300 bg-green-500/10 text-green-400 border border-green-500/30'
        : 'mt-4 rounded-xl p-4 text-sm font-bold text-center transition-all duration-300 bg-red-500/10 text-red-400 border border-red-500/30';
};

const handleRedeem = async e => {
    e.preventDefault();
    e.stopPropagation();
    if (State.loading.redeem) return;

    const input = $('redeemCode');
    const btn = $('redeemBtn');
    if (!input) return;

    const code = input.value.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return setRedeemResult('يرجى إدخال الكود أولاً.', false);

    State.loading.redeem = true;
    let originalNodes = [];
    
    if (btn) {
        originalNodes = Array.from(btn.childNodes);
        btn.disabled = true;
        btn.textContent = 'جاري التفعيل...';
    }

    try {
        const { ok, data } = await api('/api/student/redeem', { method: 'POST', body: JSON.stringify({ code }) }, 0);
        if (ok) {
            setRedeemResult(data.message || 'تم تفعيل الكود بنجاح ✓', true);
            toast(data.message || 'تم تفعيل الكود بنجاح ✓', 'success');
            input.value = '';
            if (typeof confetti === 'function') confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
            await loadWallet(true);
            window.DahihApp?.refresh?.();
        } else {
            setRedeemResult(data.message || 'تعذّر تفعيل الكود.', false);
            toast(data.message || 'تعذّر تفعيل الكود.', 'error');
        }
    } catch (err) {
        setRedeemResult('حدث خطأ في الاتصال. حاول مجدداً.', false);
        toast('حدث خطأ في الاتصال. حاول مجدداً.', 'error');
    } finally {
        State.loading.redeem = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = '';
            originalNodes.forEach(n => btn.appendChild(n));
        }
    }
};

const compressImage = (dataUrl, maxSize) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        let { width, height } = img;
        if (width > 5000 || height > 5000) return reject(new Error('Image too large'));
        
        if (width > height) {
            if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
        } else {
            if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d', { alpha: false }).drawImage(img, 0, 0, width, height);
        const result = canvas.toDataURL('image/jpeg', 0.85);
        canvas.width = canvas.height = 0;
        resolve(result);
    };
    img.onerror = reject;
    img.src = dataUrl;
});

const handleAvatarChange = e => {
    if (State.loading.avatar) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp)/.test(file.type)) return toast('صيغة الصورة غير مدعومة (PNG/JPG/WEBP فقط).', 'error');
    if (file.size > 2 * 1024 * 1024) return toast('حجم الصورة كبير. حاول بصورة أصغر.', 'error');

    State.loading.avatar = true;
    const reader = new FileReader();
    
    reader.onload = async () => {
        try {
            const dataUrl = await compressImage(reader.result, 256);
            const { ok, data } = await api('/api/student/update-avatar', { method: 'POST', body: JSON.stringify({ avatar: dataUrl }) }, 1);
            if (ok) {
                ['studentAvatar', 'studentAvatarMobile', 'profileAvatar'].forEach(id => {
                    const img = $(id);
                    if (img) img.src = data.avatar || dataUrl;
                });
                toast(data.message || 'تم تحديث الصورة ✓', 'success');
            } else {
                toast(data.message || 'تعذّر حفظ الصورة.', 'error');
            }
        } catch (err) {
            toast(err.message === 'Image too large' ? 'أبعاد الصورة ضخمة جداً.' : 'تعذّر معالجة الصورة.', 'error');
        } finally {
            State.loading.avatar = false;
            e.target.value = '';
        }
    };
    
    reader.onerror = () => {
        toast('تعذّر قراءة الملف.', 'error');
        State.loading.avatar = false;
    };
    
    reader.readAsDataURL(file);
};

const bind = () => {
    $('redeemForm')?.addEventListener('submit', handleRedeem);
    $('avatarInput')?.addEventListener('change', handleAvatarChange);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadWallet();
    });

    window.addEventListener('offline', () => toast('انقطع الاتصال بالإنترنت', 'error'));
    window.addEventListener('online', () => {
        toast('عاد الاتصال بالإنترنت', 'success');
        loadWallet(true);
    });

    Bus.on('wallet:updated', data => {
        if (data?.wallet) applyWallet(data.wallet);
        if (data?.transactions) renderTransactions(data.transactions);
    });
};

const start = () => {
    bind();
    loadWallet(true);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}

window.DahihWallet = deepFreeze({
    reload: () => loadWallet(true),
    bus: Bus
});

})();
