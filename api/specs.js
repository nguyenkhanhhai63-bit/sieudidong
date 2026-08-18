
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


function slugify(text="") {
  return removeVietnameseMarks(String(text))
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(chinh hang|like new|full|leica)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function modelCore(text="") {
  let s = String(text).trim();

  // Strip specs inside parentheses from KiotViet title.
  s = s.replace(/\([^)]*\)/g, " ");

  // Remove common variant suffixes.
  s = s.replace(/\s*-\s*(đen|trắng|xanh(?: dương| lá| biển| ngọc| mint)?|đỏ|hồng|tím|bạc|titan(?: xám| đen| trắng)?|cam|vàng)\s*$/i,"");
  s = s.replace(/\s*-\s*\d+\s*\/\s*(?:\d+|1t|2t)\s*$/i,"");

  return s.replace(/\s+/g," ").trim();
}

function directSlugCandidates(productName) {
  const core = modelCore(productName);
  const slug = slugify(core);
  const n = normalized(productName);
  const out = new Set();

  if (slug) {
    out.add(`${MC_BASE}/dien-thoai/${slug}.html`);
  }

  // Common MobileCity SEO URL patterns.
  if (n.includes("honor win rt")) {
    out.add(`${MC_BASE}/dien-thoai/honor-win-rt-pin-10000mah.html`);
  }
  if (n.includes("honor win 5g") || /\bhonor win\b/.test(n)) {
    out.add(`${MC_BASE}/dien-thoai/honor-win-5g-pin-khung.html`);
  }
  if (n.includes("honor win turbo")) {
    out.add(`${MC_BASE}/dien-thoai/honor-win-turbo.html`);
  }

  return [...out];
}

function candidateTextFromHref(href="") {
  try {
    const u = new URL(href, MC_BASE);
    return decodeURIComponent(
      u.pathname
        .split("/")
        .pop()
        .replace(/\.html.*$/i,"")
        .replace(/[-_]+/g," ")
    );
  } catch (_) {
    return href;
  }
}


const MODEL_QUALIFIERS = [
  "pro max","pro+","pro plus","pro","ultra","max","mini","plus",
  "turbo","rt","se","fe","lite","air","fold","flip","neo","note"
];

function words(text="") {
  return normalized(text).split(" ").filter(Boolean);
}

function extractModelIdentity(text="") {
  const n = normalized(modelCore(text));
  const tokens = words(n);

  const brand = detectBrand(n);

  // Keep alpha-numeric model tokens such as z11, 15t, x300, ace6, k90...
  const modelTokens = tokens.filter(t =>
    /[a-z]/.test(t) && /\d/.test(t)
  );

  const qualifiers = MODEL_QUALIFIERS.filter(q => {
    const qTokens = q.split(" ");
    return qTokens.every(x => tokens.includes(x));
  });

  // For series without digits, preserve distinctive words after brand.
  const distinctive = tokens.filter(t =>
    ![
      brand,"dien","thoai","5g","4g","chinh","hang",
      "snapdragon","dimensity","pin","mah","gb","tb"
    ].includes(t)
  );

  return {
    brand,
    modelTokens:[...new Set(modelTokens)],
    qualifiers:[...new Set(qualifiers)],
    distinctive:[...new Set(distinctive)]
  };
}

function identityMatches(targetName, candidateName) {
  const a = extractModelIdentity(targetName);
  const b = extractModelIdentity(candidateName);

  if (a.brand && b.brand && a.brand !== b.brand) return false;

  // All target model tokens must exist in candidate.
  for (const token of a.modelTokens) {
    if (!b.modelTokens.includes(token)) return false;
  }

  // Critical qualifiers must match exactly both ways.
  const critical = ["pro max","pro+","pro plus","pro","ultra","max","mini","plus","turbo","rt","se","fe","lite","air","fold","flip"];
  for (const q of critical) {
    const aHas = a.qualifiers.includes(q);
    const bHas = b.qualifiers.includes(q);
    if (aHas !== bHas) return false;
  }

  // Require at least 2 distinctive common words when no alpha-numeric model token exists.
  if (!a.modelTokens.length) {
    const common = a.distinctive.filter(x => b.distinctive.includes(x));
    if (common.length < Math.min(2, a.distinctive.length)) return false;
  }

  return true;
}

async function pageLooksLikeProduct(url, productName) {
  try {
    const html = await fetchText(url);
    const title = extractTitle(html) || candidateTextFromHref(url);

    if (!identityMatches(productName, title)) {
      return null;
    }

    const score = similarity(productName, title);

    const text = stripTags(html).slice(0, 150000);
    const specHint = /th[oô]ng s[oố] k[yỹ] thu[aậ]t|camera sau|dung l[uư][oợ]ng pin|chipset|b[oộ] nh[oớ] trong|cpu|ram/i.test(text);

    if (score >= 0.32 && specHint) {
      return { href:url, text:title, score, html };
    }
  } catch (_) {}

  return null;
}

