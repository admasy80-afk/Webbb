// ==========================================
// 🔥 [NEW] DYNAMIC QUIZ BUILDERS & FORMS ENGINE
// ==========================================
import { DOM } from './dom.js';
import { Anim } from './anim.js';
import { Http } from './http.js';
import { API } from './config.js';
import { Toast } from './events.js';
import { trashSVG } from '../ui.js';

export const QuizBuilder = {
    addBlock(containerId, isPublic = false) {
        const container = DOM.get(containerId);
        if(!container) return;
        const qCount = container.children.length + 1;
        const block = document.createElement('div');
        block.className = 'mcq-block bg-black/30 border border-white/5 p-4 md:p-5 rounded-2xl relative animate-fade-in-up';
        block.innerHTML = `
            <button type="button" onclick="removeMCQBlock(this)" class="absolute top-4 left-4 text-gray-500 hover:text-red-400 bg-black/50 p-2 rounded-lg transition-colors" title="حذف السؤال">${trashSVG}</button>
            <div class="mb-4 pr-2 border-r-2 border-yellow-500">
                <label class="block text-sm font-bold text-yellow-500 mb-2">السؤال رقم ${qCount}</label>
                <textarea rows="2" required class="q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500 text-sm md:text-base" placeholder="اكتب نص السؤال هنا..."></textarea>
            </div>
            <div class="space-y-3 pl-2 md:pl-8">
                ${[1,2,3,4].map(i => `
                <div class="flex items-center gap-3">
                    <input type="radio" name="correct_${containerId}_${Date.now()}_${qCount}" value="${i-1}" ${i===1?'checked':''} class="w-4 h-4 text-yellow-500 focus:ring-yellow-500 border-gray-600">
                    <input type="text" required class="q-opt w-full bg-white/5 border border-transparent rounded-lg px-3 py-2 text-white outline-none focus:border-white/20 text-sm transition-colors" placeholder="الخيار ${i}">
                </div>`).join('')}
            </div>
        `;
        container.appendChild(block);
    },
    removeBlock(btn) {
        const block = btn.closest('.mcq-block');
        if(block) { block.style.opacity = '0'; setTimeout(() => block.remove(), 300); }
    },
    gatherData(containerId) {
        const container = DOM.get(containerId);
        if(!container) return [];
        const questions = [];
        container.querySelectorAll('.mcq-block').forEach(block => {
            const text = block.querySelector('.q-text').value;
            const options = Array.from(block.querySelectorAll('.q-opt')).map(i => i.value);
            const radioGroup = block.querySelector('input[type="radio"]:checked');
            if(text && options.every(o => o.trim() !== '') && radioGroup) {
                questions.push({ questionText: text, options: options, correctAnswer: parseInt(radioGroup.value) });
            }
        });
        return questions;
    }
};

if (typeof window !== 'undefined') {
    window.addMCQBlock = () => QuizBuilder.addBlock('dynamicQuestionsContainer', false);
    window.addPublicMCQBlock = () => QuizBuilder.addBlock('dynamicPublicQuestionsContainer', true);
    window.removeMCQBlock = (btn) => QuizBuilder.removeBlock(btn);
    window.copyPublicLink = () => {
        const input = DOM.get('publicQuizLinkInput');
        if(input && input.value) {
            navigator.clipboard.writeText(input.value);
            Toast.success('تم نسخ الرابط بنجاح');
        }
    };
}

