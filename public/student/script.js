// ==================== الإعدادات الأساسية والمؤثرات الصوتية ====================
const trashSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

// المؤثرات الصوتية (هادئة وغير مزعجة)
const sounds = {
    click: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_78d5236b22.mp3'),
    success: new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3')
};
Object.values(sounds).forEach(audio => audio.volume = 0.3);

const userDataStr = localStorage.getItem('dahih_user');
window.availableQuizzes = []; 
let currentUser = null;
let currentPointsTracker = -1; // لتتبع النقاط ومنع تكرار الأنيميشن

// التحقق من تسجيل الدخول
if (!userDataStr) {
    window.location.replace("/logina.html");
} else {
    currentUser = JSON.parse(userDataStr);
    const firstName = currentUser.name ? currentUser.name.split(' ')[0] : "طالب";
    
    const nameEl = document.getElementById('studentName');
    const gradeEl = document.getElementById('studentGrade');
    if (nameEl) nameEl.innerText = firstName;
    if (gradeEl) gradeEl.innerText = currentUser.grade || "الصف غير محدد";
    
    const loadOverlay = document.getElementById('loadingOverlay');
    const unmuteOverlay = document.getElementById('unmuteOverlay');
    if (loadOverlay) loadOverlay.style.display = 'none';
    if (unmuteOverlay) unmuteOverlay.style.display = 'none';
    
    fetchDashboardData();
    setInterval(fetchDashboardData, 2000); 
}

// ==================== إعدادات المشغل (Hype Meter + Theater Mode) ====================

let hypeClicks = 0;
const maxHype = 3; // عدد الضغطات المطلوبة لفتح البث

