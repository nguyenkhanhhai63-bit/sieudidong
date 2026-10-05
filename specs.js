import { redisGet, redisSet } from "../redis.js";

const LINKS_KEY="sdd:spec-links:v1";
const MANUAL_SPEC_PREFIX="sdd:manual-spec:v1:";

const CACHE_PREFIX="sdd:mobilecity-spec:v1:";

function unmark(s=""){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D"); }
function norm(s=""){ return unmark(s).toLowerCase().replace(/\([^)]*\)/g," ").replace(/\b(rom\s*)?tieng\s*viet\b/g," ").replace(/\b(5g|4g)\b/g," ").replace(/\b\d+\s*(gb|tb)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function cacheKey(name){ return CACHE_PREFIX+encodeURIComponent(norm(name)); }
async function getLinks(){ const raw=await redisGet(LINKS_KEY); if(!raw)return {}; try{return typeof raw==="string"?JSON.parse(raw):raw}catch{return {}} }
function resolveNorm(s=""){
  return norm(s)
    .replace(/\b(chinh hang|hang chinh hang|new seal|newseal|may moi|nguyen seal|fullbox|full box)\b/g," ")
    .replace(/\b(phien ban|ban quoc te|quoc te|noi dia)\b/g," ")
    .replace(/\s+/g," ").trim();
}
function resolve(name,map){
  const n=resolveNorm(name);
  const entries=Object.entries(map||{}).map(([model,item])=>({model,url:typeof item==="string"?item:item?.url,key:resolveNorm(model)})).filter(x=>x.url);
  // 1) Ưu tiên khớp tuyệt đối sau khi bỏ các hậu tố bán hàng như “Chính hãng”.
  const exact=entries.find(x=>x.key===n);
  if(exact)return {model:exact.model,url:exact.url};
  // 2) Chỉ cho phép khớp bao hàm khi phần chênh lệch là hậu tố mô tả, tránh tự nhảy sang model khác.
  const candidates=entries.filter(x=>x.key && n && (n.startsWith(x.key+" ") || x.key.startsWith(n+" ")));
  if(candidates.length===1)return {model:candidates[0].model,url:candidates[0].url};
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
    return candidates[0];
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
  if(manual&&!refresh){
    res.setHeader("Cache-Control","public, max-age=300, s-maxage=1800");
    return res.status(200).json({...manual,sourceType:"manual-admin"});
  }
  const old=await getCache(name).catch(()=>null);
  if(old&&!refresh)return res.status(200).json({...old,sourceType:"saved"});
  try{
    const source=resolve(name,await getLinks());
    if(!source?.url){ if(old)return res.status(200).json({...old,sourceType:"saved"}); return res.status(404).json({error:"Chưa gắn link MobileCity cho model này"}); }
    const specs=parseMobileCity(await fetchSource(source.url));
    if(specs.length<5){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:"Nguồn hiện tại chưa đọc được"}); return res.status(422).json({error:"Browserless đã mở trang nhưng chưa tìm thấy bảng cấu hình"}); }
    const data={productName:name,sourceUrl:source.url,specs,syncedAt:new Date().toISOString()};
    await setCache(name,data); res.setHeader("Cache-Control","no-store"); return res.status(200).json({...data,sourceType:"mobilecity"});
  }catch(e){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:String(e?.message||e)}); return res.status(502).json({error:"Không lấy được thông số MobileCity",detail:String(e?.message||e)}); }
}
