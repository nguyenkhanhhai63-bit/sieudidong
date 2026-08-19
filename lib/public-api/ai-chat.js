import { redisCommand } from "../redis.js";

function clean(v,max=4000){
  return String(v??"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .replace(/[<>]/g,"")
    .trim()
    .slice(0,max);
}

function clientIp(req){
  return String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown")
    .split(",")[0].trim().slice(0,100);
}

async function rateLimit(req){
  const key=`ai-chat:rate:${clientIp(req)}`;
  try{
    const n=Number(await redisCommand(["INCR",key])||1);
    if(n===1) await redisCommand(["EXPIRE",key,"3600"]);
    return n<=50;
  }catch(_){
    return true;
  }
}

function normalizeProduct(p){
  return {
    name:clean(p?.name,180),
    minPrice:Number(p?.minPrice||0),
    maxPrice:Number(p?.maxPrice||0),
    inStock:Boolean(p?.inStock),
    brand:clean(p?.brand,80)
  };
}

async function callGemini(model,apiKey,systemInstruction,input){
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);

  try{
    const r=await fetch(endpoint,{
      method:"POST",
      signal:controller.signal,
      headers:{
        "Content-Type":"application/json",
        "x-goog-api-key":apiKey
      },
      body:JSON.stringify({
        system_instruction:{parts:[{text:systemInstruction}]},
        contents:[{role:"user",parts:[{text:input}]}],
        generationConfig:{
          maxOutputTokens:800,
          temperature:.35,
          thinkingConfig:model.startsWith("gemini-2.5")
            ? {thinkingBudget:0}
            : {thinkingLevel:"LOW"}
        }
      })
    });
    const data=await r.json().catch(()=>({}));
    return {r,data};
  }finally{
    clearTimeout(timer);
  }
}

function responseText(data){
  const parts=[];
  for(const c of (Array.isArray(data?.candidates)?data.candidates:[])){
    for(const p of (Array.isArray(c?.content?.parts)?c.content.parts:[])){
      if(typeof p?.text==="string"&&p.text.trim()) parts.push(p.text.trim());
    }
  }
  return parts.join("\n").trim();
}

