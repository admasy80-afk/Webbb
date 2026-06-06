// ==========================================================================
// 🎓 [CORE] TEACHER COMMAND CENTER — مركز قيادة المستر
// كل التحليلات والتفاصيل العميقة التي يحتاجها المستر ليعرف كل شيء من مكان واحد.
// كل الـ endpoints هنا للقراءة/التحليل + إدارة (ملاحظات، رسائل، واجبات، تقييد).
// لا تكسر أي شيء قائم — كلها إضافات جديدة فوق نفس قاعدة البيانات.
// ==========================================================================
const { ObjectId } = require('mongodb');
const { getDb, logger } = require('../config/db');
const { logEvent, ACTIONS } = require('../utils/systemLog');

/* ============================================================
   Helpers
   ============================================================ */

const fullName = (u = {}) =>
    [u.first_name, u.second_name, u.third_name, u.last_name].filter(Boolean).join(' ').trim()
    || u.first_name || u.studentName || u.email || '—';

const isActive = (u) => !!(u && u.subscriptionEnd && new Date(u.subscriptionEnd).getTime() > Date.now());

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; };

const round = (n) => Math.round((Number(n) || 0) * 10) / 10;
const pct = (part, whole) => whole > 0 ? Math.round((part / whole) * 100) : 0;

// تقييم مستوى الطالب من نسبة مئوية
function levelOf(p) {
    if (p >= 85) return { label: 'متفوق', tone: 'green' };
    if (p >= 65) return { label: 'جيد', tone: 'lime' };
    if (p >= 50) return { label: 'متوسط', tone: 'yellow' };
    if (p > 0)   return { label: 'متعثر', tone: 'red' };
    return { label: 'لم يبدأ', tone: 'gray' };
}

