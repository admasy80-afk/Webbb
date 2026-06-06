const { getDb } = require('../config/db');

/**
 * يسمح للإدارة دائماً. للطلاب: يتطلب اشتراكاً فعّالاً (subscriptionEnd > الآن).
 */
async function requireActiveSubscription(req, res, next) {
    try {
        // الإدارة لا تخضع للقفل
        if (req.user && (req.user.role === 'dev' || req.user.role === 'owner')) {
            return next();
        }

        const email = req.user && req.user.email;
        if (!email) {
            return res.status(401).json({ message: 'غير مصرح.', code: 'UNAUTHORIZED' });
        }

        const db = getDb();
        const user = await db.collection('users').findOne(
            { email },
            { projection: { subscriptionEnd: 1, restricted: 1 } }
        );

        if (user && user.restricted) {
            return res.status(403).json({
                message: 'تم تقييد حسابك من قبل الإدارة. يرجى التواصل مع المستر.',
                code: 'ACCOUNT_RESTRICTED'
            });
        }

        const active = user && user.subscriptionEnd && new Date(user.subscriptionEnd).getTime() > Date.now();
        if (!active) {
            return res.status(403).json({
                message: 'اشتراكك غير مفعّل. يرجى شحن كود السنتر لتفعيل المنصة.',
                code: 'SUBSCRIPTION_EXPIRED'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({ message: 'خطأ في التحقق من الاشتراك.', code: 'INTERNAL_ERROR' });
    }
}

module.exports = { requireActiveSubscription };
