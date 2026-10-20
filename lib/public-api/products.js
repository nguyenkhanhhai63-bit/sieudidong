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

function normalizeProduct(item, stockMap) {
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
    categoryName: "",
    rootCategoryName: "",
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
const SNAPSHOT_KEY = "sdd:products:v923:snapshot";
const LOCK_KEY = "sdd:products:v923:refresh-lock";
const FRESH_MS = 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
let runningRefresh = null;
async function snapshotRead(){
  try { const raw=await redisGet(SNAPSHOT_KEY); const v=raw&&JSON.parse(raw); return Array.isArray(v?.products)&&v.products.length?v:null; }
  catch(e){ console.warn("Product snapshot read:",e?.message); return null; }
}
async function snapshotWrite(products){
  try { await redisSet(SNAPSHOT_KEY,JSON.stringify({products,savedAt:Date.now()})); }
  catch(e){ console.warn("Product snapshot write:",e?.message); }
}
async function fetchFreshProducts(){
  const pageSize=100; let currentItem=0; const all=[];
  for(let page=0;page<20;page++){
    const data=await kvFetch(`/products?pageSize=${pageSize}&currentItem=${currentItem}&includeInventory=true&includePricebook=true&isActive=true`);
    const items=data.data||data.items||[];
    if(!Array.isArray(items)||!items.length)break;
    all.push(...items);
    if(items.length<pageSize)break;
    currentItem+=pageSize;
  }
  const stockMap=await loadCurrentStocks();
  return all.filter(p=>!p.isDeleted&&p.isActive!==false).map(p=>normalizeProduct(p,stockMap));
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
  const snapshot=await snapshotRead();
  const cached=snapshot||(responseCache.products?.length?responseCache:null);
  const age=cached?Date.now()-Number(cached.savedAt||0):Infinity;
  if(cached && age<MAX_STALE_MS){
    if(age>FRESH_MS){
      const job=refreshSnapshot().catch(e=>console.error("Background KiotViet refresh:",e));
      // Vercel keeps the task alive after the response when waitUntil is available.
      try{const {waitUntil}=await import("@vercel/functions");waitUntil(job);}catch(_){/* best effort */}
    }
    return res.status(200).json({products:cached.products,count:cached.products.length,stale:age>FRESH_MS,snapshotAt:cached.savedAt});
  }
  try{
    const products=await refreshSnapshot();
    if(products?.length)return res.status(200).json({products,count:products.length,stale:false});
    // Another instance is refreshing; serve older data if available.
    if(cached?.products?.length)return res.status(200).json({products:cached.products,count:cached.products.length,stale:true});
    // First cold request, wait briefly for the other instance's snapshot.
    for(let i=0;i<8;i++){
      await new Promise(r=>setTimeout(r,500));
      const ready=await snapshotRead();
      if(ready)return res.status(200).json({products:ready.products,count:ready.products.length,stale:true});
    }
    return res.status(503).json({error:"Dữ liệu đang được cập nhật, vui lòng thử lại"});
  }catch(error){
    console.error("KiotViet refresh:",error);
    if(cached?.products?.length)return res.status(200).json({products:cached.products,count:cached.products.length,stale:true});
    return res.status(500).json({error:error.message||"Unknown error"});
  }
}
