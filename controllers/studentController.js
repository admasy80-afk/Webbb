const { HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pipeline } = require('stream');
const { getDb } = require('../config/db');
const { r2Client, R2_BUCKET_NAME } = require('../config/r2');
const { z } = require('zod');
const { _helpers: walletHelpers } = require('./walletController');

const gradeSchema = z.object({ grade: z.string().min(2).max(50) });

exports.getDashboardData = async (req, res) => {
    try {
        const parseResult = gradeSchema.safeParse(req.body);
        if (!parseResult.success) return res.status(400).json({ message: "البيانات المدخلة غير صحيحة." });
        const { grade } = parseResult.data;
        const db = getDb();

        const user = await db.collection('users').findOne({ email: req.user.email });
        const studentPoints = user?.points || 0;
        // حالة الاشتراك والرصيد — تُحدّد على الخادم فقط
        const subActive = !!(user?.subscriptionEnd && new Date(user.subscriptionEnd).getTime() > Date.now());
        const subscription = {
            isActive: subActive,
            balance: Number(user?.balance || 0),
            subscriptionStart: user?.subscriptionStart || null,
            subscriptionEnd: user?.subscriptionEnd || null,
            avatar: user?.avatar || null
        };
        // الاسم الكامل (رباعي) لمطابقة نتائج الاختبارات الورقية التي يكتبها المستر
        const studentName = [user?.first_name, user?.second_name, user?.third_name, user?.last_name]
            .filter(Boolean).join(' ').trim();

        const rawContent = await db.collection('curriculum_content').findOne({ grade }) || {};
        const content = {
            points:        rawContent.points        || [],
            questions:     rawContent.questions     || [],
            tests:         rawContent.tests         || [],
            quizzes:       rawContent.quizzes       || [],
            publicQuizzes: rawContent.publicQuizzes || [],
            liveStream:    rawContent.liveStream    || null
        };

        const rawCourses = await db.collection('courses').find({ grade }).sort({ createdAt: 1 }).toArray();

        // توليد روابط Thumbnail مُوقعة من R2 لكل محاضرة
        const courses = await Promise.all(rawCourses.map(async (c) => {
            let imageUrl = '';
            if (c.image && typeof c.image === 'string') {
                if (c.image.startsWith('http')) imageUrl = c.image;
                else if (c.image.startsWith('thumbnails/')) {
                    try {
                        const cmd = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: c.image });
                        imageUrl = await getSignedUrl(r2Client, cmd, { expiresIn: 3600 });
                    } catch (e) { imageUrl = ''; }
                }
            }
            return {
                id: c._id.toString(),
                courseName: c.courseName,
                grade: c.grade,
                description: c.description || '',
                duration: c.duration || 'غير محدد',
                image: imageUrl,
                telegramMsgId: c.telegramMsgId,
                lastWatched: (user?.watchProgress || {})[c.telegramMsgId] || null
            };
        }));

        res.status(200).json({ studentPoints, content, courses, studentName, studentGrade: grade, subscription });
    } catch (error) {
        console.error("getDashboardData error:", error);
        res.status(500).json({ message: "فشل جلب البيانات." });
    }
};

exports.streamVideo = async (req, res) => {
    let streamTimeout;
    try {
        const msgId = req.params.msgId;
        let range = req.headers.range;
        const db = getDb();

        if (range && !/^bytes=\d+-\d*$/.test(range)) return res.status(416).send("نطاق البث غير صالح.");

        // telegramMsgId يخزن كـ UUID نصي - بحث مرن لكلتا الحالتين
        const orQuery = [{ telegramMsgId: msgId }];
        if (/^\d+$/.test(msgId)) orQuery.push({ telegramMsgId: parseInt(msgId, 10) });
        const course = await db.collection('courses').findOne({ $or: orQuery });
        if (!course || !course.fileKey) return res.status(404).send("الفيديو مفقود.");

        const headResponse = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey }));
        const fileSize = headResponse.ContentLength;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            if (start >= fileSize || end >= fileSize || start > end) return res.status(416).send("النطاق المطلوب خارج حدود الملف.");
        }

        const abortController = new AbortController();
        streamTimeout = setTimeout(() => abortController.abort(), 15000);

        const s3Response = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: course.fileKey, Range: range }), { abortSignal: abortController.signal });
        clearTimeout(streamTimeout);

        const headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': s3Response.ContentLength,
            'Content-Type': s3Response.ContentType || 'video/mp4',
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff'
        };
        if (s3Response.ContentRange) headers['Content-Range'] = s3Response.ContentRange;

        res.writeHead(range ? 206 : 200, headers);
        pipeline(s3Response.Body, res, () => {});
    } catch (error) {
        if (streamTimeout) clearTimeout(streamTimeout);
        if (!res.headersSent) res.status(error.name === 'AbortError' ? 504 : 500).send("تعذر تحميل الفيديو.");
    }
};

