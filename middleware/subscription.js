const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');

const ADMIN_ROLES = new Set(['owner', 'dev', 'admin']);
const CACHE = new Map();
const CACHE_TTL = 120000;
const MAX_CACHE_SIZE = 5000;

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of CACHE.entries()) {
        if (now > value.expiry) {
            CACHE.delete(key);
        }
    }
}, 60000).unref();

function invalidateUserCache(userId) {
    if (userId) {
        CACHE.delete(userId.toString());
    }
}

function isSubscriptionActive(user, now) {
    const endTime = Date.parse(user.subscriptionEnd);
    return (
        Number.isFinite(endTime) &&
        endTime > now &&
        (user.subscriptionStatus === 'active' || !user.subscriptionStatus)
    );
}

async function requireActiveSubscription(req, res, next) {
    try {
        const userId = req.user?.id;
        
        if (!userId) {
            return res.status(401).json({ message: 'غير مصرح.', code: 'UNAUTHORIZED' });
        }

        const cacheKey = userId.toString();
        const now = Date.now();
        const cachedUser = CACHE.get(cacheKey);

        if (cachedUser && now < cachedUser.expiry) {
            const user = cachedUser.data;

            if (user.role && ADMIN_ROLES.has(user.role)) {
                return next();
            }

            if (user.restricted) {
                return res.status(403).json({
                    message: 'تم تقييد حسابك من قبل الإدارة. يرجى التواصل مع المستر.',
                    code: 'ACCOUNT_RESTRICTED'
                });
            }

            if (isSubscriptionActive(user, now)) {
                req.subscription = {
                    active: true,
                    end: user.subscriptionEnd,
                    expiresAt: Date.parse(user.subscriptionEnd),
                    status: user.subscriptionStatus || 'active'
                };
                return next();
            }

            return res.status(403).json({
                message: 'اشتراكك غير مفعّل. يرجى شحن كود السنتر لتفعيل المنصة.',
                code: 'SUBSCRIPTION_EXPIRED'
            });
        }

        let query;
        try {
            query = { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId };
        } catch {
            query = { _id: userId };
        }

        const db = getDb();
        const user = await db.collection('users').findOne(query, {
            projection: {
                role: 1,
                subscriptionEnd: 1,
                subscriptionStatus: 1,
                restricted: 1
            }
        });

        if (!user) {
            return res.status(401).json({ message: 'غير مصرح.', code: 'UNAUTHORIZED' });
        }

        if (CACHE.size >= MAX_CACHE_SIZE) {
            const oldestKey = CACHE.keys().next().value;
            if (oldestKey) {
                CACHE.delete(oldestKey);
            }
        }

        CACHE.set(cacheKey, {
            expiry: now + CACHE_TTL,
            data: {
                role: user.role,
                restricted: !!user.restricted,
                subscriptionEnd: user.subscriptionEnd,
                subscriptionStatus: user.subscriptionStatus
            }
        });

        if (user.role && ADMIN_ROLES.has(user.role)) {
            return next();
        }

        if (user.restricted) {
            return res.status(403).json({
                message: 'تم تقييد حسابك من قبل الإدارة. يرجى التواصل مع المستر.',
                code: 'ACCOUNT_RESTRICTED'
            });
        }

        if (isSubscriptionActive(user, now)) {
            req.subscription = {
                active: true,
                end: user.subscriptionEnd,
                expiresAt: Date.parse(user.subscriptionEnd),
                status: user.subscriptionStatus || 'active'
            };
            return next();
        }

        return res.status(403).json({
            message: 'اشتراكك غير مفعّل. يرجى شحن كود السنتر لتفعيل المنصة.',
            code: 'SUBSCRIPTION_EXPIRED'
        });

    } catch (error) {
        console.error('[SUBSCRIPTION_MIDDLEWARE]', error);
        return res.status(500).json({ message: 'خطأ في التحقق من الاشتراك.', code: 'INTERNAL_ERROR' });
    }
}

module.exports = { 
    requireActiveSubscription, 
    invalidateUserCache 
};
