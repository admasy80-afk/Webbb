// ==========================================
// 📊 [MODULES] DASHBOARD LOGIC
// ==========================================
import { API, STATUS } from './config.js';
import { Http } from './http.js';
import { DOM } from './dom.js';
import { Anim } from './anim.js';
import { Scheduler } from './scheduler.js';
import { State } from './store.js';
import { Security } from './security.js';
import { Toast, EventBus } from './events.js';
import { SysUI } from '../ui.js';

export async function fetchStats() {
    const data = await Http.postJSON(API.STATS, {}, 'stats');
    if (!data) return;
    const sCount = data.studentsCount || 0, pCount = data.pendingCount || 0;
    Anim.animateValue('stats-students', sCount, 1300);
    Anim.animateValue('stats-pending',  pCount, 1100);
    Scheduler.read(() => {
        if (sCount > 0) Anim.pulse(DOM.get('stats-students')?.closest('[data-stat]'));
        if (pCount > 0) Anim.pulse(DOM.get('stats-pending')?.closest('[data-stat]'));
    });
    Scheduler.write(() => {
        const badge = DOM.get('pendingBadge');
        if (badge) { badge.textContent = pCount; badge.style.display = pCount > 0 ? 'flex' : 'none'; }
    });
    if (sCount) Anim.animateValue('stats-acceptance-rate', Math.round(((data.acceptedCount||0) / sCount) * 100), 1000, '%');
}

export async function fetchPendingRequests() {
    const container = DOM.get('pendingRequestsContainer');
    if (!container) return;
    container.innerHTML = DOM.skeleton(3, 2);
    const students = await Http.postJSON(API.PENDING, {}, 'pending');
    if (!students) return container.innerHTML = DOM.emptyState('error', 'فشل الاتصال بالخادم');
    State.pendingRequests = students;
    if (!students.length) return container.innerHTML = DOM.emptyState('empty', 'لا توجد طلبات جديدة حالياً ✓');
    
    const html = students.map((st, i) => {
        const s = Security.sanitizeStudent(st);
        const fullName = [s.first_name, s.second_name, s.third_name, s.last_name].filter(Boolean).join(' ');
        return `<div class="req-card glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 opacity-0 transition-all duration-300">
            <div class="text-center md:text-right flex-1 min-w-0">
                <h4 class="font-bold text-white truncate text-base">${fullName}</h4>
                <div class="flex flex-wrap gap-1.5 mt-2 justify-center md:justify-start">
                    <span class="text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">${s.email}</span>
                    <span class="text-[11px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full font-semibold">${s.grade}</span>
                </div>
            </div>
            <div class="flex gap-2 w-full md:w-auto shrink-0">
                <button onclick="updateStudentStatus('${s.email}', '${STATUS.ACCEPTED}', '', this)" class="bg-green-500/10 text-green-400 border border-green-500/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-green-500 hover:text-black transition-all">✓ قبول</button>
                <button onclick="rejectStudent('${s.email}', this)" class="bg-red-500/10 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-500 hover:text-white transition-all">✕ رفض</button>
            </div></div>`;
    }).join('');
    DOM.fastAppend(container, html);
    Anim.staggerFadeIn(container, '.req-card', 0.06);
}

export async function updateStudentStatus(email, newStatus, reason = '', btnElement = null) {
    if (!email || !newStatus) return;
    if (btnElement) {
        Anim.triggerRipple(btnElement);
        Scheduler.write(() => { btnElement.disabled = true; btnElement.style.opacity = '0.65'; });
        const row = btnElement.closest('.req-card');
        if (row) setTimeout(() => Anim.slideOut(row, 'right'), 180);
    }
    const data = await Http.postJSON(API.UPDATE_STATUS, { studentEmail: email, newStatus, reason }, `status-${email}`);
    if (data !== null) {
        newStatus === STATUS.ACCEPTED ? Toast.success('✓ تم قبول الطالب بنجاح') : Toast.warning('تم رفض الطالب');
        State.invalidateStudents();
    } else {
        Toast.error('فشل تحديث الحالة');
        if (btnElement) Scheduler.write(() => { btnElement.disabled = false; btnElement.style.opacity = '1'; });
        return;
    }
    EventBus.emit('student:updated', null, 420);
}

export function rejectStudent(email, btnElement) {
    SysUI.prompt('سبب الرفض (سيظهر للطالب):', reason => {
        if (reason !== null) updateStudentStatus(email, STATUS.REJECTED, reason, btnElement);
    });
}

// إتاحة الدوال لعناصر HTML (onclick) فوراً عند تحميل الموديول
if (typeof window !== 'undefined') {
    window.updateStudentStatus = updateStudentStatus;
    window.rejectStudent = rejectStudent;
    window.fetchPendingRequests = fetchPendingRequests;
    window.fetchStats = fetchStats;
}

