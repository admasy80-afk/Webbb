// ==================== 5. الإحصائيات وإدارة الطلاب و 6. إدارة المحتوى والنتائج ====================
import { SysUI, trashSVG } from './ui.js';
import { user, sessionToken } from './state.js';

let currentGradeData = null;

// 🔥 دالة مساعدة لمرة واحدة: تقوم بالتحقق من حالة الرد وطرد المستخدم إن لزم الأمر
function checkAuthError(res) {
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('userToken');
        localStorage.removeItem('dahih_token');
        window.location.href = '/index.html'; // توجيه لصفحة الدخول
        return true; // تعني أن هناك خطأ توثيق
    }
    return false; // تعني أن التوثيق سليم
}

export async function fetchStats() {
    try {
        const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token'); 
        const res = await fetch('/api/admin/stats', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        
        if(checkAuthError(res)) return; // 👈 التحقق من الطرد
        
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        
        animateValue("stats-students", parseInt(document.getElementById('stats-students').innerText) || 0, data.studentsCount || 0, 1000);
        animateValue("stats-pending", parseInt(document.getElementById('stats-pending').innerText) || 0, data.pendingCount || 0, 1000);
    } catch (err) {
        console.error("fetchStats Error:", err);
    }
}

export function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) { window.requestAnimationFrame(step); }
    };
    window.requestAnimationFrame(step);
}

export async function fetchPendingRequests() {
    const container = document.getElementById('pendingRequestsContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 animate-pulse">جاري جلب الطلبات الأساسية...</p>';
    try {
        const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
        const res = await fetch('/api/admin/pending', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken })
        });
        
        if(checkAuthError(res)) return; // 👈 التحقق من الطرد
        
        if (!res.ok) throw new Error("Network response was not ok");
        const students = await res.json();
        if (students.length === 0) { 
            container.innerHTML = '<p class="text-gray-500 text-center mt-10 transition-opacity duration-500 opacity-0" id="emptyReqMsg">لا توجد طلبات جديدة حالياً.</p>'; 
            setTimeout(() => document.getElementById('emptyReqMsg').style.opacity = '1', 50);
            return; 
        }
        
        let html = '';
        students.forEach((st, index) => {
            const fullName = `${st.first_name} ${st.second_name} ${st.third_name} ${st.last_name}`;
            html += `<div id="req-${st.email}" class="glass-panel border border-white/5 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.08}s;">
                <div class="text-center md:text-right">
                    <h4 class="font-bold text-white">${fullName}</h4>
                    <p class="text-xs text-gray-400 mt-1">${st.email} | ${st.grade}</p>
                </div>
                <div class="flex gap-2 w-full md:w-auto">
                    <button onclick="updateStudentStatus('${st.email}', 'accepted', '', this)" class="w-full md:w-auto bg-green-500/10 text-green-400 px-4 py-2.5 md:py-2 rounded-lg text-sm font-bold hover:bg-green-500/20 transition-all active:scale-95">قبول</button>
                    <button onclick="rejectStudent('${st.email}', this)" class="w-full md:w-auto bg-red-500/10 text-red-400 px-4 py-2.5 md:py-2 rounded-lg text-sm font-bold hover:bg-red-500/20 transition-all active:scale-95">رفض</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) { 
        container.innerHTML = '<p class="text-red-500 text-center">خطأ أساسي في الاتصال.</p>'; 
        SysUI.toast('error', 'خطأ أساسي في الاتصال.');
    }
}

export async function updateStudentStatus(email, newStatus, reason = '', btnElement = null) {
    if(btnElement) {
        const row = btnElement.closest('.glass-panel');
        row.style.transition = "all 0.4s ease";
        row.style.opacity = "0";
        row.style.transform = "translateX(20px)";
    }
    
    try {
        const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
        const res = await fetch('/api/admin/update-status', { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }, 
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, studentEmail: email, newStatus, reason }) 
        });
        
        if(checkAuthError(res)) return; // 👈 التحقق من الطرد
        
        if(res.ok) {
            SysUI.toast('success', newStatus === 'accepted' ? 'تم قبول الطالب بنجاح' : 'تم رفض الطالب');
            if(newStatus === 'accepted') SysUI.confetti();
        }
    } catch(e) {
        SysUI.toast('error', 'حدث خطأ أثناء تحديث الحالة');
    }
    
    setTimeout(() => {
        fetchPendingRequests(); 
        fetchStats();
    }, btnElement ? 300 : 0);
}

export function rejectStudent(email, btnElement) { 
    SysUI.prompt("سبب الرفض الأساسي (يظهر للطالب):", (reason) => {
        if (reason !== null) {
            updateStudentStatus(email, 'rejected', reason, btnElement); 
        }
    });
}

export async function fetchStudentsByGrade() {
    const grade = document.getElementById('listGradeSelect').value;
    const container = document.getElementById('studentsListContainer');
    container.innerHTML = '<p class="text-gray-500 text-center py-10 col-span-full animate-pulse">جاري تحميل قائمة الطلاب...</p>';
    try {
        const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
        const res = await fetch('/api/admin/students-by-grade', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        
        if(checkAuthError(res)) return; // 👈 التحقق من الطرد
        
        if (!res.ok) throw new Error("Network response was not ok");
        const students = await res.json();
        if (students.length === 0) { 
            container.innerHTML = `<p class="text-gray-500 text-center py-10 col-span-full opacity-0 transition-opacity duration-500" id="emptyStMsg">لا يوجد طلاب مقبولين في هذه الدفعة.</p>`; 
            setTimeout(() => document.getElementById('emptyStMsg').style.opacity = '1', 50);
            return; 
        }
        let html = '';
        students.forEach((st, index) => {
            const fullName = `${st.first_name || ''} ${st.second_name || ''} ${st.third_name || ''} ${st.last_name || ''}`;
            html += `<div class="bg-black/40 border border-white/5 rounded-xl p-4 flex justify-between items-center hover:border-yellow-500/30 transition-all animate-fade-in-up hover:-translate-y-1 hover:shadow-[0_4px_15px_rgba(234,179,8,0.1)]" style="animation-fill-mode: both; animation-delay: ${index * 0.05}s;">
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
    } catch (err) { 
        container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ في الاتصال.</p>'; 
        SysUI.toast('error', 'حدث خطأ في تحميل قائمة الطلاب.');
    }
}

