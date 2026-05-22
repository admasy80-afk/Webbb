const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const busboy = require('busboy');
const ffmpeg = require('fluent-ffmpeg');
const { ObjectId } = require('mongodb');
const { DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

const { getDb, logger } = require('../config/db');
const { r2Client, R2_BUCKET_NAME, providerHealth } = require('../config/r2');
const { formatBytes, isProviderHealthy } = require('../utils/helpers');
const { z } = require('zod');

const courseSchema = z.object({
    courseName: z.string().min(2).max(100),
    grade: z.string().min(2).max(50),
    description: z.string().optional()
});

// دالة الرفع الخارقة
exports.uploadCourse = async (req, res) => {
    const uploadId = crypto.randomBytes(6).toString('hex');
    const startTime = Date.now();
    const log = logger.child({ uploadId, route: 'upload-course', requestId: req.requestId });
    const db = getDb();

    let responded = false;
    let parallelUpload = null;
    let uploadFinalized = false;
    let bytesReceived = 0;
    let lastProgressLog = Date.now();
    let lastBytesSnapshot = 0;
    let watchdogInterval = null;
    let speedSamples = [];
    let chosenProvider = null;
    let fileKeyGlobal = null;

    const sendResponse = (status, payload) => {
        if (responded) return;
        responded = true;
        try {
            res.status(status).json(payload);
            log.info({ status, durationMs: Date.now() - startTime }, `📤 [${uploadId}] الرد أُرسل للعميل`);
        } catch (e) { log.error({ err: e.message }, `❌ [${uploadId}] فشل إرسال الرد`); }
    };

    const cleanup = async (reason) => {
        if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }
        if (parallelUpload && !uploadFinalized) {
            try { await parallelUpload.abort(); } catch (e) {}
        }
        if (chosenProvider && fileKeyGlobal && !uploadFinalized) {
            try { await chosenProvider.client.send(new DeleteObjectCommand({ Bucket: chosenProvider.bucket, Key: fileKeyGlobal })); } catch (e) {}
        }
    };

    try {
        const bbInstance = busboy({
            headers: req.headers,
            limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1, fields: 10 },
            highWaterMark: 2 * 1024 * 1024
        });

        let courseData = {};
        let fieldsReceived = false;

        bbInstance.on('field', (name, val) => {
            courseData[name] = val;
            if (courseData.courseName && courseData.grade) fieldsReceived = true;
        });

        bbInstance.on('file', async (name, file, info) => {
            if (!fieldsReceived) {
                file.resume();
                return sendResponse(400, { message: "يجب إرسال بيانات الدورة قبل ملف الفيديو." });
            }

            const parseResult = courseSchema.safeParse(courseData);
            if (!parseResult.success) {
                file.resume();
                return sendResponse(400, { message: "بيانات الدورة غير صالحة.", details: parseResult.error.issues });
            }

            const mimeType = info.mimeType || 'video/mp4';
            const extMap = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/x-matroska': 'mkv', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi' };
            const ext = extMap[mimeType] || 'mp4';
            const fileKey = `videos/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${crypto.randomUUID()}.${ext}`;
            fileKeyGlobal = fileKey;

            chosenProvider = { name: 'R2', client: r2Client, bucket: R2_BUCKET_NAME };

            file.on('data', (chunk) => { bytesReceived += chunk.length; lastProgressLog = Date.now(); });
            file.on('limit', () => sendResponse(413, { message: "حجم الملف يتجاوز الحد المسموح (2GB)." }));
            file.on('error', () => cleanup('stream-error').finally(() => sendResponse(500, { message: "خطأ في قراءة الملف." })));

            // تشغيل الـ Watchdog
            watchdogInterval = setInterval(() => {
                const now = Date.now();
                if (!uploadFinalized && (bytesReceived === lastBytesSnapshot) && (now - lastProgressLog > 60000)) {
                    cleanup('stalled').finally(() => sendResponse(504, { message: "انقطع الاتصال أثناء الرفع." }));
                }
                lastBytesSnapshot = bytesReceived;
            }, 5000);

            try {
                parallelUpload = new Upload({
                    client: chosenProvider.client,
                    params: {
                        Bucket: chosenProvider.bucket,
                        Key: fileKey,
                        Body: file,
                        ContentType: mimeType,
                    },
                    queueSize: 6,
                    partSize: 10 * 1024 * 1024
                });

                const uploadResult = await parallelUpload.done();
                uploadFinalized = true;
                clearInterval(watchdogInterval);

                const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
                const avgSpeedMBs = (bytesReceived / (1024 * 1024) / parseFloat(durationSec)).toFixed(2);

                // استخراج الميتاداتا والغلاف عبر FFMPEG
                let finalDuration = courseData.duration || 'غير محدد';
                let finalImageUrl = courseData.imageUrl || '';

                try {
                    const getCmd = new GetObjectCommand({ Bucket: chosenProvider.bucket, Key: fileKey });
                    const signedUrl = await getSignedUrl(chosenProvider.client, getCmd, { expiresIn: 3600 });

                    finalDuration = await new Promise((resolve) => {
                        ffmpeg.ffprobe(signedUrl, (err, metadata) => {
                            if (err || !metadata || !metadata.format) return resolve('غير محدد');
                            const d = metadata.format.duration;
                            resolve(`${Math.floor(d / 60)}:${Math.floor(d % 60).toString().padStart(2, '0')}`);
                        });
                    });

                    const thumbFilename = `thumb_${crypto.randomUUID()}.jpg`;
                    const thumbPath = path.join(os.tmpdir(), thumbFilename);

                    await new Promise((resolve) => {
                        ffmpeg(signedUrl).screenshots({ timestamps: ['00:00:03.000'], filename: thumbFilename, folder: os.tmpdir(), size: '1280x720' }).on('end', resolve).on('error', () => resolve());
                    });

                    if (fs.existsSync(thumbPath)) {
                        const thumbKey = `thumbnails/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${thumbFilename}`;
                        await chosenProvider.client.send(new PutObjectCommand({ Bucket: chosenProvider.bucket, Key: thumbKey, Body: fs.createReadStream(thumbPath), ContentType: 'image/jpeg' }));
                        finalImageUrl = thumbKey;
                        fs.unlinkSync(thumbPath);
                    }
                } catch (e) { log.warn("فشل استخراج الميتاداتا آلياً"); }

                const insertResult = await db.collection('courses').insertOne({
                    courseName: courseData.courseName,
                    grade: courseData.grade,
                    description: courseData.description || "",
                    duration: finalDuration,
                    image: finalImageUrl,
                    telegramMsgId: crypto.randomUUID(),
                    fileKey: fileKey,
                    provider: chosenProvider.name,
                    bucket: chosenProvider.bucket,
                    fileSize: bytesReceived,
                    mimeType,
                    createdAt: new Date()
                });

                return sendResponse(200, { message: "تم الرفع بنجاح 🎉", courseId: insertResult.insertedId.toString(), duration: finalDuration, image: finalImageUrl });

            } catch (err) {
                await cleanup('error');
                return sendResponse(500, { message: "فشل الرفع السحابي." });
            }
        });

        req.pipe(bbInstance);
    } catch (error) { sendResponse(500, { message: "خطأ غير متوقع." }); }
};

