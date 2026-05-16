// ==================== الإعدادات الأساسية والمؤثرات الصوتية ====================
const sounds = {
    click: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_78d5236b22.mp3'),
    success: new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3')
};
Object.values(sounds).forEach(audio => audio.volume = 0.3);

const userDataStr = localStorage.getItem('dahih_user');
const token = localStorage.getItem('dahih_token'); 
window.availableQuizzes = []; 
let currentUser = null;
let currentPointsTracker = -1; 
let currentPlayingMsgId = null;

if (!userDataStr) {
    window.location.replace("/logina.html");
} else {
    currentUser = JSON.parse(userDataStr);
    const firstName = currentUser.name ? currentUser.name.split(' ')[0] : "طالب";
    
    document.getElementById('studentName').innerText = firstName;
    document.getElementById('studentGrade').innerText = currentUser.grade || "الصف غير محدد";
    
    fetchDashboardData();
    setInterval(fetchDashboardData, 8000); 
}

// ==================== عقل المشغل الذكي (Native HTML5 Player Engine) ====================
const video = document.getElementById('dahihPlayer');
const placeholder = document.getElementById('videoPlaceholder');
const tapLeft = document.getElementById('tapLeft');
const tapRight = document.getElementById('tapRight');
const skipIndicator = document.getElementById('skipIndicator');
const skipText = document.getElementById('skipText');
const centerPlayBtn = document.getElementById('centerPlayBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const speedBtn = document.getElementById('speedBtn');
const muteBtn = document.getElementById('muteBtn');
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const durationDisplay = document.getElementById('durationDisplay');
const controlsBar = document.querySelector('.custom-controls');
const playingTitle = document.getElementById('playingVideoTitle');

let currentSpeedIndex = 0;
const speeds = [1, 1.25, 1.5, 2];

if(video) {
    const togglePlay = () => {
        if(video.src === "") return;
        if (video.paused) video.play(); else video.pause();
    };

    video.addEventListener('click', togglePlay);
    centerPlayBtn.addEventListener('click', togglePlay);

    video.addEventListener('play', () => {
        centerPlayBtn.style.opacity = '0';
        video.classList.remove('video-blur');
    });

    video.addEventListener('pause', () => {
        centerPlayBtn.style.opacity = '1';
        video.classList.add('video-blur'); 
    });

    const handleDoubleTap = (seconds, directionText) => {
        if(video.src === "") return;
        video.currentTime += seconds;
        skipText.innerText = directionText;
        skipIndicator.classList.remove('hidden');
        skipIndicator.style.animation = 'none';
        void skipIndicator.offsetWidth; 
        skipIndicator.style.animation = 'popFade 0.8s ease-out forwards';
        
        if ("vibrate" in navigator) navigator.vibrate(40);
        setTimeout(() => skipIndicator.classList.add('hidden'), 800);
    };

    // الـ RTL يخلي اليسار تقديم واليمين تأخير للمشاهدة المريحة
    tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); handleDoubleTap(10, "⏩ +10 ثواني"); });
    tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); handleDoubleTap(-10, "⏪ -10 ثواني"); });

    speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
        video.playbackRate = speeds[currentSpeedIndex];
        speedBtn.innerText = speeds[currentSpeedIndex] + 'x';
    });

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        muteBtn.innerHTML = video.muted 
            ? `<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>`
            : `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"></path></svg>`;
    });

    const formatTime = (time) => {
        if(isNaN(time)) return "00:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    video.addEventListener('timeupdate', () => {
        const percent = (video.currentTime / video.duration) * 100;
        progressBar.style.width = `${percent}%`;
        currentTimeDisplay.innerText = formatTime(video.currentTime);
    });

    video.addEventListener('loadedmetadata', () => {
        durationDisplay.innerText = formatTime(video.duration);
    });

    progressContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        if(video.src === "") return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration; 
    });
}

