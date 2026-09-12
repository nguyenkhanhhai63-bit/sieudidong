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
    brand:clean(p?.brand,80),
    sourceType:clean(p?.sourceType,80),
    categoryName:clean(p?.categoryName||p?.rootCategoryName,80),
    webVariantId:clean(p?.webVariantId,100),
    webVariantName:clean(p?.webVariantName,220),
    variants:(Array.isArray(p?.variants)?p.variants:[]).slice(0,60).map(v=>({
      id:clean(v?.id,100),
      name:clean(v?.name,220),
      color:clean(v?.color,80),
      memory:clean(v?.memory,80),
      price:Number(v?.price||0),
      onHand:Math.max(0,Number(v?.onHand||0))
    }))
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
          maxOutputTokens:1800,
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

function responseFinishReason(data){
  const reasons=(Array.isArray(data?.candidates)?data.candidates:[])
    .map(c=>String(c?.finishReason||"").trim().toUpperCase())
    .filter(Boolean);
  return reasons[0]||"";
}

function responseWasCut(data){
  const reason=responseFinishReason(data);
  return reason==="MAX_TOKENS" || reason==="LENGTH";
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
    chatTechnicalKnowledge:"ROM / phần mềm: Khi khách hỏi ROM gốc, ROM Việt hóa, ROM quốc tế, OTA, bootloader, cập nhật hoặc hạ ROM thì phải trả lời đúng câu hỏi kỹ thuật trước; không tự báo giá, tồn kho hay cấu hình nếu khách không hỏi. Không được suy đoán khả năng can thiệp của từng model nếu kiến thức Shop chưa ghi rõ. Nếu còn phụ thuộc tình trạng ROM/bootloader hiện tại thì nói cần kiểm tra máy trước. Khi thao tác ROM có khả năng mất dữ liệu thì nhắc khách sao lưu nếu thật sự liên quan. Máy chưa có Tiếng Việt shop hỗ trợ cài miễn phí; up ROM quốc tế phí 500k.",
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
        chatTechnicalKnowledge:clean(x.chatTechnicalKnowledge,6000)||defaults.chatTechnicalKnowledge,
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
      chatTechnicalKnowledge:clean(x.chatTechnicalKnowledge,6000)||defaults.chatTechnicalKnowledge,
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



function historyRole(x={}){
  return (x?.role==="assistant"||x?.role==="AI"||x?.sender==="bot"||x?.sender==="assistant"||x?.type==="bot")?"AI":"Khách";
}

async function loadServerConversation(sessionId=""){
  const sid=clean(sessionId,90);
  if(!validHistorySessionId(sid)) return [];
  try{
    const raw=await redisCommand(["GET",AI_CHAT_HISTORY_PREFIX+sid]);
    if(!raw) return [];
    const data=JSON.parse(String(raw))||{};
    return (Array.isArray(data.messages)?data.messages:[])
      .slice(-18)
      .map(x=>({role:historyRole(x),text:clean(x?.text||x?.content||x?.message,900)}))
      .filter(x=>x.text);
  }catch(_){ return []; }
}

function mergeConversationHistory(serverHistory=[],clientHistory=[]){
  const all=[...(serverHistory||[]),...(clientHistory||[])];
  const out=[];
  for(const x of all){
    const item={role:historyRole(x),text:clean(x?.text||x?.content||x?.message,900)};
    if(!item.text) continue;
    const prev=out[out.length-1];
    if(prev && prev.role===item.role && prev.text===item.text) continue;
    out.push(item);
  }
  return out.slice(-14);
}

const CONTEXT_STOP=new Set(["con","cai","may","nay","do","kia","nua","thi","la","co","khong","bao","nhieu","gia","shop","ben","minh","ban","b","a","ah","nha","ne","voi","cho","toi","xem","hoi","dang","van","con","het","hang"]);
function productMatchScore(text="",product={}){
  const q=normSearch(text), n=normSearch(product?.name||"");
  if(!q||!n) return 0;
  const compactQ=q.replace(/\s+/g,""), compactN=n.replace(/\s+/g,"");
  let score=0;
  if(compactN.length>=5 && compactQ.includes(compactN)) score+=80;
  const tokens=q.split(" ").filter(t=>t.length>=2&&!CONTEXT_STOP.has(t));
  for(const t of tokens){ if(n.includes(t)) score+=t.length>=5?8:3; }
  const brand=normSearch(product?.brand||"");
  if(brand&&q.includes(brand)) score+=6;

  // V854: khóa đúng biến thể model. Ví dụ khách ghi "K90" thì không được
  // tự chọn K90 Max/Pro/Ultra chỉ vì các tên này cùng chứa token K90.
  // Chỉ áp dụng với hậu tố phân biệt model; các mô tả bán hàng như Like New,
  // Tiếng Việt, Chính hãng không được xem là một model khác.
  const modelModifiers=["pro","max","ultra","plus","mini","turbo","rt","neo","se","t","s"];
  const qTokens=new Set(q.split(/\s+/).filter(Boolean));
  const nTokens=new Set(n.split(/\s+/).filter(Boolean));
  for(const mod of modelModifiers){
    if(nTokens.has(mod) && !qTokens.has(mod)) score-=45;
    if(qTokens.has(mod) && !nTokens.has(mod)) score-=55;
  }
  // Cụm Pro Max phải khớp đủ, tránh K90 Pro chọn K90 Pro Max và ngược lại.
  const qProMax=/\bpro max\b/.test(q), nProMax=/\bpro max\b/.test(n);
  if(qProMax!==nProMax && (qProMax||nProMax)) score-=55;

  // Nếu khách nói rõ Like New thì ưu tiên đúng bản Like New; nếu không nói
  // thì không ép condition để câu hỏi model gốc vẫn hoạt động tự nhiên.
  const qLikeNew=/\blike new\b|\blikenew\b/.test(q);
  const nLikeNew=/\blike new\b|\blikenew\b/.test(n);
  if(qLikeNew) score += nLikeNew?22:-35;
  return score;
}

function bestExplicitProduct(text="",products=[]){
  let best=null,score=0;
  for(const p of products){
    const s=productMatchScore(text,p);
    if(s>score){ best=p; score=s; }
  }
  // Tên model phải đủ rõ. Các câu nối tiếp như "màu gì", "còn k" không tự match máy khác.
  return score>=16?{product:best,score}:null;
}

function resolveConversationProduct(message="",history=[],products=[],semanticTarget=""){
  if(!products.length) return null;

  // 1) Nếu chính câu hiện tại có tên máy rõ ràng thì cho phép đổi context.
  const current=bestExplicitProduct(message,products);
  if(current) return {...current.product,_contextScore:current.score+40,_recency:40};

  // 2) Semantic router chỉ được dùng khi nó thật sự nêu một model rõ ràng.
  const semantic=bestExplicitProduct(semanticTarget,products);
  if(semantic) return {...semantic.product,_contextScore:semantic.score+30,_recency:30};

  // 3) Câu nối tiếp (màu gì/còn không/giá sao/...) phải bám model khách nhắc gần nhất.
  // Ưu tiên lịch sử của KHÁCH để một câu AI lỡ nhắc model khác không làm trôi context.
  for(let i=history.length-1;i>=0;i--){
    const h=history[i]||{};
    if(historyRole(h)!=="Khách") continue;
    const hit=bestExplicitProduct(h.text||h.content||h.message||"",products);
    if(hit) return {...hit.product,_contextScore:hit.score+20,_recency:20};
  }

  // 4) Chỉ khi khách chưa từng nêu model mới fallback sang model gần nhất trong lời AI.
  for(let i=history.length-1;i>=0;i--){
    const h=history[i]||{};
    const hit=bestExplicitProduct(h.text||h.content||h.message||"",products);
    if(hit) return {...hit.product,_contextScore:hit.score+10,_recency:10};
  }
  return null;
}

function conversationState(message="",history=[],products=[],semanticTarget=""){
  const combined=[...history.map(x=>x.text||""),message].join(" ");
  const currentBudget=extractBudget(message);
  let budget=currentBudget;
  if(!budget){
    for(let i=history.length-1;i>=0&&!budget;i--) budget=extractBudget(history[i]?.text||"");
  }
  const target=resolveConversationProduct(message,history,products,semanticTarget);
  const q=normSearch(combined);
  const needs=[];
  if(/pin trau|pin lau|pin khoe|pin/.test(q)) needs.push("pin");
  if(/chup|camera|anh dep|quay/.test(q)) needs.push("camera");
  if(/game|hieu nang|manh|fps|lien quan|pubg/.test(q)) needs.push("hiệu năng");
  if(/man hinh|display|amoled|ltpo/.test(q)) needs.push("màn hình");
  return {budget,target,needs:[...new Set(needs)].slice(0,4)};
}

function formatPrice(p={}){
  const min=Number(p.minPrice||0), max=Number(p.maxPrice||0);
  if(!min) return "chưa có giá";
  if(max&&max!==min) return `${min.toLocaleString("vi-VN")} - ${max.toLocaleString("vi-VN")} đ`;
  return `${min.toLocaleString("vi-VN")} đ`;
}

function asksProductCondition(message=""){
  const q=normSearch(message);
  return /like new|likenew|may cu|cu hay moi|may moi|moi hay cu|nguyen seal|seal|tinh trang|99%|may luot/.test(q);
}

function isUsedProduct(p={}){
  const hay=normSearch(`${p.name||""} ${p.sourceType||""} ${p.categoryName||""}`);
  return /like new|likenew|may cu|used|99%|may luot|kiot iphone used/.test(hay) || hay.includes("may cu");
}

function explicitProductsInMessage(message="",products=[]){
  const q=normSearch(message);
  if(!q || !products.length) return [];
  // Tách các vế kiểu "K13 với Turbo 4", sau đó resolve độc lập từng vế.
  const parts=q.split(/\b(?:voi|va|vs|cung|,|\/|&)\b/).map(x=>x.trim()).filter(Boolean);
  const hits=[];
  for(const part of parts){
    const hit=bestExplicitProduct(part,products);
    if(hit && hit.score>=8 && !hits.some(x=>normSearch(x.name)===normSearch(hit.product.name))) hits.push(hit.product);
  }
  // Nếu splitter không đủ, quét từng sản phẩm để bắt nhiều model cùng nằm trong một câu.
  if(hits.length<2){
    const ranked=products.map(p=>({p,hit:bestExplicitProduct(q,[p])})).filter(x=>x.hit&&x.hit.score>=12).sort((a,b)=>b.hit.score-a.hit.score);
    for(const x of ranked){
      if(!hits.some(h=>normSearch(h.name)===normSearch(x.p.name))) hits.push(x.p);
      if(hits.length>=4) break;
    }
  }
  return hits;
}

function productCoreIdentity(name=""){
  return normSearch(name)
    .replace(/\b(like new|likenew|may cu|used|99%|may luot|chinh hang|tieng viet|rom tieng viet|new seal|nguyen seal)\b/g," ")
    .replace(/\s+/g," ").trim();
}

function sameCoreModel(a="",b=""){
  const x=productCoreIdentity(a), y=productCoreIdentity(b);
  if(!x||!y) return false;
  if(x===y) return true;
  // Chỉ cho phép khác các từ mô tả mạng/dung lượng; tuyệt đối không bỏ Pro/Max/Ultra/Plus/Turbo...
  const soften=v=>v.replace(/\b(4g|5g|wifi)\b/g," ").replace(/\b\d+\s*\/\s*\d+\b/g," ").replace(/\s+/g," ").trim();
  return soften(x)===soften(y);
}

function directSingleProductConditionAnswer(message="",history=[],products=[],semanticTarget=""){
  if(!asksProductCondition(message) || !products.length) return "";
  // Nếu câu hiện tại nêu nhiều model, nhánh multi-product phía dưới xử lý riêng.
  if(explicitProductsInMessage(message,products).length>=2) return "";
  const target=resolveConversationProduct(message,history,products,semanticTarget);
  if(!target) return "";

  const used=products.filter(p=>isUsedProduct(p) && sameCoreModel(p.name,target.name));
  const available=used.filter(p=>p.inStock);
  if(available.length){
    const names=[...new Set(available.map(p=>p.name))].slice(0,3);
    return `${productCoreIdentity(target.name) || target.name} bên mình đang có bản máy cũ/Like New nha b${names.length?`: ${names.join(", ")}`:""}.`;
  }
  return `${productCoreIdentity(target.name) || target.name} hiện bên mình chưa có bản máy cũ/Like New còn hàng nha b.`;
}

function directMultiProductConditionAnswer(message="",products=[]){
  if(!asksProductCondition(message) || !products.length) return "";
  const targets=explicitProductsInMessage(message,products);
  if(targets.length<2) return "";
  const lines=[];
  for(const target of targets){
    const targetNorm=normSearch(target.name).replace(/\b(like new|likenew|chinh hang|may cu|new seal|99%)\b/g," ").replace(/\s+/g," ").trim();
    const toks=targetNorm.split(" ").filter(t=>t.length>=2 && !["oppo","redmi","xiaomi","vivo","honor","iqoo","oneplus","pro","max","5g"].includes(t));
    const candidates=products.filter(p=>{
      if(!isUsedProduct(p)) return false;
      const n=normSearch(p.name);
      const strong=toks.filter(t=>n.includes(t)).length;
      return strong>=Math.max(1,Math.min(2,toks.length));
    });
    const available=candidates.filter(p=>p.inStock);
    if(available.length) lines.push(`${target.name}: có máy cũ/Like New đang còn hàng nha b.`);
    else lines.push(`${target.name}: hiện mình chưa thấy máy cũ/Like New còn hàng trên web nha b.`);
  }
  return lines.join("\n");
}

function directNamedProductAnswer(message="",history=[],products=[],semanticTarget="",intent="other"){
  // Khi khách chỉ nêu tên máy, chỉ xác nhận đúng model + giá/tồn cơ bản.
  // Không tự kéo tình trạng Like New/máy cũ/mới/seal vào nếu khách chưa hỏi.
  if(asksProductCondition(message)) return "";
  if(!["product_info","other"].includes(String(intent||""))) return "";
  const q=normSearch(message);
  if(/gia|bao nhieu|mau|con hang|het hang|pin|camera|cau hinh|thong so|tra gop|bao hanh|so sanh|vs/.test(q)) return "";
  const resolved=resolveConversationProduct(message,history,products,semanticTarget);
  if(!resolved) return "";
  // Chỉ deterministic khi câu hiện tại thực sự có dấu vết tên model, tránh chặn hội thoại xã giao.
  const modelTokens=normSearch(resolved.name).split(/\s+/).filter(x=>x.length>=2 && !["redmi","xiaomi","oppo","vivo","honor","iqoo","oneplus","chinh","hang"].includes(x));
  if(!modelTokens.some(t=>q.includes(t))) return "";
  const price=resolved.minPrice?formatPrice(resolved):"chưa có giá";
  const stock=resolved.inStock?"đang còn hàng":"hiện đang hết hàng";
  return `${resolved.name} bên mình ${stock} nha b.\nGiá ${price}.`;
}

function directPriceAnswer(message="",history=[],products=[],semanticTarget=""){
  const q=normSearch(message);
  if(!(/gia|bao nhieu|nhieu tien|may tien|gia con/.test(q))) return "";
  const resolved=resolveConversationProduct(message,history,products,semanticTarget);
  if(!resolved) return "";
  if(!resolved.minPrice) return `${resolved.name} hiện mình chưa thấy giá trên web á b.`;
  return `${resolved.name} đang ${formatPrice(resolved)} nha b${resolved.inStock?", hiện còn hàng á":"; hiện đang hết hàng á"}.`;
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
    else if(/\brom\b|rom goc|rom quoc te|rom viet|viet hoa|quay ve rom|ve rom|up rom|flash rom|cap nhat rom|update rom|mo khoa bootloader|bootloader/.test(q)) intent="device_software";
    else if(/bao hanh|\bbh\b/.test(q)) intent="warranty";
    else if(/gia bao nhieu|bao nhieu tien|gia may|gia con/.test(q)) intent="price";
    else if(/so sanh|vs|voi con nao|hon con/.test(q)) intent="comparison";
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
    "intent phải là một trong: installment_general, installment_interest, installment_downpayment, installment_monthly, installment_term, stock, price, warranty, device_software, recommendation, store_info, policy, repair, tradein, product_info, comparison, order, human_request, other.",
    "focus là ý khách cần câu trả lời trực tiếp, thật ngắn.",
    "target là tên máy/đối tượng nếu khách có nhắc, nếu không thì để chuỗi rỗng.",
    "Nếu câu hiện tại ngắn hoặc dùng từ như 'cái đó', 'bao nhiêu', hãy dùng hội thoại gần nhất để hiểu ngữ cảnh.",
    "Ví dụ: 'lãi trả góp bao nhiêu' => installment_interest, không phải installment_general.",
    "Ví dụ: 'trả trước bao nhiêu' => installment_downpayment.",
    "Ví dụ: 'mỗi tháng đóng nhiêu' sau khi đang nói trả góp => installment_monthly.",
    "Ví dụ: 'K90 Like New em muốn quay về rom gốc có được không' => device_software; target=K90 Like New; focus=khả năng quay về ROM gốc. Tuyệt đối không hiểu thành hỏi giá hay tồn kho."
  ].join(" ");
  const input=`CÂU HIỆN TẠI: ${clean(message,1200)}\nHỘI THOẠI GẦN NHẤT:\n${recent||"Không có"}\nXuất JSON dạng {"intent":"...","focus":"...","target":"...","confidence":0.0}`;
  try{
    const {r,data}=await callGemini("gemini-2.5-flash-lite",apiKey,sys,input);
    if(!r.ok) return fallback();
    const text=responseText(data).replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
    const obj=JSON.parse(text);
    const allowed=new Set(["installment_general","installment_interest","installment_downpayment","installment_monthly","installment_term","stock","price","warranty","device_software","recommendation","store_info","policy","repair","tradein","product_info","comparison","order","human_request","other"]);
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
  if(intent==="installment_interest") return "Phần lãi trả góp mình chưa có mức chính xác để báo bạn.\nMình đã ghi lại để shop bổ sung thêm thông tin, tránh báo sai nha.";
  if(intent==="installment_downpayment") return "Phần trả trước mình chưa có mức chính xác để báo bạn.\nMình đã ghi lại để shop bổ sung thêm thông tin nha.";
  if(intent==="installment_monthly") return "Khoản góp mỗi tháng mình chưa đủ dữ liệu để tính chính xác.\nMình đã ghi lại để shop bổ sung thêm thông tin nha.";
  if(intent==="installment_term") return "Kỳ hạn trả góp cụ thể mình chưa có dữ liệu chính xác.\nMình đã ghi lại để shop bổ sung thêm thông tin nha.";
  return "Phần này mình chưa có số chính xác để báo bạn.\nMình đã ghi lại để shop bổ sung thêm thông tin nha.";
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
    "ton kho","con may","co san","san hang",
    "bao gio co hang","khi nao co hang","luc nao co hang","ve hang"
  ].some(x=>q.includes(x));
}

