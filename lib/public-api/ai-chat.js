import { redisCommand } from "../redis.js";
import { lookupWarrantyByPhone, warrantyDigits } from "../warranty-service.js";

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
  const raw=p?.inStock;
  const inStock=raw===true || raw===1 || raw==="1" || String(raw).toLowerCase()==="true";
  return {
    name:clean(p?.name,180),
    minPrice:Number(p?.minPrice||0),
    maxPrice:Number(p?.maxPrice||0),
    inStock,
    stockStatus:inStock?"Còn hàng":"Hết hàng",
    stockQty:Math.max(0,Number(p?.stockQty||0)),
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


function redisHashObject(raw){
  if(!raw) return {};
  if(Array.isArray(raw)){
    const out={};
    for(let i=0;i<raw.length;i+=2){
      const k=String(raw[i]??"");
      if(k) out[k]=String(raw[i+1]??"");
    }
    return out;
  }
  return typeof raw==="object"?{...raw}:{};
}

async function loadChatSettings(){
  const defaults={
    chatInstructions:"Tư vấn ngắn gọn, bình dân, dễ hiểu. Hỏi nhu cầu nếu khách nói chưa rõ. Chỉ tư vấn dựa trên dữ liệu sản phẩm website gửi lên.",
    chatWelcomeMessage:"Chào bạn, cần tìm máy tầm giá nào hoặc muốn hỏi gì về Siêu Di Động?",
    chatStoreFacts:"Website: sieudidong.vn. Khu vực: Quy Nhơn. Zalo tư vấn: 0353105423.",
    chatHandoffRules:"Chỉ chuyển sang nhân viên khi cần xác nhận giá/tồn kho, địa chỉ, giờ mở cửa, chính sách hoặc khi dữ liệu AI không đủ.",
    chatSuggestions:"Máy dưới 10 triệu | Tư vấn giúp tôi máy dưới 10 triệu đang còn hàng\nPin trâu | Máy nào pin trâu đang còn hàng?\nChụp ảnh đẹp | Tôi cần máy chụp ảnh đẹp, tư vấn giúp tôi\nThông tin shop | Siêu Di Động ở đâu và liên hệ mua hàng thế nào?"
  };

  // V169: nguồn chính là key riêng của Đào tạo AI.
  try{
    const raw=await redisCommand(["GET","ai:chat:training:v3"]);
    if(raw){
      const x=JSON.parse(raw)||{};
      return {
        chatInstructions:clean(x.chatInstructions,4000)||defaults.chatInstructions,
        chatWelcomeMessage:clean(x.chatWelcomeMessage,500)||defaults.chatWelcomeMessage,
        chatStoreFacts:clean(x.chatStoreFacts,2500)||defaults.chatStoreFacts,
        chatHandoffRules:clean(x.chatHandoffRules,1500)||defaults.chatHandoffRules,
        chatSuggestions:clean(x.chatSuggestions,4000)||defaults.chatSuggestions
      };
    }
  }catch(_){}

  // Fallback dữ liệu cũ để không mất cấu hình trong lúc chuyển phiên bản.
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


function normSearch(s=""){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function isStockQuestion(message=""){
  const q=normSearch(message);
  return [
    "con hang","het hang","co hang","con khong","hang khong",
    "ton kho","con may","co san","san hang"
  ].some(x=>q.includes(x));
}

function directStockAnswer(message,products=[]){
  if(!isStockQuestion(message) || !products.length) return "";

  const q=normSearch(message);
  const meaningful=q.split(" ").filter(t=>t.length>=2 && ![
    "con","hang","het","co","khong","ton","kho","may","shop","nay","do","ban"
  ].includes(t));

  const ranked=products.map((p,index)=>{
    const n=normSearch(p.name);
    let score=Math.max(0,4-index*.1);
    meaningful.forEach(t=>{
      if(n.includes(t)) score += t.length>=5?6:3;
    });
    return {p,score};
  }).sort((a,b)=>b.score-a.score);

  // Nếu khách hỏi rõ một máy, trả tồn kho trực tiếp từ dữ liệu web,
  // không đưa Gemini phán đoán lại.
  const best=ranked[0];
  if(best && (best.score>=7 || products.length===1)){
    return `Theo tình trạng đang hiển thị trên website, ${best.p.name} hiện ${best.p.inStock?"CÒN HÀNG":"HẾT HÀNG"}.`;
  }

  // Câu hỏi chung "máy nào còn hàng?"
  if(q.includes("con hang") || q.includes("co hang") || q.includes("co san")){
    const available=products.filter(p=>p.inStock).slice(0,3);
    if(available.length){
      return `Theo dữ liệu sản phẩm đang hiển thị trên website, hiện có: ${available.map(p=>p.name).join(", ")}.`;
    }
  }

  return "";
}


function isWarrantyIntent(message="",history=[]){
  const haystack=normSearch(
    message+" "+history.map(x=>String(x?.text||"")).join(" ")
  );
  return [
    "bao hanh","tra cuu bao hanh","con bao hanh","het bao hanh",
    "bao hanh den","bao hanh may","kiem tra bao hanh",
    "doi 1 1","1 doi 1","loi nha san xuat","loi nsx"
  ].some(k=>haystack.includes(k));
}

function extractVietnamPhone(message=""){
  const candidates=String(message||"").match(/(?:\+?84|0)[\d\s.\-]{8,14}\d/g)||[];
  for(const raw of candidates){
    let d=warrantyDigits(raw);
    if(d.startsWith("84") && d.length>=11) d="0"+d.slice(2);
    if(d.length>=9 && d.length<=11) return d;
  }

  // Follow-up có thể chỉ gửi 10 chữ số.
  const only=warrantyDigits(message);
  if(/^(0\d{8,10})$/.test(only)) return only;
  return "";
}

function relevantWarrantyItems(message="",items=[]){
  if(items.length<=1) return items;
  const q=normSearch(message);
  const ignore=new Set([
    "bao","hanh","tra","cuu","con","het","may","cua","toi","kiem","check",
    "sdt","so","dien","thoai","khong","giup","minh","voi"
  ]);
  const tokens=q.split(" ").filter(t=>t.length>=2&&!ignore.has(t)&&!/^\d{9,11}$/.test(t));
  if(!tokens.length) return items;

  const scored=items.map(item=>{
    const n=normSearch(item.productName);
    let score=0;
    for(const t of tokens){
      if(n.includes(t)) score+=t.length>=5?5:2;
    }
    return {item,score};
  }).sort((a,b)=>b.score-a.score);

  return scored[0]?.score>=5 ? [scored[0].item] : items;
}

function warrantyAnswer(result,message=""){
  if(!result?.found || !result?.items?.length){
    return result?.message||"Không tìm thấy lịch sử mua hàng với số điện thoại này.";
  }

  const items=relevantWarrantyItems(message,result.items).slice(0,4);

  if(items.length===1){
    const x=items[0];
    const state=x.inWarranty
      ? `còn bảo hành đến ${x.warrantyEnd}, còn ${x.remainingDays} ngày`
      : `đã hết bảo hành từ ${x.warrantyEnd}`;

    let answer=`${x.productName}: ${state}. Ngày mua ${x.purchaseDate}.`;
    if(x.inWarranty && x.exchangeEnd){
      answer+=` Chính sách 1 đổi 1 trong tháng đầu tiên nếu có lỗi do nhà sản xuất áp dụng đến ${x.exchangeEnd}.`;
    }
    return answer;
  }

  const lines=items.map((x,i)=>{
    const state=x.inWarranty
      ? `còn BH đến ${x.warrantyEnd} (${x.remainingDays} ngày)`
      : `hết BH ${x.warrantyEnd}`;
    return `${i+1}. ${x.productName} — mua ${x.purchaseDate}, ${state}.`;
  });

  return `Tìm thấy ${result.items.length} sản phẩm theo số điện thoại này:\n${lines.join("\n")}`;
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

  const history=(Array.isArray(req.body?.history)?req.body.history:[])
    .slice(-6)
    .map(x=>({
      role:x?.role==="assistant"?"AI":"Khách",
      text:clean(x?.text,700)
    }))
    .filter(x=>x.text);

  // V202: Tra cứu bảo hành là dữ liệu xác định từ hệ thống,
  // xử lý trực tiếp trên server, không gửi số điện thoại/lịch sử mua hàng cho Gemini.
  if(isWarrantyIntent(message,history)){
    const phone=extractVietnamPhone(message);

    if(!phone){
      return res.status(200).json({
        ok:true,
        text:"Bạn gửi số điện thoại đã dùng khi mua hàng, mình kiểm tra bảo hành ngay.",
        source:"warranty-system",
        deterministic:true,
        needsPhone:true
      });
    }

    try{
      const warranty=await lookupWarrantyByPhone(phone);
      if(warranty?.code==="INVALID_PHONE"){
        return res.status(200).json({
          ok:true,
          text:"Số điện thoại chưa đúng. Bạn gửi lại số đã dùng khi mua hàng nhé.",
          source:"warranty-system",
          deterministic:true,
          needsPhone:true
        });
      }

      return res.status(200).json({
        ok:true,
        text:warrantyAnswer(warranty,message),
        source:"warranty-system",
        deterministic:true,
        warranty:true
      });
    }catch(err){
      console.error("AI warranty lookup:",err);
      return res.status(200).json({
        ok:true,
        text:"Hệ thống tra cứu bảo hành đang tạm bận. Bạn thử lại sau một chút nhé.",
        source:"warranty-system",
        deterministic:true
      });
    }
  }

  const products=(Array.isArray(req.body?.products)?req.body.products:[])
    .slice(0,14)
    .map(normalizeProduct)
    .filter(x=>x.name);

  // Tồn kho là dữ liệu xác định từ website, không để model tự suy diễn.
  const stockAnswer=directStockAnswer(message,products);
  if(stockAnswer){
    return res.status(200).json({
      ok:true,
      text:stockAnswer,
      source:"website-product-data",
      deterministic:true
    });
  }

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
        return `${i+1}. ${p.name} | Giá web: ${price} | TÌNH TRẠNG WEB: ${p.stockStatus}${p.brand?` | ${p.brand}`:""}`;
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
    "QUAN TRỌNG NHẤT: giá và tình trạng CÒN HÀNG/HẾT HÀNG trong DANH SÁCH SẢN PHẨM LIÊN QUAN TỪ WEBSITE là nguồn sự thật duy nhất và ưu tiên cao nhất. Không được dùng kiến thức riêng, hội thoại cũ hay chỉ dẫn đào tạo để phủ định dữ liệu này.",
    "Nếu danh sách ghi CÒN HÀNG thì tuyệt đối không được nói hết hàng, tạm hết, cần kiểm tra lại hay chưa rõ tồn kho. Nếu danh sách ghi HẾT HÀNG thì tuyệt đối không nói còn hàng.",
    "Khi khách hỏi sản phẩm đang có trên website, phải dựa đúng giá và tình trạng website gửi trong lượt hỏi hiện tại.",
    "Nếu hỏi giá/tồn kho mà sản phẩm không nằm trong dữ liệu, nói chưa thấy dữ liệu và hướng khách liên hệ nhân viên.",
    "Nếu tư vấn máy, ưu tiên gợi ý tối đa 3 máy và nêu ngắn lý do.",
    "Nếu sản phẩm hết hàng, phải nói rõ hết hàng; không được chốt như đang còn hàng.",
    "Nếu khách hỏi địa chỉ chính xác, giờ mở cửa, chính sách hoặc thông tin chưa được cung cấp, không bịa; hướng khách bấm Zalo để nhân viên xác nhận.",
    "Ưu tiên tự tư vấn bằng AI trước. Với giá/tồn kho đã có trong DANH SÁCH SẢN PHẨM thì trả lời thẳng theo website, KHÔNG bắt khách sang Zalo để xác nhận lại. Chỉ gợi ý nhân viên khi dữ liệu sản phẩm hiện tại không có thông tin cần hỏi, hoặc khách chủ động muốn gặp nhân viên.",
    "Nếu khách hỏi bảo hành, ưu tiên hệ thống tra cứu bảo hành. Tuyệt đối không tự suy đoán ngày mua hoặc thời hạn bảo hành.",
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
