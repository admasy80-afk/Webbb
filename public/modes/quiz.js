import { SysUI, trashSVG } from './ui.js';
import { user, sessionToken } from './state.js';
import { API } from './config.js';

// ============================================================================
// DAHIH CORE SYSTEM V3 - ENTERPRISE EDITION
// ============================================================================

(() => {
    if (document.getElementById('enterprise-quiz-styles')) return;
    const style = document.createElement('style');
    style.id = 'enterprise-quiz-styles';
    style.innerHTML = `
        @keyframes uiShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-4px)} 40%,80%{transform:translateX(4px)} }
        @keyframes uiGlow { 0%{box-shadow:0 0 10px rgba(59,130,246,0.1)} 50%{box-shadow:0 0 20px rgba(59,130,246,0.3)} 100%{box-shadow:0 0 10px rgba(59,130,246,0.1)} }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-4px); } 100% { transform: translateY(0px); } }
        @keyframes scanline { 0% { transform: translateY(-100%); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(1000%); opacity: 0; } }
        
        .ui-shake { animation: uiShake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        .ui-glow { animation: uiGlow 2s infinite; }
        .float-hover:hover { animation: float 3s ease-in-out infinite; }
        
        .enterprise-glass { 
            background: rgba(15, 17, 21, 0.95); 
            backdrop-filter: blur(16px); 
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.05); 
            box-shadow: 0 4px 24px 0 rgba(0, 0, 0, 0.2);
        }
        
        .enterprise-focus-ring:focus-within { 
            border-color: #3b82f6; 
            box-shadow: 0 0 0 1px #3b82f6; 
            transform: translateY(-1px); 
        }
        
        .smooth-transition { transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
        .pro-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .pro-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 8px; }
        .pro-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 8px; }
        .pro-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
        
        .data-scanner {
            position: absolute; inset: 0; z-index: 50; pointer-events: none;
            background: linear-gradient(to bottom, transparent, rgba(59,130,246,0.1), transparent);
            height: 20%; width: 100%; animation: scanline 2s linear infinite;
        }
    `;
    document.head.appendChild(style);
})();

// --- System Audio Feedback ---
const FX = {
    audioCtx: null,
    init() {
        if (!this.audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.audioCtx = new AC();
        }
    },
    play(freq, type, duration, vol) {
        this.init();
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(freq / 2, this.audioCtx.currentTime + duration);
            gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch(e) {
            console.warn('AudioContext playback failed.', e);
        }
    },
    pop() { this.play(400, 'sine', 0.1, 0.02); },
    success() { this.play(600, 'triangle', 0.15, 0.02); setTimeout(() => this.play(900, 'triangle', 0.2, 0.02), 80); },
    error() { this.play(200, 'sawtooth', 0.2, 0.02); setTimeout(() => this.play(150, 'sawtooth', 0.3, 0.02), 100); },
    processing() { this.play(1000, 'sine', 0.05, 0.01); setTimeout(() => this.play(1200, 'sine', 0.1, 0.01), 50); }
};

// --- Core Utilities ---
const Utils = {
    debounce: (func, wait = 500) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },
    validateInputs: (container) => {
        if (!container) return false;
        let isValid = true;
        const inputs = container.querySelectorAll('textarea[required], input[required]');
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('ui-shake', 'border-red-500', 'bg-red-900/10');
                FX.error();
                setTimeout(() => input.classList.remove('ui-shake', 'border-red-500', 'bg-red-900/10'), 400);
            }
        });
        return isValid;
    },
    scrollToElement: (el) => {
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    generateId: () => 'blk_' + Math.random().toString(36).substr(2, 9),
    cleanText: (text) => text ? text.trim() : ''
};

export let questionCounter = 0;
export let publicQuestionCounter = 0;

export function updateQuestionNumbers(container) {
    if (!container) return;
    const blocks = container.querySelectorAll('.mcq-block, .public-mcq-block');
    blocks.forEach((block, index) => {
        const span = block.querySelector('.q-number');
        if (span) {
            span.innerText = index + 1;
            block.classList.add('ui-glow');
            setTimeout(() => block.classList.remove('ui-glow'), 500);
        }
    });
}

