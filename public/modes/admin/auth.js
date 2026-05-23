// ==========================================
// 🚪 [MODULE] LOGOUT
// ==========================================
import { Security } from './security.js';

export function logout() { 
    Security.forceLogout(); 
}

