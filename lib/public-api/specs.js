import { redisGet, redisSet } from "../redis.js";

const LINKS_KEY="sdd:spec-links:v1";
const MANUAL_SPEC_PREFIX="sdd:manual-spec:v1:";

const CACHE_PREFIX="sdd:mobilecity-spec:v1:";

function unmark(s=""){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D"); }
function norm(s=""){
  return unmark(s).toLowerCase()
    .replace(/\([^)]*\)/g," ")
    .replace(/\b(chinh\s*hang|hang\s*chinh\s*hang|quoc\s*te|noi\s*dia|like\s*new)\b/g," ")
    .replace(/\b(rom\s*)?tieng\s*viet\b/g," ")
    .replace(/\b(5g|4g)\b/g," ")
    .replace(/\b\d+\s*(gb|tb)\b/g," ")
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}

// V331: khóa nhận diện model dùng riêng cho việc nối tên ngoài web với model Admin.
// Bỏ các phần chỉ mô tả biến thể (màu, pin %, RAM/ROM, chip/pin trong ngoặc...),
// nhưng KHÔNG fuzzy sang model khác.
function modelIdentity(s=""){
  let x=unmark(s).toLowerCase()
    .replace(/\([^)]*\)/g," ")
    .replace(/\b(chinh\s*hang|hang\s*chinh\s*hang|quoc\s*te|noi\s*dia|like\s*new|may\s*cu|cu)\b/g," ")
    .replace(/\b(rom\s*)?tieng\s*viet\b/g," ")
    .replace(/\b(5g|4g)\b/g," ")
    .replace(/\b(pin\s*)?\d{1,3}%\b/g," ")
    .replace(/\b\d+\s*(gb|tb)\b/g," ")
    .replace(/\b(den|do|trang|xanh|xanh duong|xanh la|tim|vang|hong|bac|xam|cam|nau|be|kem)\b/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ").trim();
  return x;
}
function cacheKey(name){ return CACHE_PREFIX+encodeURIComponent(norm(name)); }
async function getLinks(){ const raw=await redisGet(LINKS_KEY); if(!raw)return {}; try{return typeof raw==="string"?JSON.parse(raw):raw}catch{return {}} }
function resolve(name,map){
  const exact=norm(name), identity=modelIdentity(name);
  const entries=Object.entries(map||{}).filter(([,item])=>!!(typeof item==="string"?item:item?.url));

  // 1) Ưu tiên khớp tuyệt đối theo norm cũ để không đổi hành vi các máy đang chạy tốt.
  for(const [model,item] of entries){
    const url=typeof item==="string"?item:item?.url;
    if(norm(model)===exact)return {model,url};
  }

  // 2) Khớp khóa model đã bỏ thuộc tính biến thể. Chỉ nhận khi DUY NHẤT một model Admin khớp,
  // tránh lấy nhầm thông số của máy khác.
  const hits=entries.filter(([model])=>modelIdentity(model)===identity);
  if(hits.length===1){
    const [model,item]=hits[0];
    return {model,url:typeof item==="string"?item:item?.url};
  }
  return null;
}
function decode(s=""){ return String(s).replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))); }
function htmlText(html=""){ return decode(String(html).replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|div|li|tr|h[1-6]|dt|dd)>/gi,"\n").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
async function fetchSource(url){
  const clean=String(url||"").trim();
  if(!/^https?:\/\//i.test(clean)) throw new Error("URL nguồn không hợp lệ");

  const token=String(process.env.BROWSERLESS_TOKEN||"").trim();
  if(!token) throw new Error("Chưa cài BROWSERLESS_TOKEN trên Vercel");

  const endpoint="https://production-sfo.browserless.io/content?token="+encodeURIComponent(token);
  const r=await fetch(endpoint,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"text/html",
      "Cache-Control":"no-cache"
    },
    body:JSON.stringify({
      url:clean,
      gotoOptions:{waitUntil:"networkidle2",timeout:30000},
      waitForTimeout:2500,
      bestAttempt:true,
      rejectResourceTypes:["image","media","font"]
    })
  });
  const html=await r.text();
  if(!r.ok) throw new Error("Browserless HTTP "+r.status+(html?": "+html.slice(0,160):""));
  if(!html || html.length<500) throw new Error("Browserless không trả đủ HTML");
  return html;
}

const ORDER=["Màn hình","Hệ điều hành","Camera sau","Camera trước","CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"];

