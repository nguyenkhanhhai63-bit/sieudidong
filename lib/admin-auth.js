
async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function getCookie(req,name){
  const raw=String(req?.headers?.cookie||"");
  const prefix=name+"=";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : "";
}

function safeEqual(a,b){
  const x=String(a||""), y=String(b||"");
  if(x.length!==y.length) return false;
  let diff=0;
  for(let i=0;i<x.length;i++) diff|=x.charCodeAt(i)^y.charCodeAt(i);
  return diff===0;
}

export async function isAdmin(req){
  const password=process.env.ADMIN_PASSWORD||"";
  const secret=process.env.ADMIN_SESSION_SECRET||password;
  if(!password||!secret) return false;

  const token=getCookie(req,"sdd_admin");
  const dot=token.indexOf(".");
  if(dot<1) return false;

  const tsRaw=token.slice(0,dot);
  const sig=token.slice(dot+1);
  const ts=Number(tsRaw||0);

  // V207: chấp nhận phiên quản trị 7 ngày để tránh tab quản trị đang mở
  // nhưng riêng endpoint Đào tạo AI trả Unauthorized do cookie 12 giờ hết hạn.
  const maxAgeMs=7*24*60*60*1000;
  if(!ts||!sig||Date.now()-ts>maxAgeMs||ts>Date.now()+5*60*1000) return false;

  const expected=await sha256(`${secret}|${ts}`);
  return safeEqual(sig,expected);
}
