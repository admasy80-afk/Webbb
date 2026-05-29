// ==================== 7. إنشاء اختبار (المنصة) و 8. الاختبار العام و 12. الاستيراد الذكي ====================
import { SysUI, trashSVG } from './ui.js';
import { user, sessionToken } from './state.js';

export let questionCounter = 0;
export let publicQuestionCounter = 0;

export function updateQuestionNumbers(container) {
    const blocks = container.querySelectorAll('.mcq-block .q-number, .public-mcq-block .q-number');
    blocks.forEach((span, index) => {
        span.innerText = index + 1;
        const blockEl = span.closest('.mcq-block, .public-mcq-block');
        if (blockEl) {
            blockEl.classList.add('animate-pulse', 'scale-[1.01]', 'shadow-[0_0_20px_rgba(234,179,8,0.2)]');
            setTimeout(() => blockEl.classList.remove('animate-pulse', 'scale-[1.01]', 'shadow-[0_0_20px_rgba(234,179,8,0.2)]'), 500);
        }
    });
}

// تعديل حجم مربع النص تلقائياً ليتناسب مع المحتوى (ميزة إضافية)
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
}

export const DraftSystem = {
    save() {
        const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
        if(blocks.length === 0) return;
        
        const draftData = {
            title: document.getElementById('quizTitle')?.value || '',
            grade: document.getElementById('quizGrade')?.value || '',
            questions: []
        };
        
        blocks.forEach(block => {
            const correctCheckboxes = block.querySelectorAll('.mcq-correct-chk:checked');
            const correctAnswers = Array.from(correctCheckboxes).map(cb => parseInt(cb.value));

            draftData.questions.push({
                q: block.querySelector('.mcq-q-text').value,
                opts: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correctAnswers: correctAnswers
            });
        });
        
        localStorage.setItem('dahih_quiz_draft', JSON.stringify(draftData));
        
        let saveIndicator = document.getElementById('save-indicator');
        if(!saveIndicator) {
            saveIndicator = document.createElement('div');
            saveIndicator.id = 'save-indicator';
            saveIndicator.className = 'fixed bottom-5 left-1/2 sm:left-5 -translate-x-1/2 sm:-translate-x-0 text-gray-300 text-sm flex items-center gap-3 transition-all duration-500 opacity-0 bg-gray-900/95 px-5 py-2.5 rounded-2xl border border-green-500/30 backdrop-blur-xl z-50 shadow-[0_10px_40px_rgba(0,0,0,0.5)] font-medium';
            saveIndicator.innerHTML = `
                <div class="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
                <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 
                <span>تم حفظ المسودة تلقائياً</span>
            `;
            document.body.appendChild(saveIndicator);
        }
        saveIndicator.style.opacity = '1';
        saveIndicator.style.transform = 'translateY(0) scale(1)';
        clearTimeout(this.indicatorTimeout);
        this.indicatorTimeout = setTimeout(() => {
            saveIndicator.style.opacity = '0';
            saveIndicator.style.transform = 'translateY(10px) scale(0.95)';
        }, 3000);
    },
    
    check() {
        const saved = localStorage.getItem('dahih_quiz_draft');
        if(saved) {
            const data = JSON.parse(saved);
            if(data.questions.length > 0 && (data.questions[0].q !== '' || data.title !== '')) {
                SysUI.confirm('يوجد امتحان تم العمل عليه سابقاً ولم يُنشر، هل تريد استعادة المسودة؟', (yes) => {
                    if(yes) {
                        if(document.getElementById('quizTitle')) document.getElementById('quizTitle').value = data.title;
                        if(document.getElementById('quizGrade')) document.getElementById('quizGrade').value = data.grade;
                        document.getElementById('dynamicQuestionsContainer').innerHTML = ''; 
                        questionCounter = 0;
                        
                        data.questions.forEach(qData => {
                            addMCQBlock(); 
                            const lastBlock = document.getElementById('dynamicQuestionsContainer').lastElementChild;
                            lastBlock.querySelector('.mcq-q-text').value = qData.q;
                            lastBlock.querySelector('.mcq-opt-0').value = qData.opts[0];
                            lastBlock.querySelector('.mcq-opt-1').value = qData.opts[1];
                            lastBlock.querySelector('.mcq-opt-2').value = qData.opts[2];
                            lastBlock.querySelector('.mcq-opt-3').value = qData.opts[3];
                            
                            // استعادة الإجابات المتعددة
                            const correctArr = qData.correctAnswers || (qData.correct !== undefined ? [parseInt(qData.correct)] : []);
                            correctArr.forEach(idx => {
                                const chk = lastBlock.querySelector(`.mcq-correct-chk[value="${idx}"]`);
                                if(chk) chk.checked = true;
                            });
                        });
                        SysUI.toast('success', 'تم استعادة المسودة بنجاح! 🚀');
                    } else {
                        localStorage.removeItem('dahih_quiz_draft'); 
                    }
                });
            }
        }
    }
};

