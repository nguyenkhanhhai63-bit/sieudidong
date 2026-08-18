
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

async function rateLimit(req,requestId=""){
  const ip=clientIp(req);
  const requestKey=clean(requestId,120);

  // Nếu frontend retry cùng một lần bấm, requestId giống nhau => không tính thêm lượt.
  if(requestKey){
    const seenKey=`compare-ai:req:${ip}:${requestKey}`;
    try{
      const seen=Number(await redisCommand(["SET",seenKey,"1","NX","EX","3600"])||0);
      if(!seen){
        return {ok:true,counted:false,count:0};
      }
    }catch(_){}
  }

  const key=`compare-ai:rate:${ip}`;
  try{
    const n=Number(await redisCommand(["INCR",key])||1);
    if(n===1) await redisCommand(["EXPIRE",key,"3600"]);

    // Nới giới hạn lên 60 lượt / IP / giờ.
    return {ok:n<=60,counted:true,count:n};
  }catch(_){
    return {ok:true,counted:false,count:0};
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


function isRetriableGeminiError(status,data){
  const message=String(data?.error?.message||"").toLowerCase();
  return status===400 || status===404 || status===429 || status===503 || status===500 ||
    message.includes("high demand") ||
    message.includes("resource exhausted") ||
    message.includes("temporarily") ||
    message.includes("overloaded") ||
    message.includes("unavailable");
}

async function callGeminiModel(model,apiKey,input,systemInstruction,maxOutputTokens=1500){
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),22000);

  try{
    const r=await fetch(endpoint,{
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
          maxOutputTokens,
          // Gemini 2.5 không hỗ trợ thinkingLevel.
          // Dùng thinkingBudget cho 2.5; Gemini 3+ dùng thinkingLevel.
          thinkingConfig: model.startsWith("gemini-2.5")
            ? { thinkingBudget: 0 }
            : { thinkingLevel: "LOW" }
        }
      })
    });

    const data=await r.json().catch(()=>({}));
    return {r,data,model};
  }finally{
    clearTimeout(timer);
  }
}


const AI_SETTINGS_KEY="ai:compare:settings";

const DEFAULT_AI_SETTINGS={
  customInstructions:
    "Ưu tiên tư vấn thực tế, dễ hiểu. Không tâng bốc sản phẩm. Khi chênh lệch giá đáng kể phải nói rõ máy đắt hơn có thực sự đáng tiền hay không.",
  recommendationStyle:"Rõ ràng, chốt 1 máy",
  responseLength:"Vừa phải",
  pricePriority:"Cân bằng",
  salesTone:"Tư vấn trung lập",
  mustMentionWeaknesses:true,
  mustComparePrice:true,
  allowTieRecommendation:true
};

async function loadAiSettings(){
  try{
    const raw=await redisCommand(["GET",AI_SETTINGS_KEY]);
    if(!raw) return {...DEFAULT_AI_SETTINGS};
    const parsed=JSON.parse(raw);
    return {...DEFAULT_AI_SETTINGS,...parsed};
  }catch(_){
    return {...DEFAULT_AI_SETTINGS};
  }
}

function aiSettingsInstructions(settings){
  const parts=[
    `PHONG CÁCH TƯ VẤN DO QUẢN TRỊ CẤU HÌNH: ${settings.salesTone||"Tư vấn trung lập"}.`,
    `CÁCH KẾT LUẬN: ${settings.recommendationStyle||"Rõ ràng, chốt 1 máy"}.`,
    `MỨC ƯU TIÊN GIÁ/CẤU HÌNH: ${settings.pricePriority||"Cân bằng"}.`,
    settings.mustMentionWeaknesses!==false
      ? "BẮT BUỘC nêu cả điểm yếu/hạn chế của từng máy."
      : "Không bắt buộc phải nêu điểm yếu nếu không đáng kể.",
    settings.mustComparePrice!==false
      ? "BẮT BUỘC xét chênh lệch giá và giá trị nhận được."
      : "Không bắt buộc tập trung vào chênh lệch giá.",
    settings.allowTieRecommendation!==false
      ? "Được phép kết luận hòa nếu mỗi máy phù hợp một nhóm nhu cầu khác nhau."
      : "Phải chọn ra 1 máy phù hợp nhất.",
    settings.customInstructions
      ? `CHỈ DẪN RIÊNG TỪ QUẢN TRỊ: ${String(settings.customInstructions).slice(0,4000)}`
      : ""
  ];
  return parts.filter(Boolean).join(" ");
}

