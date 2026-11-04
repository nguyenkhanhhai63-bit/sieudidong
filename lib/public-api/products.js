import { redisGet, redisSet } from "../redis.js";

const TOKEN_URL = "https://id.kiotviet.vn/connect/token";
const API_BASE = "https://public.kiotapi.com";


let responseCache = {
  products: null,
  savedAt: 0
};

let tokenCache = {
  token: null,
  expiresAt: 0
};

async function getToken() {
  const now = Date.now();

  if (tokenCache.token && now < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    scopes: "PublicApi.Access",
    grant_type: "client_credentials",
    client_id: process.env.KIOTVIET_CLIENT_ID,
    client_secret: process.env.KIOTVIET_CLIENT_SECRET
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KiotViet token error ${res.status}: ${text}`);
  }

  const data = await res.json();

  tokenCache = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in || 3600) * 1000)
  };

  return tokenCache.token;
}

async function kvFetch(path) {
  const token = await getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Retailer": process.env.KIOTVIET_RETAILER
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KiotViet API error ${res.status}: ${text}`);
  }

  return res.json();
}

function firstImage(obj) {
  if (!obj) return "";

  // KiotViet Public API documents "images" as an array of image links.
  if (Array.isArray(obj.images) && obj.images.length) {
    const first = obj.images[0];

    if (typeof first === "string") return first;

    if (first && typeof first === "object") {
      return first.image || first.Image || first.url || first.Url || "";
    }
  }

  // Be tolerant of other casing/legacy payload shapes.
  if (Array.isArray(obj.Images) && obj.Images.length) {
    const first = obj.Images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      return first.image || first.Image || first.url || first.Url || "";
    }
  }

  return obj.image || obj.Image || "";
}


function allImages(obj) {
  if (!obj) return [];
  const raw = Array.isArray(obj.images) ? obj.images : (Array.isArray(obj.Images) ? obj.Images : []);
  const out=[];
  for (const x of raw) {
    const u = typeof x === "string" ? x : (x?.image || x?.Image || x?.url || x?.Url || "");
    if (u && !out.includes(u)) out.push(u);
  }
  const single=obj.image || obj.Image || "";
  if(single && !out.includes(single)) out.unshift(single);
  return out;
}

function normalizeAttributes(obj) {
  const attrs = Array.isArray(obj?.attributes) ? obj.attributes : [];

  return attrs.map(a => ({
    name: a.attributeName || a.name || a.Name || "",
    value: a.attributeValue || a.value || a.Value || ""
  })).filter(a => a.name || a.value);
}


function stockKeyById(id){ return id==null ? "" : `id:${String(id)}`; }
function stockKeyByCode(code){ return code ? `code:${String(code).trim().toLowerCase()}` : ""; }

function getMappedStock(stockMap, obj){
  if(!stockMap || !obj) return null;
  const byId=stockMap.get(stockKeyById(obj.id));
  if(Number.isFinite(byId)) return byId;
  const byCode=stockMap.get(stockKeyByCode(obj.code));
  if(Number.isFinite(byCode)) return byCode;
  return null;
}

