export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    // 🔥 قراءة البيانات بشكل آمن
    const rawBody = await request.text();

    if (!rawBody) {
      return json(
        { message: "يرجى ملء البيانات للاستمرار." },
        400,
        headers
      );
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return json(
        { message: "تنسيق البيانات غير صحيح. يرجى المحاولة مرة أخرى." },
        400,
        headers
      );
    }

    // 🔥 تحقق أساسي
    if (!data.phone || !data.password) {
      return json(
        { message: "يرجى ملء البيانات للاستمرار." },
        400,
        headers
      );
    }

    // 🔥 منع تكرار رقم الهاتف
    const exists = await env.DB.prepare(
      "SELECT phone FROM users WHERE phone = ?"
    ).bind(data.phone).first();

    if (exists) {
      return json(
        { message: "هذا الرقم مسجل بالفعل." },
        409,
        headers
      );
    }

    // 🔐 تشفير كلمة المرور (SHA-256)
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data.password);

    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

    const hashedPassword = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // 💾 إدخال البيانات
    await env.DB.prepare(`
      INSERT INTO users (
        first_name, second_name, third_name, last_name,
        phone, parent_phone, gender, level,
        grade, email, password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.first_name || "",
      data.second_name || "",
      data.third_name || "",
      data.last_name || "",
      data.phone,
      data.parent_phone || "",
      data.gender || "",
      data.level || "",
      data.grade || "",
      data.email || "",
      hashedPassword
    ).run();

    // 🟢 نجاح التسجيل
    return json(
      { message: "تم إنشاء حسابك بنجاح." },
      200,
      headers
    );

  } catch (error) {
    console.error("D1 ERROR:", error);

    return json(
      {
        message: "حدث خطأ في السيرفر. يرجى المحاولة لاحقًا.",
        error: error.message
      },
      500,
      headers
    );
  }
}

/* =========================
   OPTIONS (مهم جداً لـ CORS)
========================= */
export async function onRequestOptions() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/* =========================
   Helper JSON Response
========================= */
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
