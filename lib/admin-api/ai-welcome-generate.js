import { isAdmin } from "../admin-auth.js";

function clean(v,max=4000){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .trim()
    .slice(0,max);
}

function extractText(data){
  const out=[];
  for(const c of (Array.isArray(data?.candidates)?data.candidates:[])){
    for(const p of (Array.isArray(c?.content?.parts)?c.content.parts:[])){
      if(typeof p?.text==="string" && p.text.trim()) out.push(p.text.trim());
    }
  }
  return out.join("\n").trim();
}

function parseLines(text){
  return String(text||"")
    .split(/\n+/)
    .map(x=>x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/,"").replace(/^['\"“”]|['\"“”]$/g,"").trim())
    .filter(Boolean)
    .filter(x=>x.length<=180)
    .slice(0,8);
}

async function callGemini(model,apiKey,prompt){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",
      signal:controller.signal,
      headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:prompt}]}],
        generationConfig:{maxOutputTokens:500,temperature:1.05}
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data?.error?.message||`Gemini ${r.status}`);
    return extractText(data);
  }finally{ clearTimeout(timer); }
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  const apiKey=process.env.GEMINI_API_KEY||"";
  if(!apiKey) return res.status(503).json({error:"Chưa cấu hình GEMINI_API_KEY trên Vercel."});

  const style=clean(req.body?.messageStyle,2500);
  const instructions=clean(req.body?.instructions,2500);
  const current=clean(req.body?.current,3000);
  const count=Math.max(3,Math.min(8,Number(req.body?.count)||6));
  const prompt=`Bạn đang viết câu chào mở đầu cho khung chat tư vấn điện thoại của Siêu Di Động ở Quy Nhơn.
Hãy tạo đúng ${count} câu chào KHÁC NHAU, nghe như nhân viên trẻ đang trực chat thật, thân thiện và tự nhiên.
Mỗi câu chỉ 1 dòng, khoảng 8-18 từ, tiếng Việt đời thường. Có thể viết tắt nhẹ như b, ko, nha, nè, á nhưng đừng lạm dụng.
Không ghi tên nhân viên trong câu vì tên đã hiện ở header. Không báo giá, không quảng cáo dài, không dùng icon/emoji, không đánh số, không dấu gạch đầu dòng.
Mục tiêu: mở lời và gợi khách nói nhu cầu/tầm giá/mẫu máy đang quan tâm.
Phong cách đang cấu hình: ${style||"ngắn gọn, bình dân, tự nhiên"}.
Chỉ dẫn tư vấn: ${instructions||"tư vấn đúng nhu cầu, không văn phong tổng đài"}.
Các câu đang có để tránh lặp ý nguyên văn:\n${current||"(chưa có)"}
Chỉ trả về ${count} dòng câu chào, không giải thích.`;

  const configured=String(process.env.GEMINI_CHAT_MODEL||"").trim();
  const models=[configured||"gemini-2.5-flash-lite","gemini-2.5-flash","gemini-3.1-flash-lite"].filter((x,i,a)=>x&&a.indexOf(x)===i);
  let lastErr="";
  for(const model of models){
    try{
      const raw=await callGemini(model,apiKey,prompt);
      const lines=parseLines(raw);
      if(lines.length>=3) return res.status(200).json({ok:true,lines,model});
      lastErr="AI trả về quá ít câu hợp lệ";
    }catch(e){ lastErr=e?.message||String(e); }
  }
  return res.status(502).json({error:"AI chưa viết được câu chào. "+lastErr});
}
