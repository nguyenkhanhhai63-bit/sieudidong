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

const AI_KNOWLEDGE_KEY="ai:knowledge:items:v1";

async function loadAiKnowledge(){
  try{
    const raw=await redisCommand(["GET",AI_KNOWLEDGE_KEY]);
    if(!raw) return {items:[],text:"Chưa có kiến thức bổ sung từ shop."};
    const items=(JSON.parse(raw)||[]).filter(x=>x&&x.status==="answered"&&x.answer).slice(0,80);
    const text=items.length
      ? items.map((x,i)=>`${i+1}. Hỏi/Chủ đề: ${clean(x.question,500)} | Shop cung cấp: ${clean(x.answer,1200)}`).join("\n")
      : "Chưa có kiến thức bổ sung từ shop.";
    return {items,text};
  }catch(_){
    return {items:[],text:"Chưa có kiến thức bổ sung từ shop."};
  }
}

function missingInfoMarker(text=""){
  const matches=[...String(text).matchAll(/\[\[SHOP_NEEDS_INFO:\s*([\s\S]*?)\]\]/gi)];
  const missing=matches.map(m=>clean(m[1],1000)).filter(Boolean).join("; ");
  const visible=String(text).replace(/\s*\[\[SHOP_NEEDS_INFO:[\s\S]*?\]\]\s*/gi,"\n").replace(/\n{3,}/g,"\n\n").trim();
  return {visible,missing};
}