function maxTokensForSetting(settings){
  if(settings?.responseLength==="Ngắn gọn") return 850;
  if(settings?.responseLength==="Chi tiết") return 2200;
  return 1500;
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

  const requestId=clean(req.body?.requestId,120);
  const limit=await rateLimit(req,requestId);
  if(!limit.ok){
    return res.status(429).json({
      error:"AI đang được sử dụng khá nhiều. Vui lòng thử lại sau ít phút."
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
  const aiSettings=await loadAiSettings();
  const configuredModel=String(process.env.GEMINI_COMPARE_MODEL||"").trim();
  const fallbackModels=String(process.env.GEMINI_FALLBACK_MODELS||"gemini-2.5-flash-lite,gemini-2.5-flash,gemini-3.1-flash-lite")
    .split(",").map(x=>x.trim()).filter(Boolean);
  const modelCandidates=[configuredModel||"gemini-2.5-flash-lite",...fallbackModels]
    .filter((x,i,a)=>x && a.indexOf(x)===i);

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
      "Viết tiếng Việt tự nhiên, rõ ràng.",
      aiSettingsInstructions(aiSettings)
    ].join(" ");

    let finalData=null;
    let finalModel="";
    let lastStatus=0;
    let lastMessage="";

    for(let i=0;i<modelCandidates.length;i++){
      const candidate=modelCandidates[i];

      let result;
      try{
        result=await callGeminiModel(candidate,apiKey,input,systemInstruction,maxTokensForSetting(aiSettings));
      }catch(err){
        lastMessage=err?.name==="AbortError"
          ? "Gemini phản hồi quá lâu"
          : (err?.message||"Không kết nối được Gemini");

        // Timeout/network: thử model dự phòng tiếp theo.
        if(i<modelCandidates.length-1) continue;
        return res.status(502).json({
          error:"AI đang bận. Vui lòng thử lại sau ít phút."
        });
      }

      const {r,data}=result;
      lastStatus=r.status;
      lastMessage=String(data?.error?.message||"");

      if(r.ok){
        finalData=data;
        finalModel=candidate;
        break;
      }

      console.error("Gemini compare error:",candidate,r.status,data);

      if(isRetriableGeminiError(r.status,data) && i<modelCandidates.length-1){
        continue;
      }

      const publicMessage = r.status===429
        ? "AI đang bận do lượng truy cập cao. Vui lòng thử lại sau ít phút."
        : r.status===400 || r.status===404
          ? "Model Gemini hiện tại không khả dụng. Hệ thống đã thử model dự phòng nhưng chưa thành công."
          : "AI tạm thời chưa thể phân tích. Vui lòng thử lại.";
      return res.status(r.status===429 ? 429 : 502).json({
        error: publicMessage,
        code: `GEMINI_${r.status}`
      });
    }

    if(!finalData){
      return res.status(502).json({
        error:"AI đang bận. Vui lòng thử lại sau ít phút."
      });
    }

    const data=finalData;
    const text=extractResponseText(data);
    if(!text){
      return res.status(502).json({error:"AI chưa trả về nội dung phân tích."});
    }

    return res.status(200).json({ok:true,text,model:finalModel});
  }catch(err){
    console.error("AI compare:",err);
    return res.status(502).json({error:"AI tạm thời chưa thể phản hồi. Vui lòng thử lại sau ít phút."});
  }
}