// V970: Preserve KiotViet category metadata instead of blanking it.
function inferredCategory(name){
  const n=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/^(?:cu sac|sac |cap |op lung|op |kinh cuong luc|cuong luc|tai nghe|bao da|dan man|adapter|charger|cable|case|pin du phong|sac du phong|so lanh)/.test(n))return "Phụ kiện";
  if(/\b(?:ipad|tablet|galaxy tab|redmi pad|xiaomi pad|mi pad|oppo pad|oneplus pad|honor pad|matepad|legion tab)\b/.test(n))return "Máy tính bảng";
  if(/\biphone\s*(?:se|\d)/.test(n))return "Máy cũ";
  return "Điện thoại";
}
async function loadCategories(){
  const result=new Map();
  try{
    let offset=0;
    for(let page=0;page<30;page++){
      const payload=await kvFetch(`/categories?pageSize=100&currentItem=${offset}`);
      const rows=payload.data||payload.items||[];
      if(!Array.isArray(rows)||!rows.length)break;
      for(const row of rows){
        const id=row.categoryId??row.id;
        if(id!=null)result.set(String(id),{name:String(row.categoryName||row.name||"").trim(),parentId:row.parentId??row.parentCategoryId??null});
      }
      offset+=rows.length;
      const total=Number(payload.total??payload.totalCount);
      if((Number.isFinite(total)&&offset>=total)||rows.length<100)break;
    }
  }catch(error){console.warn("KiotViet categories unavailable; using product names:",error?.message);}
  return result;
}
function productCategories(item,categoryMap){
  const fallback=inferredCategory(item.fullName||item.name||"");
  const id=item.categoryId??item.category?.id;
  const entry=id==null?null:categoryMap.get(String(id));
  const name=String(item.categoryName||item.category?.categoryName||entry?.name||"").trim()||fallback;
  let root=entry, hops=0;
  while(root?.parentId!=null&&hops++<20){
    const parent=categoryMap.get(String(root.parentId));
    if(!parent||parent===root)break;
    root=parent;
  }
  return {categoryName:name,rootCategoryName:String(item.rootCategoryName||root?.name||name).trim()||fallback};
}

function normalizeProduct(item, stockMap, categoryMap) {
  const categories=productCategories(item,categoryMap);
  const inventories = Array.isArray(item.inventories) ? item.inventories : [];
  const branches = inventories.map(i => ({
    branchId: i.branchId,
    branchName: i.branchName,
    onHand: Number(i.onHand || 0)
  }));

  const inventoryOnHand = branches.reduce((sum, b) => sum + b.onHand, 0);
  const mappedParentStock = getMappedStock(stockMap, item);
  const totalOnHand = mappedParentStock == null ? inventoryOnHand : mappedParentStock;
  const parentImage = firstImage(item);

  const children = Array.isArray(item.children) ? item.children : [];

  const variants = children.length
    ? children.map(child => {
        const invs = Array.isArray(child.inventories) ? child.inventories : [];
        const inventoryOnHand = invs.reduce((s, i) => s + Number(i.onHand || 0), 0);
        const mappedChildStock = getMappedStock(stockMap, child);
        const onHand = mappedChildStock == null ? inventoryOnHand : mappedChildStock;

        return {
          id: child.id,
          code: child.code,
          name: child.fullName || child.name || child.code,
          price: Number(child.basePrice || item.basePrice || 0),
          onHand,
          image: firstImage(child) || parentImage,
          images: allImages(child).length ? allImages(child) : allImages(item),
          attributes: normalizeAttributes(child).length
            ? normalizeAttributes(child)
            : normalizeAttributes(item)
        };
      })
    : [{
        id: item.id,
        code: item.code,
        name: item.fullName || item.name || item.code,
        price: Number(item.basePrice || 0),
        onHand: totalOnHand,
        image: parentImage,
        images: allImages(item),
        attributes: normalizeAttributes(item)
      }];

  return {
    id: item.id,
    code: item.code,
    name: item.fullName || item.name || item.code,
    categoryId: item.categoryId,
    categoryName: categories.categoryName,
    rootCategoryName: categories.rootCategoryName,
    basePrice: Number(item.basePrice || 0),
    image: parentImage,
    images: allImages(item),
    attributes: normalizeAttributes(item),
    variants
  };
}