function isRestockQuestion(message=""){
  const q=normSearch(message);
  return [
    "bao gio co hang","khi nao co hang","luc nao co hang",
    "bao gio ve","khi nao ve","luc nao ve","ve hang",
    "bao gio co lai","khi nao co lai"
  ].some(x=>q.includes(x));
}

function isColorQuestion(message=""){
  const q=normSearch(message);
  return /\bmau\b/.test(q) && /(con|co|khac|nao|gi|het|san)/.test(q);
}

function cleanColorLabel(v=""){
  return clean(v,80).replace(/^mau\s*[:\-]?\s*/i,"").trim();
}

function directColorAnswer(message,products=[],history=[],semanticTarget=""){
  if(!isColorQuestion(message) || !products.length) return "";
  const product=resolveConversationProduct(message,history,products,semanticTarget);
  if(!product) return "";

  const variants=Array.isArray(product.variants)?product.variants:[];
  const available=variants.filter(v=>Number(v.onHand||0)>0 && cleanColorLabel(v.color));
  const colors=[];
  for(const v of available){
    const c=cleanColorLabel(v.color);
    if(c && !colors.some(x=>normSearch(x)===normSearch(c))) colors.push(c);
  }

  if(colors.length===0){
    // Có tồn nhưng dữ liệu biến thể không có thuộc tính màu: không được tự đoán màu.
    if(product.inStock) return `${product.name} bên mình đang còn hàng nhưng dữ liệu web chưa tách rõ màu á b, mình ko báo bừa màu nha.`;
    return `${product.name} hiện bên mình đang hết hàng á b.`;
  }
  if(colors.length===1) return `${product.name} hiện bên mình chỉ còn màu ${colors[0]} nha b.`;
  return `${product.name} hiện bên mình còn ${colors.map(x=>`màu ${x}`).join(", ")} nha b.`;
}