// يجمع كل نتائج الاختبارات (منصة + عامة) لطالب معيّن من curriculum_content
function collectStudentQuizResults(contentDocs, email, name) {
    const out = [];
    const matchKey = (r) =>
        (email && r.email && String(r.email).toLowerCase() === String(email).toLowerCase()) ||
        (name && r.studentName && String(r.studentName).trim() === String(name).trim());

    for (const doc of contentDocs) {
        for (const kind of ['quizzes', 'publicQuizzes']) {
            for (const q of (doc[kind] || [])) {
                for (const r of (q.results || [])) {
                    if (matchKey(r)) {
                        out.push({
                            kind: kind === 'quizzes' ? 'منصة' : 'عام',
                            grade: doc.grade,
                            quizId: q.id,
                            quizTitle: q.title,
                            score: r.score ?? null,
                            percentage: r.percentage ?? (q.questions?.length ? Math.round((r.score / q.questions.length) * 100) : null),
                            totalQuestions: q.questions?.length || 0,
                            date: r.date || null
                        });
                    }
                }
            }
        }
        // اختبارات ورقية (tests) مخزّنة كدرجات
        for (const t of (doc.tests || [])) {
            for (const s of (t.scores || [])) {
                if (matchKey(s)) {
                    out.push({
                        kind: 'ورقي',
                        grade: doc.grade,
                        quizId: t.id,
                        quizTitle: t.testName,
                        score: s.score ?? null,
                        percentage: t.maxScore ? Math.round((s.score / t.maxScore) * 100) : null,
                        maxScore: t.maxScore || null,
                        date: t.createdAt || null
                    });
                }
            }
        }
    }
    return out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

/* ============================================================
   1) OVERVIEW — لوحة تحكم المستر الذكية
   ============================================================ */
exports.overview = async (req, res) => {
    try {
        const db = getDb();
        const users = db.collection('users');
        const logs = db.collection('system_logs');
        const today = startOfToday();
        const weekAgo = daysAgo(7);

        const [
            totalStudents, activeSubs, pending, restricted,
            loginsTodayDistinct, weakStudents, expiringSoon,
            newThisWeek, contentDocs
        ] = await Promise.all([
            users.countDocuments({ role: 'student' }),
            users.countDocuments({ role: 'student', subscriptionEnd: { $gt: new Date() } }),
            users.countDocuments({ role: 'student', status: 'pending' }),
            users.countDocuments({ role: 'student', restricted: true }),
            logs.distinct('actor', { role: 'student', action: ACTIONS.LOGIN, createdAt: { $gte: today } }),
            users.find({ role: 'student', status: 'accepted', points: { $gt: 0, $lt: 50 } })
                .project({ first_name: 1, second_name: 1, third_name: 1, last_name: 1, email: 1, grade: 1, points: 1 })
                .sort({ points: 1 }).limit(8).toArray(),
            users.find({
                role: 'student',
                subscriptionEnd: { $gt: new Date(), $lt: daysAgo(-3) } // ينتهي خلال 3 أيام
            }).project({ first_name: 1, email: 1, grade: 1, subscriptionEnd: 1 }).limit(10).toArray(),
            users.countDocuments({ role: 'student', createdAt: { $gte: weekAgo } }),
            db.collection('curriculum_content').find({}).toArray()
        ]);

        // أداء كل صف + أصعب صف (أقل متوسط أداء)
        const gradePerf = [];
        let weakestTest = null;
        for (const doc of contentDocs) {
            let sum = 0, cnt = 0;
            for (const kind of ['quizzes', 'publicQuizzes']) {
                for (const q of (doc[kind] || [])) {
                    for (const r of (q.results || [])) {
                        if (typeof r.percentage === 'number') { sum += r.percentage; cnt++; }
                    }
                }
            }
            for (const t of (doc.tests || [])) {
                const avg = t.maxScore && t.scores?.length
                    ? round((t.scores.reduce((a, s) => a + (s.score || 0), 0) / t.scores.length / t.maxScore) * 100)
                    : null;
                if (avg !== null) {
                    if (!weakestTest || avg < weakestTest.avg) weakestTest = { grade: doc.grade, testName: t.testName, avg, count: t.scores.length, date: t.createdAt };
                }
            }
            if (cnt > 0) gradePerf.push({ grade: doc.grade, avg: round(sum / cnt), attempts: cnt });
        }
        gradePerf.sort((a, b) => a.avg - b.avg);

        // بناء التنبيهات الذكية
        const alerts = [];
        if (pending > 0) alerts.push({ type: 'info', icon: 'user-plus', text: `${pending} طلب تسجيل بانتظار المراجعة`, action: 'requests' });
        if (weakStudents.length) alerts.push({ type: 'danger', icon: 'trending-down', text: `${weakStudents.length} طالب أداؤهم أقل من 50% يحتاجون متابعة`, action: 'analytics' });
        if (weakestTest && weakestTest.avg < 55) alerts.push({ type: 'warning', icon: 'clipboard', text: `اختبار "${weakestTest.testName}" متوسطه ${weakestTest.avg}% (${weakestTest.grade})`, action: 'tests' });
        if (expiringSoon.length) alerts.push({ type: 'warning', icon: 'clock', text: `${expiringSoon.length} طالب اشتراكهم ينتهي خلال 3 أيام`, action: 'wallet' });
        if (gradePerf.length && gradePerf[0].avg < 60) alerts.push({ type: 'warning', icon: 'layers', text: `صف "${gradePerf[0].grade}" هو الأضعف (متوسط ${gradePerf[0].avg}%)`, action: 'analytics' });
        if (!alerts.length) alerts.push({ type: 'success', icon: 'check', text: 'كل شيء تحت السيطرة، لا توجد تنبيهات عاجلة', action: null });

        res.status(200).json({
            kpis: {
                totalStudents,
                activeSubs,
                expiredSubs: totalStudents - activeSubs,
                pending,
                restricted,
                activeToday: loginsTodayDistinct.length,
                newThisWeek
            },
            weakStudents: weakStudents.map(u => ({ name: fullName(u), email: u.email, grade: u.grade, points: u.points || 0 })),
            expiringSoon: expiringSoon.map(u => ({ name: fullName(u), email: u.email, grade: u.grade, subscriptionEnd: u.subscriptionEnd })),
            gradePerformance: gradePerf,
            weakestTest,
            alerts
        });
    } catch (error) {
        logger.error({ err: error.message }, 'teacher.overview');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   2) STUDENTS LIST (enhanced) — قائمة الطلاب مع مؤشرات سريعة
   ============================================================ */
exports.studentsList = async (req, res) => {
    try {
        const db = getDb();
        const { grade, search } = req.body || {};
        const filter = { role: 'student' };
        if (grade && grade !== 'all') filter.grade = grade;
        if (search) {
            const s = String(search).trim();
            filter.$or = [
                { first_name: { $regex: s, $options: 'i' } },
                { second_name: { $regex: s, $options: 'i' } },
                { third_name: { $regex: s, $options: 'i' } },
                { last_name: { $regex: s, $options: 'i' } },
                { email: { $regex: s, $options: 'i' } },
                { phone: { $regex: s, $options: 'i' } }
            ];
        }
        const list = await db.collection('users').find(filter)
            .project({ password: 0 })
            .sort({ createdAt: -1 }).limit(500).toArray();

        res.status(200).json({
            students: list.map(u => {
                const p = Math.max(0, Math.min(100, parseInt(u.points) || 0));
                return {
                    name: fullName(u),
                    email: u.email,
                    phone: u.phone || '',
                    grade: u.grade || '',
                    points: p,
                    level: levelOf(p),
                    status: u.status,
                    restricted: !!u.restricted,
                    isActive: isActive(u),
                    balance: Number(u.balance || 0),
                    subscriptionEnd: u.subscriptionEnd || null,
                    avatar: u.avatar || null,
                    createdAt: u.createdAt
                };
            })
        });
    } catch (error) {
        logger.error({ err: error.message }, 'teacher.studentsList');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   3) STUDENT PROFILE (الفكرة الذهبية) — كل شيء عن طالب واحد
   ============================================================ */
exports.studentProfile = async (req, res) => {
    try {
        const db = getDb();
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ message: 'بريد الطالب مطلوب.' });

        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(404).json({ message: 'الطالب غير موجود.' });

        const name = fullName(user);
        const grade = user.grade;

        const [contentDocs, transactions, notes, recentLogs, gradeCourses, homeworks, submissions] = await Promise.all([
            db.collection('curriculum_content').find({}).toArray(),
            db.collection('wallet_transactions').find({ email }).sort({ createdAt: -1 }).limit(50).toArray(),
            db.collection('student_notes').find({ email }).sort({ createdAt: -1 }).toArray(),
            db.collection('system_logs').find({ actor: email }).sort({ createdAt: -1 }).limit(20).toArray(),
            db.collection('courses').find({ grade }).sort({ createdAt: 1 }).toArray(),
            db.collection('homework').find({ grade }).sort({ createdAt: -1 }).toArray(),
            db.collection('homework_submissions').find({ email }).toArray()
        ]);

        const quizResults = collectStudentQuizResults(contentDocs, email, name);

        // تحليل الأداء
        const withPct = quizResults.filter(r => typeof r.percentage === 'number');
        const avgScore = withPct.length ? round(withPct.reduce((a, r) => a + r.percentage, 0) / withPct.length) : null;

        // تقدم المشاهدة
        const watch = user.watchProgress || {};
        const watchedCount = gradeCourses.filter(c => watch[c.telegramMsgId]).length;

        // الواجبات: دمج الواجب مع تسليم الطالب
        const subMap = new Map(submissions.map(s => [String(s.homeworkId), s]));
        const homeworkView = homeworks.map(h => {
            const sub = subMap.get(String(h._id));
            return {
                id: h._id.toString(),
                title: h.title,
                dueDate: h.dueDate || null,
                submitted: !!sub,
                submittedAt: sub?.createdAt || null,
                grade: sub?.grade ?? null,
                feedback: sub?.feedback || null,
                answer: sub?.answer || null
            };
        });

        const lastActivity = recentLogs[0]?.createdAt || null;

        res.status(200).json({
            student: {
                name, email,
                first_name: user.first_name || '',
                second_name: user.second_name || '',
                third_name: user.third_name || '',
                last_name: user.last_name || '',
                phone: user.phone || '',
                parentPhone: user.parent_phone || user.guardianPhone || '',
                gender: user.gender || '',
                grade: grade || '',
                avatar: user.avatar || null,
                status: user.status,
                restricted: !!user.restricted,
                rejectionReason: user.rejection_reason || '',
                phoneVerified: !!user.phoneVerified,
                points: Math.max(0, Math.min(100, parseInt(user.points) || 0)),
                level: levelOf(parseInt(user.points) || 0),
                createdAt: user.createdAt,
                lastActivity
            },
            subscription: {
                isActive: isActive(user),
                balance: Number(user.balance || 0),
                subscriptionStart: user.subscriptionStart || null,
                subscriptionEnd: user.subscriptionEnd || null,
                codesUsedCount: Number(user.codesUsedCount || 0)
            },
            performance: {
                avgScore,
                quizzesTaken: quizResults.length,
                level: avgScore !== null ? levelOf(avgScore) : levelOf(0),
                history: withPct.slice(0, 20).reverse().map(r => ({ label: r.quizTitle, percentage: r.percentage, date: r.date, kind: r.kind }))
            },
            quizResults,
            progress: {
                totalCourses: gradeCourses.length,
                watchedCourses: watchedCount,
                completionRate: pct(watchedCount, gradeCourses.length),
                courses: gradeCourses.map(c => ({
                    id: c._id.toString(),
                    courseName: c.courseName,
                    duration: c.duration,
                    watched: !!watch[c.telegramMsgId],
                    lastWatched: watch[c.telegramMsgId] || null
                }))
            },
            homeworks: homeworkView,
            transactions: transactions.map(t => ({
                id: t._id.toString(), type: t.type, amount: t.amount,
                balanceAfter: t.balanceAfter, description: t.description, createdAt: t.createdAt
            })),
            notes: notes.map(n => ({ id: n._id.toString(), text: n.text, by: n.by, pinned: !!n.pinned, createdAt: n.createdAt })),
            activity: recentLogs.map(l => ({ action: l.action, details: l.details, status: l.status, ip: l.ip, createdAt: l.createdAt }))
        });
    } catch (error) {
        logger.error({ err: error.message }, 'teacher.studentProfile');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   4) STUDENT ACTIONS — تقييد / ملاحظات / تحديث بيانات
   ============================================================ */
exports.toggleRestrict = async (req, res) => {
    try {
        const db = getDb();
        const email = String(req.body.email || '').trim().toLowerCase();
        const restrict = !!req.body.restrict;
        if (!email) return res.status(400).json({ message: 'بريد الطالب مطلوب.' });
        const r = await db.collection('users').updateOne({ email }, { $set: { restricted: restrict } });
        if (!r.matchedCount) return res.status(404).json({ message: 'الطالب غير موجود.' });
        await logEvent(req, { action: ACTIONS.STUDENT_UPDATE, details: `${restrict ? 'تقييد' : 'رفع تقييد'} الطالب ${email}`, status: restrict ? 'warning' : 'success' });
        res.status(200).json({ message: restrict ? 'تم تقييد الطالب ✓' : 'تم رفع التقييد ✓', restricted: restrict });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addNote = async (req, res) => {
    try {
        const db = getDb();
        const email = String(req.body.email || '').trim().toLowerCase();
        const text = String(req.body.text || '').trim();
        const pinned = !!req.body.pinned;
        if (!email || !text) return res.status(400).json({ message: 'البريد ونص الملاحظة مطلوبان.' });
        const doc = { email, text, pinned, by: req.user.email, createdAt: new Date() };
        const r = await db.collection('student_notes').insertOne(doc);
        await logEvent(req, { action: ACTIONS.STUDENT_UPDATE, details: `ملاحظة على ${email}: ${text.slice(0, 60)}`, status: 'info' });
        res.status(200).json({ message: 'تمت إضافة الملاحظة ✓', id: r.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteNote = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        const r = await db.collection('student_notes').deleteOne({ _id: new ObjectId(id) });
        if (!r.deletedCount) return res.status(404).json({ message: 'الملاحظة غير موجودة.' });
        res.status(200).json({ message: 'تم حذف الملاحظة ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateStudentInfo = async (req, res) => {
    try {
        const db = getDb();
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ message: 'بريد الطالب مطلوب.' });
        const allowed = ['first_name', 'second_name', 'third_name', 'last_name', 'phone', 'parent_phone', 'grade', 'gender'];
        const update = {};
        for (const k of allowed) if (req.body[k] !== undefined) update[k] = String(req.body[k]).trim();
        if (!Object.keys(update).length) return res.status(400).json({ message: 'لا يوجد تعديل.' });
        const r = await db.collection('users').updateOne({ email }, { $set: update });
        if (!r.matchedCount) return res.status(404).json({ message: 'الطالب غير موجود.' });
        await logEvent(req, { action: ACTIONS.STUDENT_UPDATE, details: `تحديث بيانات ${email}`, status: 'success' });
        res.status(200).json({ message: 'تم تحديث البيانات ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   5) COURSE ANALYTICS — تحليل الكورسات لكل صف
   ============================================================ */
exports.courseAnalytics = async (req, res) => {
    try {
        const db = getDb();
        const { grade } = req.body || {};
        if (!grade) return res.status(400).json({ message: 'المرحلة مطلوبة.' });

        const [courses, students, content] = await Promise.all([
            db.collection('courses').find({ grade }).sort({ createdAt: 1 }).toArray(),
            db.collection('users').find({ role: 'student', grade, status: 'accepted' }).project({ watchProgress: 1, points: 1 }).toArray(),
            db.collection('curriculum_content').findOne({ grade }) || {}
        ]);

        const totalStudents = students.length;
        const courseStats = courses.map(c => {
            const watchers = students.filter(s => (s.watchProgress || {})[c.telegramMsgId]).length;
            return {
                id: c._id.toString(),
                courseName: c.courseName,
                duration: c.duration,
                watchers,
                completionRate: pct(watchers, totalStudents),
                createdAt: c.createdAt
            };
        });
        // أصعب درس = أقل نسبة إكمال (إن وُجد طلاب)
        const sortedByCompletion = [...courseStats].sort((a, b) => a.completionRate - b.completionRate);
        const hardestCourse = totalStudents > 0 && sortedByCompletion.length ? sortedByCompletion[0] : null;

        const avgPoints = totalStudents
            ? round(students.reduce((a, s) => a + (parseInt(s.points) || 0), 0) / totalStudents)
            : 0;

        res.status(200).json({
            grade,
            totalStudents,
            totalCourses: courses.length,
            avgCompletion: courseStats.length ? round(courseStats.reduce((a, c) => a + c.completionRate, 0) / courseStats.length) : 0,
            avgPoints,
            hardestCourse,
            courses: courseStats,
            counts: {
                lessons: courses.length,
                quizzes: (content.quizzes || []).length,
                publicQuizzes: (content.publicQuizzes || []).length,
                tests: (content.tests || []).length,
                articles: (content.points || []).length
            }
        });
    } catch (error) {
        logger.error({ err: error.message }, 'teacher.courseAnalytics');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   6) QUIZ ANALYTICS — تحليل اختبار واحد (أسئلة صعبة + أخطاء)
   ============================================================ */
exports.quizList = async (req, res) => {
    try {
        const db = getDb();
        const { grade } = req.body || {};
        if (!grade) return res.status(400).json({ message: 'المرحلة مطلوبة.' });
        const content = await db.collection('curriculum_content').findOne({ grade }) || {};
        const map = (arr, kind) => (arr || []).map(q => {
            const results = q.results || [];
            const withPct = results.filter(r => typeof r.percentage === 'number');
            return {
                id: q.id, kind, title: q.title,
                questions: q.questions?.length || 0,
                attempts: results.length,
                avg: withPct.length ? round(withPct.reduce((a, r) => a + r.percentage, 0) / withPct.length) : null,
                createdAt: q.createdAt
            };
        });
        res.status(200).json({
            grade,
            quizzes: [...map(content.quizzes, 'منصة'), ...map(content.publicQuizzes, 'عام')]
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.quizAnalytics = async (req, res) => {
    try {
        const db = getDb();
        const { grade, quizId } = req.body || {};
        if (!grade || !quizId) return res.status(400).json({ message: 'المرحلة ومعرّف الاختبار مطلوبان.' });
        const content = await db.collection('curriculum_content').findOne({ grade }) || {};
        const pool = [...(content.quizzes || []), ...(content.publicQuizzes || [])];
        const quiz = pool.find(q => q.id === quizId);
        if (!quiz) return res.status(404).json({ message: 'الاختبار غير موجود.' });

        const results = quiz.results || [];
        const questions = quiz.questions || [];
        const withPct = results.filter(r => typeof r.percentage === 'number');
        const avg = withPct.length ? round(withPct.reduce((a, r) => a + r.percentage, 0) / withPct.length) : 0;

        // تحليل الأسئلة: عدّ الصح/الغلط لكل سؤال من userAnswers
        const qStats = questions.map((q, i) => {
            let correct = 0, answered = 0;
            const optionCounts = new Array((q.options || []).length).fill(0);
            for (const r of results) {
                const ua = Array.isArray(r.userAnswers) ? r.userAnswers[i] : undefined;
                const sel = (ua && typeof ua === 'object') ? ua.selected : ua;
                if (sel === undefined || sel === null || sel === '') continue;
                answered++;
                const selIdx = Number(sel);
                if (Number.isInteger(selIdx) && optionCounts[selIdx] !== undefined) optionCounts[selIdx]++;
                if (selIdx === q.correctAnswer) correct++;
            }
            return {
                index: i + 1,
                questionText: q.questionText,
                options: q.options || [],
                correctAnswer: q.correctAnswer,
                answered,
                correct,
                wrong: answered - correct,
                correctRate: pct(correct, answered),
                optionCounts
            };
        });
        const hardest = [...qStats].filter(q => q.answered > 0).sort((a, b) => a.correctRate - b.correctRate).slice(0, 3);

        // توزيع الدرجات
        const buckets = { '0-49': 0, '50-64': 0, '65-84': 0, '85-100': 0 };
        for (const r of withPct) {
            const p = r.percentage;
            if (p < 50) buckets['0-49']++;
            else if (p < 65) buckets['50-64']++;
            else if (p < 85) buckets['65-84']++;
            else buckets['85-100']++;
        }

        res.status(200).json({
            quiz: { id: quiz.id, title: quiz.title, totalQuestions: questions.length, createdAt: quiz.createdAt },
            summary: {
                attempts: results.length,
                avg,
                passRate: pct(withPct.filter(r => r.percentage >= 50).length, withPct.length),
                topScore: withPct.length ? Math.max(...withPct.map(r => r.percentage)) : 0,
                lowScore: withPct.length ? Math.min(...withPct.map(r => r.percentage)) : 0
            },
            distribution: buckets,
            hardestQuestions: hardest,
            questions: qStats,
            students: results.map(r => ({
                name: r.studentName || r.email, email: r.email || null,
                percentage: r.percentage ?? null, score: r.score ?? null, date: r.date || null
            })).sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
        });
    } catch (error) {
        logger.error({ err: error.message }, 'teacher.quizAnalytics');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   7) GLOBAL ANALYTICS — التحليلات العامة
   ============================================================ */
exports.analytics = async (req, res) => {
    try {
        const db = getDb();
        const [students, contentDocs] = await Promise.all([
            db.collection('users').find({ role: 'student', status: 'accepted' })
                .project({ first_name: 1, second_name: 1, third_name: 1, last_name: 1, email: 1, grade: 1, points: 1, watchProgress: 1 }).toArray(),
            db.collection('curriculum_content').find({}).toArray()
        ]);

        const ranked = students.map(u => ({ name: fullName(u), email: u.email, grade: u.grade, points: Math.max(0, Math.min(100, parseInt(u.points) || 0)) }))
            .sort((a, b) => b.points - a.points);
        const top = ranked.slice(0, 5);
        const bottom = ranked.filter(s => s.points > 0).slice(-5).reverse();

        // توزيع المستويات
        const levels = { متفوق: 0, جيد: 0, متوسط: 0, متعثر: 0, 'لم يبدأ': 0 };
        for (const s of ranked) levels[levelOf(s.points).label]++;

        // أصعب الدروس عبر كل الصفوف (أقل نسبة إكمال) + أصعب الاختبارات
        const allCourses = await db.collection('courses').find({}).project({ courseName: 1, grade: 1, telegramMsgId: 1 }).toArray();
        const byGradeStudents = {};
        for (const s of students) { (byGradeStudents[s.grade] ||= []).push(s); }
        const hardestLessons = allCourses.map(c => {
            const gs = byGradeStudents[c.grade] || [];
            const watchers = gs.filter(s => (s.watchProgress || {})[c.telegramMsgId]).length;
            return { courseName: c.courseName, grade: c.grade, completionRate: pct(watchers, gs.length), students: gs.length };
        }).filter(c => c.students > 0).sort((a, b) => a.completionRate - b.completionRate).slice(0, 6);

        // متوسط الفهم العام + تطور مع الوقت (آخر 30 يوم) من نتائج الاختبارات
        const allResults = [];
        let totalPctSum = 0, totalPctCnt = 0;
        for (const doc of contentDocs) {
            for (const kind of ['quizzes', 'publicQuizzes']) {
                for (const q of (doc[kind] || [])) {
                    for (const r of (q.results || [])) {
                        if (typeof r.percentage === 'number' && r.date) {
                            allResults.push({ date: new Date(r.date), p: r.percentage });
                            totalPctSum += r.percentage; totalPctCnt++;
                        }
                    }
                }
            }
        }
        // تجميع أسبوعي لآخر 8 أسابيع
        const weeks = [];
        for (let w = 7; w >= 0; w--) {
            const start = daysAgo((w + 1) * 7);
            const end = daysAgo(w * 7);
            const inRange = allResults.filter(r => r.date >= start && r.date < end);
            weeks.push({
                label: w === 0 ? 'هذا الأسبوع' : `قبل ${w} أسبوع`,
                avg: inRange.length ? round(inRange.reduce((a, r) => a + r.p, 0) / inRange.length) : null,
                attempts: inRange.length
            });
        }

        res.status(200).json({
            understanding: totalPctCnt ? round(totalPctSum / totalPctCnt) : 0,
            totalAttempts: totalPctCnt,
            topStudents: top,
            bottomStudents: bottom,
            levelDistribution: levels,
            hardestLessons,
            progressOverTime: weeks
        });
    } catch (error) {
        logger.error({ err: error.message }, 'teacher.analytics');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   8) HOMEWORK — الواجبات (إنشاء/قائمة/تسليمات/تصحيح)
   ============================================================ */
exports.createHomework = async (req, res) => {
    try {
        const db = getDb();
        const grade = String(req.body.grade || '').trim();
        const title = String(req.body.title || '').trim();
        const description = String(req.body.description || '').trim();
        const courseId = req.body.courseId ? String(req.body.courseId) : null;
        const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        const maxGrade = Number(req.body.maxGrade) || 100;
        if (!grade || !title) return res.status(400).json({ message: 'المرحلة وعنوان الواجب مطلوبان.' });

        let courseName = null;
        if (courseId && ObjectId.isValid(courseId)) {
            const c = await db.collection('courses').findOne({ _id: new ObjectId(courseId) });
            courseName = c?.courseName || null;
        }
        const doc = { grade, title, description, courseId, courseName, dueDate, maxGrade, createdBy: req.user.email, createdAt: new Date() };
        const r = await db.collection('homework').insertOne(doc);
        await logEvent(req, { action: ACTIONS.QUIZ_CREATE, details: `إنشاء واجب "${title}" (${grade})`, status: 'success' });
        res.status(200).json({ message: 'تم إنشاء الواجب ✓', id: r.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.listHomework = async (req, res) => {
    try {
        const db = getDb();
        const { grade } = req.body || {};
        const filter = grade && grade !== 'all' ? { grade } : {};
        const homeworks = await db.collection('homework').find(filter).sort({ createdAt: -1 }).toArray();
        const ids = homeworks.map(h => h._id.toString());
        const subs = await db.collection('homework_submissions').find({ homeworkId: { $in: ids } }).toArray();
        const counts = {};
        for (const s of subs) {
            counts[s.homeworkId] ||= { total: 0, graded: 0 };
            counts[s.homeworkId].total++;
            if (s.grade !== null && s.grade !== undefined) counts[s.homeworkId].graded++;
        }
        res.status(200).json({
            homeworks: homeworks.map(h => ({
                id: h._id.toString(), title: h.title, description: h.description,
                grade: h.grade, courseName: h.courseName, dueDate: h.dueDate, maxGrade: h.maxGrade,
                submissions: counts[h._id.toString()]?.total || 0,
                graded: counts[h._id.toString()]?.graded || 0,
                createdAt: h.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteHomework = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        await db.collection('homework').deleteOne({ _id: new ObjectId(id) });
        await db.collection('homework_submissions').deleteMany({ homeworkId: id });
        await logEvent(req, { action: ACTIONS.QUIZ_DELETE, details: `حذف واجب ${id}`, status: 'warning' });
        res.status(200).json({ message: 'تم حذف الواجب ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.homeworkSubmissions = async (req, res) => {
    try {
        const db = getDb();
        const { homeworkId } = req.body || {};
        if (!homeworkId || !ObjectId.isValid(homeworkId)) return res.status(400).json({ message: 'معرف الواجب غير صالح.' });
        const hw = await db.collection('homework').findOne({ _id: new ObjectId(homeworkId) });
        if (!hw) return res.status(404).json({ message: 'الواجب غير موجود.' });
        const subs = await db.collection('homework_submissions').find({ homeworkId }).sort({ createdAt: -1 }).toArray();
        // أسماء الطلاب
        const emails = subs.map(s => s.email);
        const users = await db.collection('users').find({ email: { $in: emails } }).project({ first_name: 1, second_name: 1, third_name: 1, last_name: 1, email: 1 }).toArray();
        const nameMap = new Map(users.map(u => [u.email, fullName(u)]));
        res.status(200).json({
            homework: { id: hw._id.toString(), title: hw.title, maxGrade: hw.maxGrade, grade: hw.grade },
            submissions: subs.map(s => ({
                id: s._id.toString(), email: s.email, name: nameMap.get(s.email) || s.email,
                answer: s.answer || '', grade: s.grade ?? null, feedback: s.feedback || '',
                createdAt: s.createdAt, gradedAt: s.gradedAt || null
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.gradeSubmission = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        const grade = Number(req.body.grade);
        const feedback = String(req.body.feedback || '').trim();
        if (!Number.isFinite(grade) || grade < 0) return res.status(400).json({ message: 'درجة غير صالحة.' });
        const r = await db.collection('homework_submissions').updateOne(
            { _id: new ObjectId(id) },
            { $set: { grade, feedback, gradedAt: new Date(), gradedBy: req.user.email } }
        );
        if (!r.matchedCount) return res.status(404).json({ message: 'التسليم غير موجود.' });
        res.status(200).json({ message: 'تم رصد الدرجة ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   9) MESSAGES — رسائل وتنبيهات للطلاب
   ============================================================ */
exports.sendMessage = async (req, res) => {
    try {
        const db = getDb();
        const title = String(req.body.title || '').trim();
        const body = String(req.body.body || '').trim();
        const target = req.body.email ? String(req.body.email).trim().toLowerCase() : null; // طالب محدد
        const grade = req.body.grade ? String(req.body.grade).trim() : null; // أو صف كامل
        if (!body) return res.status(400).json({ message: 'نص الرسالة مطلوب.' });

        const doc = {
            title: title || 'رسالة من المستر',
            body,
            target: target || null,
            grade: target ? null : (grade || 'all'),
            by: req.user.email,
            readBy: [],
            createdAt: new Date()
        };
        const r = await db.collection('messages').insertOne(doc);
        await logEvent(req, { action: ACTIONS.STUDENT_UPDATE, details: `رسالة ${target ? `لـ ${target}` : `لصف ${grade || 'الكل'}`}: ${body.slice(0, 50)}`, status: 'info' });
        res.status(200).json({ message: 'تم إرسال الرسالة ✓', id: r.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.listMessages = async (req, res) => {
    try {
        const db = getDb();
        const msgs = await db.collection('messages').find({}).sort({ createdAt: -1 }).limit(100).toArray();
        res.status(200).json({
            messages: msgs.map(m => ({
                id: m._id.toString(), title: m.title, body: m.body,
                target: m.target, grade: m.grade, by: m.by,
                reads: (m.readBy || []).length, createdAt: m.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        await db.collection('messages').deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: 'تم حذف الرسالة ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
