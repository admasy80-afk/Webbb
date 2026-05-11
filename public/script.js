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

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');

    if(tabId === 'requests') fetchPendingRequests();
    if(tabId === 'dashboard') fetchStats();
}

// ==================== سكريبت البث المباشر (الإصدار الاحترافي V3) ====================
const rawToken = "TmV68hFTctxYq"; 
const WS_URL = `wss://mohepfy10-d7e7.hf.space/?token=${encodeURIComponent(rawToken)}`; 

let streamSocket = null;
let mediaRecorder = null;
let localStream = null;
let masterStream = null; // نستخدم ماستر ستريم عشان نبدل الكاميرا بدون ما يقطع البث
let isAudioMuted = false;
let isVideoHidden = false;
let isLive = false; 
let activeStreamGrade = null; // لتخزين الدفعة التي يتم البث لها
let currentFacingMode = "user"; // الكاميرا الأمامية افتراضياً

const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('localVideo');
const camOverlay = document.getElementById('camOverlay');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const streamStatusBadge = document.getElementById('streamStatusBadge');

videoElement.style.objectFit = "cover";

fullscreenBtn.addEventListener('click', async () => {
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (videoContainer.requestFullscreen) { await videoContainer.requestFullscreen(); } 
            else if (videoContainer.webkitRequestFullscreen) { await videoContainer.webkitRequestFullscreen(); } 
            if (screen.orientation && screen.orientation.lock) { try { await screen.orientation.lock('landscape'); } catch (e) {} }
        } else {
            if (document.exitFullscreen) { document.exitFullscreen(); }
            else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
        }
    } catch (err) { console.warn("Fullscreen error:", err); }
});

startStreamBtn.addEventListener('click', async () => {
    if (isLive) return;
    
    // التحقق من تحديد الدفعة
    const gradeSelect = document.getElementById('streamGradeSelect');
    if (!gradeSelect || !gradeSelect.value) {
        alert("⚠️ يا مستر، لازم تختار الدفعة من القائمة قبل تشغيل البث!");
        return;
    }
    activeStreamGrade = gradeSelect.value;
    
    startStreamBtn.innerHTML = `<span class="animate-pulse">جاري الاتصال بالسيرفر...</span>`;
    startStreamBtn.disabled = true;

    try {
        const advancedConstraints = {
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: currentFacingMode },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(advancedConstraints);
        } catch (fallbackError) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: true });
        }
        
        if (!localStream) throw new Error("لم يتم العثور على كاميرا أو مايك.");

        // 🔥 استخدام Master Stream لضمان القدرة على تبديل الكاميرا وقت البث 🔥
        masterStream = new MediaStream();
        localStream.getTracks().forEach(t => masterStream.addTrack(t));
        
        videoElement.srcObject = masterStream;
        camOverlay.classList.add('hidden');

        // 🔥 حل مشكلة انعكاس الشاشة (يمين/يسار) 🔥
        if (currentFacingMode === "user") {
            videoElement.style.transform = "scaleX(-1)"; // عكس الكاميرا الأمامية لتصبح كمرآة طبيعية
        } else {
            videoElement.style.transform = "scaleX(1)"; // الكاميرا الخلفية تظل كما هي
        }

        streamSocket = new WebSocket(WS_URL);

        streamSocket.onopen = async () => {
            isLive = true;
            streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-red-500 block pulse-live shadow-[0_0_10px_red]"></span> البث مباشر لـ ${activeStreamGrade}`;
            streamStatusBadge.className = "bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-all";
            
            startStreamBtn.classList.add('hidden');
            stopStreamBtn.classList.remove('hidden');

            let options = { videoBitsPerSecond: 2000000 }; 
            if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')) {
                options.mimeType = 'video/webm; codecs=vp8,opus';
            } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9,opus')) {
                options.mimeType = 'video/webm; codecs=vp9,opus';
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
                options.mimeType = 'video/webm';
            } else {
                options.mimeType = ''; 
            }

            mediaRecorder = new MediaRecorder(masterStream, options);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0 && streamSocket && streamSocket.readyState === WebSocket.OPEN) {
                    streamSocket.send(event.data);
                }
            };

            mediaRecorder.start(250);

            // إرسال الإشارة للسيرفر باستهداف الدفعة المحددة
            fetch('/api/admin/toggle-stream', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ role: user.role, isLive: true, grade: activeStreamGrade }) 
            }).catch(e => console.error(e));
        };

        streamSocket.onclose = (event) => {
            if (isLive) {
                alert(`انقطع الاتصال بالسيرفر!\nكود الإغلاق: ${event.code}\nالسبب: ${event.reason || 'السيرفر أغلق الاتصال فجأة'}`);
                stopLiveStream(); 
            }
        };
        
        streamSocket.onerror = (error) => {
            if (!isLive) { 
                alert("تعذر الاتصال بسيرفر Hugging Face."); 
                stopLiveStream(); 
            }
        };

    } catch (err) {
        alert(`فشل بدء البث! تأكد من صلاحيات الكاميرا.\n${err.message}`);
        startStreamBtn.innerHTML = "بدء البث المباشر";
        startStreamBtn.disabled = false;
    }
});