// --- Data Persistence System ---
export const DraftSystem = {
    save: Utils.debounce(() => {
        const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block, #dynamicPublicQuestionsContainer .public-mcq-block');
        if (!blocks.length) return;
        
        const isPublic = document.getElementById('dynamicPublicQuestionsContainer')?.contains(blocks[0]);
        const draftKey = isPublic ? 'dahih_pub_draft_v3' : 'dahih_quiz_draft_v3';
        
        const titleEl = document.getElementById(isPublic ? 'publicQuizTitle' : 'quizTitle');
        const gradeEl = document.getElementById(isPublic ? 'publicQuizGrade' : 'quizGrade');

        const draftData = {
            title: titleEl?.value || '',
            grade: gradeEl?.value || '',
            timestamp: Date.now(),
            questions: Array.from(blocks).map(block => ({
                q: Utils.cleanText(block.querySelector('.mcq-q-text')?.value),
                opts: Array.from({length: 4}, (_, i) => Utils.cleanText(block.querySelector(`.mcq-opt-${i}`)?.value)),
                correct: block.querySelector('.mcq-correct')?.value || '0'
            })).filter(qData => qData.q !== '')
        };
        
        try {
            localStorage.setItem(draftKey, JSON.stringify(draftData));
            this.showIndicator();
        } catch (e) {
            console.error('Local storage quota exceeded or unavailable.', e);
        }
    }, 800),
    
    showIndicator() {
        let indicator = document.getElementById('system-save-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'system-save-indicator';
            indicator.className = 'fixed top-4 right-4 flex items-center gap-2 bg-gray-900 text-gray-300 text-xs px-4 py-2 rounded border border-gray-700 z-[9999] transition-all duration-500 opacity-0 transform translate-x-4 shadow-lg font-medium';
            indicator.innerHTML = `<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> <span>تم حفظ المسودة محلياً</span>`;
            document.body.appendChild(indicator);
        }
        
        requestAnimationFrame(() => {
            indicator.style.opacity = '1';
            indicator.style.transform = 'translateX(0)';
            clearTimeout(DraftSystem.timeout);
            DraftSystem.timeout = setTimeout(() => {
                indicator.style.opacity = '0';
                indicator.style.transform = 'translateX(10px)';
            }, 2500);
        });
    },
    
    check() {
        ['dahih_quiz_draft_v3', 'dahih_pub_draft_v3'].forEach(key => {
            const saved = localStorage.getItem(key);
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    if (data.questions && data.questions.length > 0) {
                        const isPublic = key.includes('pub');
                        SysUI.confirm(`يوجد مسودة غير مكتملة تحتوي على (${data.questions.length}) سؤال. هل ترغب في استعادتها؟`, (yes) => {
                            if (yes) {
                                const titleEl = document.getElementById(isPublic ? 'publicQuizTitle' : 'quizTitle');
                                const gradeEl = document.getElementById(isPublic ? 'publicQuizGrade' : 'quizGrade');
                                if(titleEl) titleEl.value = data.title || '';
                                if(gradeEl) gradeEl.value = data.grade || '';
                                
                                const containerId = isPublic ? 'dynamicPublicQuestionsContainer' : 'dynamicQuestionsContainer';
                                const container = document.getElementById(containerId);
                                if(!container) return;
                                
                                container.innerHTML = ''; 
                                if (isPublic) publicQuestionCounter = 0; else questionCounter = 0;
                                
                                data.questions.forEach((qData, index) => {
                                    setTimeout(() => {
                                        isPublic ? addPublicMCQBlock() : addMCQBlock(); 
                                        const lastBlock = container.lastElementChild;
                                        if(!lastBlock) return;
                                        
                                        const qEl = lastBlock.querySelector('.mcq-q-text');
                                        if (qEl) qEl.value = qData.q;
                                        
                                        qData.opts.forEach((opt, i) => {
                                            const optEl = lastBlock.querySelector(`.mcq-opt-${i}`);
                                            if(optEl) optEl.value = opt;
                                        });
                                        
                                        const correctEl = lastBlock.querySelector('.mcq-correct');
                                        if(correctEl) correctEl.value = qData.correct;
                                        
                                        FX.pop();
                                    }, index * 50); 
                                });
                                SysUI.toast('success', 'تمت استعادة المسودة بنجاح.');
                                FX.success();
                            } else {
                                localStorage.removeItem(key);
                            }
                        });
                    }
                } catch(e) {
                    localStorage.removeItem(key);
                }
            }
        });
    }
};

