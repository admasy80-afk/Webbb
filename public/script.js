// ============================================================================
// [1] الإعدادات العامة والثوابت
// ============================================================================
const YOUTUBE_CHANNEL_ID = "UCivsbqKFeRs2Fzu8S6idOVw"; // معرف قناتك الافتراضي
const YOUTUBE_USER_ID = "ivsbqKFeRs2Fzu8S6idOVw";

const trashSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

const userDataStr = localStorage.getItem('dahih_user');
let user = null;
let sessionToken = null;

if (!userDataStr) window.location.href = "/logina.html";
else {
    user = JSON.parse(userDataStr);
    sessionToken = user.token || localStorage.getItem('dahih_token') || ""; 
    if (user.role !== 'dev' && user.role !== 'owner') window.location.href = "/dashboard.html";
    else {
        const adminNameEl = document.getElementById('adminWelcomeName');
        if (adminNameEl) adminNameEl.innerText = user.name || "إدارة";
    }
}

let currentGradeData = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabId}`);
    const targetBtn = document.getElementById(`btn-${tabId}`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    if(tabId === 'requests') fetchPendingRequests();
    if(tabId === 'dashboard') fetchStats();
}

// ============================================================================
// [2] نظام البث المباشر الاحترافي (Titan Hybrid V7)
// ============================================================================
const rawToken = "TmV68hFTctxYq"; 
const WS_URL = `wss://mohepfy10-d7e7.hf.space/?token=${encodeURIComponent(rawToken)}`; 

let streamSocket = null;
let mediaRecorder = null;
let localStream = null;
let masterStream = null; 
let isAudioMuted = false;
let isVideoHidden = false;
let isLive = false; 
let activeStreamGrade = null; 
let currentFacingMode = "user"; 

const videoContainer = document.getElementById('videoContainer');
const videoElement = document.getElementById('localVideo');
const camOverlay = document.getElementById('camOverlay');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const streamStatusBadge = document.getElementById('streamStatusBadge');

if (videoElement) videoElement.style.objectFit = "cover";

function extractYoutubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

if (fullscreenBtn && videoContainer) {
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
}

if (startStreamBtn) {
    startStreamBtn.addEventListener('click', async () => {
        if (isLive) return;
        
        const gradeSelect = document.getElementById('streamGradeSelect');
        const youtubeInput = document.getElementById('youtubeLinkInput');

        if (!gradeSelect || !gradeSelect.value) {
            alert("⚠️ يا مستر لازم تختار الدفعة قبل تشغيل البث");
            return;
        }

        // تحديد مصدر البث: إما رابط مباشر، أو استخدام القناة الافتراضية
        let youtubeId = extractYoutubeId(youtubeInput ? youtubeInput.value : "");
        let streamSource = youtubeId ? youtubeId : `channel:${YOUTUBE_CHANNEL_ID}`;

        activeStreamGrade = gradeSelect.value;
        startStreamBtn.innerHTML = `<span class="animate-pulse">🚀 جاري ربط استوديو البث...</span>`;
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

            masterStream = new MediaStream();
            localStream.getTracks().forEach(t => masterStream.addTrack(t));
            
            if (videoElement) {
                videoElement.srcObject = masterStream;
                if (currentFacingMode === "user") videoElement.style.transform = "scaleX(-1)"; 
                else videoElement.style.transform = "scaleX(1)"; 
            }
            if (camOverlay) camOverlay.classList.add('hidden');

            streamSocket = new WebSocket(WS_URL);

            streamSocket.onopen = async () => {
                isLive = true;
                if (streamStatusBadge) {
                    streamStatusBadge.innerHTML = `<span class="w-3 h-3 rounded-full bg-red-500 block animate-pulse shadow-[0_0_15px_red]"></span> مباشر الآن - ${activeStreamGrade}`;
                    streamStatusBadge.className = "bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-3 backdrop-blur-md transition-all";
                }
                
                startStreamBtn.classList.add('hidden');
                if (stopStreamBtn) stopStreamBtn.classList.remove('hidden');

                let options = { videoBitsPerSecond: 2500000 }; 
                if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')) { options.mimeType = 'video/webm; codecs=vp8,opus'; }
                else if (MediaRecorder.isTypeSupported('video/webm')) { options.mimeType = 'video/webm'; }

                mediaRecorder = new MediaRecorder(masterStream, options);
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0 && streamSocket && streamSocket.readyState === WebSocket.OPEN) {
                        streamSocket.send(event.data);
                    }
                };

                mediaRecorder.start(250);

                // إرسال البيانات للسيرفر (يدعم ID اليوتيوب أو معرف القناة)
                fetch('/api/admin/toggle-stream', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ 
                        role: user.role, 
                        isLive: true, 
                        grade: activeStreamGrade,
                        youtubeId: streamSource
                    }) 
                }).catch(e => console.error(e));
            };

            streamSocket.onclose = () => {
                if (isLive) {
                    alert(`انقطع الاتصال بسيرفر البث! يرجى إعادة التشغيل.`);
                    stopLiveStream(); 
                }
            };
            
        } catch (err) {
            alert(`فشل بدء البث! ${err.message}`);
            startStreamBtn.innerHTML = "بدء البث المباشر";
            startStreamBtn.disabled = false;
        }
    });
}