function directStockAnswer(message,products=[],history=[],semanticTarget=""){
  if(!isStockQuestion(message) || !products.length) return "";

  const q=normSearch(message);
  const askingRestock=isRestockQuestion(message);
  const contextual=resolveConversationProduct(message,history,products,semanticTarget);
  if(contextual){
    const name=contextual.name;
    if(askingRestock && contextual.inStock) return `${name} bên mình đang có sẵn nha b, chưa cần chờ về hàng đâu á.`;
    if(askingRestock && !contextual.inStock) return `${name} hiện bên mình đang hết hàng á b. Lịch về cụ thể mình chưa có nên ko dám báo bừa nha.`;
    return contextual.inStock?`${name} bên mình đang còn hàng nha b.`:`${name} hiện bên mình đang hết hàng á b.`;
  }

  // V489: bỏ các từ hội thoại/tồn kho để chấm đúng model khách đang hỏi.
  const meaningful=q.split(" ").filter(t=>t.length>=2 && ![
    "con","hang","het","co","khong","ton","kho","may","shop","nay","do","ban",
    "bao","gio","khi","nao","luc","ve","lai","vay","the","a","ah","nha","like","new"
  ].includes(t));

  const ranked=products.map((p,index)=>{
    const n=normSearch(p.name);
    let score=Math.max(0,4-index*.1);

    meaningful.forEach(t=>{
      if(n.includes(t)) score += t.length>=5?7:3;
    });

    // Ưu tiên mạnh tên máy có trong chính câu hiện tại.
    const compactName=n.replace(/\s+/g,"");
    const compactQ=q.replace(/\s+/g,"");
    if(compactName.length>=5 && compactQ.includes(compactName)) score+=35;

    return {p,score};
  }).sort((a,b)=>b.score-a.score);

  const best=ranked[0];

  if(best && (best.score>=7 || products.length===1)){
    const name=best.p.name;

    // Khách hỏi "bao giờ/khi nào có hàng" nhưng thực tế máy đang còn:
    // trả lời thẳng như nhân viên, không dùng văn phong hệ thống.
    if(askingRestock && best.p.inStock){
      return `${name} bên mình đang có sẵn nha b, chưa cần chờ về hàng đâu á.`;
    }

    // Không có dữ liệu ngày về hàng thì tuyệt đối không tự đoán ngày.
    if(askingRestock && !best.p.inStock){
      return `${name} hiện bên mình đang hết hàng á b. Lịch về hàng cụ thể bên mình chưa có nên ko dám báo bừa b nha.`;
    }

    if(best.p.inStock){
      return `${name} bên mình đang còn hàng nha b.`;
    }

    return `${name} hiện bên mình đang hết hàng á b.`;
  }

  // Câu hỏi chung "máy nào còn hàng?"
  if(q.includes("con hang") || q.includes("co hang") || q.includes("co san")){
    const available=products.filter(p=>p.inStock).slice(0,3);
    if(available.length){
      return `Bên mình đang có sẵn ${available.map(p=>p.name).join(", ")} nha b.`;
    }
  }

  return "";
}


