// ==========================================
// 🏗️ [UI] DOM ENGINE
// ==========================================
import { Security } from './security.js';
import { Anim } from './anim.js';
import { Scheduler } from './scheduler.js';
import { CONFIG } from './config.js';

export const DOM = {
    get: id => document.getElementById(id),
    skeleton(rows = 3, cols = 1) {
        return `<div class="flex flex-col gap-3">${Array(rows).fill(0).map(() => `
            <div class="glass-panel border border-white/5 p-4 rounded-xl animate-pulse">
                <div class="flex justify-between items-center gap-4">
                    <div class="space-y-2 flex-1"><div class="h-4 bg-white/10 rounded-lg w-3/4"></div><div class="h-3 bg-white/5 rounded-lg w-1/2"></div></div>
                    ${cols > 1 ? `<div class="flex gap-2"><div class="h-9 w-16 bg-green-500/10 rounded-xl"></div><div class="h-9 w-16 bg-red-500/10 rounded-xl"></div></div>` : ''}
                </div>
            </div>`).join('')}</div>`;
    },
    emptyState(type, msg) {
        const cfg = { empty: ['📭','text-gray-500'], error: ['⚠️','text-red-400'], success: ['✅','text-green-400'] };
        const [icon, color] = cfg[type] || cfg.empty;
        return `<div class="col-span-full flex flex-col items-center justify-center py-16 gap-3 select-none"><span class="text-5xl opacity-25 select-none">${icon}</span><p class="${color} text-sm text-center font-semibold">${Security.e(msg)}</p></div>`;
    },
    fastAppend(container, htmlString) {
        const template = document.createElement('template');
        template.innerHTML = htmlString.trim();
        Security.cleanDOM(template);
        container.innerHTML = '';
        container.appendChild(template.content);
    },
    async renderChunked(container, htmlArray, headerHtml = '') {
        container.innerHTML = headerHtml;
        const listContainer = document.createElement('div');
        listContainer.className = 'space-y-3';
        container.appendChild(listContainer);
        for (let i = 0; i < htmlArray.length; i += CONFIG.RENDER_CHUNK_SIZE) {
            const chunk = htmlArray.slice(i, i + CONFIG.RENDER_CHUNK_SIZE).join('');
            const tpl = document.createElement('template');
            tpl.innerHTML = chunk;
            Security.cleanDOM(tpl);
            listContainer.appendChild(tpl.content);
            await Scheduler.yield();
        }
        Anim.staggerFadeIn(listContainer, '.result-card', 0.015);
    }
};

