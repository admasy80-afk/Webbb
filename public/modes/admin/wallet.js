// ==========================================
// 💰 [ADMIN] WALLET / CARDS / PLANS / LOGS UI
// ==========================================
import { Security } from './security.js';
import { Toast } from './events.js';

const esc = (s) => Security.e(s == null ? '' : s);
const token = () => localStorage.getItem('dahih_token') || localStorage.getItem('userToken') || '';

async function api(method, url, body) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Authorization': `Bearer ${token()}`
        }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
        Toast.error('انتهت الجلسة أو لا تملك صلاحية.');
        return { ok: false, status: res.status, data: {} };
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
}

const fmtEGP = (n) => `${Number(n || 0).toLocaleString('en-US')} ج`;
const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return `${dt.toLocaleDateString('en-GB')} ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

function copyText(text, msg = 'تم النسخ ✓') {
    const done = () => Toast.success(msg);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
        fallbackCopy(text, done);
    }
}
function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
}

// ─────────────────────────────────────────────
// لوحة مراقبة الرصيد (Wallet Management)
// ─────────────────────────────────────────────
async function loadStats() {
    const grid = document.getElementById('walletStatsGrid');
    if (grid) grid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8 text-sm">جاري التحميل...</p>`;
    const { ok, data } = await api('GET', '/api/admin/wallet-stats');
    if (!ok || !data.stats) { if (grid) grid.innerHTML = `<p class="col-span-full text-center text-red-400 py-8 text-sm">تعذر جلب الإحصائيات</p>`; return; }
    const s = data.stats;
    const cards = [
        { label: 'إجمالي الطلاب', value: s.totalStudents, color: 'text-white', copy: s.totalStudents },
        { label: 'الطلاب النشطين', value: s.activeStudents, color: 'text-green-400', copy: s.activeStudents },
        { label: 'اشتراكات منتهية', value: s.expiredStudents, color: 'text-red-400', copy: s.expiredStudents },
        { label: 'إجمالي البطاقات', value: s.totalCards, color: 'text-white', copy: s.totalCards },
        { label: 'بطاقات مستخدمة', value: s.usedCards, color: 'text-yellow-500', copy: s.usedCards },
        { label: 'بطاقات غير مستخدمة', value: s.unusedCards, color: 'text-sky-400', copy: s.unusedCards },
        { label: 'إجمالي الأرصدة', value: fmtEGP(s.totalBalance), color: 'text-green-400', copy: s.totalBalance },
        { label: 'إجمالي المشحون', value: fmtEGP(s.totalCharged), color: 'text-yellow-500', copy: s.totalCharged }
    ];
    grid.innerHTML = cards.map(c => `
        <div class="glass-panel p-4 md:p-5 rounded-2xl border-t-4 border-t-yellow-500/60 relative group">
            <button onclick="WalletAdmin.copy('${esc(String(c.copy))}')" class="absolute top-3 left-3 text-gray-500 hover:text-yellow-500 transition-colors" aria-label="نسخ">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
            <p class="text-gray-400 text-xs mb-2">${esc(c.label)}</p>
            <h3 class="text-xl md:text-2xl font-black ${c.color}">${esc(String(c.value))}</h3>
        </div>`).join('');
}

async function adjustBalance(e) {
    e.preventDefault();
    const email = document.getElementById('adjEmail').value.trim();
    const amount = Number(document.getElementById('adjAmount').value);
    const mode = document.getElementById('adjMode').value;
    const { ok, data } = await api('POST', '/api/admin/adjust-balance', { email, amount, mode });
    if (ok) { Toast.success(data.message || 'تم ✓'); e.target.reset(); loadStats(); }
    else Toast.error(data.message || 'فشلت العملية');
}

// ─────────────────────────────────────────────
// بطاقات الشحن (Charge Cards)
// ─────────────────────────────────────────────
let _lastGenerated = [];

