const { ListMultipartUploadsCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const { r2Client, R2_BUCKET_NAME } = require('../config/r2');
const { getDb, logger } = require('../config/db');

const initCronJobs = () => {
    // كرون تنظيف الرفوعات المعلقة (كل 24 ساعة)
    setInterval(async () => {
        const providers = [{ name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME }];
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        for (const provider of providers) {
            try {
                const data = await provider.client.send(new ListMultipartUploadsCommand({ Bucket: provider.bucket }));
                if (data.Uploads) {
                    for (const upload of data.Uploads) {
                        if (upload.Initiated < oneDayAgo) {
                            await provider.client.send(new AbortMultipartUploadCommand({ Bucket: provider.bucket, Key: upload.Key, UploadId: upload.UploadId }));
                            logger.info({ provider: provider.name, key: upload.Key }, `🧹 تم تنظيف رفع متعدد الأجزاء قديم`);
                        }
                    }
                }
            } catch (err) { /* تجاهل الخطأ */ }
        }
    }, 24 * 60 * 60 * 1000);

    // كرون تنظيف البث المباشر (كل ساعة)
    setInterval(async () => {
        const db = getDb();
        if (!db) return;
        try {
            const contentCollection = db.collection('curriculum_content');
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
            await contentCollection.updateMany({ "liveStream.isLive": true, "liveStream.startedAt": { $lt: fourHoursAgo } }, { $unset: { "liveStream": "" } });
        } catch (e) { /* تجاهل الخطأ */ }
    }, 60 * 60 * 1000);
};

module.exports = initCronJobs;

