// ==========================================
// 🛡️ [SECURITY] SHIELD & SANITIZER
// ==========================================
import { sessionToken } from '../state.js';

export const Security = (() => {
    const _escape = (str) => {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    const _sanitizeNode = (node) => {
        if (node.nodeType === 1) { 
            const attrs = node.attributes;
            // القائمة البيضاء للدوال الموثوقة (بحروف صغيرة للمطابقة)
            const trustedHandlers = ['viewresults', 'deletecontent', 'updatestudentstatus', 'rejectstudent', 'fetchgradecontent', 'uploadresultsforquiz', 'closeuploadresultsmodal', 'submituploadresults', 'adduploadresultrow'];
            
            for (let i = attrs.length - 1; i >= 0; i--) {
                const attr = attrs[i];
                const attrName = attr.name.toLowerCase();
                const attrValue = attr.value.trim().toLowerCase();
                
                if (attrName.startsWith('on')) {
                    // التحقق مما إذا كان الحدث يستدعي دالة من القائمة الموثوقة
                    const isTrusted = trustedHandlers.some(fn => attrValue.startsWith(fn));
                    if (!isTrusted) {
                        node.removeAttribute(attr.name); // حذف المعالجات غير الموثوقة
                    }
                } else if (attrValue.startsWith('javascript:')) {
                    node.removeAttribute(attr.name); // منع روابط JavaScript XSS
                }
            }
        }
        node.childNodes.forEach(_sanitizeNode);
    };

    const _fields = ['first_name','second_name','third_name','last_name','email','grade','phone','title','question','testName','studentName'];

    return {
        e: _escape,
        safeFile: (name) => _escape(name).replace(/[^\w\u0600-\u06FF-]/g, '_'),
        safeCSV: (val) => {
            let str = String(val).replace(/"/g, '""');
            return /^[=+\-@\t\r]/.test(str) ? `"'${str}"` : `"${str}"`;
        },
        sanitizeStudent(st) {
            const s = { _raw: st };
            _fields.forEach(k => { s[k] = _escape(st?.[k] ?? ''); });
            return s;
        },
        cleanDOM(templateElement) {
            templateElement.content.querySelectorAll('script, iframe, object, embed').forEach(s => s.remove());
            templateElement.content.childNodes.forEach(_sanitizeNode);
            return templateElement;
        },
        hashId(str) {
            let h = 5381;
            for(let i=0; i<str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
            return 'q_' + (h >>> 0).toString(16);
        },
        getToken: () => localStorage.getItem('userToken') || localStorage.getItem('dahih_token') || '',
        
        // 👈 التعديل تم هنا
        buildHeaders(isPublic = false) {
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            };
            
            // إضافة التوكن فقط إذا لم يكن الطلب عاماً
            if (!isPublic) {
                const token = this.getToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
            
            return headers;
        },
        
        buildBody: (extra = {}) => JSON.stringify({ sessionToken, ...extra }),
        checkAuthError(res) {
            if (res.status === 401 || res.status === 403) { this.forceLogout(); return true; }
            return false;
        },
        forceLogout() {
            ['userToken','dahih_token'].forEach(k => localStorage.removeItem(k));
            sessionStorage.clear();
            window.location.replace('/index.html');
        },
    };
})();
