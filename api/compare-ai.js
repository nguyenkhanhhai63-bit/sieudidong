
import { redisCommand } from "../lib/redis.js";

function clean(v,max=5000){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .trim()
    .slice(0,max);
}

function clientIp(req){
  return String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown")
    .split(",")[0].trim().slice(0,100);
}

async function rateLimit(req){
  const key=`compare-ai:rate:${clientIp(req)}`;
  try{
    const n=Number(await redisCommand(["INCR",key])||1);
    if(n===1) await redisCommand(["EXPIRE",key,"3600"]);
    return {ok:n<=12,count:n};
  }catch(_){
    // Nếu Redis lỗi thì không làm hỏng tính năng.
    return {ok:true,count:0};
  }
}

function normalizeProduct(p){
  const specs=Array.isArray(p?.specs) ? p.specs.slice(0,30).map(x=>({
    label:clean(x?.label,120),
    value:clean(x?.value,1000)
  })).filter(x=>x.label) : [];

  return {
    name:clean(p?.name,180),
    price:Number(p?.price||0),
    inStock:Boolean(p?.inStock),
    specs
  };
}

function extractResponseText(data){
  const parts=[];
  for(const candidate of (Array.isArray(data?.candidates)?data.candidates:[])){
    for(const part of (Array.isArray(candidate?.content?.parts)?candidate.content.parts:[])){
      if(typeof part?.text==="string" && part.text.trim()){
        parts.push(part.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  const apiKey=process.env.GEMINI_API_KEY||"";
  if(!apiKey){
    return res.status(503).json({
      error:"Chưa cấu hình GEMINI_API_KEY trên Vercel."
    });
  }

  const limit=await rateLimit(req);
  if(!limit.ok){
    return res.status(429).json({
      error:"Bạn đã dùng AI phân tích khá nhiều. Vui lòng thử lại sau."
    });
  }

  const products=(Array.isArray(req.body?.products)?req.body.products:[])
    .slice(0,3)
    .map(normalizeProduct)
    .filter(x=>x.name);

  if(products.length<2){
    return res.status(400).json({error:"Cần ít nhất 2 sản phẩm để AI phân tích."});
  }

  const need=clean(req.body?.need,100) || "Cân bằng";
  const model=process.env.GEMINI_COMPARE_MODEL || "gemini-3.7-flash";

  const productText=products.map((p,i)=>{
    const specText=p.specs.map(s=>`- ${s.label}: ${s.value}`).join("\n");
    return [
      `SẢN PHẨM ${i+1}: ${p.name}`,
      `Giá: ${p.price ? p.price.toLocaleString("vi-VN")+" đ" : "Chưa có giá"}`,
      `Tình trạng: ${p.inStock ? "Còn hàng" : "Hết hàng"}`,
      specText || "- Chưa có thông số kỹ thuật"
    ].join("\n");
  }).join("\n\n");

  const input=`NHU CẦU ƯU TIÊN CỦA KHÁCH: ${need}

DỮ LIỆU CÁC MÁY ĐANG SO SÁNH:
${productText}

Hãy phân tích đủ 4 phần bắt buộc. Ưu tiên kết luận rõ máy nào đáng chọn hơn cho nhu cầu trên.`;

  try{
    const systemInstruction=[
      "Bạn là chuyên viên tư vấn smartphone của Siêu Di Động Quy Nhơn.",
      "CHỈ được dùng dữ liệu sản phẩm được gửi trong yêu cầu; không tự thêm thông số bên ngoài.",
      "Nếu một thông số thiếu, ghi rõ 'chưa có dữ liệu', không suy đoán.",
      "Mục tiêu là giúp khách chọn máy nhanh, không viết lan man.",
      "BẮT BUỘC trả lời đủ 4 phần theo đúng thứ tự:",
      "1. NHẬN XÉT NHANH: 2-3 câu so sánh tổng quan.",
      "2. TỪNG MÁY: mỗi máy nêu 2-4 ưu điểm và 1-2 điểm hạn chế dựa trên dữ liệu.",
      "3. THEO NHU CẦU: nói máy nào hơn về nhu cầu khách chọn và lý do cụ thể.",
      "4. KẾT LUẬN: chọn 1 máy phù hợp nhất; nếu hai máy quá sát nhau thì nêu điều kiện chọn từng máy.",
      "Phải xét giá bán nếu có. Không dùng bảng Markdown. Không lặp lại toàn bộ thông số kỹ thuật.",
      "Viết tiếng Việt tự nhiên, rõ ràng, khoảng 250-450 từ."
    ].join(" ");

    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);

    let r;
    try{
      r=await fetch(endpoint,{
        method:"POST",
        signal:controller.signal,
        headers:{
          "Content-Type":"application/json",
          "x-goog-api-key":apiKey
        },
        body:JSON.stringify({
          system_instruction:{
            parts:[{text:systemInstruction}]
          },
          contents:[{
            role:"user",
            parts:[{text:input}]
          }],
          generationConfig:{
            maxOutputTokens:1600,
            thinkingConfig:{
              thinkingLevel:"low"
            }
          }
        })
      });
    }finally{
      clearTimeout(timer);
    }

    const data=await r.json().catch(()=>({}));

    if(!r.ok){
      console.error("Gemini compare error:",r.status,data);
      const googleMessage=String(data?.error?.message||"").slice(0,180);
      return res.status(502).json({
        error: r.status===429
          ? "Gemini đang giới hạn lượt dùng. Vui lòng thử lại sau ít phút."
          : (googleMessage ? `Gemini lỗi: ${googleMessage}` : "Gemini đang bận. Vui lòng thử lại.")
      });
    }

    const text=extractResponseText(data);
    if(!text){
      return res.status(502).json({error:"AI chưa trả về nội dung phân tích."});
    }

    return res.status(200).json({ok:true,text,model});
  }catch(err){
    console.error("AI compare:",err);
    return res.status(502).json({error:err?.name==="AbortError" ? "Gemini mất hơn 30 giây để phản hồi. Vui lòng thử lại." : "Không kết nối được Gemini. Vui lòng thử lại."});
  }
}