document.addEventListener('input', (e) => {
    if (e.target.closest('#dynamicQuestionsContainer') || e.target.closest('#dynamicPublicQuestionsContainer')) {
        DraftSystem.save();
    }
});

// --- UI Block Generation ---
const createBlockHTML = (counter, isPublic, blockId) => `
    <div class="flex justify-between items-center mb-5 border-b border-gray-800 pb-3 relative z-10">
        <h3 class="text-lg font-semibold text-gray-200 flex items-center gap-3 select-none">
            <div class="cursor-grab active:cursor-grabbing hover:bg-gray-800 smooth-transition hidden md:flex items-center justify-center w-8 h-8 rounded bg-gray-900 text-gray-400 border border-gray-700 drag-handle">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
            </div>
            السؤال <span class="q-number bg-gray-800 px-2 py-0.5 rounded text-sm text-gray-300 border border-gray-700">${counter}</span>
        </h3>
        <button type="button" onclick="window.removeBlock(this.closest('.${isPublic ? 'public-mcq-block' : 'mcq-block'}'))" class="group flex items-center justify-center w-9 h-9 rounded bg-red-900/20 hover:bg-red-800 border border-red-900/30 smooth-transition" title="حذف السؤال">
            <span class="text-red-400 group-hover:text-white transition-colors pointer-events-none w-4 h-4">${trashSVG}</span>
        </button>
    </div>
    
    <div class="relative mb-5 enterprise-focus-ring rounded-lg smooth-transition bg-black/20 border border-gray-700 group overflow-hidden">
        <div class="absolute left-0 top-0 w-0.5 h-full bg-blue-500 opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
        <textarea class="mcq-q-text w-full bg-transparent px-4 py-3 text-gray-100 text-base outline-none resize-none rounded-lg placeholder-gray-600 pro-scrollbar leading-relaxed" rows="2" placeholder="الرجاء إدخال نص السؤال هنا..." required></textarea>
        <div class="absolute top-2 right-2 opacity-0 transition-opacity duration-300 pointer-events-none transform translate-y-1" id="smart-paste-hint-${blockId}">
            <span class="bg-blue-600 text-white text-xs px-2 py-1 rounded shadow flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                تم التعرف التلقائي
            </span>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 relative z-10">
        ${['أ', 'ب', 'ج', 'د'].map((letter, i) => `
            <div class="flex items-stretch enterprise-focus-ring rounded-lg smooth-transition bg-black/30 overflow-hidden border border-gray-700">
                <div class="flex items-center justify-center w-10 bg-gray-900 border-l border-gray-700 text-gray-500 font-semibold text-sm">${letter}</div>
                <input type="text" class="mcq-opt-${i} flex-1 bg-transparent px-3 py-2 text-gray-200 outline-none placeholder-gray-600 text-sm" placeholder="الخيار ${letter}" required>
            </div>
        `).join('')}
    </div>

    <div class="relative bg-gray-900/50 border border-gray-700 rounded-lg flex items-center group">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full p-3">
            <label class="text-sm font-semibold text-gray-300 flex items-center gap-2 whitespace-nowrap">
                الإجابة الصحيحة:
            </label>
            <div class="relative flex-1 w-full">
                <select class="mcq-correct w-full appearance-none bg-black/40 border border-gray-600 hover:border-blue-500 text-gray-200 text-sm rounded px-3 py-2 outline-none cursor-pointer focus:ring-1 focus:ring-blue-500 smooth-transition">
                    <option value="0" class="bg-gray-800">الخيار (أ)</option>
                    <option value="1" class="bg-gray-800">الخيار (ب)</option>
                    <option value="2" class="bg-gray-800">الخيار (ج)</option>
                    <option value="3" class="bg-gray-800">الخيار (د)</option>
                </select>
                <div class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
        </div>
    </div>
`;