async function loadCurrentStocks(){
  // /productOnHands là API tồn kho chuyên dụng của KiotViet.
  // Dùng nguồn này làm chuẩn vì một số hàng cùng loại/biến thể không trả inventories đầy đủ trong /products.
  const stockMap=new Map();
  const pageSize=100;
  let currentItem=0;
  for(let page=0; page<50; page++){
    const data=await kvFetch(`/productOnHands?pageSize=${pageSize}&currentItem=${currentItem}`);
    const rows=data.data || data.items || [];
    if(!Array.isArray(rows) || !rows.length) break;
    for(const row of rows){
      // KiotViet /productOnHands trả tồn kho trong mảng `inventories`,
      // không phải row.onHand. Bản cũ đọc row.onHand nên mọi sản phẩm bị ghi đè thành 0.
      const invs=Array.isArray(row.inventories)
        ? row.inventories
        : (Array.isArray(row.Inventories) ? row.Inventories : []);
      const qty=invs.length
        ? invs.reduce((sum,inv)=>sum + Number(inv?.onHand ?? inv?.onhand ?? inv?.OnHand ?? 0),0)
        : Number(row.onHand ?? row.onhand ?? row.OnHand ?? 0);
      const id=row.id ?? row.productId ?? row.ProductId;
      const code=row.code ?? row.productCode ?? row.ProductCode;
      if(id!=null){
        const k=stockKeyById(id);
        stockMap.set(k,(stockMap.get(k)||0)+qty);
      }
      if(code){
        const k=stockKeyByCode(code);
        stockMap.set(k,(stockMap.get(k)||0)+qty);
      }
    }
    if(rows.length<pageSize) break;
    currentItem += pageSize;
  }
  return stockMap;
}

// V923: shared Redis snapshot, stale-while-revalidate; prevent simultaneous KiotViet scans.
const SNAPSHOT_KEY = "sdd:products:v970:snapshot";
const LOCK_KEY = "sdd:products:v970:refresh-lock";
const FRESH_MS = 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
let runningRefresh = null;
let lastSyncReport = null;
async function snapshotRead(){
  try { const raw=await redisGet(SNAPSHOT_KEY); const v=raw&&JSON.parse(raw); return Array.isArray(v?.products)&&v.products.length?v:null; }
  catch(e){ console.warn("Product snapshot read:",e?.message); return null; }
}
async function snapshotWrite(products){
  try { await redisSet(SNAPSHOT_KEY,JSON.stringify({products,savedAt:Date.now()})); }
  catch(e){ console.warn("Product snapshot write:",e?.message); }
}
// V967: Read every KiotViet page. The previous 20-page cap silently
// truncated catalogs larger than 2,000 products and cached that partial list.
async function fetchFreshProducts(){
  const pageSize=100, maxPages=500;
  let currentItem=0, expectedTotal=null, pages=0;
  const all=[];
  const seen=new Set();
  let completed=false;
  for(let page=0;page<maxPages;page++){
    const data=await kvFetch(`/products?pageSize=${pageSize}&currentItem=${currentItem}&includeInventory=true&includePricebook=true&isActive=true`);
    const items=data.data||data.items||[];
    pages++;
    if(!Array.isArray(items))throw new Error("KiotViet returned invalid product page");
    const total=Number(data.total ?? data.totalCount ?? data.Total);
    if(Number.isFinite(total)&&total>=0)expectedTotal=total;
    for(const item of items){
      const key=item.id!=null?`id:${item.id}`:(item.code?`code:${item.code}`:null);
      if(key && seen.has(key))continue;
      if(key)seen.add(key);
      all.push(item);
    }
    currentItem+=items.length;
    if(!items.length || (expectedTotal!==null && currentItem>=expectedTotal) || (expectedTotal===null && items.length<pageSize)){
      completed=true;
      break;
    }
  }
  if(!completed)throw new Error(`KiotViet product pagination exceeded ${maxPages} pages; refusing partial snapshot`);
  if(expectedTotal!==null && currentItem<expectedTotal){
    throw new Error(`KiotViet incomplete products: received ${currentItem}/${expectedTotal}; keeping previous snapshot`);
  }
  // Stock is supplementary. A transient stock endpoint failure must not discard
  // an otherwise complete product catalog or leave a stale Redis snapshot.
  let stockMap=new Map(), stockWarning=null;
  try{stockMap=await loadCurrentStocks();}
  catch(e){stockWarning=String(e?.message||e);console.warn("KiotViet stock sync skipped:",stockWarning);}
  const active=all.filter(p=>!p.isDeleted&&p.isActive!==false);
  const categoryMap=await loadCategories();
  lastSyncReport={fetched:all.length,active:active.length,expectedTotal,pages,stockEntries:stockMap.size,stockWarning,categories:categoryMap.size,at:Date.now()};
  console.info("KiotViet sync report:",JSON.stringify(lastSyncReport));
  return active.map(p=>normalizeProduct(p,stockMap,categoryMap));
}

