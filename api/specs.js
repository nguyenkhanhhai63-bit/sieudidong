
const MC_BASE = "https://mobilecity.vn";

const memoryCache = new Map();

const CATEGORY_URLS = {
  "honor": ["/dien-thoai-honor", "/"],
  "vivo": ["/dien-thoai-vivo", "/"],
  "iqoo": ["/dien-thoai-vivo", "/"],
  "oppo": ["/dien-thoai-oppo", "/"],
  "oneplus": ["/dien-thoai-oneplus", "/"],
  "xiaomi": ["/dien-thoai-xiaomi", "/"],
  "redmi": ["/dien-thoai-redmi", "/dien-thoai-xiaomi", "/"],
  "poco": ["/dien-thoai-poco", "/dien-thoai-xiaomi", "/"],
  "samsung": ["/dien-thoai-samsung-chinh-hang", "/"],
  "apple": ["/dien-thoai-iphone-chinh-hang", "/"],
  "iphone": ["/dien-thoai-iphone-chinh-hang", "/"],
  "nubia": ["/dien-thoai-nubia-red-magic", "/"],
  "redmagic": ["/dien-thoai-nubia-red-magic", "/"],
  "realme": ["/dien-thoai-realme", "/"],
  "asus": ["/dien-thoai-asus", "/"],
  "google": ["/dien-thoai-google", "/"],
  "motorola": ["/dien-thoai-lenovo-motorola", "/"]
};

const SPEC_LABELS = [
  "màn hình", "loại màn hình", "màu màn hình", "chuẩn màn hình",
  "độ phân giải", "màn hình rộng", "công nghệ cảm ứng",
  "hệ điều hành", "ngôn ngữ",
  "camera sau", "camera trước", "quay phim",
  "cpu", "chip", "chipset", "gpu",
  "ram", "bộ nhớ trong", "bộ nhớ", "thẻ nhớ",
  "thẻ sim", "sim",
  "dung lượng pin", "pin", "sạc", "sạc nhanh",
  "wifi", "bluetooth", "gps", "nfc", "kết nối",
  "kích thước", "trọng lượng", "thiết kế",
  "chống nước", "kháng nước", "bảo mật",
  "cảm biến", "loa", "âm thanh"
];

function decodeHtml(text="") {
  return String(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_,n)=>String.fromCharCode(Number(n)));
}

function stripTags(html="") {
  return decodeHtml(
    String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
  .replace(/[ \t]+/g, " ")
  .replace(/\s*\n\s*/g, "\n")
  .trim();
}

function removeVietnameseMarks(str="") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalized(str="") {
  return removeVietnameseMarks(str)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(chinh hang|like new|cu|new seal|full|leica)\b/g, " ")
    .replace(/\b(pin|man|camera|snapdragon|dimensity|exynos)\b[^-]*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coreTokens(str="") {
  const stop = new Set([
    "dien","thoai","5g","4g","pin","gb","tb","mah","snapdragon",
    "dimensity","gen","elite","ultra","pro","max","chinh","hang"
  ]);

  return normalized(str)
    .split(" ")
    .filter(t => t && !stop.has(t) && !/^\d+$/.test(t));
}

function detectBrand(name="") {
  const s = normalized(name);
  const brands = [
    "honor","iqoo","vivo","oneplus","oppo","xiaomi","redmi","poco",
    "samsung","iphone","apple","realme","nubia","redmagic","asus",
    "google","motorola"
  ];
  return brands.find(b => s.includes(b)) || "";
}

function similarity(target, candidate) {
  const a = coreTokens(target);
  const b = coreTokens(candidate);
  if (!a.length || !b.length) return 0;

  const A = new Set(a);
  const B = new Set(b);
  let common = 0;
  for (const t of A) if (B.has(t)) common++;

  const recall = common / A.size;
  const precision = common / B.size;
  const exactBonus =
    normalized(candidate).includes(normalized(target)) ||
    normalized(target).includes(normalized(candidate))
      ? 0.35 : 0;

  return recall * 0.65 + precision * 0.35 + exactBonus;
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SieuDiDongCatalog/1.0; +https://sieudidong.vn)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) throw new Error(`MobileCity HTTP ${r.status}`);
  return r.text();
}

function extractProductLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']*\/dien-thoai\/[^"']+\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = re.exec(html))) {
    let href = m[1];
    const text = stripTags(m[2]);

    if (!href || !text) continue;
    if (href.startsWith("//")) href = "https:" + href;
    else if (href.startsWith("/")) href = MC_BASE + href;
    else if (!/^https?:\/\//i.test(href)) href = MC_BASE + "/" + href.replace(/^\/+/,"");

    out.push({ href, text });
  }

  // Deduplicate URL, preserving the most descriptive anchor text.
  const map = new Map();
  for (const x of out) {
    const prev = map.get(x.href);
    if (!prev || x.text.length > prev.text.length) map.set(x.href, x);
  }
  return [...map.values()];
}

