import { MongoClient } from 'mongodb';

export async function onRequestPost(context) {
    // جلب البيانات اللي أرسلتها صفحة الـ HTML ومتغيرات كلاود فلير
    const { request, env } = context;
    
    try {
        // قراءة رقم الهاتف والباسورد من الطلب
        const data = await request.json();

        // الاتصال بـ MongoDB باستخدام المتغير حقك
        const client = new MongoClient(env.MONGO_URL);
        await client.connect();

        // اختيار قاعدة البيانات وجدول المستخدمين (تقدر تغير الأسماء على كيفك)
        const db = client.db('aldaheeh_platform'); 
        const usersCollection = db.collection('users');

        // حفظ بيانات الطالب في قاعدة البيانات
        await usersCollection.insertOne({
            phone: data.phone,
            password: data.password, // ملاحظة: في المشاريع الحقيقية يتم تشفير الباسورد، لكن للتجربة بنحفظه كذا
            signupDate: new Date()
        });

        // إغلاق الاتصال
        await client.close();

        // إرسال رد للواجهة أن الحفظ تم بنجاح
        return new Response(JSON.stringify({ success: true, message: "تم تسجيل وحفظ بيانات الدحيح بنجاح!" }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        // في حال حدوث خطأ
        return new Response(JSON.stringify({ success: false, message: "حدث خطأ أثناء الحفظ", error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