export function addMCQBlock() {
    questionCounter++;
    const container = document.getElementById('dynamicQuestionsContainer');
    if (!container) return;
    const block = document.createElement('div');
    block.className = 'mcq-block glass-panel p-5 sm:p-7 rounded-3xl relative border border-white/5 border-l-4 border-l-yellow-500 animate-fade-in-up transition-all duration-300 hover:shadow-[0_15px_40px_rgba(234,179,8,0.08)] hover:border-white/10 group bg-gradient-to-b from-white/[0.02] to-transparent';
    block.draggable = window.innerWidth > 768; 
    
    block.style.opacity = "0";
    block.style.transform = "translateY(20px) scale(0.98)";

    block.innerHTML = `
        <div class="flex justify-between items-center mb-5 pb-3 border-b border-white/10 group-hover:border-white/20 transition-colors">
            <h3 class="text-base sm:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 flex items-center gap-3">
                <div class="cursor-grab active:cursor-grabbing p-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors hidden md:flex items-center justify-center">
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                </div>
                السؤال رقم <span class="q-number bg-yellow-500/20 text-yellow-500 px-2.5 py-0.5 rounded-md">${questionCounter}</span>
            </h3>
            <button onclick="removeBlock(this.closest('.mcq-block'))" class="trash-icon text-gray-500 hover:text-white hover:bg-red-500/80 transition-all duration-300 cursor-pointer p-2.5 rounded-xl shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center" title="حذف السؤال">
                ${trashSVG}
            </button>
        </div>
        
        <div class="relative mb-5 group/textarea">
            <div class="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-focus-within/textarea:opacity-100 transition duration-500"></div>
            <textarea class="mcq-q-text relative w-full bg-black/60 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-yellow-500/50 transition-all text-sm sm:text-base resize-none overflow-hidden placeholder-gray-500 leading-relaxed custom-scrollbar shadow-inner" rows="2" placeholder="اكتب نص السؤال الأساسي هنا (أو الصق السؤال بالكامل ليتم توزيعه تلقائياً)..." required></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            ${[0, 1, 2, 3].map((i) => `
                <div class="relative flex items-center group/opt">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-white/10 to-transparent rounded-xl blur opacity-0 group-focus-within/opt:opacity-100 transition duration-300"></div>
                    <span class="absolute right-4 text-gray-500 font-black text-sm group-focus-within/opt:text-yellow-500 transition-colors pointer-events-none">${['أ', 'ب', 'ج', 'د'][i]}</span>
                    <input type="text" class="mcq-opt-${i} relative w-full bg-black/40 border border-white/5 rounded-xl pr-10 pl-4 py-3.5 text-white outline-none focus:border-yellow-500/50 focus:bg-black/60 transition-all text-sm placeholder-gray-600 shadow-inner" placeholder="الخيار ${['الأول', 'الثاني', 'الثالث', 'الرابع'][i]}" required>
                </div>
            `).join('')}
        </div>
        
        <div class="bg-gradient-to-r from-emerald-900/30 to-black/30 border border-emerald-500/20 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-inner">
            <div class="flex flex-col gap-1">
                <label class="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    الإجابات الصحيحة
                </label>
                <span class="text-xs text-emerald-500/70">يمكنك تحديد أكثر من إجابة</span>
            </div>
            
            <div class="flex flex-wrap gap-2 correct-answers-container w-full sm:w-auto justify-start sm:justify-end">
                ${[0, 1, 2, 3].map(i => `
                    <label class="cursor-pointer flex-1 sm:flex-none relative group/chk">
                        <input type="checkbox" value="${i}" class="mcq-correct-chk peer hidden">
                        <div class="flex items-center justify-center min-w-[3rem] px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-gray-400 font-bold text-sm transition-all duration-300 
                                    peer-checked:bg-emerald-500/20 peer-checked:border-emerald-500 peer-checked:text-emerald-400 peer-checked:shadow-[0_0_15px_rgba(16,185,129,0.3)]
                                    hover:border-emerald-500/50 hover:bg-white/5">
                            ${['أ', 'ب', 'ج', 'د'][i]}
                        </div>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    const questionTextarea = block.querySelector('.mcq-q-text');
    questionTextarea.addEventListener('input', () => autoResizeTextarea(questionTextarea));
    
    questionTextarea.addEventListener('paste', function(e) {
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        let lines = pasteText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if(lines.length >= 5) {
            e.preventDefault(); 
            this.value = lines[0]; 
            autoResizeTextarea(this);
            const currentBlock = this.closest('.mcq-block, .public-mcq-block');
            currentBlock.querySelector('.mcq-opt-0').value = lines[1].replace(/^[أ-د][.-]\s*/, ''); 
            currentBlock.querySelector('.mcq-opt-1').value = lines[2].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-2').value = lines[3].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-3').value = lines[4].replace(/^[أ-د][.-]\s*/, '');
            
            currentBlock.classList.add('ring-2', 'ring-emerald-500', 'shadow-[0_0_30px_rgba(16,185,129,0.3)]', 'scale-[1.01]');
            setTimeout(() => currentBlock.classList.remove('ring-2', 'ring-emerald-500', 'shadow-[0_0_30px_rgba(16,185,129,0.3)]', 'scale-[1.01]'), 1200);
            SysUI.toast('success', '✨ تم استخراج السؤال والخيارات بذكاء!');
            SysUI.confetti();
        }
    });

    if (window.innerWidth > 768) {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('opacity-40', 'border-dashed', 'border-yellow-500', 'scale-95');
            e.dataTransfer.effectAllowed = 'move';
            window.draggedBlock = this;
        });
        block.addEventListener('dragover', function(e) {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            if(window.draggedBlock !== this) {
                this.classList.add('border-yellow-500', 'bg-yellow-500/5', '-translate-y-2');
            }
        });
        block.addEventListener('dragleave', function(e) {
            this.classList.remove('border-yellow-500', 'bg-yellow-500/5', '-translate-y-2');
        });
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-yellow-500', 'bg-yellow-500/5', '-translate-y-2');
            if (window.draggedBlock && window.draggedBlock !== this) {
                const allBlocks = [...container.querySelectorAll('.mcq-block')];
                const draggedIndex = allBlocks.indexOf(window.draggedBlock);
                const droppedIndex = allBlocks.indexOf(this);
                if(draggedIndex < droppedIndex) this.parentNode.insertBefore(window.draggedBlock, this.nextSibling);
                else this.parentNode.insertBefore(window.draggedBlock, this);
                updateQuestionNumbers(container); 
            }
        });
        block.addEventListener('dragend', function(e) {
            this.classList.remove('opacity-40', 'border-dashed', 'border-yellow-500', 'scale-95');
            window.draggedBlock = null;
        });
    }

    container.appendChild(block);
    
    // Animation in
    requestAnimationFrame(() => {
        block.style.transition = "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
        block.style.opacity = "1";
        block.style.transform = "translateY(0) scale(1)";
    });
}

