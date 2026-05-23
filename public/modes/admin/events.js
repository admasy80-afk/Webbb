// ==========================================
// 🚀 [UI] GOD-TIER TOAST & EVENTBUS (OMEGA)
// ==========================================
import { SysUI } from '../ui.js';

// ------------------------------------------------------------------
// 🍞 Ultra-Light & Native Toast API
// ------------------------------------------------------------------
const createToast = (type) => (msg, options = {}) => {
    if (typeof SysUI !== 'undefined' && SysUI.toast) SysUI.toast(type, msg, options);
    else console.warn(`[Toast Fallback] ${type.toUpperCase()}:`, msg);
};

export const Toast = Object.freeze({
    success: createToast('success'),
    error: createToast('error'),
    warning: createToast('warning'),
    info: createToast('info'),
    custom(type, msg, options = {}) {
        if (typeof SysUI !== 'undefined' && SysUI.toast) SysUI.toast(type, msg, options);
        else console.warn(`[Toast Fallback] ${type.toUpperCase()}:`, msg);
    }
});

// ------------------------------------------------------------------
// ⚡ God-Tier EventBus Runtime Architecture
// ------------------------------------------------------------------
export const EventBus = (() => {
    const _listeners = new Map();
    const _stickyCache = new Map();
    const _timers = new Map();
    const _throttleLocks = new Set();
    const _middlewares = new Set();
    
    // Circular buffer for time-travel debugging and replay
    const _history = [];
    const MAX_HISTORY = 150;

    const _api = {
        /**
         * Global Interceptors / Middleware Pipeline
         * Intercept, mutate, or cancel events before they reach listeners.
         */
        use(middlewareFn) {
            _middlewares.add(middlewareFn);
            return () => _middlewares.delete(middlewareFn);
        },

        /**
         * Subscribe to an event, wildcard '*', or namespace 'auth:*'.
         */
        on(event, fn) {
            if (!_listeners.has(event)) _listeners.set(event, new Set());
            _listeners.get(event).add(fn);
            
            // Replay sticky events immediately for late subscribers
            if (_stickyCache.has(event)) {
                try { fn(_stickyCache.get(event)); } 
                catch(e) { console.error(`[EventBus:Sticky:${event}]`, e); }
            }
            
            return () => _api.off(event, fn);
        },

        off(event, fn) {
            const eventListeners = _listeners.get(event);
            if (eventListeners) {
                eventListeners.delete(fn);
                if (eventListeners.size === 0) _listeners.delete(event);
            }
        },

        once(event, fn) {
            const wrapper = (payload) => {
                try { fn(payload); } 
                finally { _api.off(event, wrapper); } // Guaranteed cleanup
            };
            return _api.on(event, wrapper);
        },

        /**
         * Await the next emission of an event, with optional timeout safety.
         */
        waitFor(event, timeoutMs = 0) {
            return new Promise((resolve, reject) => {
                let timer = null;
                const wrapper = (payload) => {
                    if (timer) clearTimeout(timer);
                    resolve(payload);
                };
                
                const off = _api.once(event, wrapper);

                if (timeoutMs > 0) {
                    timer = setTimeout(() => {
                        off();
                        reject(new Error(`[EventBus] waitFor("${event}") timed out after ${timeoutMs}ms`));
                    }, timeoutMs);
                }
            });
        },

        /**
         * Stream events from one channel to another with optional transformation.
         */
        pipe(sourceEvent, targetEvent, transformFn = payload => payload) {
            return _api.on(sourceEvent, payload => _api.emit(targetEvent, transformFn(payload)));
        },

        /**
         * Supercharged Emit with advanced scheduling strategies.
         * options: { debounce: ms, throttle: ms, sticky: boolean }
         */
        emit(event, payload = null, options = {}) {
            const { debounce = 0, throttle = 0, sticky = false } = options;

            if (sticky) _stickyCache.set(event, payload);

            // Throttle strategy (Drop bursts)
            if (throttle > 0) {
                const lockKey = `${event}_throttle`;
                if (_throttleLocks.has(lockKey)) return;
                _throttleLocks.add(lockKey);
                setTimeout(() => _throttleLocks.delete(lockKey), throttle);
                _api._processEmit(event, payload);
                return;
            }

            // Debounce strategy (Delay until silence)
            if (debounce > 0) {
                clearTimeout(_timers.get(event));
                _timers.set(event, setTimeout(() => _api._processEmit(event, payload), debounce));
            } else {
                // Instant execution
                _api._processEmit(event, payload);
            }
        },

        clearSticky(event) {
            if (event) _stickyCache.delete(event);
            else _stickyCache.clear();
        },

        clear(event = null) {
            if (event) {
                _listeners.delete(event);
                _api.clearSticky(event);
                clearTimeout(_timers.get(event));
                _timers.delete(event);
            } else {
                _listeners.clear();
                _stickyCache.clear();
                _timers.forEach(clearTimeout);
                _timers.clear();
                _middlewares.clear();
                _history.length = 0;
            }
        },

        get history() { 
            return Object.freeze([..._history]); 
        },

        /**
         * Internal pipeline processor handling middlewares & history logging.
         */
        _processEmit(event, payload) {
            // Track history
            if (_history.length >= MAX_HISTORY) _history.shift();
            _history.push({ event, payload, timestamp: performance.now() });

            // Execute middlewares chain recursively
            const middlewares = [..._middlewares];
            let i = 0;
            
            const next = (mutatedPayload = payload) => {
                if (i < middlewares.length) {
                    const mw = middlewares[i++];
                    try { 
                        mw(event, mutatedPayload, next); 
                    } catch(e) { 
                        console.error(`[EventBus:MiddlewareError]`, e); 
                        next(mutatedPayload); // Bypass failing middleware
                    }
                } else {
                    _api._execute(event, mutatedPayload);
                }
            };
            next(payload);
        },

        /**
         * Core execution engine protected from mutation during iteration.
         */
        _execute(event, payload) {
            // 1. Specific Event Listeners (Spread prevents execution mutation bugs)
            const listeners = [...(_listeners.get(event) || [])];
            listeners.forEach(fn => {
                try { fn(payload); } 
                catch(e) { console.error(`[EventBus Error] Event: "${event}"`, e); }
            });

            // 2. Global Wildcard '*' Optimization
            if (event !== '*') {
                const globalListeners = _listeners.get('*');
                if (globalListeners?.size) {
                    [...globalListeners].forEach(fn => {
                        try { fn({ event, payload }); } 
                        catch(e) { console.error(`[EventBus Error] Wildcard "*" on event: "${event}"`, e); }
                    });
                }
            }

            // 3. Namespace Wildcard Engine (e.g., 'auth:login' triggers 'auth:*')
            if (event.includes(':')) {
                const namespace = event.split(':')[0] + ':*';
                const nsListeners = _listeners.get(namespace);
                if (nsListeners?.size) {
                    [...nsListeners].forEach(fn => {
                        try { fn({ event, payload }); } 
                        catch(e) { console.error(`[EventBus Error] Namespace "${namespace}" on event: "${event}"`, e); }
                    });
                }
            }
        }
    };

    return Object.freeze(_api); 
})();