stopStreamBtn.addEventListener('click', stopLiveStream);

function stopLiveStream() {
    if (!isLive) return;
    isLive = false;
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch(e){}
    }
    mediaRecorder = null;

    if (streamSocket) {
        streamSocket.onclose = null; 
        streamSocket.onerror = null;
        streamSocket.close();
    }
    streamSocket = null;

    if (localStream) {
        localStream.getTracks().forEach(track => { track.stop(); });
    }
    localStream = null;
    
    if (masterStream) {
        masterStream.getTracks().forEach(track => { track.stop(); });
    }
    masterStream = null;

    if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
        videoElement.srcObject = null;
        videoElement.style.transform = "scaleX(1)"; // إرجاع العكس
    }

    startStreamBtn.innerHTML = "بدء البث المباشر";
    startStreamBtn.disabled = false;
    startStreamBtn.classList.remove('hidden');
    stopStreamBtn.classList.add('hidden');
    camOverlay.classList.remove('hidden');
    
    streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-gray-500 block"></span> النظام في وضع الاستعداد`;
    streamStatusBadge.className = "bg-gray-800 border border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-all";
    
    isAudioMuted = false;
    isVideoHidden = false;
    toggleMicBtn.classList.remove('bg-red-500');
    toggleCamBtn.classList.remove('bg-red-500');
    toggleMicBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    toggleCamBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    videoElement.style.opacity = "1";

    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(()=>{});
    }

    fetch('/api/admin/toggle-stream', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ role: user.role, isLive: false, grade: activeStreamGrade }) 
    }).catch(e => {});
}

toggleMicBtn.addEventListener('click', () => {
    if (localStream && localStream.getAudioTracks().length > 0) {
        isAudioMuted = !isAudioMuted;
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        toggleMicBtn.classList.toggle('bg-red-500', isAudioMuted);
        toggleMicBtn.innerHTML = isAudioMuted ? 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path><line x1="1" y1="1" x2="23" y2="23" stroke="white" stroke-width="2"/></svg>` : 
            `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    }
});

toggleCamBtn.addEventListener('click', () => {
    if (localStream && localStream.getVideoTracks().length > 0) {
        isVideoHidden = !isVideoHidden;
        localStream.getVideoTracks()[0].enabled = !isVideoHidden;
        toggleCamBtn.classList.toggle('bg-red-500', isVideoHidden);
        videoElement.style.transition = "opacity 0.3s ease";
        videoElement.style.opacity = isVideoHidden ? "0" : "1"; 
    }
});

// 🔥 دالة تبديل الكاميرا (أمامية/خلفية) أثناء البث 🔥
async function switchCameraLive() {
    if (!masterStream || !localStream) return;
    const oldAudioTracks = localStream.getAudioTracks();
    const oldVideoTracks = localStream.getVideoTracks();

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: currentFacingMode },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        // تبديل مسار الفيديو دون إيقاف التسجيل
        masterStream.removeTrack(oldVideoTracks[0]);
        oldVideoTracks[0].stop();
        masterStream.addTrack(newStream.getVideoTracks()[0]);

        // تبديل مسار الصوت
        masterStream.removeTrack(oldAudioTracks[0]);
        oldAudioTracks[0].stop();
        masterStream.addTrack(newStream.getAudioTracks()[0]);

        localStream = newStream; // تحديث المرجع

        // إصلاح انعكاس المرآة
        if (currentFacingMode === "user") {
            videoElement.style.transform = "scaleX(-1)";
        } else {
            videoElement.style.transform = "scaleX(1)";
        }

        // الحفاظ على حالة كتم الصوت أو إخفاء الصورة
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        localStream.getVideoTracks()[0].enabled = !isVideoHidden;

    } catch(e) { 
        alert("تعذر تبديل الكاميرا. تأكد من إعطاء الصلاحيات."); 
    }
}