if (stopStreamBtn) stopStreamBtn.addEventListener('click', stopLiveStream);

function stopLiveStream() {
    if (!isLive) return;
    isLive = false;
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch(e){} }
    mediaRecorder = null;

    if (streamSocket) { streamSocket.onclose = null; streamSocket.close(); }
    streamSocket = null;

    if (localStream) { localStream.getTracks().forEach(track => { track.stop(); }); }
    localStream = null;
    
    if (masterStream) { masterStream.getTracks().forEach(track => { track.stop(); }); }
    masterStream = null;

    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement.style.transform = "scaleX(1)"; 
    }

    if (startStreamBtn) {
        startStreamBtn.innerHTML = "بدء البث المباشر";
        startStreamBtn.disabled = false;
        startStreamBtn.classList.remove('hidden');
    }
    if (stopStreamBtn) stopStreamBtn.classList.add('hidden');
    if (camOverlay) camOverlay.classList.remove('hidden');
    
    if (streamStatusBadge) {
        streamStatusBadge.innerHTML = `<span class="w-3 h-3 rounded-full bg-gray-500 block"></span> وضع الاستعداد`;
        streamStatusBadge.className = "bg-gray-800/80 border border-gray-700 text-gray-300 px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 backdrop-blur-md transition-all";
    }
    
    fetch('/api/admin/toggle-stream', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ role: user.role, isLive: false, grade: activeStreamGrade }) 
    }).catch(e => {});
}

