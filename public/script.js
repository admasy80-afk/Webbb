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

// ==================== سكريبت البث المباشر (الإصدار الاحترافي V7 - Titan Hybrid) ====================
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

// دالة استخراج ID اليوتيوب تلقائياً من الرابط
function extractYoutubeId(url) {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

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
    
    const gradeSelect = document.getElementById('streamGradeSelect');
    const youtubeInput = document.getElementById('youtubeLinkInput');

    if (!gradeSelect || !gradeSelect.value) {
        alert("يا مستر لازم تختار الدفعة قبل تشغيل البث");
        return;
    }

    // استخراج ID اليوتيوب
    const youtubeId = extractYoutubeId(youtubeInput.value);
    if (!youtubeId) {
        alert("⚠️ عذراً يا مستر، رابط اليوتيوب غير صحيح. تأكد من نسخ رابط البث من يوتيوب ووضعه في الخانة.");
        return;
    }

    activeStreamGrade = gradeSelect.value;
    startStreamBtn.innerHTML = `<span class="animate-pulse">جاري ربط المحرك باليوتيوب...</span>`;
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
        
        videoElement.srcObject = masterStream;
        camOverlay.classList.add('hidden');

        if (currentFacingMode === "user") { videoElement.style.transform = "scaleX(-1)"; } 
        else { videoElement.style.transform = "scaleX(1)"; }

        streamSocket = new WebSocket(WS_URL);

        streamSocket.onopen = async () => {
            isLive = true;
            streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-red-500 block pulse-live shadow-[0_0_10px_red]"></span> البث مباشر لـ ${activeStreamGrade}`;
            streamStatusBadge.className = "bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-all";
            
            startStreamBtn.classList.add('hidden');
            stopStreamBtn.classList.remove('hidden');

            let options = { videoBitsPerSecond: 2500000 }; // جودة محسنة لليوتيوب
            if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')) { options.mimeType = 'video/webm; codecs=vp8,opus'; }
            else if (MediaRecorder.isTypeSupported('video/webm')) { options.mimeType = 'video/webm'; }

            mediaRecorder = new MediaRecorder(masterStream, options);
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0 && streamSocket && streamSocket.readyState === WebSocket.OPEN) {
                    streamSocket.send(event.data);
                }
            };

            mediaRecorder.start(250);

            // إرسال الـ youtubeId للسيرفر ليعرف الطلاب ماذا يشاهدون
            fetch('/api/admin/toggle-stream', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ 
                    role: user.role, 
                    isLive: true, 
                    grade: activeStreamGrade,
                    youtubeId: youtubeId // 👈 هنا الربط السحري
                }) 
            }).catch(e => console.error(e));
        };

        streamSocket.onclose = (event) => {
            if (isLive) {
                alert(`انقطع الاتصال بالسيرفر! يرجى إعادة التشغيل.`);
                stopLiveStream(); 
            }
        };
        
    } catch (err) {
        alert(`فشل بدء البث! ${err.message}`);
        startStreamBtn.innerHTML = "بدء البث المباشر";
        startStreamBtn.disabled = false;
    }
});

stopStreamBtn.addEventListener('click', stopLiveStream);

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

    startStreamBtn.innerHTML = "بدء البث المباشر";
    startStreamBtn.disabled = false;
    startStreamBtn.classList.remove('hidden');
    stopStreamBtn.classList.add('hidden');
    camOverlay.classList.remove('hidden');
    
    streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-gray-500 block"></span> النظام في وضع الاستعداد`;
    streamStatusBadge.className = "bg-gray-800 border border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-all";
    
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
        videoElement.style.opacity = isVideoHidden ? "0" : "1"; 
    }
});

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
        videoElement.style.transform = currentFacingMode === "user" ? "scaleX(-1)" : "scaleX(1)";
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        localStream.getVideoTracks()[0].enabled = !isVideoHidden;
    } catch(e) { alert("تعذر تبديل الكاميرا."); }
}