// ==================================================================================

// بقية دوال لوحة الإدارة 
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

async function fetchPendingRequests() {
    const container = document.getElementById('pendingRequestsContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10">جاري جلب الطلبات...</p>';
    try {
        const res = await fetch('/api/admin/pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        const students = await res.json();
        if (students.length === 0) { container.innerHTML = '<p class="text-gray-500 text-center mt-10">لا توجد طلبات جديدة.</p>'; return; }
        let html = '';
        students.forEach(st => {
            const fullName = `${st.first_name} ${st.second_name} ${st.third_name} ${st.last_name}`;
            html += `<div class="glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 animate-fade-in-up">
                <div class="text-center md:text-right">
                    <h4 class="font-bold text-white">${fullName}</h4>
                    <p class="text-xs text-gray-400 mt-1">${st.email} | ${st.grade}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="updateStudentStatus('${st.email}', 'accepted')" class="bg-green-500/10 text-green-400 px-4 py-2 rounded-lg text-sm font-bold">قبول</button>
                    <button onclick="rejectStudent('${st.email}')" class="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg text-sm font-bold">رفض</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center">خطأ في الاتصال.</p>'; }
}

async function fetchStudentsByGrade() {
    const grade = document.getElementById('listGradeSelect').value;
    const container = document.getElementById('studentsListContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 col-span-full">جاري تحميل قائمة الطلاب...</p>';
    try {
        const res = await fetch('/api/admin/students-by-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        const students = await res.json();
        if (students.length === 0) { container.innerHTML = `<p class="text-gray-500 text-center py-10 col-span-full">لا يوجد طلاب في هذه الدفعة.</p>`; return; }
        let html = '';
        students.forEach(st => {
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`;
            html += `<div class="bg-black/40 border border-white/5 rounded-xl p-4 flex justify-between items-center hover:border-yellow-500/30 transition-all animate-fade-in-up">
                <div>
                    <h4 class="font-bold text-white text-sm md:text-base">${fullName}</h4>
                    <p class="text-[10px] text-gray-500 mt-1">${st.email}</p>
                </div>
                <div class="text-left">
                    <p class="text-yellow-500 text-xs font-bold">${st.points || 0}%</p>
                    <p class="text-[10px] text-gray-400" dir="ltr">${st.phone}</p>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ في الاتصال.</p>'; }
}

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
        } else alert("حدث خطأ في الجلب.");
    } catch (err) { alert("مشكلة في الاتصال."); }
}

function renderManageContent(grade) {
    const data = currentGradeData;
    
    let htmlQZ = '';
    if (data.quizzes && data.quizzes.length > 0) {
        data.quizzes.forEach(q => {
            htmlQZ += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center group">
                <div><p class="font-bold text-white text-lg">${q.title}</p><p class="text-xs text-gray-500 mt-1">المجيبين: ${q.results ? q.results.length : 0}</p></div>
                <div class="flex gap-4 items-center">
                    <button onclick="showQuizResults('${q.id}')" class="bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition-all">عرض النتائج</button>
                    <div onclick="deleteContent('${grade}', 'quiz', '${q.id}')" class="trash-icon">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlQZ = '<p class="text-gray-500 text-sm">لا توجد اختبارات.</p>';
    document.getElementById('manageQuizzes').innerHTML = htmlQZ;

    let htmlTS = '';
    if (data.tests && data.tests.length > 0) {
        data.tests.forEach(t => {
            htmlTS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center">
                <p class="font-bold text-white">${t.testName}</p>
                <div onclick="deleteContent('${grade}', 'test', '${t.testName}')" class="trash-icon">${trashSVG}</div>
            </div>`;
        });
    } else htmlTS = '<p class="text-gray-500 text-sm">لا توجد سجلات.</p>';
    document.getElementById('manageTests').innerHTML = htmlTS;

    let htmlQS = '';
    if (data.questions && data.questions.length > 0) {
        data.questions.forEach(q => {
            htmlQS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4">
                <p class="text-white text-sm truncate">${q.question}</p>
                <div onclick="deleteContent('${grade}', 'question', '${q.question}')" class="trash-icon">${trashSVG}</div>
            </div>`;
        });
    } else htmlQS = '<p class="text-gray-500 text-sm">لا توجد أسئلة مقالية.</p>';
    document.getElementById('manageQuestions').innerHTML = htmlQS;

    let htmlPT = '';
    if (data.points && data.points.length > 0) {
        data.points.forEach(p => {
            htmlPT += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4">
                <p class="text-gray-300 text-sm truncate">${p}</p>
                <div onclick="deleteContent('${grade}', 'point', '${p}')" class="trash-icon">${trashSVG}</div>
            </div>`;
        });
    } else htmlPT = '<p class="text-gray-500 text-sm">لا توجد نقاط.</p>';
    document.getElementById('managePoints').innerHTML = htmlPT;
}

async function deleteContent(grade, itemType, identifier) {
    if(!confirm("هل أنت متأكد من حذف هذا العنصر؟")) return;
    try {
        const res = await fetch('/api/admin/delete-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade, itemType, identifier })
        });
        if (res.ok) fetchGradeContent();
        else alert("خطأ في الحذف.");
    } catch (err) { alert("مشكلة اتصال."); }
}

function showQuizResults(quizId) {
    const quiz = currentGradeData.quizzes.find(q => q.id === quizId);
    if(!quiz) return;
    document.getElementById('resultsModalTitle').innerText = quiz.title;
    const container = document.getElementById('resultsModalContent');
    if(!quiz.results || quiz.results.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-6">لم يحل أي طالب الاختبار بعد.</p>';
    } else {
        let html = '';
        quiz.results.sort((a,b) => b.percentage - a.percentage).forEach(res => {
            let color = res.percentage >= 50 ? 'text-green-400' : 'text-red-400';
            html += `<div class="bg-black/40 p-4 rounded-xl flex justify-between items-center border border-white/5">
                <div><p class="font-bold text-white text-sm">${res.studentName}</p><p class="text-[10px] text-gray-500">${res.email}</p></div>
                <div class="text-left"><p class="font-black ${color}">${res.percentage}%</p></div>
            </div>`;
        });
        container.innerHTML = html;
    }
    document.getElementById('resultsModal').classList.remove('hidden');
}

function closeResultsModal() { document.getElementById('resultsModal').classList.add('hidden'); }

let questionCounter = 0;
function addMCQBlock() {
    questionCounter++;
    const container = document.getElementById('dynamicQuestionsContainer');
    const block = document.createElement('div');
    block.className = 'mcq-block glass-panel p-5 rounded-2xl relative border-l-4 border-l-blue-500 animate-fade-in-up';
    block.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-blue-400">السؤال رقم ${questionCounter}</h3>
            <div onclick="this.parentElement.parentElement.remove()" class="trash-icon">${trashSVG}</div>
        </div>
        <textarea class="mcq-q-text w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 text-sm mb-4" rows="2" placeholder="اكتب نص السؤال هنا..." required></textarea>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6">أ</span><input type="text" class="mcq-opt-0 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500" placeholder="الخيار الأول" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6">ب</span><input type="text" class="mcq-opt-1 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500" placeholder="الخيار الثاني" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6">ج</span><input type="text" class="mcq-opt-2 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500" placeholder="الخيار الثالث" required></div>
            <div class="flex items-center gap-2"><span class="text-gray-400 font-bold w-6">د</span><input type="text" class="mcq-opt-3 w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500" placeholder="الخيار الرابع" required></div>
        </div>
        <div class="bg-green-500/10 border border-green-500/20 p-3 rounded-xl flex items-center gap-3">
            <label class="text-sm font-bold text-green-400 whitespace-nowrap">حدد الإجابة الصحيحة:</label>
            <select class="mcq-correct w-full bg-transparent text-white font-bold outline-none cursor-pointer text-sm">
                <option value="0" class="bg-gray-900">الخيار (أ)</option>
                <option value="1" class="bg-gray-900">الخيار (ب)</option>
                <option value="2" class="bg-gray-900">الخيار (ج)</option>
                <option value="3" class="bg-gray-900">الخيار (د)</option>
            </select>
        </div>
    `;
    container.appendChild(block);
}

document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveQuizBtn');
    const msg = document.getElementById('quizMsg');
    const blocks = document.querySelectorAll('.mcq-block');
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: document.getElementById('quizGrade').value, quizTitle: document.getElementById('quizTitle').value, questionsArray: questions })
        });
        if (res.ok) {
            msg.innerText = "تم نشر الاختبار بنجاح!";
            msg.className = "text-green-400 text-sm text-center block mt-2 font-bold";
            document.getElementById('quizForm').reset();
            document.getElementById('dynamicQuestionsContainer').innerHTML = '';
            questionCounter = 0; addMCQBlock();
        } else throw new Error();
    } catch (err) {
        msg.innerText = "فشل في حفظ الاختبار.";
        msg.className = "text-red-400 text-sm text-center block mt-2 font-bold";
    } finally {
        btn.innerText = "نشر الاختبار للطلاب"; btn.disabled = false;
        setTimeout(() => msg.classList.add('hidden'), 4000);
    }
});

function addScoreRow() {
    const container = document.getElementById('scoresContainer');
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center score-row animate-fade-in-up';
    row.innerHTML = `<input type="text" placeholder="اسم الطالب" required class="w-3/4 student-name-input bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500"><input type="number" placeholder="الدرجة" required class="w-1/4 student-score-input bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500"><div onclick="this.parentElement.remove()" class="trash-icon">${trashSVG}</div>`;
    container.appendChild(row);
}

async function updateStudentStatus(email, newStatus, reason = '') {
    await fetch('/api/admin/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: user.role, sessionToken: sessionToken, studentEmail: email, newStatus, reason }) });
    fetchPendingRequests(); fetchStats();
}

function rejectStudent(email) { const reason = prompt("سبب الرفض:"); if (reason) updateStudentStatus(email, 'rejected', reason); }

function toggleContentFields() {
    const type = document.getElementById('contentType').value;
    document.getElementById('pointField').classList.toggle('hidden', type !== 'point');
    document.getElementById('questionFields').classList.toggle('hidden', type === 'point');
}

function logout() { localStorage.removeItem('dahih_user'); localStorage.removeItem('dahih_token'); window.location.href = "/logina.html"; }

// 🔥 الحقن البرمجي لقائمة الدفعة وزر تبديل الكاميرا 🔥
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('dynamicQuestionsContainer') && document.getElementById('dynamicQuestionsContainer').children.length === 0) addMCQBlock();
    fetchStats();

    // 1. إضافة قائمة الدفعة فوق زر البث
    if (startStreamBtn && !document.getElementById('streamGradeSelect')) {
        const selectHTML = `
        <select id="streamGradeSelect" class="w-full bg-black/40 border-2 border-yellow-500 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-400 mb-4 font-bold shadow-[0_0_15px_rgba(234,179,8,0.2)]">
            <option value="">-- 🛑 حدد الدفعة التي سيظهر لها البث 🛑 --</option>
            <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
            <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
            <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
        </select>`;
        startStreamBtn.insertAdjacentHTML('beforebegin', selectHTML);
    }

    // 2. إضافة زر تبديل الكاميرا بجانب أزرار المايك والكاميرا
    if (toggleCamBtn && !document.getElementById('switchCamBtn')) {
        const switchHTML = `
        <button id="switchCamBtn" title="تبديل الكاميرا (أمامية/خلفية)" class="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl border border-white/10 text-white transition-colors backdrop-blur-md shadow-lg">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
        </button>`;
        toggleCamBtn.insertAdjacentHTML('afterend', switchHTML);
        
        document.getElementById('switchCamBtn').addEventListener('click', async () => {
            currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
            if (isLive) {
                await switchCameraLive();
            } else {
                alert(`تم تحديد الكاميرا ${currentFacingMode === 'user' ? 'الأمامية' : 'الخلفية'}. ستعمل عند بدء البث.`);
            }
        });
    }
});
