function slugify(s=''){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function cleanBaseName(name=''){
 let s=String(name||'').trim();
 for(let i=0;i<2;i++){
  s=s.replace(/\s*-\s*\d+\s*\/\s*(?:\d+|1T|2T)\s*$/i,'');
  s=s.replace(/\s*-\s*(Đen|Trắng|Xanh Dương|Xanh Lá|Xanh|Đỏ|Hồng|Tím|Bạc|Titan|Xám|Cam|Vàng|Nâu|Be|Green|Blue|Black|White|Silver|Gray|Grey|Gold|Purple|Pink|Red)\s*$/i,'');
 }
 return s.trim();
}
export default async function handler(req,res){
 try{
  const raw=String(req.query.path||'').toLowerCase();
  const proto=req.headers['x-forwarded-proto']||'https'; const host=req.headers.host;
  const r=await fetch(`${proto}://${host}/api/products`); const data=await r.json();
  const candidates=[];
  for(const p of (data.products||[])){
   for(const n of [p?.name,...((p?.variants||[]).map(v=>v?.name))].filter(Boolean)){
    const model=cleanBaseName(n), slug=slugify(model); if(slug) candidates.push({model,slug});
   }
  }
  candidates.sort((a,b)=>b.slug.length-a.slug.length);
  const hit=candidates.find(x=>raw.includes(x.slug));
  if(hit) return res.redirect(301,`/san-pham/${hit.slug}`);
  return res.redirect(301,'/');
 }catch(e){return res.redirect(301,'/')}
}
