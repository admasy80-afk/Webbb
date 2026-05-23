// ==========================================
// 📚 [MODULE] CONTENT MANAGEMENT & RESULTS MODAL
// ==========================================
import { API, ITEM_TYPE } from './config.js';
import { Http } from './http.js';
import { DOM } from './dom.js';
import { Scheduler } from './scheduler.js';
import { State } from './store.js';
import { Security } from './security.js';
import { Toast } from './events.js';
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
    Scheduler.write(() => { container.classList.remove('hidden'); container.animate([{opacity: 0}, {opacity: 1}], {duration: 300, fill: 'forwards'}); });
}

export function renderManageContent(grade) {
    const data = State.currentGradeData;
    if (!data) return;
    const buildHtml = (items, builder, emptyMsg) => items?.length ? items.map((item, i) => builder(item, i)).join('') : `<p class="text-gray-600 text-sm py-4 text-center italic">${Security.e(emptyMsg)}</p>`;
    
    DOM.fastAppend(DOM.get('managePublicQuizzes'), buildHtml(data.publicQuizzes, (q) => `<div class="bg-yellow-900/10 border border-yellow-500/20 p-4 rounded-xl flex justify-between items-center"><p class="font-bold text-white">${Security.e(q.title)}</p><button onclick="deleteContent('${grade}', '${ITEM_TYPE.PUBLIC_QUIZ}', '${q.id}')" class="text-red-400">حذف</button></div>`, 'لا توجد اختبارات'));
    DOM.fastAppend(DOM.get('manageQuizzes'), buildHtml(data.quizzes, (q) => `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center"><p class="font-bold text-white">${Security.e(q.title)}</p><button onclick="deleteContent('${grade}', '${ITEM_TYPE.QUIZ}', '${q.id}')" class="text-red-400">حذف</button></div>`, 'لا توجد اختبارات'));
}

export function deleteContent(grade, itemType, identifier, trashBtn = null) {
    if(typeof SysUI !== 'undefined') {
        SysUI.confirm('تأكيد الحذف نهائياً؟', async confirmed => {
            if (!confirmed) return;
            const res = await Http.postJSON(API.DELETE_ITEM, { grade, itemType, identifier }, `del-${identifier}`);
            if (res) { Toast.success('تم الحذف'); fetchGradeContent(); } else { Toast.error('خطأ في الحذف'); }
        });
    }
}