// دالة سحب وتشغيل المحاضرة سحابياً عند النقر عليها بالأنيميشن السلس
window.loadVideoToPlayer = function(msgId, title) {
    if(!video || currentPlayingMsgId === msgId) return;
    sounds.click.play().catch(()=>{});
    
    currentPlayingMsgId = msgId;
    playingTitle.innerText = title;
    
    // 🎬 تأثير الـ Fade Out السلس والراقي للبوستر الملكي
    placeholder.style.opacity = '0';
    placeholder.style.transform = 'scale(1.05)';
    
    setTimeout(() => {
        placeholder.classList.add('hidden');
        
        // إظهار الفيديو وعناصر التحكم
        video.classList.remove('hidden');
        tapLeft.classList.remove('hidden');
        tapRight.classList.remove('hidden');
        controlsBar.classList.remove('hidden');
        
        // شحن بث المحاضرة مباشرة من التليجرام
        video.pause();
        video.src = `/api/video/stream/${msgId}`;
        video.load();
        
        video.style.opacity = '1';
        video.play().catch(()=>{});
    }, 400); 

    // تمييز الكارد الفعال في الأرشيف
    document.querySelectorAll('.course-card').forEach(card => card.classList.remove('card-active'));
    document.getElementById(`course_${msgId}`)?.classList.add('card-active');
};

// ==================== وضع السينما وتكبير الشاشة ====================
function toggleTheaterMode() {
    sounds.click.play().catch(()=>{});
    const body = document.body;
    const streamSection = document.getElementById('liveStreamSection');
    if(!streamSection) return;

    body.classList.toggle('bg-black');
    const isTheater = body.classList.contains('bg-black');

    document.querySelectorAll('body > *:not(#liveStreamSection)').forEach(el => {
        el.style.opacity = isTheater ? '0' : '1';
        el.style.pointerEvents = isTheater ? 'none' : 'auto';
        el.style.transition = 'opacity 0.4s ease';
    });
}

function toggleStudentFullScreen() {
    const fsWrapper = document.getElementById('fs-wrapper');
    if (!fsWrapper) return;
    if (!document.fullscreenElement) {
        fsWrapper.requestFullscreen().catch(()=>{});
    } else {
        document.exitFullscreen().catch(()=>{});
    }
}