async function findProductPage(productName) {
  // 1) Try deterministic URLs first. This fixes products whose category cards
  // use image-only links or different anchor markup.
  for (const url of directSlugCandidates(productName)) {
    const direct = await pageLooksLikeProduct(url, productName);
    if (direct) return direct;
  }

  // 2) Search MobileCity category pages.
  const brand = detectBrand(productName);
  const paths = CATEGORY_URLS[brand] || ["/"];
  const candidates = [];

  for (const path of paths) {
    try {
      const html = await fetchText(MC_BASE + path);

      // Capture any product URL even when anchor text is empty/image-only.
      const hrefRe = /href=["']([^"']*\/dien-thoai\/[^"']+\.html[^"']*)["']/gi;
      let hm;
      while ((hm = hrefRe.exec(html))) {
        let href = hm[1];
        if (href.startsWith("//")) href = "https:" + href;
        else if (href.startsWith("/")) href = MC_BASE + href;
        else if (!/^https?:\/\//i.test(href)) href = MC_BASE + "/" + href.replace(/^\/+/,"");

        candidates.push({
          href,
          text:candidateTextFromHref(href)
        });
      }

      // Keep the old richer anchor extraction too.
      candidates.push(...extractProductLinks(html));
    } catch (_) {}
  }

  // Deduplicate before scoring.
  const unique = new Map();
  for (const c of candidates) {
    const old = unique.get(c.href);
    if (!old || c.text.length > old.text.length) unique.set(c.href,c);
  }

  const ranked = [...unique.values()]
    .map(c => ({...c, score:similarity(productName,c.text)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,8);

  // Validate the best few pages instead of trusting anchor text alone.
  for (const c of ranked) {
    if (c.score < 0.25) continue;
    const validated = await pageLooksLikeProduct(c.href, productName);
    if (validated) return validated;
  }

  return null;
}

function wantedLabel(label="") {
  const n = normalized(label);

  const allowed = [
    "man hinh",
    "he dieu hanh",
    "camera sau",
    "camera truoc",
    "cpu",
    "chip",
    "chipset",
    "ram",
    "bo nho trong",
    "rom",
    "the sim",
    "sim",
    "dung luong pin",
    "pin",
    "thiet ke"
  ];

  return allowed.some(x => n === x || n.startsWith(x + " "));
}

function extractSpecs(html) {
  const rows = [];

  function add(label,value){
    label=stripTags(label).replace(/:\s*$/,"").trim();
    value=stripTags(value).trim();

    if(!label || !value) return;
    if(!wantedLabel(label)) return;
    if(label.length>90 || value.length>2200) return;

    rows.push({label,value});
  }

  // 1) Classic table rows.
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let td;

    while ((td = tdRe.exec(tr[1]))) {
      cells.push(td[1]);
    }

    if(cells.length >= 2){
      add(cells[0],cells.slice(1).join("<br>"));
    }
  }

  // 2) Definition lists.
  const dlRe=/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  let dl;
  while((dl=dlRe.exec(html))){
    add(dl[1],dl[2]);
  }

  // 3) Common div/li "label : value" blocks used by product sites.
  const blockText=stripTags(
    html
      .replace(/<\/(?:div|li|p|section|article)>/gi,"\n")
      .replace(/<br\s*\/?>/gi,"\n")
  );

  const lines=blockText.split("\n").map(x=>x.trim()).filter(Boolean);

  for(const line of lines){
    const m=line.match(/^([^:]{2,80}):\s*(.+)$/);
    if(m) add(m[1],m[2]);
  }

  // 4) Adjacent lines, e.g. "CPU" then next line contains the value.
  for(let i=0;i<lines.length-1;i++){
    if(wantedLabel(lines[i]) && !wantedLabel(lines[i+1])){
      add(lines[i],lines[i+1]);
    }
  }

  // Deduplicate by normalized label, prefer richer value.
  const map = new Map();
  for (const row of rows) {
    const key = normalized(row.label);
    const old = map.get(key);
    if (!old || row.value.length > old.value.length) map.set(key,row);
  }

  return [...map.values()];
}

function canonicalSpecLabel(label="") {
  const n = normalized(label);

  if (n.startsWith("man hinh")) return "Màn hình";
  if (n.startsWith("he dieu hanh")) return "Hệ điều hành";
  if (n.startsWith("camera sau")) return "Camera sau";
  if (n.startsWith("camera truoc")) return "Camera trước";
  if (n === "cpu" || n.startsWith("cpu ") || n === "chip" || n.startsWith("chip ") || n.startsWith("chipset")) return "CPU";
  if (n === "ram" || n.startsWith("ram ")) return "RAM";
  if (n.startsWith("bo nho trong") || n === "rom" || n.startsWith("rom ")) return "Bộ nhớ trong";
  if (n.startsWith("the sim") || n === "sim" || n.startsWith("sim ")) return "Thẻ SIM";
  if (n.startsWith("dung luong pin") || n === "pin" || n.startsWith("pin ")) return "Dung lượng pin";
  if (n.startsWith("thiet ke")) return "Thiết kế";
  return "";
}

function coreSpecsOnly(specs=[]) {
  const order = [
    "Màn hình",
    "Hệ điều hành",
    "Camera sau",
    "Camera trước",
    "CPU",
    "RAM",
    "Bộ nhớ trong",
    "Thẻ SIM",
    "Dung lượng pin",
    "Thiết kế"
  ];

  const map = new Map();

  for (const row of specs) {
    const label = canonicalSpecLabel(row.label);
    if (!label || !row.value) continue;

    const old = map.get(label);
    // Prefer the richer entry if synonyms are duplicated.
    if (!old || String(row.value).length > String(old.value).length) {
      map.set(label, {label, value:row.value});
    }
  }

  return order.filter(x => map.has(x)).map(x => map.get(x));
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

    const html = found.html || await fetchText(found.href);
    const specs = coreSpecsOnly(extractSpecs(html));

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
      parserVersion: "v38-core-specs",
      verifiedModel: true,
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
