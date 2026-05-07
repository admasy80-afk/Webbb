export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    // 1. التأكد من نوع الطلب
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ message: "لازم JSON يا دحيح!" }), {
        status: 400,
        headers,
      });
    }

    // 2. قراءة البيانات
    const data = await request.json();

    // 3. تحقق أساسي من البيانات المهمة
    if (!data?.phone || !data?.password) {
      return new Response(JSON.stringify({ message: "بيانات ناقصة يا دحيح!" }), {
        status: 400,
        headers,
      });
    }

    // 4. منع تكرار رقم الهاتف
    const exists = await env.DB.prepare(
      "SELECT phone FROM users WHERE phone = ?"
    )
      .bind(data.phone)
      .first();

    if (exists) {
      return new Response(JSON.stringify({ message: "الرقم مسجل بالفعل!" }), {
        status: 409,
        headers,
      });
    }

    // 5. تشفير كلمة المرور (بدون مكتبات خارجية)
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(data.password);

    const hashBuffer = await crypto.subtle.digest("SHA-256", passwordBuffer);
    const hashedPassword = [...new Uint8Array(hashBuffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // 6. إدخال البيانات في D1
    await env.DB.prepare(`
      INSERT INTO users (
        first_name, second_name, third_name, last_name,
        phone, parent_phone, gender, level,
        grade, email, password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
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
      )
      .run();

    // 7. نجاح
    return new Response(
      JSON.stringify({ message: "تم تسجيلك بنجاح في منصة الدحيح ✓" }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error("D1 Error:", error);

    return new Response(
      JSON.stringify({
        message: "حدث خطأ في السيرفر",
        error: error.message,
      }),
      { status: 500, headers }
    );
  }
}

// OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
