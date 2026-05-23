// ==========================================
// ✨ [UI] ANIMATION ENGINE 
// ==========================================
import { Scheduler } from './scheduler.js';

export const Anim = (() => {
    const _rafs = new WeakMap(); 
    const _ease = t => 1 - Math.pow(1 - t, 3);
    const _numberCache = new WeakMap();

    const _progressObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                Scheduler.write(() => {
                    e.target.style.width = e.target.dataset.w;
                    _progressObserver.unobserve(e.target);
                });
            }
        });
    }, { threshold: 0.1 }) : null;

    return {
        animateValue(id, endValue, duration = 1200, suffix = '') {
            const obj = document.getElementById(id);
            if (!obj) return;
            const targetVal = parseFloat(String(endValue).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) || 0;
            const startVal  = _numberCache.get(obj) || 0;
            if (startVal === targetVal) return;

            if (_rafs.has(obj)) cancelAnimationFrame(_rafs.get(obj));
            let t0 = null;
            const step = ts => {
                if (!document.body.contains(obj)) { _rafs.delete(obj); return; }
                if (!t0) t0 = ts;
                const p = Math.min((ts - t0) / duration, 1);
                const current = Math.floor(_ease(p) * (targetVal - startVal) + startVal);
                Scheduler.write(() => { obj.textContent = current.toLocaleString('ar-SA') + suffix; });
                if (p < 1) { _rafs.set(obj, requestAnimationFrame(step)); } 
                else { _rafs.delete(obj); _numberCache.set(obj, targetVal); Scheduler.write(() => { obj.textContent = targetVal.toLocaleString('ar-SA') + suffix; }); }
            };
            _rafs.set(obj, requestAnimationFrame(step));
        },
        fadeIn(el, delay = 0) {
            if (!el) return;
            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                const anim = el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 400, delay: delay * 1000, easing: 'ease', fill: 'both' });
                anim.onfinish = () => el.style.willChange = 'auto';
            });
        },
        slideOut(el, mode = 'right') {
            if (!el) return;
            Scheduler.write(() => {
                el.style.willChange = 'opacity, transform';
                el.style.pointerEvents = 'none';
                el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: mode === 'right' ? 'translateX(28px) scale(0.97)' : 'scale(0.94)' }], { duration: 380, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' });
            });
        },
        triggerRipple(btn) {
            if (!btn) return;
            Scheduler.write(() => { btn.classList.remove('__run-ripple'); void btn.offsetWidth; btn.classList.add('__run-ripple'); });
        },
        pulse(el) {
            if (!el) return;
            Scheduler.write(() => {
                el.style.willChange = 'transform';
                const anim = el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 550, easing: 'ease' });
                anim.onfinish = () => el.style.willChange = 'auto';
            });
        },
        staggerFadeIn(container, selector, baseDelay = 0.05) {
            if (!container) return;
            const els = container.querySelectorAll(selector);
            els.forEach((el, i) => this.fadeIn(el, i * baseDelay));
        },
        progressBars(container) {
            if (!container || !_progressObserver) return;
            container.querySelectorAll('[data-w]').forEach(bar => _progressObserver.observe(bar));
        },
    };
})();
