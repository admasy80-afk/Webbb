// ==================== الملف الرئيسي المجمع للمنصة ====================
import { SysUI } from './ui.js';
import './state.js'; 
import { fetchStats, fetchPendingRequests, fetchGradeContent, fetchStudentsByGrade, logout } from './admin.js';
import { DraftSystem, addMCQBlock, addPublicMCQBlock, SmartImportSystem, copyPublicLink } from './quiz.js';
import './stream.js'; 
import { VideoSystem } from './video.js'; 

// 🚀 السحر كله هنا: فك حظر الدوال وإجبار المتصفح إنه يشوفها
window.addMCQBlock = addMCQBlock;
window.addPublicMCQBlock = addPublicMCQBlock;
window.fetchGradeContent = fetchGradeContent;
window.fetchStudentsByGrade = fetchStudentsByGrade;
window.copyPublicLink = copyPublicLink;
window.logout = logout;

// ✅ دالة قفل النافذة المنبثقة للنتائج (مكتوبة مباشرة هنا عشان متضربش أي إيرور)
window.closeResultsModal = function() {
    const modal = document.getElementById('resultsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
};
// =================================================================

export function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const activeTab = document.getElementById(`tab-${tabId}`);
    if(activeTab) {
        activeTab.classList.add('active');
        document.getElementById(`btn-${tabId}`).classList.add('active');
        
        setTimeout(() => {
            activeTab.style.opacity = '1';
            activeTab.style.transform = 'translateY(0)';
        }, 50);

        if(tabId === 'requests') fetchPendingRequests();
        if(tabId === 'dashboard') fetchStats();
        if(tabId === 'videos' && VideoSystem) VideoSystem.loadCourses(); // 🔥 تحديث أرشيف الفيديوهات تلقائياً عند فتح القسم
    }
}
window.switchTab = switchTab;

export function toggleContentFields() {
    const type = document.getElementById('contentType').value;
    const pointF = document.getElementById('pointField');
    const qFields = document.getElementById('questionFields');
    
    if(type !== 'point') {
        pointF.style.opacity = '0';
        setTimeout(() => {
            pointF.classList.add('hidden');
            qFields.classList.remove('hidden');
            qFields.style.opacity = '0';
            setTimeout(() => { qFields.style.transition = 'opacity 0.3s'; qFields.style.opacity = '1'; }, 50);
        }, 150);
    } else {
        qFields.style.opacity = '0';
        setTimeout(() => {
            qFields.classList.add('hidden');
            pointF.classList.remove('hidden');
            pointF.style.opacity = '0';
            setTimeout(() => { pointF.style.transition = 'opacity 0.3s'; pointF.style.opacity = '1'; }, 50);
        }, 150);
    }
}
window.toggleContentFields = toggleContentFields;