const setupBlockInteractions = (block, container, blockId) => {
    const textarea = block.querySelector('.mcq-q-text');
    
    textarea.addEventListener('paste', function(e) {
        const pasteText = (e.clipboardData || window.clipboardData).getData('text');
        const lines = pasteText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length >= 5) {
            e.preventDefault();
            this.value = lines[0];
            const cleanOpt = (txt) => txt.replace(/^([أ-د]|\d+)[.):-]\s*/, '').replace(/^[أ-د]\s+/, '').replace(/✅|صح|\*|correct/ig, '').trim();
            
            let correctIndex = 0;
            const setOpt = (idx, lineIdx) => {
                const raw = lines[lineIdx];
                if(/✅|صح|\*|correct/i.test(raw)) correctIndex = idx;
                const optInput = block.querySelector(`.mcq-opt-${idx}`);
                if (optInput) optInput.value = cleanOpt(raw);
            };

            setOpt(0, 1); setOpt(1, 2); setOpt(2, 3); setOpt(3, 4);
            const correctSelect = block.querySelector('.mcq-correct');
            if (correctSelect) correctSelect.value = correctIndex;
            
            block.classList.add('ui-glow', 'border-blue-500');
            const hint = block.querySelector(`#smart-paste-hint-${blockId}`);
            if (hint) {
                hint.style.opacity = '1';
                hint.style.transform = 'translateY(0)';
            }
            
            FX.processing();
            
            setTimeout(() => {
                block.classList.remove('ui-glow', 'border-blue-500');
                if (hint) {
                    hint.style.opacity = '0';
                    hint.style.transform = 'translateY(4px)';
                }
            }, 2000);
            
            DraftSystem.save();
        }
    });

    if (window.innerWidth > 768) {
        const handle = block.querySelector('.drag-handle');
        if (handle) {
            block.draggable = true;
            block.addEventListener('dragstart', function(e) {
                this.classList.add('opacity-50', 'scale-95', 'border-dashed', 'border-gray-500');
                e.dataTransfer.effectAllowed = 'move';
                window._enterpriseDraggedBlock = this;
                FX.pop();
            });
            block.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if(window._enterpriseDraggedBlock && window._enterpriseDraggedBlock !== this) {
                    this.classList.add('border-blue-500', 'shadow-lg');
                }
            });
            block.addEventListener('dragleave', function() {
                this.classList.remove('border-blue-500', 'shadow-lg');
            });
            block.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('border-blue-500', 'shadow-lg');
                if (window._enterpriseDraggedBlock && window._enterpriseDraggedBlock !== this) {
                    const allBlocks = [...container.children];
                    const draggedIdx = allBlocks.indexOf(window._enterpriseDraggedBlock);
                    const droppedIdx = allBlocks.indexOf(this);
                    
                    if(draggedIdx < droppedIdx) this.parentNode.insertBefore(window._enterpriseDraggedBlock, this.nextSibling);
                    else this.parentNode.insertBefore(window._enterpriseDraggedBlock, this);
                    
                    updateQuestionNumbers(container);
                    DraftSystem.save();
                    FX.success();
                }
            });
            block.addEventListener('dragend', function() {
                this.classList.remove('opacity-50', 'scale-95', 'border-dashed', 'border-gray-500');
                window._enterpriseDraggedBlock = null;
            });
        }
    }
};

export function addMCQBlock() {
    const container = document.getElementById('dynamicQuestionsContainer');
    if (!container) return;
    questionCounter++;
    const blockId = Utils.generateId();
    const block = document.createElement('div');
    
    block.className = 'mcq-block enterprise-glass p-5 sm:p-6 rounded-xl relative border-l-4 border-l-blue-500 mb-6 smooth-transition transform translate-y-4 opacity-0 overflow-hidden shadow-sm';
    block.innerHTML = createBlockHTML(questionCounter, false, blockId);
    
    setupBlockInteractions(block, container, blockId);
    container.appendChild(block);
    
    FX.pop();
    requestAnimationFrame(() => {
        block.classList.remove('translate-y-4', 'opacity-0');
        Utils.scrollToElement(block);
    });
    DraftSystem.save();
}

