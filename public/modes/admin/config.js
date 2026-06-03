// ==========================================
// ⚙️ [CORE] SYSTEM CONSTANTS & ADAPTIVE CONFIG
// ==========================================

export const API = Object.freeze({
    // Admin stats
    STATS: '/api/admin/stats',
    PENDING: '/api/admin/pending',
    STUDENTS_GRADE: '/api/admin/students-by-grade',
    GRADE_CONTENT: '/api/admin/get-grade-content',

    // User management
    UPDATE_STATUS: '/api/admin/update-status',
    UPDATE_POINTS: '/api/admin/update-points',

    // Content management
    DELETE_ITEM: '/api/admin/delete-item',
    SAVE_CONTENT: '/api/admin/add-content',

    // Quiz management
    SAVE_QUIZ: '/api/admin/add-mcq-quiz',
    SAVE_PUB_QUIZ: '/api/admin/add-public-quiz',
    SAVE_TEST: '/api/admin/add-test-results', // النتائج الورقية تُحفظ في مجموعة tests المستقلة

    // Courses
    UPLOAD_COURSE: '/api/admin/upload-course',
    GET_ALL_COURSES: '/api/admin/get-all-courses',
    DELETE_COURSE: '/api/admin/delete-course',

    // Stream
    TOGGLE_STREAM: '/api/admin/toggle-stream',

    // Monitoring
    PROVIDERS_HEALTH: '/api/admin/providers-health'
});

export const STATUS = Object.freeze({
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    PENDING: 'pending'
});

export const ITEM_TYPE = Object.freeze({
    PUBLIC_QUIZ: 'publicQuiz',
    QUIZ: 'quiz',
    QUESTION: 'question',
    POINT: 'point',
    COURSE: 'course',
    CONTENT: 'content'
});

export const THRESHOLD = Object.freeze({
    HIGH: 85,
    PASS: 50
});

export const _cores =
    typeof navigator !== 'undefined'
        ? navigator.hardwareConcurrency || 4
        : 4;

export const CONFIG = Object.freeze({
    FETCH_TIMEOUT: 15000,
    MAX_RETRIES: 3,
    RENDER_CHUNK_SIZE: Math.max(15, _cores * 8),
    CACHE_TTL_MS: 300000
});