function isWarrantyPolicyQuestion(message=""){
  const q=normSearch(message).replace(/\s+/g," ").trim();
  if(!/(?:\bbh\b|bao hanh|bao han)/.test(q)) return false;

  // V858: Khách đang HỎI CHÍNH SÁCH bảo hành, không phải yêu cầu tra cứu máy đã mua.
  // Ví dụ: "bảo hành ntn", "khi mua bảo hành mấy tháng", "máy bảo hành bao lâu".
  const policySignals=[
    "bao lau","may thang","mấy tháng","ntn","nhu nao","the nao","chinh sach",
    "khi mua","mua may","duoc bao hanh","bao hanh gi","bao hanh nhu nao",
    "bao hanh binh thuong","thoi gian bao hanh"
  ].map(normSearch);
  if(policySignals.some(x=>q.includes(x))) return true;

  // Câu cực ngắn mang nghĩa hỏi chính sách chung.
  if(/^(?:bao hanh|bao hanh ntn|bao hanh sao|bh ntn|bh sao)(?: (?:vay|a|ạ|shop|b|ban))?$/.test(q)) return true;
  return false;
}

function warrantyPolicyAnswer(){
  return "Dạ máy được 30 ngày đổi nha b. Main bảo hành 12 tháng; nguồn, màn và camera 3 tháng; phụ kiện 1 tháng, phần mềm shop hỗ trợ á.";
}

