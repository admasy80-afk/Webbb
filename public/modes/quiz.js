// ==================== 7. إنشاء اختبار (المنصة) و 8. الاختبار العام و 12. الاستيراد الذكي ====================
import { SysUI, trashSVG } from './ui.js';
import { user, sessionToken } from './state.js';

export let questionCounter = 0;
export let publicQuestionCounter = 0;

export function updateQuestionNumbers(container) {
    const blocks = container.querySelectorAll('.mcq-block .q-number, .public-mcq-block .q-number');
    blocks.forEach((span, index) => {
        span.innerText = index + 1;
        span.parentElement.parentElement.parentElement.classList.add('animate-pulse');
        setTimeout(() => span.parentElement.parentElement.parentElement.classList.remove('animate-pulse'), 500);
    });
}

export const DraftSystem = {
    save() {
        const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
        if(blocks.length === 0) return;
        
        const draftData = {
            title: document.getElementById('quizTitle').value,
            grade: document.getElementById('quizGrade').value,
            questions: []
        };
        
        blocks.forEach(block => {
            draftData.questions.push({
                q: block.querySelector('.mcq-q-text').value,
                opts: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correct: block.querySelector('.mcq-correct').value
            });
        });
        
        localStorage.setItem('dahih_quiz_draft', JSON.stringify(draftData));
        
        let saveIndicator = document.getElementById('save-indicator');
        if(!saveIndicator) {
            saveIndicator = document.createElement('div');
            saveIndicator.id = 'save-indicator';
            saveIndicator.className = 'fixed bottom-5 left-1/2 sm:left-5 -translate-x-1/2 sm:-translate-x-0 text-gray-500 text-xs flex items-center gap-2 transition-opacity duration-500 opacity-0 bg-black/90 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md z-40 shadow-lg';
            saveIndicator.innerHTML = `<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> تم الحفظ مسودة`;
            document.body.appendChild(saveIndicator);
        }
        saveIndicator.style.opacity = '1';
        clearTimeout(this.indicatorTimeout);
        this.indicatorTimeout = setTimeout(() => saveIndicator.style.opacity = '0', 2500);
    },
    
    check() {
        const saved = localStorage.getItem('dahih_quiz_draft');
        if(saved) {
            const data = JSON.parse(saved);
            if(data.questions.length > 0 && (data.questions[0].q !== '' || data.title !== '')) {
                SysUI.confirm('يوجد امتحان تم العمل عليه سابقاً ولم يُنشر، هل تريد استعادة المسودة؟', (yes) => {
                    if(yes) {
                        document.getElementById('quizTitle').value = data.title;
                        document.getElementById('quizGrade').value = data.grade;
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
                            lastBlock.querySelector('.mcq-correct').value = qData.correct;
                        });
                        SysUI.toast('success', 'تم استعادة المسودة بنجاح!');
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
    const block = document.createElement('div');
    block.className = 'mcq-block glass-panel p-4 sm:p-6 rounded-2xl relative border-l-4 border-l-yellow-500 animate-fade-in-up transition-all hover:shadow-[0_0_15px_rgba(234,179,8,0.05)]';
    block.draggable = window.innerWidth > 768; 
    
    block.style.opacity = "0";
    block.style.transform = "translateY(10px)";
    block.style.transition = "all 0.4s ease";

    block.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 class="text-base sm:text-lg font-bold text-yellow-500 flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-500 cursor-grab active:cursor-grabbing hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                السؤال رقم <span class="q-number">${questionCounter}</span>
            </h3>
            <div onclick="removeBlock(this.parentElement.parentElement)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-1 sm:p-0">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 sm:py-3 text-white outline-none focus:border-yellow-500 transition-colors text-sm mb-4" rows="2" placeholder="اكتب نص السؤال الأساسي هنا (أو الصق السؤال بالاختيارات مباشرة)..." required></textarea>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-3 mb-4">
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الأول" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثاني" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثالث" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الرابع" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 sm:p-4 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap shrink-0">الإجابة الصحيحة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm py-1">
                <option value="0" class="bg-gray-900">أ</option>
                <option value="1" class="bg-gray-900">ب</option>
                <option value="2" class="bg-gray-900">ج</option>
                <option value="3" class="bg-gray-900">د</option>
            </select>
        </div>
    `;

    const questionTextarea = block.querySelector('.mcq-q-text');
    questionTextarea.addEventListener('paste', function(e) {
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        let lines = pasteText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if(lines.length >= 5) {
            e.preventDefault(); 
            this.value = lines[0]; 
            const currentBlock = this.closest('.mcq-block, .public-mcq-block');
            currentBlock.querySelector('.mcq-opt-0').value = lines[1].replace(/^[أ-د][.-]\s*/, ''); 
            currentBlock.querySelector('.mcq-opt-1').value = lines[2].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-2').value = lines[3].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-3').value = lines[4].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.classList.add('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
            setTimeout(() => currentBlock.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]'), 1000);
            SysUI.toast('success', 'تم التوزيع الذكي للسؤال والخيارات! 🪄');
            SysUI.confetti();
        }
    });

    if (window.innerWidth > 768) {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('opacity-40', 'border-dashed', 'scale-[0.98]');
            e.dataTransfer.effectAllowed = 'move';
            window.draggedBlock = this;
        });
        block.addEventListener('dragover', function(e) {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            if(window.draggedBlock !== this) this.classList.add('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('dragleave', function(e) {
            this.classList.remove('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-yellow-500', 'bg-white/5');
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
            this.classList.remove('opacity-40', 'border-dashed', 'scale-[0.98]');
            window.draggedBlock = null;
        });
    }

    container.appendChild(block);
    setTimeout(() => {
        block.style.opacity = "1";
        block.style.transform = "translateY(0)";
    }, 10);
}

export function removeBlock(blockElement) {
    blockElement.style.opacity = "0";
    blockElement.style.transform = "scale(0.95)";
    setTimeout(() => {
        const container = blockElement.parentElement;
        blockElement.remove();
        updateQuestionNumbers(container);
    }, 400);
}

const quizForm = document.getElementById('quizForm');
if(quizForm) {
    quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveQuizBtn');
        const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
        
        if(blocks.length === 0) { 
            SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!"); 
            return; 
        }
        
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2 align-middle"></span> جاري النشر...`; 
        btn.disabled = true;
        
        const questions = [];
        blocks.forEach(block => {
            questions.push({
                questionText: block.querySelector('.mcq-q-text').value,
                options: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correctAnswer: parseInt(block.querySelector('.mcq-correct').value)
            });
        });
        
        try {
            const res = await fetch('/api/admin/add-mcq-quiz', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: document.getElementById('quizGrade').value, quizTitle: document.getElementById('quizTitle').value, questionsArray: questions })
            });
            if (res.ok) {
                SysUI.toast('success', "تم نشر الاختبار الداخلي بنجاح!");
                SysUI.confetti();
                document.getElementById('quizForm').reset();
                document.getElementById('dynamicQuestionsContainer').innerHTML = '';
                questionCounter = 0; addMCQBlock();
                localStorage.removeItem('dahih_quiz_draft'); 
            } else throw new Error();
        } catch (err) {
            SysUI.toast('error', "فشل أساسي في حفظ الاختبار.");
        } finally {
            btn.innerText = "نشر الاختبار للطلاب"; 
            btn.disabled = false;
        }
    });
}