async function findProductPage(productName) {
  const brand = detectBrand(productName);
  const paths = CATEGORY_URLS[brand] || ["/"];

  const candidates = [];

  for (const path of paths) {
    try {
      const html = await fetchText(MC_BASE + path);
      candidates.push(...extractProductLinks(html));
    } catch (_) {}
  }

  let best = null;

  for (const c of candidates) {
    const score = similarity(productName, c.text);
    if (!best || score > best.score) best = { ...c, score };
  }

  // Conservative threshold to avoid copying specs from the wrong model.
  if (!best || best.score < 0.48) return null;
  return best;
}

function wantedLabel(label) {
  const n = normalized(label);
  return SPEC_LABELS.some(x => n.includes(normalized(x)));
}

function extractSpecs(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;

  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let td;

    while ((td = tdRe.exec(tr[1]))) {
      cells.push(stripTags(td[1]));
    }

    if (cells.length < 2) continue;

    const label = cells[0].replace(/:\s*$/,"").trim();
    const value = cells.slice(1).join("\n").trim();

    if (!label || !value || !wantedLabel(label)) continue;
    if (label.length > 80 || value.length > 1800) continue;

    rows.push({ label, value });
  }

  // Deduplicate labels, prefer the richer value.
  const map = new Map();
  for (const row of rows) {
    const key = normalized(row.label);
    const old = map.get(key);
    if (!old || row.value.length > old.value.length) map.set(key, row);
  }

  return [...map.values()];
}

function extractTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripTags(title[1]) : "";
}

export default async function handler(req, res) {
  const name = String(req.query?.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Missing product name" });
  }

  const key = normalized(name);
  const cached = memoryCache.get(key);

  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader("Cache-Control","public, s-maxage=604800, stale-while-revalidate=2592000");
    return res.status(200).json({ ...cached.data, cached: true });
  }

  try {
    const found = await findProductPage(name);

    if (!found) {
      return res.status(404).json({
        error: "Không tìm thấy trang thông số phù hợp",
        productName: name
      });
    }

    const html = await fetchText(found.href);
    const specs = extractSpecs(html);

    if (!specs.length) {
      return res.status(404).json({
        error: "Trang nguồn chưa có bảng thông số kỹ thuật",
        productName: name,
        sourceUrl: found.href
      });
    }

    const data = {
      productName: name,
      sourceName: extractTitle(html) || found.text,
      sourceUrl: found.href,
      matchScore: Math.round(found.score * 100) / 100,
      specs,
      fetchedAt: new Date().toISOString()
    };

    memoryCache.set(key, {
      data,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    res.setHeader("Cache-Control","public, s-maxage=604800, stale-while-revalidate=2592000");
    return res.status(200).json(data);
  } catch (error) {
    console.error("Specs error:", error);

    if (cached?.data) {
      return res.status(200).json({
        ...cached.data,
        cached: true,
        stale: true
      });
    }

    return res.status(503).json({
      error: "Không thể tải thông số lúc này"
    });
  }
}