export function removeBlock(blockElement) {
    blockElement.style.transition = "all 0.4s cubic-bezier(0.36, 0, 0.66, -0.56)";
    blockElement.style.opacity = "0";
    blockElement.style.transform = "scale(0.9) translateY(20px)";
    setTimeout(() => {
        const container = blockElement.parentElement;
        blockElement.remove();
        if (container) updateQuestionNumbers(container);
    }, 400);
}

const quizForm = document.getElementById('quizForm');
if(quizForm) {
    quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const quizTitle = document.getElementById('quizTitle')?.value.trim();
        const quizGrade = document.getElementById('quizGrade')?.value;
        
        if(!quizTitle) {
            SysUI.toast('warning', "⚠️ يرجى كتابة عنوان الاختبار أولاً!");
            return;
        }
        if(!quizGrade) {
            SysUI.toast('warning', "⚠️ يرجى اختيار الصف الدراسي!");
            return;
        }

        const btn = document.getElementById('saveQuizBtn');
        const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
        
        if(blocks.length === 0) { 
            SysUI.toast('warning', "⚠️ أضف سؤالاً واحداً على الأقل!"); 
            return; 
        }
        
        const questions = [];
        let hasError = false;

        blocks.forEach((block, index) => {
            const correctCheckboxes = block.querySelectorAll('.mcq-correct-chk:checked');
            const correctAnswers = Array.from(correctCheckboxes).map(cb => parseInt(cb.value));

            if(correctAnswers.length === 0) {
                hasError = true;
                block.classList.add('ring-2', 'ring-red-500', 'animate-bounce');
                setTimeout(() => block.classList.remove('ring-2', 'ring-red-500', 'animate-bounce'), 1500);
                SysUI.toast('error', `❌ يرجى تحديد إجابة صحيحة واحدة على الأقل في السؤال رقم ${index + 1}`);
            }

            questions.push({
                questionText: block.querySelector('.mcq-q-text').value,
                options: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correctAnswers: correctAnswers
            });
        });
        
        if(hasError) return;

        const originalBtnHTML = btn.innerHTML;
        btn.innerHTML = `
            <div class="flex items-center justify-center gap-2">
                <span class="animate-spin inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></span> 
                <span>جاري المعالجة والنشر...</span>
            </div>
        `; 
        btn.disabled = true;
        btn.classList.add('opacity-80', 'cursor-not-allowed', 'scale-95');
        
        try {
            const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
            const res = await fetch('/api/admin/add-mcq-quiz', {
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    role: user.role, 
                    sessionToken: sessionToken, 
                    grade: quizGrade, 
                    quizTitle: quizTitle, 
                    questionsArray: questions 
                })
            });
            if (res.ok) {
                SysUI.toast('success', "🎉 تم نشر الاختبار الداخلي بنجاح!");
                SysUI.confetti();
                document.getElementById('quizForm').reset();
                document.getElementById('dynamicQuestionsContainer').innerHTML = '';
                questionCounter = 0; 
                addMCQBlock();
                localStorage.removeItem('dahih_quiz_draft'); 
            } else throw new Error();
        } catch (err) {
            SysUI.toast('error', "🚨 فشل أساسي في حفظ الاختبار. تأكد من اتصالك بالشبكة.");
        } finally {
            btn.innerHTML = originalBtnHTML; 
            btn.disabled = false;
            btn.classList.remove('opacity-80', 'cursor-not-allowed', 'scale-95');
        }
    });
}