async function refreshSnapshot(){
  if(runningRefresh)return runningRefresh;
  runningRefresh=(async()=>{
    // A short distributed lock prevents concurrent Vercel instances flooding KiotViet.
    let locked=false;
    try{
      const {redisCommand}=await import("../redis.js");
      const result=await redisCommand(["SET",LOCK_KEY,String(Date.now()),"NX","EX","90"]);
      if(result!=="OK")return null;
      locked=true;
    }catch(e){console.warn("Product refresh lock unavailable:",e?.message);}
    try{
      const products=await fetchFreshProducts();
      if(!products.length)throw new Error("KiotViet returned empty product list");
      responseCache={products,savedAt:Date.now()};
      await snapshotWrite(products);
      return products;
    }finally{
      if(locked){try{const {redisCommand}=await import("../redis.js");await redisCommand(["DEL",LOCK_KEY]);}catch(_){}}
    }
  })().finally(()=>{runningRefresh=null});
  return runningRefresh;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  if(!process.env.KIOTVIET_CLIENT_ID||!process.env.KIOTVIET_CLIENT_SECRET||!process.env.KIOTVIET_RETAILER){
    return res.status(500).json({error:"Missing KiotViet environment variables"});
  }
  const diagnostic=String(req.query?.diagnostic||"")==="1";
  const force=String(req.query?.refresh||"")==="1";
  const snapshot=await snapshotRead();
  const cached=snapshot||(responseCache.products?.length?responseCache:null);
  const age=cached?Date.now()-Number(cached.savedAt||0):Infinity;
  if(cached && age<MAX_STALE_MS && !force){
    if(age>FRESH_MS){
      const job=refreshSnapshot().catch(e=>console.error("Background KiotViet refresh:",e));
      // Vercel keeps the task alive after the response when waitUntil is available.
      try{const {waitUntil}=await import("@vercel/functions");waitUntil(job);}catch(_){/* best effort */}
    }
    return res.status(200).json(diagnostic?{count:cached.products.length,stale:age>FRESH_MS,snapshotAt:cached.savedAt,report:lastSyncReport}:{products:cached.products,count:cached.products.length,stale:age>FRESH_MS,snapshotAt:cached.savedAt});
  }
  try{
    const products=await refreshSnapshot();
    if(products?.length)return res.status(200).json(diagnostic?{count:products.length,stale:false,report:lastSyncReport}:{products,count:products.length,stale:false});
    // Another instance is refreshing; serve older data if available.
    if(cached?.products?.length && !force)return res.status(200).json(diagnostic?{count:cached.products.length,stale:true,report:lastSyncReport}:{products:cached.products,count:cached.products.length,stale:true});
    // First cold request, wait briefly for the other instance's snapshot.
    for(let i=0;i<8;i++){
      await new Promise(r=>setTimeout(r,500));
      const ready=await snapshotRead();
      if(ready && !force)return res.status(200).json(diagnostic?{count:ready.products.length,stale:true,report:lastSyncReport}:{products:ready.products,count:ready.products.length,stale:true});
    }
    return res.status(503).json({error:"Dữ liệu đang được cập nhật, vui lòng thử lại",code:"SYNC_IN_PROGRESS"});
  }catch(error){
    console.error("KiotViet refresh:",error);
    if(cached?.products?.length && !force)return res.status(200).json(diagnostic?{count:cached.products.length,stale:true,report:lastSyncReport}:{products:cached.products,count:cached.products.length,stale:true});
    return res.status(500).json({error:error.message||"Unknown error",code:"KIOTVIET_SYNC_FAILED"});
  }
}
