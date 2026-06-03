// ==========================================
// 📚 [MODULE] CONTENT MANAGEMENT & RESULTS MODAL
// ==========================================
import { API, ITEM_TYPE } from './config.js';
import { Http } from './http.js';
import { DOM } from './dom.js';
import { Scheduler } from './scheduler.js';
import { State } from './store.js';
import { Security } from './security.js';
import { Toast, EventBus } from './events.js';
import { SysUI } from '../ui.js';

export async function fetchGradeContent() {
    const grade = DOM.get('manageGradeSelect')?.value;
    const container = DOM.get('manageContainer');
    const loading = DOM.get('manageLoading');
    if (!container || !loading || !grade) return;
    Scheduler.write(() => { container.style.opacity = '0'; setTimeout(() => container.classList.add('hidden'), 280); loading.classList.remove('hidden'); });
    const data = await Http.postJSON(API.GRADE_CONTENT, { grade }, `grade-content-${grade}`);
    Scheduler.write(() => { loading.classList.add('hidden'); });
    if (!data) return;
    State.currentGradeData = data;
    renderManageContent(grade);
    Scheduler.write(() => { container.classList.remove('hidden'); container.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' }); });
}

// ترميز آمن للمعرّفات لتجنّب كسر الـ onclick مع الحفاظ على القيمة الأصلية للمطابقة في السيرفر
const enc = (v) => encodeURIComponent(String(v ?? ''));

// زر صغير موحّد للحذف — id يُمرَّر مُرمّزاً ثم يُفكّ ترميزه قبل الإرسال
const delBtn = (grade, type, id) =>
    `<button onclick="deleteContent('${grade}', '${type}', '${enc(id)}', true)" class="shrink-0 text-red-400 hover:text-white hover:bg-red-500 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">حذف</button>`;

// زر عرض النتائج (للاختبارات التي تحتوي نتائج طلاب)
const resultsBtn = (grade, type, id, count) =>
    `<button onclick="viewResults('${grade}', '${type}', '${id}')" class="shrink-0 text-yellow-400 hover:text-black hover:bg-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">عرض النتائج (${count || 0})</button>`;

// زر رفع النتائج الورقية المرتبطة بالاختبار (للدفعة نفسها التي يخصّها الاختبار)
const uploadBtn = (grade, title) =>
    `<button onclick="uploadResultsForQuiz('${enc(grade)}','${enc(title)}')" class="shrink-0 text-emerald-400 hover:text-black hover:bg-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">رفع النتائج</button>`;

export function renderManageContent(grade) {
    const data = State.currentGradeData;
    if (!data) return;

    const buildHtml = (items, builder, emptyMsg) =>
        items?.length
            ? items.map((item, i) => builder(item, i)).join('')
            : `<p class="text-gray-600 text-sm py-4 text-center italic">${Security.e(emptyMsg)}</p>`;

    // 1) الاختبارات العامة (بالرابط) — فيها نتائج
    DOM.fastAppend(DOM.get('managePublicQuizzes'), buildHtml(data.publicQuizzes, (q) =>
        `<div class="bg-yellow-900/10 border border-yellow-500/20 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <p class="font-bold text-white flex-1 min-w-0 truncate">${Security.e(q.title)}</p>
            <div class="flex gap-2 shrink-0 flex-wrap justify-end">
                ${resultsBtn(grade, ITEM_TYPE.PUBLIC_QUIZ, q.id, (q.results || []).length)}
                ${uploadBtn(grade, q.title)}
                ${delBtn(grade, ITEM_TYPE.PUBLIC_QUIZ, q.id)}
            </div>
        </div>`, 'لا توجد اختبارات'));

    // 2) اختبارات المنصة (MCQ) — فيها نتائج
    DOM.fastAppend(DOM.get('manageQuizzes'), buildHtml(data.quizzes, (q) =>
        `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <p class="font-bold text-white flex-1 min-w-0 truncate">${Security.e(q.title)}</p>
            <div class="flex gap-2 shrink-0 flex-wrap justify-end">
                ${resultsBtn(grade, ITEM_TYPE.QUIZ, q.id, (q.results || []).length)}
                ${uploadBtn(grade, q.title)}
                ${delBtn(grade, ITEM_TYPE.QUIZ, q.id)}
            </div>
        </div>`, 'لا توجد اختبارات'));

    // 3) درجات الاختبارات الورقية
    const manageTests = DOM.get('manageTests');
    if (manageTests) {
        DOM.fastAppend(manageTests, buildHtml(data.tests, (t) =>
            `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-3">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-white truncate">${Security.e(t.testName)}</p>
                    <span class="text-xs text-gray-500">${(t.scores || []).length} طالب</span>
                </div>
                ${delBtn(grade, 'test', t.testName)}
            </div>`, 'لا توجد درجات ورقية'));
    }

    // 4) الأسئلة المقالية
    const manageQuestions = DOM.get('manageQuestions');
    if (manageQuestions) {
        DOM.fastAppend(manageQuestions, buildHtml(data.questions, (q) =>
            `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-3">
                <p class="text-white flex-1 min-w-0 truncate">${Security.e(q.question)}</p>
                ${delBtn(grade, ITEM_TYPE.QUESTION, q.question)}
            </div>`, 'لا توجد أسئلة مقالية'));
    }

    // 5) أهم نقاط المنهج
    const managePoints = DOM.get('managePoints');
    if (managePoints) {
        DOM.fastAppend(managePoints, buildHtml(data.points, (p) =>
            `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-3">
                <p class="text-white flex-1 min-w-0 truncate">${Security.e(p)}</p>
                ${delBtn(grade, ITEM_TYPE.POINT, p)}
            </div>`, 'لا توجد نقاط'));
    }
}

export function deleteContent(grade, itemType, identifier, isEncoded = false) {
    if (typeof SysUI === 'undefined') return;
    const realId = isEncoded ? decodeURIComponent(identifier) : identifier;
    SysUI.confirm('تأكيد الحذف نهائياً؟', async (confirmed) => {
        if (!confirmed) return;
        const res = await Http.postJSON(API.DELETE_ITEM, { grade, itemType, identifier: realId }, `del-${enc(realId)}`);
        if (res) {
            Toast.success('تم الحذف بنجاح');
            EventBus.emit('content:deleted', null);
            fetchGradeContent();
        } else {
            Toast.error('خطأ في الحذف (العنصر غير موجود أو فشل الاتصال)');
        }
    });
}

// 🌟 عرض نتائج الطلاب في المودال
export function viewResults(grade, itemType, identifier) {
    const data = State.currentGradeData;
    if (!data) return;

    const list = itemType === ITEM_TYPE.PUBLIC_QUIZ ? data.publicQuizzes : data.quizzes;
    const quiz = (list || []).find(q => q.id === identifier);
    if (!quiz) return Toast.error('تعذر العثور على بيانات الاختبار');

    const modal = DOM.get('resultsModal');
    const titleEl = DOM.get('resultsModalTitle');
    const contentEl = DOM.get('resultsModalContent');
    if (!modal || !contentEl) return;

    titleEl.innerHTML = `نتائج: ${Security.e(quiz.title)}`;

    const results = quiz.results || [];
    if (!results.length) {
        contentEl.innerHTML = `<p class="text-gray-500 text-center py-10 italic">لم يقم أي طالب بحل هذا الاختبار حتى الآن.</p>`;
    } else {
        const sorted = [...results].sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0));
        contentEl.innerHTML = sorted.map((r, i) => {
            const pct = Number(r.percentage) || 0;
            const color = pct >= 85 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
            const name = Security.e(r.studentName || r.email || 'طالب');
            return `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-white/5 text-xs font-bold text-gray-400">${i + 1}</span>
                    <div class="min-w-0">
                        <p class="font-bold text-white truncate">${name}</p>
                        ${r.email ? `<p class="text-[11px] text-gray-500 truncate" dir="ltr">${Security.e(r.email)}</p>` : ''}
                    </div>
                </div>
                <div class="text-left shrink-0">
                    <span class="text-lg font-black ${color}">${pct}%</span>
                    ${r.score != null ? `<p class="text-[11px] text-gray-500">${Security.e(String(r.score))} نقطة</p>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    modal.classList.remove('hidden');
    // أنيميشن ظهور للمودال (إعادة تشغيلها في كل مرة)
    const panel = modal.querySelector('.results-modal-panel') || modal.firstElementChild;
    if (panel) {
        panel.classList.remove('modal-pop');
        void panel.offsetWidth; // إعادة تدفّق لإعادة تشغيل الأنيميشن
        panel.classList.add('modal-pop');
    }
}

// ==========================================
// 🆕 رفع النتائج الورقية المرتبطة باختبار من صفحة إدارة المحتوى
// ==========================================
const GRADES = [
    'الصف الأول الابتدائي','الصف الثاني الابتدائي','الصف الثالث الابتدائي','الصف الرابع الابتدائي',
    'الصف الخامس الابتدائي','الصف السادس الابتدائي','الصف الأول الإعدادي','الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي','الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي'
];

function urAddRow(name = '', score = '') {
    const c = DOM.get('urScoresContainer');
    if (!c) return;
    const row = document.createElement('div');
    row.className = 'ur-row flex gap-2 sm:gap-3 items-center animate-fade-in-up';
    row.innerHTML = `
        <input type="text" value="${Security.e(name)}" placeholder="اسم الطالب (رباعي)" class="ur-name flex-1 min-w-0 bg-black/30 border border-white/10 rounded-xl px-3 sm:px-4 py-3 text-white outline-none focus:border-emerald-500 text-sm md:text-base transition-colors">
        <input type="number" inputmode="numeric" value="${Security.e(String(score))}" placeholder="الدرجة" class="ur-score w-16 sm:w-24 md:w-28 shrink-0 bg-black/30 border border-white/10 rounded-xl px-2 sm:px-4 py-3 text-white outline-none focus:border-emerald-500 text-sm md:text-base text-center transition-colors">
        <button type="button" onclick="this.parentElement.remove()" aria-label="حذف الصف" class="shrink-0 grid place-items-center w-11 h-11 sm:w-12 sm:h-12 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>`;
    c.appendChild(row);
    row.querySelector('.ur-name')?.focus();
}

export function uploadResultsForQuiz(encGrade, encTitle) {
    const grade = decodeURIComponent(encGrade || '');
    const title = decodeURIComponent(encTitle || '');
    const modal = DOM.get('uploadResultsModal');
    if (!modal) return;

    DOM.get('urTestName').textContent = title || 'اختبار';
    DOM.get('urMaxScore').value = '';
    DOM.get('urScoresContainer').innerHTML = '';
    urAddRow();

    // إذا كان الاختبار غير محدد الدفعة (عام أو فارغ) نطلب من المستر اختيار الدفعة
    const hasGrade = grade && grade !== 'عام';
    const gradeWrap = DOM.get('urGradeWrap');
    const gradeSelect = DOM.get('urGrade');
    if (hasGrade) {
        gradeWrap.classList.add('hidden');
        gradeSelect.value = grade;
        modal.dataset.fixedGrade = grade;
    } else {
        modal.dataset.fixedGrade = '';
        gradeSelect.innerHTML = '<option value="" disabled selected>اختر الدفعة المستهدفة...</option>' +
            GRADES.map(g => `<option value="${Security.e(g)}">${Security.e(g)}</option>`).join('');
        gradeWrap.classList.remove('hidden');
    }

    modal.dataset.title = title;
    modal.classList.remove('hidden');
    const panel = modal.querySelector('.results-modal-panel') || modal.firstElementChild;
    if (panel) { panel.classList.remove('modal-pop'); void panel.offsetWidth; panel.classList.add('modal-pop'); }
}

export function closeUploadResultsModal() {
    const modal = DOM.get('uploadResultsModal');
    if (modal) modal.classList.add('hidden');
}

export async function submitUploadResults() {
    const modal = DOM.get('uploadResultsModal');
    if (!modal) return;

    const grade = modal.dataset.fixedGrade || DOM.get('urGrade').value;
    const testName = modal.dataset.title || DOM.get('urTestName').textContent.trim();
    const maxScore = parseFloat(DOM.get('urMaxScore').value);

    if (!grade) return Toast.warning('الرجاء اختيار الدفعة المستهدفة');
    if (!Number.isFinite(maxScore) || maxScore <= 0) return Toast.warning('الرجاء إدخال الدرجة الكلية للاختبار');

    const scores = [];
    let invalid = false;
    DOM.get('urScoresContainer').querySelectorAll('.ur-row').forEach(row => {
        const name = row.querySelector('.ur-name').value.trim();
        const score = parseFloat(row.querySelector('.ur-score').value);
        if (name && Number.isFinite(score)) {
            if (score > maxScore) invalid = true;
            scores.push({ studentName: name, score });
        }
    });

    if (!scores.length) return Toast.warning('الرجاء إضافة درجة طالب واحد على الأقل');
    if (invalid) return Toast.warning('توجد درجة أكبر من الدرجة الكلية للاختبار');

    const btn = DOM.get('urSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري النشر...'; }

    const res = await Http.postJSON(API.SAVE_TEST, { testName, grade, maxScore, scores }, 'ur_test_add');

    if (btn) { btn.disabled = false; btn.textContent = 'نشر النتائج للطلاب'; }

    if (res) {
        Toast.success(`تم نشر نتائج "${testName}" لدفعة ${grade}`);
        closeUploadResultsModal();
        fetchGradeContent();
    } else {
        Toast.error('فشل نشر النتائج');
    }
}

// إتاحة الدوال لعناصر HTML (onclick) فوراً عند تحميل الموديول
if (typeof window !== 'undefined') {
    window.deleteContent = deleteContent;
    window.viewResults = viewResults;
    window.fetchGradeContent = fetchGradeContent;
    window.uploadResultsForQuiz = uploadResultsForQuiz;
    window.closeUploadResultsModal = closeUploadResultsModal;
    window.submitUploadResults = submitUploadResults;
    window.addUploadResultRow = () => urAddRow();
}
