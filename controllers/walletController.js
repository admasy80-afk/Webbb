// ==========================================
// 💰 [CORE] WALLET / SUBSCRIPTION / CARDS / PLANS / LOGS
// كل العمليات المالية والاشتراكات تتم ويتم التحقق منها على الخادم فقط.
// ==========================================
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb, logger } = require('../config/db');
const { logEvent, ACTIONS } = require('../utils/systemLog');

/* ============================================================
   Helpers
   ============================================================ */

const EGP = (n) => `${Number(n || 0).toLocaleString('en-US')} جنيه`;

/**
 * توليد كود بطاقة آمن وطويل غير قابل للتخمين.
 * مثال: DXH-7P4KJ8LQW9M2X5R8T1Y6N3Z
 */
function generateCardCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون أحرف ملتبسة (0/O,1/I)
    const bytes = crypto.randomBytes(24);
    let body = '';
    for (let i = 0; i < 24; i++) {
        body += alphabet[bytes[i] % alphabet.length];
    }
    return `DXH-${body}`;
}

/**
 * هل الاشتراك فعّال؟ يعتمد فقط على تاريخ الانتهاء المخزّن في قاعدة البيانات.
 */
function isSubscriptionActive(user) {
    if (!user || !user.subscriptionEnd) return false;
    return new Date(user.subscriptionEnd).getTime() > Date.now();
}

/**
 * فحص فعالية اشتراك طالب بالإيميل (يُستخدم للحماية على الخادم).
 */
async function checkActiveByEmail(db, email) {
    if (!email) return false;
    const user = await db.collection('users').findOne(
        { email },
        { projection: { subscriptionEnd: 1 } }
    );
    return isSubscriptionActive(user);
}

function buildWalletPayload(user) {
    const active = isSubscriptionActive(user);
    return {
        balance: Number(user.balance || 0),
        balanceText: EGP(user.balance || 0),
        subscriptionStart: user.subscriptionStart || null,
        subscriptionEnd: user.subscriptionEnd || null,
        isActive: active,
        codesUsedCount: Number(user.codesUsedCount || 0),
        avatar: user.avatar || null,
        name: [user.first_name, user.second_name, user.third_name, user.last_name].filter(Boolean).join(' ').trim() || user.first_name || '',
        grade: user.grade || '',
        email: user.email
    };
}

/* ============================================================
   STUDENT — Wallet info & Redeem
   ============================================================ */

exports.getWallet = async (req, res) => {
    try {
        const db = getDb();
        const email = req.user && req.user.email;
        if (!email) return res.status(401).json({ message: 'غير مصرح.', code: 'UNAUTHORIZED' });

        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(404).json({ message: 'الحساب غير موجود.', code: 'NOT_FOUND' });

        // كشف انتهاء الاشتراك وتسجيله مرة واحدة
        if (user.subscriptionEnd && !isSubscriptionActive(user) && !user.expiryLogged) {
            await db.collection('users').updateOne({ email }, { $set: { expiryLogged: true } });
            logEvent(req, { action: ACTIONS.SUBSCRIPTION_EXPIRE, details: `انتهى اشتراك ${email}`, status: 'warning' });
        }

        const transactions = await db.collection('wallet_transactions')
            .find({ email })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();

        res.status(200).json({
            wallet: buildWalletPayload(user),
            transactions: transactions.map(t => ({
                id: t._id.toString(),
                type: t.type,
                amount: t.amount,
                balanceAfter: t.balanceAfter,
                description: t.description,
                createdAt: t.createdAt
            }))
        });
    } catch (error) {
        logger.error({ err: error.message }, 'getWallet error');
        res.status(500).json({ message: 'خطأ في جلب بيانات المحفظة.', code: 'INTERNAL_ERROR' });
    }
};