window.revealStream = function() {
    const btn = document.getElementById('enterStreamBtn');
    if(!btn) return;
    
    hypeClicks++;
    sounds.click.play().catch(()=>{});
    
    // اهتزاز خفيف مع كل ضغطة
    if ("vibrate" in navigator) navigator.vibrate(30);

    const percentage = (hypeClicks / maxHype) * 100;
    
    if (hypeClicks < maxHype) {
        // تحديث شكل الزر كعداد حماس
        btn.style.background = `linear-gradient(90deg, #eab308 ${percentage}%, #1f2937 ${percentage}%)`;
        btn.innerHTML = `🔥 حمسنا عشان نبدأ! (${hypeClicks}/${maxHype})`;
    } else {
        // فتح البث
        btn.style.background = '#eab308';
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> جاري الدخول...`;
        btn.disabled = true;
        
        if ("vibrate" in navigator) navigator.vibrate([50, 50, 100]); // اهتزاز الدخول

        setTimeout(() => {
            const overlay = document.getElementById('dahih-custom-overlay');
            if(overlay) {
                overlay.classList.add('opacity-0', 'scale-110');
                setTimeout(() => overlay.style.display = 'none', 500);
            }
        }, 1500); // قللنا الوقت لسرعة الاستجابة
    }
};

// وضع السينما (إطفاء الأنوار)
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
        el.style.transition = 'opacity 0.5s ease';
    });

    streamSection.style.transform = isTheater ? 'scale(1.02)' : 'scale(1)';
    streamSection.style.zIndex = isTheater ? '100' : 'auto';
    streamSection.style.position = isTheater ? 'relative' : 'static';
    streamSection.style.transition = 'all 0.4s ease';
}

function forceShowStream() {
    const section = document.getElementById('liveStreamSection');
    const container = document.getElementById("twitch-embed"); 
    
    if(section && !section.classList.contains('stream-active')) {
        section.classList.add('stream-active');
    }
    
    if (container && container.innerHTML.trim() === "") {
        const myDomain = "webbb-production-b681.up.railway.app";
        const parentParams = `&parent=${myDomain}&parent=localhost`;
        
        const customOverlayHTML = `
        <div id="dahih-custom-overlay" class="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#070b19] transition-all duration-500 rounded-xl md:rounded-[1.5rem]">
            <div class="glass-panel border border-white/5 p-6 md:p-8 rounded-2xl text-center w-[85%] max-w-sm border-t-[3px] border-t-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.1)] transition-all">
                <div class="w-14 h-14 mx-auto bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-4 animate-pulse">
                    <svg class="w-6 h-6 text-yellow-500 pl-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <h3 class="text-lg md:text-xl font-bold text-white mb-2">منصة الدحيح</h3>
                <p class="text-gray-400 text-xs md:text-sm mb-6">يوجد بث مباشر يعمل الان</p>
                <div class="flex gap-2">
                    <button id="enterStreamBtn" onclick="revealStream()" class="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-4 rounded-xl transition-all text-sm md:text-base flex items-center justify-center shadow-md">
                        دخول الحصة
                    </button>
                    <button onclick="toggleTheaterMode()" title="وضع السينما" class="bg-white/5 border border-white/10 text-yellow-500 p-3 rounded-xl hover:bg-white/10 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                    </button>
                </div>
            </div>
        </div>`;

        container.innerHTML = customOverlayHTML + `<iframe 
            src="https://player.twitch.tv/?channel=moooae2tf${parentParams}&autoplay=true&muted=true&controls=false" 
            height="100%" width="100%" allowfullscreen="true" scrolling="no" frameborder="0" style="border: none;">
        </iframe>`;
    }
}

function forceHideStream() {
    const section = document.getElementById('liveStreamSection');
    const container = document.getElementById("twitch-embed"); 
    
    if(section && section.classList.contains('stream-active')) {
        section.classList.remove('stream-active');
        if (container) container.innerHTML = ""; 
        if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
        document.body.classList.remove('bg-black'); // إلغاء وضع السينما لو البث قفل
    }
}

// ==================== التفاعل والشاشات (العداد الرقمي) ====================

function handleFullscreenText(isFullscreen) {
    const fsWrapper = document.getElementById('fs-wrapper');
    if (fsWrapper) {
        const warningText = fsWrapper.querySelector('p');
        if (warningText) warningText.style.display = isFullscreen ? 'none' : 'block';
    }
}

function toggleStudentFullScreen() {
    const fsWrapper = document.getElementById('fs-wrapper');
    if (!fsWrapper) return;
    
    if (!document.fullscreenElement) {
        if(fsWrapper.requestFullscreen) {
            fsWrapper.requestFullscreen().then(() => { try { screen.orientation.lock('landscape'); } catch (e) {} });
        } else if(fsWrapper.webkitRequestFullscreen) {
            fsWrapper.webkitRequestFullscreen();
        }
    } else { 
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => { try { screen.orientation.unlock(); } catch (e) {} });
        }
    }
}

document.addEventListener('fullscreenchange', () => handleFullscreenText(!!document.fullscreenElement));
document.addEventListener('webkitfullscreenchange', () => handleFullscreenText(!!document.webkitFullscreenElement));

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
        section.style.maxHeight = section.scrollHeight + 500 + 'px'; 
        section.style.opacity = '1';
    }
}

// أنيميشن العداد الرقمي المطور
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // استخدام easing لتبطيء العداد في النهاية
        const easeOut = progress * (2 - progress);
        obj.innerText = Math.floor(easeOut * (end - start) + start) + '%';
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

async function fetchDashboardData() {
    try {
        const res = await fetch('/api/student/dashboard-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, grade: currentUser.grade })
        });

        if (res.ok) {
            const data = await res.json();
            
            const isLiveOnServer = data.content?.liveStream?.isLive === true;
            if (isLiveOnServer) { forceShowStream(); } else { forceHideStream(); }

            // تحديث التقييم باستخدام العداد الرقمي
            const pointsDisplay = document.getElementById('studentPointsDisplay');
            const newPoints = parseInt(data.studentPoints || 0);
            
            if (pointsDisplay && currentPointsTracker !== newPoints) {
                const startPoint = currentPointsTracker === -1 ? 0 : currentPointsTracker;
                animateValue(pointsDisplay, startPoint, newPoints, 1500);
                currentPointsTracker = newPoints;
            }

            // تحديث الاختبارات
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
                } else { 
                    qzContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد اختبارات إلكترونية حالياً.</p>'; 
                }
            }

            // تحديث النقاط (الملاحظات)
            const pContainer = document.getElementById('pointsContainer');
            if (pContainer) {
                if (data.content?.points && data.content.points.length > 0) {
                    let pHTML = '<ul class="space-y-3 text-gray-300 text-sm md:text-base">';
                    data.content.points.forEach(point => pHTML += `<li class="flex items-start gap-3"><span class="text-yellow-500 mt-1.5 text-xs">■</span><p class="leading-relaxed">${point}</p></li>`);
                    pHTML += '</ul>';
                    pContainer.innerHTML = pHTML;
                } else { pContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد ملاحظات من المعلم.</p>'; }
            }

            // تحديث المقالي
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

            // نتائج الورقي
            const tContainer = document.getElementById('testsContainer');
            if (tContainer) {
                if (data.content?.tests && data.content.tests.length > 0) {
                    let tHTML = '';
                    data.content.tests.slice().reverse().forEach(test => {
                        tHTML += `<div class="bg-black/30 border border-white/5 rounded-xl p-4 md:p-5 card-hover"><h3 class="font-bold text-yellow-500 mb-4 border-b border-white/10 pb-2">${test.testName}</h3><div class="space-y-2">`;
                        let sortedScores = test.scores.sort((a, b) => b.score - a.score);
                        sortedScores.forEach((s, index) => {
                            let highlight = index < 3 ? 'text-white font-bold bg-white/5 border border-white/5' : 'text-gray-400';
                            let rank = index < 3 ? ['الأول', 'الثاني', 'الثالث'][index] : index + 1;
                            tHTML += `<div class="flex justify-between items-center p-2 rounded ${highlight}"><span class="text-sm"><span class="text-gray-500 ml-3 w-8 inline-block text-right">${rank}</span>${s.name}</span><span dir="ltr" class="font-bold">${s.score}</span></div>`;
                        });
                        tHTML += `</div></div>`;
                    });
                    tContainer.innerHTML = tHTML;
                } else { tContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لم تُنشر نتائج للاختبارات الورقية.</p>'; }
            }
        }
    } catch (err) { console.log("Error fetching data:", err); }
}

// ==================== نظام الاختبارات الشامل ====================

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
    
    // أنيميشن الفتح الناعم
    modal.classList.remove('hidden');
    modalContent.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-300');
    setTimeout(() => {
        modalContent.classList.remove('opacity-0', 'scale-95');
        modalContent.classList.add('opacity-100', 'scale-100');
    }, 10);
}

async function submitQuiz(event, quizId) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitQuiz');
    if (btn) { btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 inline text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> جاري التصحيح...`; btn.disabled = true; }

    const quiz = window.availableQuizzes.find(q => q.id === quizId);
    const form = event.target;
    let score = 0;

    quiz.questions.forEach((q, qIndex) => {
        if (parseInt(form.elements[`q_${qIndex}`].value) === q.correctAnswer) score++;
    });

    const percentage = Math.round((score / quiz.questions.length) * 100);

    // الاهتزاز والصوت بناءً على النتيجة
    if ("vibrate" in navigator) {
        if (percentage >= 50) navigator.vibrate([100, 50, 100]);
        else navigator.vibrate(400); // رسوب
    }

    try {
        await fetch('/api/student/submit-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: currentUser.email, 
                studentName: currentUser.name, 
                grade: currentUser.grade, 
                quizId: quizId, 
                score: score, 
                percentage: percentage 
            })
        });

        // تأثير الورق المتناثر (Confetti) للمتفوقين
        if (percentage >= 85) {
            sounds.success.play().catch(()=>{});
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
            const randomInRange = (min, max) => Math.random() * (max - min) + min;

            const interval = setInterval(function() {
                const timeLeft = animationEnd - Date.now();
                if (timeLeft <= 0) return clearInterval(interval);
                const particleCount = 50 * (timeLeft / duration);
                if(typeof confetti === 'function') {
                    confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
                    confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
                }
            }, 250);
        } else {
            sounds.click.play().catch(()=>{});
        }

        let colorClass = percentage >= 85 ? 'text-green-400' : (percentage >= 50 ? 'text-blue-400' : 'text-red-400');
        let shadowColor = percentage >= 85 ? 'rgba(74, 222, 128, 0.2)' : (percentage >= 50 ? 'rgba(96, 165, 250, 0.2)' : 'rgba(248, 113, 113, 0.2)');
        const successIcon = `<svg class="w-12 h-12 ${colorClass}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
        
        const modalContent = document.getElementById('quizModalContent');
        if (modalContent) {
            modalContent.innerHTML = `<div class="text-center py-10 px-6 overflow-hidden flex flex-col items-center"><div class="w-24 h-24 mb-6 rounded-full border border-white/10 flex items-center justify-center bg-black/40 animate-pop-in animate-float relative" style="box-shadow: 0 0 40px ${shadowColor};">${successIcon}</div><h2 class="text-3xl font-bold text-white mb-2 animate-slide-up delay-100">تم تسجيل إجاباتك</h2><p class="text-gray-400 mb-8 animate-slide-up delay-150">هذه هي نتيجتك النهائية المعتمدة</p><div class="inline-block animate-slide-up delay-200 mb-10"><div class="text-8xl font-black ${colorClass}" style="text-shadow: 0 0 30px ${shadowColor};" dir="ltr">${percentage}%</div></div><div class="bg-black/30 border border-white/5 rounded-2xl p-5 text-gray-300 w-full max-w-xs mx-auto mb-10 flex justify-between items-center px-8 animate-slide-up delay-250"><span class="font-medium text-gray-400">الإجابات الصحيحة</span><span class="font-bold text-white text-lg" dir="ltr">${score} / ${quiz.questions.length}</span></div><button onclick="closeQuizModal(); fetchDashboardData();" class="w-full max-w-xs mx-auto bg-white/5 border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/10 transition-colors block animate-slide-up delay-300">العودة للوحة التحكم</button></div>`;
        }
    } catch (err) { 
        alert("حدث خطأ، حاول مجدداً."); 
        if (btn) { btn.innerText = "تسليم الإجابات"; btn.disabled = false; }
    }
}

function closeQuizModal() { 
    sounds.click.play().catch(()=>{});
    const modal = document.getElementById('quizModal');
    const modalContent = document.getElementById('quizModalContent');
    
    if (modal && modalContent) {
        modalContent.classList.remove('opacity-100', 'scale-100');
        modalContent.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            modal.classList.add('hidden'); 
        }, 300);
    }
}

function logout() { 
    localStorage.removeItem('dahih_user'); 
    localStorage.removeItem('dahih_token'); 
    window.location.replace("/logina.html"); 
}
