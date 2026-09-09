
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

export default async function handler(req, res) {
  try {
    if (!process.env.KIOTVIET_CLIENT_ID ||
        !process.env.KIOTVIET_CLIENT_SECRET ||
        !process.env.KIOTVIET_RETAILER) {
      return res.status(500).json({
        error: "Missing KiotViet environment variables"
      });
    }

    // KiotViet product API supports paging. We collect multiple pages.
    const pageSize = 100;
    let currentItem = 0;
    let all = [];

    for (let page = 0; page < 20; page++) {
      const data = await kvFetch(
        `/products?pageSize=${pageSize}&currentItem=${currentItem}&includeInventory=true&includePricebook=true&isActive=true`
      );

      const items = data.data || data.items || [];

      if (!Array.isArray(items) || items.length === 0) break;

      all.push(...items);

      if (items.length < pageSize) break;

      currentItem += pageSize;
    }

    const stockMap = await loadCurrentStocks();

    const products = all
      .filter(p => !p.isDeleted)
      .filter(p => p.isActive !== false)
      .map(p => normalizeProduct(p, stockMap));

    // Tồn kho cần bám sát KiotViet, tránh CDN giữ trạng thái Hết/Còn cũ.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    responseCache = {
      products,
      savedAt: Date.now()
    };

    return res.status(200).json({
      products,
      count: products.length
    });

  } catch (error) {
    console.error(error);

    if (Array.isArray(responseCache.products) && responseCache.products.length) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        products: responseCache.products,
        count: responseCache.products.length,
        stale: true
      });
    }

    return res.status(500).json({
      error: error.message || "Unknown error"
    });
  }
}
