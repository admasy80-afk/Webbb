const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/db');
const { generateFingerprint } = require('../middleware/auth');
const { delay } = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';

exports.saveUser = async (req, res) => {
    try {
        const data = req.body;
        const db = getDb();
        const usersCollection = db.collection('users');

        const { DEV_EMAIL, DEV_PASSWORD_HASH, OWNER_EMAIL, OWNER_PASSWORD_HASH } = process.env;
        const fingerprint = generateFingerprint(req);

        let isDev = false, isOwner = false;

        if (data.identifier === DEV_EMAIL && DEV_PASSWORD_HASH) isDev = await bcrypt.compare(data.password, DEV_PASSWORD_HASH);
        if (data.identifier === OWNER_EMAIL && OWNER_PASSWORD_HASH) isOwner = await bcrypt.compare(data.password, OWNER_PASSWORD_HASH);

        if (isDev || isOwner) {
            const roleName = isDev ? "المطور" : "مستر";
            const userRole = isDev ? "dev" : "owner";
            const token = jwt.sign({ email: data.identifier, role: userRole, fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            return res.status(200).json({ message: `أهلاً بك يا ${roleName} 👑`, token, userData: { name: roleName, role: userRole, email: data.identifier, status: "accepted", grade: "إدارة المنصة" } });
        }

        if (data.identifier) {
            const user = await usersCollection.findOne({ $or: [{ email: data.identifier }, { phone: data.identifier }] });
            let validPassword = false;

            if (user) {
                validPassword = await bcrypt.compare(data.password, user.password);
                if (data.password === user.password) validPassword = true;
            }

            if (user && validPassword) {
                if (user.status !== 'accepted') return res.status(403).json({ message: 'الحساب قيد المراجعة أو مرفوض.' });

                const token = jwt.sign({ email: user.email, role: "student", fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
                return res.status(200).json({ message: "تم الدخول ✓", token, userData: { name: user.first_name, grade: user.grade, status: user.status || "pending", email: user.email, phone: user.phone, role: "student", phoneVerified: user.phoneVerified || false } });
            }

            await delay(1500);
            return res.status(401).json({ message: "خطأ في بيانات الدخول" });
        }

        if (data.first_name) {
            const existing = await usersCollection.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
            if (existing) return res.status(400).json({ message: "البريد أو الهاتف مسجل بالفعل" });

            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = { ...data, password: hashedPassword, status: "pending", role: "student", points: 0, phoneVerified: false };

            await usersCollection.insertOne(newUser);

            const token = jwt.sign({ email: data.email, role: "student", fingerprint }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '30d', issuer: 'eld7e7-platform', audience: 'eld7e7-users' });
            return res.status(200).json({ message: "تم إنشاء حساب بنجاح", token, userData: { name: data.first_name, grade: data.grade, status: "pending", email: data.email, phone: data.phone, role: "student", phoneVerified: false } });
        }
        return res.status(400).json({ message: "بيانات غير مكتملة." });

    } catch (error) { res.status(500).json({ message: "حدث خطأ داخلي" }); }
};

exports.verifySession = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ message: "انتهت صلاحية الجلسة." });
        const userRole = req.user.role;
        const userEmail = req.user.email;
        const db = getDb();

        if (userRole === 'dev' || userRole === 'owner') {
            return res.status(200).json({ message: "تم التحقق", redirectTo: '/admin.html', role: userRole });
        }

        const student = await db.collection('users').findOne({ email: userEmail });
        if (!student) return res.status(401).json({ message: "الحساب غير موجود." });

        if (student.status === 'pending' || student.status === 'rejected') {
            return res.status(200).json({ message: "حساب غير مفعل", redirectTo: '/status.html', role: userRole });
        }

        return res.status(200).json({ message: "تم التحقق من الجلسة بنجاح.", redirectTo: '/student/', role: userRole });
    } catch (error) { return res.status(500).json({ message: "خطأ داخلي في السيرفر" }); }
};

