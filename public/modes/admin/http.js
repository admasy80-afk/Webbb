// ==========================================
// 🌐 [NETWORK] HTTP CLIENT
// ==========================================
import { CONFIG } from './config.js';
import { Security } from './security.js';
import { State } from './store.js';
import { Logger } from './logger.js';

export const Http = (() => {
    const _delay = ms => new Promise(res => setTimeout(res, ms));
    const _activeRequests = new Map();

    return {
        async post(endpoint, body = {}, loadingKey = null, retries = CONFIG.MAX_RETRIES) {
            const dedupKey = endpoint + JSON.stringify(body);
            if (_activeRequests.has(dedupKey)) return _activeRequests.get(dedupKey);

            let abortCtrl, reqId;
            if (loadingKey) {
                if (State.isLoading(loadingKey)) State.abort(loadingKey); 
                State.setLoading(loadingKey, true);
                abortCtrl = State.abort(loadingKey);
                reqId = State.generateReqId(loadingKey);
            } else {
                abortCtrl = new AbortController();
            }

            const execute = async () => {
                for (let i = 0; i <= retries; i++) {
                    try {
                        const timeoutId = setTimeout(() => abortCtrl.abort(), CONFIG.FETCH_TIMEOUT);
                        const res = await fetch(endpoint, {
                            method: 'POST',
                            headers: Security.buildHeaders(),
                            body: Security.buildBody(body),
                            signal: abortCtrl.signal,
                        });
                        clearTimeout(timeoutId);

                        if (Security.checkAuthError(res)) return null;
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        if (loadingKey && !State.isReqValid(loadingKey, reqId)) return null; 
                        return res;

                    } catch (err) {
                        if (abortCtrl.signal.aborted) return null; 
                        if (i === retries) { Logger.error(`Fetch Fail: ${endpoint}`, err); return null; }
                        await _delay(Math.pow(2, i) * 500);
                    } finally {
                        if (i === retries && loadingKey) State.setLoading(loadingKey, false);
                    }
                }
            };

            const promise = execute();
            _activeRequests.set(dedupKey, promise);
            promise.finally(() => _activeRequests.delete(dedupKey));
            return promise;
        },
        async postJSON(endpoint, body = {}, loadingKey = null) {
            const res = await this.post(endpoint, body, loadingKey);
            if (!res) return null;
            try { return await res.json(); } catch (e) { return null; }
        },
    };
})();

