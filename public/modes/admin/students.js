// ==========================================
// 🎓 [MODULE] STUDENTS & GRADES
// ==========================================
import { API, THRESHOLD } from './config.js';
import { Http } from './http.js';
import { DOM } from './dom.js';
import { Anim } from './anim.js';
import { State } from './store.js';
import { Security } from './security.js';

export async function fetchStudentsByGrade() {
    const grade = DOM.get('listGradeSelect')?.value;
    const container = DOM.get('studentsListContainer');
    if (!container || !grade) return;
    
    const cached = State.getCachedStudents(grade);
    if (cached) return _renderStudentsList(container, cached);
    
    container.innerHTML = DOM.skeleton(6);
    const students = await Http.postJSON(API.STUDENTS_GRADE, { grade }, 'students');
    if (!students) return container.innerHTML = DOM.emptyState('error', 'فشل الاتصال');
    
    State.setCachedStudents(grade, students);
    _renderStudentsList(container, students);
}

function _renderStudentsList(container, students) {
    if (!students.length) return container.innerHTML = DOM.emptyState('empty', 'لا يوجد طلاب في هذه الدفعة');
    const html = students.map((st) => {
        const s = Security.sanitizeStudent(st);
        const fullName = [s.first_name, s.second_name, s.third_name, s.last_name].filter(Boolean).join(' ');
        const pts = Math.max(0, Math.min(100, parseInt(st.points) || 0)); 
        const pColor = pts >= THRESHOLD.HIGH ? 'text-green-400' : pts >= THRESHOLD.PASS ? 'text-yellow-400' : 'text-red-400';
        const bColor = pts >= THRESHOLD.HIGH ? 'bg-green-500'   : pts >= THRESHOLD.PASS ? 'bg-yellow-500'  : 'bg-red-500';
        return `
        <div class="student-card bg-black/40 border border-white/5 rounded-xl p-4 opacity-0 transition-all duration-300">
            <div class="flex justify-between items-start mb-3">
                <div class="min-w-0 flex-1"><h4 class="font-bold text-white text-sm truncate">${fullName}</h4><p class="text-[11px] text-gray-500 mt-0.5 truncate">${s.email}</p></div>
                <div class="shrink-0 text-right ml-3"><p class="font-black text-xl ${pColor} tabular-nums">${pts}%</p></div>
            </div>
            <div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden"><div class="${bColor} h-full rounded-full transition-[width] duration-1000 ease-out" style="width:0%" data-w="${pts}%"></div></div>
        </div>`;
    }).join('');
    DOM.fastAppend(container, html);
    Anim.staggerFadeIn(container, '.student-card', 0.04);
    Anim.progressBars(container);
}

// إتاحة الدوال لعناصر HTML (onclick) فوراً عند تحميل الموديول
if (typeof window !== 'undefined') {
    window.fetchStudentsByGrade = fetchStudentsByGrade;
}

