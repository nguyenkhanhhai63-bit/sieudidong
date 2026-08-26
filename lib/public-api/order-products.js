const SOURCE_PAGE='https://noibo.sieudidong.vn/';
const UA='Mozilla/5.0 (compatible; SieuDiDongOrderSync/1.0)';

const text=async url=>{
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/json,text/plain,*/*'}});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return {body:await r.text(),type:r.headers.get('content-type')||'',url:r.url};
};
const abs=(u,b)=>{try{return new URL(u,b).href}catch{return ''}};
const uniq=a=>[...new Set(a.filter(Boolean))];
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const isPrice=s=>/^\s*[\d.,]+\s*(?:đ|vnd)?\s*$/i.test(String(s||''));
const looksVersion=s=>/(?:\d+\s*\/\s*(?:\d+|1\s*T)|\d+\s*GB|\d+\s*TB)/i.test(String(s||''));
const brandOf=n=>{
  const x=n.toLowerCase();
  if(/\b(redmi|xiaomi|poco|mi\s*\d)/.test(x)) return 'XIAOMI / REDMI';
  if(/\b(iqoo|vivo)\b/.test(x)) return 'VIVO / IQOO';
  if(/\boneplus\b|^1\+/.test(x)) return 'ONEPLUS';
  if(/\boppo\b/.test(x)) return 'OPPO';
  if(/\bhonor\b/.test(x)) return 'HONOR';
  if(/\bpad\b|tablet/.test(x)) return 'TABLET';
  return 'KHÁC';
};
function add(map,name,version){
  name=clean(name).replace(/^[•\-–—]+/,'').trim(); version=clean(version);
  if(!name || name.length<3 || name.length>90) return;
  if(/^(ps|báo giá|cập nhật|giao diện|tìm tên|chỉ hiện|thông tin|tạo bởi|internal price|giá)$/i.test(name)) return;
  if(isPrice(name) || /^\d+[\d.,]*$/.test(name)) return;
  const key=name.toLowerCase().replace(/\s+/g,' ');
  if(!map.has(key)) map.set(key,{name,brand:brandOf(name),versions:[]});
  if(version && looksVersion(version)){
    version.split(/[|·;,]+/).map(clean).filter(Boolean).forEach(v=>{if(!map.get(key).versions.includes(v)) map.get(key).versions.push(v)});
  }
}
function parseDelimited(body,map){
  const lines=body.split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2) return;
  const delim=(lines[0].match(/\t/g)||[]).length >= (lines[0].match(/,/g)||[]).length ? '\t' : ',';
  for(const ln of lines){
    const cols=ln.split(delim).map(x=>clean(x.replace(/^"|"$/g,'')));
    for(let i=0;i<cols.length;i++){
      const c=cols[i]; if(!c || isPrice(c)) continue;
      const next=cols[i+1]||'';
      if(looksVersion(next) && /[A-Za-zÀ-ỹ]/.test(c)) add(map,c,next);
    }
  }
}
function parseJson(body,map){
  try{
    const root=JSON.parse(body);
    const walk=v=>{
      if(Array.isArray(v)) return v.forEach(walk);
      if(!v||typeof v!=='object') return;
      const name=v.name||v.product||v['Tên máy']||v['Tên Máy']||v['Sản phẩm']||v.model||v.title;
      const ver=v.version||v.versions||v.variant||v['Bộ nhớ']||v['BỘ NHỚ']||v['Dung lượng']||v.capacity||v.storage;
      if(name){ if(Array.isArray(ver)) ver.forEach(x=>add(map,name,x)); else add(map,name,ver||''); }
      Object.values(v).forEach(walk);
    }; walk(root);
  }catch{}
}
function parseHtml(body,map){
  const stripped=body.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');
  const textOnly=clean(stripped.replace(/<\/?(?:div|tr|td|th|li|p|h\d|section|article|br)[^>]*>/gi,'\n'));
  // fallback only when model + version occur together
  for(const m of textOnly.matchAll(/([A-Za-zÀ-ỹ0-9+][A-Za-zÀ-ỹ0-9+ ._-]{2,55}?)\s+(\d{1,2}\s*\/\s*(?:\d{2,4}|1\s*T))/g)) add(map,m[1],m[2]);
}
function discover(body,base){
  const urls=[];
  for(const m of body.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) urls.push(abs(m[1],base));
  for(const m of body.matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%\\-]+/g)) urls.push(m[0].replace(/\\\//g,'/').replace(/\\u0026/g,'&'));
  return uniq(urls).filter(u=>/docs\.google\.com\/spreadsheets|googleusercontent|\.csv(?:\?|$)|\.tsv(?:\?|$)|\.json(?:\?|$)|\/api\//i.test(u));
}
function sheetCandidates(url){
  const out=[url];
  const m=url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if(m){
    const gid=(url.match(/[?&#]gid=(\d+)/)||[])[1]||'0';
    out.push(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=tsv&gid=${gid}`);
    out.push(`https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`);
  }
  return uniq(out);
}
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
  const map=new Map();
  try{
    const page=await text(SOURCE_PAGE);
    parseHtml(page.body,map);
    let candidates=discover(page.body,page.url);
    // inspect same-origin JS to discover the real data source used by noibo
    const scripts=[...page.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>abs(m[1],page.url)).filter(u=>u&&new URL(u).origin===new URL(SOURCE_PAGE).origin).slice(0,12);
    for(const s of scripts){try{const r=await text(s); candidates.push(...discover(r.body,s));}catch{}}
    candidates=uniq(candidates).flatMap(sheetCandidates);
    for(const u of candidates.slice(0,24)){
      try{
        const r=await text(u);
        if(/json/i.test(r.type)||/^[\s\n]*[\[{]/.test(r.body)) parseJson(r.body,map);
        parseDelimited(r.body,map);
        parseHtml(r.body,map);
      }catch{}
    }
    const products=[...map.values()].filter(p=>p.name && p.brand!=='KHÁC').sort((a,b)=>a.brand.localeCompare(b.brand,'vi')||a.name.localeCompare(b.name,'vi'));
    return res.status(200).json({source:SOURCE_PAGE,strict:true,count:products.length,products});
  }catch(e){
    console.error('order-products sync error',e);
    return res.status(200).json({source:SOURCE_PAGE,strict:true,count:0,products:[],error:'Không đồng bộ được dữ liệu nguồn'});
  }
}
