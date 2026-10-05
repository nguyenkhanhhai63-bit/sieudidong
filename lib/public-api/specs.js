import { redisGet, redisSet } from "../redis.js";

const LINKS_KEY="sdd:spec-links:v1";
const CACHE_PREFIX="sdd:mobilecity-spec:v1:";

function unmark(s=""){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D"); }
function norm(s=""){ return unmark(s).toLowerCase().replace(/\([^)]*\)/g," ").replace(/\b(rom\s*)?tieng\s*viet\b/g," ").replace(/\b(5g|4g)\b/g," ").replace(/\b\d+\s*(gb|tb)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function cacheKey(name){ return CACHE_PREFIX+encodeURIComponent(norm(name)); }
async function getLinks(){ const raw=await redisGet(LINKS_KEY); if(!raw)return {}; try{return typeof raw==="string"?JSON.parse(raw):raw}catch{return {}} }
function resolve(name,map){ const n=norm(name); for(const [model,item] of Object.entries(map||{})){ const url=typeof item==="string"?item:item?.url; if(url&&norm(model)===n)return {model,url}; } return null; }
function decode(s=""){ return String(s).replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))); }
function htmlText(html=""){ return decode(String(html).replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|div|li|tr|h[1-6]|dt|dd)>/gi,"\n").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
async function fetchSource(url){
  const headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36","Accept":"text/html,application/xhtml+xml","Accept-Language":"vi-VN,vi;q=0.9,en;q=0.7"};
  let r=await fetch(url,{headers,redirect:"follow"});
  if(r.ok)return await r.text();
  if(r.status===403){
    const mirror="https://r.jina.ai/http://"+url.replace(/^https?:\/\//i,"");
    r=await fetch(mirror,{headers:{"Accept":"text/plain","User-Agent":headers["User-Agent"]},redirect:"follow"});
    if(r.ok)return await r.text();
  }
  throw new Error("Nguồn thông số HTTP "+r.status);
}
const ORDER=["Màn hình","Hệ điều hành","Camera sau","Camera trước","CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"];
function parseMobileCity(raw=""){
  const text=htmlText(raw).replace(/\r/g,"");
  const defs=[
    ["Màn hình",["Màn hình"]],
    ["Hệ điều hành",["Hệ điều hành"]],
    ["Camera sau",["Camera sau"]],
    ["Camera trước",["Camera trước"]],
    ["CPU",["CPU","Chipset"]],
    ["RAM",["RAM"]],
    ["Bộ nhớ trong",["Bộ nhớ trong","ROM"]],
    ["Thẻ SIM",["Thẻ SIM","Loại SIM","Khe SIM"]],
    ["Dung lượng pin",["Dung lượng pin","Pin"]],
    ["Thiết kế",["Thiết kế","Kiểu dáng"]]
  ];
  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const aliasToLabel=new Map();
  for(const [label,als] of defs) for(const a of als) aliasToLabel.set(unmark(a).toLowerCase(),label);
  const aliases=[...aliasToLabel.keys()].sort((a,b)=>b.length-a.length);

  // Work on accent-folded text but preserve indices because NFD mark removal changes length.
  // Build a folded copy plus index map back to original.
  let folded="", idx=[];
  for(let i=0;i<text.length;i++){
    const f=unmark(text[i]).toLowerCase();
    for(const ch of f){ folded+=ch; idx.push(i); }
  }
  const alt=aliases.map(esc).join("|");
  // A real spec row must begin at a line/boundary and have ":" or "|" immediately after label.
  const re=new RegExp("(?:^|\\n|\\|)\\s*("+alt+")\\s*(?::|\\|)\\s*","g");
  const hits=[]; let m;
  while((m=re.exec(folded))){
    const rawAlias=m[1];
    const label=aliasToLabel.get(rawAlias);
    const from=idx[Math.max(0,re.lastIndex-1)]??0;
    const at=idx[Math.max(0,m.index)]??0;
    hits.push({label,from,at});
  }
  if(hits.length<5)return [];

  // Find densest cluster of distinct spec labels. This replaces dependency on a heading.
  let best=null;
  for(let i=0;i<hits.length;i++){
    const seen=new Set();
    for(let j=i;j<hits.length;j++){
      if(hits[j].at-hits[i].at>6500)break;
      seen.add(hits[j].label);
      if(!best || seen.size>best.count || (seen.size===best.count && hits[j].at-hits[i].at<best.span)){
        best={i,j,count:seen.size,span:hits[j].at-hits[i].at};
      }
    }
  }
  if(!best || best.count<5)return [];

  const cluster=hits.slice(best.i,best.j+1);
  const map=new Map();
  for(let i=0;i<cluster.length;i++){
    const h=cluster[i];
    const to=i+1<cluster.length?cluster[i+1].at:Math.min(text.length,h.from+1400);
    let value=text.slice(h.from,to)
      .replace(/^\s*[:|]\s*/,"")
      .replace(/\n{3,}/g,"\n\n").trim();
    // Prevent article/product-list pollution.
    if(!value || value.length>1400)continue;
    if(/https?:\/\/|www\.|sản phẩm\s+giá bán|danh sách \d+|mua ngay|trả góp|đánh giá sản phẩm/i.test(value))continue;
    if(!map.has(h.label))map.set(h.label,{label:h.label,value});
  }
  const order=defs.map(x=>x[0]);
  const rows=order.filter(x=>map.has(x)).map(x=>map.get(x));
  return rows.length>=5?rows:[];
}

async function getCache(name){ const raw=await redisGet(cacheKey(name)); if(!raw)return null; try{const x=typeof raw==="string"?JSON.parse(raw):raw;return x?.specs?.length?x:null}catch{return null} }
async function setCache(name,x){ await redisSet(cacheKey(name),JSON.stringify(x)); }

export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const name=String(req.query?.name||"").trim(), refresh=String(req.query?.refresh||"")==="1";
  if(!name)return res.status(400).json({error:"Thiếu tên sản phẩm"});
  const old=await getCache(name).catch(()=>null);
  if(old&&!refresh)return res.status(200).json({...old,sourceType:"saved"});
  try{
    const source=resolve(name,await getLinks());
    if(!source?.url){ if(old)return res.status(200).json({...old,sourceType:"saved"}); return res.status(404).json({error:"Chưa gắn link MobileCity cho model này"}); }
    const specs=parseMobileCity(await fetchSource(source.url));
    if(specs.length<5){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:"Nguồn hiện tại chưa đọc được"}); return res.status(422).json({error:"Không nhận diện được cụm cấu hình hợp lệ từ link MobileCity này"}); }
    const data={productName:name,sourceUrl:source.url,specs,syncedAt:new Date().toISOString()};
    await setCache(name,data); res.setHeader("Cache-Control","no-store"); return res.status(200).json({...data,sourceType:"mobilecity"});
  }catch(e){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:String(e?.message||e)}); return res.status(502).json({error:"Không lấy được thông số MobileCity",detail:String(e?.message||e)}); }
}
