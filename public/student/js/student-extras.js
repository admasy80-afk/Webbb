(function () {
'use strict';

if (window.__DAHIH_EXTRAS_INITIALIZED__) return;
window.__DAHIH_EXTRAS_INITIALIZED__ = true;

const $ = id => document.getElementById(id);

const getAuth = () => {
    try {
        const s = window.DahihApp?.getState?.();
        if (s?.token && s.token !== 'secure_default_session_token') {
            return { token: s.token, user: s.user };
        }
    } catch (e) {}
    const userStr = localStorage.getItem('dahih_user');
    return {
        token: localStorage.getItem('dahih_token'),
        user: userStr ? (() => { try { return JSON.parse(userStr); } catch (e) { return null; } })() : null
    };
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
    let container = document.querySelector('.toast-container') || $('toastContainer');
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
    t.appendChild(content);
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('active'));
    setTimeout(() => {
        t.classList.remove('active');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 4000);
};

const api = async (path, body) => {
    const { token } = getAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: JSON.stringify(body || {}),
            credentials: 'omit',
            signal: controller.signal
        });
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) {
        clearTimeout(timer);
        return { ok: false, status: 0, data: {} };
    }
};

const fmtRelative = d => {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'الآن';
    if (min < 60) return `منذ ${min} دقيقة`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `منذ ${hr} ساعة`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `منذ ${day} يوم`;
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
};

const fmtDate = d => {
    if (!d) return '—';
    const date = new Date(d);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG', { month: 'long', day: 'numeric' });
};

const State = {
    grade: null,
    messages: { loaded: false, loading: false, data: [] },
    homework: { loaded: false, loading: false, data: [] },
    unread: 0
};

const resolveGrade = () => {
    if (State.grade) return State.grade;
    const auth = getAuth();
    State.grade = auth.user?.grade || '';
    return State.grade;
};

