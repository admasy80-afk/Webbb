// ════════════════════════════════════════════
// منصة الدحيح | أدوات المساعدة وإدارة الحالة
// ════════════════════════════════════════════

const state = {
    user: null,
    token: null,
    currentMsgId: null,
    currentPoints: -1,
    coursesHash: '',
    quizzesHash: '',
    pointsHash: '',
    questionsHash: '',
    availableQuizzes: [],
    speedIndex: 0,
    speeds: [1, 1.25, 1.5, 2],
    pollTimer: null,
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

const $ = (id) => document.getElementById(id);

const escapeHTML = (str) => {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const hash = (obj) => {
    try { return JSON.stringify(obj); } catch (e) { return Math.random().toString(); }
};

const formatTime = (t) => {
    if (!isFinite(t)) return '00:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

const haptic = (ms = 30) => {
    if (state.reduceMotion) return;
    if ('vibrate' in navigator) { try { navigator.vibrate(ms); } catch (e) {} }
};

function authGate() {
    const userStr = localStorage.getItem('dahih_user');
    const token = localStorage.getItem('dahih_token');
    if (!userStr || !token) {
        alert("⚠️ المصادقة فشلت: لم يتم العثور على التوكن أو بيانات المستخدم في الـ LocalStorage. سيتم توجيهك لصفحة تسجيل الدخول.");
        window.location.replace('/logina.html');
        return false;
    }
    try {
        state.user = JSON.parse(userStr);
        state.token = token;
        return true;
    } catch (e) {
        alert("🚨 خطأ في قراءة بيانات الجلسة: " + e.message);
        window.location.replace('/logina.html');
        return false;
    }
}

function logout() {
    localStorage.removeItem('dahih_user');
    localStorage.removeItem('dahih_token');
    window.location.replace('/logina.html');
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