if (toggleMicBtn) {
    toggleMicBtn.addEventListener('click', () => {
        if (localStream && localStream.getAudioTracks().length > 0) {
            isAudioMuted = !isAudioMuted;
            localStream.getAudioTracks()[0].enabled = !isAudioMuted;
            toggleMicBtn.classList.toggle('bg-red-500', isAudioMuted);
            toggleMicBtn.classList.toggle('hover:bg-red-600', isAudioMuted);
            toggleMicBtn.innerHTML = isAudioMuted ? 
                `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path><line x1="1" y1="1" x2="23" y2="23" stroke="white" stroke-width="2"/></svg>` : 
                `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
        }
    });
}

if (toggleCamBtn) {
    toggleCamBtn.addEventListener('click', () => {
        if (localStream && localStream.getVideoTracks().length > 0) {
            isVideoHidden = !isVideoHidden;
            localStream.getVideoTracks()[0].enabled = !isVideoHidden;
            toggleCamBtn.classList.toggle('bg-red-500', isVideoHidden);
            toggleCamBtn.classList.toggle('hover:bg-red-600', isVideoHidden);
            if(videoElement) videoElement.style.opacity = isVideoHidden ? "0" : "1"; 
        }
    });
}

async function switchCameraLive() {
    if (!masterStream || !localStream) return;
    const oldVideoTracks = localStream.getVideoTracks();
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: currentFacingMode },
            audio: true
        });
        masterStream.removeTrack(oldVideoTracks[0]);
        oldVideoTracks[0].stop();
        masterStream.addTrack(newStream.getVideoTracks()[0]);
        localStream = newStream; 
        if (videoElement) videoElement.style.transform = currentFacingMode === "user" ? "scaleX(-1)" : "scaleX(1)";
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        localStream.getVideoTracks()[0].enabled = !isVideoHidden;
    } catch(e) { alert("تعذر تبديل الكاميرا. تأكد من إعطاء الصلاحيات."); }
}

// ============================================================================
// [3] دوال لوحة الإدارة (إحصائيات، طلاب، محتوى)
// ============================================================================
async function fetchStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        const data = await res.json();
        const el1 = document.getElementById('stats-students');
        const el2 = document.getElementById('stats-pending');
        if (el1) el1.innerText = data.studentsCount || 0;
        if (el2) el2.innerText = data.pendingCount || 0;
    } catch (err) {}
}

async function fetchPendingRequests() {
    const container = document.getElementById('pendingRequestsContainer');
    if(!container) return;
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
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`.trim();
            html += `
            <div class="glass-panel border border-white/5 p-5 rounded-xl flex flex-col justify-between gap-4 animate-fade-in-up hover:border-yellow-500/30 transition-all">
                <div class="border-b border-white/10 pb-4">
                    <h4 class="font-bold text-white text-lg mb-3">الاسم: <span class="text-yellow-500">${fullName}</span></h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
                        <p><span class="font-bold text-gray-500">الدفعة:</span> ${st.grade || 'غير مسجل'}</p>
                        <p><span class="font-bold text-gray-500">رقم الطالب:</span> <span dir="ltr" class="text-white">${st.phone || 'غير مسجل'}</span></p>
                        ${st.parent_phone ? `<p><span class="font-bold text-gray-500">ولي الأمر:</span> <span dir="ltr" class="text-white">${st.parent_phone}</span></p>` : ''}
                        <p><span class="font-bold text-gray-500">الإيميل:</span> <span class="text-white">${st.email || 'غير مسجل'}</span></p>
                    </div>
                </div>
                <div class="flex gap-3 justify-end pt-2">
                    <button onclick="updateStudentStatus('${st.email}', 'accepted')" class="flex-1 md:flex-none bg-green-600 hover:bg-green-500 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-colors">قبول الطالب</button>
                    <button onclick="rejectStudent('${st.email}')" class="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors border border-red-500/30">رفض</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center">خطأ في الاتصال.</p>'; }
}

async function fetchStudentsByGrade() {
    const gradeSelect = document.getElementById('listGradeSelect');
    const container = document.getElementById('studentsListContainer');
    if(!gradeSelect || !container) return;
    const grade = gradeSelect.value;
    container.innerHTML = '<p class="text-gray-500 text-center py-10 col-span-full">جاري تحميل القائمة...</p>';
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
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`.trim();
            html += `
            <div class="bg-black/40 border border-white/5 rounded-xl p-5 hover:border-yellow-500/50 transition-all animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
                    <div class="flex-1">
                        <h4 class="font-bold text-white text-base md:text-lg mb-3">الاسم: <span class="text-yellow-500">${fullName}</span></h4>
                        <div class="flex flex-wrap gap-x-6 gap-y-3 text-sm text-gray-400 border-t border-white/5 pt-3">
                            <p><span class="font-bold text-gray-500">رقم الطالب:</span> <span dir="ltr" class="text-white">${st.phone || 'غير مسجل'}</span></p>
                            ${st.parent_phone ? `<p><span class="font-bold text-gray-500">ولي الأمر:</span> <span dir="ltr" class="text-white">${st.parent_phone}</span></p>` : ''}
                            <p><span class="font-bold text-gray-500">الإيميل:</span> <span class="text-white">${st.email}</span></p>
                        </div>
                    </div>
                    <div class="bg-white/5 border border-white/10 px-5 py-3 rounded-xl text-center min-w-[120px] shadow-inner mt-4 md:mt-0 w-full md:w-auto">
                        <p class="text-gray-400 text-xs mb-1 font-bold">التقييم المستمر</p>
                        <p class="text-yellow-500 text-2xl font-black" dir="ltr">${st.points || 0}%</p>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ اتصال.</p>'; }
}

async function fetchGradeContent() {
    const gradeSelect = document.getElementById('manageGradeSelect');
    const container = document.getElementById('manageContainer');
    const loading = document.getElementById('manageLoading');
    if(!gradeSelect || !container || !loading) return;
    const grade = gradeSelect.value;
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
    } catch (err) { alert("مشكلة اتصال."); }
}

function renderManageContent(grade) {
    const data = currentGradeData;
    
    let htmlQZ = '';
    if (data.quizzes && data.quizzes.length > 0) {
        data.quizzes.forEach(q => {
            htmlQZ += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center group">
                <div><p class="font-bold text-white text-lg">${q.title}</p><p class="text-xs text-gray-500 mt-1">المجيبين: ${q.results ? q.results.length : 0}</p></div>
                <div class="flex gap-4 items-center">
                    <button onclick="showQuizResults('${q.id}')" class="bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition-all">النتائج</button>
                    <div onclick="deleteContent('${grade}', 'quiz', '${q.id}')" class="trash-icon cursor-pointer hover:text-red-500 text-gray-400">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlQZ = '<p class="text-gray-500 text-sm">لا توجد اختبارات.</p>';
    const qzContainer = document.getElementById('manageQuizzes');
    if(qzContainer) qzContainer.innerHTML = htmlQZ;

    let htmlTS = '';
    if (data.tests && data.tests.length > 0) {
        data.tests.forEach(t => {
            htmlTS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center">
                <p class="font-bold text-white">${t.testName}</p>
                <div onclick="deleteContent('${grade}', 'test', '${t.testName}')" class="trash-icon cursor-pointer hover:text-red-500 text-gray-400">${trashSVG}</div>
            </div>`;
        });
    } else htmlTS = '<p class="text-gray-500 text-sm">لا توجد سجلات.</p>';
    const tsContainer = document.getElementById('manageTests');
    if(tsContainer) tsContainer.innerHTML = htmlTS;

    let htmlQS = '';
    if (data.questions && data.questions.length > 0) {
        data.questions.forEach(q => {
            htmlQS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4">
                <p class="text-white text-sm truncate">${q.question}</p>
                <div onclick="deleteContent('${grade}', 'question', '${q.question}')" class="trash-icon cursor-pointer hover:text-red-500 text-gray-400">${trashSVG}</div>
            </div>`;
        });
    } else htmlQS = '<p class="text-gray-500 text-sm">لا توجد أسئلة مقالية.</p>';
    const qsContainer = document.getElementById('manageQuestions');
    if(qsContainer) qsContainer.innerHTML = htmlQS;

    let htmlPT = '';
    if (data.points && data.points.length > 0) {
        data.points.forEach(p => {
            htmlPT += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4">
                <p class="text-gray-300 text-sm truncate">${p}</p>
                <div onclick="deleteContent('${grade}', 'point', '${p}')" class="trash-icon cursor-pointer hover:text-red-500 text-gray-400">${trashSVG}</div>
            </div>`;
        });
    } else htmlPT = '<p class="text-gray-500 text-sm">لا توجد نقاط.</p>';
    const ptContainer = document.getElementById('managePoints');
    if(ptContainer) ptContainer.innerHTML = htmlPT;
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

function closeResultsModal() { 
    const modal = document.getElementById('resultsModal');
    if(modal) modal.classList.add('hidden'); 
}

let questionCounter = 0;
function addMCQBlock() {
    questionCounter++;
    const container = document.getElementById('dynamicQuestionsContainer');
    if(!container) return;
    const block = document.createElement('div');
    block.className = 'mcq-block glass-panel p-5 rounded-2xl relative border-l-4 border-l-blue-500 animate-fade-in-up';
    block.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-blue-400">السؤال رقم ${questionCounter}</h3>
            <div onclick="this.parentElement.parentElement.remove()" class="trash-icon cursor-pointer hover:text-red-500 text-gray-400">${trashSVG}</div>
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

const quizForm = document.getElementById('quizForm');
if (quizForm) {
    quizForm.addEventListener('submit', async (e) => {
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
}

function addScoreRow() {
    const container = document.getElementById('scoresContainer');
    if(!container) return;
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center score-row animate-fade-in-up';
    row.innerHTML = `<input type="text" placeholder="اسم الطالب" required class="w-3/4 student-name-input bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500"><input type="number" placeholder="الدرجة" required class="w-1/4 student-score-input bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-yellow-500"><div onclick="this.parentElement.remove()" class="trash-icon cursor-pointer hover:text-red-500 text-gray-400">${trashSVG}</div>`;
    container.appendChild(row);
}

async function updateStudentStatus(email, newStatus, reason = '') {
    await fetch('/api/admin/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: user.role, sessionToken: sessionToken, studentEmail: email, newStatus, reason }) });
    fetchPendingRequests(); fetchStats();
}

function rejectStudent(email) { const reason = prompt("سبب الرفض:"); if (reason) updateStudentStatus(email, 'rejected', reason); }

function toggleContentFields() {
    const type = document.getElementById('contentType')?.value;
    const pField = document.getElementById('pointField');
    const qField = document.getElementById('questionFields');
    if(pField) pField.classList.toggle('hidden', type !== 'point');
    if(qField) qField.classList.toggle('hidden', type === 'point');
}

function logout() { localStorage.removeItem('dahih_user'); localStorage.removeItem('dahih_token'); window.location.href = "/logina.html"; }

// ============================================================================
// [4] الحقن البرمجي لتحسين واجهة المستخدم (Modern UI Injection)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const dynContainer = document.getElementById('dynamicQuestionsContainer');
    if(dynContainer && dynContainer.children.length === 0) addMCQBlock();
    fetchStats();

    // بناء الواجهة الاحترافية لإعدادات البث 
    if (startStreamBtn && !document.getElementById('streamStudioCard')) {
        const professionalUI = `
        <div id="streamStudioCard" class="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-3xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)] mb-8 relative overflow-hidden animate-fade-in-up">
            
            <!-- خلفية إضاءة خفيفة -->
            <div class="absolute -top-10 -right-10 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl"></div>
            <div class="absolute -bottom-10 -left-10 w-40 h-40 bg-red-500/10 rounded-full blur-3xl"></div>

            <div class="relative z-10">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-white/5 pb-4 gap-4">
                    <h3 class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-yellow-500 flex items-center gap-3">
                        <svg class="w-6 h-6 text-red-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                        استوديو البث المباشر المتقدم
                    </h3>
                    <div class="bg-gray-800/80 border border-gray-700 px-4 py-1.5 rounded-full text-xs text-gray-400 flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-green-500 block"></span>
                        مرتبط بالقناة: <span class="font-mono text-gray-300">...${YOUTUBE_CHANNEL_ID.slice(-6)}</span>
                    </div>
                </div>
                
                <div class="space-y-5">
                    <!-- حقل إدخال اليوتيوب بتصميم نيون -->
                    <div class="relative group">
                        <label class="block text-sm font-bold text-gray-400 mb-2">رابط يوتيوب <span class="text-xs text-gray-500 font-normal">(اختياري - اترك فارغاً لاستخدام البث الافتراضي للقناة)</span></label>
                        <div class="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-yellow-600 rounded-xl blur opacity-20 group-focus-within:opacity-50 transition duration-500"></div>
                        <div class="relative flex items-center bg-black/80 border border-gray-700 rounded-xl overflow-hidden">
                            <span class="pl-4 pr-3 text-gray-500"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg></span>
                            <input type="text" id="youtubeLinkInput" placeholder="الصق رابط يوتيوب هنا..." 
                                class="w-full bg-transparent px-2 py-3.5 text-white outline-none font-bold placeholder:text-gray-600 text-sm">
                        </div>
                    </div>
                    
                    <!-- قائمة الدفعات -->
                    <div>
                        <label class="block text-sm font-bold text-gray-400 mb-2">تحديد الدفعة المستهدفة <span class="text-red-500">*</span></label>
                        <div class="relative">
                            <select id="streamGradeSelect" class="w-full bg-gray-900 border-2 border-yellow-500/50 rounded-xl px-4 py-3.5 text-white outline-none focus:border-yellow-400 focus:shadow-[0_0_15px_rgba(234,179,8,0.2)] transition-all font-bold appearance-none cursor-pointer">
                                <option value="" class="text-gray-500">▼ اختر الدفعة لبدء البث</option>
                                <optgroup label="المرحلة الابتدائية" class="bg-gray-800 text-yellow-500 font-black">
                                    <option value="الصف الأول الابتدائي" class="text-white font-normal">الأول الابتدائي</option>
                                    <option value="الصف الثاني الابتدائي" class="text-white font-normal">الثاني الابتدائي</option>
                                    <option value="الصف الثالث الابتدائي" class="text-white font-normal">الثالث الابتدائي</option>
                                    <option value="الصف الرابع الابتدائي" class="text-white font-normal">الرابع الابتدائي</option>
                                    <option value="الصف الخامس الابتدائي" class="text-white font-normal">الخامس الابتدائي</option>
                                    <option value="الصف السادس الابتدائي" class="text-white font-normal">السادس الابتدائي</option>
                                </optgroup>
                                <optgroup label="المرحلة الإعدادية" class="bg-gray-800 text-blue-400 font-black">
                                    <option value="الصف الأول الإعدادي" class="text-white font-normal">الأول الإعدادي</option>
                                    <option value="الصف الثاني الإعدادي" class="text-white font-normal">الثاني الإعدادي</option>
                                    <option value="الصف الثالث الإعدادي" class="text-white font-normal">الثالث الإعدادي</option>
                                </optgroup>
                                <optgroup label="المرحلة الثانوية" class="bg-gray-800 text-green-400 font-black">
                                    <option value="الصف الأول الثانوي" class="text-white font-normal">الأول الثانوي</option>
                                    <option value="الصف الثاني الثانوي" class="text-white font-normal">الثاني الثانوي</option>
                                    <option value="الصف الثالث الثانوي" class="text-white font-normal">الثالث الثانوي</option>
                                </optgroup>
                            </select>
                            <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        
        startStreamBtn.insertAdjacentHTML('beforebegin', professionalUI);
        
        // تحسين مظهر زر البدء نفسه (إن أمكن)
        startStreamBtn.className = "w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex justify-center items-center gap-3";
    }

    // زر تبديل الكاميرا المضاف بجوار أزرار المايك والكاميرا
    if (toggleCamBtn && !document.getElementById('switchCamBtn')) {
        const switchHTML = `
        <button id="switchCamBtn" title="تبديل الكاميرا" class="bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/10 text-white transition-all backdrop-blur-md shadow-lg flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>`;
        toggleCamBtn.insertAdjacentHTML('afterend', switchHTML);
        document.getElementById('switchCamBtn').addEventListener('click', async () => {
            currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
            if (isLive) {
                const btn = document.getElementById('switchCamBtn');
                btn.classList.add('animate-pulse');
                await switchCameraLive();
                btn.classList.remove('animate-pulse');
            } else {
                alert(`✅ تم ضبط الكاميرا لتكون: ${currentFacingMode === 'user' ? 'الأمامية' : 'الخلفية'}. ستعمل عند بدء البث.`);
            }
        });
    }
});
