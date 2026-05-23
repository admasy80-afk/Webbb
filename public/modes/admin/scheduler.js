// ==========================================
// 🧠 [CORE] DOM SCHEDULER
// ==========================================
import { Logger } from './logger.js';

export const Scheduler = (() => {
    let _reads = [], _writes = [], _scheduled = false;
    const _run = () => {
        const reads = _reads, writes = _writes;
        _reads = []; _writes = []; _scheduled = false;
        reads.forEach(fn => { try { fn(); } catch (e) { Logger.error('Scheduler Read', e); } });
        writes.forEach(fn => { try { fn(); } catch (e) { Logger.error('Scheduler Write', e); } });
    };
    return {
        read(fn)  { _reads.push(fn);  if (!_scheduled) { _scheduled = true; requestAnimationFrame(_run); } },
        write(fn) { _writes.push(fn); if (!_scheduled) { _scheduled = true; requestAnimationFrame(_run); } },
        yield()   { return new Promise(r => window.requestIdleCallback ? requestIdleCallback(r) : setTimeout(r, 16)); }
    };
})();

