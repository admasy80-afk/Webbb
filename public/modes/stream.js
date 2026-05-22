// ==================== 4. سكريبت البث المباشر (المطور بواسطة VideoSDK) ====================
import { SysUI } from './ui.js';
import { user, sessionToken } from './state.js';

// تحديث الإصدار إلى 0.1.21 (أحدث وأكثر استقراراً)
import 'https://sdk.videosdk.live/js-sdk/0.1.21/videosdk.js';

// التوكن الصحيح الخاص بك
const VIDEOSDK_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcGlrZXkiOiI3YWRiNmM1Ny1lMjUyLTRkNDktOTQyYS0zMWYxMjNmMzUxYjQiLCJwZXJtaXNzaW9ucyI6WyJhbGxvd19qb2luIl0sImlhdCI6MTc3OTQ2MzY0OCwiZXhwIjoxOTM3MjUxNjQ4fQ.Xv1g9Hf4yg_fW26n2lO-zcNQ9Y9EesHZZm9nBajPb2A"; 

let meeting = null;
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

// إعداد وضع ملء الشاشة
if(fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => SysUI.toast('error', `تعذر تكبير الشاشة: ${err.message}`));
        } else { document.exitFullscreen(); }
    });
}

// دالة إنشاء غرفة بث جديدة برمجياً عبر سيرفرات VideoSDK 
async function createNewMeetingId() {
    const url = `https://api.videosdk.live/v2/rooms`;
    const options = {
        method: "POST",
        headers: { 
            "Authorization": VIDEOSDK_TOKEN, 
            "Content-Type": "application/json" 
        },
    };
    
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `فشل الاتصال: رمز الخطأ ${response.status}`);
        }
        
        return data.roomId;
    } catch (error) {
        throw error; 
    }
}

if(startStreamBtn) {
    startStreamBtn.addEventListener('click', async () => {
        try {
            alert("1. بدأنا: جاري طلب إنشاء غرفة من السيرفر...");
            startStreamBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> جاري تهيئة السيرفرات...`;
            startStreamBtn.disabled = true;

            const meetingId = await createNewMeetingId();
            alert("2. نجاح: تم إنشاء الغرفة! المعرف: " + meetingId);
            
            if (!meetingId) throw new Error("فشل تكوين اتصال مع سيرفرات البث.");

            window.VideoSDK.config(VIDEOSDK_TOKEN);

            meeting = window.VideoSDK.initMeeting({
                meetingId: meetingId,
                name: user.name || "المعلم / الأدمن",
                micEnabled: !isAudioMuted,
                webcamEnabled: !isVideoHidden,
                mode: "CONFERENCE" // تم التعديل لتفادي تعليق الحسابات غير المدعومة بالكامل
            });

            alert("3. جاري الانضمام... نرجو الموافقة على الكاميرا إذا طلب المتصفح ذلك.");
            meeting.join();

            // الحدث الأساسي: لا نستدعي الكاميرا إلا بعد التأكد من الدخول
            meeting.on("meeting-joined", async () => {
                alert("5. ✅ تم الدخول للبث المباشر بنجاح!");
                
                streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-green-500 block pulse-live"></span> البث مباشر الآن | معرف الغرفة: ${meetingId}`;
                streamStatusBadge.className = "bg-green-900/30 border border-green-500/50 text-green-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors duration-300";
                
                startStreamBtn.classList.add('hidden');
                stopStreamBtn.classList.remove('hidden');
                startStreamBtn.innerHTML = `بدء البث`; 
                startStreamBtn.disabled = false;

                // الآن localParticipant أصبح متاحاً ولن يعيد undefined
                const localParticipant = meeting.localParticipant;
                
                if (localParticipant) {
                    localParticipant.on("stream-enabled", (stream) => {
                        alert("4. تم تفعيل الكاميرا/المايك بنجاح!");
                        
                        if (stream.kind === "video") {
                            const mediaStream = new MediaStream();
                            mediaStream.addTrack(stream.track);
                            
                            videoElement.srcObject = mediaStream;
                            videoElement.play().catch(e => alert("خطأ تشغيل الفيديو: " + e));
                            
                            camOverlay.classList.add('hidden');
                            videoElement.style.opacity = '0';
                            videoElement.style.transition = 'opacity 0.5s ease';
                            
                            setTimeout(() => {
                                videoElement.style.opacity = '1';
                            }, 100);
                        }
                    });
                }

                try {
                    await fetch('/api/admin/toggle-stream', { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify({ role: user.role, sessionToken: sessionToken, isLive: true, meetingId: meetingId }) 
                    });
                } catch (e) { console.warn("تنبيه: فشل إعلام الباك-إند ببدء البث", e); }
            });

            meeting.on("meeting-left", () => { 
                stopLiveStream(true); 
            });
            
            meeting.on("error", (err) => { 
                alert("❌ خطأ من أحداث الغرفة: " + err.message);
                SysUI.toast('error', `خطأ في سيرفر البث: ${err.message}`); 
                stopLiveStream(true); 
            });

        } catch (err) { 
            alert("❌ توقف الكود بسبب خطأ: " + err.message);
            try { SysUI.toast('error', `خطأ: ${err.message}`); } catch (uiErr) {}
            
            startStreamBtn.innerHTML = `بدء البث`; 
            startStreamBtn.disabled = false;
            stopLiveStream(true); 
        }
    });
}