export function addPublicMCQBlock() {
    const container = document.getElementById('dynamicPublicQuestionsContainer');
    if (!container) return;
    publicQuestionCounter++;
    const blockId = Utils.generateId();
    const block = document.createElement('div');
    
    block.className = 'public-mcq-block enterprise-glass p-5 sm:p-6 rounded-xl relative border-l-4 border-l-emerald-500 mb-6 smooth-transition transform translate-y-4 opacity-0 overflow-hidden shadow-sm';
    block.innerHTML = createBlockHTML(publicQuestionCounter, true, blockId);
    
    setupBlockInteractions(block, container, blockId);
    container.appendChild(block);
    
    FX.pop();
    requestAnimationFrame(() => {
        block.classList.remove('translate-y-4', 'opacity-0');
        Utils.scrollToElement(block);
    });
    DraftSystem.save();
}

export function removeBlock(blockElement) {
    if(!blockElement) return;
    FX.error();
    blockElement.style.transform = 'scale(0.95) translateX(-20px)';
    blockElement.style.opacity = '0';
    
    setTimeout(() => {
        const container = blockElement.parentElement;
        blockElement.remove();
        updateQuestionNumbers(container);
        DraftSystem.save();
    }, 300);
}

// --- Payload Preparation ---
const preparePayload = (blocksContainerId) => {
    const container = document.getElementById(blocksContainerId);
    if (!container) return [];
    const blocks = container.querySelectorAll(`:scope > div`);
    return Array.from(blocks).map(block => ({
        questionText: Utils.cleanText(block.querySelector('.mcq-q-text')?.value),
        options: Array.from({length: 4}, (_, i) => Utils.cleanText(block.querySelector(`.mcq-opt-${i}`)?.value)),
        correctAnswer: parseInt(block.querySelector('.mcq-correct')?.value || 0)
    })).filter(q => q.questionText && q.questionText !== '');
};

