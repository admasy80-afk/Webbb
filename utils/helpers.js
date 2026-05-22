const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isProviderHealthy = (providerHealth, name) => {
    const h = providerHealth[name];
    if (!h) return true;
    if (h.failures >= 3 && (Date.now() - h.lastFailure) < 5 * 60 * 1000) return false;
    return true;
};

module.exports = { formatBytes, delay, isProviderHealthy };