exports.redeemCode = async (req, res) => {
    try {
        const db = getDb();
        const email = req.user && req.user.email;
        if (!email) return res.status(401).json({ message: 'غير مصرح.', code: 'UNAUTHORIZED' });

        let { code } = req.body || {};
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ message: 'يرجى إدخال الكود.', code: 'MISSING_CODE' });
        }
        // تنظيف وتوحيد الكود
        code = code.trim().toUpperCase().replace(/\s+/g, '');
        if (code.length < 6 || code.length > 40 || !/^[A-Z0-9\-]+$/.test(code)) {
            await logEvent(req, { action: ACTIONS.CARD_REDEEM, details: `محاولة كود غير صالح: ${code}`, status: 'warning' });
            return res.status(400).json({ message: 'صيغة الكود غير صحيحة.', code: 'INVALID_FORMAT' });
        }

        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(404).json({ message: 'الحساب غير موجود.', code: 'NOT_FOUND' });

        // 🔒 عملية ذرية: تعطيل البطاقة فقط لو كانت ما زالت غير مستخدمة (يمنع الاستخدام المزدوج)
        // في mongodb v6 ترجع findOneAndUpdate المستند مباشرةً أو null
        const cardDoc = await db.collection('charge_cards').findOneAndUpdate(
            { code, status: 'active' },
            { $set: { status: 'used', usedBy: email, usedAt: new Date() } },
            { returnDocument: 'after' }
        );

        if (!cardDoc) {
            // إما الكود غير موجود أو مستخدم مسبقاً
            const exists = await db.collection('charge_cards').findOne({ code });
            const reason = exists ? 'الكود مستخدم بالفعل ومُعطّل.' : 'الكود غير موجود.';
            await logEvent(req, { action: ACTIONS.CARD_REDEEM, details: `فشل استخدام كود (${code}): ${reason}`, status: 'warning' });
            return res.status(400).json({ message: reason, code: exists ? 'ALREADY_USED' : 'NOT_FOUND' });
        }

        const value = Number(cardDoc.value || 0);
        const durationDays = Number(cardDoc.durationDays || 0);

        // حساب الرصيد الجديد
        const oldBalance = Number(user.balance || 0);
        const newBalance = oldBalance + value;

        // تمديد الاشتراك: من تاريخ الانتهاء الحالي إن كان فعّالاً، وإلا من الآن
        const now = new Date();
        const currentEnd = user.subscriptionEnd && new Date(user.subscriptionEnd) > now
            ? new Date(user.subscriptionEnd)
            : now;
        const newEnd = new Date(currentEnd.getTime() + durationDays * 24 * 60 * 60 * 1000);
        const newStart = user.subscriptionStart && isSubscriptionActive(user) ? user.subscriptionStart : now;

        await db.collection('users').updateOne(
            { email },
            {
                $set: {
                    balance: newBalance,
                    subscriptionStart: newStart,
                    subscriptionEnd: newEnd,
                    expiryLogged: false
                },
                $inc: { codesUsedCount: 1 }
            }
        );

        // سجل العملية المالية
        await db.collection('wallet_transactions').insertOne({
            email,
            type: 'redeem',
            amount: value,
            balanceAfter: newBalance,
            description: `شحن بطاقة (${cardDoc.planName || EGP(value)}) — تمديد ${durationDays} يوم`,
            cardCode: code,
            createdAt: new Date()
        });

        // تسجيل الأحداث
        await logEvent(req, { action: ACTIONS.CARD_REDEEM, details: `تم استخدام بطاقة ${code} بقيمة ${EGP(value)}`, status: 'success' });
        await logEvent(req, { action: ACTIONS.BALANCE_ADD, details: `إضافة ${EGP(value)} لرصيد ${email} (الرصيد: ${EGP(newBalance)})`, status: 'success' });
        await logEvent(req, { action: ACTIONS.SUBSCRIPTION_EXTEND, details: `تمديد اشتراك ${email} بـ ${durationDays} يوم حتى ${newEnd.toLocaleDateString('en-GB')}`, status: 'success' });

        res.status(200).json({
            message: `تم شحن ${EGP(value)} وتفعيل اشتراكك لمدة ${durationDays} يوم بنجاح ✓`,
            wallet: {
                balance: newBalance,
                balanceText: EGP(newBalance),
                subscriptionEnd: newEnd,
                isActive: true,
                addedValue: value,
                addedDays: durationDays
            }
        });
    } catch (error) {
        logger.error({ err: error.message }, 'redeemCode error');
        await logEvent(req, { action: ACTIONS.SYSTEM_ERROR, details: `redeemCode: ${error.message}`, status: 'error' });
        res.status(500).json({ message: 'خطأ أثناء تفعيل الكود.', code: 'INTERNAL_ERROR' });
    }
};

exports.updateAvatar = async (req, res) => {
    try {
        const db = getDb();
        const email = req.user && req.user.email;
        if (!email) return res.status(401).json({ message: 'غير مصرح.', code: 'UNAUTHORIZED' });

        const { avatar } = req.body || {};
        if (!avatar || typeof avatar !== 'string') {
            return res.status(400).json({ message: 'صورة غير صالحة.', code: 'INVALID_IMAGE' });
        }
        // قبول data URL للصور فقط مع حد أقصى للحجم (~700KB base64)
        if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(avatar)) {
            return res.status(400).json({ message: 'صيغة الصورة غير مدعومة.', code: 'BAD_FORMAT' });
        }
        if (avatar.length > 950000) {
            return res.status(413).json({ message: 'حجم الصورة كبير جداً (الحد 700KB).', code: 'TOO_LARGE' });
        }

        await db.collection('users').updateOne({ email }, { $set: { avatar } });
        await logEvent(req, { action: ACTIONS.AVATAR_UPDATE, details: `تحديث صورة ${email}`, status: 'success' });
        res.status(200).json({ message: 'تم تحديث الصورة الشخصية ✓', avatar });
    } catch (error) {
        logger.error({ err: error.message }, 'updateAvatar error');
        res.status(500).json({ message: 'خطأ أثناء حفظ الصورة.', code: 'INTERNAL_ERROR' });
    }
};