// ==================== بقية دوال لوحة الإدارة (Stats, Requests, Content) ====================

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
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`.trim();
            html += `
            <div class="glass-panel border border-white/5 p-5 rounded-xl flex flex-col justify-between gap-4 animate-fade-in-up hover:border-yellow-500/30 transition-all">
                <div class="border-b border-white/10 pb-4">
                    <h4 class="font-bold text-white text-lg mb-3">الاسم: <span class="text-yellow-500">${fullName}</span></h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
                        <p><span class="font-bold text-gray-500">الدفعة:</span> ${st.grade || 'غير مسجل'}</p>
                        <p><span class="font-bold text-gray-500">رقم الطالب:</span> <span dir="ltr" class="text-white">${st.phone || 'غير مسجل'}</span></p>
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
    const grade = document.getElementById('listGradeSelect').value;
    const container = document.getElementById('studentsListContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 col-span-full">جاري تحميل القائمة...</p>';
    try {
        const res = await fetch('/api/admin/students-by-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        const students = await res.json();
        if (students.length === 0) { container.innerHTML = `<p class="text-gray-500 text-center py-10 col-span-full">لا يوجد طلاب.</p>`; return; }
        let html = '';
        students.forEach(st => {
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`.trim();
            html += `
            <div class="bg-black/40 border border-white/5 rounded-xl p-5 hover:border-yellow-500/50 transition-all animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
                    <div class="flex-1">
                        <h4 class="font-bold text-white text-base md:text-lg mb-3">الاسم: <span class="text-yellow-500">${fullName}</span></h4>
                        <div class="flex flex-wrap gap-x-6 gap-y-3 text-sm text-gray-400 border-t border-white/5 pt-3">
                            <p><span class="font-bold text-gray-500">رقم الطالب:</span> <span dir="ltr" class="text-white">${st.phone}</span></p>
                            <p><span class="font-bold text-gray-500">الإيميل:</span> <span class="text-white">${st.email}</span></p>
                        </div>
                    </div>
                    <div class="bg-white/5 border border-white/10 px-5 py-3 rounded-xl text-center min-w-[120px] shadow-inner mt-4 md:mt-0 w-full md:w-auto">
                        <p class="text-gray-400 text-xs mb-1 font-bold">التقييم</p>
                        <p class="text-yellow-500 text-2xl font-black" dir="ltr">${st.points || 0}%</p>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ اتصال.</p>'; }
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
        } else alert("خطأ في الجلب.");
    } catch (err) { alert("مشكلة اتصال."); }
}

function renderManageContent(grade) {
    const data = currentGradeData;
    let htmlQZ = '';
    if (data.quizzes && data.quizzes.length > 0) {
        data.quizzes.forEach(q => {
            htmlQZ += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center group">
                <div><p class="font-bold text-white text-lg">${q.title}</p></div>
                <div class="flex gap-4 items-center">
                    <button onclick="showQuizResults('${q.id}')" class="bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition-all">النتائج</button>
                    <div onclick="deleteContent('${grade}', 'quiz', '${q.id}')" class="trash-icon">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlQZ = '<p class="text-gray-500 text-sm">لا توجد اختبارات.</p>';
    document.getElementById('manageQuizzes').innerHTML = htmlQZ;
}

async function deleteContent(grade, itemType, identifier) {
    if(!confirm("حذف العنصر؟")) return;
    try {
        const res = await fetch('/api/admin/delete-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade, itemType, identifier })
        });
        if (res.ok) fetchGradeContent();
    } catch (err) {}
}

async function updateStudentStatus(email, newStatus, reason = '') {
    await fetch('/api/admin/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: user.role, sessionToken: sessionToken, studentEmail: email, newStatus, reason }) });
    fetchPendingRequests(); fetchStats();
}

function rejectStudent(email) { const reason = prompt("سبب الرفض:"); if (reason) updateStudentStatus(email, 'rejected', reason); }

function logout() { localStorage.removeItem('dahih_user'); localStorage.removeItem('dahih_token'); window.location.href = "/logina.html"; }

// 🔥 الحقن البرمجي (UI) 🔥
document.addEventListener('DOMContentLoaded', () => {
    fetchStats();

    if (startStreamBtn && !document.getElementById('streamGradeSelect')) {
        const streamUI = `
        <div class="space-y-4 mb-6 animate-fade-in-up">
            <div class="relative group">
                <div class="absolute -inset-0.5 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <input type="text" id="youtubeLinkInput" placeholder="🔗 الصق رابط البث المباشر من يوتيوب هنا..." 
                    class="relative w-full bg-black/60 border border-yellow-500/30 rounded-xl px-5 py-4 text-white outline-none focus:border-yellow-500 font-bold transition-all placeholder:text-gray-500 text-sm">
            </div>
            
            <select id="streamGradeSelect" class="w-full bg-black/40 border-2 border-yellow-500 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-400 font-bold appearance-none">
                <option value="" class="text-gray-400">-- 🛑 حدد الدفعة التي سيظهر لها البث 🛑 --</option>
                <optgroup label="المرحلة الابتدائية" class="bg-gray-900 text-yellow-500 font-black">
                    <option value="الصف الأول الابتدائي">الأول الابتدائي</option>
                    <option value="الصف الثاني الابتدائي">الثاني الابتدائي</option>
                    <option value="الصف الثالث الابتدائي">الثالث الابتدائي</option>
                    <option value="الصف الرابع الابتدائي">الرابع الابتدائي</option>
                    <option value="الصف الخامس الابتدائي">الخامس الابتدائي</option>
                    <option value="الصف السادس الابتدائي">السادس الابتدائي</option>
                </optgroup>
                <optgroup label="المرحلة الإعدادية" class="bg-gray-900 text-blue-400 font-black">
                    <option value="الصف الأول الإعدادي">الأول الإعدادي</option>
                    <option value="الصف الثاني الإعدادي">الثاني الإعدادي</option>
                    <option value="الصف الثالث الإعدادي">الثالث الإعدادي</option>
                </optgroup>
                <optgroup label="المرحلة الثانوية" class="bg-gray-900 text-green-400 font-black">
                    <option value="الصف الأول الثانوي">الأول الثانوي</option>
                    <option value="الصف الثاني الثانوي">الثاني الثانوي</option>
                    <option value="الصف الثالث الثانوي">الثالث الثانوي</option>
                </optgroup>
            </select>
        </div>`;
        startStreamBtn.insertAdjacentHTML('beforebegin', streamUI);
    }

    if (toggleCamBtn && !document.getElementById('switchCamBtn')) {
        const switchHTML = `
        <button id="switchCamBtn" title="تبديل الكاميرا" class="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl border border-white/10 text-white transition-colors backdrop-blur-md">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>`;
        toggleCamBtn.insertAdjacentHTML('afterend', switchHTML);
        document.getElementById('switchCamBtn').addEventListener('click', async () => {
            currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
            if (isLive) await switchCameraLive();
            else alert(`تم تحديد الكاميرا ${currentFacingMode === 'user' ? 'الأمامية' : 'الخلفية'}.`);
        });
    }
});