// --- Form Submission Integrations ---
const quizForm = document.getElementById('quizForm');
if(quizForm) {
    quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!Utils.validateInputs(quizForm)) {
            SysUI.toast('warning', "يوجد حقول إلزامية فارغة. يرجى إكمال البيانات المطلوبة.");
            return;
        }

        const payload = preparePayload('dynamicQuestionsContainer');
        if(!payload.length) { 
            SysUI.toast('error', "النموذج فارغ أو غير مكتمل. يرجى إضافة أسئلة صحيحة قبل الإرسال."); 
            FX.error();
            return; 
        }
        
        const btn = document.getElementById('saveQuizBtn');
        if (!btn) return;
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>جاري معالجة الطلب...</span>`; 
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        FX.processing();
        
        try {
            const token = localStorage.getItem('dahih_token'); 
            const res = await fetch(API.SAVE_QUIZ, { 
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    role: user?.role || 'admin', 
                    sessionToken: sessionToken || '', 
                    grade: Utils.cleanText(document.getElementById('quizGrade')?.value), 
                    quizTitle: Utils.cleanText(document.getElementById('quizTitle')?.value), 
                    questionsArray: payload
                })
            });
            
            if (res.ok) {
                SysUI.toast('success', "تم حفظ الاختبار بنجاح في قاعدة البيانات.");
                FX.success();
                quizForm.reset();
                const blocksContainer = document.getElementById('dynamicQuestionsContainer');
                if (blocksContainer) blocksContainer.innerHTML = '';
                questionCounter = 0; 
                addMCQBlock();
                localStorage.removeItem('dahih_quiz_draft_v3'); 
            } else throw new Error();
        } catch (err) {
            SysUI.toast('error', "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة لاحقاً.");
            FX.error();
        } finally {
            btn.innerHTML = originalBtnText; 
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    });
}

const publicQuizForm = document.getElementById('publicQuizForm');
if(publicQuizForm) {
    publicQuizForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!Utils.validateInputs(publicQuizForm)) {
            SysUI.toast('warning', "يرجى إكمال جميع الحقول المطلوبة لإنشاء الرابط.");
            return;
        }
        submitPublicQuiz(preparePayload('dynamicPublicQuestionsContainer'), false);
    });
}

export async function submitPublicQuiz(questionsSourceArray, isForced = false) {
    const btn = document.getElementById('savePublicQuizBtn');
    const linkArea = document.getElementById('publicQuizLinkArea');
    const linkInput = document.getElementById('publicQuizLinkInput');
    
    if (!btn || !linkArea || !linkInput) return;

    if(!questionsSourceArray.length) {
        if(!isForced) { 
            SysUI.toast('error', "لا يمكن إنشاء رابط لاختبار فارغ. يرجى إدراج الأسئلة."); 
            FX.error(); 
        }
        return; 
    }
    
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>جاري إنشاء الرابط...</span>`;
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    FX.processing();

    try {
        const token = localStorage.getItem('dahih_token'); 
        const res = await fetch(API.SAVE_PUB_QUIZ, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ 
                role: user?.role || 'user', 
                sessionToken: sessionToken || '', 
                grade: isForced ? "اختبار سريع" : Utils.cleanText(document.getElementById('publicQuizGrade')?.value || "عام"), 
                quizTitle: isForced ? "اختبار بدون عنوان" : Utils.cleanText(document.getElementById('publicQuizTitle')?.value), 
                questionsArray: questionsSourceArray 
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const fullLink = `${window.location.origin}/public-quiz.html?id=${data.quizId}`;
            
            const form = document.getElementById('publicQuizForm');
            if(form) {
                form.reset();
                const container = document.getElementById('dynamicPublicQuestionsContainer');
                if(container) container.innerHTML = '';
                publicQuestionCounter = 0; 
                if(!isForced) addPublicMCQBlock(); 
                localStorage.removeItem('dahih_pub_draft_v3');
            }

            linkInput.value = fullLink;
            linkArea.classList.remove('hidden');
            linkArea.classList.add('flex', 'flex-col', 'sm:flex-row');
            
            SysUI.toast('success', "تم إنشاء الرابط بنجاح.");
            FX.success();
            copyPublicLink();
            
        } else throw new Error();
    } catch (err) {
        SysUI.toast('error', "فشل إنشاء الرابط. يرجى مراجعة الاتصال بالخادم.");
        FX.error();
    } finally {
        btn.innerHTML = originalBtnText; 
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

export async function copyPublicLink() {
    const input = document.getElementById('publicQuizLinkInput');
    if (!input || !input.value) return;
    
    const triggerCopyEffect = () => {
        const btn = input.nextElementSibling;
        if(!btn) return;
        const orgHTML = btn.innerHTML;
        const orgClass = btn.className;
        
        btn.innerHTML = `<span class="flex items-center justify-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> تم النسخ</span>`;
        btn.classList.add('bg-green-600', 'text-white', 'border-green-500');
        
        SysUI.toast('success', "تم نسخ الرابط إلى الحافظة بنجاح.");
        FX.pop();
        
        setTimeout(() => {
            btn.innerHTML = orgHTML;
            btn.className = orgClass;
        }, 3000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(input.value);
            triggerCopyEffect();
        } catch (err) {
            fallbackCopy();
        }
    } else {
        fallbackCopy();
    }

    function fallbackCopy() {
        input.select();
        document.execCommand('copy');
        triggerCopyEffect();
        window.getSelection().removeAllRanges();
    }
}

// --- Data Import System (Enterprise Processor) ---
export const SmartImportSystem = {
    init() {
        const btnContainer = document.getElementById('smart-import-btn-container');
        const formContainer = document.getElementById('publicQuizForm');
        
        if (!document.getElementById('enterprise-smart-btn') && formContainer) {
            const importBtn = document.createElement('button');
            importBtn.id = 'enterprise-smart-btn';
            importBtn.type = 'button';
            importBtn.className = 'group relative w-full sm:w-auto bg-gray-800 text-gray-200 px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:bg-gray-700 flex items-center justify-center gap-2 border border-gray-600';
            importBtn.innerHTML = `
                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                <span>استيراد متقدم للبيانات</span>
            `;
            importBtn.onclick = () => { FX.pop(); this.showModal(); };
            
            if(btnContainer) btnContainer.appendChild(importBtn);
            else {
                const dyn = document.getElementById('dynamicPublicQuestionsContainer') || document.getElementById('dynamicQuestionsContainer');
                if(dyn) dyn.parentNode.insertBefore(importBtn, dyn);
            }
        }

        if (!document.getElementById('enterprise-smart-modal')) {
            const modalHTML = `
                <div id="enterprise-smart-modal" class="fixed inset-0 z-[10000] hidden items-center justify-center pointer-events-none px-4">
                    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 opacity-0" id="enterprise-modal-bg"></div>
                    <div class="relative bg-gray-900 border border-gray-700 p-6 sm:p-8 rounded-xl shadow-2xl transform scale-95 opacity-0 transition-all duration-300 w-full max-w-3xl mx-auto pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden" id="enterprise-modal-box">
                        
                        <div class="flex justify-between items-center mb-6 relative z-10 border-b border-gray-800 pb-4">
                            <div class="flex flex-col">
                                <h3 class="text-gray-100 font-semibold text-xl flex items-center gap-2">
                                    <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                                    أداة تحليل واستيراد الأسئلة
                                </h3>
                                <p class="text-gray-500 text-xs mt-1">يرجى إدراج الأسئلة في المربع أدناه لمعالجتها تلقائياً.</p>
                            </div>
                            <button id="enterprise-modal-close" class="text-gray-500 hover:text-white transition-colors p-2 rounded hover:bg-gray-800">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        
                        <div class="relative flex-grow mb-6 z-10">
                            <textarea id="enterprise-import-area" class="w-full h-full min-h-[300px] bg-black/50 border border-gray-700 rounded-lg px-4 py-4 text-gray-200 outline-none focus:border-blue-500 transition-colors text-sm resize-none pro-scrollbar relative z-10 leading-relaxed placeholder-gray-600" placeholder="يرجى لصق النصوص هنا وفق التنسيق المعتمد...&#10;&#10;مثال:&#10;نص السؤال الأول؟&#10;أ) الخيار الأول&#10;ب) الخيار الثاني&#10;ج) الخيار الثالث ✅&#10;د) الخيار الرابع"></textarea>
                        </div>
                        
                        <button id="enterprise-import-exec" class="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-semibold text-sm shadow relative z-10 flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            <span>معالجة وإدراج البيانات</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            document.getElementById('enterprise-modal-close').onclick = () => { FX.error(); this.hideModal(); };
            document.getElementById('enterprise-modal-bg').onclick = () => { FX.error(); this.hideModal(); };
            document.getElementById('enterprise-import-exec').onclick = () => { FX.processing(); this.process(); };
        }
    },

    showModal() {
        const m = document.getElementById('enterprise-smart-modal');
        const bg = document.getElementById('enterprise-modal-bg');
        const box = document.getElementById('enterprise-modal-box');
        document.getElementById('enterprise-import-area').value = '';
        m.classList.remove('hidden'); m.classList.add('flex');
        requestAnimationFrame(() => {
            bg.classList.remove('opacity-0');
            box.classList.remove('scale-95', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
            setTimeout(() => document.getElementById('enterprise-import-area').focus(), 50);
        });
    },

    hideModal() {
        const m = document.getElementById('enterprise-smart-modal');
        const bg = document.getElementById('enterprise-modal-bg');
        const box = document.getElementById('enterprise-modal-box');
        bg.classList.add('opacity-0');
        box.classList.remove('scale-100', 'opacity-100');
        box.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 300);
    },

    process() {
        const text = document.getElementById('enterprise-import-area').value;
        if (!text.trim()) {
            SysUI.toast('warning', 'الحقل فارغ. يرجى إدخال النص قبل المتابعة.');
            FX.error();
            return;
        }
        
        const btn = document.getElementById('enterprise-import-exec');
        const originalContent = btn.innerHTML;
        btn.innerHTML = `<span class="flex items-center justify-center gap-2"><svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>جاري تحليل البيانات...</span></span>`;
        btn.classList.add('pointer-events-none', 'opacity-80');
        
        setTimeout(() => {
            const parsed = this.deepParse(text);
            if (!parsed.length) {
                SysUI.toast('error', 'فشل في تحليل النص. يرجى التأكد من التنسيق والمحاولة مجدداً.');
                FX.error();
                btn.innerHTML = originalContent;
                btn.classList.remove('pointer-events-none', 'opacity-80');
                return;
            }
            this.hideModal();
            this.executeIntegration(parsed);
            setTimeout(() => {
                btn.innerHTML = originalContent;
                btn.classList.remove('pointer-events-none', 'opacity-80');
            }, 500);
        }, 500); 
    },

    deepParse(text) {
        let parsed = [];
        let cur = { q: '', opts: [], correct: 0 };
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const optRx = /^(\(?[أ-دa-d]\)?|[أ-دa-d][.-]|\d+[-.)])\s*(.*)/i;

        lines.forEach(line => {
            const match = line.match(optRx);
            if (match) {
                let optTxt = match[2];
                let isCorr = optTxt.match(/✅|صح|\*|correct/i);
                optTxt = optTxt.replace(/✅|صح|\*|correct/ig, '').trim();
                cur.opts.push(optTxt);
                if (isCorr) cur.correct = cur.opts.length - 1;
            } else {
                if (cur.opts.length >= 2) {
                    cur.q = cur.q.replace(/^(س\d+|السؤال\s*\d+|q\d+)[:.-]?\s*/i, '');
                    while(cur.opts.length < 4) cur.opts.push('...'); 
                    parsed.push({...cur});
                    cur = { q: line, opts: [], correct: 0 };
                } else {
                    cur.q = cur.q ? cur.q + '\n' + line : line;
                }
            }
        });
        if (cur.opts.length >= 2) {
            cur.q = cur.q.replace(/^(س\d+|السؤال\s*\d+|q\d+)[:.-]?\s*/i, '');
            while(cur.opts.length < 4) cur.opts.push('...');
            parsed.push({...cur});
        }
        return parsed;
    },

    async executeIntegration(qs) {
        SysUI.toast('success', `تم استخراج عدد ${qs.length} سؤال بنجاح. جاري الإدراج.`);
        FX.success();
        
        let isPublic = false;
        let container = document.getElementById('dynamicPublicQuestionsContainer');
        if (container) {
            isPublic = true;
        } else {
            container = document.getElementById('dynamicQuestionsContainer');
            if(!container) return;
        }

        const firstBlock = container.querySelector(isPublic ? '.public-mcq-block' : '.mcq-block');
        if (firstBlock && !(firstBlock.querySelector('.mcq-q-text')?.value?.trim())) {
            firstBlock.remove();
            if(isPublic) publicQuestionCounter = 0; else questionCounter = 0;
        }

        const sleep = ms => new Promise(r => setTimeout(r, ms));
        
        document.body.style.overflow = 'hidden';

        for (let i = 0; i < qs.length; i++) {
            const pq = qs[i];
            isPublic ? addPublicMCQBlock() : addMCQBlock(); 
            const newBlock = container.lastElementChild;
            
            await sleep(50);
            Utils.scrollToElement(newBlock);
            
            const scanner = document.createElement('div');
            scanner.className = 'data-scanner';
            newBlock.appendChild(scanner);
            FX.play(600 + (i*10), 'sine', 0.05, 0.01);

            const qInp = newBlock.querySelector('.mcq-q-text');
            const opts = Array.from({length:4}, (_,j) => newBlock.querySelector(`.mcq-opt-${j}`));
            const corr = newBlock.querySelector('.mcq-correct');

            if(qInp) qInp.value = pq.q;
            
            for (let j = 0; j < 4; j++) {
                if(opts[j]) opts[j].value = pq.opts[j];
            }

            if(corr) corr.value = pq.correct;
            
            await sleep(150);
            if(scanner.parentNode) scanner.remove();
        }
        
        document.body.style.overflow = '';
        DraftSystem.save();
        FX.success();
        SysUI.toast('success', 'اكتملت عملية الإدراج بنجاح.');
    }
};

// --- System Shortcuts ---
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        DraftSystem.save();
        SysUI.toast('success', 'تم حفظ المسودة يدوياً بنجاح.');
        FX.success();
    }
    if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if(document.getElementById('dynamicPublicQuestionsContainer')) addPublicMCQBlock();
        else if(document.getElementById('dynamicQuestionsContainer')) addMCQBlock();
    }
    if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        SmartImportSystem.showModal();
    }
});

// --- Exposing Required Globals ---
window.addMCQBlock = addMCQBlock;
window.addPublicMCQBlock = addPublicMCQBlock;
window.removeBlock = removeBlock;
window.copyPublicLink = copyPublicLink;
