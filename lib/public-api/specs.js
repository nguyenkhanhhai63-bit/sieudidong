import { redisGet, redisSet } from "../redis.js";

const LINKS_KEY="sdd:spec-links:v1";
const MANUAL_SPEC_PREFIX="sdd:manual-spec:v1:";

const CACHE_PREFIX="sdd:mobilecity-spec:v1:";

function unmark(s=""){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D"); }
function norm(s=""){ return unmark(s).toLowerCase().replace(/\([^)]*\)/g," ").replace(/\b(rom\s*)?tieng\s*viet\b/g," ").replace(/\b(5g|4g)\b/g," ").replace(/\b\d+\s*(gb|tb)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function cacheKey(name){ return CACHE_PREFIX+encodeURIComponent(norm(name)); }
async function getLinks(){ const raw=await redisGet(LINKS_KEY); if(!raw)return {}; try{return typeof raw==="string"?JSON.parse(raw):raw}catch{return {}} }
function resolve(name,map){ const n=norm(name); for(const [model,item] of Object.entries(map||{})){ const url=typeof item==="string"?item:item?.url; if(url&&norm(model)===n)return {model,url}; } return null; }
function decode(s=""){ return String(s).replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))); }
function htmlText(html=""){ return decode(String(html).replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|div|li|tr|h[1-6]|dt|dd)>/gi,"\n").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
async function fetchSource(url){
  // V313: Không cho Vercel truy cập MobileCity trực tiếp nữa.
  // Jina Reader đọc đúng URL Admin và trả Markdown/text đã render.
  const clean=String(url||"").trim();
  if(!/^https?:\/\//i.test(clean)) throw new Error("URL nguồn không hợp lệ");

  const reader="https://r.jina.ai/http://"+clean.replace(/^https?:\/\//i,"");
  const r=await fetch(reader,{
    headers:{
      "Accept":"text/plain, text/markdown;q=0.9, */*;q=0.5",
      "User-Agent":"Mozilla/5.0"
    },
    redirect:"follow"
  });
  if(!r.ok) throw new Error("Jina Reader HTTP "+r.status);
  const text=await r.text();
  if(!text || text.length<200) throw new Error("Jina Reader không trả đủ nội dung");
  return text;
}

const ORDER=["Màn hình","Hệ điều hành","Camera sau","Camera trước","CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"];
function parseMobileCity(raw=""){
  let text=String(raw||"")
    .replace(/\r/g,"")
    .replace(/!\[[^\]]*\]\([^)]+\)/g,"")
    .replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/\u00a0/g," ")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n{3,}/g,"\n\n");

  const order=["Màn hình","Hệ điều hành","Camera sau","Camera trước","CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"];
  const aliases={
    "Màn hình":["Màn hình"],
    "Hệ điều hành":["Hệ điều hành"],
    "Camera sau":["Camera sau"],
    "Camera trước":["Camera trước"],
    "CPU":["CPU","Chipset"],
    "RAM":["RAM"],
    "Bộ nhớ trong":["Bộ nhớ trong","ROM"],
    "Thẻ SIM":["Thẻ SIM","Loại SIM"],
    "Dung lượng pin":["Dung lượng pin"],
    "Thiết kế":["Thiết kế"]
  };

  // Prefer the actual technical-spec section if Reader exposes the heading.
  const hs=text.search(/th[oô]ng\s*s[oố]\s*k[yỹ]\s*thu[aậ]t/i);
  let block=hs>=0 ? text.slice(hs) : text;
  const stop=block.search(/xem\s*th[eê]m\s*c[aấ]u\s*h[iì]nh\s*chi\s*ti[eế]t/i);
  if(stop>0) block=block.slice(0,stop);
  block=block.slice(0,18000);

  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const aliasList=[...new Set(Object.values(aliases).flat())].sort((a,b)=>b.length-a.length);
  const alt=aliasList.map(esc).join("|");

  // Reader output can be:
  // Màn hình: | value
  // **Màn hình:** value
  // | Màn hình | value |
  const re=new RegExp("(?:^|\\n|\\|)\\s*(?:\\*\\*)?("+alt+")(?:\\*\\*)?\\s*(?::|\\|)\\s*","gi");
  const hits=[]; let m;
  while((m=re.exec(block))) hits.push({raw:m[1],from:re.lastIndex,at:m.index});
  if(hits.length<5) return [];

  const canon=raw=>{
    const n=unmark(raw).toLowerCase().trim();
    for(const label of order){
      if((aliases[label]||[]).some(a=>unmark(a).toLowerCase()===n)) return label;
    }
    return "";
  };

  const map=new Map();
  for(let i=0;i<hits.length;i++){
    const h=hits[i], end=i+1<hits.length?hits[i+1].at:block.length;
    const label=canon(h.raw);
    let value=block.slice(h.from,end)
      .replace(/^\s*\|\s*/,"")
      .replace(/\|\s*$/,"")
      .replace(/\*\*/g,"")
      .replace(/\n{3,}/g,"\n\n")
      .trim();
    if(!label || !value || value.length>2500) continue;
    if(/https?:\/\/|sản phẩm\s*\|\s*giá bán|mua ngay|trả góp/i.test(value)) continue;
    if(!map.has(label)) map.set(label,{label,value});
  }
  const rows=order.filter(x=>map.has(x)).map(x=>map.get(x));
  return rows.length>=5?rows:[];
}

async function getCache(name){ const raw=await redisGet(cacheKey(name)); if(!raw)return null; try{const x=typeof raw==="string"?JSON.parse(raw):raw;return x?.specs?.length?x:null}catch{return null} }
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
  const manual=await getManualSpecs(name).catch(()=>null);
  if(manual){
    res.setHeader("Cache-Control","public, max-age=300, s-maxage=1800");
    return res.status(200).json({...manual,sourceType:"manual-admin"});
  }
  const old=await getCache(name).catch(()=>null);
  if(old&&!refresh)return res.status(200).json({...old,sourceType:"saved"});
  try{
    const source=resolve(name,await getLinks());
    if(!source?.url){ if(old)return res.status(200).json({...old,sourceType:"saved"}); return res.status(404).json({error:"Chưa gắn link MobileCity cho model này"}); }
    const specs=parseMobileCity(await fetchSource(source.url));
    if(specs.length<5){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:"Nguồn hiện tại chưa đọc được"}); return res.status(422).json({error:"Jina Reader đã đọc link nhưng chưa nhận diện được bảng cấu hình"}); }
    const data={productName:name,sourceUrl:source.url,specs,syncedAt:new Date().toISOString()};
    await setCache(name,data); res.setHeader("Cache-Control","no-store"); return res.status(200).json({...data,sourceType:"mobilecity"});
  }catch(e){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:String(e?.message||e)}); return res.status(502).json({error:"Không lấy được thông số MobileCity",detail:String(e?.message||e)}); }
}
