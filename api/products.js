
const TOKEN_URL = "https://id.kiotviet.vn/connect/token";
const API_BASE = "https://public.kiotapi.com";

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


async function getCategories() {
  const pageSize = 100;
  let currentItem = 0;
  const all = [];

  for (let page = 0; page < 20; page++) {
    const data = await kvFetch(
      `/categories?pageSize=${pageSize}&currentItem=${currentItem}&hierachicalData=false`
    );

    const items = Array.isArray(data.data) ? data.data : [];

    if (!items.length) break;

    all.push(...items);

    if (items.length < pageSize) break;

    currentItem += pageSize;
  }

  return all;
}

function buildCategoryMap(categories) {
  const map = new Map();

  categories.forEach(c => {
    map.set(Number(c.categoryId), {
      id: Number(c.categoryId),
      parentId: c.parentId == null ? null : Number(c.parentId),
      name: c.categoryName || "Khác"
    });
  });

  return map;
}

function categoryPath(categoryId, categoryMap) {
  const current = categoryMap.get(Number(categoryId));
  if (!current) return { name: "Khác", rootName: "Khác" };

  let root = current;
  const seen = new Set();

  while (root.parentId && categoryMap.has(root.parentId) && !seen.has(root.id)) {
    seen.add(root.id);
    root = categoryMap.get(root.parentId);
  }

  return {
    name: current.name || "Khác",
    rootName: root.name || current.name || "Khác"
  };
}


function normalizeAttributes(obj) {
  const attrs = Array.isArray(obj?.attributes) ? obj.attributes : [];

  return attrs.map(a => ({
    name: a.attributeName || a.name || a.Name || "",
    value: a.attributeValue || a.value || a.Value || ""
  })).filter(a => a.name || a.value);
}


function normalizeProduct(item, categoryMap) {
  const cat = categoryPath(item.categoryId, categoryMap);
  const inventories = Array.isArray(item.inventories) ? item.inventories : [];
  const branches = inventories.map(i => ({
    branchId: i.branchId,
    branchName: i.branchName,
    onHand: Number(i.onHand || 0)
  }));

  const totalOnHand = branches.reduce((sum, b) => sum + b.onHand, 0);
  const parentImage = firstImage(item);

  const children = Array.isArray(item.children) ? item.children : [];

  const variants = children.length
    ? children.map(child => {
        const invs = Array.isArray(child.inventories) ? child.inventories : [];
        const onHand = invs.reduce((s, i) => s + Number(i.onHand || 0), 0);

        return {
          id: child.id,
          code: child.code,
          name: child.fullName || child.name || child.code,
          price: Number(child.basePrice || item.basePrice || 0),
          onHand,
          image: firstImage(child) || parentImage,
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
        attributes: normalizeAttributes(item)
      }];

  return {
    id: item.id,
    code: item.code,
    name: item.fullName || item.name || item.code,
    categoryId: item.categoryId,
    categoryName: cat.name,
    rootCategoryName: cat.rootName,
    basePrice: Number(item.basePrice || 0),
    image: parentImage,
    attributes: normalizeAttributes(item),
    variants
  };
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

    const categories = await getCategories();
    const categoryMap = buildCategoryMap(categories);

    const products = all
      .filter(p => !p.isDeleted)
      .filter(p => p.isActive !== false)
      .map(p => normalizeProduct(p, categoryMap));

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    return res.status(200).json({
      products,
      count: products.length
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error.message || "Unknown error"
    });
  }
}
