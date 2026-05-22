module.exports = function startCleanupJobs() {

    setInterval(() => {
        console.log('🧹 Cleanup Job Running');
    }, 1000 * 60 * 60);
};
