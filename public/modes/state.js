// ==================== 3. الأساسيات والتهيئة والمصادقة ====================
export const userDataStr = localStorage.getItem('dahih_user');
export let user = null;
export let sessionToken = null;

// 1. إصلاح التوجيه (login.html بدلاً من logina.html) والتحقق من القيمة
if (!userDataStr || userDataStr === "undefined") {
    window.location.replace("/login.html");
} else {
    try {
        user = JSON.parse(userDataStr);
        sessionToken = user.token || localStorage.getItem('dahih_token') || ""; 
        
        // 2. التحقق من الصلاحيات وتوجيه غير الأدمن لمسارهم الصحيح
        if (user.role !== 'dev' && user.role !== 'owner') {
            window.location.replace("/student/"); 
        } else {
            // 3. حماية تحديث الـ DOM لحين تحميل الصفحة بالكامل
            document.addEventListener('DOMContentLoaded', () => {
                const adminNameEl = document.getElementById('adminWelcomeName');
                if (adminNameEl) {
                    adminNameEl.innerText = user.name || user.first_name || "مستر";
                    adminNameEl.classList.add('animate-pulse');
                    setTimeout(() => adminNameEl.classList.remove('animate-pulse'), 2000);
                }
            });
        }
    } catch (error) {
        // حماية: إذا كانت البيانات المحفوظة معطوبة، امسحها واطرد المستخدم لتسجيل الدخول
        console.error("بيانات الجلسة معطوبة:", error);
        localStorage.removeItem('dahih_user');
        localStorage.removeItem('dahih_token');
        window.location.replace("/login.html");
    }
}

export function logout() { 
    document.body.style.transition = "opacity 0.5s ease";
    document.body.style.opacity = "0";
    setTimeout(() => {
        localStorage.removeItem('dahih_user'); 
        localStorage.removeItem('dahih_token'); 
        window.location.replace("/login.html"); 
    }, 400);
}

// جعل دالة الخروج عامة لاستدعائها من الـ HTML مباشرة
window.logout = logout;