export async function fetchGradeContent() {
    const grade = document.getElementById('manageGradeSelect').value;
    const container = document.getElementById('manageContainer');
    const loading = document.getElementById('manageLoading');
    
    container.style.opacity = '0';
    setTimeout(() => container.classList.add('hidden'), 300);
    loading.classList.remove('hidden');
    
    try {
        const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
        const res = await fetch('/api/admin/get-grade-content', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade: grade })
        });
        
        if(checkAuthError(res)) return; // 👈 التحقق من الطرد
        
        if (res.ok) {
            currentGradeData = await res.json();
            renderManageContent(grade);
            loading.classList.add('hidden');
            container.classList.remove('hidden');
            setTimeout(() => container.style.opacity = '1', 50);
        } else {
            SysUI.toast('error', "حدث خطأ في جلب المحتوى.");
            loading.classList.add('hidden');
        }
    } catch (err) { 
        SysUI.toast('error', "مشكلة في الاتصال."); 
        loading.classList.add('hidden');
    }
}

export function renderManageContent(grade) {
    const data = currentGradeData;
    
    let htmlPubQZ = '';
    if (data.publicQuizzes && data.publicQuizzes.length > 0) {
        data.publicQuizzes.forEach((q, index) => {
            htmlPubQZ += `<div id="pubQz-${q.id}" class="bg-yellow-900/10 border border-yellow-500/20 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 group animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.06}s;">
                <div class="truncate w-full sm:w-auto"><p class="font-bold text-white text-base md:text-lg truncate">${q.title}</p><p class="text-xs text-yellow-300 mt-1">الردود: ${q.results ? q.results.length : 0} | عام (برابط)</p></div>
                <div class="flex gap-4 items-center shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                    <button onclick="showDetailedResults('${q.id}', true)" class="bg-yellow-600/20 text-yellow-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-600 hover:text-black transition-all active:scale-95 w-full sm:w-auto">النتائج</button>
                    <div onclick="deleteContent('${grade}', 'publicQuiz', '${q.id}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlPubQZ = '<p class="text-gray-500 text-sm py-4">لا توجد اختبارات عامة حالياً.</p>';
    document.getElementById('managePublicQuizzes').innerHTML = htmlPubQZ;

    let htmlQZ = '';
    if (data.quizzes && data.quizzes.length > 0) {
        data.quizzes.forEach((q, index) => {
            htmlQZ += `<div id="qz-${q.id}" class="bg-black/30 border border-white/5 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 group animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.06}s;">
                <div class="truncate w-full sm:w-auto"><p class="font-bold text-white text-base md:text-lg truncate">${q.title}</p><p class="text-xs text-gray-500 mt-1">المجيبين: ${q.results ? q.results.length : 0}</p></div>
                <div class="flex gap-4 items-center shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                    <button onclick="showDetailedResults('${q.id}', false)" class="bg-white/10 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-black transition-all active:scale-95 w-full sm:w-auto">عرض النتائج</button>
                    <div onclick="deleteContent('${grade}', 'quiz', '${q.id}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div>
                </div>
            </div>`;
        });
    } else htmlQZ = '<p class="text-gray-500 text-sm py-4">لا توجد اختبارات منصة أساسية حالياً.</p>';
    document.getElementById('manageQuizzes').innerHTML = htmlQZ;

    let htmlTS = '';
    if (data.tests && data.tests.length > 0) {
        data.tests.forEach((t, index) => {
            htmlTS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.04}s;"><p class="font-bold text-white truncate">${t.testName}</p><div onclick="deleteContent('${grade}', 'test', '${t.testName}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div></div>`;
        });
    } else htmlTS = '<p class="text-gray-500 text-sm py-2">لا توجد سجلات أساسية.</p>';
    document.getElementById('manageTests').innerHTML = htmlTS;

    let htmlQS = '';
    if (data.questions && data.questions.length > 0) {
        data.questions.forEach((q, index) => {
            htmlQS += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4 animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.04}s;"><p class="text-white text-sm truncate">${q.question}</p><div onclick="deleteContent('${grade}', 'question', '${q.question}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div></div>`;
        });
    } else htmlQS = '<p class="text-gray-500 text-sm py-2">لا توجد أسئلة مقالية أساسية.</p>';
    document.getElementById('manageQuestions').innerHTML = htmlQS;

    let htmlPT = '';
    if (data.points && data.points.length > 0) {
        data.points.forEach((p, index) => {
            htmlPT += `<div class="bg-black/30 border border-white/5 p-4 rounded-xl flex justify-between items-center gap-4 animate-fade-in-up" style="animation-fill-mode: both; animation-delay: ${index * 0.04}s;"><p class="text-gray-300 text-sm truncate">${p}</p><div onclick="deleteContent('${grade}', 'point', '${p}', this)" class="trash-icon text-gray-500 hover:text-red-500 transition-colors cursor-pointer p-2">${trashSVG}</div></div>`;
        });
    } else htmlPT = '<p class="text-gray-500 text-sm py-2">لا توجد نقاط أساسية.</p>';
    document.getElementById('managePoints').innerHTML = htmlPT;
}