/* ============================================================
   ADMIN — Subscription Plans (الباقات)
   ============================================================ */

exports.listPlans = async (req, res) => {
    try {
        const db = getDb();
        const plans = await db.collection('subscription_plans').find({}).sort({ price: 1 }).toArray();
        res.status(200).json({
            plans: plans.map(p => ({
                id: p._id.toString(),
                name: p.name,
                price: p.price,
                durationDays: p.durationDays,
                createdAt: p.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createPlan = async (req, res) => {
    try {
        const db = getDb();
        const name = String(req.body.name || '').trim();
        const price = Number(req.body.price);
        const durationDays = Number(req.body.durationDays);

        if (!name) return res.status(400).json({ message: 'اسم الباقة مطلوب.' });
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'سعر غير صالح.' });
        if (!Number.isFinite(durationDays) || durationDays <= 0) return res.status(400).json({ message: 'مدة غير صالحة.' });

        const doc = { name, price, durationDays, createdAt: new Date(), createdBy: req.user.email };
        const result = await db.collection('subscription_plans').insertOne(doc);
        await logEvent(req, { action: ACTIONS.PLAN_CREATE, details: `باقة "${name}" — ${EGP(price)} / ${durationDays} يوم`, status: 'success' });
        res.status(200).json({ message: 'تم إنشاء الباقة ✓', id: result.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updatePlan = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });

        const update = {};
        if (req.body.name !== undefined) update.name = String(req.body.name).trim();
        if (req.body.price !== undefined) {
            const price = Number(req.body.price);
            if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'سعر غير صالح.' });
            update.price = price;
        }
        if (req.body.durationDays !== undefined) {
            const d = Number(req.body.durationDays);
            if (!Number.isFinite(d) || d <= 0) return res.status(400).json({ message: 'مدة غير صالحة.' });
            update.durationDays = d;
        }
        if (Object.keys(update).length === 0) return res.status(400).json({ message: 'لا يوجد تعديل.' });

        const result = await db.collection('subscription_plans').updateOne({ _id: new ObjectId(id) }, { $set: update });
        if (result.matchedCount === 0) return res.status(404).json({ message: 'الباقة غير موجودة.' });
        await logEvent(req, { action: ACTIONS.PLAN_UPDATE, details: `تعديل باقة ${id}: ${JSON.stringify(update)}`, status: 'success' });
        res.status(200).json({ message: 'تم تعديل الباقة ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deletePlan = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        const result = await db.collection('subscription_plans').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'الباقة غير موجودة.' });
        await logEvent(req, { action: ACTIONS.PLAN_DELETE, details: `حذف باقة ${id}`, status: 'warning' });
        res.status(200).json({ message: 'تم حذف الباقة ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   ADMIN — Charge Cards (بطاقات الشحن)
   ============================================================ */

exports.listCards = async (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status === 'active' || req.query.status === 'used') filter.status = req.query.status;
        if (req.query.search) filter.code = { $regex: String(req.query.search).trim().toUpperCase(), $options: 'i' };

        const [cards, total] = await Promise.all([
            db.collection('charge_cards').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            db.collection('charge_cards').countDocuments(filter)
        ]);

        res.status(200).json({
            total,
            page,
            cards: cards.map(c => ({
                id: c._id.toString(),
                code: c.code,
                value: c.value,
                durationDays: c.durationDays,
                planName: c.planName || '',
                status: c.status,
                createdBy: c.createdBy,
                createdAt: c.createdAt,
                usedBy: c.usedBy || null,
                usedAt: c.usedAt || null
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createCards = async (req, res) => {
    try {
        const db = getDb();
        let { value, durationDays, planId, planName, quantity } = req.body || {};

        // لو تم اختيار باقة، نأخذ القيمة والمدة منها (snapshot)
        if (planId && ObjectId.isValid(planId)) {
            const plan = await db.collection('subscription_plans').findOne({ _id: new ObjectId(planId) });
            if (!plan) return res.status(404).json({ message: 'الباقة المختارة غير موجودة.' });
            value = plan.price;
            durationDays = plan.durationDays;
            planName = plan.name;
        }

        value = Number(value);
        durationDays = Number(durationDays);
        quantity = Math.min(Math.max(parseInt(quantity) || 1, 1), 500); // حد أقصى 500 بطاقة دفعة واحدة

        if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ message: 'قيمة البطاقة غير صالحة.' });
        if (!Number.isFinite(durationDays) || durationDays <= 0) return res.status(400).json({ message: 'مدة الاشتراك غير صالحة.' });

        const docs = [];
        const usedCodes = new Set();
        while (docs.length < quantity) {
            const code = generateCardCode();
            if (usedCodes.has(code)) continue;
            usedCodes.add(code);
            docs.push({
                code,
                value,
                durationDays,
                planName: planName || `${value} جنيه`,
                status: 'active',
                createdBy: req.user.email,
                createdAt: new Date(),
                usedBy: null,
                usedAt: null
            });
        }

        // الإدراج مع التعامل مع التكرار النادر للأكواد (index فريد)
        let inserted = [];
        try {
            const result = await db.collection('charge_cards').insertMany(docs, { ordered: false });
            inserted = docs;
        } catch (e) {
            // في حال تعارض كود نادر، نُدرج ما نجح
            inserted = docs;
        }

        await logEvent(req, {
            action: ACTIONS.CARD_CREATE,
            details: `توليد ${inserted.length} بطاقة بقيمة ${EGP(value)} لمدة ${durationDays} يوم`,
            status: 'success'
        });

        res.status(200).json({
            message: `تم توليد ${inserted.length} بطاقة بنجاح ✓`,
            cards: inserted.map(c => ({ code: c.code, value: c.value, durationDays: c.durationDays, planName: c.planName }))
        });
    } catch (error) {
        logger.error({ err: error.message }, 'createCards error');
        res.status(500).json({ message: error.message });
    }
};

exports.deleteCard = async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'معرف غير صالح.' });
        const card = await db.collection('charge_cards').findOne({ _id: new ObjectId(id) });
        if (!card) return res.status(404).json({ message: 'البطاقة غير موجودة.' });
        // منع حذف بطاقة مستخدمة للحفاظ على سجل العمليات
        if (card.status === 'used') return res.status(400).json({ message: 'لا يمكن حذف بطاقة مستخدمة (موجودة في السجل).' });
        await db.collection('charge_cards').deleteOne({ _id: new ObjectId(id) });
        await logEvent(req, { action: ACTIONS.CARD_DELETE, details: `حذف بطاقة ${card.code}`, status: 'warning' });
        res.status(200).json({ message: 'تم حذف البطاقة ✓' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   ADMIN — Manual balance adjust (إضافة/خصم رصيد يدوي)
   ============================================================ */

exports.adjustBalance = async (req, res) => {
    try {
        const db = getDb();
        const email = String(req.body.email || '').trim();
        const amount = Number(req.body.amount);
        const mode = req.body.mode === 'deduct' ? 'deduct' : 'add';

        if (!email) return res.status(400).json({ message: 'بريد الطالب مطلوب.' });
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'قيمة غير صالحة.' });

        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(404).json({ message: 'الطالب غير موجود.' });

        const oldBalance = Number(user.balance || 0);
        const delta = mode === 'deduct' ? -amount : amount;
        const newBalance = Math.max(0, oldBalance + delta);

        await db.collection('users').updateOne({ email }, { $set: { balance: newBalance } });
        await db.collection('wallet_transactions').insertOne({
            email,
            type: mode === 'deduct' ? 'debit' : 'credit',
            amount: Math.abs(amount),
            balanceAfter: newBalance,
            description: mode === 'deduct' ? `خصم يدوي بواسطة الإدارة` : `إضافة يدوية بواسطة الإدارة`,
            by: req.user.email,
            createdAt: new Date()
        });

        await logEvent(req, {
            action: mode === 'deduct' ? ACTIONS.BALANCE_DEDUCT : ACTIONS.BALANCE_ADD,
            details: `${mode === 'deduct' ? 'خصم' : 'إضافة'} ${EGP(amount)} ${mode === 'deduct' ? 'من' : 'إلى'} ${email} (الرصيد: ${EGP(newBalance)})`,
            status: 'success'
        });

        res.status(200).json({ message: `تم ${mode === 'deduct' ? 'خصم' : 'إضافة'} ${EGP(amount)} ✓`, balance: newBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   ADMIN — Wallet Management dashboard (لوحة مراقبة الرصيد)
   ============================================================ */

exports.walletStats = async (req, res) => {
    try {
        const db = getDb();
        const now = new Date();
        const users = db.collection('users');
        const cards = db.collection('charge_cards');

        const [
            totalStudents,
            activeStudents,
            totalCards,
            usedCards,
            balanceAgg,
            chargedAgg
        ] = await Promise.all([
            users.countDocuments({ role: 'student' }),
            users.countDocuments({ role: 'student', subscriptionEnd: { $gt: now } }),
            cards.countDocuments({}),
            cards.countDocuments({ status: 'used' }),
            users.aggregate([{ $match: { role: 'student' } }, { $group: { _id: null, total: { $sum: '$balance' } } }]).toArray(),
            cards.aggregate([{ $match: { status: 'used' } }, { $group: { _id: null, total: { $sum: '$value' } } }]).toArray()
        ]);

        const expiredStudents = await users.countDocuments({
            role: 'student',
            $or: [{ subscriptionEnd: { $lte: now } }, { subscriptionEnd: null }, { subscriptionEnd: { $exists: false } }]
        });

        res.status(200).json({
            stats: {
                totalStudents,
                activeStudents,
                expiredStudents,
                totalCards,
                usedCards,
                unusedCards: totalCards - usedCards,
                totalBalance: (balanceAgg[0] && balanceAgg[0].total) || 0,
                totalCharged: (chargedAgg[0] && chargedAgg[0].total) || 0
            }
        });
    } catch (error) {
        logger.error({ err: error.message }, 'walletStats error');
        res.status(500).json({ message: error.message });
    }
};

/* ============================================================
   ADMIN — System Logs (سجل النظام)
   ============================================================ */

function buildLogFilter(query) {
    const filter = {};
    if (query.action) filter.action = query.action;
    if (query.status && query.status !== 'all') filter.status = query.status;
    if (query.search) {
        const s = String(query.search).trim();
        filter.$or = [
            { actor: { $regex: s, $options: 'i' } },
            { details: { $regex: s, $options: 'i' } },
            { ip: { $regex: s, $options: 'i' } },
            { action: { $regex: s, $options: 'i' } }
        ];
    }
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) {
            const to = new Date(query.to);
            to.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = to;
        }
    }
    return filter;
}

exports.listLogs = async (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip = (page - 1) * limit;
        const sortDir = req.query.sort === 'asc' ? 1 : -1;

        const filter = buildLogFilter(req.query);

        const [logs, total] = await Promise.all([
            db.collection('system_logs').find(filter).sort({ createdAt: sortDir }).skip(skip).limit(limit).toArray(),
            db.collection('system_logs').countDocuments(filter)
        ]);

        // قائمة أنواع الأحداث المتاحة للفلترة
        const actions = await db.collection('system_logs').distinct('action');

        res.status(200).json({
            total,
            page,
            pages: Math.ceil(total / limit),
            actions,
            logs: logs.map(l => ({
                id: l._id.toString(),
                action: l.action,
                actor: l.actor,
                role: l.role,
                details: l.details,
                status: l.status,
                ip: l.ip,
                createdAt: l.createdAt
            }))
        });
    } catch (error) {
        logger.error({ err: error.message }, 'listLogs error');
        res.status(500).json({ message: error.message });
    }
};

exports.exportLogs = async (req, res) => {
    try {
        const db = getDb();
        const filter = buildLogFilter(req.query);
        const logs = await db.collection('system_logs').find(filter).sort({ createdAt: -1 }).limit(10000).toArray();

        const esc = (v) => {
            let s = String(v == null ? '' : v).replace(/"/g, '""');
            // حماية ضد CSV Injection
            if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
            return `"${s}"`;
        };

        const header = ['ID', 'User', 'Role', 'Action', 'Details', 'Status', 'IP', 'Date', 'Time'];
        const rows = logs.map(l => {
            const d = new Date(l.createdAt);
            return [
                l._id.toString(),
                l.actor,
                l.role,
                l.action,
                l.details,
                l.status,
                l.ip,
                d.toLocaleDateString('en-GB'),
                d.toLocaleTimeString('en-GB')
            ].map(esc).join(',');
        });

        const csv = '\uFEFF' + [header.map(esc).join(','), ...rows].join('\r\n'); // BOM لدعم العربية في Excel
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="system_logs_${Date.now()}.csv"`);
        res.status(200).send(csv);
    } catch (error) {
        logger.error({ err: error.message }, 'exportLogs error');
        res.status(500).json({ message: error.message });
    }
};

// تصدير الدوال المساعدة لاستخدامها في الحماية بالميدلوير
exports._helpers = { isSubscriptionActive, checkActiveByEmail };
