// ==================== 3. الأساسيات والتهيئة والمصادقة ====================
export const userDataStr = localStorage.getItem('dahih_user');
export let user = null;
export let sessionToken = null;

if (!userDataStr) {
    window.location.href = "/logina.html";
} else {
    user = JSON.parse(userDataStr);
    sessionToken = user.token || localStorage.getItem('dahih_token') || ""; 
    if (user.role !== 'dev' && user.role !== 'owner') {
        window.location.href = "/dashboard.html";
    } else {
        const adminNameEl = document.getElementById('adminWelcomeName');
        if (adminNameEl) {
            adminNameEl.innerText = user.name || "إدارة";
            adminNameEl.classList.add('animate-pulse');
            setTimeout(() => adminNameEl.classList.remove('animate-pulse'), 2000);
        }
    }
}

export function logout() { 
    document.body.style.transition = "opacity 0.5s ease";
    document.body.style.opacity = "0";
    setTimeout(() => {
        localStorage.removeItem('dahih_user'); 
        localStorage.removeItem('dahih_token'); 
        window.location.href = "/logina.html"; 
    }, 400);
}
// جعل دالة الخروج عامة لاستدعائها من HTML
window.logout = logout;
