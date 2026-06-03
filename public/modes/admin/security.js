import { sessionToken } from '../state.js';

export const Security = (() => {
    const escapeMap = new Map([
        ['&', '&amp;'],
        ['<', '&lt;'],
        ['>', '&gt;'],
        ['"', '&quot;'],
        ["'", '&#039;']
    ]);
    
    const escapeRegex = /[&<>"']/g;
    
    const _escape = (str) => {
        if (str == null) return '';
        return String(str).replace(escapeRegex, (m) => escapeMap.get(m));
    };

    // القائمة البيضاء للدوال المسموح بتشغيلها من الـ HTML (متطابقة مع النطاق العام)
    const trustedHandlers = new Set([
        'fetchstats', 
        'fetchpendingrequests', 
        'updatestudentstatus', 
        'rejectstudent',
        'fetchstudentsbygrade', 
        'fetchgradecontent', 
        'rendermanagecontent', 
        'deletecontent',
        'viewresults', 
        'logout',
        // دوال الاختبارات (Quiz)
        'uploadresultsforquiz', 
        'closeuploadresultsmodal', 
        'submituploadresults', 
        'adduploadresultrow'
    ]);

    const _sanitizeNode = (node) => {
        if (node.nodeType === 1) {
            const attrs = node.attributes;
            let i = attrs.length;
            while (i--) {
                const attr = attrs[i];
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                
                if (name.startsWith('on')) {
                    // التحقق مما إذا كان الحدث يستدعي دالة من القائمة الموثوقة
                    let isTrusted = false;
                    for (const fn of trustedHandlers) {
                        if (value.startsWith(fn)) {
                            isTrusted = true;
                            break;
                        }
                    }
                    if (!isTrusted) {
                        node.removeAttribute(attr.name); // إزالة المعالجات غير المعروفة
                    }
                } else if (value.startsWith('javascript:')) {
                    node.removeAttribute(attr.name);
                }
            }
        }
        let child = node.firstChild;
        while (child) {
            _sanitizeNode(child);
            child = child.nextSibling;
        }
    };

    const _fields = new Set(['first_name', 'second_name', 'third_name', 'last_name', 'email', 'grade', 'phone', 'title', 'question', 'testName', 'studentName']);

    return Object.freeze({
        e: _escape,
        
        safeFile: (name) => _escape(name).replace(/[^\w\u0600-\u06FF-]/g, '_'),
        
        safeCSV: (val) => {
            const str = String(val).replace(/"/g, '""');
            return /^[=+\-@\t\r]/.test(str) ? `"'${str}"` : `"${str}"`;
        },
        
        sanitizeStudent: (st) => {
            if (!st || typeof st !== 'object') return { _raw: st };
            const s = { _raw: st };
            for (const k of _fields) {
                s[k] = _escape(st[k] ?? '');
            }
            return s;
        },
        
        cleanDOM: (templateElement) => {
            if (!(templateElement instanceof HTMLTemplateElement)) return templateElement;
            const content = templateElement.content;
            const suspiciousElements = content.querySelectorAll('script, iframe, object, embed, applet, meta, base');
            let i = suspiciousElements.length;
            while (i--) suspiciousElements[i].remove();
            
            let child = content.firstChild;
            while (child) {
                _sanitizeNode(child);
                child = child.nextSibling;
            }
            return templateElement;
        },
        
        hashId: (str) => {
            let h = 5381;
            let i = str.length;
            while (i--) h = (h * 33) ^ str.charCodeAt(i);
            return 'q_' + (h >>> 0).toString(16);
        },
        
        getToken: () => localStorage.getItem('userToken') || localStorage.getItem('dahih_token') || '',
        
        buildHeaders: function(isPublic = false) {
            const headers = new Headers({
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            });
            
            if (!isPublic) {
                const token = this.getToken();
                if (token) headers.set('Authorization', `Bearer ${token}`);
            }
            return headers;
        },
        
        buildBody: (extra = {}) => JSON.stringify({ sessionToken, ...extra }),
        
        checkAuthError: function(res) {
            if (res.status === 401 || res.status === 403) {
                this.forceLogout();
                return true;
            }
            return false;
        },
        
        forceLogout: () => {
            localStorage.removeItem('userToken');
            localStorage.removeItem('dahih_token');
            sessionStorage.clear();
            window.location.replace('/index.html');
        }
    });
})();
