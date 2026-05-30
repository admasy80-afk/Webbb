// ==========================================
// 🚪 [MODULE] LOGOUT
// ==========================================
import { Security } from './security.js';

export function logout() { 
    Security.forceLogout(); 
}

// إتاحة الدوال لعناصر HTML (onclick) فوراً عند تحميل الموديول
if (typeof window !== 'undefined') {
    window.logout = logout;
}

