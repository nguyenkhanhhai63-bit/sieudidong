
export default async function handler(req, res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `sdd_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
  return res.status(200).json({ ok: true });
}