export function addPublicMCQBlock() {
    publicQuestionCounter++;
    const container = document.getElementById('dynamicPublicQuestionsContainer');
    if (!container) return;
    const block = document.createElement('div');
    block.className = 'public-mcq-block glass-panel p-5 sm:p-7 rounded-3xl relative border border-white/5 border-l-4 border-l-blue-500 animate-fade-in-up transition-all duration-300 hover:shadow-[0_15px_40px_rgba(59,130,246,0.08)] hover:border-white/10 group bg-gradient-to-b from-white/[0.02] to-transparent';
    block.draggable = window.innerWidth > 768;
    
    block.style.opacity = "0";
    block.style.transform = "translateY(20px) scale(0.98)";

    block.innerHTML = `
        <div class="flex justify-between items-center mb-5 pb-3 border-b border-white/10 group-hover:border-white/20 transition-colors">
            <h3 class="text-base sm:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center gap-3">
                <div class="cursor-grab active:cursor-grabbing p-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors hidden md:flex items-center justify-center">
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                </div>
                السؤال العام رقم <span class="q-number bg-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-md">${publicQuestionCounter}</span>
            </h3>
            <button onclick="removeBlock(this.closest('.public-mcq-block'))" class="trash-icon text-gray-500 hover:text-white hover:bg-red-500/80 transition-all duration-300 cursor-pointer p-2.5 rounded-xl shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center" title="حذف السؤال">
                ${trashSVG}
            </button>
        </div>
        
        <div class="relative mb-5 group/textarea">
            <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-focus-within/textarea:opacity-100 transition duration-500"></div>
            <textarea class="mcq-q-text relative w-full bg-black/60 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-blue-500/50 transition-all text-sm sm:text-base resize-none overflow-hidden placeholder-gray-500 leading-relaxed custom-scrollbar shadow-inner" rows="2" placeholder="اكتب نص السؤال العام هنا (أو الصق بذكاء)..." required></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            ${[0, 1, 2, 3].map((i) => `
                <div class="relative flex items-center group/opt">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-white/10 to-transparent rounded-xl blur opacity-0 group-focus-within/opt:opacity-100 transition duration-300"></div>
                    <span class="absolute right-4 text-gray-500 font-black text-sm group-focus-within/opt:text-blue-400 transition-colors pointer-events-none">${['أ', 'ب', 'ج', 'د'][i]}</span>
                    <input type="text" class="mcq-opt-${i} relative w-full bg-black/40 border border-white/5 rounded-xl pr-10 pl-4 py-3.5 text-white outline-none focus:border-blue-500/50 focus:bg-black/60 transition-all text-sm placeholder-gray-600 shadow-inner" placeholder="الخيار ${['الأول', 'الثاني', 'الثالث', 'الرابع'][i]} العام" required>
                </div>
            `).join('')}
        </div>
        
        <div class="bg-gradient-to-r from-indigo-900/30 to-black/30 border border-indigo-500/20 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-inner">
            <div class="flex flex-col gap-1">
                <label class="text-sm font-bold text-indigo-400 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    الإجابات الصحيحة (للعام)
                </label>
                <span class="text-xs text-indigo-500/70">متعدد الاختيارات مدعوم بالكامل</span>
            </div>
            
            <div class="flex flex-wrap gap-2 correct-answers-container w-full sm:w-auto justify-start sm:justify-end">
                ${[0, 1, 2, 3].map(i => `
                    <label class="cursor-pointer flex-1 sm:flex-none relative group/chk">
                        <input type="checkbox" value="${i}" class="mcq-correct-chk peer hidden">
                        <div class="flex items-center justify-center min-w-[3rem] px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-gray-400 font-bold text-sm transition-all duration-300 
                                    peer-checked:bg-indigo-500/20 peer-checked:border-indigo-500 peer-checked:text-indigo-400 peer-checked:shadow-[0_0_15px_rgba(99,102,241,0.3)]
                                    hover:border-indigo-500/50 hover:bg-white/5">
                            ${['أ', 'ب', 'ج', 'د'][i]}
                        </div>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    const questionTextarea = block.querySelector('.mcq-q-text');
    questionTextarea.addEventListener('input', () => autoResizeTextarea(questionTextarea));
    
    questionTextarea.addEventListener('paste', function(e) {
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        let lines = pasteText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if(lines.length >= 5) {
            e.preventDefault(); 
            this.value = lines[0]; 
            autoResizeTextarea(this);
            const currentBlock = this.closest('.mcq-block, .public-mcq-block');
            currentBlock.querySelector('.mcq-opt-0').value = lines[1].replace(/^[أ-د][.-]\s*/, ''); 
            currentBlock.querySelector('.mcq-opt-1').value = lines[2].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-2').value = lines[3].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-3').value = lines[4].replace(/^[أ-د][.-]\s*/, '');
            
            currentBlock.classList.add('ring-2', 'ring-blue-500', 'shadow-[0_0_30px_rgba(59,130,246,0.3)]', 'scale-[1.01]');
            setTimeout(() => currentBlock.classList.remove('ring-2', 'ring-blue-500', 'shadow-[0_0_30px_rgba(59,130,246,0.3)]', 'scale-[1.01]'), 1200);
            SysUI.toast('success', '✨ تم إدراج السؤال العام ذكياً!');
            SysUI.confetti();
        }
    });

    if (window.innerWidth > 768) {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('opacity-40', 'border-dashed', 'border-blue-500', 'scale-95');
            e.dataTransfer.effectAllowed = 'move';
            window.draggedBlock = this;
        });
        block.addEventListener('dragover', function(e) {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            if(window.draggedBlock !== this) {
                this.classList.add('border-blue-500', 'bg-blue-500/5', '-translate-y-2');
            }
        });
        block.addEventListener('dragleave', function(e) {
            this.classList.remove('border-blue-500', 'bg-blue-500/5', '-translate-y-2');
        });
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-blue-500', 'bg-blue-500/5', '-translate-y-2');
            if (window.draggedBlock && window.draggedBlock !== this) {
                const allBlocks = [...container.querySelectorAll('.public-mcq-block')];
                const draggedIndex = allBlocks.indexOf(window.draggedBlock);
                const droppedIndex = allBlocks.indexOf(this);
                if(draggedIndex < droppedIndex) this.parentNode.insertBefore(window.draggedBlock, this.nextSibling);
                else this.parentNode.insertBefore(window.draggedBlock, this);
                updateQuestionNumbers(container); 
            }
        });
        block.addEventListener('dragend', function(e) {
            this.classList.remove('opacity-40', 'border-dashed', 'border-blue-500', 'scale-95');
            window.draggedBlock = null;
        });
    }

    container.appendChild(block);

    requestAnimationFrame(() => {
        block.style.transition = "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
        block.style.opacity = "1";
        block.style.transform = "translateY(0) scale(1)";
    });
}

