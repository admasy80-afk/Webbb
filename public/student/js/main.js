// ════════════════════════════════════════════
// منصة الدحيح | المتحكم الرئيسي وواجهة المستخدم
// ════════════════════════════════════════════

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        setTimeout(() => el.style.display = 'none', 300);
    });
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
        if (el.id === 'btn-live') el.classList.remove('text-red-500');
    });
    
    const activeTab = document.getElementById(`tab-${tabId}`);
    if(activeTab) {
        setTimeout(() => {
            activeTab.style.display = 'block';
            void activeTab.offsetWidth;
            activeTab.classList.add('active');
        }, 310);
        
        const btn = document.getElementById(`btn-${tabId}`);
        if(btn) {
            btn.classList.add('active');
            if (tabId === 'live') btn.classList.remove('text-red-500');
        }
    }
};

function animateNumber(el, from, to, duration = 1200) {
    if (!el) return;
    
    const circle = document.querySelector('#sideCol circle'); // جلب عنصر الـ SVG الخاص بالدائرة
    const radius = circle ? circle.r.baseVal.value : 0;
    const circumference = radius ? radius * 2 * Math.PI : 289; 

    if (state.reduceMotion) { 
        el.textContent = to + '%'; 
        if(circle) {
            const offset = circumference - (to / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
        return; 
    }

    const start = performance.now();
    const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const currentVal = Math.floor(from + (to - from) * eased);
        
        el.textContent = currentVal + '%';
        
        // تحريك أنيميشن الدائرة بشكل متزامن مع الأرقام
        if (circle) {
            const offset = circumference - (currentVal / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }

        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

async function fetchData(initial = false) {
    const container = $('studentCoursesContainer');
    if (initial && container) {
        container.innerHTML = `
            <div class="text-center py-16 text-gray-500 flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10 w-full">
                <svg class="animate-spin h-10 w-10 text-yellow-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="font-bold text-lg text-gray-300">جاري جلب المحاضرات والمحتوى...</p>
                <p class="text-sm mt-2 text-gray-500">جاري المزامنة مع الإدارة</p>
            </div>`;
    }

    try {
        // يتم طلب البيانات الأساسية للـ Dashboard من السيرفر الداخلي المجمع للبيانات المرفوعة من الإدارة
        const res = await fetchWithTimeout('/api/student/dashboard-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ email: state.user.email, grade: state.user.grade })
        }, 15000);

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                alert("🚨 انتهت صلاحية الجلسة (401/403)، يرجى إعادة تسجيل الدخول.");
                logout();
                return;
            }
            throw new Error(`رفض السيرفر الطلب برمز الحالة: ${res.status}`);
        }

        const data = await res.json();
        renderAll(data, initial);
        
    } catch (err) {
        alert(`🚨 فشل جلب بيانات الـ Dashboard:\nالسبب: ${err.message}\n\nتأكد من مطابقة السيرفر للمخرجات المرفوعة من مسارات الإدارة.`);

        if (container) {
            container.innerHTML = `
                <div class="text-center py-16 text-red-400 bg-red-500/5 rounded-2xl border border-red-500/20 w-full">
                    <p class="font-bold text-xl mb-2">فشل تحميل المحاضرات والمحتوى 😔</p>
                    <p class="text-sm text-gray-400 mb-6">${err.message}</p>
                    <button onclick="DahihApp.refresh()" class="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 px-6 py-2 rounded-xl transition-colors font-bold">🔄 أعد المحاولة</button>
                </div>`;
        }
    }
}

function renderAll(data, initial) {
    try {
        // 1. ربط المحاضرات (الآتية من مسار الإدارة SAVE_CONTENT)
        const courses = data.courses || data.content?.courses || [];
        renderCourses(courses, initial);

        // 2. ربط الاختبارات بكافة أنواعها المرفوعة من الإدارة (SAVE_QUIZ, SAVE_TEST, SAVE_PUB_QUIZ)
        const allQuizzes = [
            ...(data.content?.quizzes || data.quizzes || []),
            ...(data.content?.tests || data.tests || []),
            ...(data.content?.publicQuizzes || data.publicQuizzes || [])
        ];
        renderQuizzes(allQuizzes);

        // 3. ربط الملاحظات والنقاط الإدارية (الآتية من مسار الإدارة UPDATE_POINTS)
        const points = data.content?.points || data.points || [];
        renderPoints(points);

        // 4. ربط الأسئلة المقالية العامة أو الخاصة بالمحاضرة
        const questions = data.content?.questions || data.questions || [];
        renderQuestions(questions);

        // 5. ربط نقاط الطالب وعرضها بالحركة الأنيقة
        const currentStudentPoints = data.studentPoints !== undefined ? data.studentPoints : (data.content?.studentPoints || 0);
        renderScore(parseInt(currentStudentPoints));

    } catch(e) {
        alert("🚨 خطأ أثناء معالجة وتوزيع مخرجات مسارات الإدارة المتزامنة:\n" + e.message);
    }
}

function renderCourses(list, initial) {
    const container = $('studentCoursesContainer');
    if (!container) return;
    list = list || [];

    const h = hash(list.map(c => [c.telegramMsgId, c.courseName, c.description, c.duration, c.lastWatched, c.image]));
    if (h === state.coursesHash && !initial) return;
    state.coursesHash = h;

    if (list.length === 0) {
        container.className = "flex flex-col gap-8";
        container.innerHTML = '<div class="text-center py-16 text-gray-400 bg-white/5 rounded-2xl border border-white/10 w-full">لا توجد محاضرات متاحة حالياً لصفك الدراسي.</div>';
        return;
    }

    container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
    const html = list.map((course, idx) => {
        const id = course.telegramMsgId;
        const num = idx + 1;
        const isActive = String(state.currentMsgId) === String(id);
        const title = escapeHTML(course.courseName || 'محاضرة');
        const desc = escapeHTML(course.description || 'لا يوجد وصف');
        const duration = escapeHTML(course.duration || 'غير محدد');
        const image = course.image && course.image.length > 10 ? course.image : 'https://images.unsplash.com/photo-1632516643720-e7f5d7d6ecc9?q=80&w=600&auto=format&fit=crop';
        const lastWatched = course.lastWatched;
        
        const borderColor = isActive ? 'border-yellow-500/40' : 'border-white/10';
        const shadow = isActive ? 'shadow-[0_4px_20px_rgba(234,179,8,0.1)]' : 'shadow-lg';
        const badgeBg = isActive ? 'border-yellow-500/40 text-yellow-500' : 'border-white/10 text-white';

        const actionBtn = isActive 
            ? `<button class="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2.5 rounded-lg transition-colors">استكمال المشاهدة</button>`
            : `<button class="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 rounded-lg transition-colors border border-white/10">تشغيل المحاضرة</button>`;

        const lastWatchedHTML = lastWatched 
            ? `<div class="inline-flex items-center gap-2 text-[0.75rem] text-white bg-white/5 px-3 py-1.5 rounded-md mb-4 border border-white/10 w-fit"><span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>آخر مشاهدة: الدقيقة ${lastWatched}</div>` 
            : '<div class="h-8 mb-4"></div>';

        return `
            <div class="flex flex-col bg-white/5 border ${borderColor} rounded-xl overflow-hidden hover:-translate-y-1 hover:border-white/20 transition-all duration-300 ${shadow} course-card-v4" id="course_${id}">
                <div class="relative h-36 p-4 flex flex-col justify-between border-b border-white/10" style="background: linear-gradient(to bottom right, rgba(0,0,0,0.3), rgba(0,0,0,0.8)), url('${image}'); background-size: cover; background-position: center;">
                    <span class="self-start px-2.5 py-1 rounded-md text-[0.7rem] font-bold bg-black/50 backdrop-blur-sm border ${badgeBg}">الدرس ${num}</span>
                    <div class="text-white/90 text-xs font-medium drop-shadow-md truncate">${desc}</div>
                </div>
                <div class="p-5 flex flex-col flex-grow">
                    <h3 class="text-lg font-bold text-white mb-3 truncate" title="${title}">${title}</h3>
                    <div class="flex items-center gap-2 text-xs text-gray-400 mb-4">
                        <span class="bg-black/30 px-2 py-1 rounded border border-white/5">⏱️ ${duration}</span>
                    </div>
                    ${lastWatchedHTML}
                    <div class="mt-auto pt-4 border-t border-white/10 course-play cursor-pointer" data-msgid="${id}" data-title="${title}">
                        ${actionBtn}
                    </div>
                </div>
            </div>`;
    }).join('');

    container.innerHTML = html;
    container.querySelectorAll('.course-play').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.switchTab === 'function') { window.switchTab('dashboard'); }
            player.load(btn.dataset.msgid, btn.dataset.title);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

function renderQuizzes(list) {
    const container = $('onlineQuizzesContainer');
    if (!container) return;
    
    // فلترة وتأمين القائمة المدمجة والتخلص من أي عناصر مكررة برقم التعريف (id)
    const uniqueList = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

    const h = hash(uniqueList.map(q => [q.id, q.title || q.quizTitle || q.testTitle, (q.questions || []).length, (q.results || []).length]));
    if (h === state.quizzesHash) return;
    state.quizzesHash = h;
    state.availableQuizzes = uniqueList;

    if (!uniqueList.length) {
        container.innerHTML = '<p class="empty">لا توجد اختبارات أو تقييمات متاحة حالياً.</p>';
        return;
    }

    const html = uniqueList.slice().reverse().map(quiz => {
        const quizTitle = quiz.title || quiz.quizTitle || quiz.testTitle || 'اختبار تقييمي';
        const questionsCount = quiz.questions ? quiz.questions.length : 0;
        const result = quiz.results ? quiz.results.find(r => r.email === state.user.email) : null;
        
        const action = result
            ? `<div class="btn w-full md:w-auto mt-auto md:mt-0" style="background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.25);cursor:default;">مكتمل (${result.percentage}%)</div>`
            : `<button class="btn btn-primary quiz-start w-full md:w-auto mt-auto md:mt-0" data-quizid="${escapeHTML(quiz.id)}" type="button">بدء الاختبار</button>`;

        return `
            <article class="course-card flex flex-col md:flex-row justify-between h-full">
                <div class="mb-4 md:mb-0" style="flex:1;">
                    <h3 class="text-white font-bold text-lg m-0">${escapeHTML(quizTitle)}</h3>
                    <p class="text-gray-400 text-sm m-0">${questionsCount} أسئلة</p>
                </div>
                ${action}
            </article>`;
    }).join('');
    container.innerHTML = `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${html}</div>`;
    container.querySelectorAll('.quiz-start').forEach(btn => {
        btn.addEventListener('click', () => openQuizModal(btn.dataset.quizid));
    });
}

function renderPoints(list) {
    const container = $('pointsContainer');
    if (!container) return;
    const h = hash(list);
    if (h === state.pointsHash) return;
    state.pointsHash = h;
    if (!list.length) { container.innerHTML = '<p class="empty">لا توجد ملاحظات حالياً.</p>'; return; }
    container.innerHTML = `<ul class="fade-in-stagger" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.65rem;">${list.map(p => `<li style="display:flex;gap:0.65rem;color:#cbd5e1;font-size:0.9rem;line-height:1.7;"><span style="color:var(--accent);flex-shrink:0;line-height:1.7;">▸</span><span>${escapeHTML(p)}</span></li>`).join('')}</ul>`;
}

function renderQuestions(list) {
    const container = $('questionsContainer');
    if (!container) return;
    const h = hash(list);
    if (h === state.questionsHash) return;
    state.questionsHash = h;
    if (!list.length) { container.innerHTML = '<p class="empty">لا توجد أسئلة مقالية حالياً.</p>'; return; }
    container.innerHTML = `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${list.map((q, i) => `<article style="background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;"><h3 style="font-size:0.9rem;font-weight:700;color:#fff;margin:0 0 0.5rem;line-height:1.5;"><span style="color:var(--text-dim);margin-left:0.4rem;">${i + 1}.</span>${escapeHTML(q.question || q.questionText)}</h3><p style="color:var(--text-muted);font-size:0.85rem;line-height:1.7;border-top:1px solid var(--border);padding-top:0.5rem;margin:0;"><span style="color:var(--accent);font-weight:700;margin-left:0.4rem;">الإجابة/التلميح:</span>${escapeHTML(q.hint || q.answer || 'راجع المحاضرة المرفقة لمعرفة الإجابة النموذجية')}</p></article>`).join('')}</div>`;
}

function renderScore(newPoints) {
    const el = $('studentPointsDisplay');
    if (!el || state.currentPoints === newPoints) return;
    const start = state.currentPoints === -1 ? 0 : state.currentPoints;
    animateNumber(el, start, newPoints, 1200);
    state.currentPoints = newPoints;
}

function openQuizModal(quizId) {
    const quiz = state.availableQuizzes.find(q => q.id === quizId);
    if (!quiz) return;
    const content = $('quizModalContent');
    const modal = $('quizModal');
    if (!content || !modal) return;

    const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
    const quizTitle = quiz.title || quiz.quizTitle || quiz.testTitle || 'اختبار دحيح';
    
    const questionsHTML = (quiz.questions || []).map((q, qi) => `
        <div style="background:rgba(0,0,0,0.4);padding:1rem;border-radius:0.75rem;border:1px solid var(--border);margin-bottom:1rem;">
            <h4 style="font-size:0.95rem;font-weight:600;margin:0 0 0.85rem;line-height:1.6;color:white;"><span style="color:var(--accent);margin-left:0.4rem;">${qi + 1}.</span>${escapeHTML(q.questionText || q.question)}</h4>
            <div style="display:grid;grid-template-columns:1fr;gap:0.5rem;">
                ${(q.options || []).map((opt, oi) => `<label class="quiz-option"><input type="radio" name="q_${qi}" value="${oi}" required><div class="opt"><span class="opt-letter">${letters[oi] || (oi + 1)}</span><span style="color:#cbd5e1;font-size:0.9rem;line-height:1.6;">${escapeHTML(opt)}</span></div></label>`).join('')}
            </div>
        </div>`).join('');

    content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:1rem;margin-bottom:1.25rem;">
            <h2 id="quizModalTitle" style="font-size:1.15rem;font-weight:700;margin:0;color:white;">${escapeHTML(quizTitle)}</h2>
        </div>
        <form id="activeQuizForm" style="display:flex;flex-direction:column;">
            ${questionsHTML}
            <button type="submit" id="btnSubmitQuiz" class="btn btn-primary" style="padding:0.85rem;">إنهاء وتسليم الإجابات</button>
            <button type="button" class="btn mt-2" onclick="DahihApp.closeQuiz()" style="background:transparent;border:1px solid var(--border);color:white;">إلغاء</button>
        </form>`;

    modal.classList.add('is-open');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    $('activeQuizForm').addEventListener('submit', (e) => submitQuiz(e, quiz));
}

async function submitQuiz(event, quiz) {
    event.preventDefault();
    const btn = $('btnSubmitQuiz');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري التصحيح والمزامنة...'; }

    const form = event.target;
    let score = 0;
    const questionsList = quiz.questions || [];
    
    questionsList.forEach((q, qi) => {
        const el = form.elements[`q_${qi}`];
        // دعم قراءة المفتاح سواء كان correctAnswer أو correct
        const correctAnsIndex = q.correctAnswer !== undefined ? q.correctAnswer : q.correct;
        if (el && parseInt(el.value) === parseInt(correctAnsIndex)) score++;
    });
    
    const percentage = questionsList.length > 0 ? Math.round((score / questionsList.length) * 100) : 0;

    try {
        // إرسال نتيجة الاختبار لنفس مسار معالجة نتائج تقييمات الطلاب المربوط بالإدارة
        await fetchWithTimeout('/api/student/submit-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
            body: JSON.stringify({ email: state.user.email, studentName: state.user.name, grade: state.user.grade, quizId: quiz.id, score, percentage })
        });
        if (percentage >= 85 && typeof confetti === 'function' && !state.reduceMotion) { confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } }); }
        closeQuiz();
        fetchData(true);
    } catch (err) {
        alert(`🚨 فشل إرسال نتيجة الاختبار ورصد النقاط:\n${err.message}`);
        if (btn) { btn.disabled = false; btn.textContent = 'حاول مجدداً'; }
    }
}

function closeQuiz() {
    const modal = $('quizModal');
    modal.classList.remove('is-open');
    modal.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = '';
}

function init() {
    if (!authGate()) return;

    // بمجرد الدخول، هيسحب الاسم من السيرفر/state ويحطه
    const firstName = state.user.name ? state.user.name.split(' ')[0] : 'طالب';
    const fullName = state.user.name || 'طالب غير محدد';
    
    const nameEl = $('studentName');
    if(nameEl) nameEl.textContent = fullName; // أو firstName حسب ما تفضل
    
    const gradeEl = $('studentGrade');
    if(gradeEl) gradeEl.textContent = state.user.grade || 'الصف غير محدد';

    player.init();
    fetchData(true);

    if (!state.pollTimer) {
        state.pollTimer = setInterval(() => fetchData(false), 10000);
    }
}

// تصدير المهام الأساسية لتكون متاحة لأزرار الـ HTML للتحكم السلس في الواجهة
window.DahihApp = {
    logout, 
    toggleFullscreen, 
    closeQuiz,
    refresh: () => fetchData(true)
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
