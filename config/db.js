const { MongoClient } = require('mongodb');
const pino = require('pino');
const os = require('os');
const crypto = require('crypto'); // تمت الإضافة لتوليد syncId لمنع تكرار البيانات

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { pid: process.pid, host: os.hostname() }
});

let db;
let mongoClient;

async function connectMongo() {
    try {
        if (!process.env.MONGO_URL) {
            logger.fatal("متغير MONGO_URL غير موجود!");
            process.exit(1);
        }

        // التحقق من وجود رابط الـ API الخاص بـ Cloudflare D1
        if (!process.env.D1_API_URL) {
            logger.warn("⚠️ متغير D1_API_URL غير موجود في بيئة العمل! لن يتم عمل مزامنة احتياطية لـ D1.");
        }

        mongoClient = new MongoClient(process.env.MONGO_URL, {
            maxPoolSize: 20,
            minPoolSize: 5,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            retryWrites: true
        });
        await mongoClient.connect();
        db = mongoClient.db('dahih_db');
        
        // إنشاء الـ Indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true, background: true });
        await db.collection('users').createIndex({ phone: 1 }, { unique: true, background: true });
        await db.collection('courses').createIndex({ grade: 1 }, { background: true });
        await db.collection('courses').createIndex({ telegramMsgId: 1 }, { background: true });
        await db.collection('curriculum_content').createIndex({ grade: 1 }, { background: true });

        // ═══════════ نظام الرصيد والاشتراكات ═══════════
        await db.collection('charge_cards').createIndex({ code: 1 }, { unique: true, background: true });
        await db.collection('charge_cards').createIndex({ status: 1, createdAt: -1 }, { background: true });
        await db.collection('wallet_transactions').createIndex({ email: 1, createdAt: -1 }, { background: true });
        await db.collection('system_logs').createIndex({ createdAt: -1 }, { background: true });
        await db.collection('system_logs').createIndex({ action: 1 }, { background: true });
        await db.collection('system_logs').createIndex({ actor: 1 }, { background: true });
        await db.collection('subscription_plans').createIndex({ price: 1 }, { background: true });
        await db.collection('users').createIndex({ subscriptionEnd: 1 }, { background: true });

        logger.info("🔥 قاعدة البيانات والـ Indexes جاهزة للعمل");
    } catch (error) {
        logger.fatal({ err: error }, "فشل الاتصال بمونجو");
        process.exit(1);
    }
}

/**
 * دالة مساعدة ومحمية لإرسال البيانات بشكل غير متزامن إلى Cloudflare D1 (dahih_db) كنسخة احتياطية.
 * @param {string} endpoint - المسار الخاص بالعملية مثل '/api/saveUser'
 * @param {object} data - البيانات المراد إرسالها وحفظها
 */
async function syncToD1(endpoint, data) {
    if (!process.env.D1_API_URL) return false;

    try {
        // ضبط الرابط بشكل صحيح لتفادي مشاكل الـ Slashes
        const url = process.env.D1_API_URL.endsWith('/') 
            ? `${process.env.D1_API_URL}${endpoint.replace(/^\//, '')}` 
            : `${process.env.D1_API_URL}/${endpoint.replace(/^\//, '')}`;

        // دعم الـ fetch للإصدارات القديمة من Node إذا لزم الأمر
        const fetchAPI = global.fetch || require("node-fetch");

        const response = await fetchAPI(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json"
            },
            // إضافة Idempotency Key لتجنب تكرار البيانات في D1 في حال إعادة المحاولة
            body: JSON.stringify({
                ...data,
                syncId: data.syncId || crypto.randomUUID()
            })
        });

        if (!response.ok) {
            // قراءة تفاصيل الخطأ من Cloudflare لتسهيل التتبع
            const text = await response.text().catch(() => "لا توجد تفاصيل إضافية");
            logger.warn({
                status: response.status,
                body: text
            }, `⚠️ المزامنة مع D1 فشلت في المسار (${endpoint})`);
            return false;
        }

        return true;

    } catch (err) {
        // تسجيل الخطأ كـ warn فقط لضمان عدم توقف السيرفر الرئيسي
        logger.warn(
            { err: err.message }, 
            `⚠️ خطأ أثناء الاتصال بـ Cloudflare D1 (${endpoint}) - تم التجاهل لاستقرار النظام`
        );
        return false;
    }
}

const getDb = () => db;
const getClient = () => mongoClient;

module.exports = { connectMongo, getDb, getClient, logger, syncToD1 };
