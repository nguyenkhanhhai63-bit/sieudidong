
const memoryCache = new Map();


const SPEC_LINKS_KEY = "sdd:spec-links:v1";

import { redisGet, redisSet } from "../lib/redis.js";

async function getSpecLinks() {
  const raw = await redisGet(SPEC_LINKS_KEY);
  if (!raw) return {};

  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

async function saveSpecLinks(map) {
  await redisSet(SPEC_LINKS_KEY, JSON.stringify(map));
}

function removeVietnameseMarksSimple(str="") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizedModel(str="") {
  return removeVietnameseMarksSimple(str)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:rom\s*)?tieng\s*viet\b/g, " ")
    .replace(/\blike\s*new\b/g, " ")
    .replace(/\bchinh\s*hang\b/g, " ")
    .replace(/\bquoc\s*te\b/g, " ")
    .replace(/\bnoi\s*dia\b/g, " ")
    .replace(/\b(?:8|12|16|24)\s*\/\s*(?:128|256|512|1024)\b/g, " ")
    .replace(/\b(?:128|256|512)\s*gb\b/g, " ")
    .replace(/\b(?:1|2)\s*tb\b/g, " ")
    .replace(/\b(?:den|trang|bac|xam|xanh(?: duong| la| bien| ngoc| mint)?|do|hong|tim|titan(?: xam| den| trang)?|cam|vang)\b/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveManualLink(productName, links) {
  const target = normalizedModel(productName);

  let best = null;
  let bestScore = -1;

  for (const [model, value] of Object.entries(links || {})) {
    const url = typeof value === "string" ? value : value?.url;
    if (!url) continue;

    const key = normalizedModel(model);
    if (!key) continue;

    let score = -1;

    if (target === key) {
      score = 10000 + key.length;
    } else if (target.startsWith(key + " ") || target.includes(" " + key + " ")) {
      score = 5000 + key.length;
    } else if (key.startsWith(target + " ")) {
      score = 1000 + target.length;
    }

    if (score > bestScore) {
      bestScore = score;
      best = { model, url };
    }
  }

  return best;
}

async function fetchTextManual(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SieuDiDongCatalog/1.0; +https://sieudidong.vn)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) {
    throw new Error(`Nguồn thông số HTTP ${r.status}`);
  }

  return r.text();
}

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

  const exactOrStarts = [
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

  return exactOrStarts.some(x => n === x || n.startsWith(x + " "));
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

  if (n === "man hinh" || n.startsWith("man hinh ")) return "Màn hình";
  if (n === "he dieu hanh" || n.startsWith("he dieu hanh ")) return "Hệ điều hành";
  if (n === "camera sau" || n.startsWith("camera sau ")) return "Camera sau";
  if (n === "camera truoc" || n.startsWith("camera truoc ")) return "Camera trước";

  if (
    n === "cpu" || n.startsWith("cpu ") ||
    n === "chip" || n.startsWith("chip ") ||
    n === "chipset" || n.startsWith("chipset ")
  ) return "CPU";

  if (n === "ram" || n.startsWith("ram ")) return "RAM";

  if (
    n === "bo nho trong" || n.startsWith("bo nho trong ") ||
    n === "rom" || n.startsWith("rom ")
  ) return "Bộ nhớ trong";

  if (
    n === "the sim" || n.startsWith("the sim ") ||
    n === "sim" || n.startsWith("sim ")
  ) return "Thẻ SIM";

  if (
    n === "dung luong pin" || n.startsWith("dung luong pin ") ||
    n === "pin" || n.startsWith("pin ")
  ) return "Dung lượng pin";

  if (n === "thiet ke" || n.startsWith("thiet ke ")) return "Thiết kế";

  return "";
}

function cleanSpecValue(value="") {
  return String(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

    const value = cleanSpecValue(row.value);
    if (!value) continue;

    const old = map.get(label);

    // Giữ bản có nội dung chi tiết hơn để giống bảng thông số nguồn.
    if (!old || value.length > old.value.length) {
      map.set(label, { label, value });
    }
  }

  // Chỉ trả về đúng 10 nhóm trên, theo đúng thứ tự.
  return order
    .filter(label => map.has(label))
    .map(label => map.get(label));
}

function extractTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripTags(title[1]) : "";
}


export default async function handler(req, res) {
  const name = String(req.query?.name || "").trim();
  const refresh = String(req.query?.refresh || "") === "1";

  if (!name) {
    return res.status(400).json({ error: "Missing product name" });
  }

  const cacheKey = normalizedModel(name);
  const cached = memoryCache.get(cacheKey);

  if (!refresh && cached && Date.now() < cached.expiresAt) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    return res.status(200).json({
      productName: name,
      specs: cached.data.specs,
      fetchedAt: cached.data.fetchedAt,
      cached: true
    });
  }

  try {
    const links = await getSpecLinks();
    const source = resolveManualLink(name, links);

    if (!source) {
      return res.status(404).json({
        error: "Chưa gắn link thông số cho model này",
        productName: name
      });
    }

    const sourceHtml = await fetchTextManual(source.url);
    const specs = coreSpecsOnly(extractSpecs(sourceHtml));

    if (!specs.length) {
      return res.status(404).json({
        error: "Link đã gắn nhưng chưa đọc được thông số kỹ thuật",
        productName: name
      });
    }

    const data = {
      productName: name,
      specs,
      fetchedAt: new Date().toISOString()
    };

    memoryCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );

    // Không trả sourceUrl ra phía khách.
    return res.status(200).json(data);

  } catch (error) {
    console.error("Specs manual source:", error);

    if (cached?.data) {
      return res.status(200).json({
        productName: name,
        specs: cached.data.specs,
        fetchedAt: cached.data.fetchedAt,
        cached: true,
        stale: true
      });
    }

    return res.status(503).json({
      error: "Không thể tải thông số lúc này"
    });
  }
}
