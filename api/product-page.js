const BASE='https://sieudidong.vn';
function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function titleFromSlug(slug=''){return decodeURIComponent(slug).split('-').filter(Boolean).map(w=>w.toUpperCase()==='5g'?'5G':w.charAt(0).toUpperCase()+w.slice(1)).join(' ')}
export default async function handler(req,res){
  try{
    const slug=String(req.query.slug||'').replace(/^\/+|\/+$/g,'');
    if(!slug) return res.redirect(301,'/');
    const proto=req.headers['x-forwarded-proto']||'https'; const host=req.headers.host;
    const r=await fetch(`${proto}://${host}/`); let html=await r.text();
    const canonical=`${BASE}/san-pham/${encodeURI(slug)}`;
    const name=titleFromSlug(slug);
    html=html.replace(/<link rel="canonical"[^>]*>/i,`<link rel="canonical" href="${esc(canonical)}">`)
      .replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(name)} | Siêu Di Động</title>`)
      .replace(/<meta property="og:url"[^>]*>/i,`<meta property="og:url" content="${esc(canonical)}">`)
      .replace(/<meta property="og:title"[^>]*>/i,`<meta property="og:title" content="${esc(name)} | Siêu Di Động">`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(html);
  }catch(e){return res.status(500).send('Page unavailable')}
}
