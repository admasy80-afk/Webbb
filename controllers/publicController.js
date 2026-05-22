const { getDb } = require('../config/db');

exports.getPublicQuiz = async (req, res) => {
    try {
        if (req.headers['x-public-access'] !== 'eld7e7-web-client') return res.status(403).json({ message: "وصول غير مصرح." });
        const { id, device } = req.query;
        if (typeof id !== 'string' || id.length > 50) return res.status(400).json({ message: "معرف غير صالح." });
        const db = getDb();

        const doc = await db.collection('curriculum_content').findOne({ "publicQuizzes.id": id });
        if (!doc) return res.status(404).json({ message: "تعذر العثور على الاختبار." });

        const quiz = doc.publicQuizzes.find(q => q.id === id);
        if (!quiz) return res.status(404).json({ message: "الاختبار غير موجود." });

        if (device && quiz.results) {
            const alreadyTaken = quiz.results.some(r => r.visitorId === device);
            if (alreadyTaken) return res.status(403).json({ message: "كان غيرك اشطر😂😂" });
        }

        quiz.grade = doc.grade;
        res.status(200).json(quiz);
    } catch (err) { res.status(500).json({ message: "حدث خطأ داخلي." }); }
};