export function addPublicMCQBlock() {
    publicQuestionCounter++;
    const container = document.getElementById('dynamicPublicQuestionsContainer');
    const block = document.createElement('div');
    block.className = 'public-mcq-block glass-panel p-4 sm:p-6 rounded-2xl relative border-l-4 border-l-yellow-500 transition-all hover:shadow-[0_0_15px_rgba(234,179,8,0.05)]';
    block.draggable = window.innerWidth > 768;
    
    block.style.opacity = "0";
    block.style.transform = "translateY(10px)";
    block.style.transition = "all 0.4s ease";

    block.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 class="text-base sm:text-lg font-bold text-yellow-500 flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-500 cursor-grab active:cursor-grabbing hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                السؤال العام رقم <span class="q-number">${publicQuestionCounter}</span>
            </h3>
            <div onclick="removeBlock(this.parentElement.parentElement)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-1 sm:p-0">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 sm:py-3 text-white outline-none focus:border-yellow-500 transition-colors text-sm mb-4" rows="2" placeholder="اكتب نص السؤال العام هنا (أو الصق السؤال بالاختيارات مباشرة)..." required></textarea>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-3 mb-4">
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الأول العام" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثاني العام" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الثالث العام" required></div>
            <div class="flex items-center gap-2 group"><span class="text-gray-400 font-bold w-6 text-center group-focus-within:text-yellow-500 transition-colors shrink-0">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 sm:py-2 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="الخيار الرابع العام" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 sm:p-4 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap shrink-0">الإجابة الصحيحة العامة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm py-1">
                <option value="0" class="bg-gray-900">أ</option>
                <option value="1" class="bg-gray-900">ب</option>
                <option value="2" class="bg-gray-900">ج</option>
                <option value="3" class="bg-gray-900">د</option>
            </select>
        </div>
    `;

    const questionTextarea = block.querySelector('.mcq-q-text');
    questionTextarea.addEventListener('paste', function(e) {
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        let lines = pasteText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if(lines.length >= 5) {
            e.preventDefault(); 
            this.value = lines[0]; 
            const currentBlock = this.closest('.mcq-block, .public-mcq-block');
            currentBlock.querySelector('.mcq-opt-0').value = lines[1].replace(/^[أ-د][.-]\s*/, ''); 
            currentBlock.querySelector('.mcq-opt-1').value = lines[2].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-2').value = lines[3].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.querySelector('.mcq-opt-3').value = lines[4].replace(/^[أ-د][.-]\s*/, '');
            currentBlock.classList.add('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
            setTimeout(() => currentBlock.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]'), 1000);
            SysUI.toast('success', 'تم التوزيع الذكي للسؤال والخيارات! 🪄');
            SysUI.confetti();
        }
    });

    if (window.innerWidth > 768) {
        block.addEventListener('dragstart', function(e) {
            this.classList.add('opacity-40', 'border-dashed', 'scale-[0.98]');
            e.dataTransfer.effectAllowed = 'move';
            window.draggedBlock = this;
        });
        block.addEventListener('dragover', function(e) {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            if(window.draggedBlock !== this) this.classList.add('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('dragleave', function(e) {
            this.classList.remove('border-yellow-500', 'bg-white/5');
        });
        block.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-yellow-500', 'bg-white/5');
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
            this.classList.remove('opacity-40', 'border-dashed', 'scale-[0.98]');
            window.draggedBlock = null;
        });
    }

    container.appendChild(block);

    setTimeout(() => {
        block.style.opacity = "1";
        block.style.transform = "translateY(0)";
    }, 10);
}

const publicQuizForm = document.getElementById('publicQuizForm');
if(publicQuizForm) {
    publicQuizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const blocks = document.querySelectorAll('#dynamicPublicQuestionsContainer .public-mcq-block');
        if(blocks.length === 0) { 
            SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!"); 
            return; 
        }
        
        const questions = [];
        blocks.forEach(block => {
            questions.push({
                questionText: block.querySelector('.mcq-q-text').value,
                options: [
                    block.querySelector('.mcq-opt-0').value,
                    block.querySelector('.mcq-opt-1').value,
                    block.querySelector('.mcq-opt-2').value,
                    block.querySelector('.mcq-opt-3').value
                ],
                correctAnswer: parseInt(block.querySelector('.mcq-correct').value)
            });
        });

        submitPublicQuiz(questions, false);
    });
}

export async function submitPublicQuiz(questionsSourceArray, isForced = false) {
    const btn = document.getElementById('savePublicQuizBtn');
    const linkArea = document.getElementById('publicQuizLinkArea');
    const linkInput = document.getElementById('publicQuizLinkInput');

    if(questionsSourceArray.length === 0) {
        if(!isForced) SysUI.toast('warning', "أضف سؤالاً واحداً على الأقل!");
        btn.disabled = false; btn.innerText = "حفظ وتوليد رابط الاختبار ";
        return; 
    }
    
    btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full mr-2 align-middle"></span> جاري الحفظ...`;
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/add-public-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role: user.role, sessionToken: sessionToken, 
                grade: isForced ? "الصف الثاني الثانوي" : (document.getElementById('publicQuizGrade').value || "عام"), 
                quizTitle: isForced ? "امتحان سريع" : document.getElementById('publicQuizTitle').value, 
                questionsArray: questionsSourceArray 
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const fullLink = `https://webbb-production-b681.up.railway.app/public-quiz.html?id=${data.quizId}`; 
            
            document.getElementById('publicQuizForm').reset();
            document.getElementById('dynamicPublicQuestionsContainer').innerHTML = '';
            publicQuestionCounter = 0; 
            if(!isForced) addPublicMCQBlock(); 

            linkInput.value = fullLink;
            
            linkArea.classList.remove('hidden');
            linkArea.classList.add('flex', 'flex-col', 'sm:flex-row');
            linkArea.style.opacity = '0';
            linkArea.style.transform = 'translateY(10px)';
            setTimeout(() => {
                linkArea.style.transition = 'all 0.5s ease';
                linkArea.style.opacity = '1';
                linkArea.style.transform = 'translateY(0)';
            }, 50);
            
            SysUI.toast('success', "تم حفظ الاختبار بنجاح.");
            SysUI.confetti();
        } else throw new Error();
    } catch (err) {
        SysUI.toast('error', "فشل في حفظ الاختبار.");
    } finally {
        btn.innerText = "حفظ وتوليد رابط الاختبار العام "; 
        btn.disabled = false;
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
    
    btn.innerHTML = `<span class="flex items-center justify-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> تم النسخ</span>`;
    btn.className = 'w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 py-3 sm:py-0 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(22,163,74,0.4)] whitespace-nowrap';
    
    SysUI.toast('success', "تم نسخ الرابط بنجاح.");
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.className = originalClasses;
    }, 2500);
}

