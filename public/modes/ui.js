/**
 * SysUI - Enterprise-Grade Minimal UI System
 * Architecture: Event-driven, Accessible, Centralized State, Semantic Tokens.
 * Inspired by Linear, Vercel, and Raycast.
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
                if (listeners[event]) {
                    listeners[event].forEach(cb => cb(data));
                }
            },
            off: (event, callback) => {
                if (!listeners[event]) return;
                listeners[event] = listeners[event].filter(cb => cb !== callback);
            }
        };
    })();

    // --- 2. Action Registry System ---
    const Actions = (() => {
        const registry = new Map();
        return {
            register: (id, actionDef) => {
                registry.set(id, actionDef);
                Events.emit('action:registered', { id, ...actionDef });
            },
            registerBatch: (actionsArray) => {
                actionsArray.forEach(a => Actions.register(a.id, a));
            },
            execute: (id, payload = null) => {
                const action = registry.get(id);
                if (action && action.handler) {
                    action.handler(payload);
                    Events.emit('action:executed', { id, payload });
                } else {
                    console.warn(`[SysUI] Action '${id}' not found.`);
                }
            },
            getAll: () => Array.from(registry.values())
        };
    })();

    // --- 3. Layer & State Manager ---
    const Layers = {
        base: 0,
        feed: 9000,
        backdrop: 9998,
        context: 9999,
        toast: 10000,
        modal: 10001,
        cmd: 10002
    };

    const State = {
        toasts: new Map(),
        activeOverlays: [], // Stack for ESC key & focus management
        cmdState: { query: '', selectedIndex: 0, results: [] },
        previousFocus: null
    };

    // --- 4. Semantic Theme & Animation Consistency ---
    const Theme = {
        inject: () => {
            if (document.getElementById('sys-theme-tokens')) return;
            const style = document.createElement('style');
            style.id = 'sys-theme-tokens';
            style.innerHTML = `
                :root {
                    /* Semantic Colors */
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
                    --sys-accent-warning: #f59e0b;
                    --sys-accent-info: #3b82f6;

                    /* Radii */
                    --sys-radius-sm: 6px;
                    --sys-radius-md: 10px;
                    --sys-radius-lg: 16px;

                    /* Motion Scale */
                    --sys-motion-instant: 100ms;
                    --sys-motion-fast: 150ms;
                    --sys-motion-normal: 220ms;
                    --sys-motion-slow: 320ms;
                    --sys-ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
                }

                /* Reduced Motion Accessibility */
                @media (prefers-reduced-motion: reduce) {
                    :root {
                        --sys-motion-instant: 0ms !important;
                        --sys-motion-fast: 0ms !important;
                        --sys-motion-normal: 0ms !important;
                        --sys-motion-slow: 0ms !important;
                    }
                    .sys-glass { backdrop-filter: none !important; background: #111 !important; }
                }

                .sys-glass {
                    background: rgba(10, 10, 10, 0.75);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid var(--sys-border-base);
                    box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.6);
                }

                /* Animations */
                .sys-fade-in { animation: sysFadeIn var(--sys-motion-normal) var(--sys-ease-spring) forwards; }
                .sys-slide-up { animation: sysSlideUp var(--sys-motion-normal) var(--sys-ease-spring) forwards; }
                .sys-scale-in { animation: sysScaleIn var(--sys-motion-fast) var(--sys-ease-spring) forwards; }
                
                @keyframes sysFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes sysSlideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes sysScaleIn { from { transform: scale(0.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }

                /* Scrollbar */
                .sys-no-scroll::-webkit-scrollbar { display: none; }
                .sys-no-scroll { -ms-overflow-style: none; scrollbar-width: none; }
                
                /* Progress bar for toasts */
                @keyframes sysProgress { from { width: 100%; } to { width: 0%; } }
                .sys-progress { animation: sysProgress linear forwards; }
            `;
            document.head.appendChild(style);
        }
    };

    // --- 5. DOM Portal & Accessibility Manager ---
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
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            
            container.addEventListener('keydown', function(e) {
                if (e.key !== 'Tab') return;
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            });
            first.focus();
        },
        pushOverlay: (id, closeCallback) => {
            State.activeOverlays.push({ id, closeCallback });
            if (State.activeOverlays.length === 1) {
                State.previousFocus = document.activeElement;
            }
        },
        popOverlay: () => {
            const overlay = State.activeOverlays.pop();
            if (State.activeOverlays.length === 0 && State.previousFocus) {
                State.previousFocus.focus();
            }
            return overlay;
        }
    };

    // Global ESC handler for stacked overlays
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && State.activeOverlays.length > 0) {
            e.preventDefault();
            const top = DOM.popOverlay();
            if (top && top.closeCallback) top.closeCallback();
        }
    });

    // --- 6. Toast Update System ---
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

        const getColor = (type) => {
            const colors = { success: 'bg-green-500/20', error: 'bg-red-500/20', loading: 'bg-gray-500/20', info: 'bg-blue-500/20' };
            return colors[type] || colors.info;
        };

        const create = (type, message, duration = 4000) => {
            Theme.inject();
            const container = DOM.mount('sys-toasts', Layers.toast, 'fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4 z-[10000]');
            
            const id = 'toast_' + Math.random().toString(36).substr(2, 9);
            const el = document.createElement('div');
            el.className = `sys-glass flex items-center gap-3 px-4 py-3 rounded-full text-sm text-gray-200 shadow-lg relative overflow-hidden transition-all duration-[var(--sys-motion-normal)] pointer-events-auto transform -translate-y-4 opacity-0`;
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            
            const renderContent = (t, m, d) => `
                <div class="flex items-center gap-2 z-10 font-medium tracking-wide">
                    ${getIcon(t)} <span>${m}</span>
                </div>
                ${d !== Infinity ? `<div class="absolute bottom-0 left-0 h-[2px] ${getColor(t)} sys-progress" style="animation-duration: ${d}ms;"></div>` : ''}
            `;
            
            el.innerHTML = renderContent(type, message, duration);
            container.prepend(el);
            
            const toastData = { id, el, timeout: null, render: renderContent };
            State.toasts.set(id, toastData);

            requestAnimationFrame(() => {
                el.classList.remove('-translate-y-4', 'opacity-0');
                el.classList.add('translate-y-0', 'opacity-100');
            });

            if (duration !== Infinity) {
                toastData.timeout = setTimeout(() => remove(id), duration);
            }

            // Limit queue
            if (State.toasts.size > 3) {
                const oldestId = State.toasts.keys().next().value;
                remove(oldestId);
            }

            return id;
        };

        const update = (id, type, message, duration = 4000) => {
            const toastData = State.toasts.get(id);
            if (!toastData) return create(type, message, duration); // Fallback if expired

            if (toastData.timeout) clearTimeout(toastData.timeout);
            
            const { el, render } = toastData;
            el.innerHTML = render(type, message, duration);
            
            // Subtle pop animation on update
            el.style.transform = 'scale(0.96)';
            setTimeout(() => el.style.transform = 'scale(1)', 100);

            if (duration !== Infinity) {
                toastData.timeout = setTimeout(() => remove(id), duration);
            }
            return id;
        };

        const remove = (id) => {
            const t = State.toasts.get(id);
            if (!t) return;
            t.el.classList.remove('translate-y-0', 'opacity-100');
            t.el.classList.add('-translate-y-4', 'opacity-0');
            setTimeout(() => {
                if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
                State.toasts.delete(id);
            }, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sys-motion-normal')));
        };

        return { create, update, remove };
    })();

    // --- 7. Modals with Focus Trap & Accessibility ---
    const Modals = (() => {
        const toggleBackdrop = (show) => {
            const bd = DOM.mount('sys-backdrop', Layers.backdrop, 'fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-[var(--sys-motion-normal)] pointer-events-none opacity-0');
            if (show) {
                bd.classList.remove('pointer-events-none', 'opacity-0');
                bd.classList.add('opacity-100');
            } else {
                bd.classList.add('opacity-0', 'pointer-events-none');
                bd.classList.remove('opacity-100');
            }
        };

        const open = (contentHtml, onConfirm, onCancel, inputId = null) => {
            Theme.inject();
            toggleBackdrop(true);
            const container = DOM.mount('sys-modal-root', Layers.modal, 'fixed inset-0 hidden items-center justify-center px-4 pointer-events-none');
            
            container.innerHTML = `
                <div class="relative sys-glass p-6 rounded-2xl w-full max-w-md pointer-events-auto sys-scale-in shadow-2xl border border-white/10" 
                     role="dialog" aria-modal="true" tabindex="-1">
                    ${contentHtml}
                </div>
            `;
            
            container.classList.remove('hidden');
            container.classList.add('flex');
            
            const box = container.children[0];
            DOM.trapFocus(box);
            
            if (inputId) setTimeout(() => document.getElementById(inputId)?.focus(), 50);

            const close = (result) => {
                box.style.transform = 'scale(0.96)';
                box.style.opacity = '0';
                toggleBackdrop(false);
                setTimeout(() => {
                    container.classList.add('hidden');
                    container.classList.remove('flex');
                    container.innerHTML = '';
                    if (result !== null) onConfirm && onConfirm(result);
                    else onCancel && onCancel();
                }, 200);
            };

            DOM.pushOverlay('modal', () => close(null));

            document.getElementById('sys-modal-cancel')?.addEventListener('click', () => {
                DOM.popOverlay();
                close(null);
            });
            document.getElementById('sys-modal-confirm')?.addEventListener('click', () => {
                DOM.popOverlay();
                close(inputId ? document.getElementById(inputId).value : true);
            });

            if (inputId) {
                document.getElementById(inputId).addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') document.getElementById('sys-modal-confirm').click();
                });
            }
        };

        return {
            confirm: (title, desc, cb) => {
                open(`
                    <h3 class="text-white font-semibold text-lg mb-2">${title}</h3>
                    <p class="text-gray-400 text-sm mb-6 leading-relaxed">${desc}</p>
                    <div class="flex justify-end gap-3">
                        <button id="sys-modal-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all outline-none focus:ring-2 focus:ring-white/20">إلغاء</button>
                        <button id="sys-modal-confirm" class="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all shadow-md outline-none focus:ring-2 focus:ring-white/50">تأكيد</button>
                    </div>
                `, cb, () => cb(false));
            },
            prompt: (title, placeholder, cb) => {
                open(`
                    <h3 class="text-white font-semibold text-lg mb-4">${title}</h3>
                    <input type="text" id="sys-prompt-input" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-white/30 focus:ring-1 transition-all mb-6 placeholder-gray-600" placeholder="${placeholder}">
                    <div class="flex justify-end gap-3">
                        <button id="sys-modal-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all outline-none focus:ring-2 focus:ring-white/20">إلغاء</button>
                        <button id="sys-modal-confirm" class="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all shadow-md outline-none focus:ring-2 focus:ring-white/50">حفظ</button>
                    </div>
                `, cb, () => cb(null), 'sys-prompt-input');
            }
        };
    })();

    // --- 8. Command Palette (Fuzzy Search, Keyboard Nav, Actions) ---
    const Cmd = (() => {
        // Simple fuzzy search scorer
        const score = (str, query) => {
            if (!query) return 1;
            str = str.toLowerCase(); query = query.toLowerCase();
            if (str === query) return 10;
            if (str.startsWith(query)) return 8;
            if (str.includes(query)) return 5;
            // Fuzzy match characters in order
            let idx = 0;
            for (let i = 0; i < query.length; i++) {
                idx = str.indexOf(query[i], idx);
                if (idx === -1) return 0;
                idx++;
            }
            return 2;
        };

        const renderResults = () => {
            const container = document.getElementById('sys-cmd-results');
            if (!container) return;
            
            const all = Actions.getAll();
            const query = State.cmdState.query;
            
            const scored = all.map(a => ({ ...a, score: score(a.title + (a.shortcut||''), query) }))
                              .filter(a => a.score > 0)
                              .sort((a, b) => b.score - a.score);
            
            State.cmdState.results = scored;
            
            // Fix index if out of bounds
            if (State.cmdState.selectedIndex >= scored.length) State.cmdState.selectedIndex = 0;

            if (scored.length === 0) {
                container.innerHTML = `<div class="px-4 py-10 text-center text-sm text-gray-500">لا توجد نتائج لـ "${query}"</div>`;
                return;
            }

            container.innerHTML = scored.map((cmd, idx) => {
                const isActive = idx === State.cmdState.selectedIndex;
                return `
                    <div id="cmd-item-${idx}" class="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}" role="option" aria-selected="${isActive}">
                        <div class="flex items-center gap-3">
                            <span class="text-gray-400 opacity-70">${cmd.icon || '⌘'}</span>
                            <span class="text-sm text-gray-200 font-medium">${cmd.title}</span>
                        </div>
                        ${cmd.shortcut ? `<span class="text-[10px] bg-black/40 border border-white/5 px-1.5 py-0.5 rounded text-gray-500 tracking-wider">${cmd.shortcut}</span>` : ''}
                    </div>
                `;
            }).join('');

            // Scroll active item into view
            const activeEl = document.getElementById(`cmd-item-${State.cmdState.selectedIndex}`);
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });

            // Attach clicks
            scored.forEach((cmd, idx) => {
                const el = document.getElementById(`cmd-item-${idx}`);
                if(el) {
                    el.addEventListener('mouseenter', () => {
                        State.cmdState.selectedIndex = idx;
                        renderResults();
                    });
                    el.addEventListener('click', () => {
                        close();
                        Actions.execute(cmd.id);
                    });
                }
            });
        };

        const open = () => {
            Theme.inject();
            const container = DOM.mount('sys-cmd-root', Layers.cmd, 'fixed inset-0 hidden items-start justify-center pt-[12vh] px-4 pointer-events-none');
            
            // Backdrop
            const bd = DOM.mount('sys-cmd-backdrop', Layers.backdrop, 'fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity opacity-0 pointer-events-none');
            
            State.cmdState.query = '';
            State.cmdState.selectedIndex = 0;

            container.innerHTML = `
                <div class="w-full max-w-xl sys-glass rounded-xl overflow-hidden pointer-events-auto sys-scale-in shadow-2xl border border-white/10 flex flex-col" role="dialog" aria-modal="true" aria-label="Command Palette">
                    <div class="flex items-center px-4 py-3 border-b border-white/10">
                        <svg class="w-5 h-5 text-gray-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input type="text" id="sys-cmd-input" class="w-full bg-transparent text-white text-sm outline-none placeholder-gray-500 font-medium" placeholder="ابحث عن أمر أو صفحة..." autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true">
                        <div class="text-[10px] bg-white/10 border border-white/10 px-1.5 py-0.5 rounded text-gray-400 ml-2 shrink-0">ESC</div>
                    </div>
                    <div id="sys-cmd-results" class="max-h-[320px] overflow-y-auto sys-no-scroll p-2" role="listbox"></div>
                </div>
            `;
            
            container.classList.remove('hidden');
            container.classList.add('flex');
            
            requestAnimationFrame(() => {
                bd.classList.remove('opacity-0');
                bd.classList.add('opacity-100');
            });

            const input = document.getElementById('sys-cmd-input');
            setTimeout(() => input.focus(), 50);

            input.addEventListener('input', (e) => {
                State.cmdState.query = e.target.value;
                State.cmdState.selectedIndex = 0;
                renderResults();
            });

            input.addEventListener('keydown', (e) => {
                const results = State.cmdState.results;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    State.cmdState.selectedIndex = (State.cmdState.selectedIndex + 1) % (results.length || 1);
                    renderResults();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    State.cmdState.selectedIndex = (State.cmdState.selectedIndex - 1 + (results.length || 1)) % (results.length || 1);
                    renderResults();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (results[State.cmdState.selectedIndex]) {
                        close();
                        Actions.execute(results[State.cmdState.selectedIndex].id);
                    }
                }
            });

            DOM.pushOverlay('cmd', close);
            renderResults();
        };

        const close = () => {
            const container = document.getElementById('sys-cmd-root');
            const bd = document.getElementById('sys-cmd-backdrop');
            if (container && container.children[0]) {
                container.children[0].style.transform = 'scale(0.97)';
                container.children[0].style.opacity = '0';
            }
            if (bd) {
                bd.classList.remove('opacity-100');
                bd.classList.add('opacity-0');
            }
            DOM.popOverlay();
            setTimeout(() => {
                if(container) {
                    container.classList.add('hidden');
                    container.classList.remove('flex');
                    container.innerHTML = '';
                }
            }, 150);
        };

        return { open, close, toggle: () => {
            const c = document.getElementById('sys-cmd-root');
            (c && !c.classList.contains('hidden')) ? close() : open();
        }};
    })();

    // --- 9. Context Menu (Floating UI approach) ---
    const ContextMenu = (() => {
        let activeMenu = null;

        const close = () => {
            if (activeMenu) {
                activeMenu.classList.remove('opacity-100', 'scale-100');
                activeMenu.classList.add('opacity-0', 'scale-95');
                setTimeout(() => {
                    if (activeMenu && activeMenu.parentNode) activeMenu.parentNode.removeChild(activeMenu);
                    activeMenu = null;
                }, 150);
            }
        };

        document.addEventListener('click', (e) => {
            if (activeMenu && !activeMenu.contains(e.target)) close();
        });

        const open = (e, items) => {
            e.preventDefault();
            Theme.inject();
            close();

            const menu = document.createElement('div');
            menu.className = 'sys-glass border border-white/10 rounded-xl p-1 shadow-2xl min-w-[180px] flex flex-col fixed origin-top-left transition-all duration-[var(--sys-motion-fast)] opacity-0 scale-95 z-[9999]';
            
            menu.innerHTML = items.map((item, i) => {
                if (item.divider) return `<div class="h-px bg-white/5 my-1 mx-2"></div>`;
                const colorClass = item.danger ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-gray-300 hover:bg-white/10 hover:text-white';
                return `
                    <button id="ctx-item-${i}" class="flex items-center gap-2 w-full px-3 py-1.5 text-sm font-medium rounded-lg transition-colors outline-none focus:bg-white/10 ${colorClass}" role="menuitem">
                        ${item.icon || ''} <span>${item.label}</span>
                    </button>
                `;
            }).join('');

            document.body.appendChild(menu);
            activeMenu = menu;

            // Positioning Engine (Prevent overflow)
            const rect = menu.getBoundingClientRect();
            const vpWidth = window.innerWidth;
            const vpHeight = window.innerHeight;
            
            let x = e.clientX;
            let y = e.clientY;

            if (x + rect.width > vpWidth - 10) x = vpWidth - rect.width - 10;
            if (y + rect.height > vpHeight - 10) y = vpHeight - rect.height - 10;
            
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            // Attach events
            items.forEach((item, i) => {
                if (item.divider) return;
                const btn = document.getElementById(`ctx-item-${i}`);
                if (btn) {
                    btn.addEventListener('click', () => {
                        close();
                        if(item.actionId) Actions.execute(item.actionId);
                        else if(item.action) item.action();
                    });
                }
            });

            requestAnimationFrame(() => {
                menu.classList.remove('opacity-0', 'scale-95');
                menu.classList.add('opacity-100', 'scale-100');
            });
        };

        return { open, close };
    })();

    // --- 10. Minimalist Empty States & Illustrations ---
    const EmptyStates = (() => {
        const icons = {
            search: `<svg class="w-12 h-12 text-gray-600 mb-4 stroke-[1]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
            data: `<svg class="w-12 h-12 text-gray-600 mb-4 stroke-[1]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>`
        };

        return {
            render: (containerId, type, title, desc, actionLabel = null, actionId = null) => {
                const el = document.getElementById(containerId);
                if (!el) return;
                el.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 px-4 text-center sys-fade-in w-full max-w-sm mx-auto">
                        ${icons[type] || icons.data}
                        <h3 class="text-white font-medium text-base mb-1">${title}</h3>
                        <p class="text-gray-500 text-sm mb-6 leading-relaxed">${desc}</p>
                        ${actionLabel ? `<button id="sys-empty-btn" class="px-5 py-2.5 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all shadow-md active:scale-95 outline-none focus:ring-2 focus:ring-white/50">${actionLabel}</button>` : ''}
                    </div>
                `;
                if (actionLabel && actionId) {
                    document.getElementById('sys-empty-btn').addEventListener('click', () => Actions.execute(actionId));
                }
            }
        };
    })();

    // --- 11. Activity Feed & Skeleton ---
    const UIHelpers = {
        feed: (msg, timeStr = 'الآن') => {
            Theme.inject();
            const container = DOM.mount('sys-feed', Layers.feed, 'fixed bottom-6 right-6 flex flex-col gap-2 pointer-events-none z-[9000]');
            const el = document.createElement('div');
            el.className = 'sys-slide-up flex items-center gap-3 px-3 py-2 rounded-lg bg-black/60 border border-white/5 backdrop-blur-md shadow-lg pointer-events-auto w-max';
            el.innerHTML = `
                <div class="w-1.5 h-1.5 rounded-full bg-[var(--sys-accent-info)] animate-pulse"></div>
                <span class="text-xs text-gray-300 font-medium">${msg}</span>
                <span class="text-[10px] text-gray-600 ml-2">${timeStr}</span>
            `;
            container.appendChild(el);
            if (container.children.length > 3) container.children[0].remove();
            setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 250);
            }, 5000);
        },
        generateSkeleton: (type, count = 1) => {
            Theme.inject();
            let html = '';
            for(let i=0; i<count; i++) {
                if (type === 'card') {
                    html += `
                    <div class="p-5 border border-white/5 rounded-xl bg-white/[0.01] flex flex-col gap-4 w-full sys-fade-in">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-white/5 animate-pulse"></div>
                            <div class="flex flex-col gap-2 flex-1">
                                <div class="h-3 w-1/3 bg-white/5 rounded animate-pulse"></div>
                                <div class="h-2 w-1/4 bg-white/5 rounded animate-pulse"></div>
                            </div>
                        </div>
                        <div class="h-20 w-full bg-white/5 rounded animate-pulse"></div>
                    </div>`;
                }
            }
            return html;
        }
    };

    // --- Global Keybindings Engine ---
    document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            Cmd.toggle();
        }
    });

    // Public API Map
    return {
        // Core Systems
        Events,
        Actions,
        
        // Modules
        toast: Toasts.create,
        updateToast: Toasts.update,
        removeToast: Toasts.remove,
        
        confirm: Modals.confirm,
        prompt: Modals.prompt,
        
        cmd: Cmd,
        contextMenu: ContextMenu,
        emptyState: EmptyStates.render,
        
        // Helpers
        feed: UIHelpers.feed,
        skeleton: UIHelpers.generateSkeleton,
        
        // Icons
        icons: {
            trash: `<svg class="w-4 h-4 transition-transform hover:scale-110 active:scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`
        }
    };
})();

// Automatic Setup & Defaults
document.addEventListener('DOMContentLoaded', () => {
    // Register Default Actions
    SysUI.Actions.registerBatch([
        { id: 'app.settings', title: 'إعدادات النظام', shortcut: 'S', icon: '⚙️', handler: () => SysUI.toast('info', 'فتح الإعدادات') },
        { id: 'user.manage', title: 'إدارة الطلاب', shortcut: 'U', icon: '👥', handler: () => SysUI.toast('loading', 'جاري تحميل الطلاب...', Infinity) },
        { id: 'theme.toggle', title: 'تبديل المظهر', icon: '🌗', handler: () => SysUI.toast('success', 'تم تبديل المظهر بنجاح') }
    ]);
});

