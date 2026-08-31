import { redisCommand } from "../redis.js";

function clean(v,max=3000){
  return String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim().slice(0,max);
}
function extractText(data){
  const out=[];
  for(const c of (Array.isArray(data?.candidates)?data.candidates:[])){
    for(const part of (Array.isArray(c?.content?.parts)?c.content.parts:[])){
      if(typeof part?.text==="string" && part.text.trim()) out.push(part.text.trim());
    }
  }
  return out.join(" ").replace(/\s+/g," ").trim();
}
async function loadSettings(){
  try{
    const raw=await redisCommand(["GET","ai:chat:training:v3"]);
    return raw?JSON.parse(raw)||{}:{};
  }catch(_){ return {}; }
}
async function callGemini(model,key,prompt){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",signal:controller.signal,
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:prompt}]}],
        generationConfig:{maxOutputTokens:100,temperature:1.25,topP:.95}
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data?.error?.message||`Gemini ${r.status}`);
    return extractText(data);
  }finally{ clearTimeout(timer); }
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }
  const key=process.env.GEMINI_API_KEY||"";
  if(!key) return res.status(503).json({error:"AI greeting unavailable"});
  const s=await loadSettings();
  const configuredPrompt=clean(s.chatWelcomePrompt,3000)||"Tự nghĩ 1 câu chào mở đầu ngắn gọn như nhân viên trẻ đang trực chat. Hỏi khách đang cần tìm máy/tầm giá hoặc cần hỗ trợ gì. Mỗi lần diễn đạt khác nhau.";
  const style=clean(s.chatMessageStyle,2200)||"ngắn, tự nhiên, bình dân";
  const staff=clean(req.body?.staffName,80);
  const previous=clean(req.body?.previousGreeting,300);
  const prompt=`Bạn đang đóng vai nhân viên tư vấn trực chat của Siêu Di Động ở Quy Nhơn.\nHãy tự nghĩ đúng 1 câu chào mở đầu MỚI cho khách vừa được kết nối.\nPROMPT CỦA SHOP: ${configuredPrompt}\nPHONG CÁCH NHẮN: ${style}\nTên nhân viên đang trực: ${staff||"không cần nhắc tên"}. Không tự giới thiệu tên nếu prompt không yêu cầu.\n${previous?`Câu gần nhất đã dùng: ${previous}. Tuyệt đối không lặp nguyên văn hoặc chỉ đổi 1-2 từ.`:""}\nYêu cầu bắt buộc: chỉ trả về 1 câu chào tiếng Việt, tối đa 24 từ; không markdown, không ngoặc kép, không giải thích, không emoji, không nói mình là AI.`;
  const configured=String(process.env.GEMINI_CHAT_MODEL||"").trim();
  const models=[configured||"gemini-2.5-flash-lite","gemini-2.5-flash","gemini-3.1-flash-lite"].filter((x,i,a)=>x&&a.indexOf(x)===i);
  for(const model of models){
    try{
      let text=await callGemini(model,key,prompt);
      text=text.replace(/^[-•*\d.)\s]+/,"").replace(/^[\"“”']|[\"“”']$/g,"").trim().slice(0,240);
      if(text.length>=6) return res.status(200).json({ok:true,greeting:text});
    }catch(_){ }
  }
  return res.status(502).json({error:"AI greeting failed"});
}