export const FormsEngine = {
    bindAll() {
        this.bindPointsForm();
        this.bindTestsForm();
        this.bindContentForm();
        this.bindQuizForm();
        this.bindPublicQuizForm();
    },
    init() {
        if(typeof document === 'undefined') return;
        // إذا كان المستند قد اكتمل تحميله بالفعل (وهو الحال غالباً مع وحدات ES المؤجَّلة)
        // نربط النماذج فوراً، وإلا ننتظر اكتمال التحميل — لضمان عمل نموذج "نتائج الاختبارات" دائماً
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindAll());
        } else {
            this.bindAll();
        }
    },

    bindPointsForm() {
        const form = DOM.get('pointsForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('savePointsBtn');
            const email = DOM.get('studentEmail').value;
            const points = DOM.get('pointsAmount').value;
            
            Anim.triggerRipple(btn);
            btn.disabled = true; btn.textContent = 'جاري التحديث...';
            
            const res = await Http.postJSON(API.UPDATE_POINTS, { studentEmail: email, points: parseInt(points) }, 'pts_add');
            btn.disabled = false; btn.textContent = 'تحديث التقييم';
            
            if(res) { Toast.success('تم تحديث تقييم الطالب بنجاح'); form.reset(); }
            else { Toast.error('فشل تحديث التقييم. تأكد من صحة البريد.'); }
        });
    },

    bindTestsForm() {
        const form = DOM.get('testsForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('saveTestBtn');
            const testName = DOM.get('testName').value.trim();
            const grade = DOM.get('testGrade').value;
            const maxScore = parseFloat(DOM.get('testMaxScore').value);

            if(!testName) return Toast.warning('الرجاء كتابة عنوان الاختبار');
            if(!grade) return Toast.warning('الرجاء اختيار الصف الدراسي');
            if(!Number.isFinite(maxScore) || maxScore <= 0) return Toast.warning('الرجاء إدخال الدرجة الكلية للاختبار');

            const scores = [];
            let invalidRow = false;
            document.getElementById('scoresContainer').querySelectorAll('.score-row').forEach(row => {
                const name = row.querySelector('.test-student-name').value.trim();
                const score = parseFloat(row.querySelector('.test-student-score').value);
                if(name && Number.isFinite(score)) {
                    if(score > maxScore) invalidRow = true;
                    scores.push({ studentName: name, score });
                }
            });

            if(scores.length === 0) return Toast.warning('الرجاء إضافة درجة طالب واحد على الأقل');
            if(invalidRow) return Toast.warning('توجد درجة طالب أكبر من الدرجة الكلية للاختبار');

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.textContent = 'جاري النشر...';
            
            const res = await Http.postJSON(API.SAVE_TEST, { testName, grade, maxScore, scores }, 'test_add');
            btn.disabled = false; btn.textContent = 'نشر النتائج للطلاب';
            
            if(res) { 
                Toast.success('تم نشر النتائج للطلاب بنجاح'); 
                form.reset(); 
                document.getElementById('scoresContainer').innerHTML = ''; 
            } else { Toast.error('فشل حفظ الاختبار'); }
        });
    },

    bindContentForm() {
        const form = DOM.get('contentForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('saveContentBtn');
            const grade = DOM.get('contentGrade').value;
            const type = DOM.get('contentType').value;
            
            let payload = { grade, type };
            if(type === 'point') {
                payload.text = DOM.get('pointText').value;
                if(!payload.text) return Toast.warning('الرجاء كتابة الملاحظة');
            } else {
                payload.question = DOM.get('questionText').value;
                payload.hint = DOM.get('questionHint').value;
                if(!payload.question) return Toast.warning('الرجاء كتابة السؤال');
            }

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.textContent = 'جاري النشر...';
            
            const res = await Http.postJSON(API.SAVE_CONTENT, payload, 'content_add');
            btn.disabled = false; btn.textContent = 'نشر المحتوى';
            
            if(res) { Toast.success('تم نشر المحتوى بنجاح'); form.reset(); }
            else { Toast.error('فشل نشر المحتوى'); }
        });
    },

    bindQuizForm() {
        const form = DOM.get('quizForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('saveQuizBtn');
            const title = DOM.get('quizTitle').value;
            const grade = DOM.get('quizGrade').value;
            const questions = QuizBuilder.gatherData('dynamicQuestionsContainer');
            
            if(questions.length === 0) return Toast.warning('الرجاء إضافة سؤال واحد على الأقل وإكمال بياناته');

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.textContent = 'جاري المعالجة والنشر...';
            
            const res = await Http.postJSON(API.SAVE_QUIZ, { title, grade, questions, isPublic: false }, 'quiz_add');
            btn.disabled = false; btn.textContent = 'نشر الاختبار للطلاب';
            
            if(res) { 
                Toast.success('تم نشر الاختبار للمنصة بنجاح!'); 
                form.reset(); 
                DOM.get('dynamicQuestionsContainer').innerHTML = ''; 
            } else { Toast.error('فشل إنشاء الاختبار'); }
        });
    },

    bindPublicQuizForm() {
        const form = DOM.get('publicQuizForm');
        if(!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = DOM.get('savePublicQuizBtn');
            const title = DOM.get('publicQuizTitle').value;
            const grade = DOM.get('publicQuizGrade').value;
            const questions = QuizBuilder.gatherData('dynamicPublicQuestionsContainer');
            
            if(questions.length === 0) return Toast.warning('الرجاء إضافة سؤال واحد على الأقل وإكمال بياناته');

            Anim.triggerRipple(btn);
            btn.disabled = true; btn.textContent = 'جاري إنشاء الرابط...';
            
            const res = await Http.postJSON(API.SAVE_PUB_QUIZ, { title, grade, questions, isPublic: true }, 'pub_quiz_add');
            btn.disabled = false; btn.textContent = 'حفظ وتوليد رابط الاختبار';
            
            if(res && res.quizId) { 
                Toast.success('تم إنشاء الاختبار بنجاح!'); 
                DOM.get('publicQuizLinkArea').classList.remove('hidden');
                DOM.get('publicQuizLinkInput').value = `${window.location.origin}/quiz.html?id=${res.quizId}`;
                form.reset(); 
                DOM.get('dynamicPublicQuestionsContainer').innerHTML = ''; 
            } else { Toast.error('فشل إنشاء الاختبار العام'); }
        });
    }
};

FormsEngine.init();