function toggleSection(sectionId, iconId) {
    sounds.click.play().catch(()=>{});
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(iconId);
    if (!section || !icon) return;
    section.classList.toggle('collapsed');
    icon.classList.toggle('collapsed');
    if(section.classList.contains('collapsed')) { 
        section.style.maxHeight = '0px'; 
        section.style.opacity = '0.5';
    } else { 
        section.style.maxHeight = '1000px'; 
        section.style.opacity = '1';
    }
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = progress * (2 - progress);
        obj.innerText = Math.floor(easeOut * (end - start) + start) + '%';
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// ==================== سحب وضخ البيانات من الباك إند المحمي ====================
async function fetchDashboardData() {
    try {
        const res = await fetch('/api/student/dashboard-data', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ email: currentUser.email, grade: currentUser.grade })
        });

        if (res.ok) {
            const data = await res.json();
            
            // 🎥 ضخ وعرض مصفوفة الحصص والأرشيف بالتفصيل والترتيب
            const coursesContainer = document.getElementById('studentCoursesContainer');
            if (coursesContainer) {
                const coursesList = data.courses || data.content?.courses || [];
                
                if (coursesList.length > 0) {
                    let coursesHTML = '';
                    coursesList.slice().reverse().forEach((course, index) => {
                        const isActive = currentPlayingMsgId === course.telegramMsgId ? 'card-active' : '';
                        coursesHTML += `
                        <div id="course_${course.telegramMsgId}" class="course-card ${isActive} bg-black/30 border border-white/5 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-yellow-500/30">
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded font-bold">الحصة ${coursesList.length - index}</span>
                                    <h3 class="font-bold text-base md:text-lg text-white">${course.courseName}</h3>
                                </div>
                                <p class="text-xs md:text-sm text-gray-400 mt-2 leading-relaxed">${course.description || 'لا يوجد وصف مضاف لهذه المحاضرة.'}</p>
                            </div>
                            <button onclick="window.loadVideoToPlayer(${course.telegramMsgId}, '${course.courseName}')" class="w-full sm:w-auto shrink-0 bg-white/5 hover:bg-yellow-500 hover:text-black text-yellow-500 font-bold px-5 py-2.5 rounded-xl border border-yellow-500/20 hover:border-transparent transition-all text-sm flex items-center justify-center gap-2 shadow-md">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> تشغيل الدرس
                            </button>
                        </div>`;
                    });
                    coursesContainer.innerHTML = coursesHTML;
                } else {
                    coursesContainer.innerHTML = '<p class="text-center text-gray-500 py-6">لا توجد محاضرات سحابية مرفوعة حالياً لهذه المرحلة.</p>';
                }
            }

            // تحديث التقييم العام
            const pointsDisplay = document.getElementById('studentPointsDisplay');
            const newPoints = parseInt(data.studentPoints || 0);
            if (pointsDisplay && currentPointsTracker !== newPoints) {
                const startPoint = currentPointsTracker === -1 ? 0 : currentPointsTracker;
                animateValue(pointsDisplay, startPoint, newPoints, 1500);
                currentPointsTracker = newPoints;
            }

            // تحديث كروت الكويزات والاختبارات المتاحة
            window.availableQuizzes = data.content?.quizzes || [];
            const qzContainer = document.getElementById('onlineQuizzesContainer');
            if (qzContainer) {
                if (window.availableQuizzes.length > 0) {
                    let qzHTML = '';
                    window.availableQuizzes.slice().reverse().forEach(quiz => {
                        const studentResult = quiz.results ? quiz.results.find(r => r.email === currentUser.email) : null;
                        qzHTML += `
                        <div class="bg-black/30 border border-white/5 rounded-xl p-4 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-yellow-500/30 card-hover">
                            <div><h3 class="font-bold text-base md:text-lg text-white">${quiz.title}</h3><p class="text-xs md:text-sm text-gray-400 mt-1">يحتوي على ${quiz.questions.length} أسئلة.</p></div>
                            ${studentResult 
                                ? `<div class="bg-white/5 border border-white/10 text-gray-300 px-6 py-2 rounded-lg text-sm text-center w-full md:w-auto font-bold flex items-center justify-center gap-2"><svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>مكتمل (${studentResult.percentage}%)</div>`
                                : `<button onclick="openQuizModal('${quiz.id}')" class="w-full md:w-auto bg-yellow-500 text-black font-bold px-6 py-2 rounded-lg hover:bg-yellow-400 transition-colors text-sm shadow-md">بدء الاختبار</button>`
                            }
                        </div>`;
                    });
                    qzContainer.innerHTML = qzHTML;
                } else { qzContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد اختبارات إلكترونية حالياً.</p>'; }
            }

            // تحديث الملاحظات وأهم نقاط المنهج
            const pContainer = document.getElementById('pointsContainer');
            if (pContainer) {
                if (data.content?.points && data.content.points.length > 0) {
                    let pHTML = '<ul class="space-y-3 text-gray-300 text-sm md:text-base">';
                    data.content.points.forEach(point => pHTML += `<li class="flex items-start gap-3"><span class="text-yellow-500 mt-1.5 text-xs">■</span><p class="leading-relaxed">${point}</p></li>`);
                    pHTML += '</ul>';
                    pContainer.innerHTML = pHTML;
                } else { pContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد ملاحظات من المعلم.</p>'; }
            }

            // تحديث الأسئلة المقالية والHints
            const qContainer = document.getElementById('questionsContainer');
            if (qContainer) {
                if (data.content?.questions && data.content.questions.length > 0) {
                    let qHTML = '';
                    data.content.questions.forEach((q, idx) => {
                        qHTML += `<div class="bg-black/30 border border-white/5 rounded-xl p-4 card-hover"><h3 class="font-bold text-sm md:text-base text-white mb-2"><span class="text-gray-500 mr-2">${idx + 1}.</span> ${q.question}</h3><p class="text-gray-400 text-sm leading-relaxed border-t border-white/10 pt-2"><span class="text-yellow-500 font-bold ml-2">الإجابة:</span>${q.hint}</p></div>`;
                    });
                    qContainer.innerHTML = qHTML;
                } else { qContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد أسئلة مقالية.</p>'; }
            }
        }
    } catch (err) { console.log("Error fetching data:", err); }
}

// دوال إدارة النوافذ المنبثقة للاختبارات (Quizzes)
function openQuizModal(quizId) {
    sounds.click.play().catch(()=>{});
    const quiz = window.availableQuizzes.find(q => q.id === quizId);
    if (!quiz) return;

    const modalContent = document.getElementById('quizModalContent');
    const modal = document.getElementById('quizModal');
    if (!modalContent || !modal) return;

    let html = `<div class="flex justify-between items-center mb-6 border-b border-white/10 pb-4"><h2 class="text-xl md:text-2xl font-bold text-white">${quiz.title}</h2><span class="text-yellow-500 text-sm bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-lg font-bold">${quiz.questions.length} أسئلة</span></div><form id="activeQuizForm" onsubmit="submitQuiz(event, '${quiz.id}')" class="space-y-6">`;

    quiz.questions.forEach((q, qIndex) => {
        html += `<div class="bg-black/40 p-4 md:p-5 rounded-xl border border-white/5"><h4 class="font-semibold text-base md:text-lg mb-4 text-white leading-relaxed"><span class="text-yellow-500 mr-2">${qIndex + 1}.</span>${q.questionText}</h4><div class="grid grid-cols-1 md:grid-cols-2 gap-3">`;
        q.options.forEach((opt, optIndex) => {
            const letters = ['أ', 'ب', 'ج', 'د'];
            html += `<label class="quiz-option cursor-pointer group" onchange="if('vibrate' in navigator) navigator.vibrate(20); sounds.click.play().catch(()=>{})"><input type="radio" name="q_${qIndex}" value="${optIndex}" required class="hidden"><div class="flex items-center gap-3 p-3 md:p-4 rounded-xl bg-white/5 border border-white/10 group-hover:border-yellow-500/50 transition-all h-full"><div class="w-6 h-6 rounded-md bg-black/50 border border-white/20 flex items-center justify-center text-xs font-bold text-gray-400 group-hover:text-white shrink-0 transition-colors group-hover:bg-black/80">${letters[optIndex]}</div><span class="text-gray-300 text-sm md:text-base leading-relaxed">${opt}</span></div></label>`;
        });
        html += `</div></div>`;
    });

    html += `<div class="flex flex-col md:flex-row gap-3 pt-4 border-t border-white/10"><button type="submit" id="btnSubmitQuiz" class="flex-1 bg-yellow-500 text-black font-bold py-3 md:py-4 rounded-xl hover:bg-yellow-400 transition-colors text-sm md:text-base shadow-md">إنهاء وتسليم الإجابات</button><button type="button" onclick="closeQuizModal()" class="md:w-32 bg-transparent border border-white/10 text-gray-300 font-bold py-3 md:py-4 rounded-xl hover:bg-white/5 transition-colors text-sm md:text-base">إلغاء</button></div></form>`;

    modalContent.innerHTML = html;
    modal.classList.remove('hidden');
}

async function submitQuiz(event, quizId) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitQuiz');
    if (btn) { btn.innerHTML = `جاري التصحيح واعتماد النتيجة...`; btn.disabled = true; }

    const quiz = window.availableQuizzes.find(q => q.id === quizId);
    const form = event.target;
    let score = 0;

    quiz.questions.forEach((q, qIndex) => {
        if (parseInt(form.elements[`q_${qIndex}`].value) === q.correctAnswer) score++;
    });

    const percentage = Math.round((score / quiz.questions.length) * 100);

    try {
        await fetch('/api/student/submit-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ email: currentUser.email, studentName: currentUser.name, grade: currentUser.grade, quizId: quizId, score: score, percentage: percentage })
        });

        if (percentage >= 85) {
            sounds.success.play().catch(()=>{});
            if(typeof confetti === 'function') {
                confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            }
        }

        let colorClass = percentage >= 85 ? 'text-green-400' : (percentage >= 50 ? 'text-blue-400' : 'text-red-400');
        const modalContent = document.getElementById('quizModalContent');
        if (modalContent) {
            modalContent.innerHTML = `<div class="text-center py-10 px-6 flex flex-col items-center"><h2 class="text-2xl font-bold text-white mb-2">تم تسجيل النتيجة بنجاح!</h2><div class="text-7xl font-black ${colorClass} my-6" dir="ltr">${percentage}%</div><p class="text-gray-400 mb-6">الإجابات الصحيحة: ${score} من أصل ${quiz.questions.length}</p><button onclick="closeQuizModal(); fetchDashboardData();" class="bg-yellow-500 text-black font-bold px-8 py-3 rounded-xl transition-all">العودة للوحة التحكم</button></div>`;
        }
    } catch (err) { alert("حدث خطأ أثناء حفظ النتيجة."); }
}

function closeQuizModal() { 
    sounds.click.play().catch(()=>{});
    document.getElementById('quizModal')?.classList.add('hidden'); 
}

function logout() { 
    localStorage.removeItem('dahih_user'); 
    localStorage.removeItem('dahih_token'); 
    window.location.replace("/logina.html"); 
}