// باقي دوال الآدمن
exports.getAllCourses = async (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const courses = await db.collection('courses').find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
        const formatted = courses.map(c => ({ id: c._id.toString(), courseName: c.courseName, grade: c.grade, description: c.description, telegramMsgId: c.telegramMsgId }));
        res.status(200).json({ courses: formatted });
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر" }); }
};

exports.deleteCourse = async (req, res) => {
    try {
        const db = getDb();
        const courseId = req.params.id;
        const course = await db.collection('courses').findOne({ _id: new ObjectId(courseId) });
        if (course && course.fileKey) {
            try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey })); } catch (e) {}
            if (course.image && course.image.startsWith('thumbnails/')) {
                 try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.image })); } catch (e) {}
            }
        }
        await db.collection('courses').deleteOne({ _id: new ObjectId(courseId) });
        res.status(200).json({ message: "تم حذف المحاضرة بنجاح" });
    } catch (error) { res.status(500).json({ message: "فشل الحذف" }); }
};

exports.getStats = async (req, res) => {
    try {
        const db = getDb();
        const studentsCount = await db.collection('users').countDocuments({ role: "student", status: "accepted" });
        const pendingCount = await db.collection('users').countDocuments({ role: "student", status: "pending" });
        res.status(200).json({ studentsCount, pendingCount, questionsCount: "نشط" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};

exports.getProvidersHealth = (req, res) => {
    const summary = {};
    for (const [name, h] of Object.entries(providerHealth)) {
        summary[name] = { failures: h.failures, healthy: isProviderHealthy(providerHealth, name), totalUploads: h.totalUploads, totalBytesUploaded: h.totalBytes, humanTotalBytes: formatBytes(h.totalBytes) };
    }
    res.status(200).json({ providers: summary, serverUptimeSec: Math.floor(process.uptime()), memoryMB: (process.memoryUsage().rss / 1024 / 1024).toFixed(2) });
};

exports.getPendingUsers = async (req, res) => {
    try {
        const db = getDb();
        const pendingUsers = await db.collection('users').find({ status: "pending", role: "student" }).toArray();
        res.status(200).json(pendingUsers);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};

exports.updateStatus = async (req, res) => {
    try {
        const db = getDb();
        const { studentEmail, newStatus, reason } = req.body;
        await db.collection('users').updateOne({ email: studentEmail.trim() }, { $set: { status: newStatus, rejection_reason: reason || "" } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};

exports.getStudentsByGrade = async (req, res) => {
    try {
        const db = getDb();
        const { grade } = req.body;
        const students = await db.collection('users').find({ status: "accepted", role: "student", grade: grade }).toArray();
        res.status(200).json(students);
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};

exports.addContent = async (req, res) => {
    try {
        const db = getDb();
        const { grade, type, pointText, questionText, questionHint } = req.body;
        const contentCollection = db.collection('curriculum_content');
        if (type === 'point') await contentCollection.updateOne({ grade: grade }, { $push: { points: pointText } }, { upsert: true });
        else await contentCollection.updateOne({ grade: grade }, { $push: { questions: { question: questionText, hint: questionHint } } }, { upsert: true });
        res.status(200).json({ message: "تمت الإضافة" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};

exports.updatePoints = async (req, res) => {
    try {
        const db = getDb();
        const { studentEmail, points } = req.body;
        await db.collection('users').updateOne({ email: studentEmail.trim() }, { $set: { points: parseInt(points) } });
        res.status(200).json({ message: "تم التحديث" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};

exports.toggleStream = async (req, res) => {
    try {
        const db = getDb();
        const { isLive } = req.body;
        const contentCollection = db.collection('curriculum_content');
        if (isLive) {
            await contentCollection.updateMany({}, { $set: { "liveStream": { isLive: true, startedAt: new Date() } } }, { upsert: true });
            res.status(200).json({ message: "تم إطلاق البث بنجاح" });
        } else {
            await contentCollection.updateMany({}, { $unset: { "liveStream": "" } });
            res.status(200).json({ message: "تم إيقاف البث بنجاح" });
        }
    } catch (error) { res.status(500).json({ message: "خطأ في تحديث حالة البث" }); }
};

exports.addMcqQuiz = async (req, res) => {
    try {
        const db = getDb();
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'quiz_' + Date.now();
        await db.collection('curriculum_content').updateOne({ grade: grade }, { $push: { quizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } }, { upsert: true });
        res.status(200).json({ message: "تمت إضافة الاختبار بنجاح", quizId });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
};

exports.addPublicQuiz = async (req, res) => {
    try {
        const db = getDb();
        const { grade, quizTitle, questionsArray } = req.body;
        const quizId = 'pub_' + Date.now();
        await db.collection('curriculum_content').updateOne({ grade: grade || "عام" }, { $push: { publicQuizzes: { id: quizId, title: quizTitle, questions: questionsArray, results: [] } } }, { upsert: true });
        res.status(200).json({ success: true, message: "تمت إضافة الاختبار العام", quizId });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
};

exports.getGradeContent = async (req, res) => {
    try {
        const db = getDb();
        const { grade } = req.body;
        const content = await db.collection('curriculum_content').findOne({ grade: grade }) || { points: [], questions: [], tests: [], quizzes: [], publicQuizzes: [] };
        res.status(200).json(content);
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
};

exports.deleteItem = async (req, res) => {
    try {
        const db = getDb();
        const { grade, itemType, identifier } = req.body;
        const contentCollection = db.collection('curriculum_content');
        let updateQuery = {};
        if (itemType === 'point') updateQuery = { $pull: { points: identifier } };
        else if (itemType === 'question') updateQuery = { $pull: { questions: { question: identifier } } };
        else if (itemType === 'test') updateQuery = { $pull: { tests: { testName: identifier } } };
        else if (itemType === 'quiz') updateQuery = { $pull: { quizzes: { id: identifier } } };
        else if (itemType === 'publicQuiz') updateQuery = { $pull: { publicQuizzes: { id: identifier } } };
        await contentCollection.updateOne({ grade: grade }, updateQuery);
        res.status(200).json({ message: "تم الحذف بنجاح" });
    } catch (err) { res.status(500).json({ message: "خطأ" }); }
};

