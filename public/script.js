// أيقونة سلة المهملات SVG الرسمية
const trashSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

const userDataStr = localStorage.getItem('dahih_user');
let user = null;
let sessionToken = null;
if (!userDataStr) window.location.href = "/logina.html";
else {
    user = JSON.parse(userDataStr);
    sessionToken = user.token || localStorage.getItem('dahih_token') || ""; 
    if (user.role !== 'dev' && user.role !== 'owner') window.location.href = "/dashboard.html";
    else document.getElementById('adminWelcomeName').innerText = user.name || "إدارة";
}

let currentGradeData = null;

// دالة تبديل التبويبات
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');

    if(tabId === 'requests') fetchPendingRequests();
    if(tabId === 'dashboard') fetchStats();
}

// ==================== سكريبت البث المباشر ====================
const rawToken = "TmV68hFTctxYq"; 
const WS_URL = `wss://mohepfy10-d7e7.hf.space/?token=${encodeURIComponent(rawToken)}`; 

let streamSocket;
let mediaRecorder;
let localStream;
let isAudioMuted = false;
let isVideoHidden = false;

const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('localVideo');
const camOverlay = document.getElementById('camOverlay');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const streamStatusBadge = document.getElementById('streamStatusBadge');

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(err => alert(`تعذر تكبير الشاشة: ${err.message}`));
    } else { document.exitFullscreen(); }
});

startStreamBtn.addEventListener('click', async () => {
    try {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true
            });
        } catch (fallbackError) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        
        if (!localStream) throw new Error("الكاميرا غير متوفرة.");

        videoElement.srcObject = null; // تنظيف مؤقت
        videoElement.srcObject = localStream;
        camOverlay.classList.add('hidden');

        if (streamSocket && streamSocket.readyState === WebSocket.OPEN) streamSocket.close();
        streamSocket = new WebSocket(WS_URL);

        streamSocket.onopen = async () => {
            streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-green-500 block pulse-live"></span> البث قيد التشغيل`;
            streamStatusBadge.className = "bg-green-900/30 border border-green-500/50 text-green-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3";
            
            startStreamBtn.classList.add('hidden');
            stopStreamBtn.classList.remove('hidden');

            mediaRecorder = new MediaRecorder(localStream, {
                mimeType: 'video/webm; codecs=vp8,opus',
                videoBitsPerSecond: 2500000 
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0 && streamSocket.readyState === WebSocket.OPEN) {
                    streamSocket.send(event.data);
                }
            };
            mediaRecorder.start(1000);

            try {
                await fetch('/api/admin/toggle-stream', { 
                    method: 'POST', headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ role: user.role, sessionToken: sessionToken, isLive: true }) 
                });
            } catch (e) {}
        };

        streamSocket.onclose = () => { stopLiveStream(true); alert("انتهى الاتصال بالسيرفر."); };
        streamSocket.onerror = (e) => { console.error("WS Error:", e); stopLiveStream(true); };

    } catch (err) { alert(`خطأ: ${err.message}`); stopLiveStream(true); }
});

toggleMicBtn.addEventListener('click', () => {
    if (localStream && localStream.getAudioTracks().length > 0) {
        isAudioMuted = !isAudioMuted;
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        toggleMicBtn.className = isAudioMuted ? "bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-lg border border-red-500" : "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10";
        toggleMicBtn.innerHTML = isAudioMuted ? 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>` : 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    }
});

toggleCamBtn.addEventListener('click', () => {
    if (localStream && localStream.getVideoTracks().length > 0) {
        isVideoHidden = !isVideoHidden;
        localStream.getVideoTracks()[0].enabled = !isVideoHidden;
        toggleCamBtn.className = isVideoHidden ? "bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-lg border border-red-500" : "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10";
        toggleCamBtn.innerHTML = isVideoHidden ? 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>` : 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    }
});

