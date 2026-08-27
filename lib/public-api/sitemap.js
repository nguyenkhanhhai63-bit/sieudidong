
const BASE="https://sieudidong.vn";

function slugify(text=""){
  return String(text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

function cleanBaseName(name=""){
  let s=String(name||"").trim();

  // Bỏ hậu tố dung lượng dạng 12/256, 16/512, 8/128...
  s=s.replace(/\s*-\s*\d+\s*\/\s*(?:\d+|1T|2T)\s*$/i,"");

  // Bỏ màu ở cuối tên.
  s=s.replace(/\s*-\s*(Đen|Trắng|Xanh Dương|Xanh Lá|Xanh|Đỏ|Hồng|Tím|Bạc|Titan|Xám|Cam|Vàng|Nâu|Be|Green|Blue|Black|White|Silver|Gray|Grey|Gold|Purple|Pink|Red)\s*$/i,"");

  // Có trường hợp tên dạng "... - Đen - 12/256", chạy thêm vòng nữa.
  s=s.replace(/\s*-\s*\d+\s*\/\s*(?:\d+|1T|2T)\s*$/i,"");
  s=s.replace(/\s*-\s*(Đen|Trắng|Xanh Dương|Xanh Lá|Xanh|Đỏ|Hồng|Tím|Bạc|Titan|Xám|Cam|Vàng|Nâu|Be|Green|Blue|Black|White|Silver|Gray|Grey|Gold|Purple|Pink|Red)\s*$/i,"");

  return s.trim();
}

function escapeXml(value=""){
  return String(value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&apos;");
}

export default async function handler(req,res){
  try{
    const proto=req.headers["x-forwarded-proto"]||"https";
    const host=req.headers.host;

    const r=await fetch(`${proto}://${host}/api/products`);
    const data=await r.json();
    const products=Array.isArray(data.products)?data.products:[];

    // Gom các biến thể màu/dung lượng về một model.
    const modelMap=new Map();

    for(const product of products){
      const names=[
        product?.name,
        ...((product?.variants||[]).map(v=>v?.name))
      ].filter(Boolean);

      for(const rawName of names){
        const model=cleanBaseName(rawName);
        if(!model) continue;

        const key=slugify(model);
        if(!key) continue;

        if(!modelMap.has(key)){
          modelMap.set(key,{
            name:model,
            slug:key
          });
        }
      }
    }

    const models=[...modelMap.values()]
      .sort((a,b)=>a.name.localeCompare(b.name,"vi"));

    const now=new Date().toISOString();

    const urls=[
      `<url><loc>${BASE}/</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
      ...["thong-tin-phap-ly","chinh-sach-bao-mat","chinh-sach-thanh-toan","chinh-sach-doi-tra","chinh-sach-van-chuyen"].map(slug=>`<url><loc>${BASE}/${slug}/</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`),
      ...models.map(item=>(
        `<url><loc>${escapeXml(`${BASE}/san-pham/${item.slug}`)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`
      ))
    ];

    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

    res.setHeader("Content-Type","application/xml; charset=utf-8");
    res.setHeader("Cache-Control","s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);

  }catch(err){
    console.error("Sitemap:",err);
    return res.status(500).send("Sitemap unavailable");
  }
}