const publicQuizForm = document.getElementById('publicQuizForm');
if(publicQuizForm) {
    publicQuizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const publicQuizTitle = document.getElementById('publicQuizTitle')?.value.trim();
        if(!publicQuizTitle) {
            SysUI.toast('warning', "⚠️ يرجى كتابة عنوان الاختبار العام أولاً!");
            return;
        }

        const blocks = document.querySelectorAll('#dynamicPublicQuestionsContainer .public-mcq-block');
        if(blocks.length === 0) { 
            SysUI.toast('warning', "⚠️ أضف سؤالاً واحداً على الأقل!"); 
            return; 
        }
        
        const questions = [];
        let hasError = false;

        blocks.forEach((block, index) => {
            const correctCheckboxes = block.querySelectorAll('.mcq-correct-chk:checked');
            const correctAnswers = Array.from(correctCheckboxes).map(cb => parseInt(cb.value));
            
            if(correctAnswers.length === 0) {
                hasError = true;
                block.classList.add('ring-2', 'ring-red-500', 'animate-bounce');
                setTimeout(() => block.classList.remove('ring-2', 'ring-red-500', 'animate-bounce'), 1500);
                SysUI.toast('error', `❌ يرجى تحديد إجابة صحيحة واحدة على الأقل في السؤال رقم ${index + 1}`);
            }

            questions.push({
                questionText: block.querySelector('.mcq-q-text').value,
                options: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correctAnswers: correctAnswers
            });
        });

        if(hasError) return;

        submitPublicQuiz(questions, false);
    });
}

