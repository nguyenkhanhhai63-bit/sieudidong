
async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("");
}
function getCookie(req,name){
  const raw=String(req.headers.cookie||"");
  const prefix=name+"=";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : "";
}
export async function isAdmin(req){
  const password=process.env.ADMIN_PASSWORD||"";
  const secret=process.env.ADMIN_SESSION_SECRET||password;
  if(!password||!secret) return false;
  const token=getCookie(req,"sdd_admin");
  const [tsRaw,sig]=token.split(".");
  const ts=Number(tsRaw||0);
  if(!ts||!sig||Date.now()-ts>12*60*60*1000) return false;
  return sig===await sha256(`${secret}|${ts}`);
}