export function deleteContent(grade, itemType, identifier, trashIconElement = null) {
    SysUI.confirm("هل أنت متأكد من حذف هذا العنصر الأساسي نهائياً؟", async (confirmed) => {
        if(!confirmed) return;
        
        if(trashIconElement) {
            const row = trashIconElement.closest('div.flex.justify-between.items-center');
            if(row) {
                row.style.transition = "all 0.4s ease";
                row.style.opacity = "0";
                row.style.transform = "scale(0.95)";
            }
        }

        try {
            const token = localStorage.getItem('userToken') || localStorage.getItem('dahih_token');
            const res = await fetch('/api/admin/delete-item', {
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role: user.role, sessionToken: sessionToken, grade, itemType, identifier })
            });
            
            if(checkAuthError(res)) return; // 👈 التحقق من الطرد

            if (res.ok) {
                SysUI.toast('success', "تم الحذف بنجاح");
                setTimeout(() => fetchGradeContent(), trashIconElement ? 400 : 0);
            } else {
                SysUI.toast('error', "خطأ أساسي في الحذف.");
                if(trashIconElement) fetchGradeContent(); 
            }
        } catch (err) { 
            SysUI.toast('error', "مشكلة في اتصال قاعدة البيانات."); 
            if(trashIconElement) fetchGradeContent();
        }
    });
}

