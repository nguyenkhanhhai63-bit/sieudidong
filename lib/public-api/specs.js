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
  const text=htmlText(raw);
  const start=text.search(/th[oô]ng\s*s[oố]\s*k[yỹ]\s*thu[aậ]t/i);
  if(start<0)return [];
  let block=text.slice(start).replace(/^.*?th[oô]ng\s*s[oố]\s*k[yỹ]\s*thu[aậ]t/i,"");
  const end=block.search(/xem\s*th[eê]m\s*c[aấ]u\s*h[iì]nh\s*chi\s*ti[eế]t/i);
  if(end>=0)block=block.slice(0,end);
  block=block.slice(0,12000);
  const labelPattern="Màn hình|Hệ điều hành|Camera sau|Camera trước|CPU|RAM|Bộ nhớ trong|Thẻ SIM|Dung lượng pin|Thiết kế";
  const re=new RegExp("(?:^|\\n)\\s*("+labelPattern+")\\s*:\\s*(?:\\|\\s*)?","gi");
  const hits=[]; let m; while((m=re.exec(block)))hits.push({label:m[1],from:re.lastIndex,at:m.index});
  if(hits.length<5)return [];
  const rows=[];
  for(let i=0;i<hits.length;i++){
    const to=i+1<hits.length?hits[i+1].at:block.length;
    let value=block.slice(hits[i].from,to).replace(/^\s*\|\s*/,"").trim();
    if(!value||value.length>1800||/https?:\/\/|sản phẩm\s+giá bán|danh sách \d+/i.test(value))continue;
    const label=ORDER.find(x=>unmark(x).toLowerCase()===unmark(hits[i].label).toLowerCase());
    if(label)rows.push({label,value});
  }
  const map=new Map(rows.map(x=>[x.label,x]));
  return ORDER.filter(x=>map.has(x)).map(x=>map.get(x));
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
    if(specs.length<5){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:"Nguồn hiện tại chưa đọc được"}); return res.status(422).json({error:"Link này không đọc được khối Thông số kỹ thuật của MobileCity"}); }
    const data={productName:name,sourceUrl:source.url,specs,syncedAt:new Date().toISOString()};
    await setCache(name,data); res.setHeader("Cache-Control","no-store"); return res.status(200).json({...data,sourceType:"mobilecity"});
  }catch(e){ if(old)return res.status(200).json({...old,sourceType:"saved",syncWarning:String(e?.message||e)}); return res.status(502).json({error:"Không lấy được thông số MobileCity",detail:String(e?.message||e)}); }
}
