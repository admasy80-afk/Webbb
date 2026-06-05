// ════════════════════════════════════════════
// منصة الدحيح | وحدة المحفظة والاشتراك والملف الشخصي
// تتعامل مع: استرداد كود السنتر، عرض الرصيد، الملف الشخصي،
// الصورة الشخصية، وبانر انتهاء الاشتراك.
// ════════════════════════════════════════════
(function () {
    'use strict';

    if (window.__DAHIH_WALLET_INITIALIZED__) return;
    window.__DAHIH_WALLET_INITIALIZED__ = true;

    const $ = (id) => document.getElementById(id);

    // ── الحصول على رمز الجلسة وبيانات المستخدم ──
    function getAuth() {
        // نحاول أولاً من DahihApp (إن وُجد state حقيقي)
        try {
            if (window.DahihApp && typeof window.DahihApp.getState === 'function') {
                const s = window.DahihApp.getState();
                if (s && s.token && s.token !== 'secure_default_session_token') {
                    return { token: s.token, user: s.user };
                }
            }
        } catch (e) {}
        // وإلا من localStorage مباشرةً
        const token = localStorage.getItem('dahih_token');
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dahih_user') || 'null'); } catch (e) {}
        return { token, user };
    }

    function toast(message, type = 'info') {
        if (window.DahihApp && typeof window.DahihApp.toast === 'function') {
            window.DahihApp.toast(message, type);
            return;
        }
        // fallback بسيط
        let container = document.querySelector('.toast-container') || $('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const t = document.createElement('div');
        t.className = `premium-toast ${type}`;
        t.innerHTML = `<div class="toast-content"><span>${message}</span></div><div class="toast-progress-bar"><div class="toast-progress"></div></div>`;
        container.appendChild(t);
        requestAnimationFrame(() => t.classList.add('active'));
        setTimeout(() => {
            t.classList.remove('active');
            t.addEventListener('transitionend', () => t.remove(), { once: true });
        }, 4000);
    }

    async function api(path, options = {}) {
        const { token } = getAuth();
        const headers = Object.assign(
            { 'Content-Type': 'application/json' },
            token ? { 'Authorization': `Bearer ${token}` } : {},
            options.headers || {}
        );
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(path, { ...options, headers, signal: controller.signal, credentials: 'omit' });
            let data = null;
            try { data = await res.json(); } catch (e) { data = {}; }
            return { ok: res.ok, status: res.status, data };
        } finally {
            clearTimeout(timer);
        }
    }

    // ── أدوات تنسيق ──
    const EGP = (n) => `${Number(n || 0).toLocaleString('en-US')} ج`;

    function formatDate(d) {
        if (!d) return '—';
        try {
            const date = new Date(d);
            if (isNaN(date.getTime())) return '—';
            return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) { return '—'; }
    }

    function daysLeft(end) {
        if (!end) return null;
        const diff = new Date(end).getTime() - Date.now();
        if (diff <= 0) return 0;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    // ── تحديث كل عناصر الواجهة بناءً على بيانات المحفظة ──
    function applyWallet(wallet) {
        if (!wallet) return;

        const balanceText = EGP(wallet.balance);
        const expiryText = wallet.subscriptionEnd ? formatDate(wallet.subscriptionEnd) : 'غير مفعّل';
        const dleft = daysLeft(wallet.subscriptionEnd);
        const expiryShort = wallet.isActive && dleft != null
            ? (dleft === 0 ? 'ينتهي اليوم' : `${dleft} يوم`)
            : 'غير مفعّل';

        // الشريط الجانبي
        const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
        set('walletBalance', balanceText);
        set('walletBalanceMobile', balanceText);
        set('walletExpiry', expiryShort);

        // صفحة الاسترداد
        set('redeemBalanceDisplay', balanceText);
        set('redeemExpiryDisplay', expiryText);

        // الملف الشخصي
        set('profileBalance', balanceText);
        set('profileExpiry', expiryText);
        set('profileCodes', String(wallet.codesUsedCount || 0));
        set('profileStatus', wallet.isActive ? 'مفعّل ✓' : 'غير مفعّل');
        set('profileName', wallet.name || (getAuth().user && getAuth().user.name) || '—');
        set('profileGrade', wallet.grade || (getAuth().user && getAuth().user.grade) || '—');

        const statusEl = $('profileStatus');
        if (statusEl) statusEl.className = wallet.isActive
            ? 'text-sm font-black text-green-400 leading-tight'
            : 'text-sm font-black text-red-400 leading-tight';

        // الصورة الشخصية
        if (wallet.avatar) {
            ['studentAvatar', 'studentAvatarMobile', 'profileAvatar'].forEach(id => {
                const img = $(id);
                if (img) img.src = wallet.avatar;
            });
        }

        // بانر انتهاء الاشتراك
        const banner = $('subscriptionBanner');
        if (banner) banner.classList.toggle('hidden', !!wallet.isActive);

        // حفظ آخر حالة معروفة
        window.__DAHIH_WALLET__ = wallet;
    }

    function renderTransactions(transactions) {
        const container = $('transactionsContainer');
        if (!container) return;
        if (!Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 text-sm py-8 font-medium">لا توجد عمليات مالية بعد</p>';
            return;
        }
        container.innerHTML = transactions.slice(0, 20).map(t => {
            const isCredit = Number(t.amount) >= 0 && t.type !== 'deduct';
            const sign = isCredit ? '+' : '-';
            const color = isCredit ? 'text-green-400' : 'text-red-400';
            const amount = Math.abs(Number(t.amount) || 0);
            return `
                <div class="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div class="min-w-0">
                        <p class="text-sm text-white font-bold truncate">${escapeHTML(t.description || 'عملية مالية')}</p>
                        <p class="text-[11px] text-gray-500 mt-0.5">${formatDate(t.createdAt)}</p>
                    </div>
                    <span class="${color} font-black font-mono text-sm shrink-0 tabular-nums">${sign}${amount.toLocaleString('en-US')} ج</span>
                </div>`;
        }).join('');
    }

    function escapeHTML(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── جلب بيانات المحفظة من الخادم ──
    async function loadWallet() {
        const { token } = getAuth();
        if (!token) return;
        try {
            const { ok, status, data } = await api('/api/student/wallet', { method: 'GET' });
            if (!ok) {
                if (status === 401 || status === 403) {
                    if (window.DahihApp && window.DahihApp.logout) window.DahihApp.logout();
                }
                return;
            }
            applyWallet(data.wallet);
            renderTransactions(data.transactions);
        } catch (e) {
            // صامت — لا نزعج المستخدم بأخطاء الشبكة المؤقتة
        }
    }

    // ── استرداد كود الشحن ──
    function setRedeemResult(message, ok) {
        const box = $('redeemResult');
        if (!box) return;
        box.classList.remove('hidden');
        box.textContent = message;
        box.className = ok
            ? 'mt-4 rounded-xl p-4 text-sm font-bold text-center transition-all duration-300 bg-green-500/10 text-green-400 border border-green-500/30'
            : 'mt-4 rounded-xl p-4 text-sm font-bold text-center transition-all duration-300 bg-red-500/10 text-red-400 border border-red-500/30';
    }

    async function handleRedeem(e) {
        e.preventDefault();
        e.stopPropagation();

        const input = $('redeemCode');
        const btn = $('redeemBtn');
        if (!input) return;

        const code = (input.value || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!code) {
            setRedeemResult('يرجى إدخال الكود أولاً.', false);
            return;
        }

        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> جاري التفعيل...';
        }

        try {
            const { ok, data } = await api('/api/student/redeem', {
                method: 'POST',
                body: JSON.stringify({ code })
            });

            if (ok) {
                setRedeemResult(data.message || 'تم تفعيل الكود بنجاح ✓', true);
                toast(data.message || 'تم تفعيل الكود بنجاح ✓', 'success');
                input.value = '';
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
                }
                // تحديث الرصيد والاشتراك فوراً
                await loadWallet();
                // إعادة تحميل بيانات المنصة لفك القفل عن الوظائف
                if (window.DahihApp && typeof window.DahihApp.refresh === 'function') {
                    window.DahihApp.refresh();
                }
            } else {
                setRedeemResult(data.message || 'تعذّر تفعيل الكود.', false);
                toast(data.message || 'تعذّر تفعيل الكود.', 'error');
            }
        } catch (err) {
            setRedeemResult('حدث خطأ في الاتصال. حاول مجدداً.', false);
            toast('حدث خطأ في الاتصال. حاول مجدداً.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    }

    // ── رفع/تغيير الصورة الشخصية ──
    function handleAvatarChange(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
            toast('صيغة الصورة غير مدعومة (PNG/JPG/WEBP فقط).', 'error');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast('حجم الصورة كبير. حاول بصورة أصغر.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            // ضغط الصورة عبر canvas لتقليل الحجم قبل الإرسال
            try {
                const dataUrl = await compressImage(reader.result, 256);
                const { ok, data } = await api('/api/student/update-avatar', {
                    method: 'POST',
                    body: JSON.stringify({ avatar: dataUrl })
                });
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
                toast('تعذّر معالجة الصورة.', 'error');
            }
        };
        reader.onerror = () => toast('تعذّر قراءة الملف.', 'error');
        reader.readAsDataURL(file);
    }

    function compressImage(dataUrl, maxSize) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > height) {
                    if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
                } else {
                    if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    // ── ربط الأحداث ──
    function bind() {
        const form = $('redeemForm');
        if (form) {
            form.addEventListener('submit', handleRedeem);
            // إرسال بالـ Enter داخل الحقل دون ريفرش
            const input = $('redeemCode');
            if (input) {
                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); handleRedeem(ev); }
                });
            }
        }

        const avatarInput = $('avatarInput');
        if (avatarInput) avatarInput.addEventListener('change', handleAvatarChange);

        // تحديث المحفظة عند الرجوع للتبويب
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadWallet();
        });
    }

    function start() {
        bind();
        loadWallet();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // تصدير للاستخدام الخارجي عند الحاجة
    window.DahihWallet = { reload: loadWallet };
})();
