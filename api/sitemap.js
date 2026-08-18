
const BASE="https://sieudidong.vn";

function slugify(text=""){
  return String(text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

export default async function handler(req,res){
  try{
    const proto=req.headers["x-forwarded-proto"]||"https";
    const host=req.headers.host;
    const r=await fetch(`${proto}://${host}/api/products`);
    const data=await r.json();
    const products=Array.isArray(data.products)?data.products:[];

    const names=[...new Set(products.map(p=>String(p.name||"").trim()).filter(Boolean))];
    const now=new Date().toISOString();

    const urls=[
      `<url><loc>${BASE}/</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
      ...names.map(name=>`<url><loc>${BASE}/san-pham/${slugify(name)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`)
    ];

    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
    res.setHeader("Content-Type","application/xml; charset=utf-8");
    res.setHeader("Cache-Control","s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
  }catch(err){
    return res.status(500).send("Sitemap unavailable");
  }
}