exports.submitQuiz = async (req, res) => {
    try {
        const db = getDb();
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        const { studentName, grade, quizId, score, percentage, visitorId, userAnswers } = req.body;

        // التحقق من اكتمال البيانات الأساسية اللازمة لمطابقة الاختبار وحفظ النتيجة
        if (!grade || !quizId) {
            return res.status(400).json({ message: "بيانات الاختبار ناقصة (المرحلة الدراسية أو معرّف الاختبار)." });
        }

        const contentCollection = db.collection('curriculum_content');
        const resultObj = { email, studentName, score, percentage, visitorId: visitorId || null, userAnswers: userAnswers || [], date: new Date() };

        if (quizId && quizId.startsWith('pub_')) {
            const existingDoc = await contentCollection.findOne({ grade, publicQuizzes: { $elemMatch: { id: quizId, results: { $elemMatch: { $or: [{ visitorId }, { email }] } } } } });
            if (existingDoc) return res.status(403).json({ message: "عفواً، لقد قمت بتقديم هذا الاختبار مسبقاً!" });
            const upd = await contentCollection.updateOne({ grade, "publicQuizzes.id": quizId }, { $push: { "publicQuizzes.$.results": resultObj } });
            if (upd.matchedCount === 0) return res.status(404).json({ message: "الاختبار غير موجود." });
        } else {
            // اختبارات المنصة تتطلب اشتراكاً فعّالاً — يُتحقق منه على الخادم
            const active = await walletHelpers.checkActiveByEmail(db, email);
            if (!active) {
                return res.status(403).json({ message: "اشتراكك غير مفعّل. يرجى شحن كود السنتر أولاً.", code: "SUBSCRIPTION_EXPIRED" });
            }
            // منع تكرار المحاولة لنفس الطالب على نفس الاختبار (محاولة واحدة فقط)
            const dup = await contentCollection.findOne({ grade, quizzes: { $elemMatch: { id: quizId, results: { $elemMatch: { email } } } } });
            if (dup) return res.status(403).json({ message: "عفواً، لقد قمت بتقديم هذا الاختبار مسبقاً!" });

            const upd = await contentCollection.updateOne({ grade, "quizzes.id": quizId }, { $push: { "quizzes.$.results": resultObj } });
            if (upd.matchedCount === 0) return res.status(404).json({ message: "الاختبار غير موجود أو غير متاح لمرحلتك الدراسية." });
        }
        res.status(200).json({ message: "تم حفظ النتيجة واعتمادها بنجاح" });
    } catch (error) {
        console.error("submitQuiz error:", error);
        res.status(500).json({ message: "حدث خطأ أثناء حفظ النتيجة." });
    }
};

exports.checkStatus = async (req, res) => {
    try {
        const db = getDb();
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
        res.status(200).json({ status: user.status, reason: user.rejection_reason, phoneVerified: user.phoneVerified || false });
    } catch (error) { res.status(500).json({ message: "خطأ في السيرفر" }); }
};

exports.verifyPhone = async (req, res) => {
    try {
        const db = getDb();
        const email = (req.user && req.user.email) ? req.user.email : req.body.email;
        await db.collection('users').updateOne({ email }, { $set: { phoneVerified: true } });
        res.status(200).json({ message: "تم توثيق الهاتف بنجاح" });
    } catch (error) { res.status(500).json({ message: "خطأ" }); }
};


