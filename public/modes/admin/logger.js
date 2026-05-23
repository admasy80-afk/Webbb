// ==========================================
// 📝 [CORE] TELEMETRY & LOGGER
// ==========================================
export const Logger = (() => {
    const isProd = false; 
    return {
        error: (msg, ...args) => console.error(`[🔥 TITAN] ${msg}`, ...args),
        warn:  (msg, ...args) => !isProd && console.warn(`[⚠️ TITAN] ${msg}`, ...args),
        info:  (msg, ...args) => !isProd && console.info(`[ℹ️ TITAN] ${msg}`, ...args),
    };
})();
