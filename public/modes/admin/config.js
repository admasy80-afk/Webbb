// ==========================================
// ⚙️ [CORE] SYSTEM CONSTANTS & ADAPTIVE CONFIG
// ==========================================
export const API = Object.freeze({
    STATS:           '/api/admin/stats',
    PENDING:         '/api/admin/pending',
    STUDENTS_GRADE:  '/api/admin/students-by-grade',
    GRADE_CONTENT:   '/api/admin/get-grade-content',
    UPDATE_STATUS:   '/api/admin/update-status',
    DELETE_ITEM:     '/api/admin/delete-item',
    UPDATE_POINTS:   '/api/admin/update-points',
    SAVE_TEST:       '/api/admin/save-test',
    SAVE_CONTENT:    '/api/admin/save-content',
    SAVE_QUIZ:       '/api/admin/save-quiz',
    SAVE_PUB_QUIZ:   '/api/admin/save-public-quiz'
});

export const STATUS    = Object.freeze({ ACCEPTED: 'accepted', REJECTED: 'rejected', PENDING: 'pending' });
export const ITEM_TYPE = Object.freeze({ PUBLIC_QUIZ: 'publicQuiz', QUIZ: 'quiz', TEST: 'test', QUESTION: 'question', POINT: 'point' });
export const THRESHOLD = Object.freeze({ HIGH: 85, PASS: 50 });

export const _cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
export const CONFIG = Object.freeze({ 
    FETCH_TIMEOUT: 15000, 
    MAX_RETRIES: 3, 
    RENDER_CHUNK_SIZE: Math.max(15, _cores * 8), 
    CACHE_TTL_MS: 300000 
});