async function loadCards() {
    const container = document.getElementById('cardsListContainer');
    if (!container) return;
    container.innerHTML = `<p class="text-center text-gray-500 py-8 text-sm">جاري التحميل...</p>`;
    const search = (document.getElementById('cardSearch')?.value || '').trim();
    const status = document.getElementById('cardStatusFilter')?.value || '';
    const qs = new URLSearchParams({ limit: '200' });
    if (search) qs.set('search', search);
    if (status) qs.set('status', status);
    const { ok, data } = await api('GET', `/api/admin/cards?${qs.toString()}`);
    if (!ok) { container.innerHTML = `<p class="text-center text-red-400 py-8 text-sm">تعذر التحميل</p>`; return; }
    if (!data.cards.length) { container.innerHTML = `<p class="text-center text-gray-500 py-10 text-sm">لا توجد بطاقات.</p>`; return; }

    container.innerHTML = data.cards.map(c => {
        const used = c.status === 'used';
        return `
        <div class="bg-black/30 border ${used ? 'border-white/5' : 'border-yellow-500/20'} rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <code dir="ltr" class="text-xs md:text-sm font-mono ${used ? 'text-gray-500 line-through' : 'text-green-400'} break-all">${esc(c.code)}</code>
                    <button onclick="WalletAdmin.copy('${esc(c.code)}')" class="text-gray-500 hover:text-yellow-500 shrink-0" aria-label="نسخ الكود">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    </button>
                </div>
                <div class="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                    <span class="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-md font-bold">${fmtEGP(c.value)}</span>
                    <span class="bg-white/5 px-2 py-0.5 rounded-md">${esc(String(c.durationDays))} يوم</span>
                    <span>أُنشئت: ${fmtDate(c.createdAt)}</span>
                    ${used ? `<span class="text-red-400">• استُخدمت بواسطة ${esc(c.usedBy)} (${fmtDate(c.usedAt)})</span>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] font-bold px-2.5 py-1 rounded-lg ${used ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}">${used ? 'مستخدمة' : 'متاحة'}</span>
                ${used ? '' : `<button onclick="WalletAdmin.deleteCard('${c.id}')" class="text-gray-500 hover:text-red-500 transition-colors" aria-label="حذف"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>`}
            </div>
        </div>`;
    }).join('');
}

async function createCards(e) {
    e.preventDefault();
    const planId = document.getElementById('cardPlanSelect').value;
    const quantity = Number(document.getElementById('cardQuantity').value) || 1;
    const body = { quantity };
    if (planId) { body.planId = planId; }
    else {
        body.value = Number(document.getElementById('cardValue').value);
        body.durationDays = Number(document.getElementById('cardDuration').value);
    }
    const { ok, data } = await api('POST', '/api/admin/cards', body);
    if (ok) {
        Toast.success(data.message || 'تم التوليد ✓');
        _lastGenerated = (data.cards || []).map(c => c.code);
        const box = document.getElementById('generatedCardsBox');
        const list = document.getElementById('generatedCardsList');
        if (_lastGenerated.length) { box.classList.remove('hidden'); list.textContent = _lastGenerated.join('\n'); }
        loadCards();
    } else Toast.error(data.message || 'فشل التوليد');
}

function copyGenerated() {
    if (!_lastGenerated.length) return;
    copyText(_lastGenerated.join('\n'), `تم نسخ ${_lastGenerated.length} كود ✓`);
}

async function deleteCard(id) {
    if (!confirm('حذف هذه البطاقة نهائياً؟')) return;
    const { ok, data } = await api('DELETE', `/api/admin/cards/${id}`);
    if (ok) { Toast.success(data.message || 'تم الحذف ✓'); loadCards(); }
    else Toast.error(data.message || 'فشل الحذف');
}

// ─────────────────────────────────────────────
// الباقات (Subscription Plans)
// ─────────────────────────────────────────────
async function loadPlans() {
    const container = document.getElementById('plansListContainer');
    const select = document.getElementById('cardPlanSelect');
    if (container) container.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8 text-sm">جاري التحميل...</p>`;
    const { ok, data } = await api('GET', '/api/admin/plans');
    if (!ok) { if (container) container.innerHTML = `<p class="col-span-full text-center text-red-400 py-8 text-sm">تعذر التحميل</p>`; return; }

    // تحديث قائمة الباقات في نموذج البطاقات
    if (select) {
        const current = select.value;
        select.innerHTML = `<option value="">— تخصيص يدوي —</option>` +
            data.plans.map(p => `<option value="${p.id}">${esc(p.name)} — ${fmtEGP(p.price)} / ${p.durationDays} يوم</option>`).join('');
        select.value = current;
    }

    if (!container) return;
    if (!data.plans.length) { container.innerHTML = `<p class="col-span-full text-center text-gray-500 py-10 text-sm">لا توجد باقات بعد.</p>`; return; }
    container.innerHTML = data.plans.map(p => `
        <div class="glass-panel rounded-2xl p-5 border-t-4 border-yellow-500" data-plan="${p.id}">
            <div class="flex items-start justify-between gap-2">
                <h3 class="text-lg font-bold text-white">${esc(p.name)}</h3>
                <button onclick="WalletAdmin.deletePlan('${p.id}')" class="text-gray-500 hover:text-red-500" aria-label="حذف"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
            </div>
            <div class="flex items-baseline gap-1 my-3">
                <span class="text-3xl font-black text-yellow-500">${Number(p.price).toLocaleString('en-US')}</span>
                <span class="text-gray-400 text-sm">جنيه</span>
            </div>
            <p class="text-sm text-gray-300 mb-4">مدة الاشتراك: <span class="text-white font-bold">${p.durationDays} يوم</span></p>
            <button onclick="WalletAdmin.editPlan('${p.id}', '${esc(p.name)}', ${p.price}, ${p.durationDays})" class="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-bold py-2.5 rounded-xl transition-colors">تعديل</button>
        </div>`).join('');
}

async function createPlan(e) {
    e.preventDefault();
    const name = document.getElementById('planName').value.trim();
    const price = Number(document.getElementById('planPrice').value);
    const durationDays = Number(document.getElementById('planDuration').value);
    const { ok, data } = await api('POST', '/api/admin/plans', { name, price, durationDays });
    if (ok) { Toast.success(data.message || 'تمت الإضافة ✓'); e.target.reset(); loadPlans(); }
    else Toast.error(data.message || 'فشلت الإضافة');
}

async function editPlan(id, name, price, durationDays) {
    const newName = prompt('اسم الباقة:', name);
    if (newName === null) return;
    const newPrice = prompt('السعر (جنيه):', price);
    if (newPrice === null) return;
    const newDuration = prompt('المدة (يوم):', durationDays);
    if (newDuration === null) return;
    const { ok, data } = await api('PUT', `/api/admin/plans/${id}`, {
        name: newName.trim(), price: Number(newPrice), durationDays: Number(newDuration)
    });
    if (ok) { Toast.success(data.message || 'تم التعديل ✓'); loadPlans(); }
    else Toast.error(data.message || 'فشل التعديل');
}

async function deletePlan(id) {
    if (!confirm('حذف هذه الباقة؟')) return;
    const { ok, data } = await api('DELETE', `/api/admin/plans/${id}`);
    if (ok) { Toast.success(data.message || 'تم الحذف ✓'); loadPlans(); }
    else Toast.error(data.message || 'فشل الحذف');
}

// ─────────────────────────────────────────────
// سجل النظام (System Logs)
// ─────────────────────────────────────────────
let _logPage = 1;

function logFilters() {
    return {
        search: (document.getElementById('logSearch')?.value || '').trim(),
        action: document.getElementById('logActionFilter')?.value || '',
        status: document.getElementById('logStatusFilter')?.value || 'all',
        sort: document.getElementById('logSort')?.value || 'desc'
    };
}

const STATUS_STYLE = {
    success: 'bg-green-500/10 text-green-400',
    warning: 'bg-yellow-500/10 text-yellow-500',
    error: 'bg-red-500/10 text-red-400',
    info: 'bg-sky-500/10 text-sky-400'
};

async function loadLogs(page = 1) {
    _logPage = page;
    const container = document.getElementById('logsListContainer');
    if (!container) return;
    container.innerHTML = `<p class="text-center text-gray-500 py-8 text-sm">جاري التحميل...</p>`;
    const f = logFilters();
    const qs = new URLSearchParams({ page: String(page), limit: '50', sort: f.sort, status: f.status });
    if (f.search) qs.set('search', f.search);
    if (f.action) qs.set('action', f.action);
    const { ok, data } = await api('GET', `/api/admin/logs?${qs.toString()}`);
    if (!ok) { container.innerHTML = `<p class="text-center text-red-400 py-8 text-sm">تعذر تحميل السجل</p>`; return; }

    // تعبئة قائمة أنواع الأحداث مرة واحدة
    const actionSel = document.getElementById('logActionFilter');
    if (actionSel && actionSel.options.length <= 1 && data.actions) {
        const cur = actionSel.value;
        actionSel.innerHTML = `<option value="">كل الأحداث</option>` + data.actions.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
        actionSel.value = cur;
    }

    if (!data.logs.length) { container.innerHTML = `<p class="text-center text-gray-500 py-10 text-sm">لا توجد سجلات مطابقة.</p>`; document.getElementById('logsPagination').innerHTML = ''; return; }

    container.innerHTML = data.logs.map(l => {
        const d = new Date(l.createdAt);
        const style = STATUS_STYLE[l.status] || STATUS_STYLE.info;
        return `
        <div class="bg-black/30 border border-white/10 rounded-xl p-3 flex items-start gap-3">
            <span class="text-[11px] font-bold px-2 py-1 rounded-lg ${style} shrink-0 whitespace-nowrap">${esc(l.action)}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm text-white break-words">${esc(l.details)}</p>
                <div class="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                    <span class="text-yellow-500/80">${esc(l.actor)}</span>
                    <span>• ${esc(l.role || '')}</span>
                    <span dir="ltr">• IP: ${esc(l.ip)}</span>
                    <span dir="ltr">• ${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB')}</span>
                </div>
            </div>
            <button onclick="WalletAdmin.copy('${esc(`[${l.action}] ${l.details} | ${l.actor} | ${l.ip} | ${d.toLocaleString('en-GB')}`)}')" class="text-gray-500 hover:text-yellow-500 shrink-0" aria-label="نسخ">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
        </div>`;
    }).join('');

    // ترقيم الصفحات
    const pag = document.getElementById('logsPagination');
    if (pag) {
        const pages = data.pages || 1;
        pag.innerHTML = `
            <button ${page <= 1 ? 'disabled' : ''} onclick="WalletAdmin.loadLogs(${page - 1})" class="px-4 py-2 rounded-xl text-sm font-bold ${page <= 1 ? 'bg-white/5 text-gray-600 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/20'}">السابق</button>
            <span class="text-sm text-gray-400">صفحة ${page} من ${pages} (${data.total} حدث)</span>
            <button ${page >= pages ? 'disabled' : ''} onclick="WalletAdmin.loadLogs(${page + 1})" class="px-4 py-2 rounded-xl text-sm font-bold ${page >= pages ? 'bg-white/5 text-gray-600 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/20'}">التالي</button>`;
    }
}

function exportLogs() {
    const f = logFilters();
    const qs = new URLSearchParams({ sort: f.sort, status: f.status });
    if (f.search) qs.set('search', f.search);
    if (f.action) qs.set('action', f.action);
    // التصدير يتطلب التوكن — نجلب الملف ثم ننزّله
    api('GET', `/api/admin/logs/export?${qs.toString()}`).catch(() => {});
    // أبسط طريقة موثوقة: fetch مع blob
    fetch(`/api/admin/logs/export?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${token()}` } })
        .then(r => r.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `system_logs_${Date.now()}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            Toast.success('تم تصدير السجل CSV ✓');
        })
        .catch(() => Toast.error('فشل التصدير'));
}

// ─────────────────────────────────────────────
// التهيئة وربط الأحداث
// ─────────────────────────────────────────────
function debounce(fn, ms = 350) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function init() {
    document.getElementById('createCardsForm')?.addEventListener('submit', createCards);
    document.getElementById('createPlanForm')?.addEventListener('submit', createPlan);
    document.getElementById('adjustBalanceForm')?.addEventListener('submit', adjustBalance);

    document.getElementById('cardSearch')?.addEventListener('input', debounce(loadCards));
    document.getElementById('cardStatusFilter')?.addEventListener('change', loadCards);

    document.getElementById('logSearch')?.addEventListener('input', debounce(() => loadLogs(1)));
    ['logActionFilter', 'logStatusFilter', 'logSort'].forEach(id =>
        document.getElementById(id)?.addEventListener('change', () => loadLogs(1)));

    // إخفاء الحقول اليدوية عند اختيار باقة
    document.getElementById('cardPlanSelect')?.addEventListener('change', (e) => {
        const manual = document.getElementById('cardManualFields');
        if (manual) manual.style.display = e.target.value ? 'none' : 'grid';
    });

    // ربط أزرار التبويب بتحميل البيانات (إضافةً إلى switchTab)
    document.getElementById('btn-wallet')?.addEventListener('click', loadStats);
    document.getElementById('btn-cards')?.addEventListener('click', () => { loadPlans(); loadCards(); });
    document.getElementById('btn-plans')?.addEventListener('click', loadPlans);
    document.getElementById('btn-logs')?.addEventListener('click', () => loadLogs(1));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export const WalletAdmin = {
    loadStats, loadCards, loadPlans, loadLogs, exportLogs, copyGenerated,
    deleteCard, deletePlan, editPlan, copy: (t) => copyText(t)
};

if (typeof window !== 'undefined') window.WalletAdmin = WalletAdmin;