// ==================== المساعد الصوتي ====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG'; 
    recognition.continuous = false; 
    recognition.interimResults = false;

    const micBtn = document.createElement('button');
    micBtn.className = 'fixed bottom-5 right-5 w-14 h-14 bg-yellow-600 hover:bg-yellow-500 rounded-full shadow-[0_0_20px_rgba(202,138,4,0.4)] flex items-center justify-center text-white transition-all z-50 hover:scale-110 active:scale-95 group border border-yellow-400/30';
    micBtn.innerHTML = `
        <svg class="w-6 h-6 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        <span class="absolute -top-10 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">المساعد الصوتي</span>
    `;
    document.body.appendChild(micBtn);

    let isListening = false;

    micBtn.onclick = () => {
        if(!isListening) {
            try { recognition.start(); } catch(e){}
        } else {
            recognition.stop();
        }
    };

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.replace('bg-yellow-600', 'bg-red-500'); 
        micBtn.classList.replace('hover:bg-yellow-500', 'hover:bg-red-400');
        micBtn.classList.replace('shadow-[0_0_20px_rgba(202,138,4,0.4)]', 'shadow-[0_0_20px_rgba(239,68,68,0.6)]');
        micBtn.classList.add('animate-bounce');
        SysUI.toast('warning', 'المنصة تسمعك الآن.. تكلم!');
    };

    recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase();

        if(command.includes('سؤال جديد') || command.includes('اضف سؤال') || command.includes('إضافة سؤال')) {
            if(document.getElementById('tab-create-quiz') && document.getElementById('tab-create-quiz').classList.contains('active')) addMCQBlock();
            else if (document.getElementById('tab-create-public') && document.getElementById('tab-create-public').classList.contains('active')) addPublicMCQBlock();
            SysUI.toast('success', 'حاضر، تم إضافة سؤال جديد.');
        } else if (command.includes('احفظ الامتحان') || command.includes('ارفع الامتحان') || command.includes('نشر')) {
            if(document.getElementById('tab-create-quiz') && document.getElementById('tab-create-quiz').classList.contains('active')) {
                document.getElementById('saveQuizBtn').click();
            } else if (document.getElementById('tab-create-public') && document.getElementById('tab-create-public').classList.contains('active')) {
                document.getElementById('savePublicQuizBtn').click();
            }
            SysUI.toast('success', 'جاري تنفيذ أمر الحفظ!');
        } else if (command.includes('افتح الطلبات') || command.includes('طلبات التسجيل')) {
            switchTab('requests');
            SysUI.toast('success', 'تم فتح قسم الطلبات.');
        } else if (command.includes('افتح المحاضرات') || command.includes('رفع فيديو') || command.includes('الفيديوهات')) {
            switchTab('videos');
            SysUI.toast('success', 'تم فتح قسم الكورسات.');
        } else {
            SysUI.toast('error', `لم أفهم الأمر: "${command}"`);
        }
    };

    recognition.onend = () => {
        isListening = false;
        micBtn.classList.replace('bg-red-500', 'bg-yellow-600');
        micBtn.classList.replace('hover:bg-red-400', 'hover:bg-yellow-500');
        micBtn.classList.replace('shadow-[0_0_20px_rgba(239,68,68,0.6)]', 'shadow-[0_0_20px_rgba(202,138,4,0.4)]');
        micBtn.classList.remove('animate-bounce');
    };
}

// ==================== اختصارات الكيبورد ====================
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if(document.getElementById('tab-create-quiz') && document.getElementById('tab-create-quiz').classList.contains('active')) {
            addMCQBlock();
            SysUI.toast('success', 'تم إضافة سؤال منصة جديد');
        } else if (document.getElementById('tab-create-public') && document.getElementById('tab-create-public').classList.contains('active')) {
            addPublicMCQBlock();
            SysUI.toast('success', 'تم إضافة سؤال عام جديد');
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if(document.getElementById('tab-create-quiz') && document.getElementById('tab-create-quiz').classList.contains('active')) {
            document.getElementById('quizForm').dispatchEvent(new Event('submit', { cancelable: true }));
        } else if (document.getElementById('tab-create-public') && document.getElementById('tab-create-public').classList.contains('active')) {
            document.getElementById('publicQuizForm').dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }
});

// ==================== الأحداث الأساسية والتحميل ====================
const quizForm = document.getElementById('quizForm');
if(quizForm) {
    quizForm.addEventListener('input', () => DraftSystem.save());
}

document.addEventListener('DOMContentLoaded', () => {
    // 🔥 تهيئة نظام تشغيل الفيديوهات وربط أحداث الفورم بمجرد تحميل الصفحة
    if (VideoSystem && typeof VideoSystem.init === 'function') {
        VideoSystem.init();
    }

    if(document.getElementById('dynamicQuestionsContainer') && document.getElementById('dynamicQuestionsContainer').children.length === 0) addMCQBlock();
    if(document.getElementById('dynamicPublicQuestionsContainer') && document.getElementById('dynamicPublicQuestionsContainer').children.length === 0) addPublicMCQBlock();
    
    setTimeout(() => fetchStats(), 300);
    setTimeout(() => DraftSystem.check(), 1000); 
    setTimeout(() => SmartImportSystem.init(), 1000); 
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setTimeout(() => SmartImportSystem.init(), 100);
    });
});