function isWarrantyIntent(message="",history=[]){
  const current=normSearch(message).replace(/\s+/g," ").trim();

  // V858: Chính sách BH phải được trả lời trực tiếp, tuyệt đối không xin SĐT.
  if(isWarrantyPolicyQuestion(message)) return false;

  // Chỉ vào luồng TRA CỨU khi khách có tín hiệu muốn kiểm tra bảo hành của máy/đơn đã mua.
  const lookupPatterns=[
    /\bcheck\s*(?:bh|bao\s*hanh)\b/,
    /\bkiem\s*tra\s*(?:bh|bao\s*hanh)\b/,
    /\btra\s*cuu\s*(?:bh|bao\s*hanh)\b/,
    /\bcon\s*bh\b/,
    /\bhet\s*bh\b/,
    /\bcon\s*bao\s*hanh\b/,
    /\bhet\s*bao\s*hanh\b/,
    /\bbao\s*hanh\s*(?:may|minh|cua\s*minh|cua\s*toi)\s*(?:con|het|toi|den)\b/,
    /\bmay\s*(?:minh|toi|em|anh|chi)?\s*(?:con|het)\s*bao\s*hanh\b/
  ];
  if(lookupPatterns.some(rx=>rx.test(current))) return true;

  // Có SĐT + nhắc BH/tra cứu trong chính tin nhắn => cho phép tra cứu.
  const phone=extractVietnamPhone(message);
  if(phone && /(?:\bbh\b|bao hanh|tra cuu|kiem tra|check)/.test(current)) return true;
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


// V833: Chỉ chuyển đơn mua/ship sang Zalo khi khách CHỦ ĐỘNG thể hiện ý định mua rõ ràng.
// Không suy diễn từ các câu hỏi giá, màu, tồn kho hay phản hồi ngắn như "ok", "ừ", "a".
// V836: Khóa suy diễn chốt đơn từ câu hiện tại.
function isSimpleGreeting(text=""){
  const s=normSearch(text).replace(/\s+/g," ").trim();
  return /^(alo+|hello+|hi+|hey+|chao|chao b|chao ban|co ai ko|co ai khong|shop oi|ad oi|admin oi)[!.? ]*$/.test(s);
}

function stripUnrequestedPurchaseFlow(text="", currentMessage=""){
  if(explicitPurchaseIntent(currentMessage)) return String(text||"").trim();
  const forbidden=/(xin\s*(thong tin|sdt|so dien thoai|dia chi)|gui\s*(minh|shop)\s*(sdt|so dien thoai|dia chi)|len don|chot don|don ship|ship cho b|ship cho ban|giao cho b|giao cho ban|nhan vien.*zalo|nhan zalo|zalo.*(dat|mua|ship|don))/i;
  const lines=String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const safe=lines.filter(line=>!forbidden.test(normSearch(line)));
  return safe.join("\n").trim();
}

function explicitPurchaseIntent(text=""){
  const s=normSearch(text).replace(/\s+/g," ").trim();
  if(!s) return false;
  if(/\b(khong|ko|chua)\s+(mua|lay|dat|chot|ship|giao)\b/.test(s)) return false;
  const patterns=[
    /\b(toi|minh|em|anh|chi|b|ban)?\s*(lay|mua|chot)\s+(con|may|em|cai|mau|ban)\b/,
    /\b(lay|mua|chot)\s+(con nay|may nay|em nay|cai nay|mau nay|ban nay)\b/,
    /\b(dat\s+(may|hang|con nay|may nay)|dat cho|minh dat|toi dat)\b/,
    /\b(ship|giao)\s+(cho|minh|toi|em|anh|chi|ve|den)\b/,
    /\b(gui\s+(may|hang)\s+(cho|minh|toi|em|anh|chi))\b/,
    /\b(mua luon|lay luon|chot luon|chot don|len don)\b/
  ];
  return patterns.some(re=>re.test(s));
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
    return res.status(429).json({error:"Shop đang xử lý khá nhiều tin nhắn. B thử lại sau xíu nha."});
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

  const clientHistory=(Array.isArray(req.body?.history)?req.body.history:[])
    .slice(-12)
    .map(x=>({role:historyRole(x),text:clean(x?.text||x?.content||x?.message,900)}))
    .filter(x=>x.text);
  // V820: ghép lịch sử server + trình duyệt để AI nhớ mạch hội thoại lâu hơn, kể cả reload tab.
  const serverHistory=await loadServerConversation(historyContext.sessionId);
  const history=mergeConversationHistory(serverHistory,clientHistory);

  // V213: HARD ROUTE cho SĐT bảo hành.
  // Nếu câu AI gần nhất vừa xin SĐT để tra cứu BH và khách gửi một SĐT,
  // gọi thẳng hệ thống bảo hành. Tuyệt đối không cho Gemini xử lý tin nhắn này.
  const clientWarrantyPending=req.body?.warrantyPending===true;
  // V836: Chào hỏi đơn giản phải dừng đúng ở chào hỏi, không cho model tự mở luồng mua/ship.
  if(isSimpleGreeting(message)){
    const greeting=/^(alo+)/.test(normSearch(message))?"Dạ mình đây ạ 😄":"Dạ chào b nha 😄";
    return await reply({ok:true,text:greeting,source:"greeting-direct",needsHuman:false,deterministic:true});
  }

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


  // V858: Hỏi chính sách/thời hạn BH phải trả lời đúng chính sách, không được xin SĐT.
  if(isWarrantyPolicyQuestion(message)){
    return await reply({
      ok:true,
      text:warrantyPolicyAnswer(),
      source:"warranty-policy",
      deterministic:true,
      needsPhone:false,
      warrantyPending:false
    });
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
    .slice(0,30)
    .map(normalizeProduct)
    .filter(x=>x.name);

  const installmentSettings=await loadInstallmentSettings();

  // V833: Web chat chỉ tư vấn. Khi khách chủ động muốn mua/đặt/ship,
  // chuyển sang Zalo để nhân viên thật tiếp nhận đơn; không xin SĐT/địa chỉ trong chat web.
  if(explicitPurchaseIntent(message)){
    return await reply({
      ok:true,
      text:"Dạ được nha b 😄\nĐơn mua/ship bên mình có nhân viên hỗ trợ trực tiếp qua Zalo nha.",
      source:"purchase-zalo-handoff",
      deterministic:true,
      needsHuman:true,
      handoffReason:"Bấm Nhắn Zalo đặt hàng để nhân viên shop hỗ trợ lên đơn trực tiếp nha.",
      handoffType:"purchase",
      zaloUrl:"https://zalo.me/0353105423"
    });
  }

  // V846: hiểu ý khách trước khi chọn nhánh trả lời; câu ROM/phần mềm không được rơi vào nhánh báo giá/tồn.
  // V407: hiểu ý khách trước khi chọn nhánh trả lời.
  // Bộ phân tích chỉ trả intent/focus/target, không tạo câu trả lời và không lộ suy luận.
  const questionUnderstanding=await understandCustomerQuestion(message,history,apiKey);
  // V820: state hội thoại: nhớ máy đang nói, ngân sách và nhu cầu từ các lượt trước.
  const convoState=conversationState(message,history,products,questionUnderstanding.target);

  // V859: câu follow-up hỏi Like New/máy cũ phải bám CHÍNH XÁC model khách vừa hỏi trước đó.
  // Không được dùng chữ "Like New" để tự tìm một sản phẩm Like New khác (vd Find X9 -> K90 Like New).
  const singleConditionAnswer=directSingleProductConditionAnswer(message,history,products,questionUnderstanding.target);
  if(singleConditionAnswer){
    return await reply({ok:true,text:singleConditionAnswer,source:"website-product-condition-context",deterministic:true,understoodIntent:"product_condition",understoodFocus:"tình trạng máy cũ/Like New của đúng sản phẩm đang nói"});
  }

  // V842: hiểu câu hỏi nhiều sản phẩm trước khi trả lời. Ví dụ "K13 với Turbo 4 có hàng cũ ko" phải check CẢ HAI model.
  const multiConditionAnswer=directMultiProductConditionAnswer(message,products);
  if(multiConditionAnswer){
    return await reply({ok:true,text:multiConditionAnswer,source:"website-multi-product-condition",deterministic:true,understoodIntent:"product_condition",understoodFocus:"tình trạng máy cũ của nhiều sản phẩm"});
  }

  // V839: khách chỉ gọi tên máy thì trả đúng model + giá/tồn cơ bản; không tự suy diễn Like New/máy cũ/mới/seal.
  const namedProductAnswer=directNamedProductAnswer(message,history,products,questionUnderstanding.target,questionUnderstanding.intent);
  if(namedProductAnswer){
    return await reply({ok:true,text:namedProductAnswer,source:"website-product-data",deterministic:true,understoodIntent:"product_info",understoodFocus:"đúng sản phẩm khách vừa nêu"});
  }

  // Giá là dữ liệu xác định: ưu tiên trả trực tiếp, tránh model nhầm model/giá khi khách hỏi ngắn “bao nhiêu?”.
  const priceAnswer=(questionUnderstanding.intent==="price")
    ? directPriceAnswer(message,history,products,questionUnderstanding.target)
    : "";
  if(priceAnswer){
    return await reply({ok:true,text:priceAnswer,source:"website-product-data",deterministic:true,understoodIntent:"price",understoodFocus:questionUnderstanding.focus});
  }

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

  // V826: câu hỏi màu phải tra toàn bộ biến thể còn tồn trước nhánh tồn kho chung.
  // Tránh "còn màu khác không?" bị hiểu thành câu hỏi còn/hết hàng của biến thể mặc định.
  const colorAnswer=directColorAnswer(message,products,history,questionUnderstanding.target);
  if(colorAnswer){
    return await reply({
      ok:true,
      text:colorAnswer,
      source:"website-variant-color-stock",
      deterministic:true,
      understoodIntent:"color",
      understoodFocus:"màu sắc và tồn kho theo biến thể"
    });
  }

  // Tồn kho là dữ liệu xác định từ website, không để model tự suy diễn.
  const stockAnswer=(questionUnderstanding.intent==="stock" || isStockQuestion(message))
    ? directStockAnswer(message,products,history,questionUnderstanding.target)
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
        return `${i+1}. ${p.name} | Giá web: ${price} | TÌNH TRẠNG WEB: ${p.stockStatus}${p.stockQty?` | Tồn: ${p.stockQty}`:""}${p.webVariantName?` | Biến thể web: ${p.webVariantName}`:""}${p.brand?` | Hãng: ${p.brand}`:""}`;
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
    `NGỮ CẢNH ĐÃ NHỚ: máy đang nói=${convoState.target?.name||"chưa xác định"}; ngân sách=${convoState.budget?convoState.budget.toLocaleString("vi-VN")+" đ":"chưa nêu"}; nhu cầu=${convoState.needs.join(", ")||"chưa nêu"}.`,
    "Khi khách dùng từ nối ngữ cảnh như 'con đó', 'máy đó', 'còn không', 'bao nhiêu', 'bản kia', phải tiếp tục đúng sản phẩm đang nói ở NGỮ CẢNH ĐÃ NHỚ; không tự đổi sang máy khác.",
    "Nếu khách đổi sang tên máy mới rõ ràng thì cập nhật theo máy mới. Nếu có 2 máy đang được so sánh thì giữ cả hai theo hội thoại, không nhập nhằng.",
    "BẮT BUỘC trả lời theo TRỌNG TÂM đã hiểu ở trên. Trước khi chọn dữ liệu để trả lời, phải kiểm tra dữ liệu đó có thực sự trả lời đúng intent hay chỉ liên quan chung chung.",
    "Nếu dữ liệu chỉ liên quan chung chung nhưng không trả lời đúng điều khách hỏi thì không được dùng để lấp câu trả lời.",
    "Ví dụ: hỏi lãi thì chỉ dùng dữ liệu về lãi; hỏi trả trước thì chỉ dùng dữ liệu trả trước; hỏi tồn kho thì chỉ trả tồn kho.",
    `CHỈ DẪN ĐÀO TẠO TỪ QUẢN TRỊ: ${chatSettings.chatInstructions}`,
    `CÁCH NHẮN TIN DO QUẢN TRỊ TÙY CHỈNH: ${chatSettings.chatMessageStyle}`,
    `THÔNG TIN SIÊU DI ĐỘNG DO QUẢN TRỊ CUNG CẤP: ${chatSettings.chatStoreFacts}`,
    `KIẾN THỨC CHUYÊN MÔN / KỸ THUẬT DO SHOP ĐÀO TẠO: ${chatSettings.chatTechnicalKnowledge}`,
    "Nếu câu hỏi thuộc ROM, phần mềm, bootloader, OTA, cập nhật/hạ ROM hoặc kỹ thuật máy thì ưu tiên KIẾN THỨC CHUYÊN MÔN / KỸ THUẬT. Chỉ trả lời đúng vấn đề khách hỏi; không tự kéo sang giá/tồn kho/cấu hình. Nếu kiến thức chuyên môn chưa đủ cho model cụ thể thì không bịa, nói ngắn gọn phần cần kiểm tra thêm.",
    `KIẾN THỨC SHOP ĐÃ BỔ SUNG CHO AI: ${aiKnowledge.text}`,
    "Nếu KIẾN THỨC SHOP ĐÃ BỔ SUNG có câu trả lời phù hợp thì phải ưu tiên dùng để trả lời khách, không hỏi lại shop và không tự bịa thông tin khác.",
    "KHI THIẾU THÔNG TIN: Nếu khách hỏi một thông tin thực tế của shop mà toàn bộ dữ liệu được cung cấp chưa đủ để trả lời chắc chắn, hãy vẫn trả lời phần bạn biết. Cuối câu trả lời PHẢI thêm đúng một marker ẩn theo mẫu [[SHOP_NEEDS_INFO: mô tả thật ngắn thông tin shop cần cung cấp]]. Marker này không phải lời nhắn cho khách và hệ thống sẽ tự ẩn nó.",
    "Chỉ dùng SHOP_NEEDS_INFO khi thực sự thiếu dữ liệu riêng của shop như giá sửa chữa, giá thu cũ, phạm vi ship, chương trình khuyến mãi, chính sách chưa được cung cấp. Không dùng marker cho câu hỏi có thể trả lời từ danh sách sản phẩm, cấu hình trả góp, bảo hành, thông tin shop hoặc kiến thức đã bổ sung.",
    `QUY TẮC CHUYỂN NHÂN VIÊN: ${chatSettings.chatHandoffRules}`,
    `THÔNG TIN TRẢ GÓP TỪ HỆ THỐNG: ${installmentSettings.intro} Đơn vị đang bật: ${(installmentSettings.providers||[]).map(x=>x.name).join(", ")||"chưa cấu hình tên đơn vị"}.`,
    "QUY TẮC TRẢ GÓP: Shop CÓ hỗ trợ trả góp qua công ty tài chính. Tuyệt đối không được nói shop chưa hỗ trợ trả góp nếu cấu hình trả góp đang tồn tại. Không tự bịa mức cọc, lãi suất, tỷ lệ trả trước hay kết quả duyệt hồ sơ.",
    "QUY TẮC BẮT BUỘC VỀ HANDOFF: AI phải chủ động trả lời trước nếu có dữ liệu. Không được kết thúc câu trả lời bằng lời mời nhắn Zalo/nhân viên chỉ để cho chắc. Không được nói 'liên hệ nhân viên để xác nhận' khi giá, tồn kho, bảo hành, trả góp, địa chỉ, giờ mở cửa, chính sách hoặc thông tin sản phẩm đã có trong dữ liệu được cung cấp.",
    "Chỉ đề nghị nhân viên trong 4 trường hợp: (1) khách chủ động yêu cầu người thật; (2) khách CHỦ ĐỘNG nói rõ muốn mua/đặt/chốt/ship/giữ máy hoặc thương lượng riêng; (3) khách cần ảnh thực tế hoặc xác minh vật lý mà AI không thể thực hiện; (4) thông tin cần thiết thực sự không có trong dữ liệu hệ thống.",
    "TUYỆT ĐỐI KHÔNG suy diễn khách muốn mua/ship chỉ vì họ hỏi giá, màu, tồn kho, cấu hình, trả góp hoặc trả lời ngắn như 'ok', 'ừ', 'được', 'a'. Không tự xin số điện thoại, địa chỉ, tên người nhận và không tự nói 'lên đơn' nếu khách chưa chủ động yêu cầu mua/đặt/ship.",
    "Khi khách đã chủ động muốn mua/đặt/ship, web chat không nhận thông tin giao hàng. Hướng khách sang Zalo để nhân viên trực tiếp hỗ trợ đơn. Nếu không thuộc các trường hợp trên thì tuyệt đối không tự đề nghị Zalo hay nhân viên.",
    "Nói tiếng Việt tự nhiên, ngắn gọn, bình dân, dễ hiểu.",
    "GIỌNG CHAT: thân thiện kiểu nhân viên trẻ ở Quy Nhơn/Bình Định, gần gũi Gen Z nhưng không lố, không hỗn, không ép mua.",
    "QUAN TRỌNG VỀ VĂN PHONG: đừng viết như chatbot/tổng đài. Tránh các cụm cứng như 'hiện shop có cấu hình hỗ trợ', 'kết quả duyệt thực tế', 'mẫu máy nào', 'theo thông tin hệ thống', 'xin vui lòng'. Đổi sang lời chat đời thường như 'shop đang làm qua...', 'bên tài chính duyệt theo hồ sơ nha', 'bạn đang ngắm con nào gửi mình coi thử'.",
    "Mỗi lượt nên giống một người đang chat thật: có thể trả lời 1 câu ngắn trước rồi mới bổ sung 1-2 ý sau. Không cố nhồi đủ chính sách vào một lượt nếu khách chưa hỏi.",
    "Không lặp 'bạn' ở mọi câu. Có thể luân phiên 'bạn', 'b', hoặc lược chủ ngữ khi vẫn tự nhiên. Viết tắt chỉ dùng nhẹ, tuyệt đối không làm câu khó đọc.",
    "Ưu tiên từ ngữ đời thường miền Trung/Gen Z vừa phải như 'nha', 'nè', 'á', 'ổn áp', 'ngon', 'coi thử', 'xíu'; không dùng dày đặc và không giả giọng quá đà.",
    "Có thể dùng viết tắt rất tự nhiên và thỉnh thoảng như: ko, đc, b, ib, xíu, nha, nè, oke; mỗi lượt chỉ nên chen 0-2 từ viết tắt, đừng câu nào cũng viết tắt.",
    "Có thể dùng vài cách nói đời thường như 'ổn áp', 'quất con này', 'tầm này ngon á', 'chốt con này cũng hợp', nhưng chỉ khi đúng ngữ cảnh và không tâng bốc quá mức.",
    "CẢM XÚC KHI CHAT: câu trả lời phải có cảm giác như nhân viên đang thật sự phản ứng theo nội dung khách vừa nói, không chỉ trả dữ liệu khô. Khi ngữ cảnh có cảm xúc rõ thì ưu tiên thể hiện bằng cách chọn từ + 1 emoji phù hợp ở đúng tin nhắn đó.",
    "QUY TẮC EMOJI THEO NGỮ CẢNH: xin lỗi/nhận nhầm -> 😅 hoặc 🙏; xác nhận/đồng ý -> 👍; khách cảm ơn hoặc chốt hỗ trợ -> ❤️ hoặc 🤝; máy mạnh/đáng tiền/hiệu năng tốt -> 🔥; tin vui/có hàng/đúng mẫu khách cần -> 😄 hoặc 🙂; khách đang phân vân -> 🙂; khách gặp lỗi/bực -> 😅 hoặc 🙏 với giọng dịu, tuyệt đối không dùng emoji cười lớn.",
    "Tần suất tự nhiên: khoảng 35-50% các tin nhắn giao tiếp có thể có 1 emoji, nhưng chỉ khi emoji thật sự khớp cảm xúc. Không ép mọi tin đều có icon. Một lượt có nhiều bong bóng thì thường chỉ 1 bong bóng có emoji là đủ.",
    "Tin chỉ báo GIÁ, TỒN KHO, thông số, điều khoản bảo hành hoặc thông tin pháp lý phải ưu tiên rõ ràng và có thể không dùng emoji. Nếu có câu cảm xúc đi kèm thì tách emoji sang bong bóng cảm xúc, không gắn vào con số/dữ liệu quan trọng.",
    "Không dùng quá 1 emoji trong một bong bóng, không dùng chuỗi emoji, không lặp cùng một emoji liên tiếp qua nhiều lượt. Emoji phải là Unicode phổ biến, dễ hiển thị trên điện thoại.",
    "Không tự giới thiệu mình là AI, bot, Gemini, mô hình hay Hỗ trợ trực tuyến trong câu trả lời cho khách. Nếu khách hỏi trực tiếp đây có phải người thật không, phải trả lời trung thực rằng đây là hệ thống Hỗ trợ trực tuyến của Siêu Di Động và có thể chuyển nhân viên khi cần.",
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
    "KHI TRẢ LỜI TỒN KHO: nhắn như nhân viên shop, ví dụ 'Con này bên mình đang còn hàng nha b' hoặc 'Con này hiện hết hàng á b'. KHÔNG ĐƯỢC NÓI KIỂU HỆ THỐNG như 'Theo tình trạng đang hiển thị trên website', 'Theo dữ liệu sản phẩm', 'TÌNH TRẠNG WEB', 'CÒN HÀNG' viết hoa toàn bộ.",
    "Nếu khách hỏi 'bao giờ/khi nào có hàng' mà sản phẩm thực tế đang còn hàng thì nói tự nhiên rằng máy đang có sẵn, không cần chờ. Nếu đang hết và không có lịch nhập cụ thể thì nói chưa có lịch về chính xác, tuyệt đối không tự đoán ngày.",
    "TUYỆT ĐỐI KHÔNG tự suy diễn tồn kho. Chỉ được nói 'hết hàng' khi đúng sản phẩm đó xuất hiện trong DANH SÁCH SẢN PHẨM và có TÌNH TRẠNG WEB: Hết hàng. Nếu sản phẩm không có trong danh sách gửi lên thì không được tự nói hết hàng.",
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
    "Không dùng Markdown table. Không viết bài dài. Thông thường 2-5 tin nhắn ngắn là đủ. MỖI TIN NHẮN PHẢI XUỐNG DÒNG RIÊNG trong câu trả lời.",
    "BẮT BUỘC HOÀN TẤT CÂU: tuyệt đối không kết thúc câu trả lời giữa câu, giữa cụm từ hoặc ngay sau các từ nối như 'cho', 'với', 'và', 'thì', 'của'. Nếu gần giới hạn độ dài, hãy rút gọn ý nhưng phải kết thúc trọn câu."
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
MÁY ĐANG ĐƯỢC NHẮC THEO NGỮ CẢNH: ${convoState.target?.name||"Chưa xác định"}
NGÂN SÁCH ĐÃ NHỚ: ${convoState.budget?convoState.budget.toLocaleString("vi-VN")+" đ":"Chưa nêu"}
NHU CẦU ĐÃ NHỚ: ${convoState.needs.join(", ")||"Chưa nêu"}

Trả lời trực tiếp đúng trọng tâm đã hiểu. Chỉ chọn dữ liệu thực sự trả lời được trọng tâm đó. Nếu đang hỏi tư vấn theo tầm giá/nhu cầu và danh sách có sản phẩm có giá, hãy chốt 2-3 lựa chọn cụ thể ngay.`;

  const configured=String(process.env.GEMINI_CHAT_MODEL||"").trim();
  const candidates=[
    configured||"gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ].filter((x,i,a)=>x&&a.indexOf(x)===i);

  let lastError="";
  for(const model of candidates){
    try{
      const {r,data}=await callGemini(model,apiKey,systemInstruction,input);
      if(r.ok){
        const text=responseText(data);

        // V480: không gửi câu trả lời bị Gemini cắt do hết token.
        // Gặp MAX_TOKENS/LENGTH thì thử model dự phòng để lấy lại câu hoàn chỉnh.
        if(text && responseWasCut(data)){
          lastError=`${model} bị cắt câu (${responseFinishReason(data)}).`;
          continue;
        }

        if(text){
          const parsed=missingInfoMarker(text);
          if(parsed.missing) await recordMissingInfo(message,parsed.missing);
          let visible=parsed.visible||"Mình chưa có đủ thông tin chính xác về phần này. Mình đã ghi lại để shop bổ sung cho AI rồi nha.";
          // V836: Nếu câu HIỆN TẠI chưa có ý định mua rõ ràng, loại bỏ mọi câu model tự xin thông tin/lên đơn/ship/Zalo.
          visible=stripUnrequestedPurchaseFlow(visible,message);
          if(!visible) visible="Dạ mình đây ạ.";
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
    error:"Shop chưa phản hồi kịp tin nhắn này. B thử lại sau xíu nha.",
    needsHuman:true,
    handoffReason:"AI đang tạm thời chưa phản hồi được. Nếu cần gấp, bạn có thể nhắn nhân viên qua Zalo."
  });
}
