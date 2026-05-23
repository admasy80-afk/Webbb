// ════════════════════════════════════════════
// منصة الدحيح | تكامل البث المباشر (VideoSDK)
// ════════════════════════════════════════════

const VIDEOSDK_TOKEN = "4bc289fe416d09f0ea5b3f9929d3e800b5cb4d111c6f37e02f32ca26e5ac69db";
let studentMeeting = null;

document.addEventListener('DOMContentLoaded', () => {
    const joinStreamBtn = document.getElementById('joinStreamBtn');
    const streamIdInput = document.getElementById('streamIdInput');
    const joinStreamControls = document.getElementById('joinStreamControls');
    const liveStreamWrapper = document.getElementById('liveStreamWrapper');
    const liveVideoContainer = document.getElementById('liveVideoContainer');
    const leaveStreamBtn = document.getElementById('leaveStreamBtn');
    const waitingText = document.getElementById('waitingText');
    
    if(joinStreamBtn) {
        joinStreamBtn.addEventListener('click', () => {
            const studentName = document.getElementById('studentName')?.innerText || "طالب الدحيح";
            const meetingId = streamIdInput.value.trim();
            
            if(!meetingId) {
                alert("يرجى إدخال كود البث أولاً!");
                return;
            }

            joinStreamBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full mr-2"></span> جاري الاتصال...`;
            joinStreamBtn.disabled = true;

            window.VideoSDK.config(VIDEOSDK_TOKEN);

            studentMeeting = window.VideoSDK.initMeeting({
                meetingId: meetingId,
                name: studentName,
                micEnabled: false, 
                webcamEnabled: false, 
                mode: "RECV_ONLY" 
            });

            studentMeeting.join();

            studentMeeting.on("meeting-joined", () => {
                joinStreamControls.classList.add('hidden');
                liveStreamWrapper.classList.remove('hidden');
                joinStreamBtn.innerHTML = "دخول للبث";
                joinStreamBtn.disabled = false;
                streamIdInput.value = '';
            });

            studentMeeting.on("participant-joined", (participant) => {
                participant.on("stream-enabled", (stream) => {
                    if (stream.kind === "video" || stream.kind === "share") {
                        waitingText.style.display = "none";
                        const mediaStream = new MediaStream();
                        mediaStream.addTrack(stream.track);
                        
                        let videoElm = document.createElement("video");
                        videoElm.id = `v-${participant.id}`;
                        videoElm.srcObject = mediaStream;
                        videoElm.autoplay = true;
                        videoElm.playsinline = true;
                        videoElm.className = "w-full h-full object-contain bg-black";
                        
                        liveVideoContainer.appendChild(videoElm);
                    }
                    if (stream.kind === "audio") {
                        const mediaStream = new MediaStream();
                        mediaStream.addTrack(stream.track);
                        
                        let audioElm = document.createElement("audio");
                        audioElm.id = `a-${participant.id}`;
                        audioElm.srcObject = mediaStream;
                        audioElm.autoplay = true;
                        
                        liveVideoContainer.appendChild(audioElm);
                    }
                });

                participant.on("stream-disabled", (stream) => {
                    if (stream.kind === "video" || stream.kind === "share") {
                        let videoElm = document.getElementById(`v-${participant.id}`);
                        if(videoElm) videoElm.remove();
                        waitingText.style.display = "block";
                    }
                    if (stream.kind === "audio") {
                        let audioElm = document.getElementById(`a-${participant.id}`);
                        if(audioElm) audioElm.remove();
                    }
                });
            });

            studentMeeting.on("meeting-left", () => {
                liveVideoContainer.querySelectorAll('video, audio').forEach(el => el.remove());
                waitingText.style.display = "block";
                joinStreamControls.classList.remove('hidden');
                liveStreamWrapper.classList.add('hidden');
                studentMeeting = null;
            });

            studentMeeting.on("error", (err) => {
                alert("خطأ في الاتصال بالبث: تأكد من صحة الكود.");
                joinStreamBtn.innerHTML = "دخول للبث";
                joinStreamBtn.disabled = false;
                studentMeeting = null;
            });
        });
    }

    if(leaveStreamBtn) {
        leaveStreamBtn.addEventListener('click', () => {
            if(studentMeeting) studentMeeting.leave();
        });
    }
});