// التحكم في كتم وصوت المايك عبر الـ SDK
if(toggleMicBtn) {
    toggleMicBtn.addEventListener('click', () => {
        if (meeting) {
            isAudioMuted = !isAudioMuted;
            if (isAudioMuted) meeting.muteMic(); else meeting.unmuteMic();
            
            toggleMicBtn.className = isAudioMuted ? "bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-lg border border-red-500 transition-all duration-300 scale-95" : "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300 scale-100";
            toggleMicBtn.innerHTML = isAudioMuted ? 
                `<svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>` : 
                `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
        }
    });
}

// التحكم في إخفاء الكاميرا عبر الـ SDK
if(toggleCamBtn) {
    toggleCamBtn.addEventListener('click', () => {
        if (meeting) {
            isVideoHidden = !isVideoHidden;
            if (isVideoHidden) meeting.disableWebcam(); else meeting.enableWebcam();
            
            toggleCamBtn.className = isVideoHidden ? "bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-lg border border-red-500 transition-all duration-300 scale-95" : "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300 scale-100";
            toggleCamBtn.innerHTML = isVideoHidden ? 
                `<svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943-9.543-7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>` : 
                `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
        }
    });
}

// دالة إنهاء البث المباشر وتنظيف الذاكرة
async function stopLiveStream(forced = false) {
    if (meeting) {
        meeting.leave();
        meeting = null;
    }
    
    videoElement.srcObject = null;
    if (document.fullscreenElement) document.exitFullscreen();
    
    if(startStreamBtn) {
        startStreamBtn.classList.remove('hidden');
        stopStreamBtn.classList.add('hidden');
    }
    
    if(camOverlay) {
        camOverlay.style.opacity = '0';
        camOverlay.classList.remove('hidden');
        setTimeout(() => camOverlay.style.opacity = '1', 50);
    }
    
    if(streamStatusBadge) {
        streamStatusBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-gray-500 block"></span> النظام في وضع الاستعداد`;
        streamStatusBadge.className = "bg-gray-800 border border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors duration-300";
    }
    
    isAudioMuted = false;
    isVideoHidden = false;
    
    if(toggleMicBtn) {
        toggleMicBtn.className = "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300";
        toggleMicBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
    }
    if(toggleCamBtn) {
        toggleCamBtn.className = "bg-black/50 hover:bg-black text-white p-2.5 rounded-lg border border-white/10 transition-all duration-300";
        toggleCamBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    }
    
    try {
        await fetch('/api/admin/toggle-stream', { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, isLive: false }) 
        });
    } catch (e) {}
}

window.stopLiveStream = stopLiveStream;
