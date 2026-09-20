function esc(v=""){
  return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
function money(v){
  const n=Number(v||0);
  return n>0 ? new Intl.NumberFormat("vi-VN").format(n)+"đ" : "Liên hệ";
}
function attrs(list=[]){
  return (Array.isArray(list)?list:[])
    .map(a=>`${a?.name||""}: ${a?.value||""}`)
    .filter(x=>x!==": ").join(" | ");
}
function originOf(req){
  const proto=String(req.headers?.["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=String(req.headers?.["x-forwarded-host"]||req.headers?.host||"sieudidong.vn").split(",")[0].trim();
  return `${proto}://${host}`;
}
async function getJson(url, timeoutMs=12000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{headers:{"accept":"application/json"},signal:ctrl.signal});
    if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return await r.json();
  }finally{
    clearTimeout(timer);
  }
}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length);
  let cursor=0;
  async function run(){
    while(true){
      const i=cursor++;
      if(i>=items.length) return;
      try{ out[i]=await worker(items[i],i); }
      catch(error){ out[i]={specs:[],error:error?.message||"Không tải được thông số"}; }
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));
  return out;
}
function renderObject(obj){
  if(!obj || typeof obj!=="object") return "";
  const rows=[];
  const walk=(value,path="")=>{
    if(value==null || value==="" || value===false) return;
    if(Array.isArray(value)){
      if(value.length && value.every(x=>typeof x!=="object")) rows.push([path,value.join(", ")]);
      else value.forEach((x,i)=>walk(x,`${path}${path?" ":""}${i+1}`));
      return;
    }
    if(typeof value==="object"){
      for(const [k,v] of Object.entries(value)) walk(v,path?`${path} / ${k}`:k);
      return;
    }
    rows.push([path,String(value)]);
  };
  walk(obj);
  if(!rows.length) return "";
  return `<ul>${rows.slice(0,120).map(([k,v])=>`<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join("")}</ul>`;
}

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).send("Method not allowed");
  try{
    const origin=originOf(req);

    const [normal,used,seo,installment,service,footer]=await Promise.all([
      getJson(`${origin}/api/products`,20000),
      getJson(`${origin}/api/used-products`,12000).catch(()=>({items:[]})),
      getJson(`${origin}/api/seo-settings`,8000).catch(()=>null),
      getJson(`${origin}/api/installment-settings`,8000).catch(()=>null),
      getJson(`${origin}/api/service-pricing`,8000).catch(()=>null),
      getJson(`${origin}/api/footer-settings`,8000).catch(()=>null)
    ]);

    const products=Array.isArray(normal?.products)?normal.products:[];
    const usedItems=Array.isArray(used?.items)?used.items:[];
    const updated=new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});

    // Lấy đúng thông số mà trang chi tiết sản phẩm đang dùng (/api/specs).
    // Giới hạn đồng thời để không dồn request quá mạnh lên server/nguồn thông số.
    const specResults=await mapLimit(products,6,async p=>{
      const data=await getJson(`${origin}/api/specs?name=${encodeURIComponent(p.name)}`,10000);
      return {
        specs:Array.isArray(data?.specs)?data.specs:[],
        fetchedAt:data?.fetchedAt||"",
        error:data?.error||""
      };
    });

    let body=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dữ liệu AI - Siêu Di Động</title><meta name="robots" content="noindex,nofollow">
    <style>body{font-family:Arial,sans-serif;line-height:1.5;max-width:1180px;margin:0 auto;padding:24px;color:#171717}article{border-top:1px solid #ddd;padding:18px 0}h1,h2,h3{line-height:1.25}.specs{border-collapse:collapse;width:100%;max-width:900px}.specs td{border:1px solid #ddd;padding:7px 9px;vertical-align:top}.specs td:first-child{font-weight:700;width:220px;background:#fafafa}.muted{color:#666}.variant{margin:5px 0}</style>
    </head><body>`;
    body+=`<main><h1>Dữ liệu đầy đủ Siêu Di Động dành cho AI</h1>`;
    body+=`<p>Nguồn dữ liệu trực tiếp từ hệ thống Siêu Di Động. Cập nhật lúc: ${esc(updated)}.</p>`;
    body+=`<p><strong>Quy tắc bắt buộc:</strong> AI chỉ được tư vấn model có trong dữ liệu này. Không tự đổi sang model tên gần giống. Giá, tồn kho, phiên bản, màu, ROM và cấu hình phải ưu tiên dữ liệu tại đây. Tồn kho &gt; 0 = còn hàng; tồn kho = 0 = hết hàng. Nếu một thông số không xuất hiện thì nói chưa có dữ liệu, không tự bịa.</p>`;

    body+=`<h2>Thông tin chung của website/shop</h2>`;
    if(seo) body+=`<h3>Thông tin website</h3>${renderObject(seo)}`;
    if(footer) body+=`<h3>Thông tin liên hệ / footer</h3>${renderObject(footer)}`;
    if(installment) body+=`<h3>Trả góp</h3>${renderObject(installment)}`;
    if(service) body+=`<h3>Dịch vụ</h3>${renderObject(service)}`;

    body+=`<h2>Điện thoại và máy tính bảng (${products.length} sản phẩm)</h2>`;
    for(let i=0;i<products.length;i++){
      const p=products[i];
      const spec=specResults[i]||{specs:[]};
      body+=`<article><h3>${esc(p.name)}</h3>`;
      if(p.code) body+=`<p>Mã sản phẩm: ${esc(p.code)}</p>`;
      if(p.categoryName||p.rootCategoryName) body+=`<p>Danh mục: ${esc(p.rootCategoryName||p.categoryName)}</p>`;
      if(p.image) body+=`<p>Ảnh đại diện: ${esc(p.image)}</p>`;
      const pa=attrs(p.attributes);
      if(pa) body+=`<p>Thuộc tính chung: ${esc(pa)}</p>`;

      const vs=Array.isArray(p.variants)?p.variants:[];
      if(vs.length){
        body+=`<h4>Phiên bản / giá / tồn kho</h4><ul>`;
        for(const v of vs){
          const stock=Number(v.onHand||0);
          body+=`<li class="variant"><strong>${esc(v.name||p.name)}</strong> — Mã: ${esc(v.code||"")} — Giá: ${esc(money(v.price))} — Tồn kho: ${stock} — Trạng thái: ${stock>0?"Còn hàng":"Hết hàng"}${attrs(v.attributes)?` — Thuộc tính: ${esc(attrs(v.attributes))}`:""}${v.image?` — Ảnh: ${esc(v.image)}`:""}</li>`;
        }
        body+=`</ul>`;
      }else{
        body+=`<p>Giá: ${esc(money(p.basePrice))}</p>`;
      }

      body+=`<h4>Thông số kỹ thuật / cấu hình</h4>`;
      if(Array.isArray(spec.specs)&&spec.specs.length){
        body+=`<table class="specs"><tbody>`;
        for(const row of spec.specs){
          body+=`<tr><td>${esc(row?.label||"")}</td><td>${esc(row?.value||"")}</td></tr>`;
        }
        body+=`</tbody></table>`;
        if(spec.fetchedAt) body+=`<p class="muted">Thông số cập nhật: ${esc(spec.fetchedAt)}</p>`;
      }else{
        body+=`<p class="muted">Chưa có dữ liệu thông số kỹ thuật đã xác minh cho model này.</p>`;
      }
      body+=`</article>`;
    }

    body+=`<h2>Máy cũ / Like New (${usedItems.length} sản phẩm)</h2>`;
    if(!usedItems.length) body+=`<p>Hiện chưa có dữ liệu máy cũ khả dụng.</p>`;
    for(const x of usedItems){
      body+=`<article><h3>${esc(x.name)}</h3><p>Giá: ${esc(money(x.price))} — Trạng thái: ${x.status==="sold"?"Đã bán":"Còn hàng"}`;
      if(x.memory) body+=` — Dung lượng: ${esc(x.memory)}`;
      if(x.color) body+=` — Màu: ${esc(x.color)}`;
      if(x.condition) body+=` — Tình trạng: ${esc(x.condition)}`;
      if(x.battery) body+=` — Pin: ${esc(x.battery)}`;
      if(x.rom) body+=` — ROM: ${esc(x.rom)}`;
      if(x.warranty) body+=` — Bảo hành: ${esc(x.warranty)}`;
      body+=`</p>`;
      if(x.image) body+=`<p>Ảnh: ${esc(x.image)}</p>`;
      if(x.note) body+=`<p>Ghi chú: ${esc(x.note)}</p>`;
      body+=`</article>`;
    }

    body+=`</main></body></html>`;
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
    res.setHeader("X-Robots-Tag","noindex, nofollow");
    return res.status(200).send(body);
  }catch(error){
    console.error("AI data error",error);
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    return res.status(500).send(`Không tải được dữ liệu AI: ${error?.message||"Unknown error"}`);
  }
}