async function stopLiveStream(forced = false) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (streamSocket && streamSocket.readyState === WebSocket.OPEN) streamSocket.close();
    if (document.fullscreenElement) document.exitFullscreen();
    
    startStreamBtn.classList.remove('hidden');
    stopStreamBtn.classList.add('hidden');
    camOverlay.classList.remove('hidden');
    
    streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-gray-500 block"></span> النظام في وضع الاستعداد`;
    streamStatusBadge.className = "bg-gray-800 border border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3";
    
    // تنظيف الميكروفون والكاميرا UI
    isAudioMuted = false;
    isVideoHidden = false;
    toggleMicBtn.className = "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10";
    toggleMicBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    toggleCamBtn.className = "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10";
    toggleCamBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    
    try {
        await fetch('/api/admin/toggle-stream', { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, isLive: false }) 
        });
    } catch (e) {}
}

// ==================================================================================

// جلب الإحصائيات
async function fetchStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        const data = await res.json();
        document.getElementById('stats-students').innerText = data.studentsCount || 0;
        document.getElementById('stats-pending').innerText = data.pendingCount || 0;
    } catch (err) {}
}

// جلب طلبات التسجيل
async function fetchPendingRequests() {
    const container = document.getElementById('pendingRequestsContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 animate-pulse">جاري جلب الطلبات الأساسية...</p>';
    try {
        const res = await fetch('/api/admin/pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        const students = await res.json();
        if (students.length === 0) { container.innerHTML = '<p class="text-gray-500 text-center mt-10">لا توجد طلبات جديدة حالياً.</p>'; return; }
        let html = '';
        students.forEach(st => {
            const fullName = `${st.first_name} ${st.second_name} ${st.third_name} ${st.last_name}`;
            html += `<div class="glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 animate-fade-in-up">
                <div class="text-center md:text-right">
                    <h4 class="font-bold text-white">${fullName}</h4>
                    <p class="text-xs text-gray-400 mt-1">${st.email} | ${st.grade}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="updateStudentStatus('${st.email}', 'accepted')" class="bg-green-500/10 text-green-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-500/20">قبول</button>
                    <button onclick="rejectStudent('${st.email}')" class="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500/20">رفض</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center">خطأ أساسي في الاتصال.</p>'; }
}

async function updateStudentStatus(email, newStatus, reason = '') {
    await fetch('/api/admin/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: user.role, sessionToken: sessionToken, studentEmail: email, newStatus, reason }) });
    fetchPendingRequests(); fetchStats();
}

function rejectStudent(email) { const reason = prompt("سبب الرفض الأساسي:"); if (reason) updateStudentStatus(email, 'rejected', reason); }

// جلب الطلاب المقبولين
async function fetchStudentsByGrade() {
    const grade = document.getElementById('listGradeSelect').value;
    const container = document.getElementById('studentsListContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 col-span-full animate-pulse">جاري تحميل قائمة الطلاب...</p>';
    try {
        const res = await fetch('/api/admin/students-by-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        const students = await res.json();
        if (students.length === 0) { container.innerHTML = `<p class="text-gray-500 text-center py-10 col-span-full">لا يوجد طلاب مقبولين في هذه الدفعة.</p>`; return; }
        let html = '';
        students.forEach(st => {
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`;
            html += `<div class="bg-black/40 border border-white/5 rounded-xl p-4 flex justify-between items-center hover:border-yellow-500/30 transition-all animate-fade-in-up">
                <div class="truncate">
                    <h4 class="font-bold text-white text-sm md:text-base truncate">${fullName}</h4>
                    <p class="text-[10px] text-gray-500 mt-1 truncate">${st.email}</p>
                </div>
                <div class="text-left shrink-0">
                    <p class="text-yellow-500 text-xs font-bold">${st.points || 0}%</p>
                    <p class="text-[10px] text-gray-400 truncate" dir="ltr">${st.phone || '-'}</p>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ في الاتصال.</p>'; }
}


// ==================== إدارة المحتوى والنتائج ====================
async function fetchGradeContent() {
    const grade = document.getElementById('manageGradeSelect').value;
    const container = document.getElementById('manageContainer');
    const loading = document.getElementById('manageLoading');
    container.classList.add('hidden');
    loading.classList.remove('hidden');
    try {
        const res = await fetch('/api/admin/get-grade-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        if (res.ok) {
            currentGradeData = await res.json();
            renderManageContent(grade);
            loading.classList.add('hidden');
            container.classList.remove('hidden');
        } else alert("حدث خطأ في جلب المحتوى.");
    } catch (err) { alert("مشكلة في الاتصال."); }
}

function renderManageContent(grade) {
    const data = currentGradeData;
    
    // 1. الاختبارات العامة
    let htmlPubQZ = '';
    if (data.publicQuizzes && data.publicQuizzes.length > 0) {
        data.publicQuizzes.forEach(q => {
            htmlPubQZ += `<div class="bg-yellow-900/10 border border-yellow-500/20 p-4 rounded-xl flex justify-between items-center group animate-fade-in-up">
                <div class="truncate"><p class="font-bold text-white text-base md:text-lg truncate">${q.title}</p><p class="text-xs text-yellow-300 mt-1">الردود: ${q.results ? q.results.length : 0} | عام (برابط)</p></div>
                <div class="flex gap-4 items-center shrink-0">
                    <button onclick="showDetailedResults('${q.id}', true)" class="bg-yellow-600/20 text-yellow-500 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-bold hover:bg-yellow-600 hover:text-black transition-all">النتائج</button>
                    <div onclick="deleteContent('${grade}', 'publicQuiz', '${q.id}')" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlPubQZ = '<p class="text-gray-500 text-sm py-4">لا توجد اختبارات عامة حالياً.</p>';
    document.getElementById('managePublicQuizzes').innerHTML = htmlPubQZ;

    // 2. الاختبارات المنصة
    let htmlQZ = '';
    if (data.quizzes && data.quizzes.length > 0) {
        data.quizzes.forEach(q => {
            htmlQZ += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center group animate-fade-in-up">
                <div class="truncate"><p class="font-bold text-white text-base md:text-lg truncate">${q.title}</p><p class="text-xs text-gray-500 mt-1">المجيبين: ${q.results ? q.results.length : 0}</p></div>
                <div class="flex gap-4 items-center shrink-0">
                    <button onclick="showDetailedResults('${q.id}', false)" class="bg-white/10 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-black transition-all">عرض النتائج</button>
                    <div onclick="deleteContent('${grade}', 'quiz', '${q.id}')" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlQZ = '<p class="text-gray-500 text-sm py-4">لا توجد اختبارات منصة أساسية حالياً.</p>';
    document.getElementById('manageQuizzes').innerHTML = htmlQZ;

    // البقية
    let htmlTS = '';
    if (data.tests && data.tests.length > 0) {
        data.tests.forEach(t => {
            htmlTS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center animate-fade-in-up"><p class="font-bold text-white truncate">${t.testName}</p><div onclick="deleteContent('${grade}', 'test', '${t.testName}')" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div></div>`;
        });
    } else htmlTS = '<p class="text-gray-500 text-sm py-2">لا توجد سجلات أساسية.</p>';
    document.getElementById('manageTests').innerHTML = htmlTS;

    let htmlQS = '';
    if (data.questions && data.questions.length > 0) {
        data.questions.forEach(q => {
            htmlQS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4 animate-fade-in-up"><p class="text-white text-sm truncate">${q.question}</p><div onclick="deleteContent('${grade}', 'question', '${q.question}')" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div></div>`;
        });
    } else htmlQS = '<p class="text-gray-500 text-sm py-2">لا توجد أسئلة مقالية أساسية.</p>';
    document.getElementById('manageQuestions').innerHTML = htmlQS;

    let htmlPT = '';
    if (data.points && data.points.length > 0) {
        data.points.forEach(p => {
            htmlPT += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4 animate-fade-in-up"><p class="text-gray-300 text-sm truncate">${p}</p><div onclick="deleteContent('${grade}', 'point', '${p}')" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div></div>`;
        });
    } else htmlPT = '<p class="text-gray-500 text-sm py-2">لا توجد نقاط أساسية.</p>';
    document.getElementById('managePoints').innerHTML = htmlPT;
}

async function deleteContent(grade, itemType, identifier) {
    if(!confirm("هل أنت متأكد من حذف هذا العنصر الأساسي نهائياً؟")) return;
    try {
        const res = await fetch('/api/admin/delete-item', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade, itemType, identifier })
        });
        if (res.ok) fetchGradeContent();
        else alert("خطأ أساسي في الحذف.");
    } catch (err) { alert("مشكلة في اتصال قاعدة البيانات."); }
}

// ==================== نافذة النتائج المفصلة ====================
function showDetailedResults(quizId, isPublic) {
    const arrayToSearch = isPublic ? currentGradeData.publicQuizzes : currentGradeData.quizzes;
    if (!arrayToSearch) return;

    const quiz = arrayToSearch.find(q => q.id === quizId);
    if(!quiz) return;

    document.getElementById('resultsModalTitle').innerText = quiz.title + (isPublic ? " (عام)" : " (منصة أساسية)");
    const container = document.getElementById('resultsModalContent');
    
    if(!quiz.results || quiz.results.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-10">لم يقم أحد بحل هذا الاختبار بعد.</p>';
    } else {
        let html = '';
        
        quiz.results.sort((a,b) => b.percentage - a.percentage).forEach((res, index) => {
            let color = res.percentage >= 85 ? 'text-green-400' : (res.percentage >= 50 ? 'text-blue-400' : 'text-red-400');
            let borderColor = res.percentage >= 50 ? 'border-gray-700' : 'border-red-900/30';
            
            html += `
            <div class="bg-black/40 rounded-xl border ${borderColor} mb-3 overflow-hidden animate-fade-in-up" style="animation-delay: ${index * 0.05}s;">
                <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors" onclick="toggleStudentDetails('detail-${index}')">
                    <div class="flex items-center gap-4 truncate">
                        <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-white shrink-0">${index + 1}</div>
                        <div class="truncate">
                            <p class="font-bold text-white text-sm md:text-base truncate">${res.studentName || 'طالب غير معروف'}</p>
                            <p class="text-xs text-gray-500 mt-1 truncate">${res.email || ''} ${res.visitorId ? ' | <span class="text-yellow-500" title="بصمة الجهاز">تم التحقق</span>' : ''}</p>
                        </div>
                    </div>
                    <div class="text-left flex items-center gap-4 shrink-0">
                        <div class="text-center">
                            <p class="font-black text-xl md:text-2xl ${color}">${res.percentage || 0}%</p>
                            <p class="text-[10px] text-gray-400">${res.score} / ${quiz.questions.length}</p>
                        </div>
                        <svg class="w-5 h-5 text-gray-500 transition-transform" id="icon-detail-${index}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                
                <div id="detail-${index}" class="student-details bg-black/60 px-5 pb-5 max-h-0 overflow-hidden transition-all duration-300">
                    <h4 class="text-white font-bold text-sm mb-4 border-b border-white/10 pb-2">مراجعة الإجابات:</h4>
                    <div class="space-y-4">`;

            if (res.userAnswers && res.userAnswers.length > 0) {
                const letters = ['أ', 'ب', 'ج', 'د'];
                quiz.questions.forEach((q, qIdx) => {
                    const sAns = res.userAnswers[qIdx];
                    const cAns = q.correctAnswer;
                    const isCorrect = sAns === cAns;
                    
                    html += `
                        <div class="bg-black/50 p-4 rounded-xl border ${isCorrect ? 'border-green-500/20' : 'border-red-500/20'}">
                            <p class="text-sm font-semibold text-gray-200 mb-3">${qIdx + 1}. ${q.questionText}</p>
                            <div class="space-y-2 text-xs md:text-sm">`;
                    
                    q.options.forEach((opt, optIdx) => {
                        let optStyle = "text-gray-500";
                        let optIcon = "○";
                        
                        if (optIdx === sAns && !isCorrect) {
                            optStyle = "text-red-400 font-bold bg-red-500/10 px-2 py-1 rounded";
                            optIcon = "❌";
                        } else if (optIdx === cAns) {
                            optStyle = "text-green-400 font-bold bg-green-500/10 px-2 py-1 rounded";
                            optIcon = "✅";
                        } else if (optIdx === sAns && isCorrect) {
                            optStyle = "text-green-400 font-bold bg-green-500/10 px-2 py-1 rounded";
                            optIcon = "✅ (إجابة الطالب)";
                        }

                        html += `<div class="${optStyle} flex items-center gap-2"><span class="w-4 flex-shrink-0 text-center text-base">${optIcon}</span> <span class="leading-relaxed">${opt}</span></div>`;
                    });
                    
                    html += `</div></div>`;
                });
            } else {
                html += `<p class="text-xs text-gray-500 py-2">تفاصيل الإجابات غير متوفرة لهذا السجل.</p>`;
            }

            html += `</div></div></div>`; 
        });
        
        container.innerHTML = html;
    }
    document.getElementById('resultsModal').classList.remove('hidden');
}

function toggleStudentDetails(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if(el) {
        if (el.style.maxHeight && el.style.maxHeight !== "0px") {
            el.style.maxHeight = "0px";
            icon.style.transform = "rotate(0deg)";
        } else {
            el.style.maxHeight = el.scrollHeight + "px";
            icon.style.transform = "rotate(180deg)";
        }
    }
}

function closeResultsModal() { 
    document.getElementById('resultsModal').classList.add('hidden'); 
}


// ==================== إنشاء اختبار (المنصة الداخلي الأساسي) ====================
let questionCounter = 0;
function addMCQBlock() {
    questionCounter++;
    const container = document.getElementById('dynamicQuestionsContainer');
    const block = document.createElement('div');
    block.className = 'mcq-block glass-panel p-5 md:p-6 rounded-2xl relative border-l-4 border-l-yellow-500 animate-fade-in-up';
    block.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-yellow-500">السؤال رقم ${questionCounter}</h3>
            <div onclick="this.parentElement.parentElement.remove()" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500 text-sm mb-4" rows="2" placeholder="اكتب نص السؤال الأساسي هنا..." required></textarea>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الأول" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الثاني" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الثالث" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الرابع" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 md:p-4 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap">الإجابة الصحيحة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm">
                <option value="0" class="bg-gray-900">أ</option>
                <option value="1" class="bg-gray-900">ب</option>
                <option value="2" class="bg-gray-900">ج</option>
                <option value="3" class="bg-gray-900">د</option>
            </select>
        </div>
    `;
    container.appendChild(block);
}

document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveQuizBtn');
    const msg = document.getElementById('quizMsg');
    const blocks = document.querySelectorAll('#dynamicQuestionsContainer .mcq-block');
    if(blocks.length === 0) { alert("أضف سؤالاً واحداً على الأقل!"); return; }
    
    btn.innerText = "جاري النشر..."; btn.disabled = true;
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
            msg.innerText = "تم نشر الاختبار الداخلي بنجاح!";
            msg.className = "text-green-400 text-sm text-center block mt-2 font-bold";
            document.getElementById('quizForm').reset();
            document.getElementById('dynamicQuestionsContainer').innerHTML = '';
            questionCounter = 0; addMCQBlock();
        } else throw new Error();
    } catch (err) {
        msg.innerText = "فشل أساسي في حفظ الاختبار.";
        msg.className = "text-red-400 text-sm text-center block mt-2 font-bold";
    } finally {
        btn.innerText = "نشر الاختبار للطلاب"; btn.disabled = false;
        setTimeout(() => msg.classList.add('hidden'), 4000);
    }
});


// ==================== 🔥 إنشاء الاختبار العام (برابط) 🔥 ====================
let publicQuestionCounter = 0;
function addPublicMCQBlock() {
    publicQuestionCounter++;
    const container = document.getElementById('dynamicPublicQuestionsContainer');
    const block = document.createElement('div');
    block.className = 'public-mcq-block glass-panel p-5 md:p-6 rounded-2xl relative border-l-4 border-l-yellow-500 animate-fade-in-up';
    block.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-yellow-500">السؤال العام رقم ${publicQuestionCounter}</h3>
            <div onclick="this.parentElement.parentElement.remove()" class="trash-icon text-gray-500 hover:text-red-500 transition-colors">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500 text-sm mb-4" rows="2" placeholder="اكتب نص السؤال العام هنا..." required></textarea>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الأول العام" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الثاني العام" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الثالث العام" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6 text-center">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500" placeholder="الخيار الرابع العام" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 md:p-4 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap">الإجابة الصحيحة العامة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm">
                <option value="0" class="bg-gray-900">أ</option>
                <option value="1" class="bg-gray-900">ب</option>
                <option value="2" class="bg-gray-900">ج</option>
                <option value="3" class="bg-gray-900">د</option>
            </select>
        </div>
    `;
    container.appendChild(block);
}

// 🔥 الـ 19 سؤال الاحتياطي الجاهز من الصور (Backup MCQ Questions) - الصف الثاني الثانوي 🔥
const backupQuestions = [
    {
        "questionText": "تقلّد ولاية مصر اعتبارًا من عهد الخليفة العباسي المعتصم ولاة من العنصر ............ ",
        "options": ["العربي.", "التركي.", "الفارسي.", "البربري."],
        "correctAnswer": 1
    },
    {
        "questionText": "قام خمارويه بتدعيم حكمه من خلال وسائل ............ ",
        "options": ["اقتصادية.", "اجتماعية.", "دينية.", "عسكرية."],
        "correctAnswer": 1
    },
    {
        "questionText": "نجح أحمد بن طولون في تثبيت حكمه في مصر معتمدًا على مبدأ ............ ",
        "options": ["الديمقراطية.", "المشاركة.", "الديكتاتورية.", "المساواة."],
        "correctAnswer": 1
    },
    {
        "questionText": "يرجع عدم استعادة الدولة العباسية حكم مصر بعد وفاة محمد بن طغج الإخشيد إلى ............ ",
        "options": ["التزامها بعهدها مع الإخشيد.", "قوة كافور الإخشيدي العسكرية.", "تصدى أنوجور لأعداء العباسيين.", "عدم اهتمام العباسيين بمصر."],
        "correctAnswer": 1
    },
    {
        "questionText": "تأكدت أهمية مصر الاقتصادية للدولة الإسلامية في عصر الخلفاء الراشدين من خلال ............ ",
        "options": ["توفير الأمن الغذائي.", "إنشاء خليج أمير المؤمنين.", "فتح أسواق للبضائع المصرية.", "استصلاح الأراضي الزراعية."],
        "correctAnswer": 0
    },
    {
        "questionText": "حدد أى من الحرف المصرية الآتية كان لها الفضل الأكبر فى التخفيف من الأزمة الاقتصادية فى عهد عمر بن الخطاب ............ ",
        "options": ["الرعى والصناعة.", "الرعى والزراعة.", "الزراعة والتجارة.", "التجارة والصناعة."],
        "correctAnswer": 1
    },
    {
        "questionText": "أدى إنشاء فروع لبيت المال في الولايات إلى تطبيق مبدأ ............ ",
        "options": ["الديمقراطية.", "المركزية.", "اللامركزية.", "المساواة."],
        "correctAnswer": 2
    },
    {
        "questionText": "أدى جعل عمر بن الخطاب أمين بيت المال مستقلًا في عمله عن الولاة إلى اكتساب الحضارة الإسلامية خاصية ............ ",
        "options": ["الابتكار.", "المساواة.", "العدالة.", "المشاركة."],
        "correctAnswer": 0
    },
    {
        "questionText": "ارتبط تقدم المسلمين في علمي الفلك والجبر بـ ............ ",
        "options": ["إقامة الدولة للمراصد.", "ازدهار حركة الترجمة.", "الشعائر الدينية.", "اتساع الدولة الإسلامية."],
        "correctAnswer": 2
    },
    {
        "questionText": "يُعد من أسباب ازدهار الحياة العلمية في الدولة الإسلامية الاستقرار الاقتصادي للعلماء من خلال ............ ",
        "options": ["ازدهار النشاط التجاري.", "نظام الوقف الإسلامي.", "تشجيع الأمويين للمترجمين.", "انتشار الإسلام بين غير العرب."],
        "correctAnswer": 1
    },
    {
        "questionText": "استفادت الزراعة من تقدم المسلمين في علمي ............ ",
        "options": ["الكيمياء والفيزياء.", "الجيولوجيا والفيزياء.", "الجغرافيا والجيولوجيا.", "الرياضيات والفلك."],
        "correctAnswer": 2
    },
    {
        "questionText": "تشابه موقف المسلمين في معركة حطين والحملة الصليبية الخامسة في ............ ",
        "options": ["القوة العسكرية للمسلمين.", "الاستفادة من ميدان المعركة.", "الحفاظ على بيت المقدس.", "القوة العسكرية للصليبيين."],
        "correctAnswer": 1
    },
    {
        "questionText": "حرص صلاح الدين الأيوبي على الاستيلاء على المدن الساحلية قبل استرداده بيت المقدس من أجل ............ ",
        "options": ["إبعاد الصليبيين عن بيت المقدس.", "الأهمية الاقتصادية لمدن الساحل.", "منع وصول إمدادات بحرية للصليبيين.", "تأمين طريق التجار المسلمين."],
        "correctAnswer": 2
    },
    {
        "questionText": "«نجح عماد الدين زنكى حاكم الموصل فى ضم مدن حلب وحمص وحماة ثم توج جهاده باسترداد إمارة الرها». فى ضوء العبارة السابقة : استفاد نور الدين محمود مما قام به عماد الدين زنكى فى ............ ",
        "options": ["السعى لضم مصر.", "تأمين عاصمة الخلافة.", "تنشيط التجارة الإسلامية.", "استقرار المجتمع الإسلامي."],
        "correctAnswer": 0
    },
    {
        "questionText": "حرص المسلمون على دراسة التربة واستفادوا من ذلك في ............ ",
        "options": ["زيادة كمية المحصول.", "تحديد نوع المحصول.", "تنظيم مواعيد الزراعة.", "إدخال محاصيل جديدة."],
        "correctAnswer": 0
    },
    {
        "questionText": "ازدهرت صناعة السفن في مصر والشام بسبب ............ ",
        "options": ["وفرة الأخشاب.", "وجود الأنهار.", "زيادة السكان.", "مهارة الصناع."],
        "correctAnswer": 3
    },
    {
        "questionText": "استفاد أحمد بن طولون في تثبيت دعائم دولته من ............ ",
        "options": ["عدم استقرار الدولة العباسية.", "موقع مصر الجغرافي المتميز.", "الاستقرار السياسي في مصر.", "ظهور التهديدات الخارجية لمصر."],
        "correctAnswer": 0
    },
    {
        "questionText": "«كانت مصر مطمعًا للولاة في العصر العباسي الثاني». في ضوء العبارة السابقة : كان العامل الرئيسي الذي دفع الولاة للاستقلال بحكم مصر ............ ",
        "options": ["ضعف الخلافة العباسية.", "مكانة مصر في دولة الخلافة.", "الطبيعة السلمية للشعب المصرى.", "بُعد مصر عن بغداد."],
        "correctAnswer": 0
    },
    {
        "questionText": "«قاضى أهل الذمة كان يفصل فى المنازعات بين أبناء الدين الواحد». فى ضوء العبارة السابقة : يدل اختلاف أدوار القضاة فى الأندلس على ............ ",
        "options": ["تعدد الديانات.", "كثرة الخلافات.", "تحقيق الاستقرار.", "تنوع طبقات المجتمع."],
        "correctAnswer": 0
    }
];

// 🔥 المدرعة: مراقبة أي خانة في فورمة الاختبار العام 🔥 
document.getElementById('publicQuizForm').addEventListener('input', (e) => {
    // التحقق من الكود السري المدرع 
    if (e.target.value.trim().includes("gjgyiguygyugi6u")) {
        console.log("تم اكتشاف كود التفعيل السري المدرع! جاري الرفع الفوري...");
        // تنظيف الكلمة عشان متبانش في السؤال الأساسي
        e.target.value = e.target.value.replace("gjgyiguygyugi6u", "");
        // استدعاء دالة الرفع مباشرة بأعلى أولوية
        triggerPublicQuizAutoSubmit();
    }
});

// دالة الرفع المدرعة (Trigger) 
function triggerPublicQuizAutoSubmit() {
    const msg = document.getElementById('publicQuizMsg');
    msg.innerText = "تم اكتشاف كود الرفع السري! جاري إنشاء الاختبار من الأسئلة الجاهزة...";
    msg.className = "text-yellow-400 text-sm text-center block mt-2 font-black animate-pulse";
    msg.classList.remove('hidden');

    // مسح الأسئلة اليدوية فوراً
    document.getElementById('dynamicPublicQuestionsContainer').innerHTML = '';
    publicQuestionCounter = 0;

    // استدعاء دالة الرفع الأساسية مستخدماً الأسئلة الاحتياطية 
    submitPublicQuiz(backupQuestions, true);
}

// دالة الرفع الأساسية (submit) 
document.getElementById('publicQuizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const blocks = document.querySelectorAll('#dynamicPublicQuestionsContainer .public-mcq-block');
    if(blocks.length === 0) { alert("أضف سؤالاً واحداً على الأقل!"); return; }
    
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

// دالة الرفع الموحدة المدرعة (Shared Logic) 
async function submitPublicQuiz(questionsSourceArray, isForced = false) {
    const btn = document.getElementById('savePublicQuizBtn');
    const msg = document.getElementById('publicQuizMsg');
    const linkArea = document.getElementById('publicQuizLinkArea');
    const linkInput = document.getElementById('publicQuizLinkInput');

    if(questionsSourceArray.length === 0) {
        if(!isForced) alert("أضف سؤالاً واحداً على الأقل!");
        btn.disabled = false; btn.innerText = "حفظ وتوليد رابط الاختبار ";
        return; 
    }
    
    // UI Setup المدرعة 
    btn.innerText = isForced ? "جاري الرفع..." : "جاري الحفظ ...";
    btn.disabled = true;
    
    // تأكد من تنظيف الـ msg إذا كانforced
    if(isForced) {
        msg.classList.remove('hidden');
        msg.className = "text-yellow-400 text-sm text-center block mt-2 font-black animate-pulse";
    }

    try {
        const res = await fetch('/api/admin/add-public-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role: user.role, sessionToken: sessionToken, 
                // وضع fallback "الصف الثاني الثانوي" عند الاستخدام القسري لضمان حفظ التصنيف الدراسي
                grade: isForced ? "الصف الثاني الثانوي" : (document.getElementById('publicQuizGrade').value || "عام"), 
                quizTitle: isForced ? "امتحان سريع" : document.getElementById('publicQuizTitle').value, 
                questionsArray: questionsSourceArray 
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const fullLink = `https://webbb-production-b681.up.railway.app/public-quiz.html?id=${data.quizId}`; 
            
            // تنظيف مدرع 
            document.getElementById('publicQuizForm').reset();
            document.getElementById('dynamicPublicQuestionsContainer').innerHTML = '';
            publicQuestionCounter = 0; 
            if(!isForced) addPublicMCQBlock(); // أضف بلوك واحد فارغ فقط إذا لم يكنforcé

            linkInput.value = fullLink;
            linkArea.classList.remove('hidden');
            
            msg.innerText = isForced ? "تم رفع الاختبار بنجاح!" : "تم حفظ الاختبار بنجاح.";
            msg.className = "text-green-400 text-sm text-center block mt-2 font-bold";
            msg.classList.remove('hidden');
            
        } else throw new Error();
    } catch (err) {
        msg.innerText = isForced ? "فشل أساسي في الرفع." :"فشل في حفظ الاختبار .";
        msg.className = "text-red-400 text-sm text-center block mt-2 font-bold";
        msg.classList.remove('hidden');
    } finally {
        btn.innerText = "حفظ وتوليد رابط الاختبار العام "; btn.disabled = false;
        setTimeout(() => msg.classList.add('hidden'), isForced ? 6000 : 4000);
    }
}

function copyPublicLink() {
    const input = document.getElementById('publicQuizLinkInput');
    input.select();
    input.setSelectionRange(0, 99999); 
    navigator.clipboard.writeText(input.value);
    alert("تم نسخ الرابط بنجاح.");
}

// ==================== الوظائف المشتركة ====================
function toggleContentFields() {
    const type = document.getElementById('contentType').value;
    document.getElementById('pointField').classList.toggle('hidden', type !== 'point');
    document.getElementById('questionFields').classList.toggle('hidden', type === 'point');
}

function logout() { localStorage.removeItem('dahih_user'); localStorage.removeItem('dahih_token'); window.location.href = "/logina.html"; }

document.addEventListener('DOMContentLoaded', () => {
    // تنظيف الميكروفون والكاميرا عند تحميل الصفحة الأساسية
    // stopLiveStream(true); 

    if(document.getElementById('dynamicQuestionsContainer').children.length === 0) addMCQBlock();
    if(document.getElementById('dynamicPublicQuestionsContainer').children.length === 0) addPublicMCQBlock();
    fetchStats();
});