export function showDetailedResults(quizId, isPublic) {
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
            <div class="bg-black/40 rounded-xl border ${borderColor} mb-3 overflow-hidden animate-fade-in-up transition-all hover:bg-black/60" style="animation-fill-mode: both; animation-delay: ${index * 0.05}s;">
                <div class="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer hover:bg-white/5 transition-colors gap-4" onclick="toggleStudentDetails('detail-${index}')">
                    <div class="flex items-center gap-4 w-full sm:w-auto truncate">
                        <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-white shrink-0 shadow-inner">${index + 1}</div>
                        <div class="truncate">
                            <p class="font-bold text-white text-sm md:text-base truncate">${res.studentName || 'طالب غير معروف'}</p>
                            <p class="text-xs text-gray-500 mt-1 truncate">${res.email || ''} ${res.visitorId ? ' | <span class="text-yellow-500" title="بصمة الجهاز">تم التحقق</span>' : ''}</p>
                        </div>
                    </div>
                    <div class="text-left flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto shrink-0 border-t border-white/5 sm:border-none pt-2 sm:pt-0">
                        <div class="text-center">
                            <p class="font-black text-xl md:text-2xl ${color}">${res.percentage || 0}%</p>
                            <p class="text-[10px] text-gray-400">${res.score} / ${quiz.questions.length}</p>
                        </div>
                        <svg class="w-5 h-5 text-gray-500 transition-transform duration-300" id="icon-detail-${index}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                
                <div id="detail-${index}" class="student-details bg-black/60 px-3 sm:px-5 pb-5 max-h-0 overflow-hidden transition-all duration-500 ease-in-out opacity-0">
                    <h4 class="text-white font-bold text-sm mb-4 border-b border-white/10 pb-2 mt-2">مراجعة الإجابات:</h4>
                    <div class="space-y-4">`;

            if (res.userAnswers && res.userAnswers.length > 0) {
                quiz.questions.forEach((q, qIdx) => {
                    const sAns = res.userAnswers[qIdx];
                    const cAns = q.correctAnswer;
                    const isCorrect = sAns === cAns;
                    
                    html += `
                        <div class="bg-black/50 p-3 sm:p-4 rounded-xl border ${isCorrect ? 'border-green-500/20' : 'border-red-500/20'} transition-all hover:scale-[1.01]">
                            <p class="text-sm font-semibold text-gray-200 mb-3 leading-relaxed">${qIdx + 1}. ${q.questionText}</p>
                            <div class="space-y-2 text-xs md:text-sm">`;
                    
                    q.options.forEach((opt, optIdx) => {
                        let optStyle = "text-gray-500 transition-colors";
                        let optIcon = "○";
                        
                        if (optIdx === sAns && !isCorrect) {
                            optStyle = "text-red-400 font-bold bg-red-500/10 px-2 py-1.5 rounded border border-red-500/20";
                            optIcon = "❌";
                        } else if (optIdx === cAns) {
                            optStyle = "text-green-400 font-bold bg-green-500/10 px-2 py-1.5 rounded border border-green-500/20";
                            optIcon = "✅";
                        } else if (optIdx === sAns && isCorrect) {
                            optStyle = "text-green-400 font-bold bg-green-500/10 px-2 py-1.5 rounded border border-green-500/20";
                            optIcon = "✅ (إجابة الطالب)";
                        }

                        html += `<div class="${optStyle} flex items-center gap-2"><span class="w-5 flex-shrink-0 text-center text-base">${optIcon}</span> <span class="leading-relaxed break-words">${opt}</span></div>`;
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
    
    const modal = document.getElementById('resultsModal');
    modal.classList.remove('hidden');
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '1';
    }, 10);
}

export function toggleStudentDetails(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if(el) {
        if (el.style.maxHeight && el.style.maxHeight !== "0px") {
            el.style.maxHeight = "0px";
            el.style.opacity = "0";
            icon.style.transform = "rotate(0deg)";
        } else {
            el.style.maxHeight = el.scrollHeight + 100 + "px"; 
            el.style.opacity = "1";
            icon.style.transform = "rotate(180deg)";
        }
    }
}

export function closeResultsModal() { 
    const modal = document.getElementById('resultsModal');
    modal.style.opacity = '0';
    setTimeout(() => modal.classList.add('hidden'), 300);
}

export function logout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('dahih_token');
    window.location.href = '/index.html'; 
}

// تأكيد ربط الدوال بالنطاق العام (Global Scope)
if (typeof window !== 'undefined') {
    window.fetchStats = fetchStats;
    window.fetchPendingRequests = fetchPendingRequests;
    window.updateStudentStatus = updateStudentStatus;
    window.rejectStudent = rejectStudent;
    window.fetchStudentsByGrade = fetchStudentsByGrade;
    window.fetchGradeContent = fetchGradeContent;
    window.deleteContent = deleteContent;
    window.showDetailedResults = showDetailedResults;
    window.toggleStudentDetails = toggleStudentDetails;
    window.closeResultsModal = closeResultsModal;
    window.logout = logout;
}
