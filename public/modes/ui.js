/**
 * SysUI - Enterprise-Grade Minimal UI System v2.0
 * Architecture: Event-driven, Centralized State, Semantic Tokens.
 * Features: Smart Transitions, Spotlight, AI Cmd, Micro-sounds, HUD, Magnetic UI.
 */

const SysUI = (() => {
    // --- 1. Event Bus System ---
    const Events = (() => {
        const listeners = {};
        return {
            on: (event, callback) => {
                if (!listeners[event]) listeners[event] = [];
                listeners[event].push(callback);
            },
            emit: (event, data) => {
                if (listeners[event]) listeners[event].forEach(cb => cb(data));
            },
            off: (event, callback) => {
                if (!listeners[event]) return;
                listeners[event] = listeners[event].filter(cb => cb !== callback);
            }
        };
    })();

    // --- 2. Action Registry (AI Ready) ---
    const Actions = (() => {
        const registry = new Map();
        return {
            register: (id, actionDef) => {
                registry.set(id, actionDef);
                Events.emit('action:registered', { id, ...actionDef });
            },
            registerBatch: (actions) => actions.forEach(a => Actions.register(a.id, a)),
            execute: (id, payload = null) => {
                const action = registry.get(id);
                if (action && action.handler) {
                    Audio.play('click');
                    action.handler(payload);
                    Events.emit('action:executed', { id, payload });
                }
            },
            getAll: () => Array.from(registry.values())
        };
    })();

    // --- 3. Micro-Sounds (Web Audio API - Zero Assets) ---
    const Audio = (() => {
        let ctx = null;
        const init = () => {
            if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
        };
        
        const playTone = (freq, type, duration, vol, detune = 0) => {
            try {
                init();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                osc.detune.setValueAtTime(detune, ctx.currentTime);
                
                gain.gain.setValueAtTime(vol, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start();
                osc.stop(ctx.currentTime + duration);
            } catch (e) {} // Fallback silently
        };

        return {
            play: (sound) => {
                if (localStorage.getItem('sys_sound') === 'off') return;
                switch (sound) {
                    case 'pop': playTone(800, 'sine', 0.1, 0.1); break; // Toasts
                    case 'click': playTone(1200, 'sine', 0.05, 0.05); break; // Modals/Buttons
                    case 'success': 
                        playTone(600, 'sine', 0.1, 0.1); 
                        setTimeout(() => playTone(900, 'sine', 0.2, 0.1), 100); 
                        break;
                    case 'open': playTone(400, 'sine', 0.1, 0.05, -200); break; // Cmd Palette
                }
            }
        };
    })();

    // --- 4. Layer & State Manager ---
    const Layers = {
        ambient: -1, base: 0, spotlight: 8000, feed: 9000, 
        backdrop: 9998, context: 9999, toast: 10000, modal: 10001, cmd: 10002, hud: 10003
    };

    const State = {
        toasts: new Map(),
        activeOverlays: [],
        cmdState: { query: '', selectedIndex: 0, results: [] },
        previousFocus: null,
        sessionDrafts: JSON.parse(localStorage.getItem('sys_drafts') || '{}')
    };

    // --- 5. Semantic Theme & Ambient Depth ---
    const Theme = {
        inject: () => {
            if (document.getElementById('sys-theme-tokens')) return;
            const style = document.createElement('style');
            style.id = 'sys-theme-tokens';
            style.innerHTML = `
                :root {
                    --sys-bg-base: #000000;
                    --sys-bg-surface: #0a0a0a;
                    --sys-bg-elevated: #111111;
                    --sys-bg-overlay: rgba(0, 0, 0, 0.7);
                    
                    --sys-border-subtle: rgba(255, 255, 255, 0.04);
                    --sys-border-base: rgba(255, 255, 255, 0.08);
                    --sys-border-strong: rgba(255, 255, 255, 0.15);
                    
                    --sys-text-primary: rgba(255, 255, 255, 0.92);
                    --sys-text-secondary: rgba(255, 255, 255, 0.5);
                    --sys-text-muted: rgba(255, 255, 255, 0.3);
                    
                    --sys-accent-base: #ffffff;
                    --sys-accent-success: #22c55e;
                    --sys-accent-danger: #ef4444;
                    --sys-accent-info: #3b82f6;

                    --sys-radius-sm: 6px;
                    --sys-radius-md: 10px;
                    --sys-radius-lg: 16px;

                    --sys-motion-fast: 150ms;
                    --sys-motion-normal: 250ms;
                    --sys-ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
                }

                /* Ambient Noise & Depth */
                body::before {
                    content: ""; position: fixed; inset: 0; z-index: var(--sys-layer-ambient, -1);
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                    opacity: 0.025; pointer-events: none;
                }

                .sys-glass {
                    background: rgba(10, 10, 10, 0.75);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid var(--sys-border-base);
                    box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.05);
                }

                /* Smart Page Transitions */
                .sys-page-wrap { transition: opacity var(--sys-motion-normal), transform var(--sys-motion-normal) var(--sys-ease-spring); }
                .sys-page-exit { opacity: 0; transform: scale(0.98) translateY(4px); filter: blur(2px); }
                .sys-page-enter { opacity: 0; transform: scale(1.02) translateY(-4px); }
                .sys-page-active { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }

                /* Animations */
                .sys-fade-in { animation: sysFadeIn var(--sys-motion-normal) var(--sys-ease-spring) forwards; }
                .sys-slide-up { animation: sysSlideUp var(--sys-motion-normal) var(--sys-ease-spring) forwards; }
                
                @keyframes sysFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes sysSlideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                
                /* Magnetic Elements */
                .sys-magnetic { transition: transform 0.1s ease-out; will-change: transform; display: inline-block; }

                /* Loading Skeleton Shimmer */
                @keyframes sysShimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
                .sys-skeleton-bg {
                    background: linear-gradient(90deg, #111 25%, #1a1a1a 50%, #111 75%);
                    background-size: 1000px 100%; animation: sysShimmer 2s infinite linear;
                }
            `;
            document.head.appendChild(style);
        }
    };

    // --- 6. DOM & Portals ---
    const DOM = {
        mount: (id, zIndex, className) => {
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.style.zIndex = zIndex;
                el.className = className;
                document.body.appendChild(el);
            }
            return el;
        },
        trapFocus: (container) => {
            const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            container.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
                else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
            });
            setTimeout(() => first.focus(), 50);
        },
        pushOverlay: (id, closeCb) => {
            if (!State.activeOverlays.length) State.previousFocus = document.activeElement;
            State.activeOverlays.push({ id, closeCb });
        },
        popOverlay: () => {
            const overlay = State.activeOverlays.pop();
            if (!State.activeOverlays.length && State.previousFocus) State.previousFocus.focus();
            return overlay;
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && State.activeOverlays.length > 0) {
            e.preventDefault();
            const top = DOM.popOverlay();
            if (top && top.closeCb) top.closeCb();
        }
    });

    // --- 7. Magnetic UI Physics ---
    const Magnetic = {
        init: () => {
            document.addEventListener('mousemove', (e) => {
                document.querySelectorAll('.sys-magnetic').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    
                    // Trigger magnetic pull if cursor is close (within 40px padding)
                    if (Math.abs(x) < rect.width/2 + 40 && Math.abs(y) < rect.height/2 + 40) {
                        el.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px) scale(1.02)`;
                        el.style.boxShadow = `0 10px 20px -10px rgba(255,255,255,0.1)`;
                    } else {
                        el.style.transform = 'translate(0px, 0px) scale(1)';
                        el.style.boxShadow = 'none';
                    }
                });
            });
        }
    };

    // --- 8. Smart Page Transitions ---
    const Page = {
        transition: (actionCallback) => {
            Theme.inject();
            let wrapper = document.getElementById('sys-app-wrapper');
            if (!wrapper) {
                // Auto-wrap body content if not manually wrapped
                wrapper = document.createElement('div');
                wrapper.id = 'sys-app-wrapper';
                wrapper.className = 'sys-page-wrap sys-page-active w-full h-full min-h-screen';
                while (document.body.firstChild) wrapper.appendChild(document.body.firstChild);
                document.body.appendChild(wrapper);
            }

            wrapper.classList.remove('sys-page-active', 'sys-page-enter');
            wrapper.classList.add('sys-page-exit');

            setTimeout(() => {
                if (actionCallback) actionCallback();
                window.scrollTo({ top: 0, behavior: 'instant' });
                
                wrapper.classList.remove('sys-page-exit');
                wrapper.classList.add('sys-page-enter');
                
                requestAnimationFrame(() => {
                    wrapper.classList.remove('sys-page-enter');
                    wrapper.classList.add('sys-page-active');
                });
            }, 250); // Matches var(--sys-motion-normal)
        }
    };

    // --- 9. Intelligent Loading States ---
    const SmartLoader = {
        execute: async (promiseOrFn, containerId, skeletonType = 'card') => {
            const container = document.getElementById(containerId);
            if (!container) {
                if (typeof promiseOrFn === 'function') return await promiseOrFn();
                return await promiseOrFn;
            }

            const originalHTML = container.innerHTML;
            let resolved = false;

            // Timer 1: Skeleton (400ms) - prevent flashing for fast connections
            const t1 = setTimeout(() => {
                if (!resolved) container.innerHTML = UIHelpers.generateSkeleton(skeletonType, 3);
            }, 400);

            // Timer 2: Warning Message (2000ms)
            const t2 = setTimeout(() => {
                if (!resolved) container.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center sys-fade-in">
                        <div class="w-8 h-8 rounded-full border-2 border-white/20 border-t-blue-500 animate-spin mb-4"></div>
                        <p class="text-sm text-gray-400 font-medium">جارٍ معالجة البيانات، يرجى الانتظار...</p>
                    </div>`;
            }, 2000);

            // Timer 3: Network Issue (5000ms)
            const t3 = setTimeout(() => {
                if (!resolved) container.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center sys-fade-in">
                        <svg class="w-8 h-8 text-yellow-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        <p class="text-sm text-gray-400 font-medium">يبدو أن الاتصال بطيء، جاري المحاولة...</p>
                    </div>`;
            }, 5000);

            try {
                const result = typeof promiseOrFn === 'function' ? await promiseOrFn() : await promiseOrFn;
                resolved = true;
                clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
                container.innerHTML = originalHTML; // Or update via framework
                return result;
            } catch (err) {
                resolved = true;
                clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center sys-fade-in">
                        <svg class="w-8 h-8 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <p class="text-sm text-red-400 font-medium">حدث خطأ أثناء جلب البيانات.</p>
                        <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">إعادة المحاولة</button>
                    </div>`;
                throw err;
            }
        }
    };

    // --- 10. Spotlight Onboarding ---
    const Spotlight = {
        show: (targetId, message, placement = 'bottom') => {
            const target = document.getElementById(targetId);
            if (!target || localStorage.getItem(`sys_spotlight_${targetId}`)) return;

            Theme.inject();
            const rect = target.getBoundingClientRect();
            const overlay = DOM.mount('sys-spotlight-overlay', Layers.spotlight, 'fixed inset-0 pointer-events-none opacity-0 transition-opacity duration-500');
            
            // Draw Spotlight using huge Box Shadow
            overlay.innerHTML = `
                <div class="absolute rounded-xl pointer-events-auto shadow-[0_0_0_9999px_rgba(0,0,0,0.85)] transition-all duration-500" 
                     style="top: ${rect.top - 8}px; left: ${rect.left - 8}px; width: ${rect.width + 16}px; height: ${rect.height + 16}px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.7), inset 0 0 15px rgba(255,255,255,0.2);">
                </div>
                <div class="absolute flex flex-col items-center pointer-events-auto sys-fade-in" 
                     style="top: ${placement==='bottom' ? rect.bottom + 20 : rect.top - 80}px; left: ${rect.left + rect.width/2}px; transform: translateX(-50%);">
                    <div class="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium shadow-xl whitespace-nowrap mb-2">${message}</div>
                    <button id="sys-spotlight-close" class="text-xs text-white/50 hover:text-white transition-colors">حسناً، فهمت</button>
                </div>
            `;
            
            requestAnimationFrame(() => overlay.classList.remove('opacity-0'));
            
            // Temporarily raise target z-index
            const origZ = target.style.zIndex;
            const origPos = target.style.position;
            target.style.position = 'relative';
            target.style.zIndex = Layers.spotlight + 1;

            const close = () => {
                overlay.classList.add('opacity-0');
                setTimeout(() => {
                    overlay.remove();
                    target.style.zIndex = origZ;
                    target.style.position = origPos;
                }, 500);
                localStorage.setItem(`sys_spotlight_${targetId}`, 'true');
            };

            document.getElementById('sys-spotlight-close').addEventListener('click', close);
        }
    };

    // --- 11. Performance HUD ---
    const PerfHUD = (() => {
        let active = false, frames = 0, lastTime = performance.now(), fps = 0;
        const toggle = () => {
            active = !active;
            const el = DOM.mount('sys-hud', Layers.hud, 'fixed bottom-4 left-4 sys-glass p-3 rounded-lg text-[10px] font-mono text-green-400 pointer-events-none transition-opacity flex flex-col gap-1 w-48 opacity-0');
            if (!active) {
                el.classList.add('opacity-0');
                return;
            }
            el.classList.remove('opacity-0');
            const loop = (t) => {
                if (!active) return;
                frames++;
                if (t - lastTime >= 1000) {
                    fps = frames; frames = 0; lastTime = t;
                    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB' : 'N/A';
                    el.innerHTML = `
                        <div class="flex justify-between"><span>FPS:</span><span class="${fps < 30 ? 'text-red-400' : 'text-green-400'}">${fps}</span></div>
                        <div class="flex justify-between"><span>MEM:</span><span class="text-blue-400">${mem}</span></div>
                        <div class="flex justify-between"><span>DOM:</span><span class="text-yellow-400">${document.getElementsByTagName('*').length}</span></div>
                        <div class="flex justify-between"><span>Overlays:</span><span class="text-purple-400">${State.activeOverlays.length}</span></div>
                        <div class="h-px bg-white/10 my-1"></div>
                        <div class="text-[8px] text-gray-500 text-center">SYS_UI ENGINE RUNNING</div>
                    `;
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        };
        return { toggle };
    })();

    // --- 12. Core UI Components (Toast, Modals, Cmd) ---
    const Toasts = (() => {
        const getIcon = (type) => {
            const icons = {
                success: `<svg class="w-4 h-4 text-[#22c55e]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
                error: `<svg class="w-4 h-4 text-[#ef4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
                loading: `<svg class="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
                info: `<svg class="w-4 h-4 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
            };
            return icons[type] || icons.info;
        };

        const getColor = (t) => ({ success: 'bg-green-500/20', error: 'bg-red-500/20', loading: 'bg-gray-500/20', info: 'bg-blue-500/20' }[t] || 'bg-blue-500/20');

        return {
            create: (type, message, duration = 4000) => {
                Theme.inject(); Audio.play('pop');
                const container = DOM.mount('sys-toasts', Layers.toast, 'fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4');
                const id = 'toast_' + Math.random().toString(36).substring(2, 9);
                const el = document.createElement('div');
                
                el.className = `sys-glass flex items-center gap-3 px-4 py-3 rounded-full text-sm text-gray-200 shadow-lg relative overflow-hidden transition-all duration-[var(--sys-motion-normal)] pointer-events-auto transform -translate-y-4 opacity-0`;
                const render = (t, m, d) => `
                    <div class="flex items-center gap-2 z-10 font-medium tracking-wide">${getIcon(t)} <span>${m}</span></div>
                    ${d !== Infinity ? `<div class="absolute bottom-0 left-0 h-[2px] ${getColor(t)} sys-progress" style="animation-duration: ${d}ms;"></div>` : ''}
                `;
                
                el.innerHTML = render(type, message, duration);
                container.prepend(el);
                
                const toastData = { id, el, timeout: null, render };
                State.toasts.set(id, toastData);

                requestAnimationFrame(() => { el.classList.remove('-translate-y-4', 'opacity-0'); el.classList.add('translate-y-0', 'opacity-100'); });

                if (duration !== Infinity) toastData.timeout = setTimeout(() => Toasts.remove(id), duration);
                if (State.toasts.size > 3) Toasts.remove(State.toasts.keys().next().value);
                return id;
            },
            update: (id, type, message, duration = 4000) => {
                const t = State.toasts.get(id);
                if (!t) return Toasts.create(type, message, duration);
                Audio.play('pop');
                if (t.timeout) clearTimeout(t.timeout);
                t.el.innerHTML = t.render(type, message, duration);
                t.el.style.transform = 'scale(0.96)';
                setTimeout(() => t.el.style.transform = 'scale(1)', 100);
                if (duration !== Infinity) t.timeout = setTimeout(() => Toasts.remove(id), duration);
                return id;
            },
            remove: (id) => {
                const t = State.toasts.get(id);
                if (!t) return;
                t.el.classList.remove('translate-y-0', 'opacity-100');
                t.el.classList.add('-translate-y-4', 'opacity-0');
                setTimeout(() => { if (t.el.parentNode) t.el.parentNode.removeChild(t.el); State.toasts.delete(id); }, 250);
            }
        };
    })();

    const Modals = (() => {
        const toggleBackdrop = (show) => {
            const bd = DOM.mount('sys-backdrop', Layers.backdrop, 'fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-[var(--sys-motion-normal)] pointer-events-none opacity-0');
            if (show) { bd.classList.remove('opacity-0', 'pointer-events-none'); bd.classList.add('opacity-100'); } 
            else { bd.classList.add('opacity-0', 'pointer-events-none'); bd.classList.remove('opacity-100'); }
        };

        const open = (html, onConfirm, onCancel, inputId = null) => {
            Theme.inject(); toggleBackdrop(true); Audio.play('open');
            const container = DOM.mount('sys-modal-root', Layers.modal, 'fixed inset-0 hidden items-center justify-center px-4 pointer-events-none');
            
            container.innerHTML = `<div class="relative sys-glass p-6 rounded-2xl w-full max-w-md pointer-events-auto sys-scale-in shadow-2xl border border-white/10" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
            container.classList.remove('hidden'); container.classList.add('flex');
            
            const box = container.children[0];
            DOM.trapFocus(box);
            
            // Session resume logic for draft text
            const input = document.getElementById(inputId);
            if (input) {
                if (State.sessionDrafts[inputId]) input.value = State.sessionDrafts[inputId];
                input.addEventListener('input', (e) => {
                    State.sessionDrafts[inputId] = e.target.value;
                    localStorage.setItem('sys_drafts', JSON.stringify(State.sessionDrafts));
                });
            }

            const close = (res) => {
                if (inputId && res) { delete State.sessionDrafts[inputId]; localStorage.setItem('sys_drafts', JSON.stringify(State.sessionDrafts)); }
                box.style.transform = 'scale(0.96)'; box.style.opacity = '0';
                toggleBackdrop(false);
                setTimeout(() => {
                    container.classList.add('hidden'); container.classList.remove('flex'); container.innerHTML = '';
                    if (res !== null) onConfirm && onConfirm(res); else onCancel && onCancel();
                }, 200);
            };

            DOM.pushOverlay('modal', () => close(null));
            document.getElementById('sys-modal-cancel')?.addEventListener('click', () => { DOM.popOverlay(); close(null); });
            document.getElementById('sys-modal-confirm')?.addEventListener('click', () => { 
                DOM.popOverlay(); close(inputId ? document.getElementById(inputId).value : true); 
            });
            if (inputId) document.getElementById(inputId).addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('sys-modal-confirm').click(); });
        };

        return {
            confirm: (title, desc, cb) => open(`
                <h3 class="text-white font-semibold text-lg mb-2">${title}</h3>
                <p class="text-gray-400 text-sm mb-6 leading-relaxed">${desc}</p>
                <div class="flex justify-end gap-3">
                    <button id="sys-modal-cancel" class="sys-magnetic px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/5 transition-all outline-none focus:ring-2">إلغاء</button>
                    <button id="sys-modal-confirm" class="sys-magnetic px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all shadow-md outline-none focus:ring-2">تأكيد</button>
                </div>`, cb, () => cb(false)),
            prompt: (title, placeholder, cb, id='sys_p1') => open(`
                <h3 class="text-white font-semibold text-lg mb-4">${title}</h3>
                <input type="text" id="${id}" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-white/30 focus:ring-1 transition-all mb-6 placeholder-gray-600" placeholder="${placeholder}">
                <div class="flex justify-end gap-3">
                    <button id="sys-modal-cancel" class="sys-magnetic px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/5 transition-all outline-none focus:ring-2">إلغاء</button>
                    <button id="sys-modal-confirm" class="sys-magnetic px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all shadow-md outline-none focus:ring-2">حفظ</button>
                </div>`, cb, () => cb(null), id)
        };
    })();

    const Cmd = (() => {
        const render = () => {
            const container = document.getElementById('sys-cmd-results');
            if (!container) return;
            const query = State.cmdState.query.toLowerCase();
            const all = Actions.getAll();
            
            // Basic fuzzy filter + AI prompt inject
            let scored = all.filter(a => (a.title + (a.shortcut||'')).toLowerCase().includes(query));
            
            if (query.length > 2 && !scored.length) {
                // AI Smart Suggestion Injection
                scored.push({ id: 'ai-prompt', title: `الذكاء الاصطناعي: "${query}"`, icon: '✨', isAI: true, handler: () => SysUI.toast('loading', 'جاري معالجة طلبك عبر الذكاء الاصطناعي...', 2000) });
            }

            if (State.cmdState.selectedIndex >= scored.length) State.cmdState.selectedIndex = 0;
            State.cmdState.results = scored;

            if (!scored.length) { container.innerHTML = `<div class="px-4 py-10 text-center text-sm text-gray-500">لا توجد نتائج</div>`; return; }

            container.innerHTML = scored.map((cmd, idx) => {
                const isActive = idx === State.cmdState.selectedIndex;
                const baseClass = isActive ? 'bg-white/10' : 'hover:bg-white/5';
                const aiStyle = cmd.isAI ? 'border border-purple-500/30 bg-purple-900/10' : '';
                return `
                    <div id="cmd-item-${idx}" class="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${baseClass} ${aiStyle}">
                        <div class="flex items-center gap-3">
                            <span class="${cmd.isAI ? 'text-purple-400' : 'text-gray-400 opacity-70'}">${cmd.icon || '⌘'}</span>
                            <span class="text-sm ${cmd.isAI ? 'text-purple-200' : 'text-gray-200'} font-medium">${cmd.title}</span>
                        </div>
                        ${cmd.shortcut ? `<span class="text-[10px] bg-black/40 border border-white/5 px-1.5 py-0.5 rounded text-gray-500 tracking-wider">${cmd.shortcut}</span>` : ''}
                    </div>`;
            }).join('');

            const activeEl = document.getElementById(`cmd-item-${State.cmdState.selectedIndex}`);
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });

            scored.forEach((cmd, idx) => {
                const el = document.getElementById(`cmd-item-${idx}`);
                if (el) {
                    el.addEventListener('mouseenter', () => { State.cmdState.selectedIndex = idx; render(); });
                    el.addEventListener('click', () => { close(); if(cmd.isAI) cmd.handler(); else Actions.execute(cmd.id); });
                }
            });
        };

        const open = () => {
            Theme.inject(); Audio.play('open');
            const container = DOM.mount('sys-cmd-root', Layers.cmd, 'fixed inset-0 hidden items-start justify-center pt-[12vh] px-4 pointer-events-none');
            const bd = DOM.mount('sys-cmd-backdrop', Layers.backdrop, 'fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity opacity-0 pointer-events-none');
            
            State.cmdState = { query: '', selectedIndex: 0, results: [] };
            container.innerHTML = `
                <div class="w-full max-w-xl sys-glass rounded-xl overflow-hidden pointer-events-auto sys-scale-in shadow-2xl border border-white/10 flex flex-col">
                    <div class="flex items-center px-4 py-3 border-b border-white/10">
                        <svg class="w-5 h-5 text-gray-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input type="text" id="sys-cmd-input" class="w-full bg-transparent text-white text-sm outline-none placeholder-gray-500 font-medium" placeholder="ابحث، تنقل، أو اطلب من الذكاء الاصطناعي..." autocomplete="off">
                        <div class="text-[10px] bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-gray-400 ml-2 shrink-0">ESC</div>
                    </div>
                    <div id="sys-cmd-results" class="max-h-[320px] overflow-y-auto sys-no-scroll p-2"></div>
                </div>`;
            container.classList.remove('hidden'); container.classList.add('flex');
            
            requestAnimationFrame(() => bd.classList.remove('opacity-0', 'opacity-100'));
            const input = document.getElementById('sys-cmd-input');
            setTimeout(() => input.focus(), 50);

            input.addEventListener('input', (e) => { State.cmdState.query = e.target.value; State.cmdState.selectedIndex = 0; render(); });
            input.addEventListener('keydown', (e) => {
                const len = State.cmdState.results.length || 1;
                if (e.key === 'ArrowDown') { e.preventDefault(); State.cmdState.selectedIndex = (State.cmdState.selectedIndex + 1) % len; render(); } 
                else if (e.key === 'ArrowUp') { e.preventDefault(); State.cmdState.selectedIndex = (State.cmdState.selectedIndex - 1 + len) % len; render(); } 
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    const cmd = State.cmdState.results[State.cmdState.selectedIndex];
                    if (cmd) { close(); cmd.isAI ? cmd.handler() : Actions.execute(cmd.id); }
                }
            });

            DOM.pushOverlay('cmd', close);
            render();
        };

        const close = () => {
            const container = document.getElementById('sys-cmd-root');
            const bd = document.getElementById('sys-cmd-backdrop');
            if (container && container.children[0]) { container.children[0].style.transform = 'scale(0.97)'; container.children[0].style.opacity = '0'; }
            if (bd) { bd.classList.remove('opacity-100'); bd.classList.add('opacity-0'); }
            DOM.popOverlay();
            setTimeout(() => { if(container) { container.classList.add('hidden'); container.classList.remove('flex'); container.innerHTML = ''; } }, 150);
        };

        return { open, close, toggle: () => { const c = document.getElementById('sys-cmd-root'); (c && !c.classList.contains('hidden')) ? close() : open(); } };
    })();

    // --- 13. UI Components (Stats, Presence, Empty) ---
    const UIHelpers = {
        presence: (msg) => {
            Theme.inject();
            let container = document.getElementById('sys-presence-bar');
            if (!container) container = DOM.mount('sys-presence-bar', Layers.base, 'fixed top-4 right-4 flex flex-col gap-2 pointer-events-none z-[1000]');
            const el = document.createElement('div');
            el.className = 'sys-fade-in flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-lg pointer-events-auto w-max';
            el.innerHTML = `<div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div><span class="text-[11px] text-gray-300 font-medium">${msg}</span>`;
            container.appendChild(el);
            setTimeout(() => { el.style.opacity='0'; setTimeout(()=>el.remove(), 250); }, 8000);
        },
        statCard: (title, value, trend, trendLabel) => {
            const trendIcon = trend > 0 ? `<svg class="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>` 
                                       : `<svg class="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6"/></svg>`;
            const trendColor = trend > 0 ? 'text-green-400' : 'text-red-400';
            const sign = trend > 0 ? '+' : '';
            return `
                <div class="sys-glass sys-magnetic p-5 rounded-2xl flex flex-col relative overflow-hidden group">
                    <div class="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span class="text-xs text-gray-400 font-medium mb-1 relative z-10">${title}</span>
                    <div class="flex items-baseline gap-3 relative z-10">
                        <span class="text-2xl font-bold text-white tracking-tight">${value}</span>
                        <div class="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded text-[10px] font-medium ${trendColor}">
                            ${trendIcon} <span>${sign}${trend}% ${trendLabel}</span>
                        </div>
                    </div>
                </div>`;
        },
        emptyState: (containerId, type, title, desc, actionLabel = null, actionId = null) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 px-4 text-center sys-fade-in w-full max-w-sm mx-auto">
                    <div class="w-16 h-16 mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                        <svg class="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                    </div>
                    <h3 class="text-white font-medium text-base mb-1">${title}</h3>
                    <p class="text-gray-500 text-sm mb-6 leading-relaxed">${desc}</p>
                    ${actionLabel ? `<button id="sys-empty-btn" class="sys-magnetic px-5 py-2.5 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]">${actionLabel}</button>` : ''}
                </div>`;
            if (actionLabel && actionId) document.getElementById('sys-empty-btn').addEventListener('click', () => Actions.execute(actionId));
        },
        generateSkeleton: (type, count = 1) => {
            Theme.inject();
            let html = '';
            for(let i=0; i<count; i++) {
                html += `
                <div class="p-5 border border-white/5 rounded-2xl bg-white/[0.01] flex flex-col gap-4 w-full sys-fade-in shadow-inner">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full sys-skeleton-bg"></div>
                        <div class="flex flex-col gap-2 flex-1">
                            <div class="h-3 w-1/3 sys-skeleton-bg rounded"></div>
                            <div class="h-2 w-1/4 sys-skeleton-bg rounded opacity-50"></div>
                        </div>
                    </div>
                    <div class="h-20 w-full sys-skeleton-bg rounded-lg mt-2"></div>
                </div>`;
            }
            return html;
        }
    };

    // --- Global Keybindings & Init ---
    let keys = {};
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); Cmd.toggle(); }
        // Sequence: Shift + ?
        if (e.shiftKey && e.key === '?') { 
            e.preventDefault(); 
            Toasts.create('info', 'الاختصارات: Cmd+K للبحث | G+D للوحة التحكم', 5000); 
        }
    });
    document.addEventListener('keyup', (e) => delete keys[e.key.toLowerCase()]);

    Theme.inject();
    Magnetic.init();

    return {
        // Core Architecture
        Events, Actions, Theme, Audio,
        
        // Premium Modules
        pageTransition: Page.transition,
        load: SmartLoader.execute,
        spotlight: Spotlight.show,
        hud: PerfHUD.toggle,
        
        // Base UI
        toast: Toasts.create,
        updateToast: Toasts.update,
        removeToast: Toasts.remove,
        confirm: Modals.confirm,
        prompt: Modals.prompt,
        cmd: Cmd,
        
        // Smart Components
        presence: UIHelpers.presence,
        statCard: UIHelpers.statCard,
        emptyState: UIHelpers.emptyState,
        skeleton: UIHelpers.generateSkeleton,
        
        icons: {
            trash: `<svg class="w-4 h-4 transition-transform hover:scale-110 active:scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`
        }
    };
})();

// Defaults
document.addEventListener('DOMContentLoaded', () => {
    SysUI.Actions.registerBatch([
        { id: 'hud.toggle', title: 'تفعيل/إلغاء أدوات المطوّر (HUD)', shortcut: 'F12', icon: '📊', handler: SysUI.hud },
        { id: 'settings', title: 'إعدادات النظام', shortcut: 'S', icon: '⚙️', handler: () => SysUI.toast('info', 'فتح الإعدادات') },
        { id: 'users', title: 'إدارة الطلاب', shortcut: 'U', icon: '👥', handler: () => SysUI.load(new Promise(r => setTimeout(r, 2500)), 'main-content') }
    ]);
});

export const trashSVG = SysUI.icons.trash;
export { SysUI };
