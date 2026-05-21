import { SysUI } from './ui.js';
import { sessionToken } from './state.js';

function escapeHTML(str = '') {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ✅ تم التصليح: تحديث أسماء التوكن لتطابق صفحة الدخول تماماً
function getValidToken() {
    return localStorage.getItem('userToken') || localStorage.getItem('dahih_token') || sessionToken;
}

// حماية السيرفر لو المستخدم قفل الصفحة فجأة والرفع شغال
window.addEventListener('beforeunload', () => {
    if (VideoSystem.currentXHR) {
        VideoSystem.currentXHR.abort();
    }
});

export const VideoSystem = {

    currentXHR: null,

    init() {
        const uploadForm = document.getElementById('uploadVideoForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        }

        const coursesList = document.getElementById('coursesList');
        if (coursesList) {
            coursesList.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.delete-course-btn');
                if (!deleteBtn) return;
                this.deleteCourse(deleteBtn.dataset.id);
            });

            this.loadCourses();
        }

        window.loadCourses = (page) => this.loadCourses(page);
    },

    async handleUpload(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('videoSubmitBtn');
        // حماية ضد الضغطات السريعة (Double Click)
        if (submitBtn?.disabled || this.currentXHR) {
            return SysUI.toast('error', 'يوجد رفع جارٍ بالفعل');
        }

        const token = getValidToken();
        if (!token) {
            return SysUI.toast('error', 'انتهت الجلسة، يرجى تسجيل الدخول بحساب الإدارة');
        }

        const uploadForm = document.getElementById('uploadVideoForm');
        const fileInput = document.getElementById('videoFile');
        const courseNameInput = document.getElementById('courseName');
        const gradeInput = document.getElementById('videoGrade');
        const descriptionInput = document.getElementById('videoDescription');

        const file = fileInput?.files?.[0];
        if (!file) {
            return SysUI.toast('error', 'يرجى اختيار ملف الفيديو');
        }

        const MAX_SIZE = 2 * 1024 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return SysUI.toast('error', 'حجم الفيديو أكبر من 2GB');
        }

        // ✅ المتصفحات تدعم فقط MP4 (H.264/AAC) و WebM (VP8/VP9/Opus) بشكل أصلي.
        // أي صيغة أخرى مثل MKV/MOV/AVI أو MP4 بترميز HEVC تجعل الصوت يشتغل بدون صورة.
        const allowedExtensions = ['mp4', 'webm'];
        const extension = file.name.split('.').pop().toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            return SysUI.toast(
                'error',
                'صيغة غير مدعومة. ارفع MP4 (H.264 + AAC) أو WebM فقط — أي صيغة أخرى تشغّل الصوت بدون فيديو.'
            );
        }

        // اختبار قابلية التشغيل في نفس متصفح الرافع قبل الإرسال للسيرفر
        try {
            const probe = document.createElement('video');
            const canPlay = probe.canPlayType(file.type || (extension === 'webm' ? 'video/webm' : 'video/mp4'));
            if (canPlay === '') {
                return SysUI.toast(
                    'error',
                    'هذا الملف غير قابل للتشغيل في المتصفح (غالباً ترميز HEVC/H.265). أعد ضغطه بترميز H.264.'
                );
            }
        } catch (_) { /* تجاهل */ }

        const courseName = courseNameInput.value.trim();
        const grade = gradeInput.value.trim();
        const description = descriptionInput.value.trim();

        if (!courseName || !grade) {
            return SysUI.toast('error', 'يرجى تعبئة جميع الحقول المطلوبة');
        }

        // ✅ تم التصليح: ترتيب عناصر الـ FormData (النصوص أولاً ثم ملف الفيديو في الآخر خالص)
        const formData = new FormData();
        formData.append('courseName', courseName);
        formData.append('grade', grade);
        formData.append('description', description);
        formData.append('videoFile', file); // الملف آخر حاجة عشان السيرفر يقرا البيانات قبله

        const progressContainer = document.getElementById('videoProgressContainer');
        const progressBar = document.getElementById('videoProgressBar');
        const progressText = document.getElementById('videoProgressText');

        progressContainer?.classList.remove('hidden');

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ جاري الرفع والمعالجة السحابية...';
        }

        const xhr = new XMLHttpRequest();
        this.currentXHR = xhr;

        xhr.open('POST', '/api/admin/upload-course', true);
        xhr.timeout = 1000 * 60 * 60; // ساعة كحد أقصى للرفع
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) {
                const uploadedMB = (event.loaded / 1024 / 1024).toFixed(1);
                const totalMB = (event.total / 1024 / 1024).toFixed(1);
                progressText.innerText = `${percent}% • ${uploadedMB}MB / ${totalMB}MB`;
            }
        };

        xhr.onabort = () => {
            this.currentXHR = null;
            this.resetUploadUI();
            SysUI.toast('error', 'تم إلغاء عملية الرفع');
        };

        xhr.onload = async () => {
            this.currentXHR = null;
            this.resetUploadUI();
            try {
                const response = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    SysUI.toast('success', '✅ تم رفع ونشر الكورس بنجاح');
                    uploadForm?.reset();
                    await this.loadCourses();
                } else {
                    SysUI.toast('error', response.message || 'فشل رفع الفيديو');
                }
            } catch (err) {
                SysUI.toast('error', 'حدث خطأ أثناء معالجة استجابة السيرفر');
            }
        };

        xhr.onerror = () => {
            this.currentXHR = null;
            this.resetUploadUI();
            SysUI.toast('error', 'فشل الاتصال بالسيرفر');
        };

        xhr.ontimeout = () => {
            this.currentXHR = null;
            this.resetUploadUI();
            SysUI.toast('error', 'انتهى وقت الرفع، تحقق من الشبكة');
        };

        xhr.send(formData);
    },

    resetUploadUI() {
        const progressContainer = document.getElementById('videoProgressContainer');
        const submitBtn = document.getElementById('videoSubmitBtn');
        if (progressContainer) progressContainer.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🚀 ابدأ الرفع والمعالجة السحابية';
        }
    },

    async loadCourses(page = 1) {
        const token = getValidToken();
        const container = document.getElementById('coursesList');
        if (!container) return;

        if (!token) {
            container.innerHTML = `<div class="text-center py-10 text-red-400">انتهت الجلسة، يرجى تسجيل الدخول بحساب الإدارة لرؤية الأرشيف.</div>`;
            return;
        }

        try {
            container.innerHTML = `<div class="text-center py-10 text-gray-400 animate-pulse">جاري تحميل الكورسات المأرشفة...</div>`;

            const res = await fetch(`/api/admin/get-all-courses?page=${page}&limit=20`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to load courses');

            const data = await res.json();
            const courses = data.courses || [];

            if (!courses.length) {
                container.innerHTML = `<div class="text-center py-10 text-gray-500">لا توجد كورسات مرفوعة حالياً</div>`;
                return;
            }

            container.innerHTML = courses.map(c => {
                const courseName = escapeHTML(c.courseName);
                const grade = escapeHTML(c.grade);
                const description = escapeHTML(c.description || 'لا يوجد وصف');

                return `
                    <div class="bg-black/40 border border-white/5 rounded-2xl p-5 flex items-start justify-between gap-4 hover:border-yellow-500/30 transition-all duration-300">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-white font-bold text-lg truncate">${courseName}</h3>
                            <p class="text-yellow-500 text-xs mt-1 font-bold">📌 ${grade}</p>
                            <p class="text-gray-400 text-sm mt-3 leading-6 break-words">${description}</p>
                        </div>
                        <button class="delete-course-btn bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white px-4 py-2 rounded-xl transition-all duration-300 text-sm shrink-0" data-id="${c.id}">حذف</button>
                    </div>
                `;
            }).join('');

        } catch (err) {
            console.error(err);
            container.innerHTML = `<div class="text-center py-10 text-red-400">فشل تحميل الكورسات المأرشفة</div>`;
        }
    },

    async deleteCourse(courseId) {
        const confirmed = confirm('هل أنت متأكد من حذف الكورس نهائياً؟');
        if (!confirmed) return;

        const token = getValidToken();

        try {
            const res = await fetch(`/api/admin/delete-course/${courseId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            SysUI.toast('success', 'تم حذف الكورس بنجاح');
            await this.loadCourses();

        } catch (err) {
            SysUI.toast('error', err.message || 'فشل حذف الكورس');
        }
    }
};

