
const TOKEN_URL = "https://id.kiotviet.vn/connect/token";
const API_BASE = "https://public.kiotapi.com";

let tokenCache = {
  token: null,
  expiresAt: 0
};

// Cache trong memory của instance Vercel.
// CDN cache + localStorage phía trình duyệt sẽ bổ sung khi instance bị cold start.
let rankingCache = {
  data: null,
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
    throw new Error(`Token error ${res.status}: ${text}`);
  }

  const data = await res.json();

  tokenCache = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600) * 1000
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
    throw new Error(`KiotViet API ${res.status}: ${text}`);
  }

  return res.json();
}

function isCancelledInvoice(invoice) {
  const statusText = String(invoice?.statusValue || "").toLowerCase();
  return (
    statusText.includes("hủy") ||
    statusText.includes("huỷ") ||
    statusText.includes("cancel") ||
    statusText.includes("void")
  );
}

function invoiceDetails(invoice) {
  if (Array.isArray(invoice?.invoiceDetails)) {
    return invoice.invoiceDetails;
  }

  // Phòng trường hợp API trả object đơn.
  if (invoice?.invoiceDetails && typeof invoice.invoiceDetails === "object") {
    return [invoice.invoiceDetails];
  }

  return [];
}

async function buildRanking(days = 30) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const pageSize = 100;
  let currentItem = 0;
  const scores = new Map();

  // Đọc toàn bộ hóa đơn trong 30 ngày qua theo từng trang.
  // Giới hạn an toàn 100 trang = 10.000 hóa đơn / lần refresh cache.
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      currentItem: String(currentItem),
      fromPurchaseDate: from.toISOString(),
      toPurchaseDate: now.toISOString(),
      orderBy: "purchaseDate",
      orderDirection: "Desc"
    });

    const data = await kvFetch(`/invoices?${params.toString()}`);
    const invoices = Array.isArray(data?.data) ? data.data : [];

    if (!invoices.length) break;

    for (const invoice of invoices) {
      if (isCancelledInvoice(invoice)) continue;

      for (const detail of invoiceDetails(invoice)) {
        const productId = Number(detail?.productId || 0);
        const quantity = Number(detail?.quantity || 0);
        const productName = String(detail?.productName || "").trim();

        if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;

        const old = scores.get(productId) || {
          productId,
          productName,
          quantity: 0
        };

        old.quantity += quantity;

        if (!old.productName && productName) {
          old.productName = productName;
        }

        scores.set(productId, old);
      }
    }

    if (invoices.length < pageSize) break;
    currentItem += pageSize;
  }

  const ranking = [...scores.values()]
    .sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return a.productName.localeCompare(b.productName, "vi");
    });

  return {
    generatedAt: new Date().toISOString(),
    from: from.toISOString(),
    to: now.toISOString(),
    days,
    ranking
  };
}

export default async function handler(req, res) {
  if (
    !process.env.KIOTVIET_CLIENT_ID ||
    !process.env.KIOTVIET_CLIENT_SECRET ||
    !process.env.KIOTVIET_RETAILER
  ) {
    return res.status(500).json({
      error: "Missing environment variables"
    });
  }

  const now = Date.now();

  // Cache memory 60 phút.
  if (rankingCache.data && now < rankingCache.expiresAt) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );

    return res.status(200).json({
      ...rankingCache.data,
      cached: true
    });
  }

  try {
    const data = await buildRanking(30);

    rankingCache = {
      data,
      expiresAt: now + 60 * 60 * 1000
    };

    // Vercel CDN giữ 1 giờ, và có thể dùng stale thêm 24 giờ.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );

    return res.status(200).json({
      ...data,
      cached: false
    });
  } catch (error) {
    console.error("Best sellers error:", error);

    // Instance hiện tại đã từng có dữ liệu thì trả dữ liệu cũ.
    if (rankingCache.data) {
      res.setHeader("Cache-Control", "no-store");

      return res.status(200).json({
        ...rankingCache.data,
        cached: true,
        stale: true
      });
    }

    return res.status(503).json({
      error: "Best seller ranking temporarily unavailable"
    });
  }
}
