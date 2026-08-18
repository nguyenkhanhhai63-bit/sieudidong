import { redisCommand } from "../../lib/redis.js";


async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  const parts = raw.split(";").map(x => x.trim());
  const prefix = name + "=";
  const hit = parts.find(x => x.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : "";
}

async function isAdmin(req) {
  const password = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.ADMIN_SESSION_SECRET || password;
  if (!password || !secret) return false;

  const token = getCookie(req, "sdd_admin");
  const [tsRaw, sig] = token.split(".");
  const ts = Number(tsRaw || 0);

  if (!ts || !sig) return false;
  if (Date.now() - ts > 12 * 60 * 60 * 1000) return false;

  const expected = await sha256(`${secret}|${ts}`);
  return sig === expected;
}


function clientIp(req){
  const fwd=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();
  return fwd || String(req.socket?.remoteAddress||"unknown");
}
async function loginRateState(req){
  const raw=clientIp(req);
  const key=`admin:login:fail:${raw}`;
  try{
    const count=Number(await redisCommand(["GET",key])||0);
    return {key,count};
  }catch(_){
    return {key,count:0};
  }
}
async function recordLoginFailure(key){
  try{
    const count=Number(await redisCommand(["INCR",key])||1);
    if(count===1) await redisCommand(["EXPIRE",key,"900"]);
    return count;
  }catch(_){ return 1; }
}
async function clearLoginFailures(key){
  try{ await redisCommand(["DEL",key]); }catch(_){}
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.ADMIN_SESSION_SECRET || expected;

  if (!expected || !secret) {
    return res.status(500).json({
      error: "Chưa cấu hình ADMIN_PASSWORD / ADMIN_SESSION_SECRET"
    });
  }

  const rate=await loginRateState(req);
  if(rate.count>=5){
    res.setHeader("Retry-After","900");
    return res.status(429).json({error:"Đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút."});
  }

  const password = String(req.body?.password || "");

  if (password !== expected) {
    const failures=await recordLoginFailure(rate.key);
    const remaining=Math.max(0,5-failures);
    return res.status(401).json({
      error: remaining>0
        ? `Mật khẩu không đúng. Còn ${remaining} lần thử.`
        : "Đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút."
    });
  }

  await clearLoginFailures(rate.key);

  const ts = Date.now();
  const sig = await sha256(`${secret}|${ts}`);
  const token = encodeURIComponent(`${ts}.${sig}`);

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `sdd_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`
  );

  return res.status(200).json({ ok: true });
}