const setUnread = n => {
    State.unread = Math.max(0, Number(n) || 0);
    const badge = $('messagesBadge');
    if (badge) {
        if (State.unread > 0) {
            badge.textContent = State.unread > 99 ? '99+' : String(State.unread);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    const markBtn = $('markAllReadBtn');
    if (markBtn) markBtn.classList.toggle('hidden', State.unread === 0);
};

const setRestricted = isRestricted => {
    const overlay = $('restrictionOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !isRestricted);
    document.body.classList.toggle('overflow-hidden', !!isRestricted);
};

const scopeMeta = scope => {
    if (scope === 'private') return { label: 'رسالة خاصة', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' };
    if (scope === 'all') return { label: 'إعلان عام', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/25' };
    return { label: 'لمرحلتك', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' };
};

const renderMessages = () => {
    const container = $('messagesContainer');
    if (!container) return;
    const list = State.messages.data;

    if (!list.length) {
        container.innerHTML = `
            <div class="text-center py-16 glass-panel rounded-2xl border border-white/10">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 grid place-items-center">
                    <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <p class="text-gray-400 font-bold">لا توجد رسائل بعد</p>
                <p class="text-gray-600 text-sm mt-1">ستظهر هنا رسائل المستر وإعلاناته</p>
            </div>`;
        return;
    }

    container.innerHTML = list.map((m, i) => {
        const meta = scopeMeta(m.scope);
        const unreadRing = m.read ? '' : 'ring-1 ring-yellow-500/30';
        const dot = m.read ? '' : '<span class="w-2 h-2 rounded-full bg-yellow-500 shrink-0 mt-2 shadow-[0_0_8px_rgba(250,204,21,0.7)]"></span>';
        return `
            <article class="msg-item glass-panel rounded-2xl border border-white/10 ${unreadRing} p-4 md:p-5 bg-gradient-to-b from-white/[0.03] to-transparent animate-fade-in-up" style="animation-delay:${Math.min(i * 50, 400)}ms" data-id="${escapeHTML(m.id)}" data-read="${m.read ? '1' : '0'}">
                <div class="flex items-start gap-3">
                    ${dot}
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                            <h3 class="font-black text-white text-sm md:text-base truncate">${escapeHTML(m.title)}</h3>
                            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${meta.cls} shrink-0">${meta.label}</span>
                        </div>
                        <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line break-words">${escapeHTML(m.body)}</p>
                        <p class="text-[11px] text-gray-500 mt-2.5 font-medium">${escapeHTML(fmtRelative(m.createdAt))}</p>
                    </div>
                </div>
            </article>`;
    }).join('');
};

const loadMessages = async (force = false) => {
    if (State.messages.loading) return;
    if (State.messages.loaded && !force) return renderMessages();
    State.messages.loading = true;
    const container = $('messagesContainer');
    if (container && !State.messages.loaded) {
        container.innerHTML = `<div class="text-center py-16 text-gray-500 text-sm font-medium">جاري تحميل الرسائل...</div>`;
    }
    const { ok, data } = await api('/api/student/messages', { grade: resolveGrade() });
    State.messages.loading = false;
    if (!ok) {
        if (container && !State.messages.loaded) container.innerHTML = `<div class="text-center py-16 text-red-400 text-sm font-medium">تعذّر تحميل الرسائل. حاول مجدداً.</div>`;
        return;
    }
    State.messages.data = Array.isArray(data.messages) ? data.messages : [];
    State.messages.loaded = true;
    setUnread(Number(data.unread || 0));
    renderMessages();
};

const markAllRead = async () => {
    if (State.unread === 0) return;
    State.messages.data = State.messages.data.map(m => ({ ...m, read: true }));
    setUnread(0);
    renderMessages();
    await api('/api/student/messages/read', { id: 'all', grade: resolveGrade() });
};

const markOneRead = async id => {
    const msg = State.messages.data.find(m => m.id === id);
    if (!msg || msg.read) return;
    msg.read = true;
    setUnread(State.unread - 1);
    renderMessages();
    await api('/api/student/messages/read', { id, grade: resolveGrade() });
};

const hwStatusMeta = status => {
    switch (status) {
        case 'graded': return { label: 'تم التصحيح', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' };
        case 'submitted': return { label: 'بانتظار التصحيح', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/25' };
        case 'overdue': return { label: 'انتهى الموعد', cls: 'text-red-400 bg-red-500/10 border-red-500/25' };
        default: return { label: 'مطلوب التسليم', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' };
    }
};

const renderHomeworkStats = () => {
    const box = $('homeworkStats');
    if (!box) return;
    const list = State.homework.data;
    const total = list.length;
    const submitted = list.filter(h => h.status === 'submitted' || h.status === 'graded').length;
    const graded = list.filter(h => h.status === 'graded');
    const pending = list.filter(h => h.status === 'pending' || h.status === 'overdue').length;
    let avg = '—';
    if (graded.length) {
        const sum = graded.reduce((a, h) => a + (Number(h.submission?.grade) / (Number(h.maxGrade) || 100)) * 100, 0);
        avg = `${Math.round(sum / graded.length)}%`;
    }
    const card = (label, value, color) => `
        <div class="glass-panel rounded-2xl p-3.5 border border-white/10 border-t-4 ${color} bg-gradient-to-b from-white/[0.03] to-transparent">
            <p class="text-[10px] text-gray-400 mb-1 font-bold uppercase tracking-widest">${label}</p>
            <p class="text-xl font-black text-white tabular-nums">${value}</p>
        </div>`;
    box.innerHTML =
        card('الإجمالي', total, 'border-t-white/20') +
        card('تم تسليمه', submitted, 'border-t-sky-500/70') +
        card('بانتظارك', pending, 'border-t-yellow-500/70') +
        card('متوسط الدرجات', avg, 'border-t-emerald-500/70');
};

const renderHomework = () => {
    const container = $('homeworkContainer');
    if (!container) return;
    const list = State.homework.data;
    renderHomeworkStats();

    if (!list.length) {
        container.innerHTML = `
            <div class="text-center py-16 glass-panel rounded-2xl border border-white/10">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 grid place-items-center">
                    <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <p class="text-gray-400 font-bold">لا توجد واجبات حالياً</p>
                <p class="text-gray-600 text-sm mt-1">سيظهر هنا أي واجب يضيفه المستر لمرحلتك</p>
            </div>`;
        return;
    }

    container.innerHTML = list.map((h, i) => {
        const meta = hwStatusMeta(h.status);
        const due = h.dueDate ? `<span class="text-[11px] text-gray-400 font-medium flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>التسليم: ${escapeHTML(fmtDate(h.dueDate))}</span>` : '';
        const course = h.courseName ? `<span class="text-[11px] text-sky-400/90 font-medium">${escapeHTML(h.courseName)}</span>` : '';

        let footer = '';
        if (h.status === 'graded') {
            const g = h.submission?.grade ?? 0;
            const pct = Math.round((Number(g) / (Number(h.maxGrade) || 100)) * 100);
            const tone = pct >= 75 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
            const fb = h.submission?.feedback ? `<div class="mt-3 bg-black/30 border border-white/5 rounded-xl px-3.5 py-2.5"><p class="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-widest">ملاحظة المستر</p><p class="text-sm text-gray-200 leading-relaxed whitespace-pre-line break-words">${escapeHTML(h.submission.feedback)}</p></div>` : '';
            footer = `
                <div class="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                    <span class="text-xs font-bold text-gray-400">درجتك</span>
                    <span class="text-2xl font-black ${tone} leading-none">${escapeHTML(String(g))}<span class="text-sm text-gray-500 font-bold"> / ${escapeHTML(String(h.maxGrade || 100))}</span></span>
                </div>${fb}`;
        } else {
            const answer = h.submission?.answer ? escapeHTML(h.submission.answer) : '';
            const btnLabel = h.submission ? 'تعديل إجابتي' : 'تسليم الواجب';
            footer = `
                <div class="mt-3 pt-3 border-t border-white/5">
                    <textarea data-hw-answer="${escapeHTML(h.id)}" rows="3" maxlength="5000" placeholder="اكتب إجابتك هنا..." class="w-full bg-black/30 border border-white/10 focus:border-yellow-500/50 rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-gray-600 outline-none transition-colors resize-y leading-relaxed">${answer}</textarea>
                    <button type="button" data-hw-submit="${escapeHTML(h.id)}" class="mt-2.5 w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-3 rounded-xl text-sm transition-all duration-200 active:scale-[0.98] shadow-[0_6px_18px_-6px_rgba(250,204,21,0.5)] disabled:opacity-60 disabled:cursor-not-allowed">${btnLabel}</button>
                </div>`;
        }

        return `
            <article class="glass-panel rounded-2xl border border-white/10 p-4 md:p-5 bg-gradient-to-b from-white/[0.03] to-transparent animate-fade-in-up" style="animation-delay:${Math.min(i * 50, 400)}ms">
                <div class="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
                    <h3 class="font-black text-white text-sm md:text-base">${escapeHTML(h.title)}</h3>
                    <span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${meta.cls} shrink-0">${meta.label}</span>
                </div>
                <div class="flex items-center gap-3 flex-wrap mb-2">${course}${due}</div>
                ${h.description ? `<p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line break-words">${escapeHTML(h.description)}</p>` : ''}
                ${footer}
            </article>`;
    }).join('');
};

const loadHomework = async (force = false) => {
    if (State.homework.loading) return;
    if (State.homework.loaded && !force) return renderHomework();
    State.homework.loading = true;
    const container = $('homeworkContainer');
    if (container && !State.homework.loaded) {
        container.innerHTML = `<div class="text-center py-16 text-gray-500 text-sm font-medium">جاري تحميل الواجبات...</div>`;
    }
    const { ok, data } = await api('/api/student/homework', { grade: resolveGrade() });
    State.homework.loading = false;
    if (!ok) {
        if (container && !State.homework.loaded) container.innerHTML = `<div class="text-center py-16 text-red-400 text-sm font-medium">تعذّر تحميل الواجبات. حاول مجدداً.</div>`;
        return;
    }
    State.homework.data = Array.isArray(data.homeworks) ? data.homeworks : [];
    State.homework.loaded = true;
    renderHomework();
};

const submitHomework = async (id, btn) => {
    const textarea = document.querySelector(`[data-hw-answer="${CSS.escape(id)}"]`);
    if (!textarea) return;
    const answer = textarea.value.trim();
    if (!answer) return toast('اكتب إجابتك أولاً.', 'error');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري التسليم...'; }
    const { ok, data } = await api('/api/student/homework/submit', { homeworkId: id, answer });
    if (ok) {
        toast(data.message || 'تم تسليم الواجب', 'success');
        await loadHomework(true);
    } else {
        toast(data.message || 'تعذّر تسليم الواجب.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'تسليم الواجب'; }
    }
};

const bind = () => {
    $('markAllReadBtn')?.addEventListener('click', markAllRead);

    $('messagesContainer')?.addEventListener('click', e => {
        const item = e.target.closest('.msg-item');
        if (item && item.dataset.read === '0') markOneRead(item.dataset.id);
    });

    $('homeworkContainer')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-hw-submit]');
        if (btn) submitHomework(btn.getAttribute('data-hw-submit'), btn);
    });

    document.addEventListener('dahih:tab', e => {
        const tab = e.detail?.tab;
        if (tab === 'messages') loadMessages();
        else if (tab === 'homework') loadHomework();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        const active = localStorage.getItem('activeTab');
        if (active === 'messages') loadMessages(true);
        else if (active === 'homework') loadHomework(true);
    });
};

const start = () => {
    bind();
    const active = localStorage.getItem('activeTab');
    if (active === 'messages') loadMessages();
    else if (active === 'homework') loadHomework();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}

window.DahihExtras = Object.freeze({
    setRestricted,
    setUnread,
    reloadMessages: () => loadMessages(true),
    reloadHomework: () => loadHomework(true)
});

})();