// V922: một số trang MobileCity gộp nhiều nhóm vào cùng một ô (ví dụ Hệ điều hành
// chứa tiếp Màn hình, Camera trước chứa tiếp CPU & RAM). Tách lại theo tiêu đề nhóm
// trước khi hiển thị/lưu cache để không làm hỏng các model đang đọc đúng.
function repairMergedSpecs(rows=[]){
  const aliases=[
    ["Màn hình",/^(?:màn\s*hình|display)\s*:?(.*)$/i],
    ["Hệ điều hành",/^(?:hệ\s*điều\s*hành|os)\s*:?(.*)$/i],
    ["Camera sau",/^(?:camera\s*sau|camera\s*chính)\s*:?(.*)$/i],
    ["Camera trước",/^(?:camera\s*trước|camera\s*selfie)\s*:?(.*)$/i],
    ["CPU",/^(?:cpu(?:\s*&\s*ram)?|chip|chipset|vi\s*xử\s*lý)\s*:?(.*)$/i],
    ["RAM",/^ram\s*:?(.*)$/i],
    ["Bộ nhớ trong",/^(?:bộ\s*nhớ\s*trong|bộ\s*nhớ|rom)\s*:?(.*)$/i],
    ["Thẻ SIM",/^(?:thẻ\s*sim|sim|kết\s*nối\s*&\s*sim)\s*:?(.*)$/i],
    ["Dung lượng pin",/^(?:dung\s*lượng\s*pin|pin(?:\s*&\s*sạc)?)\s*:?(.*)$/i],
    ["Thiết kế",/^(?:thiết\s*kế|kiểu\s*dáng)\s*:?(.*)$/i]
  ];
  const out=new Map();
  const put=(label,parts)=>{
    const value=parts.map(x=>String(x||"").trim()).filter(Boolean).join("\n").trim();
    if(!label||!value)return;
    if(!out.has(label))out.set(label,{label,value});
    else if(!out.get(label).value.includes(value))out.get(label).value += "\n"+value;
  };

  for(const row of Array.isArray(rows)?rows:[]){
    let current=ORDER.includes(row?.label)?row.label:"";
    const buckets=new Map();
    if(current)buckets.set(current,[]);
    for(const rawLine of String(row?.value||"").replace(/\r/g,"").split("\n")){
      const line=rawLine.trim(); if(!line)continue;
      let hit=null;
      for(const [label,re] of aliases){ const m=line.match(re); if(m){ hit=[label,(m[1]||"").trim()]; break; } }
      // Chỉ coi là ranh giới mới khi tiêu đề đứng đầu dòng. Các dòng như "Loại màn hình: AMOLED"
      // vẫn thuộc nhóm hiện tại, không bị tách nhầm.
      if(hit){
        current=hit[0];
        if(!buckets.has(current))buckets.set(current,[]);
        if(hit[1])buckets.get(current).push(hit[1]);
      }else if(current){ buckets.get(current).push(line); }
    }
    for(const [label,parts] of buckets)put(label,parts);
  }
  return ORDER.filter(x=>out.has(x)).map(x=>out.get(x));
}
function parseMobileCity(raw=""){
  const order=["Màn hình","Hệ điều hành","Camera sau","Camera trước","CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"];
  const canon=x=>{
    const n=unmark(htmlText(x)).toLowerCase().replace(/[:：]/g,"").trim();
    return order.find(y=>unmark(y).toLowerCase()===n)||"";
  };
  const cleanValue=x=>htmlText(String(x||"").replace(/<br\s*\/?>/gi,"\n")).trim();

  // Rendered DOM: find any real table whose rows contain the known left-column labels.
  const candidates=[];
  let tm;
  const tableRe=/<table\b[^>]*>[\s\S]*?<\/table>/gi;
  while((tm=tableRe.exec(raw))){
    const map=new Map(); let rm;
    const rowRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    while((rm=rowRe.exec(tm[0]))){
      const cells=[...rm[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(x=>x[1]);
      if(cells.length<2)continue;
      const label=canon(cells[0]), value=cleanValue(cells.slice(1).join("\n"));
      if(label&&value)map.set(label,{label,value});
    }
    const rows=order.filter(x=>map.has(x)).map(x=>map.get(x));
    if(rows.length>=5)candidates.push(rows);
  }
  if(candidates.length){
    candidates.sort((a,b)=>b.length-a.length);
    return repairMergedSpecs(candidates[0]);
  }

  // Some MobileCity templates use divs instead of <table>. Use rendered visible text,
  // bounded by the same labels and "Xem thêm cấu hình chi tiết".
  const text=htmlText(raw).replace(/\r/g,"");
  const hs=text.search(/th[oô]ng\s*s[oố]\s*k[yỹ]\s*thu[aậ]t/i);
  if(hs<0)return [];
  let block=text.slice(hs);
  const stop=block.search(/xem\s*th[eê]m\s*c[aấ]u\s*h[iì]nh\s*chi\s*ti[eế]t/i);
  if(stop>0)block=block.slice(0,stop);
  block=block.slice(0,16000);

  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const re=new RegExp("(?:^|\\n)\\s*("+order.map(esc).join("|")+")\\s*:\\s*","gi");
  const hits=[]; let m;
  while((m=re.exec(block)))hits.push({label:canon(m[1]),from:re.lastIndex,at:m.index});
  const map=new Map();
  for(let i=0;i<hits.length;i++){
    const end=i+1<hits.length?hits[i+1].at:block.length;
    const value=block.slice(hits[i].from,end).trim();
    if(hits[i].label&&value&&!map.has(hits[i].label))map.set(hits[i].label,{label:hits[i].label,value});
  }
  const rows=order.filter(x=>map.has(x)).map(x=>map.get(x));
  return rows.length>=5?repairMergedSpecs(rows):[];
}

async function getCache(name){ const raw=await redisGet(cacheKey(name)); if(!raw)return null; try{const x=typeof raw==="string"?JSON.parse(raw):raw;if(!x?.specs?.length)return null;const specs=repairMergedSpecs(x.specs);return specs.length?{...x,specs}:null}catch{return null} }
async function setCache(name,x){ await redisSet(cacheKey(name),JSON.stringify(x)); }


async function getManualSpecs(name){
  const raw=await redisGet(MANUAL_SPEC_PREFIX+encodeURIComponent(norm(name)));
  if(!raw)return null;
  try{
    const x=typeof raw==="string"?JSON.parse(raw):raw;
    return x?.specs?.length?x:null;
  }catch{return null}
}
export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const name=String(req.query?.name||"").trim(), refresh=String(req.query?.refresh||"")==="1";
  if(!name)return res.status(400).json({error:"Thiếu tên sản phẩm"});
  // Resolve the Admin model first. This lets a storefront title such as
  // "Xiaomi 15T Chính hãng (Dimensity 8400 Ultra)" reuse the exact Admin model/link "Xiaomi 15T".
  // No fuzzy product substitution is used: resolve() still requires equality after removing display-only suffixes.
  const links=await getLinks();
  const source=resolve(name,links);
  const canonicalName=source?.model || name;

  const manual=(await getManualSpecs(name).catch(()=>null)) ||
               (canonicalName!==name ? await getManualSpecs(canonicalName).catch(()=>null) : null);
  if(manual&&!refresh){
    res.setHeader("Cache-Control","public, max-age=300, s-maxage=1800");
    return res.status(200).json({...manual,sourceType:"manual-admin",matchedModel:canonicalName});
  }

  // Admin sync normally stores cache under the Admin model name. Read both aliases.
  const old=(await getCache(name).catch(()=>null)) ||
            (canonicalName!==name ? await getCache(canonicalName).catch(()=>null) : null);
  if(old&&!refresh)return res.status(200).json({...old,sourceType:"saved",matchedModel:canonicalName});

  // V328: storefront/public requests are cache-only. Browserless is never called
  // while a customer is opening a product page. Specs must be synchronized first in Admin.
  if(!refresh){
    res.setHeader("Cache-Control","public, max-age=60, s-maxage=300");
    return res.status(404).json({
      error:"Thông số chưa được đồng bộ sẵn",
      code:"SPEC_NOT_PRELOADED",
      matchedModel:canonicalName
    });
  }

  try{
    if(!source?.url){
      if(old)return res.status(200).json({...old,sourceType:"saved"});
      return res.status(404).json({error:"Chưa gắn link MobileCity cho model này"});
    }
    const specs=parseMobileCity(await fetchSource(source.url));
    if(specs.length<5){
      if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:"Nguồn hiện tại chưa đọc được"});
      return res.status(422).json({error:"Browserless đã mở trang nhưng chưa tìm thấy bảng cấu hình"});
    }
    const data={productName:name,matchedModel:source.model,sourceUrl:source.url,specs,syncedAt:new Date().toISOString()};
    // Save both keys so Admin and storefront names immediately share the same synchronized specs.
    await setCache(source.model,data);
    if(norm(name)!==norm(source.model) || name!==source.model) await setCache(name,data);
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({...data,sourceType:"mobilecity"});
  }catch(e){
    if(old)return res.status(200).json({...old,sourceType:"saved",matchedModel:canonicalName,syncWarning:String(e?.message||e)});
    return res.status(502).json({error:"Không lấy được thông số MobileCity",detail:String(e?.message||e)});
  }
}
