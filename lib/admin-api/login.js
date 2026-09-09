async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  // V809: đăng nhập quản trị không phụ thuộc Redis/data.
  // Giữ nguyên route cũ /api/admin/login để tương thích Vercel hiện tại.
  const expected = String(process.env.ADMIN_PASSWORD || "");
  const secret = String(process.env.ADMIN_SESSION_SECRET || expected);

  if (!expected) {
    return res.status(500).json({
      ok:false,
      code:"ADMIN_PASSWORD_MISSING",
      error:"Thiếu ADMIN_PASSWORD trong Vercel Environment Variables."
    });
  }

  const password = String(req.body?.password || "");
  const remember = req.body?.remember !== false;

  if (password !== expected) {
    return res.status(401).json({
      ok:false,
      code:"WRONG_PASSWORD",
      error:"Mật khẩu quản trị không đúng."
    });
  }

  const ts = Date.now();
  const sig = await sha256(`${secret}|${ts}`);
  const token = encodeURIComponent(`${ts}.${sig}`);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = remember ? "; Max-Age=604800" : "";

  res.setHeader(
    "Set-Cookie",
    `sdd_admin=${token}; Path=/; HttpOnly; SameSite=Strict${maxAge}${secure}`
  );

  return res.status(200).json({ ok:true });
}
