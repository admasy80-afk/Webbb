// ==================== TITAN DASHBOARD ENGINE v9.0 (THE OMNI CORE) ====================
// 🔥 Multi-Threaded CSV | Anti-Tamper Shield | DOM Scheduler | Fully Integrated Forms
// 🚀 Dynamic Quiz Builders | Race-Condition Safe | Auto-Abort HTTP | Zero DOM Leaks

import { API, STATUS, ITEM_TYPE, THRESHOLD } from './admin/config.js';
import { Scheduler } from './admin/scheduler.js';
import { Security } from './admin/security.js';
import { State } from './admin/store.js';
import { Http } from './admin/http.js';
import { Toast, EventBus } from './admin/events.js';
import { Anim } from './admin/anim.js';

import { fetchStats, fetchPendingRequests, updateStudentStatus, rejectStudent } from './admin/dashboard.js';
import { fetchStudentsByGrade } from './admin/students.js';
import { fetchGradeContent, renderManageContent, deleteContent } from './admin/content.js';
import { logout } from './admin/auth.js';
import './admin/quiz.js'; // يقوم تلقائياً بتهيئة الـ FormsEngine وربط الدوال بالنافذة (window)

// ═══════════════════════════════════════════════════════════════════
// 🔗 ربط الأحداث (Event Wiring) لمنع التداخل بين الملفات
// ═══════════════════════════════════════════════════════════════════
EventBus.on('student:updated', () => { 
    fetchPendingRequests(); 
    fetchStats(); 
});

EventBus.on('content:deleted', () => { 
    fetchGradeContent(); 
});

// ═══════════════════════════════════════════════════════════════════
// 🌍 تصدير وتهيئة النطاق العام (Global Bindings)
// ═══════════════════════════════════════════════════════════════════
export { Security, State, Anim, Http, Toast, EventBus, API, STATUS, ITEM_TYPE, THRESHOLD, Scheduler };

if (typeof window !== 'undefined') {
    Object.assign(window, {
        fetchStats, 
        fetchPendingRequests, 
        updateStudentStatus, 
        rejectStudent,
        fetchStudentsByGrade, 
        fetchGradeContent, 
        renderManageContent, 
        deleteContent, 
        logout
    });
}
