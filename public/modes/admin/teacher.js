export const Teacher = (() => {
  /* ============================ Core ============================ */
  const GRADES = [
    'الصف الأول الابتدائي','الصف الثاني الابتدائي','الصف الثالث الابتدائي',
    'الصف الرابع الابتدائي','الصف الخامس الابتدائي','الصف السادس الابتدائي',
    'الصف الأول الإعدادي','الصف الثاني الإعدادي','الصف الثالث الإعدادي',
    'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي'
  ];

  const token = () => localStorage.getItem('userToken') || localStorage.getItem('dahih_token') || '';

  async function api(method, endpoint, body) {
    try {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Authorization': `Bearer ${token()}`
        }
      };
      if (body !== undefined && method !== 'GET') opts.body = JSON.stringify(body || {});
      const res = await fetch(endpoint, opts);
      if (res.status === 401 || res.status === 403) {
        toast('انتهت الجلسة، يرجى إعادة تسجيل الدخول', 'error');
        return null;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast(data?.message || `خطأ ${res.status}`, 'error'); return null; }
      return data;
    } catch (e) {
      toast('فشل الاتصال بالسيرفر', 'error');
      return null;
    }
  }
  const post = (ep, body) => api('POST', ep, body);
  const del = (ep) => api('DELETE', ep);

  const toast = (msg, type) => {
    if (typeof window.showToast === 'function') return window.showToast(msg, type);
    console.log('[Teacher]', type || 'info', msg);
  };

  /* ============================ Render helpers ============================ */
  const e = (s) => s == null ? '' : String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  const fmtDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return '—'; }
  };
  const fmtDateTime = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };
  const timeAgo = (d) => {
    if (!d) return 'لا يوجد نشاط';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
    if (m < 1) return 'الآن';
    if (m < 60) return `قبل ${m} دقيقة`;
    if (h < 24) return `قبل ${h} ساعة`;
    if (days < 30) return `قبل ${days} يوم`;
    return fmtDate(d);
  };
  const daysLeft = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  };

  const TONES = {
    green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    lime:   'bg-lime-500/15 text-lime-400 border-lime-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    red:    'bg-red-500/15 text-red-400 border-red-500/30',
    gray:   'bg-white/10 text-gray-400 border-white/15'
  };
  const levelBadge = (lvl) => lvl
    ? `<span class="text-[11px] px-2 py-0.5 rounded-full border ${TONES[lvl.tone] || TONES.gray}">${e(lvl.label)}</span>` : '';

  const ICONS = {
    'user-plus':'M18 9v3m0 0v3m0-3h3m-3 0h-3M9 12a4 4 0 100-8 4 4 0 000 8zm0 0c-2.67 0-8 1.34-8 4v2h9',
    'trending-down':'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
    'clipboard':'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    'clock':'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    'layers':'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    'check':'M5 13l4 4L19 7'
  };
  const icon = (name, cls = 'w-5 h-5') =>
    `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ICONS[name] || ICONS.check}"/></svg>`;

  const ALERT_STYLE = {
    danger:  'bg-red-500/10 border-red-500/30 text-red-300',
    warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
    info:    'bg-sky-500/10 border-sky-500/30 text-sky-300',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
  };

  const card = (inner, extra = '') =>
    `<div class="bg-white/[0.03] border border-white/10 rounded-2xl p-4 md:p-5 ${extra}">${inner}</div>`;

  const kpi = (label, value, sub, tone = 'yellow') => `
    <div class="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-1">
      <span class="text-gray-400 text-xs">${e(label)}</span>
      <span class="text-2xl md:text-3xl font-extrabold text-${tone === 'yellow' ? 'yellow-400' : tone}">${e(value)}</span>
      ${sub ? `<span class="text-[11px] text-gray-500">${e(sub)}</span>` : ''}
    </div>`;

  const empty = (txt) => `<div class="text-center py-12 text-gray-500 text-sm">${e(txt)}</div>`;
  const loading = () => `<div class="text-center py-16 text-gray-500">جارٍ التحميل…</div>`;

  // شريط تقدم بسيط
  const bar = (p, tone = 'yellow') => `
    <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div class="h-full bg-${tone}-500 rounded-full" style="width:${Math.max(0, Math.min(100, p))}%"></div>
    </div>`;

  const gradeSelect = (id, onchange, value) => `
    <select id="${id}" ${onchange ? `onchange="${onchange}"` : ''} class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-yellow-500 cursor-pointer">
      <option value="">اختر المرحلة…</option>
      ${GRADES.map(g => `<option value="${e(g)}" ${value === g ? 'selected' : ''}>${e(g)}</option>`).join('')}
    </select>`;

  /* ════════════════════════════════════════════════════════════
     1) لوحة القيادة (Command Center)
     ════════════════════════════════════════════════════════════ */
  async function loadCommand() {
    set('command-body', loading());
    const d = await post('/api/admin/teacher/overview', {});
    if (!d) { set('command-body', empty('تعذّر تحميل البيانات')); return; }

    const k = d.kpis;
    const alerts = (d.alerts || []).map(a => `
      <button ${a.action ? `onclick="Teacher.go('${a.action}')"` : ''} class="w-full text-right flex items-center gap-3 p-3 rounded-xl border ${ALERT_STYLE[a.type] || ALERT_STYLE.info} ${a.action ? 'hover:brightness-125 transition' : 'cursor-default'}">
        <span class="shrink-0">${icon(a.icon, 'w-5 h-5')}</span>
        <span class="text-sm flex-1">${e(a.text)}</span>
        ${a.action ? '<span class="text-xs opacity-60">عرض ←</span>' : ''}
      </button>`).join('');

    const weak = (d.weakStudents || []).length ? d.weakStudents.map(s => `
      <button onclick="Teacher.openProfile('${e(s.email)}')" class="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-white/5 transition text-right">
        <div class="min-w-0"><div class="text-sm text-white truncate">${e(s.name)}</div><div class="text-[11px] text-gray-500 truncate">${e(s.grade)}</div></div>
        <span class="shrink-0 text-xs font-bold text-red-400">${s.points}%</span>
      </button>`).join('') : empty('لا يوجد طلاب متعثرون 👏');

    const expiring = (d.expiringSoon || []).length ? d.expiringSoon.map(s => {
      const dl = daysLeft(s.subscriptionEnd);
      return `<button onclick="Teacher.openProfile('${e(s.email)}')" class="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-white/5 transition text-right">
        <div class="min-w-0"><div class="text-sm text-white truncate">${e(s.name)}</div><div class="text-[11px] text-gray-500 truncate">${e(s.grade)}</div></div>
        <span class="shrink-0 text-xs font-bold text-yellow-400">${dl <= 0 ? 'انتهى' : `${dl} يوم`}</span>
      </button>`;
    }).join('') : empty('لا اشتراكات قريبة الانتهاء');

    const grades = (d.gradePerformance || []).length ? d.gradePerformance.map(g => `
      <div class="flex items-center gap-3 py-2">
        <span class="text-xs text-gray-300 w-32 shrink-0 truncate">${e(g.grade)}</span>
        <div class="flex-1">${bar(g.avg, g.avg < 50 ? 'red' : g.avg < 65 ? 'yellow' : 'emerald')}</div>
        <span class="text-xs font-bold text-white w-12 text-left">${g.avg}%</span>
      </div>`).join('') : empty('لا توجد بيانات أداء بعد');

    set('command-body', `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        ${kpi('نشطون اليوم', k.activeToday, 'سجّلوا دخول اليوم', 'emerald-400')}
        ${kpi('إجمالي الطلاب', k.totalStudents, `${k.activeSubs} باشتراك فعّال`)}
        ${kpi('طلبات معلّقة', k.pending, 'بانتظار القبول', k.pending ? 'sky-400' : 'yellow-400')}
        ${kpi('مُقيّدون', k.restricted, 'محظورون مؤقتًا', k.restricted ? 'red-400' : 'yellow-400')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 flex flex-col gap-4">
          ${card(`<h3 class="text-white font-bold mb-3 flex items-center gap-2">${icon('check','w-4 h-4 text-yellow-400')} تنبيهات تحتاج انتباهك</h3><div class="flex flex-col gap-2">${alerts}</div>`)}
          ${card(`<h3 class="text-white font-bold mb-1">أداء الصفوف</h3><p class="text-[11px] text-gray-500 mb-3">متوسط نسب الاختبارات لكل صف</p>${grades}`)}
        </div>
        <div class="flex flex-col gap-4">
          ${card(`<h3 class="text-white font-bold mb-3">طلاب متعثرون</h3><div class="flex flex-col gap-1 -mx-1">${weak}</div>`)}
          ${card(`<h3 class="text-white font-bold mb-3">اشتراكات تنتهي قريبًا</h3><div class="flex flex-col gap-1 -mx-1">${expiring}</div>`)}
        </div>
      </div>`);
  }

  /* ════════════════════════════════════════════════════════════
     2) إدارة الطلاب (Roster) + ملف الطالب الكامل
     ════════════════════════════════════════════════════════════ */
  let rosterState = { grade: '', search: '' };

  function renderRosterShell() {
    set('roster-body', `
      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        ${gradeSelect('roster-grade', 'Teacher.rosterFilter()', rosterState.grade)}
        <input id="roster-search" oninput="Teacher.rosterSearchDebounced()" value="${e(rosterState.search)}" placeholder="ابحث بالاسم أو البريد أو الهاتف…" class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-yellow-500">
      </div>
      <div id="roster-list">${loading()}</div>`);
    loadRoster();
  }

  async function loadRoster() {
    set('roster-list', loading());
    const d = await post('/api/admin/teacher/students', { grade: rosterState.grade || 'all', search: rosterState.search });
    if (!d) { set('roster-list', empty('تعذّر التحميل')); return; }
    if (!d.students.length) { set('roster-list', empty('لا يوجد طلاب مطابقون')); return; }

    const rows = d.students.map(s => `
      <button onclick="Teacher.openProfile('${e(s.email)}')" class="w-full text-right bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-center gap-3 hover:bg-white/[0.06] hover:border-yellow-500/30 transition">
        <div class="shrink-0 w-10 h-10 rounded-full bg-yellow-500/15 text-yellow-400 grid place-items-center font-bold">${e((s.name || '?').charAt(0))}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-white text-sm font-medium truncate">${e(s.name)}</span>
            ${levelBadge(s.level)}
            ${s.restricted ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">مقيّد</span>' : ''}
            ${s.isActive ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">فعّال</span>' : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-gray-400 border border-white/15">منتهي</span>'}
          </div>
          <div class="text-[11px] text-gray-500 truncate mt-0.5">${e(s.grade || '—')} · ${e(s.email)}</div>
        </div>
        <div class="shrink-0 text-left">
          <div class="text-sm font-bold text-white">${s.points}%</div>
          <div class="text-[11px] text-gray-500">${Number(s.balance).toLocaleString('ar-EG')} ج</div>
        </div>
      </button>`).join('');

    set('roster-list', `<div class="text-xs text-gray-500 mb-3">${d.students.length} طالب</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${rows}</div>`);
  }

  let _searchTimer = null;
  function rosterSearchDebounced() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      rosterState.search = document.getElementById('roster-search')?.value || '';
      loadRoster();
    }, 350);
  }
  function rosterFilter() {
    rosterState.grade = document.getElementById('roster-grade')?.value || '';
    loadRoster();
  }

  // ====== ملف الطالب الكامل (Modal) ======
  let currentProfile = null;

  async function openProfile(email) {
    const modal = document.getElementById('student-profile-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    set('student-profile-content', `<div class="p-10">${loading()}</div>`);
    const d = await post('/api/admin/teacher/student-profile', { email });
    if (!d) { set('student-profile-content', `<div class="p-10">${empty('تعذّر تحميل ملف الطالب')}</div>`); return; }
    currentProfile = d;
    renderProfile(d);
  }

  function closeProfile() {
    const modal = document.getElementById('student-profile-modal');
    modal.classList.add('hidden'); modal.classList.remove('flex');
    document.body.style.overflow = '';
    currentProfile = null;
  }

  function profileTab(name, label, active) {
    return `<button onclick="Teacher.profileTab('${name}')" data-ptab="${name}" class="px-3 py-2 text-sm rounded-lg whitespace-nowrap transition ${active ? 'bg-yellow-500 text-black font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}">${label}</button>`;
  }

  function switchProfileTab(name) {
    document.querySelectorAll('[data-ptab]').forEach(b => {
      const on = b.dataset.ptab === name;
      b.className = `px-3 py-2 text-sm rounded-lg whitespace-nowrap transition ${on ? 'bg-yellow-500 text-black font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`;
    });
    document.querySelectorAll('[data-ppane]').forEach(p => p.classList.toggle('hidden', p.dataset.ppane !== name));
  }

  function renderProfile(d) {
    const s = d.student, sub = d.subscription, perf = d.performance;
    const dl = daysLeft(sub.subscriptionEnd);

    const header = `
      <div class="sticky top-0 z-10 bg-[#0f0f12]/95 backdrop-blur border-b border-white/10 p-4 md:p-5 flex items-start gap-4 rounded-t-2xl">
        <div class="shrink-0 w-14 h-14 rounded-2xl bg-yellow-500/15 text-yellow-400 grid place-items-center text-xl font-bold">${e((s.name||'?').charAt(0))}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-lg md:text-xl font-bold text-white">${e(s.name)}</h2>
            ${levelBadge(s.level)}
            ${s.restricted ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">مقيّد</span>' : ''}
            ${s.status === 'pending' ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">طلب معلّق</span>' : ''}
          </div>
          <div class="text-xs text-gray-500 mt-1">${e(s.grade || '—')} · ${e(s.email)}</div>
          <div class="text-[11px] text-gray-600 mt-0.5">آخر نشاط: ${timeAgo(s.lastActivity)}</div>
        </div>
        <button onclick="Teacher.closeProfile()" aria-label="إغلاق" class="shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`;

    // أزرار التحكم السريعة
    const actions = `
      <div class="flex flex-wrap gap-2 p-4 md:px-5 border-b border-white/10">
        <button onclick="Teacher.toggleRestrict('${e(s.email)}', ${!s.restricted})" class="text-xs px-3 py-2 rounded-xl border ${s.restricted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'} hover:brightness-125 transition">${s.restricted ? 'رفع التقييد' : 'تقييد الطالب'}</button>
        <button onclick="Teacher.promptNote('${e(s.email)}')" class="text-xs px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition">+ ملاحظة</button>
        <button onclick="Teacher.promptMessage('${e(s.email)}','${e(s.name)}')" class="text-xs px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition">إرسال رسالة</button>
        <button onclick="Teacher.editStudent()" class="text-xs px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition">تعديل البيانات</button>
      </div>`;

    const tabsbar = `
      <div class="flex gap-1 overflow-x-auto scrollbar-hide p-3 md:px-5 border-b border-white/10">
        ${profileTab('overview','نظرة عامة',true)}
        ${profileTab('grades','الدرجات')}
        ${profileTab('progress','تقدم الكورس')}
        ${profileTab('homework','الواجبات')}
        ${profileTab('wallet','المحفظة')}
        ${profileTab('notes','الملاحظات')}
        ${profileTab('activity','النشاط')}
        ${profileTab('info','البيانات')}
      </div>`;

    // ===== نظرة عامة =====
    const overview = `
      <div data-ppane="overview" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        ${kpi('نقاط التقييم', `${s.points}%`, perf.level?.label)}
        ${kpi('متوسط الاختبارات', perf.avgScore !== null ? `${perf.avgScore}%` : '—', `${perf.quizzesTaken} اختبار`)}
        ${kpi('الرصيد', `${Number(sub.balance).toLocaleString('ar-EG')} ج`, sub.codesUsedCount + ' كود مستخدم')}
        ${kpi('الاشتراك', sub.isActive ? 'فعّال' : 'منتهي', dl !== null ? (dl > 0 ? `${dl} يوم متبقٍ` : 'انتهى') : 'لا يوجد', sub.isActive ? 'emerald-400' : 'red-400')}
      </div>
      <div data-ppane="overview" class="mb-4">
        ${card(`<h4 class="text-white font-bold text-sm mb-3">تطور الأداء</h4>${miniTrend(perf.history)}`)}
      </div>`;

    // ===== الدرجات =====
    const grades = `<div data-ppane="overview grades hidden">${gradesTable(d.quizResults)}</div>`;
    const gradesPane = `<div data-ppane="grades" class="hidden">${card(`<h4 class="text-white font-bold text-sm mb-3">كل نتائج الاختبارات (${d.quizResults.length})</h4>${gradesTable(d.quizResults)}`)}</div>`;

    // ===== تقدم الكورس =====
    const prog = d.progress;
    const progressPane = `
      <div data-ppane="progress" class="hidden">
        ${card(`
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-white font-bold text-sm">إكمال الكورسات</h4>
            <span class="text-sm font-bold text-yellow-400">${prog.completionRate}% (${prog.watchedCourses}/${prog.totalCourses})</span>
          </div>
          ${bar(prog.completionRate, prog.completionRate < 40 ? 'red' : prog.completionRate < 70 ? 'yellow' : 'emerald')}
          <div class="mt-4 flex flex-col gap-1 max-h-80 overflow-y-auto">
            ${prog.courses.length ? prog.courses.map(c => `
              <div class="flex items-center gap-2 p-2 rounded-lg ${c.watched ? 'bg-emerald-500/5' : 'bg-white/[0.02]'}">
                <span class="shrink-0 ${c.watched ? 'text-emerald-400' : 'text-gray-600'}">${c.watched ? icon('check','w-4 h-4') : '<span class="w-4 h-4 inline-block rounded-full border border-gray-600"></span>'}</span>
                <span class="text-sm text-gray-300 flex-1 truncate">${e(c.courseName)}</span>
                <span class="text-[11px] text-gray-600">${c.watched ? 'شوهد' : 'لم يُشاهد'}</span>
              </div>`).join('') : empty('لا توجد كورسات لهذا الصف')}
          </div>`)}
      </div>`;

    // ===== الواجبات =====
    const homeworkPane = `
      <div data-ppane="homework" class="hidden">
        ${card(d.homeworks.length ? `<div class="flex flex-col gap-2">${d.homeworks.map(h => `
          <div class="flex items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <div class="min-w-0 flex-1">
              <div class="text-sm text-white truncate">${e(h.title)}</div>
              <div class="text-[11px] text-gray-500">${h.dueDate ? 'يستحق: ' + fmtDate(h.dueDate) : 'بدون موعد'}</div>
            </div>
            ${h.submitted
              ? (h.grade !== null ? `<span class="text-xs font-bold text-emerald-400">${h.grade} درجة</span>` : '<span class="text-xs text-sky-400">سُلّم — بانتظار التصحيح</span>')
              : '<span class="text-xs text-gray-500">لم يُسلّم</span>'}
          </div>`).join('')}</div>` : empty('لا توجد واجبات'))}
      </div>`;

    // ===== المحفظة =====
    const walletPane = `
      <div data-ppane="wallet" class="hidden">
        ${card(d.transactions.length ? `<div class="flex flex-col gap-1 max-h-96 overflow-y-auto">${d.transactions.map(t => {
          const isCredit = (t.type || '').includes('add') || (t.type || '').includes('credit') || Number(t.amount) > 0;
          return `<div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white/[0.02]">
            <div class="min-w-0"><div class="text-sm text-gray-200 truncate">${e(t.description || t.type)}</div><div class="text-[11px] text-gray-600">${fmtDateTime(t.createdAt)}</div></div>
            <div class="shrink-0 text-left"><div class="text-sm font-bold ${isCredit ? 'text-emerald-400' : 'text-red-400'}">${isCredit ? '+' : ''}${Number(t.amount).toLocaleString('ar-EG')} ج</div><div class="text-[11px] text-gray-600">رصيد: ${Number(t.balanceAfter || 0).toLocaleString('ar-EG')}</div></div>
          </div>`;
        }).join('')}</div>` : empty('لا توجد عمليات على المحفظة'))}
      </div>`;

    // ===== الملاحظات =====
    const notesPane = `
      <div data-ppane="notes" class="hidden">
        ${card(`<div id="profile-notes">${notesList(d.notes)}</div>`)}
      </div>`;

    // ===== النشاط =====
    const activityPane = `
      <div data-ppane="activity" class="hidden">
        ${card(d.activity.length ? `<div class="flex flex-col gap-1 max-h-96 overflow-y-auto">${d.activity.map(a => `
          <div class="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]">
            <span class="shrink-0 w-2 h-2 rounded-full ${a.status === 'error' || a.status === 'warning' ? 'bg-red-500' : 'bg-emerald-500'}"></span>
            <div class="min-w-0 flex-1"><div class="text-sm text-gray-200 truncate">${e(a.details || a.action)}</div><div class="text-[11px] text-gray-600">${fmtDateTime(a.createdAt)} ${a.ip ? '· ' + e(a.ip) : ''}</div></div>
          </div>`).join('')}</div>` : empty('لا يوجد نشاط مسجّل'))}
      </div>`;

    // ===== البيانات =====
    const infoRow = (l, v) => `<div class="flex justify-between gap-3 py-2 border-b border-white/5"><span class="text-gray-500 text-sm">${e(l)}</span><span class="text-gray-200 text-sm text-left">${e(v || '—')}</span></div>`;
    const infoPane = `
      <div data-ppane="info" class="hidden">
        ${card(`
          ${infoRow('الاسم الكامل', s.name)}
          ${infoRow('البريد', s.email)}
          ${infoRow('الهاتف', s.phone)}
          ${infoRow('هاتف ولي الأمر', s.parentPhone)}
          ${infoRow('النوع', s.gender)}
          ${infoRow('الصف', s.grade)}
          ${infoRow('الحالة', s.status)}
          ${infoRow('الهاتف موثّق', s.phoneVerified ? 'نعم' : 'لا')}
          ${infoRow('تاريخ التسجيل', fmtDate(s.createdAt))}
          ${s.rejectionReason ? infoRow('سبب الرفض', s.rejectionReason) : ''}
        `)}
      </div>`;

    set('student-profile-content', `
      ${header}${actions}${tabsbar}
      <div class="p-4 md:p-5">
        ${overview}${gradesPane}${progressPane}${homeworkPane}${walletPane}${notesPane}${activityPane}${infoPane}
      </div>`);
  }

  function miniTrend(history) {
    if (!history || !history.length) return empty('لا توجد اختبارات بعد');
    const max = 100;
    return `<div class="flex items-end gap-1.5 h-32">${history.map(h => {
      const pcent = h.percentage || 0;
      const tone = pcent < 50 ? 'bg-red-500' : pcent < 65 ? 'bg-yellow-500' : 'bg-emerald-500';
      return `<div class="flex-1 flex flex-col items-center gap-1 group" title="${e(h.label)}: ${pcent}%">
        <div class="w-full ${tone} rounded-t transition-all" style="height:${(pcent / max) * 100}%"></div>
        <span class="text-[9px] text-gray-600 group-hover:text-gray-400">${pcent}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function gradesTable(rows) {
    if (!rows || !rows.length) return empty('لم يخض أي اختبار بعد');
    return `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="text-gray-500 text-xs border-b border-white/10">
        <th class="text-right py-2 font-medium">الاختبار</th><th class="py-2 font-medium">النوع</th><th class="py-2 font-medium">النسبة</th><th class="py-2 font-medium">التاريخ</th>
      </tr></thead><tbody>
      ${rows.map(r => {
        const p = r.percentage;
        const tone = p == null ? 'text-gray-400' : p < 50 ? 'text-red-400' : p < 65 ? 'text-yellow-400' : 'text-emerald-400';
        return `<tr class="border-b border-white/5">
          <td class="py-2.5 text-gray-200">${e(r.quizTitle || '—')}</td>
          <td class="py-2.5 text-center text-gray-500 text-xs">${e(r.kind)}</td>
          <td class="py-2.5 text-center font-bold ${tone}">${p != null ? p + '%' : (r.score ?? '—')}</td>
          <td class="py-2.5 text-center text-gray-600 text-xs">${fmtDate(r.date)}</td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  function notesList(notes) {
    if (!notes || !notes.length) return empty('لا توجد ملاحظات بعد');
    return `<div class="flex flex-col gap-2">${notes.map(n => `
      <div class="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
        <div class="min-w-0 flex-1"><div class="text-sm text-gray-200">${e(n.text)}</div><div class="text-[11px] text-gray-600 mt-1">${e(n.by)} · ${fmtDateTime(n.createdAt)}</div></div>
        <button onclick="Teacher.deleteNote('${e(n.id)}')" aria-label="حذف" class="shrink-0 text-gray-600 hover:text-red-400 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>`).join('')}</div>`;
  }

  /* ====== أفعال الطالب ====== */
  async function toggleRestrict(email, restrict) {
    const r = await post('/api/admin/teacher/toggle-restrict', { email, restrict });
    if (r) { toast(r.message, 'success'); openProfile(email); }
  }
  async function promptNote(email) {
    const text = window.prompt('اكتب ملاحظتك على الطالب:');
    if (!text || !text.trim()) return;
    const r = await post('/api/admin/teacher/add-note', { email, text });
    if (r) {
      toast(r.message, 'success');
      if (currentProfile) { const p = await post('/api/admin/teacher/student-profile', { email }); if (p) { currentProfile = p; const el = document.getElementById('profile-notes'); if (el) el.innerHTML = notesList(p.notes); } }
    }
  }
  async function deleteNote(id) {
    const r = await del('/api/admin/teacher/note/' + id);
    if (r && currentProfile) {
      toast(r.message, 'success');
      const p = await post('/api/admin/teacher/student-profile', { email: currentProfile.student.email });
      if (p) { currentProfile = p; const el = document.getElementById('profile-notes'); if (el) el.innerHTML = notesList(p.notes); }
    }
  }
  function promptMessage(email, name) {
    openMessageForm(email, name);
  }
  function editStudent() {
    if (!currentProfile) return;
    const s = currentProfile.student;
    const v = (l, val) => { const x = window.prompt(l, val || ''); return x === null ? undefined : x.trim(); };
    const update = { email: s.email };
    const f1 = v('الاسم الأول', s.first_name); if (f1 !== undefined) update.first_name = f1;
    const f2 = v('الاسم الثاني', s.second_name); if (f2 !== undefined) update.second_name = f2;
    const ph = v('رقم الهاتف', s.phone); if (ph !== undefined) update.phone = ph;
    const pph = v('هاتف ولي الأمر', s.parentPhone); if (pph !== undefined) update.parent_phone = pph;
    if (Object.keys(update).length <= 1) return;
    post('/api/admin/teacher/update-student', update).then(r => { if (r) { toast(r.message, 'success'); openProfile(s.email); } });
  }

  /* ════════════════════════════════════════════════════════════
     3) التحليلات العامة
     ════════════════════════════════════════════════════════════ */
  async function loadAnalytics() {
    set('analytics-body', loading());
    const d = await post('/api/admin/teacher/analytics', {});
    if (!d) { set('analytics-body', empty('تعذّر التحميل')); return; }

    const rankList = (arr, positive) => arr.length ? arr.map((s, i) => `
      <button onclick="Teacher.openProfile('${e(s.email)}')" class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition text-right">
        <span class="shrink-0 w-6 h-6 grid place-items-center rounded-full text-xs font-bold ${positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}">${i + 1}</span>
        <div class="min-w-0 flex-1"><div class="text-sm text-white truncate">${e(s.name)}</div><div class="text-[11px] text-gray-500 truncate">${e(s.grade)}</div></div>
        <span class="shrink-0 text-sm font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}">${s.points}%</span>
      </button>`).join('') : empty('لا توجد بيانات');

    const lvl = d.levelDistribution || {};
    const lvlTotal = Object.values(lvl).reduce((a, b) => a + b, 0) || 1;
    const lvlColors = { 'متفوق':'emerald', 'جيد':'lime', 'متوسط':'yellow', 'متعثر':'red', 'لم يبدأ':'gray' };
    const levelBars = Object.entries(lvl).map(([k, v]) => `
      <div class="flex items-center gap-3 py-1.5">
        <span class="text-xs text-gray-300 w-16 shrink-0">${e(k)}</span>
        <div class="flex-1">${bar(Math.round((v / lvlTotal) * 100), lvlColors[k] || 'gray')}</div>
        <span class="text-xs font-bold text-white w-8 text-left">${v}</span>
      </div>`).join('');

    const hardest = (d.hardestLessons || []).length ? d.hardestLessons.map(c => `
      <div class="flex items-center gap-3 py-2">
        <div class="min-w-0 flex-1"><div class="text-sm text-gray-200 truncate">${e(c.courseName)}</div><div class="text-[11px] text-gray-600">${e(c.grade)} · ${c.students} طالب</div></div>
        <span class="shrink-0 text-xs font-bold ${c.completionRate < 40 ? 'text-red-400' : 'text-yellow-400'}">${c.completionRate}%</span>
      </div>`).join('') : empty('لا توجد بيانات');

    const trend = (d.progressOverTime || []).filter(w => w.avg !== null);
    const trendChart = trend.length ? `<div class="flex items-end gap-2 h-40">${d.progressOverTime.map(w => {
      const v = w.avg || 0;
      const tone = v === 0 ? 'bg-white/10' : v < 50 ? 'bg-red-500' : v < 65 ? 'bg-yellow-500' : 'bg-emerald-500';
      return `<div class="flex-1 flex flex-col items-center gap-1 group" title="${e(w.label)}: ${w.avg ?? '—'}%">
        <div class="w-full ${tone} rounded-t transition-all" style="height:${v}%"></div>
        <span class="text-[9px] text-gray-600 text-center leading-tight">${w.avg ?? '—'}</span>
      </div>`;
    }).join('')}</div>` : empty('لا توجد بيانات كافية');

    set('analytics-body', `
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        ${kpi('متوسط الفهم العام', `${d.understanding}%`, `${d.totalAttempts} محاولة اختبار`, d.understanding < 50 ? 'red-400' : d.understanding < 65 ? 'yellow-400' : 'emerald-400')}
        ${kpi('متفوقون', lvl['متفوق'] || 0, '85% فأعلى', 'emerald-400')}
        ${kpi('متعثرون', lvl['متعثر'] || 0, 'أقل من 50%', 'red-400')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${card(`<h3 class="text-white font-bold mb-3 text-emerald-400">أفضل 5 طلاب</h3><div class="-mx-1">${rankList(d.topStudents, true)}</div>`)}
        ${card(`<h3 class="text-white font-bold mb-3 text-red-400">أضعف 5 طلاب</h3><div class="-mx-1">${rankList(d.bottomStudents, false)}</div>`)}
        ${card(`<h3 class="text-white font-bold mb-3">توزيع المستويات</h3>${levelBars}`)}
        ${card(`<h3 class="text-white font-bold mb-3">أصعب الدروس (أقل إكمال)</h3>${hardest}`)}
        ${card(`<h3 class="text-white font-bold mb-1">تطور الأداء (آخر 8 أسابيع)</h3><p class="text-[11px] text-gray-500 mb-3">متوسط نسب الاختبارات أسبوعيًا</p>${trendChart}`, 'lg:col-span-2')}
      </div>`);
  }

  /* ════════════════════════════════════════════════════════════
     4) تحليل الكورسات
     ════════════════════════════════════════════════════════════ */
  let courseGrade = '';
  function renderCourseShell() {
    set('course-analytics-body', `
      <div class="mb-4">${gradeSelect('ca-grade', 'Teacher.loadCourseAnalytics()', courseGrade)}</div>
      <div id="ca-result">${empty('اختر المرحلة لعرض تحليل الكورسات')}</div>`);
    if (courseGrade) loadCourseAnalytics();
  }
  async function loadCourseAnalytics() {
    const sel = document.getElementById('ca-grade');
    courseGrade = sel ? sel.value : courseGrade;
    if (!courseGrade) { set('ca-result', empty('اختر المرحلة أولًا')); return; }
    set('ca-result', loading());
    const d = await post('/api/admin/teacher/course-analytics', { grade: courseGrade });
    if (!d) { set('ca-result', empty('تعذّر التحميل')); return; }

    const courses = d.courses.length ? d.courses.map(c => `
      <div class="flex items-center gap-3 py-2.5 border-b border-white/5">
        <div class="min-w-0 flex-1">
          <div class="text-sm text-gray-200 truncate">${e(c.courseName)}</div>
          <div class="mt-1.5">${bar(c.completionRate, c.completionRate < 40 ? 'red' : c.completionRate < 70 ? 'yellow' : 'emerald')}</div>
        </div>
        <div class="shrink-0 text-left"><div class="text-sm font-bold text-white">${c.completionRate}%</div><div class="text-[11px] text-gray-600">${c.watchers} مشاهد</div></div>
      </div>`).join('') : empty('لا توجد كورسات لهذا الصف');

    set('ca-result', `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        ${kpi('طلاب الصف', d.totalStudents, 'مقبولون')}
        ${kpi('عدد الكورسات', d.totalCourses, `${d.counts.articles} مقال`)}
        ${kpi('متوسط الإكمال', `${d.avgCompletion}%`, '', d.avgCompletion < 40 ? 'red-400' : d.avgCompletion < 70 ? 'yellow-400' : 'emerald-400')}
        ${kpi('متوسط التقييم', `${d.avgPoints}%`)}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2">${card(`<h3 class="text-white font-bold mb-3">نسبة إكمال كل درس</h3>${courses}`)}</div>
        <div class="flex flex-col gap-4">
          ${d.hardestCourse ? card(`<h3 class="text-yellow-400 font-bold mb-2 text-sm">أصعب درس (أقل إكمال)</h3><div class="text-white font-medium">${e(d.hardestCourse.courseName)}</div><div class="text-3xl font-extrabold text-red-400 mt-1">${d.hardestCourse.completionRate}%</div><div class="text-[11px] text-gray-500 mt-1">${d.hardestCourse.watchers} مشاهد فقط</div>`) : ''}
          ${card(`<h3 class="text-white font-bold mb-3 text-sm">محتوى الصف</h3>
            <div class="flex flex-col gap-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">اختبارات المنصة</span><span class="text-white font-bold">${d.counts.quizzes}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">اختبارات عامة</span><span class="text-white font-bold">${d.counts.publicQuizzes}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">اختبارات ورقية</span><span class="text-white font-bold">${d.counts.tests}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">مقالات</span><span class="text-white font-bold">${d.counts.articles}</span></div>
            </div>`)}
        </div>
      </div>`);
  }

  /* ════════════════════════════════════════════════════════════
     5) تحليل الاختبارات
     ════════════════════════════════════════════════════════════ */
  let examGrade = '';
  function renderExamShell() {
    set('exam-analytics-body', `
      <div class="mb-4">${gradeSelect('ea-grade', 'Teacher.loadExamList()', examGrade)}</div>
      <div id="ea-list">${empty('اختر المرحلة لعرض اختباراتها')}</div>
      <div id="ea-detail" class="mt-4"></div>`);
    if (examGrade) loadExamList();
  }
  async function loadExamAnalytics() { renderExamShell(); }
  async function loadExamList() {
    const sel = document.getElementById('ea-grade');
    examGrade = sel ? sel.value : examGrade;
    set('ea-detail', '');
    if (!examGrade) { set('ea-list', empty('اختر المرحلة أولًا')); return; }
    set('ea-list', loading());
    const d = await post('/api/admin/teacher/quiz-list', { grade: examGrade });
    if (!d) { set('ea-list', empty('تعذّر التحميل')); return; }
    if (!d.quizzes.length) { set('ea-list', empty('لا توجد اختبارات لهذا الصف')); return; }

    set('ea-list', `<div class="grid grid-cols-1 md:grid-cols-2 gap-2">${d.quizzes.map(q => `
      <button onclick="Teacher.openQuiz('${e(q.id)}')" class="text-right bg-white/[0.03] border border-white/10 rounded-xl p-3 hover:border-yellow-500/40 transition">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-white truncate">${e(q.title)}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-gray-400 shrink-0">${e(q.kind)}</span>
        </div>
        <div class="flex items-center gap-4 mt-2 text-[11px] text-gray-500">
          <span>${q.questions} سؤال</span><span>${q.attempts} محاولة</span>
          ${q.avg !== null ? `<span class="font-bold ${q.avg < 50 ? 'text-red-400' : q.avg < 65 ? 'text-yellow-400' : 'text-emerald-400'}">متوسط ${q.avg}%</span>` : '<span>لا محاولات</span>'}
        </div>
      </button>`).join('')}</div>`);
  }

  async function openQuiz(quizId) {
    set('ea-detail', loading());
    const d = await post('/api/admin/teacher/quiz-analytics', { grade: examGrade, quizId });
    if (!d) { set('ea-detail', empty('تعذّر التحميل')); return; }
    const s = d.summary;
    const dist = d.distribution;
    const distTotal = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
    const distColors = { '0-49':'red', '50-64':'yellow', '65-84':'lime', '85-100':'emerald' };
    const distBars = Object.entries(dist).map(([k, v]) => `
      <div class="flex items-center gap-3 py-1.5">
        <span class="text-xs text-gray-400 w-14 shrink-0">${k}%</span>
        <div class="flex-1">${bar(Math.round((v / distTotal) * 100), distColors[k])}</div>
        <span class="text-xs font-bold text-white w-8 text-left">${v}</span>
      </div>`).join('');

    const hardest = d.hardestQuestions.length ? d.hardestQuestions.map(q => `
      <div class="p-3 rounded-xl bg-red-500/5 border border-red-500/15 mb-2">
        <div class="flex items-start gap-2"><span class="text-xs font-bold text-red-400 shrink-0">س${q.index}</span><span class="text-sm text-gray-200">${e(q.questionText)}</span></div>
        <div class="text-[11px] text-gray-500 mt-1.5">${q.correctRate}% أجابوا صح · ${q.wrong} خطأ من ${q.answered}</div>
      </div>`).join('') : empty('لا توجد بيانات أسئلة');

    const allQ = d.questions.map(q => {
      const opts = (q.options || []).map((o, i) => {
        const isCorrect = i === q.correctAnswer;
        const cnt = q.optionCounts[i] || 0;
        const pcent = q.answered ? Math.round((cnt / q.answered) * 100) : 0;
        return `<div class="flex items-center gap-2 text-xs py-1">
          <span class="${isCorrect ? 'text-emerald-400 font-bold' : 'text-gray-400'} flex-1">${isCorrect ? '✓ ' : ''}${e(o)}</span>
          <span class="text-gray-600">${cnt} (${pcent}%)</span>
        </div>`;
      }).join('');
      return `<div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 mb-2">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-start gap-2"><span class="text-xs font-bold text-gray-500 shrink-0">س${q.index}</span><span class="text-sm text-gray-200">${e(q.questionText)}</span></div>
          <span class="text-xs font-bold shrink-0 ${q.correctRate < 50 ? 'text-red-400' : q.correctRate < 70 ? 'text-yellow-400' : 'text-emerald-400'}">${q.correctRate}%</span>
        </div>${opts}</div>`;
    }).join('');

    const students = d.students.length ? d.students.map((st, i) => `
      <div class="flex items-center gap-2 p-2 rounded-lg ${i % 2 ? 'bg-white/[0.02]' : ''}">
        <span class="text-xs text-gray-600 w-5">${i + 1}</span>
        <span class="text-sm text-gray-200 flex-1 truncate">${e(st.name)}</span>
        <span class="text-sm font-bold ${st.percentage == null ? 'text-gray-500' : st.percentage < 50 ? 'text-red-400' : st.percentage < 65 ? 'text-yellow-400' : 'text-emerald-400'}">${st.percentage != null ? st.percentage + '%' : (st.score ?? '—')}</span>
      </div>`).join('') : empty('لا نتائج');

    set('ea-detail', card(`
      <div class="flex items-center justify-between gap-2 mb-4">
        <h3 class="text-white font-bold">${e(d.quiz.title)}</h3>
        <span class="text-[11px] text-gray-500">${d.quiz.totalQuestions} سؤال</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        ${kpi('عدد المحاولات', s.attempts)}
        ${kpi('المتوسط', `${s.avg}%`, '', s.avg < 50 ? 'red-400' : s.avg < 65 ? 'yellow-400' : 'emerald-400')}
        ${kpi('نسبة النجاح', `${s.passRate}%`, '50% فأعلى')}
        ${kpi('أعلى/أدنى', `${s.topScore}/${s.lowScore}`, 'نسبة مئوية')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>${card(`<h4 class="text-white font-bold text-sm mb-3">توزيع الدرجات</h4>${distBars}`, 'bg-white/[0.02]')}</div>
        <div>${card(`<h4 class="text-white font-bold text-sm mb-3 text-red-400">أصعب 3 أسئلة</h4>${hardest}`, 'bg-white/[0.02]')}</div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>${card(`<h4 class="text-white font-bold text-sm mb-3">تحليل كل الأسئلة</h4><div class="max-h-96 overflow-y-auto">${allQ}</div>`, 'bg-white/[0.02]')}</div>
        <div>${card(`<h4 class="text-white font-bold text-sm mb-3">ترتيب الطلاب</h4><div class="max-h-96 overflow-y-auto">${students}</div>`, 'bg-white/[0.02]')}</div>
      </div>`));
    document.getElementById('ea-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ════════════════════════════════════════════════════════════
     6) الواجبات
     ════════════════════════════════════════════════════════════ */
  let hwGrade = '';
  function renderHomeworkShell() {
    set('homework-body', `
      <div class="mb-4">${gradeSelect('hw-grade', 'Teacher.loadHomework()', hwGrade)}</div>
      <div id="hw-list">${loading()}</div>`);
    loadHomework();
  }
  async function loadHomework() {
    const sel = document.getElementById('hw-grade');
    hwGrade = sel ? sel.value : hwGrade;
    set('hw-list', loading());
    const d = await post('/api/admin/teacher/homework/list', { grade: hwGrade || 'all' });
    if (!d) { set('hw-list', empty('تعذّر التحميل')); return; }
    if (!d.homeworks.length) { set('hw-list', empty('لا توجد واجبات. أنشئ واجبًا جديدًا من الزر بالأعلى.')); return; }

    set('hw-list', `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${d.homeworks.map(h => `
      <div class="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0"><h4 class="text-white font-bold text-sm truncate">${e(h.title)}</h4><div class="text-[11px] text-gray-500 mt-0.5">${e(h.grade)} ${h.courseName ? '· ' + e(h.courseName) : ''}</div></div>
          <button onclick="Teacher.deleteHomework('${e(h.id)}')" aria-label="حذف" class="shrink-0 text-gray-600 hover:text-red-400 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6"/></svg></button>
        </div>
        ${h.description ? `<p class="text-xs text-gray-400 mt-2 line-clamp-2">${e(h.description)}</p>` : ''}
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div class="text-[11px] text-gray-500">${h.dueDate ? 'يستحق ' + fmtDate(h.dueDate) : 'بدون موعد'} · ${h.maxGrade} درجة</div>
          <button onclick="Teacher.openSubmissions('${e(h.id)}')" class="text-xs px-3 py-1.5 rounded-lg bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition">${h.submissions} تسليم (${h.graded} مصحح)</button>
        </div>
      </div>`).join('')}</div>`);
  }

  async function deleteHomework(id) {
    if (!window.confirm('حذف الواجب وكل تسليماته؟')) return;
    const r = await del('/api/admin/teacher/homework/' + id);
    if (r) { toast(r.message, 'success'); loadHomework(); }
  }

  function openHomeworkForm() {
    const title = window.prompt('عنوان الواجب:');
    if (!title || !title.trim()) return;
    const grade = window.prompt('المرحلة (انسخها بالضبط):\n' + GRADES.join('\n'), hwGrade || GRADES[9]);
    if (!grade || !grade.trim()) return;
    const description = window.prompt('وصف الواجب (اختياري):') || '';
    const dueDate = window.prompt('موعد التسليم (YYYY-MM-DD) اختياري:') || '';
    const maxGrade = window.prompt('الدرجة العظمى:', '100') || '100';
    post('/api/admin/teacher/homework/create', { title, grade: grade.trim(), description, dueDate, maxGrade })
      .then(r => { if (r) { toast(r.message, 'success'); hwGrade = grade.trim(); renderHomeworkShell(); } });
  }

  async function openSubmissions(homeworkId) {
    set('hw-list', loading());
    const d = await post('/api/admin/teacher/homework/submissions', { homeworkId });
    if (!d) { loadHomework(); return; }
    const subs = d.submissions.length ? d.submissions.map(s => `
      <div class="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-white text-sm font-medium">${e(s.name)}</span>
          ${s.grade !== null ? `<span class="text-xs font-bold text-emerald-400">${s.grade}/${d.homework.maxGrade}</span>` : '<span class="text-xs text-sky-400">بانتظار التصحيح</span>'}
        </div>
        <div class="text-xs text-gray-400 bg-black/30 rounded-lg p-2.5 whitespace-pre-wrap mb-2">${e(s.answer || '(لا يوجد نص إجابة)')}</div>
        ${s.feedback ? `<div class="text-[11px] text-yellow-400/80 mb-2">ملاحظتك: ${e(s.feedback)}</div>` : ''}
        <div class="flex items-center justify-between">
          <span class="text-[11px] text-gray-600">سُلّم ${fmtDateTime(s.createdAt)}</span>
          <button onclick="Teacher.gradeSubmission('${e(s.id)}', ${d.homework.maxGrade})" class="text-xs px-3 py-1.5 rounded-lg bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition">${s.grade !== null ? 'تعديل الدرجة' : 'تصحيح'}</button>
        </div>
      </div>`).join('') : empty('لا توجد تسليمات بعد');

    set('hw-list', `
      <button onclick="Teacher.loadHomework()" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">→ رجوع للواجبات</button>
      <h3 class="text-white font-bold mb-1">${e(d.homework.title)}</h3>
      <p class="text-xs text-gray-500 mb-4">${d.submissions.length} تسليم · الدرجة العظمى ${d.homework.maxGrade}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${subs}</div>`);
  }

  async function gradeSubmission(id, maxGrade) {
    const g = window.prompt(`الدرجة (من ${maxGrade}):`);
    if (g === null) return;
    const feedback = window.prompt('ملاحظة للطالب (اختياري):') || '';
    const r = await post('/api/admin/teacher/homework/grade/' + id, { grade: g, feedback });
    if (r) { toast(r.message, 'success'); loadHomework(); }
  }

  /* ════════════════════════════════════════════════════════════
     7) التواصل
     ════════════════════════════════════════════════════════════ */
  async function loadMessages() {
    set('messages-body', loading());
    const d = await post('/api/admin/teacher/messages', {});
    if (!d) { set('messages-body', empty('تعذّر التحميل')); return; }
    if (!d.messages.length) { set('messages-body', empty('لا توجد رسائل. أرسل رسالة جديدة من الزر بالأعلى.')); return; }

    set('messages-body', `<div class="flex flex-col gap-2 max-w-3xl">${d.messages.map(m => `
      <div class="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h4 class="text-white font-bold text-sm">${e(m.title)}</h4>
            <span class="text-[11px] text-gray-500">${m.target ? 'إلى: ' + e(m.target) : 'إلى صف: ' + e(m.grade === 'all' ? 'جميع الطلاب' : m.grade)}</span>
          </div>
          <button onclick="Teacher.deleteMessage('${e(m.id)}')" aria-label="حذف" class="shrink-0 text-gray-600 hover:text-red-400 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <p class="text-sm text-gray-300 mt-2 whitespace-pre-wrap">${e(m.body)}</p>
        <div class="text-[11px] text-gray-600 mt-2">${fmtDateTime(m.createdAt)} · ${m.reads} قراءة</div>
      </div>`).join('')}</div>`);
  }

  function openMessageForm(email, name) {
    const title = window.prompt('عنوان الرسالة:', 'رسالة من المستر');
    if (title === null) return;
    const body = window.prompt(email ? `الرسالة إلى ${name || email}:` : 'نص الرسالة:');
    if (!body || !body.trim()) return;
    const payload = { title, body };
    if (email) payload.email = email;
    else {
      const grade = window.prompt('أرسل لصف معيّن (انسخه) أو اتركه فارغًا لكل الطلاب:\n' + GRADES.join('\n'), '');
      if (grade && grade.trim()) payload.grade = grade.trim();
    }
    post('/api/admin/teacher/message', payload).then(r => {
      if (r) { toast(r.message, 'success'); if (document.getElementById('tab-messages')?.classList.contains('active')) loadMessages(); }
    });
  }
  async function deleteMessage(id) {
    if (!window.confirm('حذف الرسالة؟')) return;
    const r = await del('/api/admin/teacher/message/' + id);
    if (r) { toast(r.message, 'success'); loadMessages(); }
  }

  /* ════════════════════════════════════════════════════════════
     Router — يُستدعى من switchTab
     ════════════════════════════════════════════════════════════ */
  const _loaded = {};
  function onTab(tabId) {
    switch (tabId) {
      case 'command': loadCommand(); break;
      case 'roster': renderRosterShell(); break;
      case 'analytics': loadAnalytics(); break;
      case 'course-analytics': renderCourseShell(); break;
      case 'exam-analytics': renderExamShell(); break;
      case 'homework': renderHomeworkShell(); break;
      case 'messages': loadMessages(); break;
    }
  }

  function go(tab) { if (typeof window.switchTab === 'function') window.switchTab(tab); }

  // تحميل لوحة القيادة عند فتح الصفحة (هي التبويب النشط افتراضيًا)
  function init() {
    if (document.getElementById('tab-command')?.classList.contains('active')) loadCommand();
    // إغلاق المودال بالضغط على الخلفية / Esc
    const modal = document.getElementById('student-profile-modal');
    if (modal) modal.addEventListener('click', (ev) => { if (ev.target === modal) closeProfile(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeProfile(); });
  }

  return {
    onTab, go, init,
    loadCommand, loadAnalytics, loadCourseAnalytics, loadExamAnalytics,
    // roster
    rosterFilter, rosterSearchDebounced,
    // profile
    openProfile, closeProfile, profileTab: switchProfileTab,
    toggleRestrict, promptNote, deleteNote, promptMessage, editStudent,
    // exams
    loadExamList, openQuiz,
    // homework
    loadHomework, openHomeworkForm, deleteHomework, openSubmissions, gradeSubmission,
    // messages
    loadMessages, openMessageForm, deleteMessage
  };
})();
