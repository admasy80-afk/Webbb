// ==========================================
// 🍞 [UI] TOAST & EVENTS
// ==========================================
import { SysUI } from '../ui.js';

export const Toast = {
    success: (msg) => typeof SysUI !== 'undefined' && SysUI.toast('success', msg),
    error:   (msg) => typeof SysUI !== 'undefined' && SysUI.toast('error', msg),
    warning: (msg) => typeof SysUI !== 'undefined' && SysUI.toast('warning', msg),
    info:    (msg) => typeof SysUI !== 'undefined' && SysUI.toast('info', msg),
};

export const EventBus = (() => {
    const _listeners = new Map();
    const _batchTimers = new Map();
    return {
        on(event, fn)  { if (!_listeners.has(event)) _listeners.set(event, new Set()); _listeners.get(event).add(fn); },
        emit(event, payload, batchMs = 0) {
            if (batchMs > 0) {
                clearTimeout(_batchTimers.get(event));
                _batchTimers.set(event, setTimeout(() => this._execute(event, payload), batchMs));
            } else { this._execute(event, payload); }
        },
        _execute(event, payload) { _listeners.get(event)?.forEach(fn => { try { fn(payload); } catch(e) {} }); }
    };
})();

