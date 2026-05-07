export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    // تأكد إن أسماء الأعمدة هنا مطابقة لجدولك في D1
    await env.DB.prepare(`
      INSERT INTO users (first_name, second_name, third_name, last_name, phone, parent_phone, gender, level, grade, email, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.first_name, data.second_name, data.third_name, data.last_name, 
      data.phone, data.parent_phone, data.gender, data.level, 
      data.grade, data.email, data.password
    ).run();

    return new Response(JSON.stringify({ message: "تم تسجيلك بنجاح يا دحيح!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    // لو حصل خطأ السيرفر هيرد بالخطأ بدل ما يسكت
    return new Response(JSON.stringify({ message: "خطأ في السيرفر: " + error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