export async function submitPublicQuiz(questionsSourceArray, isForced = false) {
    const btn = document.getElementById('savePublicQuizBtn');
    const linkArea = document.getElementById('publicQuizLinkArea');
    const linkInput = document.getElementById('publicQuizLinkInput');

    if(questionsSourceArray.length === 0) {
        if(!isForced) SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!");
        if(btn) { btn.disabled = false; }
        return; 
    }
    
    let originalBtnContent = '';
    if(btn) {
        originalBtnContent = btn.innerHTML;
        btn.innerHTML = `
            <div class="flex items-center justify-center gap-2">
                <span class="animate-spin inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></span> 
                <span>جاري الحفظ والتوليد...</span>
            </div>
        `;
        btn.disabled = true;
        btn.classList.add('opacity-80', 'cursor-not-allowed', 'scale-95');
    }

    try {
        const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
        const quizGradeVal = document.getElementById('publicQuizGrade')?.value || "عام";
        const quizTitleVal = document.getElementById('publicQuizTitle')?.value || "امتحان سريع";

        const res = await fetch('/api/admin/add-public-quiz', {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ 
                role: user.role, 
                sessionToken: sessionToken, 
                grade: isForced ? "الصف الثاني الثانوي" : quizGradeVal, 
                quizTitle: isForced ? "امتحان سريع" : quizTitleVal, 
                questionsArray: questionsSourceArray 
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const baseUrl = window.location.origin;
            const fullLink = `${baseUrl}/public-quiz.html?id=${data.quizId}`;
            
            if(document.getElementById('publicQuizForm')) document.getElementById('publicQuizForm').reset();
            document.getElementById('dynamicPublicQuestionsContainer').innerHTML = '';
            publicQuestionCounter = 0; 
            if(!isForced) addPublicMCQBlock(); 

            if(linkInput) linkInput.value = fullLink;
            
            if(linkArea) {
                linkArea.classList.remove('hidden');
                linkArea.classList.add('flex', 'flex-col', 'sm:flex-row');
                linkArea.style.opacity = '0';
                linkArea.style.transform = 'translateY(20px) scale(0.95)';
                setTimeout(() => {
                    linkArea.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    linkArea.style.opacity = '1';
                    linkArea.style.transform = 'translateY(0) scale(1)';
                }, 50);
            }
            
            SysUI.toast('success', "🌐 تم حفظ الاختبار وإنشاء الرابط العبقري بنجاح!");
            SysUI.confetti();
        } else throw new Error();
    } catch (err) {
        SysUI.toast('error', "🚨 فشل في حفظ الاختبار العام. راجع المدخلات والاتصال.");
    } finally {
        if(btn) {
            btn.innerHTML = originalBtnContent; 
            btn.disabled = false;
            btn.classList.remove('opacity-80', 'cursor-not-allowed', 'scale-95');
        }
    }
}

export async function copyPublicLink() {
    const input = document.getElementById('publicQuizLinkInput');
    if (!input || !input.value) return;
    
    try {
        await navigator.clipboard.writeText(input.value);
        triggerCopyAnimation(input);
    } catch (err) {
        input.select();
        input.setSelectionRange(0, 99999);
        try {
            document.execCommand('copy');
            triggerCopyAnimation(input);
        } catch (err2) {
            SysUI.toast('error', 'فشل النسخ التلقائي، يرجى النسخ يدوياً.');
        }
        window.getSelection().removeAllRanges();
    }
}

export function triggerCopyAnimation(inputElement) {
    const btn = inputElement.nextElementSibling;
    if(!btn) return;

    const originalHTML = btn.innerHTML;
    const originalClasses = btn.className;
    
    btn.innerHTML = `
        <span class="flex items-center justify-center gap-2">
            <svg class="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 
            تم النسخ للحافظة
        </span>
    `;
    btn.className = 'w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-4 sm:py-0 rounded-2xl font-black transition-all shadow-[0_0_25px_rgba(16,185,129,0.5)] whitespace-nowrap scale-105';
    
    SysUI.toast('success', "📋 تم نسخ الرابط، أرسله الآن!");
    SysUI.confetti();
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.className = originalClasses;
    }, 3000);
}