export const SmartImportSystem = {
    init() {
        const btnContainer = document.getElementById('smart-import-btn-container');
        const formContainer = document.getElementById('publicQuizForm');
        
        if (!document.getElementById('smart-import-btn') && formContainer) {
            const importBtn = document.createElement('button');
            importBtn.id = 'smart-import-btn';
            importBtn.type = 'button';
            importBtn.className = 'w-full sm:w-auto bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-6 py-3.5 sm:py-2.5 rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 hover:-translate-y-1';
            importBtn.innerHTML = `
                <svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                كتابة سريع
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
                <div id="smart-import-modal" class="fixed inset-0 z-[10000] hidden items-center justify-center pointer-events-none px-4">
                    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 opacity-0" id="smart-modal-bg"></div>
                    <div class="relative bg-gradient-to-b from-gray-900 to-black border border-green-500/30 p-5 sm:p-6 rounded-3xl shadow-[0_20px_50px_rgba(16,185,129,0.2)] transform scale-95 opacity-0 transition-all duration-300 w-full max-w-2xl mx-auto pointer-events-auto flex flex-col max-h-[90vh]" id="smart-modal-box">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-white font-bold text-lg flex items-center gap-2">
                                <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                لصق الأسئلة  (Smart Paste)
                            </h3>
                            <button id="smart-modal-close" class="text-gray-500 hover:text-red-500 transition-colors">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <p class="text-xs text-gray-400 mb-3 leading-relaxed">
                            قم بنسخ ولصق الأسئلة بالكامل هنا.
                        </p>
                        <textarea id="smart-import-textarea" class="w-full flex-grow min-h-[300px] bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-all mb-4 text-sm resize-none custom-scrollbar" placeholder=""></textarea>
                        <button id="smart-import-execute" class="w-full bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 px-5 py-3 rounded-xl transition-all text-sm font-bold shadow-[0_0_15px_rgba(22,163,74,0.2)] hover:shadow-[0_0_20px_rgba(22,163,74,0.4)]">
                          تحليل وإدراج الأسئلة
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
        
        document.getElementById('smart-import-textarea').value = '';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        requestAnimationFrame(() => {
            bg.classList.remove('opacity-0');
            box.classList.remove('scale-95', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
            document.getElementById('smart-import-textarea').focus();
        });
    },

    closeModal() {
        const modal = document.getElementById('smart-import-modal');
        const bg = document.getElementById('smart-modal-bg');
        const box = document.getElementById('smart-modal-box');
        
        bg.classList.add('opacity-0');
        box.classList.remove('scale-100', 'opacity-100');
        box.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    },

    processImport() {
        const rawText = document.getElementById('smart-import-textarea').value;
        if (!rawText.trim()) {
            SysUI.toast('error', 'الحقل فارغ.');
            return;
        }

        const parsedQuestions = this.parseText(rawText);
        
        if (parsedQuestions.length === 0) {
            SysUI.toast('error', 'لم أتمكن من التعرف على أي أسئلة. تأكد من الصيغة.');
            return;
        }

        this.closeModal();
        this.animateInsertion(parsedQuestions);
    },

    parseText(text) {
        let parsed = [];
        let currentQ = { q: '', opts: [], correct: 0 };
        
        let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const optRegex = /^(\(?[أ-د]\)?|[أ-د][.-])\s*(.*)/;

        lines.forEach(line => {
            const match = line.match(optRegex);

            if (match) {
                let optText = match[2];
                let isCorrect = optText.includes('✅') || optText.includes('صح');
                optText = optText.replace(/✅|صح/g, '').trim();

                currentQ.opts.push(optText);
                if (isCorrect) currentQ.correct = currentQ.opts.length - 1;
            } else {
                if (currentQ.opts.length > 0) {
                    if (currentQ.opts.length >= 2) {
                        currentQ.q = currentQ.q.replace(/^(س\d+[:.-]?|السؤال \d+[:.-]?)\s*/, '');
                        while(currentQ.opts.length < 4) currentQ.opts.push('');
                        parsed.push({...currentQ});
                    }
                    currentQ = { q: line, opts: [], correct: 0 };
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
        SysUI.toast('success', `تم التعرف على ${questions.length} أسئلة! جاري الإدراج السحري...`);
        
        const container = document.getElementById('dynamicPublicQuestionsContainer');
        
        const existingBlocks = container.querySelectorAll('.public-mcq-block');
        if (existingBlocks.length === 1) {
            const firstQInput = existingBlocks[0].querySelector('.mcq-q-text');
            if (!firstQInput.value.trim()) {
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
            
            await sleep(100);

            const scanner = document.createElement('div');
            scanner.className = 'absolute top-0 right-0 h-full w-2 bg-green-500/50 shadow-[0_0_20px_rgba(34,197,94,1)] z-10 pointer-events-none rounded-r-xl';
            targetBlock.appendChild(scanner);

            requestAnimationFrame(() => {
                scanner.style.transition = 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)';
                scanner.style.width = '100%';
                scanner.style.backgroundColor = 'rgba(34,197,94,0.05)'; 
            });

            const qInput = targetBlock.querySelector('.mcq-q-text');
            const optInputs = [
                targetBlock.querySelector('.mcq-opt-0'),
                targetBlock.querySelector('.mcq-opt-1'),
                targetBlock.querySelector('.mcq-opt-2'),
                targetBlock.querySelector('.mcq-opt-3')
            ];
            const correctSelect = targetBlock.querySelector('.mcq-correct');

            await sleep(250);
            qInput.value = pq.q;
            qInput.classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500', 'bg-green-500/10');
            
            for (let j = 0; j < 4; j++) {
                await sleep(120);
                optInputs[j].value = pq.opts[j];
                optInputs[j].classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500');
                if(j === pq.correct) {
                     optInputs[j].classList.add('bg-green-500/20'); 
                }
                setTimeout(() => {
                    optInputs[j].classList.remove('scale-[1.02]');
                }, 150);
            }

            await sleep(150);
            qInput.classList.remove('scale-[1.02]');
            correctSelect.value = pq.correct;
            correctSelect.parentElement.classList.add('transition-all', 'duration-300', 'scale-[1.02]', 'ring-2', 'ring-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.4)]');
            
            setTimeout(() => {
                correctSelect.parentElement.classList.remove('scale-[1.02]');
            }, 150);

            await sleep(400);
            
            scanner.style.opacity = '0';
            setTimeout(() => scanner.remove(), 300);
            
            qInput.classList.remove('ring-2', 'ring-green-500', 'bg-green-500/10');
            optInputs.forEach((inp, idx) => {
                inp.classList.remove('ring-2', 'ring-green-500');
                if(idx !== pq.correct) inp.classList.remove('bg-green-500/20');
            });
            correctSelect.parentElement.classList.remove('ring-2', 'ring-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.4)]');
            
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        SysUI.confetti();
        SysUI.toast('success', 'تمت المهمة بنجاح');
    }
};

window.addMCQBlock = addMCQBlock;
window.addPublicMCQBlock = addPublicMCQBlock;
window.removeBlock = removeBlock;
window.copyPublicLink = copyPublicLink;