async function recordMissingInfo(question,missing){
  const q=clean(question,1200), m=clean(missing,1000);
  if(!q||!m) return;
  try{
    let items=[];
    const raw=await redisCommand(["GET",AI_KNOWLEDGE_KEY]);
    if(raw){ try{ const a=JSON.parse(raw); if(Array.isArray(a)) items=a; }catch(_){} }
    const nq=normSearch(q);
    let idx=items.findIndex(x=>x&&x.status!=="answered"&&normSearch(x.question)===nq);
    const now=new Date().toISOString();
    if(idx>=0){
      items[idx]={...items[idx],missing:m,count:Math.max(1,Number(items[idx].count||1))+1,lastAskedAt:now,updatedAt:now,status:"pending"};
    }else{
      items.unshift({id:`k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,question:q,missing:m,answer:"",count:1,firstAskedAt:now,lastAskedAt:now,status:"pending",source:"ai-chat",updatedAt:now});
    }
    await redisCommand(["SET",AI_KNOWLEDGE_KEY,JSON.stringify(items.slice(0,500))]);
  }catch(err){
    console.error("AI missing knowledge record:",err?.message||err);
  }
}

function chatTimingNum(v,min,max,fallback){
  const n=Number(v);
  return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback;
}

async function loadChatSettings(){
  const defaults={
    chatInstructions:"Tư vấn ngắn gọn, bình dân, dễ hiểu. Chủ động trả lời ngay khi hệ thống có dữ liệu. Hỏi thêm nhu cầu chỉ khi câu hỏi chưa đủ rõ. Không đẩy khách sang nhân viên nếu AI có thể trả lời từ dữ liệu website hoặc thông tin shop.",
    chatWelcomeMessage:"Chào bạn, cần tìm máy tầm giá nào hoặc muốn hỏi gì về Siêu Di Động?",
    chatWelcomeMessages:"Chào b nha, b đang cần tìm máy tầm giá nào á?\nHello b, cần mình tư vấn máy nào nè?\nChào b nha, b đang quan tâm máy nào để mình xem cho?\nB cần tìm máy tầm bao nhiêu tiền nè, mình tư vấn cho nha?\nChào b, cần hỏi gì về máy cứ nhắn mình nha.",
    chatStoreFacts:"Website: sieudidong.vn. Khu vực: Quy Nhơn. Zalo tư vấn: 0353105423.",
    chatHandoffRules:"Chỉ chuyển sang nhân viên khi khách chủ động yêu cầu gặp người thật, cần giữ/chốt máy, cần ảnh thực tế, thương lượng riêng, hoặc dữ liệu cần thiết thực sự không có trong hệ thống. Giá, tồn kho, bảo hành, trả góp, địa chỉ, giờ mở cửa và chính sách nếu đã có dữ liệu thì AI phải tự trả lời.",
    chatSuggestions:"Máy dưới 10 triệu | Tư vấn giúp tôi máy dưới 10 triệu đang còn hàng\nPin trâu | Máy nào pin trâu đang còn hàng?\nChụp ảnh đẹp | Tôi cần máy chụp ảnh đẹp, tư vấn giúp tôi\nThông tin shop | Siêu Di Động ở đâu và liên hệ mua hàng thế nào?",
    chatMessageStyle:"Nhắn như nhân viên trẻ đang trực shop: câu ngắn, tự nhiên, có thể viết tắt nhẹ như ko, đc, b, xíu; dùng nha, nè, á vừa phải; không văn phong tổng đài; mỗi ý ngắn tách thành một tin riêng.",
    chatStaffNames:"Hải\nMinh Đang\nTiến",
    chatTypingEnabled:true,chatInitialDelayMin:2800,chatInitialDelayMax:4500,chatBubbleDelayMin:1500,chatBubbleDelayMax:2800,chatInterMessageMin:900,chatInterMessageMax:1800
  };

  // V169: nguồn chính là key riêng của Đào tạo AI.
  try{
    const raw=await redisCommand(["GET","ai:chat:training:v3"]);
    if(raw){
      const x=JSON.parse(raw)||{};
      return {
        chatInstructions:clean(x.chatInstructions,4000)||defaults.chatInstructions,
        chatWelcomeMessage:clean(x.chatWelcomeMessage,500)||defaults.chatWelcomeMessage,
        chatWelcomeMessages:clean(x.chatWelcomeMessages,4000)||clean(x.chatWelcomeMessage,500)||defaults.chatWelcomeMessages,
        chatStoreFacts:clean(x.chatStoreFacts,2500)||defaults.chatStoreFacts,
        chatHandoffRules:clean(x.chatHandoffRules,1500)||defaults.chatHandoffRules,
        chatSuggestions:clean(x.chatSuggestions,4000)||defaults.chatSuggestions,
        chatMessageStyle:clean(x.chatMessageStyle,3000)||defaults.chatMessageStyle,
        chatStaffNames:clean(x.chatStaffNames,1000)||defaults.chatStaffNames,
        chatTypingEnabled:x.chatTypingEnabled!==false,
        chatInitialDelayMin:chatTimingNum(x.chatInitialDelayMin,300,15000,defaults.chatInitialDelayMin),
        chatInitialDelayMax:chatTimingNum(x.chatInitialDelayMax,300,20000,defaults.chatInitialDelayMax),
        chatBubbleDelayMin:chatTimingNum(x.chatBubbleDelayMin,250,10000,defaults.chatBubbleDelayMin),
        chatBubbleDelayMax:chatTimingNum(x.chatBubbleDelayMax,250,12000,defaults.chatBubbleDelayMax),
        chatInterMessageMin:chatTimingNum(x.chatInterMessageMin,100,8000,defaults.chatInterMessageMin),
        chatInterMessageMax:chatTimingNum(x.chatInterMessageMax,100,10000,defaults.chatInterMessageMax)
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
      chatWelcomeMessages:clean(x.chatWelcomeMessages,4000)||clean(x.chatWelcomeMessage,500)||defaults.chatWelcomeMessages,
      chatStoreFacts:clean(x.chatStoreFacts,2500)||defaults.chatStoreFacts,
      chatHandoffRules:clean(x.chatHandoffRules,1500)||defaults.chatHandoffRules,
      chatSuggestions:clean(x.chatSuggestions,4000)||defaults.chatSuggestions,
      chatMessageStyle:clean(x.chatMessageStyle,3000)||defaults.chatMessageStyle,
      chatStaffNames:clean(x.chatStaffNames,1000)||defaults.chatStaffNames,
      chatTypingEnabled:x.chatTypingEnabled!==false,
      chatInitialDelayMin:chatTimingNum(x.chatInitialDelayMin,300,15000,defaults.chatInitialDelayMin),
      chatInitialDelayMax:chatTimingNum(x.chatInitialDelayMax,300,20000,defaults.chatInitialDelayMax),
      chatBubbleDelayMin:chatTimingNum(x.chatBubbleDelayMin,250,10000,defaults.chatBubbleDelayMin),
      chatBubbleDelayMax:chatTimingNum(x.chatBubbleDelayMax,250,12000,defaults.chatBubbleDelayMax),
      chatInterMessageMin:chatTimingNum(x.chatInterMessageMin,100,8000,defaults.chatInterMessageMin),
      chatInterMessageMax:chatTimingNum(x.chatInterMessageMax,100,10000,defaults.chatInterMessageMax)
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


async function loadInstallmentSettings(){
  const defaults={
    intro:"Siêu Di Động có hỗ trợ trả góp qua công ty tài chính. Hồ sơ, số tiền trả trước, kỳ hạn và khoản góp phụ thuộc kết quả duyệt thực tế.",
    providers:[
      {id:"hd-saison",name:"HD SAISON",enabled:true},
      {id:"mirae-asset",name:"Mirae Asset",enabled:true}
    ]
  };
  try{
    const raw=await redisCommand(["GET","installment:site:settings"]);
    if(!raw) return defaults;
    const x=JSON.parse(raw)||{};
    return {
      intro:clean(x.intro,1000)||defaults.intro,
      providers:(Array.isArray(x.providers)?x.providers:defaults.providers)
        .filter(v=>v&&v.enabled!==false)
        .map(v=>({id:clean(v.id,60),name:clean(v.name,100),enabled:true}))
        .filter(v=>v.name)
        .slice(0,10)
    };
  }catch(_){
    return defaults;
  }
}

function isInstallmentIntent(message=""){
  const q=normSearch(message);
  return [
    "tra gop","tragop","gop qua cong ty tai chinh","cong ty tai chinh",
    "hd saison","mirae asset","mirae","saison","ho so tra gop",
    "tra truoc","ky han","gop thang","lai tra gop","lai suat","tien lai"
  ].some(x=>q.includes(x));
}

function isInstallmentDetailQuestion(message=""){
  const q=normSearch(message);
  return [
    "lai bao nhieu","lai tra gop","lai suat","tien lai","phan tram lai",
    "moi thang bao nhieu","thang bao nhieu","gop moi thang","dong moi thang",
    "tra truoc bao nhieu","can tra truoc","coc bao nhieu","ky han bao lau",
    "may thang","6 thang","9 thang","12 thang","18 thang","24 thang"
  ].some(x=>q.includes(x));
}

function knowledgeMatchesQuestion(message="",items=[]){
  const q=normSearch(message);
  const tokens=q.split(/\s+/).filter(x=>x.length>=3);
  if(!tokens.length) return false;
  return (Array.isArray(items)?items:[]).some(x=>{
    if(!x||x.status!=="answered"||!x.answer) return false;
    const hay=normSearch(`${x.question||""} ${x.missing||""} ${x.answer||""}`);
    const hits=tokens.filter(t=>hay.includes(t)).length;
    return hits>=Math.min(2,tokens.length) || (q.includes("lai")&&hay.includes("lai"));
  });
}


async function understandCustomerQuestion(message="",history=[],apiKey=""){
  const fallback=()=>{
    const q=normSearch(message);
    let intent="other";
    if(isInstallmentIntent(message)){
      if(["lai","lai suat","tien lai","phan tram"].some(x=>q.includes(x))) intent="installment_interest";
      else if(["tra truoc","coc"].some(x=>q.includes(x))) intent="installment_downpayment";
      else if(["moi thang","gop thang","dong thang"].some(x=>q.includes(x))) intent="installment_monthly";
      else if(["ky han","may thang","6 thang","9 thang","12 thang","18 thang","24 thang"].some(x=>q.includes(x))) intent="installment_term";
      else intent="installment_general";
    }else if(isStockQuestion(message)) intent="stock";
    else if(/bao hanh|\bbh\b/.test(q)) intent="warranty";
    else if(/gia bao nhieu|bao nhieu tien|gia may|gia con/.test(q)) intent="price";
    else if(/tu van|may nao|nen mua|chup dep|pin trau|choi game|hieu nang/.test(q)) intent="recommendation";
    else if(/thu cu|thu may|doi may|trade in/.test(q)) intent="tradein";
    else if(/sua|thay man|thay pin|ep kinh/.test(q)) intent="repair";
    else if(/dia chi|o dau|gio mo cua|may gio/.test(q)) intent="store_info";
    return {intent,focus:clean(message,300),target:"",confidence:.45,source:"fallback"};
  };
  if(!apiKey) return fallback();
  const recent=(Array.isArray(history)?history:[]).slice(-4).map(x=>`${x.role}: ${clean(x.text,500)}`).join("\n");
  const sys=[
    "Bạn là bộ phân tích ý định cho chat bán hàng điện thoại.",
    "Nhiệm vụ duy nhất: hiểu khách ĐANG HỎI ĐIỀU GÌ trước khi hệ thống chọn cách trả lời.",
    "Không trả lời câu hỏi của khách. Không giải thích suy luận.",
    "Chỉ xuất JSON hợp lệ, không markdown.",
    "intent phải là một trong: installment_general, installment_interest, installment_downpayment, installment_monthly, installment_term, stock, price, warranty, recommendation, store_info, policy, repair, tradein, product_info, order, human_request, other.",
    "focus là ý khách cần câu trả lời trực tiếp, thật ngắn.",
    "target là tên máy/đối tượng nếu khách có nhắc, nếu không thì để chuỗi rỗng.",
    "Nếu câu hiện tại ngắn hoặc dùng từ như 'cái đó', 'bao nhiêu', hãy dùng hội thoại gần nhất để hiểu ngữ cảnh.",
    "Ví dụ: 'lãi trả góp bao nhiêu' => installment_interest, không phải installment_general.",
    "Ví dụ: 'trả trước bao nhiêu' => installment_downpayment.",
    "Ví dụ: 'mỗi tháng đóng nhiêu' sau khi đang nói trả góp => installment_monthly."
  ].join(" ");
  const input=`CÂU HIỆN TẠI: ${clean(message,1200)}\nHỘI THOẠI GẦN NHẤT:\n${recent||"Không có"}\nXuất JSON dạng {"intent":"...","focus":"...","target":"...","confidence":0.0}`;
  try{
    const {r,data}=await callGemini("gemini-2.5-flash-lite",apiKey,sys,input);
    if(!r.ok) return fallback();
    const text=responseText(data).replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
    const obj=JSON.parse(text);
    const allowed=new Set(["installment_general","installment_interest","installment_downpayment","installment_monthly","installment_term","stock","price","warranty","recommendation","store_info","policy","repair","tradein","product_info","order","human_request","other"]);
    if(!allowed.has(obj?.intent)) return fallback();
    return {intent:obj.intent,focus:clean(obj.focus,400)||clean(message,300),target:clean(obj.target,200),confidence:Math.max(0,Math.min(1,Number(obj.confidence)||.7)),source:"semantic-router"};
  }catch(_){
    return fallback();
  }
}

function installmentMissingByIntent(intent){
  if(intent==="installment_interest") return "Mức lãi/lãi suất trả góp thực tế và cách tính lãi của công ty tài chính";
  if(intent==="installment_downpayment") return "Mức tiền hoặc tỷ lệ trả trước khi mua trả góp";
  if(intent==="installment_monthly") return "Khoản góp hàng tháng theo giá máy, tiền trả trước và kỳ hạn";
  if(intent==="installment_term") return "Các kỳ hạn trả góp đang áp dụng thực tế";
  return "Thông tin chi tiết về phương án trả góp";
}

function installmentGapReply(intent){
  if(intent==="installment_interest") return "Phần lãi trả góp mình chưa có mức chính xác để báo bạn.\nMình đã ghi lại để shop bổ sung cho AI, tránh báo sai nha.";
  if(intent==="installment_downpayment") return "Phần trả trước mình chưa có mức chính xác để báo bạn.\nMình đã ghi lại để shop bổ sung cho AI nha.";
  if(intent==="installment_monthly") return "Khoản góp mỗi tháng mình chưa đủ dữ liệu để tính chính xác.\nMình đã ghi lại để shop bổ sung cho AI nha.";
  if(intent==="installment_term") return "Kỳ hạn trả góp cụ thể mình chưa có dữ liệu chính xác.\nMình đã ghi lại để shop bổ sung cho AI nha.";
  return "Phần này mình chưa có số chính xác để báo bạn.\nMình đã ghi lại để shop bổ sung cho AI nha.";
}

function directInstallmentAnswer(settings={}){
  const providers=(Array.isArray(settings.providers)?settings.providers:[])
    .filter(x=>x&&x.enabled!==false&&x.name)
    .map(x=>x.name);
  const lines=["Có nha bạn."];
  if(providers.length) lines.push(`Shop đang làm qua ${providers.join(" với ")} á.`);
  lines.push("Cọc bao nhiêu với góp mấy tháng thì bên tài chính duyệt theo hồ sơ nha.");
  lines.push("Bạn đang ngắm máy nào gửi mình, mình coi giá rồi tính tiếp cho dễ nè.");
  return lines.join("\n");
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
  const current=normSearch(message).replace(/\s+/g," ").trim();

  const directPatterns=[
    /\bbh\b/,
    /\bbao\s*hanh\b/,
    /\bbao\s*han\b/,
    /\bbaohanh\b/,
    /\bcheck\s*bh\b/,
    /\bkiem\s*tra\s*bh\b/,
    /\bkiem\s*tra\s*bao\s*hanh\b/,
    /\btra\s*cuu\s*bh\b/,
    /\btra\s*cuu\s*bao\s*hanh\b/,
    /\bcon\s*bh\b/,
    /\bhet\s*bh\b/,
    /\bdoi\s*1\s*1\b/,
    /\b1\s*doi\s*1\b/
  ];
  if(directPatterns.some(rx=>rx.test(current))) return true;

  // Tin nhắn chỉ có SĐT vẫn tiếp tục tra cứu nếu câu trả lời AI NGAY TRƯỚC ĐÓ
  // đang yêu cầu số điện thoại để kiểm tra bảo hành.
  const phone=extractVietnamPhone(message);
  if(!phone) return false;

  const last=history[history.length-1];
  if(!last || last.role!=="assistant") return false;

  const t=normSearch(last.text||"");
  return (
    (t.includes("bao hanh") || t.includes("tra cuu")) &&
    (t.includes("so dien thoai") || t.includes("sdt"))
  );
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


function isPhoneOnlyMessage(message=""){
  const raw=String(message||"").trim();
  const phone=extractVietnamPhone(raw);
  if(!phone) return "";
  // Tin nhắn follow-up SĐT: cho phép dấu cách, chấm, gạch ngang, +84.
  const residue=raw.replace(/[+\d\s.\-()]/g,"").trim();
  return residue ? "" : phone;
}

function lastAssistantAskedWarrantyPhone(history=[]){
  for(let i=history.length-1;i>=0;i--){
    const x=history[i]||{};
    const isAI=
      x.role==="assistant" || x.role==="AI" ||
      x.sender==="bot" || x.sender==="assistant" || x.type==="bot";
    if(!isAI) continue;
    const t=normSearch(x.text||x.content||x.message||"");
    return (
      (t.includes("bao hanh") || t.includes("tra cuu")) &&
      (t.includes("so dien thoai") || t.includes("sdt") || t.includes("so dt"))
    );
  }
  return false;
}

async function directWarrantyResponse(res,phone,message="",replyFn=null){
  const send=async payload=>replyFn?await replyFn(payload):res.status(200).json(payload);
  try{
    const warranty=await lookupWarrantyByPhone(phone);
    if(warranty?.code==="INVALID_PHONE"){
      return await send({
        ok:true,
        text:"Số điện thoại chưa đúng. Bạn gửi lại số đã dùng khi mua hàng nhé.",
        source:"warranty-system", deterministic:true, warranty:true, needsPhone:true, warrantyPending:true
      });
    }
    return await send({
      ok:true, text:warrantyAnswer(warranty,message), source:"warranty-system", deterministic:true, warranty:true, warrantyPending:false, warrantyCompleted:true
    });
  }catch(err){
    console.error("Direct warranty lookup:",err);
    return await send({
      ok:true, text:"Mình chưa lấy được dữ liệu bảo hành từ hệ thống lúc này. Bạn thử lại sau ít phút nhé.", source:"warranty-system", deterministic:true, warranty:true, warrantyPending:false
    });
  }
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
      answer+=` Hỗ trợ đổi máy đến ${x.exchangeEnd}; điều kiện áp dụng xem tại Chính sách bảo hành.`;
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


function extractBudget(message=""){
  const raw=String(message||"");
  const m=raw.match(/(?:dưới|duoi|tầm|tam|khoảng|khoang|quanh|khoảng tầm)?\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr|củ|cu)\b/i);
  if(!m) return 0;
  const n=Number(String(m[1]).replace(",","."));
  return Number.isFinite(n)&&n>0 ? Math.round(n*1000000) : 0;
}

function productDataSummary(products=[],message=""){
  const priced=products.filter(p=>p.minPrice>0);
  const budget=extractBudget(message);
  if(!priced.length) return "Không có mẫu nào trong dữ liệu gửi lên có giá.";

  let list=[...priced];
  if(budget){
    // Tầm giá: ưu tiên máy đang còn hàng và gần ngân sách, không loại cứng các mẫu nhỉnh nhẹ.
    list.sort((a,b)=>{
      const stock=(b.inStock?1:0)-(a.inStock?1:0);
      if(stock) return stock;
      const da=Math.abs(a.minPrice-budget), db=Math.abs(b.minPrice-budget);
      return da-db;
    });
  }
  return `Có ${priced.length} mẫu có giá trong dữ liệu lượt này${budget?`, ngân sách khách nhắc khoảng ${budget.toLocaleString("vi-VN")} đ`:""}. `+
    `AI PHẢI chọn tên máy cụ thể từ danh sách, không được nói chung chung rằng chưa có giá nếu danh sách có giá.`;
}


const AI_CHAT_HISTORY_INDEX="ai:chat:history:index";
const AI_CHAT_HISTORY_PREFIX="ai:chat:history:";
function historyVnDay(){ return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10); }
function validHistorySessionId(v){ return /^[a-zA-Z0-9_-]{12,90}$/.test(String(v||"")); }
function cleanHistoryVisitor(v){
  const s=clean(v,80);
  return /^[A-Za-z0-9_-]{8,80}$/.test(s)?s:"Khách";
}
async function saveAiChatServerHistory({sessionId,visitorId,question,answer,page="/",source="",intent=""}={}){
  const q=clean(question,3000), a=clean(answer,5000);
  if(!q || !a) return false;
  const sid=validHistorySessionId(sessionId)?String(sessionId):`srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,12)}`;
  const now=Date.now();
  try{
    // 1) Nguồn cho thẻ “Lịch sử khách hỏi AI chatbox” ở Thống kê.
    const historyKey=`analytics:v5:ai_question_history:${historyVnDay()}`;
    const item=JSON.stringify({
      ts:now,
      visitorId:cleanHistoryVisitor(visitorId),
      sessionId:sid,
      question:q,
      answer:a,
      action:"ai_chat_answer_server",
      source:clean(source,80),
      intent:clean(intent,120)
    });
    await redisCommand(["LPUSH",historyKey,item]);
    await redisCommand(["LTRIM",historyKey,"0","499"]);
    await redisCommand(["EXPIRE",historyKey,String(400*24*60*60)]);

    // 2) Nguồn cho tab “Lịch sử hội thoại” trong Đào tạo AI.
    const key=AI_CHAT_HISTORY_PREFIX+sid;
    let data={sessionId:sid,startedAt:now,updatedAt:now,messages:[],page:"/",meta:{}};
    try{
      const raw=await redisCommand(["GET",key]);
      if(raw){ const parsed=JSON.parse(String(raw)); if(parsed&&typeof parsed==="object") data={...data,...parsed}; }
    }catch(_){}
    const last=data.messages?.slice(-2)||[];
    // Chống trùng khi frontend v418 cũng gửi /api/ai-chat-history thành công.
    const duplicate=last.length>=2 && last[last.length-2]?.role==="user" && last[last.length-2]?.text===q && last[last.length-1]?.role==="assistant" && last[last.length-1]?.text===a;
    if(!duplicate){
      data.messages=Array.isArray(data.messages)?data.messages:[];
      data.messages.push({role:"user",text:q,at:now});
      data.messages.push({role:"assistant",text:a,at:now});
      if(data.messages.length>80) data.messages=data.messages.slice(-80);
    }
    data.updatedAt=now;
    data.page=clean(page,180)||data.page||"/";
    data.meta={...(data.meta||{}),source:clean(source,80),intent:clean(intent,120)};
    await redisCommand(["SET",key,JSON.stringify(data),"EX",String(30*24*60*60)]);
    await redisCommand(["ZADD",AI_CHAT_HISTORY_INDEX,String(now),sid]);
    return true;
  }catch(err){
    console.error("AI server history save error",err);
    return false;
  }
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  const chatSettings=await loadChatSettings();
  const aiKnowledge=await loadAiKnowledge();

  if(req.method==="GET"){
    return res.status(200).json({
      ok:true,
      welcomeMessage:chatSettings.chatWelcomeMessage,
      welcomeMessages:String(chatSettings.chatWelcomeMessages||chatSettings.chatWelcomeMessage||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,20),
      suggestions:chatSettings.chatSuggestions,
      staffNames:String(chatSettings.chatStaffNames||"").split(/[\n,;|]+/).map(x=>x.trim()).filter(Boolean).slice(0,20),
      chatBehavior:{
        typingEnabled:chatSettings.chatTypingEnabled!==false,
        initialDelayMin:chatSettings.chatInitialDelayMin,
        initialDelayMax:chatSettings.chatInitialDelayMax,
        bubbleDelayMin:chatSettings.chatBubbleDelayMin,
        bubbleDelayMax:chatSettings.chatBubbleDelayMax,
        interMessageMin:chatSettings.chatInterMessageMin,
        interMessageMax:chatSettings.chatInterMessageMax
      }
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

  // V419: lưu lịch sử ngay TRONG request /api/ai-chat.
  // Không còn phụ thuộc request phụ từ trình duyệt nên chat thành công là lịch sử được ghi.
  const historyContext={
    sessionId:clean(req.body?.sessionId,90),
    visitorId:clean(req.body?.visitorId,80),
    page:clean(req.body?.page,180)||"/"
  };
  async function reply(payload){
    const text=clean(payload?.text,5000);
    let historySaved=false;
    if(text){
      historySaved=await saveAiChatServerHistory({
        ...historyContext,
        question:message,
        answer:text,
        source:payload?.source||payload?.model||"ai-chat",
        intent:payload?.understoodIntent||payload?.intent||""
      });
    }
    return res.status(200).json({...payload,historySaved});
  }

  const history=(Array.isArray(req.body?.history)?req.body.history:[])
    .slice(-6)
    .map(x=>({
      role:(x?.role==="assistant"||x?.role==="AI"||x?.sender==="bot"||x?.sender==="assistant"||x?.type==="bot")?"AI":"Khách",
      text:clean(x?.text||x?.content||x?.message,700)
    }))
    .filter(x=>x.text);

  // V213: HARD ROUTE cho SĐT bảo hành.
  // Nếu câu AI gần nhất vừa xin SĐT để tra cứu BH và khách gửi một SĐT,
  // gọi thẳng hệ thống bảo hành. Tuyệt đối không cho Gemini xử lý tin nhắn này.
  const clientWarrantyPending=req.body?.warrantyPending===true;
  const followupWarrantyPhone=isPhoneOnlyMessage(message);
  if(followupWarrantyPhone){
    const recentWarrantyContext=history.slice(-4).some(x=>{
      const t=normSearch(x?.text||x?.content||x?.message||"");
      return t.includes("bao hanh") || t.includes("tra cuu") || /\bbh\b/.test(t);
    });
    if(clientWarrantyPending || lastAssistantAskedWarrantyPhone(history) || recentWarrantyContext){
      return await directWarrantyResponse(res,followupWarrantyPhone,message,reply);
    }
  }


  // V202: Tra cứu bảo hành là dữ liệu xác định từ hệ thống,
  // xử lý trực tiếp trên server, không gửi số điện thoại/lịch sử mua hàng cho Gemini.
  if(isWarrantyIntent(message,history)){
    const phone=extractVietnamPhone(message);

    if(!phone){
      return await reply({
        ok:true,
        text:"Bạn gửi số điện thoại đã dùng khi mua hàng, mình tra cứu bảo hành trực tiếp trên hệ thống ngay nhé.",
        source:"warranty-system",
        deterministic:true,
        needsPhone:true,
        warrantyPending:true
      });
    }

    try{
      const warranty=await lookupWarrantyByPhone(phone);
      if(warranty?.code==="INVALID_PHONE"){
        return await reply({
          ok:true,
          text:"Số điện thoại chưa đúng. Bạn gửi lại số đã dùng khi mua hàng nhé.",
          source:"warranty-system",
          deterministic:true,
          needsPhone:true
        });
      }

      return await reply({
        ok:true,
        text:warrantyAnswer(warranty,message),
        source:"warranty-system",
        deterministic:true,
        warranty:true,
        warrantyPending:false,
        warrantyCompleted:true
      });
    }catch(err){
      console.error("AI warranty lookup:",err);
      return await reply({
        ok:true,
        text:"Mình chưa lấy được dữ liệu bảo hành từ hệ thống lúc này. Bạn thử tra cứu lại sau ít phút nhé.",
        source:"warranty-system",
        deterministic:true,
        warranty:true,
        warrantyPending:false
      });
    }
  }


  // V206 safety net: các câu cực ngắn như "kiểm tra bh", "check bh"
  // tuyệt đối không được rơi xuống AI tư vấn chung.
  const shortWarranty=normSearch(message).replace(/\s+/g," ").trim();
  if(
    /^(kiem tra|check|tra cuu)?\s*bh$/.test(shortWarranty) ||
    /^(kiem tra|check|tra cuu)\s*bao hanh$/.test(shortWarranty)
  ){
    return await reply({
      ok:true,
      text:"Bạn gửi số điện thoại đã dùng khi mua hàng, mình tra cứu bảo hành trực tiếp trên hệ thống ngay nhé.",
      source:"warranty-system",
      deterministic:true,
      needsPhone:true,
      warrantyPending:true
    });
  }

  const products=(Array.isArray(req.body?.products)?req.body.products:[])
    .slice(0,20)
    .map(normalizeProduct)
    .filter(x=>x.name);

  const installmentSettings=await loadInstallmentSettings();

  // V407: hiểu ý khách trước khi chọn nhánh trả lời.
  // Bộ phân tích chỉ trả intent/focus/target, không tạo câu trả lời và không lộ suy luận.
  const questionUnderstanding=await understandCustomerQuestion(message,history,apiKey);

  // Câu hỏi trả góp chung có thể trả thẳng từ cấu hình.
  // Nhưng câu hỏi chi tiết như lãi suất / trả trước / góp mỗi tháng phải trả ĐÚNG trọng tâm.
  // Nếu shop chưa đào tạo dữ liệu chi tiết thì ghi vào Admin để shop bổ sung, tuyệt đối không trả lời lan man.
  if(questionUnderstanding.intent.startsWith("installment_") || isInstallmentIntent(message)){
    const semanticIntent=questionUnderstanding.intent.startsWith("installment_")
      ? questionUnderstanding.intent
      : (isInstallmentDetailQuestion(message)?"installment_other_detail":"installment_general");
    const detail=semanticIntent!=="installment_general";
    const trained=detail && knowledgeMatchesQuestion(message,aiKnowledge.items);
    if(detail && !trained){
      await recordMissingInfo(message,installmentMissingByIntent(semanticIntent));
      return await reply({
        ok:true,
        text:installmentGapReply(semanticIntent),
        source:"ai-knowledge-gap",
        deterministic:true,
        knowledgeGap:true,
        understoodIntent:semanticIntent,
        understoodFocus:questionUnderstanding.focus
      });
    }
    if(!detail){
      return await reply({
        ok:true,
        text:directInstallmentAnswer(installmentSettings),
        source:"installment-settings",
        deterministic:true,
        understoodIntent:semanticIntent,
        understoodFocus:questionUnderstanding.focus
      });
    }
    // Đã có kiến thức shop đào tạo: AI tiếp tục bên dưới với đúng intent đã hiểu.
  }

  // Tồn kho là dữ liệu xác định từ website, không để model tự suy diễn.
  const stockAnswer=(questionUnderstanding.intent==="stock" || isStockQuestion(message))
    ? directStockAnswer(message,products)
    : "";
  if(stockAnswer){
    return await reply({
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
    `HỆ THỐNG ĐÃ HIỂU CÂU HỎI: intent=${questionUnderstanding.intent}; trọng tâm=${questionUnderstanding.focus}; đối tượng=${questionUnderstanding.target||"không nêu"}.`,
    "BẮT BUỘC trả lời theo TRỌNG TÂM đã hiểu ở trên. Trước khi chọn dữ liệu để trả lời, phải kiểm tra dữ liệu đó có thực sự trả lời đúng intent hay chỉ liên quan chung chung.",
    "Nếu dữ liệu chỉ liên quan chung chung nhưng không trả lời đúng điều khách hỏi thì không được dùng để lấp câu trả lời.",
    "Ví dụ: hỏi lãi thì chỉ dùng dữ liệu về lãi; hỏi trả trước thì chỉ dùng dữ liệu trả trước; hỏi tồn kho thì chỉ trả tồn kho.",
    `CHỈ DẪN ĐÀO TẠO TỪ QUẢN TRỊ: ${chatSettings.chatInstructions}`,
    `CÁCH NHẮN TIN DO QUẢN TRỊ TÙY CHỈNH: ${chatSettings.chatMessageStyle}`,
    `THÔNG TIN SIÊU DI ĐỘNG DO QUẢN TRỊ CUNG CẤP: ${chatSettings.chatStoreFacts}`,
    `KIẾN THỨC SHOP ĐÃ BỔ SUNG CHO AI: ${aiKnowledge.text}`,
    "Nếu KIẾN THỨC SHOP ĐÃ BỔ SUNG có câu trả lời phù hợp thì phải ưu tiên dùng để trả lời khách, không hỏi lại shop và không tự bịa thông tin khác.",
    "KHI THIẾU THÔNG TIN: Nếu khách hỏi một thông tin thực tế của shop mà toàn bộ dữ liệu được cung cấp chưa đủ để trả lời chắc chắn, hãy vẫn trả lời phần bạn biết. Cuối câu trả lời PHẢI thêm đúng một marker ẩn theo mẫu [[SHOP_NEEDS_INFO: mô tả thật ngắn thông tin shop cần cung cấp]]. Marker này không phải lời nhắn cho khách và hệ thống sẽ tự ẩn nó.",
    "Chỉ dùng SHOP_NEEDS_INFO khi thực sự thiếu dữ liệu riêng của shop như giá sửa chữa, giá thu cũ, phạm vi ship, chương trình khuyến mãi, chính sách chưa được cung cấp. Không dùng marker cho câu hỏi có thể trả lời từ danh sách sản phẩm, cấu hình trả góp, bảo hành, thông tin shop hoặc kiến thức đã bổ sung.",
    `QUY TẮC CHUYỂN NHÂN VIÊN: ${chatSettings.chatHandoffRules}`,
    `THÔNG TIN TRẢ GÓP TỪ HỆ THỐNG: ${installmentSettings.intro} Đơn vị đang bật: ${(installmentSettings.providers||[]).map(x=>x.name).join(", ")||"chưa cấu hình tên đơn vị"}.`,
    "QUY TẮC TRẢ GÓP: Shop CÓ hỗ trợ trả góp qua công ty tài chính. Tuyệt đối không được nói shop chưa hỗ trợ trả góp nếu cấu hình trả góp đang tồn tại. Không tự bịa mức cọc, lãi suất, tỷ lệ trả trước hay kết quả duyệt hồ sơ.",
    "QUY TẮC BẮT BUỘC VỀ HANDOFF: AI phải chủ động trả lời trước nếu có dữ liệu. Không được kết thúc câu trả lời bằng lời mời nhắn Zalo/nhân viên chỉ để cho chắc. Không được nói 'liên hệ nhân viên để xác nhận' khi giá, tồn kho, bảo hành, trả góp, địa chỉ, giờ mở cửa, chính sách hoặc thông tin sản phẩm đã có trong dữ liệu được cung cấp.",
    "Chỉ đề nghị nhân viên trong 4 trường hợp: (1) khách chủ động yêu cầu người thật; (2) khách muốn chốt/giữ máy hoặc thương lượng riêng; (3) khách cần ảnh thực tế hoặc xác minh vật lý mà AI không thể thực hiện; (4) thông tin cần thiết thực sự không có trong dữ liệu hệ thống.",
    "Nếu không thuộc 4 trường hợp trên thì tuyệt đối không tự đề nghị Zalo hay nhân viên.",
    "Nói tiếng Việt tự nhiên, ngắn gọn, bình dân, dễ hiểu.",
    "GIỌNG CHAT: thân thiện kiểu nhân viên trẻ ở Quy Nhơn/Bình Định, gần gũi Gen Z nhưng không lố, không hỗn, không ép mua.",
    "QUAN TRỌNG VỀ VĂN PHONG: đừng viết như chatbot/tổng đài. Tránh các cụm cứng như 'hiện shop có cấu hình hỗ trợ', 'kết quả duyệt thực tế', 'mẫu máy nào', 'theo thông tin hệ thống', 'xin vui lòng'. Đổi sang lời chat đời thường như 'shop đang làm qua...', 'bên tài chính duyệt theo hồ sơ nha', 'bạn đang ngắm con nào gửi mình coi thử'.",
    "Mỗi lượt nên giống một người đang chat thật: có thể trả lời 1 câu ngắn trước rồi mới bổ sung 1-2 ý sau. Không cố nhồi đủ chính sách vào một lượt nếu khách chưa hỏi.",
    "Không lặp 'bạn' ở mọi câu. Có thể luân phiên 'bạn', 'b', hoặc lược chủ ngữ khi vẫn tự nhiên. Viết tắt chỉ dùng nhẹ, tuyệt đối không làm câu khó đọc.",
    "Ưu tiên từ ngữ đời thường miền Trung/Gen Z vừa phải như 'nha', 'nè', 'á', 'ổn áp', 'ngon', 'coi thử', 'xíu'; không dùng dày đặc và không giả giọng quá đà.",
    "Có thể dùng viết tắt rất tự nhiên và thỉnh thoảng như: ko, đc, b, ib, xíu, nha, nè, oke; mỗi lượt chỉ nên chen 0-2 từ viết tắt, đừng câu nào cũng viết tắt.",
    "Có thể dùng vài cách nói đời thường như 'ổn áp', 'quất con này', 'tầm này ngon á', 'chốt con này cũng hợp', nhưng chỉ khi đúng ngữ cảnh và không tâng bốc quá mức.",
    "Không dùng giọng tổng đài, không viết kiểu quảng cáo, không mở đầu dài dòng. Có thể có các phản hồi ngắn tự nhiên như 'Dạ có nha', 'Ừ con này ổn á', 'Tầm này mình nghiêng con này hơn nè'.",
    "Không cố tình sai chính tả để giả người thật. Viết tắt phải dễ đọc và không làm sai giá, tên máy, bảo hành, địa chỉ hay thông tin quan trọng.",
    "PHONG CÁCH CHAT BẮT BUỘC: nhắn như hội thoại bán hàng tự nhiên, mỗi câu hoặc mỗi ý ngắn là một tin nhắn riêng. Không viết một đoạn văn dài.",
    "Khi trả lời nhiều ý, hãy xuống dòng sau từng câu/ý. Mỗi dòng nên khoảng 1 câu, thường 6-20 từ; tối đa khoảng 2 câu ngắn nếu chúng gắn chặt với nhau.",
    "Hỏi gì trả lời ĐÚNG TRỌNG TÂM ý đó trước. Khách hỏi lãi thì nói về lãi; hỏi trả trước thì nói trả trước; hỏi giá thì nói giá. Tuyệt đối không né câu hỏi bằng cách kể lại chính sách chung.",
    "Nếu không có dữ liệu để trả lời đúng điều khách đang hỏi, nói ngắn gọn là chưa có thông tin chính xác và dùng SHOP_NEEDS_INFO. Không được lấy thông tin liên quan nhưng khác ý để lấp vào câu trả lời.",
    "Hỏi gì trả lời thẳng ý đó trước. Sau đó mới nhắn thêm 1-3 tin bổ sung nếu hữu ích. Không mở đầu kiểu tổng đài, không lặp lại câu hỏi của khách.",
    "Không dùng các câu máy móc như 'vui lòng', 'theo thông tin hệ thống', 'để được hỗ trợ' trừ khi thật sự cần. Ưu tiên cách nói tự nhiên như 'Có bạn nha', 'Con này đang còn hàng', 'Tầm này mình nghiêng về...'.",
    "Mục tiêu: trả lời câu hỏi về điện thoại/sản phẩm đang bán và thông tin cơ bản của Siêu Di Động.",
    "CHỈ được dùng dữ liệu sản phẩm trong DANH SÁCH SẢN PHẨM được gửi trong yêu cầu. Không tự bịa giá, tồn kho, cấu hình hay chương trình khuyến mãi.",
    "QUAN TRỌNG NHẤT: giá và tình trạng CÒN HÀNG/HẾT HÀNG trong DANH SÁCH SẢN PHẨM LIÊN QUAN TỪ WEBSITE là nguồn sự thật duy nhất và ưu tiên cao nhất. Không được dùng kiến thức riêng, hội thoại cũ hay chỉ dẫn đào tạo để phủ định dữ liệu này.",
    "Nếu danh sách ghi CÒN HÀNG thì tuyệt đối không được nói hết hàng, tạm hết, cần kiểm tra lại hay chưa rõ tồn kho. Nếu danh sách ghi HẾT HÀNG thì tuyệt đối không nói còn hàng.",
    "Khi khách hỏi sản phẩm đang có trên website, phải dựa đúng giá và tình trạng website gửi trong lượt hỏi hiện tại.",
    "Nếu hỏi giá/tồn kho mà sản phẩm không nằm trong dữ liệu, nói rõ hiện chưa thấy dữ liệu trong hệ thống. Chỉ đề nghị nhân viên nếu khách cần xử lý ngay hoặc muốn chốt mua.",
    "Nếu tư vấn máy, ưu tiên gợi ý tối đa 3 máy và nêu ngắn lý do.",
    "Khi khách có ngân sách (ví dụ 8tr, 10 triệu) và hỏi máy nào nên mua/chụp đẹp/pin trâu/chơi game, BẮT BUỘC rà DANH SÁCH SẢN PHẨM và gọi tên 2-3 mẫu cụ thể kèm đúng giá web và tình trạng hàng. Không hỏi ngược khách muốn hãng nào nếu đã có đủ mẫu để gợi ý.",
    "Có thể dùng hiểu biết chung về đặc tính/định vị của model để đánh giá nhu cầu như chụp ảnh, pin, hiệu năng; nhưng không được tự bịa thông số kỹ thuật cụ thể. Giá và tồn kho chỉ được lấy từ DANH SÁCH SẢN PHẨM.",
    "Nếu trong danh sách có bất kỳ mẫu nào có giá, tuyệt đối không được trả lời kiểu 'danh sách chưa có giá cụ thể'. Nếu không có mẫu đúng ngân sách, hãy nêu 1-3 mẫu gần ngân sách nhất và nói rõ chênh lệch.",
    "Trả lời chủ động: câu hỏi '8tr có máy nào chụp đẹp không?' phải đưa ra ngay các lựa chọn cụ thể từ danh sách, không yêu cầu khách cung cấp thêm dòng máy trước.",
    "Nếu sản phẩm hết hàng, phải nói rõ hết hàng; không được chốt như đang còn hàng.",
    "Nếu khách hỏi địa chỉ, giờ mở cửa hoặc chính sách và THÔNG TIN SIÊU DI ĐỘNG đã có câu trả lời thì trả lời thẳng. Chỉ khi dữ liệu đó hoàn toàn không được cung cấp mới nói chưa có dữ liệu; không bịa.",
    "Ưu tiên tự tư vấn bằng AI trước. Với giá/tồn kho đã có trong DANH SÁCH SẢN PHẨM thì trả lời thẳng theo website, KHÔNG bắt khách sang Zalo để xác nhận lại. Chỉ gợi ý nhân viên khi dữ liệu sản phẩm hiện tại không có thông tin cần hỏi, hoặc khách chủ động muốn gặp nhân viên.",
    "Nếu khách hỏi bảo hành, ưu tiên hệ thống tra cứu bảo hành. Tuyệt đối không tự suy đoán ngày mua hoặc thời hạn bảo hành.",
    "Khi khách hỏi hoặc đang tra cứu bảo hành, KHÔNG yêu cầu khách nhắn Zalo. Hệ thống phải tự tra cứu và trả kết quả trực tiếp trong chat.",
    "Không được nói rằng chatbox chưa tích hợp tra cứu bảo hành. Chức năng này đã được hệ thống xử lý trực tiếp trước khi gọi AI.",
    "Không được giả vờ đang kiểm tra, đang chờ, đang xử lý hoặc hẹn kết quả bảo hành sẽ hiện sau. Chỉ được trả dữ liệu bảo hành khi server đã trả kết quả thực tế.",
    "Không dùng Markdown table. Không viết bài dài. Thông thường 2-5 tin nhắn ngắn là đủ. MỖI TIN NHẮN PHẢI XUỐNG DÒNG RIÊNG trong câu trả lời."
  ].join(" ");

  const input=`CÂU HỎI HIỆN TẠI:
${message}

HỘI THOẠI GẦN NHẤT:
${historyText}

TÓM TẮT DỮ LIỆU:
${productDataSummary(products,message)}

DANH SÁCH SẢN PHẨM LIÊN QUAN TỪ WEBSITE:
${catalog}

Ý ĐỊNH HỆ THỐNG ĐÃ HIỂU: ${questionUnderstanding.intent}
TRỌNG TÂM CẦN TRẢ LỜI: ${questionUnderstanding.focus}
ĐỐI TƯỢNG: ${questionUnderstanding.target||"Không nêu"}

Trả lời trực tiếp đúng trọng tâm đã hiểu. Chỉ chọn dữ liệu thực sự trả lời được trọng tâm đó. Nếu đang hỏi tư vấn theo tầm giá/nhu cầu và danh sách có sản phẩm có giá, hãy chốt 2-3 lựa chọn cụ thể ngay.`;

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
        if(text){
          const parsed=missingInfoMarker(text);
          if(parsed.missing) await recordMissingInfo(message,parsed.missing);
          const visible=parsed.visible||"Mình chưa có đủ thông tin chính xác về phần này. Mình đã ghi lại để shop bổ sung cho AI rồi nha.";
          return await reply({ok:true,text:visible,model,needsHuman:false,knowledgeGap:!!parsed.missing,understoodIntent:questionUnderstanding.intent,understoodFocus:questionUnderstanding.focus});
        }
      }
      lastError=clean(data?.error?.message,500)||`Gemini ${r.status}`;
      if(![400,404,429,500,503].includes(r.status)) break;
    }catch(err){
      lastError=err?.name==="AbortError"?"AI phản hồi quá lâu.":clean(err?.message,500);
    }
  }

  console.error("AI chat:",lastError);
  return res.status(503).json({
    error:"AI tư vấn đang bận. Bạn thử lại sau ít phút.",
    needsHuman:true,
    handoffReason:"AI đang tạm thời chưa phản hồi được. Nếu cần gấp, bạn có thể nhắn nhân viên qua Zalo."
  });
}