export const SmartImportSystem = {
    init() {
        const btnContainer = document.getElementById('smart-import-btn-container');
        const formContainer = document.getElementById('publicQuizForm');
        
        if (!document.getElementById('smart-import-btn') && formContainer) {
            const importBtn = document.createElement('button');
            importBtn.id = 'smart-import-btn';
            importBtn.type = 'button';
            importBtn.className = 'w-full sm:w-auto relative overflow-hidden bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 text-white px-6 py-3.5 sm:py-3 rounded-2xl text-sm font-black transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_35px_rgba(16,185,129,0.6)] flex items-center justify-center gap-2 hover:-translate-y-1 group';
            importBtn.innerHTML = `
                <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
                <svg class="w-5 h-5 animate-pulse relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                <span class="relative z-10">لصق سحري (Smart Paste)</span>
            `;
            importBtn.onclick = () => this.showImportModal();
            
            if(btnContainer) {
                btnContainer.appendChild(importBtn);
            } else {
                const dynContainer = document.getElementById('dynamicPublicQuestionsContainer');
                if(dynContainer) dynContainer.parentNode.insertBefore(importBtn, dynContainer);
            }
        }

        if (!document.getElementById('smart-import-modal')) {
            const modalHTML = `
                <div id="smart-import-modal" class="fixed inset-0 z-[10000] hidden items-center justify-center pointer-events-none px-4 perspective-1000">
                    <div class="absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity duration-500 opacity-0" id="smart-modal-bg"></div>
                    <div class="relative bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-green-500/40 p-6 sm:p-8 rounded-[2rem] shadow-[0_30px_60px_rgba(16,185,129,0.3)] transform scale-90 rotate-X-12 opacity-0 transition-all duration-500 w-full max-w-3xl mx-auto pointer-events-auto flex flex-col max-h-[92vh] overflow-hidden" id="smart-modal-box">
                        <div class="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
                        <div class="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none"></div>
                        
                        <div class="flex justify-between items-center mb-6 relative z-10">
                            <h3 class="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300 font-black text-xl sm:text-2xl flex items-center gap-3">
                                <div class="p-2 bg-green-500/10 rounded-xl">
                                    <svg class="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                </div>
                                المستورد الخارق المحسّن
                            </h3>
                            <button id="smart-modal-close" class="text-gray-500 hover:text-white bg-white/5 hover:bg-red-500/80 p-2 rounded-xl transition-all duration-300">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <p class="text-sm text-gray-400 mb-5 leading-relaxed relative z-10 font-medium">
                            ألصق بنك الأسئلة بالكامل هنا. المستورد الذكي سيدعم الآن <span class="text-green-400 font-bold">تحديد أكثر من إجابة صحيحة</span> بشكل تلقائي عند وجود علامات (✅ أو صح) متعددة!
                        </p>
                        
                        <div class="relative flex-grow mb-6 z-10 group/textarea">
                            <div class="absolute -inset-1 bg-gradient-to-r from-green-500/30 to-blue-500/30 rounded-2xl blur opacity-20 group-focus-within/textarea:opacity-100 transition duration-500"></div>
                            <textarea id="smart-import-textarea" class="relative w-full h-full min-h-[350px] bg-black/70 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-green-500/50 transition-all text-sm sm:text-base resize-none custom-scrollbar shadow-inner leading-loose" placeholder="س1: ما هي عاصمة مصر؟
أ) الإسكندرية
ب) القاهرة ✅
ج) أسوان
د) الأقصر

س2: ألوان علم مصر تضم؟
أ) أحمر ✅
ب) أزرق
ج) أبيض ✅
د) أسود ✅"></textarea>
                        </div>

                        <button id="smart-import-execute" class="relative z-10 w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white border-0 px-6 py-4 rounded-2xl transition-all duration-300 text-base font-black shadow-[0_10px_30px_rgba(16,185,129,0.3)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.5)] hover:-translate-y-1 flex items-center justify-center gap-3 overflow-hidden group">
                            <div class="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
                            <svg class="w-6 h-6 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                            <span class="relative z-10">تحليل وإدراج الأسئلة بذكاء اصطناعي</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            document.getElementById('smart-modal-close').onclick = () => this.closeModal();
            document.getElementById('smart-modal-bg').onclick = () => this.closeModal();
            document.getElementById('smart-import-execute').onclick = () => this.processImport();
        }
    },

    showImportModal() {
        const modal = document.getElementById('smart-import-modal');
        const bg = document.getElementById('smart-modal-bg');
        const box = document.getElementById('smart-modal-box');
        
        if(document.getElementById('smart-import-textarea')) document.getElementById('smart-import-textarea').value = '';
        
        if(modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        
        requestAnimationFrame(() => {
            if(bg) bg.classList.remove('opacity-0');
            if(box) {
                box.classList.remove('scale-90', 'rotate-X-12', 'opacity-0');
                box.classList.add('scale-100', 'rotate-X-0', 'opacity-100');
            }
            if(document.getElementById('smart-import-textarea')) document.getElementById('smart-import-textarea').focus();
        });
    },

    closeModal() {
        const modal = document.getElementById('smart-import-modal');
        const bg = document.getElementById('smart-modal-bg');
        const box = document.getElementById('smart-modal-box');
        
        if(bg) bg.classList.add('opacity-0');
        if(box) {
            box.classList.remove('scale-100', 'rotate-X-0', 'opacity-100');
            box.classList.add('scale-90', 'rotate-X-12', 'opacity-0');
        }
        
        setTimeout(() => {
            if(modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        }, 500);
    },

    processImport() {
        const textarea = document.getElementById('smart-import-textarea');
        const rawText = textarea ? textarea.value : '';
        if (!rawText.trim()) {
            SysUI.toast('error', '⚠️ الحقل فارغ تماماً.');
            return;
        }

        const parsedQuestions = this.parseText(rawText);
        
        if (parsedQuestions.length === 0) {
            SysUI.toast('error', '❌ لم أتمكن من التعرف على أي أسئلة. تأكد من توافق الصيغة.');
            return;
        }

        this.closeModal();
        this.animateInsertion(parsedQuestions);
    },

    parseText(text) {
        let parsed = [];
        let currentQ = { q: '', opts: [], correctAnswers: [] };
        
        let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const optRegex = /^(\(?[أ-د]\)?|[أ-د][.-])\s*(.*)/;

        lines.forEach(line => {
            const match = line.match(optRegex);

            if (match) {
                let optText = match[2];
                let isCorrect = optText.includes('✅') || optText.includes('صح');
                optText = optText.replace(/✅|صح/g, '').trim();

                currentQ.opts.push(optText);
                if (isCorrect) {
                    currentQ.correctAnswers.push(currentQ.opts.length - 1);
                }
            } else {
                if (currentQ.opts.length > 0) {
                    if (currentQ.opts.length >= 2) {
                        currentQ.q = currentQ.q.replace(/^(س\d+[:.-]?|السؤال \d+[:.-]?)\s*/, '');
                        while(currentQ.opts.length < 4) currentQ.opts.push('');
                        parsed.push({...currentQ});
                    }
                    currentQ = { q: line, opts: [], correctAnswers: [] };
                } else {
                    currentQ.q = currentQ.q ? currentQ.q + '\n' + line : line;
                }
            }
        });

        if (currentQ.opts.length >= 2) {
            currentQ.q = currentQ.q.replace(/^(س\d+[:.-]?|السؤال \d+[:.-]?)\s*/, '');
            while(currentQ.opts.length < 4) currentQ.opts.push('');
            parsed.push({...currentQ});
        }

        return parsed;
    },

    async animateInsertion(questions) {
        SysUI.toast('success', `🚀 تم التعرف على ${questions.length} أسئلة! جاري الإدراج السحري...`);
        
        const container = document.getElementById('dynamicPublicQuestionsContainer');
        if (!container) return;
        
        const existingBlocks = container.querySelectorAll('.public-mcq-block');
        if (existingBlocks.length === 1) {
            const firstQInput = existingBlocks[0].querySelector('.mcq-q-text');
            if (firstQInput && !firstQInput.value.trim()) {
                existingBlocks[0].remove();
                publicQuestionCounter = 0; 
            }
        }

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < questions.length; i++) {
            const pq = questions[i];
            
            addPublicMCQBlock(); 
            
            const blocks = container.querySelectorAll('.public-mcq-block');
            const targetBlock = blocks[blocks.length - 1];
            
            await sleep(50);

            const scanner = document.createElement('div');
            scanner.className = 'absolute top-0 right-0 h-full w-2 bg-gradient-to-r from-transparent to-green-400 shadow-[0_0_30px_rgba(74,222,128,1)] z-20 pointer-events-none rounded-r-3xl mix-blend-screen';
            targetBlock.appendChild(scanner);

            requestAnimationFrame(() => {
                scanner.style.transition = 'width 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
                scanner.style.width = '100%';
                scanner.style.backgroundColor = 'rgba(74,222,128,0.08)'; 
            });

            const qInput = targetBlock.querySelector('.mcq-q-text');
            const optInputs = [
                targetBlock.querySelector('.mcq-opt-0'),
                targetBlock.querySelector('.mcq-opt-1'),
                targetBlock.querySelector('.mcq-opt-2'),
                targetBlock.querySelector('.mcq-opt-3')
            ];
            
            await sleep(200);
            if(qInput) {
                qInput.value = pq.q;
                autoResizeTextarea(qInput);
                qInput.classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500', 'bg-green-500/10', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
            }
            
            for (let j = 0; j < 4; j++) {
                await sleep(80);
                if(optInputs[j]) {
                    optInputs[j].value = pq.opts[j];
                    optInputs[j].classList.add('transition-all', 'duration-300', 'scale-[1.03]', 'ring-2', 'ring-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.3)]');
                    
                    if(pq.correctAnswers.includes(j)) {
                         optInputs[j].classList.add('bg-green-500/20', 'text-green-300', 'font-bold'); 
                    }
                    setTimeout(() => {
                        if(optInputs[j]) optInputs[j].classList.remove('scale-[1.03]');
                    }, 200);
                }
            }

            await sleep(150);
            if(qInput) qInput.classList.remove('scale-[1.02]');
            
            // تحديد الإجابات الصحيحة المتعددة (Checkboxes)
            pq.correctAnswers.forEach(correctIdx => {
                const chk = targetBlock.querySelector(`.mcq-correct-chk[value="${correctIdx}"]`);
                if(chk) {
                    chk.checked = true;
                    const labelDiv = chk.nextElementSibling;
                    labelDiv.classList.add('scale-110', 'shadow-[0_0_25px_rgba(16,185,129,0.8)]');
                    setTimeout(() => labelDiv.classList.remove('scale-110', 'shadow-[0_0_25px_rgba(16,185,129,0.8)]'), 300);
                }
            });

            await sleep(350);
            
            scanner.style.opacity = '0';
            setTimeout(() => scanner.remove(), 400);
            
            if(qInput) qInput.classList.remove('ring-2', 'ring-green-500', 'bg-green-500/10', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
            optInputs.forEach((inp, idx) => {
                if(inp) {
                    inp.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.3)]', 'text-green-300', 'font-bold');
                    if(!pq.correctAnswers.includes(idx)) inp.classList.remove('bg-green-500/20');
                }
            });
            
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        SysUI.confetti();
        SysUI.confetti();
        SysUI.toast('success', 'اكتمل الاستيراد بنجاح!');
    }
};

window.addMCQBlock = addMCQBlock;
window.addPublicMCQBlock = addPublicMCQBlock;
window.removeBlock = removeBlock;
window.copyPublicLink = copyPublicLink;