async function loadChatSettings(){
  const defaults={
    chatInstructions:"Tư vấn ngắn gọn, bình dân, dễ hiểu. Hỏi nhu cầu nếu khách nói chưa rõ. Chỉ tư vấn dựa trên dữ liệu sản phẩm website gửi lên.",
    chatWelcomeMessage:"Chào bạn, cần tìm máy tầm giá nào hoặc muốn hỏi gì về Siêu Di Động?",
    chatStoreFacts:"Website: sieudidong.vn. Khu vực: Quy Nhơn. Zalo tư vấn: 0353105423.",
    chatHandoffRules:"Chỉ chuyển sang nhân viên khi cần xác nhận giá/tồn kho, địa chỉ, giờ mở cửa, chính sách hoặc khi dữ liệu AI không đủ.",
    chatSuggestions:'Máy dưới 10 triệu | Tư vấn giúp tôi máy dưới 10 triệu đang còn hàng\nPin trâu | Máy nào pin trâu đang còn hàng?\nChụp ảnh đẹp | Tôi cần máy chụp ảnh đẹp, tư vấn giúp tôi\nThông tin shop | Siêu Di Động ở đâu và liên hệ mua hàng thế nào?'
  };
  try{
    const raw=await redisCommand(["GET","ai:compare:settings"]);
    if(!raw) return defaults;
    const x=JSON.parse(raw)||{};
    return {
      chatInstructions:clean(x.chatInstructions,4000)||defaults.chatInstructions,
      chatWelcomeMessage:clean(x.chatWelcomeMessage,500)||defaults.chatWelcomeMessage,
      chatStoreFacts:clean(x.chatStoreFacts,2500)||defaults.chatStoreFacts,
      chatHandoffRules:clean(x.chatHandoffRules,1500)||defaults.chatHandoffRules,
      chatSuggestions:clean(x.chatSuggestions,4000)||defaults.chatSuggestions
    };
  }catch(_){
    return defaults;
  }
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  const chatSettings=await loadChatSettings();

  if(req.method==="GET"){
    return res.status(200).json({
      ok:true,
      welcomeMessage:chatSettings.chatWelcomeMessage,
      suggestions:chatSettings.chatSuggestions
    });
  }

  if(req.method!=="POST"){
    res.setHeader("Allow","GET, POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  const apiKey=process.env.GEMINI_API_KEY||"";
  if(!apiKey){
    return res.status(503).json({error:"AI tư vấn đang tạm thời chưa sẵn sàng."});
  }

  if(!(await rateLimit(req))){
    return res.status(429).json({error:"AI đang được sử dụng nhiều. Vui lòng thử lại sau ít phút."});
  }

  const message=clean(req.body?.message,1200);
  if(!message){
    return res.status(400).json({error:"Bạn chưa nhập câu hỏi."});
  }

  const products=(Array.isArray(req.body?.products)?req.body.products:[])
    .slice(0,14)
    .map(normalizeProduct)
    .filter(x=>x.name);

  const history=(Array.isArray(req.body?.history)?req.body.history:[])
    .slice(-6)
    .map(x=>({
      role:x?.role==="assistant"?"AI":"Khách",
      text:clean(x?.text,700)
    }))
    .filter(x=>x.text);

  let seo={};
  try{
    const raw=await redisCommand(["GET","seo:site:settings"]);
    if(raw) seo=JSON.parse(raw)||{};
  }catch(_){}

  const catalog=products.length
    ? products.map((p,i)=>{
        const price=p.minPrice
          ? (p.maxPrice&&p.maxPrice!==p.minPrice
              ? `${p.minPrice.toLocaleString("vi-VN")} - ${p.maxPrice.toLocaleString("vi-VN")} đ`
              : `${p.minPrice.toLocaleString("vi-VN")} đ`)
          : "Chưa có giá";
        return `${i+1}. ${p.name} | ${price} | ${p.inStock?"Còn hàng":"Hết hàng"}${p.brand?` | ${p.brand}`:""}`;
      }).join("\n")
    : "Không có sản phẩm phù hợp được gửi lên.";

  const historyText=history.length
    ? history.map(x=>`${x.role}: ${x.text}`).join("\n")
    : "Chưa có hội thoại trước.";

  const storeName=clean(seo.siteName,80)||"Siêu Di Động";
  const area=clean(seo.areaServed,80)||"Quy Nhơn";

  const systemInstruction=[
    `Bạn là trợ lý tư vấn bán hàng của ${storeName} tại ${area}.`,
    `CHỈ DẪN ĐÀO TẠO TỪ QUẢN TRỊ: ${chatSettings.chatInstructions}`,
    `THÔNG TIN SIÊU DI ĐỘNG DO QUẢN TRỊ CUNG CẤP: ${chatSettings.chatStoreFacts}`,
    `QUY TẮC CHUYỂN NHÂN VIÊN: ${chatSettings.chatHandoffRules}`,
    "Nói tiếng Việt tự nhiên, ngắn gọn, bình dân, dễ hiểu.",
    "Mục tiêu: trả lời câu hỏi về điện thoại/sản phẩm đang bán và thông tin cơ bản của Siêu Di Động.",
    "CHỈ được dùng dữ liệu sản phẩm trong DANH SÁCH SẢN PHẨM được gửi trong yêu cầu. Không tự bịa giá, tồn kho, cấu hình hay chương trình khuyến mãi.",
    "Nếu hỏi giá/tồn kho mà sản phẩm không nằm trong dữ liệu, nói chưa thấy dữ liệu và hướng khách liên hệ nhân viên.",
    "Nếu tư vấn máy, ưu tiên gợi ý tối đa 3 máy và nêu ngắn lý do.",
    "Nếu sản phẩm hết hàng, phải nói rõ hết hàng; không được chốt như đang còn hàng.",
    "Nếu khách hỏi địa chỉ chính xác, giờ mở cửa, chính sách hoặc thông tin chưa được cung cấp, không bịa; hướng khách bấm Zalo để nhân viên xác nhận.",
    "Ưu tiên tự tư vấn bằng AI trước. Chỉ gợi ý nhân viên tư vấn trực tiếp khi cần xác nhận giá/tồn kho, thông tin cửa hàng, chính sách, hoặc khi dữ liệu chưa đủ. Không đẩy khách sang Zalo quá sớm.",
    "Không dùng Markdown table. Không viết bài dài. Thông thường 2-6 câu là đủ."
  ].join(" ");

  const input=`CÂU HỎI HIỆN TẠI:
${message}

HỘI THOẠI GẦN NHẤT:
${historyText}

DANH SÁCH SẢN PHẨM LIÊN QUAN TỪ WEBSITE:
${catalog}

Trả lời trực tiếp câu hỏi của khách.`;

  const configured=String(process.env.GEMINI_CHAT_MODEL||"").trim();
  const candidates=[
    configured||"gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
  ].filter((x,i,a)=>x&&a.indexOf(x)===i);

  let lastError="";
  for(const model of candidates){
    try{
      const {r,data}=await callGemini(model,apiKey,systemInstruction,input);
      if(r.ok){
        const text=responseText(data);
        if(text) return res.status(200).json({ok:true,text,model});
      }
      lastError=clean(data?.error?.message,500)||`Gemini ${r.status}`;
      if(![400,404,429,500,503].includes(r.status)) break;
    }catch(err){
      lastError=err?.name==="AbortError"?"AI phản hồi quá lâu.":clean(err?.message,500);
    }
  }

  console.error("AI chat:",lastError);
  return res.status(503).json({
    error:"AI tư vấn đang bận. Bạn thử lại sau hoặc liên hệ Zalo với nhân viên."
  });
}
