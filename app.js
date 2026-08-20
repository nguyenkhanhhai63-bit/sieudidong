
/* V71 - Link Zalo tư vấn.
   Thay link bên dưới bằng link Zalo của shop/nhân viên, ví dụ:
   https://zalo.me/84901234567
*/
const SIEUDIDONG_ZALO_URL = "https://zalo.me/0353105423";

function initZaloConsultButton(){
  const btn = document.getElementById("zaloConsultBtn");
  if (!btn) return;
  btn.href = SIEUDIDONG_ZALO_URL;
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initZaloConsultButton);
} else {
  initZaloConsultButton();
}

const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const onlyStock = { checked: false, addEventListener: ()=>{} };
const updatedAt = document.getElementById("updatedAt");
const summary = document.getElementById("summary");
const categoryFilters = document.getElementById("categoryFilters");

const inlineProductDetail = document.getElementById("inlineProductDetail");


const ANALYTICS_VISITOR_KEY="sdd-analytics-visitor-v2";
function analyticsVisitorId(){
  try{
    const cookieName="sdd_vid";
    const cookieMatch=document.cookie.match(new RegExp("(?:^|; )"+cookieName+"=([^;]+)"));
    let id=localStorage.getItem(ANALYTICS_VISITOR_KEY) || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : "");
    if(!/^[A-Za-z0-9_-]{8,80}$/.test(id)){
      id="v_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,14);
    }
    localStorage.setItem(ANALYTICS_VISITOR_KEY,id);
    document.cookie=cookieName+"="+encodeURIComponent(id)+"; Max-Age=31536000; Path=/; SameSite=Lax; Secure";
    return id;
  }catch(_){
    return "v_"+Math.random().toString(36).slice(2,14);
  }
}
function analyticsDevice(){
  const ua=navigator.userAgent||"", w=window.innerWidth||0;
  if(/iPad|Tablet/i.test(ua)||(w>=720&&w<=1024&&/Android/i.test(ua))) return "tablet";
  if(/Android|iPhone|iPod|Mobile/i.test(ua)||w<720) return "mobile";
  return "desktop";
}

function normalizeDeviceModelName(value=""){
  return String(value||"")
    .replace(/[<>]/g,"")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,100);
}

function deviceInfoFromUa(){
  const ua=navigator.userAgent||"";
  let brand="";
  let model="";
  let os="";

  const android=ua.match(/Android\s+([^;)\s]+)/i);
  if(android) os="Android "+android[1];

  if(!os && /Windows NT/i.test(ua)) os="Windows";
  else if(!os && /Mac OS X\s+([\d_]+)/i.test(ua)){
    const mac=ua.match(/Mac OS X\s+([\d_]+)/i);
    os="macOS "+String(mac?.[1]||"").replace(/_/g,".");
  }else if(!os && /CrOS/i.test(ua)) os="ChromeOS";
  else if(!os && /Linux/i.test(ua) && !/Android/i.test(ua)) os="Linux";

  if(/iPhone/i.test(ua)){
    brand="Apple";
    model="iPhone (không xác định model)";
    const ios=ua.match(/OS\s+([\d_]+)/i);
    if(ios) os="iOS "+ios[1].replace(/_/g,".");
  }else if(/iPad/i.test(ua)){
    brand="Apple";
    model="iPad (không xác định model)";
    const ios=ua.match(/OS\s+([\d_]+)/i);
    if(ios) os="iPadOS "+ios[1].replace(/_/g,".");
  }else if(/Android/i.test(ua)){
    // Android UA thường có model nằm sau phiên bản Android và trước Build/.
    const m=ua.match(/Android[^;]*;\s*(?:[a-z]{2}-[A-Z]{2};\s*)?([^;)]+?)(?:\s+Build\/|;|\))/i);
    if(m) model=normalizeDeviceModelName(m[1]);

    const text=(model+" "+ua).toLowerCase();
    if(/samsung|sm-[a-z0-9]+/i.test(text)) brand="Samsung";
    else if(/redmi|xiaomi|mi\s|poco/i.test(text)) brand="Xiaomi/Redmi";
    else if(/oppo|cph/i.test(text)) brand="OPPO";
    else if(/vivo|v\d{4}/i.test(text)) brand="vivo";
    else if(/oneplus|kb\d|le\d/i.test(text)) brand="OnePlus";
    else if(/honor|bvl-|any-|rea-/i.test(text)) brand="HONOR";
    else if(/realme|rmx/i.test(text)) brand="realme";
    else if(/pixel/i.test(text)) brand="Google";
  }

  return {
    deviceBrand:normalizeDeviceModelName(brand),
    deviceModel:normalizeDeviceModelName(model),
    deviceOs:normalizeDeviceModelName(os)
  };
}

async function analyticsDeviceInfo(){
  const fallback=deviceInfoFromUa();

  try{
    const uaData=navigator.userAgentData;
    if(uaData?.getHighEntropyValues){
      const high=await uaData.getHighEntropyValues(["model","platformVersion"]);
      return {
        // navigator.userAgentData.brands là thương hiệu trình duyệt, không phải hãng điện thoại.
        deviceBrand:normalizeDeviceModelName(fallback.deviceBrand||""),
        deviceModel:normalizeDeviceModelName(high?.model||fallback.deviceModel||""),
        deviceOs:normalizeDeviceModelName(
          uaData.platform
            ? `${uaData.platform}${high?.platformVersion?" "+high.platformVersion:""}`
            : fallback.deviceOs
        )
      };
    }
  }catch(_){}

  return fallback;
}

function sendAnalytics(type,extra={}){
  try{
    fetch("/api/analytics",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type,visitorId:analyticsVisitorId(),device:analyticsDevice(),...extra}),
      keepalive:true
    }).catch(()=>{});
  }catch(_){}
}

// Page view được gửi sau khi lấy thông tin thiết bị để thống kê model chính xác hơn.
analyticsDeviceInfo()
  .then(info=>sendAnalytics("page_view",info))
  .catch(()=>sendAnalytics("page_view"));

let analyticsSearchTimer=null;
function trackSearchQuery(){
  clearTimeout(analyticsSearchTimer);
  analyticsSearchTimer=setTimeout(()=>{
    const query=String(searchInput?.value||"").trim();
    if(query.length>=2) sendAnalytics("search",{query});
  },900);
}




function setMeta(selector,attr,value){
  let el=document.querySelector(selector);
  if(!el){
    el=document.createElement("meta");
    if(selector.includes('property=')){
      const m=selector.match(/property="([^"]+)"/); if(m) el.setAttribute("property",m[1]);
    }else{
      const m=selector.match(/name="([^"]+)"/); if(m) el.setAttribute("name",m[1]);
    }
    document.head.appendChild(el);
  }
  el.setAttribute(attr,value);
}
function updateSeoForHome(){
  document.title="Siêu Di Động | Điện thoại & sản phẩm công nghệ";
  const canonical=document.querySelector('link[rel="canonical"]');
  if(canonical) canonical.href="https://sieudidong.vn/";
  setMeta('meta[name="description"]',"content","Siêu Di Động Quy Nhơn - điện thoại, máy tính bảng và sản phẩm công nghệ. Giá và tình trạng hàng được cập nhật thường xuyên.");
  setMeta('meta[property="og:title"]',"content",document.title);
  setMeta('meta[property="og:url"]',"content","https://sieudidong.vn/");
  const productLd=document.getElementById("seoProductJsonLd");
  if(productLd) productLd.textContent="";
}
function updateSeoForProduct(group,variant){
  const name=String(group?.name||variant?.baseName||"Sản phẩm");
  const price=Number(variant?.price||0);
  const image=String(variant?.image||variant?.images?.[0]||"");
  const url="https://sieudidong.vn"+productUrl(name);
  document.title=`${name} | Siêu Di Động`;
  const canonical=document.querySelector('link[rel="canonical"]');
  if(canonical) canonical.href=url;
  const desc=`${name} tại Siêu Di Động Quy Nhơn. Xem giá, màu sắc, dung lượng và tình trạng hàng cập nhật.`;
  setMeta('meta[name="description"]',"content",desc);
  setMeta('meta[property="og:title"]',"content",document.title);
  setMeta('meta[property="og:description"]',"content",desc);
  setMeta('meta[property="og:url"]',"content",url);
  if(image) setMeta('meta[property="og:image"]',"content",image);
  const ld={
    "@context":"https://schema.org",
    "@type":"Product",
    "name":name,
    "image":image ? [image] : undefined,
    "brand":{"@type":"Brand","name":String(variant?.brand||"")},
    "offers":{
      "@type":"Offer",
      "priceCurrency":"VND",
      "price":price || undefined,
      "availability":Number(variant?.onHand||0)>0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "url":url
    }
  };
  const el=document.getElementById("seoProductJsonLd");
  if(el) el.textContent=JSON.stringify(ld);
}


let PRODUCTS = [];
const PRODUCT_CACHE_KEY = "sieudidong-products-v24";
const PRODUCT_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

function saveProductCache(products){
  try{
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      products
    }));
  }catch(_){}
}

function loadProductCache(){
  try{
    const raw=localStorage.getItem(PRODUCT_CACHE_KEY);
    if(!raw) return false;

    const cached=JSON.parse(raw);
    if(!Array.isArray(cached.products) || !cached.products.length) return false;
    if(Date.now()-Number(cached.savedAt||0) > PRODUCT_CACHE_MAX_AGE) return false;

    PRODUCTS=cached.products;
    return true;
  }catch(_){
    return false;
  }
}
let ACTIVE_CATEGORY = "Tất cả";
let ACTIVE_PRICE_FILTER = "Tất cả giá";
let ACTIVE_SORT = "default";

let SEARCH_POPULAR_TERMS=[];
const SEARCH_POPULAR_CACHE_KEY="sdd-search-popularity-v1";
const SEARCH_POPULAR_CACHE_MAX_AGE=6*60*60*1000;

function normalizeSearchText(value=""){
  return String(value||"")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g," ")
    .trim()
    .replace(/\s+/g," ");
}

function saveSearchPopularityCache(items){
  try{
    localStorage.setItem(SEARCH_POPULAR_CACHE_KEY,JSON.stringify({
      savedAt:Date.now(),
      items:Array.isArray(items)?items:[]
    }));
  }catch(_){}
}

function loadSearchPopularityCache(){
  try{
    const raw=localStorage.getItem(SEARCH_POPULAR_CACHE_KEY);
    if(!raw) return false;
    const cached=JSON.parse(raw);
    if(!Array.isArray(cached.items)) return false;
    if(Date.now()-Number(cached.savedAt||0)>SEARCH_POPULAR_CACHE_MAX_AGE) return false;
    SEARCH_POPULAR_TERMS=cached.items
      .map(x=>({query:String(x.query||""),count:Number(x.count||0)}))
      .filter(x=>x.query&&x.count>0);
    return SEARCH_POPULAR_TERMS.length>0;
  }catch(_){
    return false;
  }
}

async function loadSearchPopularity(){
  try{
    const res=await fetch("/api/search-popular",{cache:"default"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data=await res.json();
    const items=Array.isArray(data.items)?data.items:[];
    SEARCH_POPULAR_TERMS=items
      .map(x=>({query:String(x.query||""),count:Number(x.count||0)}))
      .filter(x=>x.query&&x.count>0);
    saveSearchPopularityCache(SEARCH_POPULAR_TERMS);

    // Khi khách đang ở chế độ mặc định và chưa gõ từ khóa,
    // cập nhật lại thứ tự ngay sau khi lấy được dữ liệu tìm kiếm.
    if(ACTIVE_SORT==="default" && !String(searchInput?.value||"").trim()){
      render();
    }
  }catch(err){
    console.error("Search popularity:",err);
    if(!SEARCH_POPULAR_TERMS.length) loadSearchPopularityCache();
  }
}

function searchPopularityScore(group){
  if(!SEARCH_POPULAR_TERMS.length) return 0;

  const name=normalizeSearchText(group?.name||"");
  if(!name) return 0;

  let score=0;

  SEARCH_POPULAR_TERMS.forEach((item,index)=>{
    const q=normalizeSearchText(item.query);
    if(!q) return;

    const count=Math.max(0,Number(item.count||0));
    if(!count) return;

    // Query dài/cụ thể được ưu tiên hơn query quá ngắn như "red".
    const specificity=Math.min(2.2,1+q.length/18);
    const recencyRankWeight=Math.max(.55,1-index*.012);

    if(name===q){
      score+=count*3*specificity*recencyRankWeight;
    }else if(name.includes(q)){
      score+=count*specificity*recencyRankWeight;
    }
  });

  return score;
}

function slugParam(value=""){
  return String(value || "").trim();
}

function updateUrlFromState(){
  const url = new URL(location.href);
  const q = searchInput?.value?.trim() || "";

  // Giữ URL trang chi tiết riêng biệt, chỉ sync filter ở trang danh sách.
  if(location.pathname.startsWith("/san-pham/")) return;

  if(ACTIVE_MAIN_CATEGORY) url.searchParams.set("category", ACTIVE_MAIN_CATEGORY);
  else url.searchParams.delete("category");

  if(ACTIVE_CATEGORY && ACTIVE_CATEGORY !== "Tất cả")
    url.searchParams.set("brand", ACTIVE_CATEGORY);
  else
    url.searchParams.delete("brand");

  if(ACTIVE_PRICE_FILTER && ACTIVE_PRICE_FILTER !== "Tất cả giá")
    url.searchParams.set("price", ACTIVE_PRICE_FILTER);
  else
    url.searchParams.delete("price");

  if(ACTIVE_SORT && ACTIVE_SORT !== "default")
    url.searchParams.set("sort", ACTIVE_SORT);
  else
    url.searchParams.delete("sort");

  if(q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");

  history.replaceState(history.state, "", url.pathname + (url.search ? url.search : ""));
}

function loadStateFromUrl(){
  const params = new URLSearchParams(location.search);

  const category = params.get("category");
  const brand = params.get("brand");
  const price = params.get("price");
  const sort = params.get("sort");
  const q = params.get("q");

  if(category) ACTIVE_MAIN_CATEGORY = category;
  if(brand) ACTIVE_CATEGORY = brand;
  if(price && PRICE_FILTERS.some(x=>x.label===price)) ACTIVE_PRICE_FILTER = price;
  if(["default","price-asc","price-desc","name-asc"].includes(sort || "")) ACTIVE_SORT = sort;
  if(q && searchInput) searchInput.value = q;
}

function sortGroups(groups){
  const list = [...groups];

  if(ACTIVE_SORT === "price-asc"){
    return list.sort((a,b)=>{
      const pa=Number(getDefaultVariantForGroup(a)?.price || 0);
      const pb=Number(getDefaultVariantForGroup(b)?.price || 0);
      if(pa===0) return 1;
      if(pb===0) return -1;
      return pa-pb;
    });
  }

  if(ACTIVE_SORT === "price-desc"){
    return list.sort((a,b)=>{
      const pa=Number(getDefaultVariantForGroup(a)?.price || 0);
      const pb=Number(getDefaultVariantForGroup(b)?.price || 0);
      return pb-pa;
    });
  }

  if(ACTIVE_SORT === "name-asc"){
    return list.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"vi"));
  }

  // Mặc định: ưu tiên sản phẩm khớp các từ khóa khách tìm nhiều nhất.
  // Nếu hai máy cùng điểm thì giữ thứ tự dữ liệu gốc.
  if(ACTIVE_SORT === "default" && !String(searchInput?.value||"").trim()){
    return list
      .map((group,index)=>({group,index,score:searchPopularityScore(group)}))
      .sort((a,b)=>(b.score-a.score)||(a.index-b.index))
      .map(x=>x.group);
  }

  return list;
}


const PRICE_FILTERS = [
  { label:"Tất cả giá", min:0, max:Infinity },
  { label:"Dưới 5 triệu", min:0, max:5000000 },
  { label:"5 - 10 triệu", min:5000000, max:10000000 },
  { label:"10 - 15 triệu", min:10000000, max:15000000 },
  { label:"15 - 20 triệu", min:15000000, max:20000000 },
  { label:"Trên 20 triệu", min:20000000, max:Infinity }
];

function priceFilterConfig(){
  return PRICE_FILTERS.find(x=>x.label===ACTIVE_PRICE_FILTER) || PRICE_FILTERS[0];
}

function getDefaultVariantForGroup(group){
  const variants=[...(group?.items || [])];
  if(!variants.length) return null;

  return variants.sort((a,b)=>{
    const stockDiff=(b.onHand>0)-(a.onHand>0);
    if(stockDiff!==0) return stockDiff;
    return Number(a.price||0)-Number(b.price||0);
  })[0] || null;
}

function groupMatchesPrice(group){
  if(ACTIVE_PRICE_FILTER==="Tất cả giá") return true;

  const variant=getDefaultVariantForGroup(group);
  const price=Number(variant?.price || 0);
  if(price<=0) return false;

  const cfg=priceFilterConfig();

  if(cfg.max===Infinity) return price >= cfg.min;
  return price >= cfg.min && price < cfg.max;
}

function renderPriceFilters(){
  const host=document.getElementById("priceFilters");
  if(!host) return;

  host.innerHTML="";

  PRICE_FILTERS.forEach(item=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="price-filter-btn" + (item.label===ACTIVE_PRICE_FILTER ? " active" : "");
    btn.textContent=item.label;

    btn.addEventListener("click",()=>{
      ACTIVE_PRICE_FILTER=item.label;
      sendAnalytics("filter_click",{action:"Giá: "+item.label});
      renderPriceFilters();
      render();
      updateUrlFromState();
    });

    host.appendChild(btn);
  });
}


let BEST_SELLER_PRODUCT_IDS = [];
let BEST_SELLER_READY = false;

const BEST_SELLER_CACHE_KEY = "sieudidong-bestsellers-30d-v1";
const BEST_SELLER_CACHE_MAX_AGE = 48 * 60 * 60 * 1000;

function saveBestSellerCache(payload){
  try{
    localStorage.setItem(BEST_SELLER_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      ranking: payload.ranking || []
    }));
  }catch(_){}
}

function loadBestSellerCache(){
  try{
    const raw = localStorage.getItem(BEST_SELLER_CACHE_KEY);
    if(!raw) return false;

    const cached = JSON.parse(raw);
    if(!Array.isArray(cached.ranking) || !cached.ranking.length) return false;
    if(Date.now() - Number(cached.savedAt || 0) > BEST_SELLER_CACHE_MAX_AGE) return false;

    BEST_SELLER_PRODUCT_IDS = cached.ranking.map(x=>Number(x.productId)).filter(Boolean);
    BEST_SELLER_READY = BEST_SELLER_PRODUCT_IDS.length > 0;
    return BEST_SELLER_READY;
  }catch(_){
    return false;
  }
}

async function loadBestSellers(){
  try{
    const res = await fetch("/api/bestsellers", { cache: "default" });
    if(!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const ranking = Array.isArray(data.ranking) ? data.ranking : [];

    if(!ranking.length) throw new Error("Empty best seller ranking");

    BEST_SELLER_PRODUCT_IDS = ranking.map(x=>Number(x.productId)).filter(Boolean);
    BEST_SELLER_READY = BEST_SELLER_PRODUCT_IDS.length > 0;

    saveBestSellerCache(data);

    if(ACTIVE_CATEGORY === "Bán chạy"){
      renderCategoryFilters();
      render();
    }
  }catch(err){
    console.error("Best sellers:", err);

    // Dùng cache gần nhất. Nếu chưa từng có cache thì chuyển về Tất cả
    // để không làm trắng trang.
    if(!BEST_SELLER_READY && !loadBestSellerCache()){
      if(ACTIVE_CATEGORY === "Bán chạy"){
        ACTIVE_CATEGORY = "Tất cả";
        renderCategoryFilters();
        render();
      }
    }
  }
}


function money(v){
  return new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + " đ";
}

function cleanBaseName(name){
  let s = String(name || "").trim();

  s = s.replace(/\s*-\s*\d+\s*\/\s*(?:\d+|1T|2T)\s*$/i, "");
  s = s.replace(/\s*-\s*(Đen|Trắng|Xanh|Đỏ|Hồng|Tím|Bạc|Titan|Cam|Vàng|Green|Blue|Black|White|Silver)\s*$/i, "");

  return s.trim();
}


function attributeValue(attrs, keys){
  const list = Array.isArray(attrs) ? attrs : [];

  for(const a of list){
    const name = String(a.name || "").trim().toLowerCase();
    const value = String(a.value || "").trim();

    if(keys.some(k => name.includes(k)) && value){
      return value;
    }
  }

  return "";
}

function getMemory(attrs, name){
  const byAttr = attributeValue(attrs, [
    "dung lượng", "dung luong", "bộ nhớ", "bo nho",
    "ram/rom", "rom", "memory", "capacity"
  ]);

  if(byAttr) return byAttr;

  const m = String(name || "").match(/(\d+)\s*\/\s*(\d+|1T|2T)/i);
  return m ? `${m[1]}/${m[2]}` : "";
}

function getColor(attrs, name){
  const byAttr = attributeValue(attrs, [
    "màu", "mau", "color", "colour"
  ]);

  if(byAttr) return byAttr;

  const colors = [
    "Xanh Dương","Xanh Lá","Xanh Biển","Xanh Ngọc","Xanh Mint",
    "Đen Bạc","Đen Xám","Trắng Bạc","Titan Xám","Titan Đen","Titan Trắng",
    "Đen","Trắng","Xanh","Đỏ","Hồng","Tím","Bạc","Titan",
    "Cam","Vàng","Green","Blue","Black","White","Silver"
  ];

  const text = String(name || "");

  // Prefer longer compound names first.
  for(const c of colors.sort((a,b)=>b.length-a.length)){
    const re = new RegExp(`(?:^|\\s-\\s)${escapeRegExp(c)}(?:\\s-\\s|$)`,"i");
    if(re.test(text)) return c;
  }

  return "";
}
function extractMemory(name){
  const m = String(name || "").match(/(\d+)\s*\/\s*(\d+|1T|2T)/i);
  return m ? `${m[1]}/${m[2]}` : "";
}

function extractColor(name){
  const colors = ["Đen","Trắng","Xanh","Đỏ","Hồng","Tím","Bạc","Titan","Cam","Vàng","Green","Blue","Black","White","Silver"];
  const text = String(name || "");

  for(const c of colors){
    const re = new RegExp(`(?:^|\\s-\\s)${c}(?:\\s-\\s|$)`,"i");
    if(re.test(text)) return c;
  }

  return "";
}


function detectBrand(name){
  const text = String(name || "").toLowerCase();

  const brands = [
    ["Xiaomi", ["xiaomi", "redmi", "poco", "mi " ]],
    ["Apple", ["iphone", "ipad", "apple"]],
    ["Samsung", ["samsung", "galaxy"]],
    ["OPPO", ["oppo", "oneplus", "realme", "find x", "reno", "k13", "k15"]],
    ["vivo", ["vivo", "iqoo", "i qoo"]],
    ["HONOR", ["honor"]],
    ["Huawei", ["huawei"]],
    ["Nubia", ["nubia", "redmagic", "red magic"]],
    ["Motorola", ["motorola", "moto"]],
    ["Google", ["google pixel", "pixel"]],
    ["ASUS", ["asus", "rog phone"]],
    ["Sony", ["sony", "xperia"]],
    ["Nothing", ["nothing phone", "cmf phone"]]
  ];

  for(const [brand, keywords] of brands){
    if(keywords.some(k => text.includes(k))) return brand;
  }

  return "Khác";
}


function escapeRegExp(text){
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeProductBaseName(fullName, color, memory){
  let s = String(fullName || "").trim();

  // Remove exact memory suffix if present.
  if(memory){
    const m = escapeRegExp(memory);
    s = s.replace(new RegExp(`\\s*-\\s*${m}\\s*$`, "i"), "");
    s = s.replace(new RegExp(`\\s+${m}\\s*$`, "i"), "");
  }

  // Remove exact detected color suffix if present.
  // Supports "Xanh Dương", "Đen Bạc", "Titan Xám"... not only one-word colors.
  if(color){
    const c = escapeRegExp(color);
    s = s.replace(new RegExp(`\\s*-\\s*${c}\\s*$`, "i"), "");
    s = s.replace(new RegExp(`\\s+${c}\\s*$`, "i"), "");
  }

  // Some product names end with both attributes in either order.
  if(memory){
    const m = escapeRegExp(memory);
    s = s.replace(new RegExp(`\\s*-\\s*${m}\\s*$`, "i"), "");
  }
  if(color){
    const c = escapeRegExp(color);
    s = s.replace(new RegExp(`\\s*-\\s*${c}\\s*$`, "i"), "");
  }

  // Final cleanup.
  s = s.replace(/\s+-\s*$/g, "").replace(/\s{2,}/g, " ").trim();

  return s;
}



let ACTIVE_MAIN_CATEGORY = "";
let MAIN_CATEGORIES = [];

function normalizeCategoryName(text=""){
  return String(text || "").trim();
}

function categoryKey(text=""){
  return normalizeCategoryName(text).toLowerCase();
}

function buildMainCategories(){
  const flat = flattenProducts(PRODUCTS);

  const counts = new Map();

  flat.forEach(p=>{
    const root = normalizeCategoryName(p.rootCategoryName || p.categoryName || "");
    if(!root) return;

    const key = categoryKey(root);
    const old = counts.get(key) || {name:root,count:0};
    old.count += 1;
    counts.set(key,old);
  });

  MAIN_CATEGORIES = [...counts.values()]
    .sort((a,b)=>{
      if(b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name,"vi");
    });

  if(!ACTIVE_MAIN_CATEGORY && MAIN_CATEGORIES.length){
    const phone = MAIN_CATEGORIES.find(x=>/điện thoại|phone|smartphone/i.test(x.name));
    ACTIVE_MAIN_CATEGORY = phone ? phone.name : MAIN_CATEGORIES[0].name;
  }
}

function renderMainCategoryMenu(){
  const menu = document.getElementById("commerceCategoryDropdown");
  if(!menu) return;

  buildMainCategories();

  menu.innerHTML="";

  if(!MAIN_CATEGORIES.length){
    menu.innerHTML='<div class="category-menu-loading">Chưa có danh mục.</div>';
    return;
  }

  MAIN_CATEGORIES.forEach(cat=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.dataset.mainCategory=cat.name;

    const icon=document.createElement("span");
    icon.className="category-menu-icon";
    icon.textContent=/máy tính bảng|tablet|ipad/i.test(cat.name) ? "▭" : "▯";

    const text=document.createElement("span");

    const strong=document.createElement("strong");
    strong.textContent=cat.name;

    const small=document.createElement("small");
    small.textContent=`${cat.count} sản phẩm`;

    text.append(strong,small);
    btn.append(icon,text);

    btn.addEventListener("click",()=>{
      ACTIVE_MAIN_CATEGORY=cat.name;
      ACTIVE_CATEGORY="Tất cả";
      ACTIVE_PRICE_FILTER="Tất cả giá";

      const wrap=document.querySelector(".commerce-category-menu");
      const toggle=document.getElementById("commerceCategoryBtn");

      if(wrap) wrap.classList.remove("open");
      if(toggle) toggle.setAttribute("aria-expanded","false");

      renderCategoryFilters();
      render();
      updateUrlFromState();

      window.scrollTo({top:0,behavior:"smooth"});
    });

    menu.appendChild(btn);
  });
}

function productMatchesMainCategory(p){
  if(!ACTIVE_MAIN_CATEGORY) return true;

  const root = normalizeCategoryName(p.rootCategoryName || p.categoryName || "");
  return categoryKey(root) === categoryKey(ACTIVE_MAIN_CATEGORY);
}

function flattenProducts(raw){
  const items=[];

  raw.forEach(p=>{
    (p.variants || []).forEach(v=>{
      const attrs = Array.isArray(v.attributes) && v.attributes.length
        ? v.attributes
        : (p.attributes || []);

      const fullName = v.name || p.name || "";
      const memory = getMemory(attrs, fullName);
      const color = getColor(attrs, fullName);

      items.push({
        id:v.id || p.id,
        fullName,
        baseName:normalizeProductBaseName(fullName, color, memory),
        memory,
        color,
        attributes:attrs,
        price:Number(v.price || 0),
        onHand:Number(v.onHand || 0),
        image:v.image || p.image || "",
        categoryName:p.categoryName || "Khác",
        rootCategoryName:p.rootCategoryName || p.categoryName || "Khác",
        brand:detectBrand([fullName, p.name, p.categoryName, p.rootCategoryName].filter(Boolean).join(" "))
      });
    });
  });

  return items;
}
function groupItems(items){
  const map=new Map();

  items.forEach(item=>{
    const key=item.baseName || item.fullName;

    if(!map.has(key)){
      map.set(key,{
        name:key,
        image:item.image || "",
        categoryName:item.categoryName || "Khác",
        rootCategoryName:item.rootCategoryName || "Khác",
        items:[]
      });
    }

    const group=map.get(key);

    if(!group.image && item.image){
      group.image=item.image;
    }

    group.items.push(item);
  });

  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"vi"));
}

function imageHTML(group){
  if(!group.image){
    return `<div class="image-placeholder">Chưa có ảnh</div>`;
  }

  return `
    <img
      class="product-image"
      src="${group.image}"
      alt="${group.name}"
      loading="lazy"
      referrerpolicy="no-referrer"
      onerror="this.style.display='none';this.parentElement.innerHTML='<div class=&quot;image-placeholder&quot;>Chưa có ảnh</div>'"
    >
  `;
}

function variantLabel(v){
  const parts=[];

  if(v.memory){
    parts.push(`Dung lượng: ${v.memory}`);
  }

  if(v.color){
    parts.push(`Màu sắc: ${v.color}`);
  }

  return parts.length ? parts.join(" • ") : "Phiên bản";
}


function renderCategoryFilters(){
  const flat = flattenProducts(PRODUCTS).filter(productMatchesMainCategory);

  // Lấy hãng từ chính dữ liệu sản phẩm + tên danh mục KiotViet.
  // Không phụ thuộc vào việc variant có ghi hãng hay không.
  const brandSet = new Set();

  PRODUCTS.forEach(p=>{
    const root = normalizeCategoryName(p.rootCategoryName || p.categoryName || "");
    if(ACTIVE_MAIN_CATEGORY && categoryKey(root) !== categoryKey(ACTIVE_MAIN_CATEGORY)) return;

    const candidates = [
      p.name,
      p.categoryName,
      p.rootCategoryName,
      ...((p.variants || []).map(v=>v.name))
    ].filter(Boolean).join(" ");

    const brand = detectBrand(candidates);
    if(brand && brand !== "Khác") brandSet.add(brand);
  });

  flat.forEach(p=>{
    if(p.brand && p.brand !== "Khác") brandSet.add(p.brand);
  });

  const preferredOrder = [
    "HONOR","OPPO","vivo","Xiaomi","Samsung","Apple",
    "Huawei","Nubia","Motorola","Google","ASUS","Sony","Nothing"
  ];

  const brands = [...brandSet].sort((a,b)=>{
    const ai=preferredOrder.indexOf(a);
    const bi=preferredOrder.indexOf(b);
    if(ai !== -1 || bi !== -1){
      if(ai === -1) return 1;
      if(bi === -1) return -1;
      return ai-bi;
    }
    return a.localeCompare(b,"vi");
  });

  const hasOther = flat.some(p => p.brand === "Khác");
  if(hasOther && !brands.length) brands.push("Khác");

  const all = [
    "Tất cả",
    ...brands,
    ...(BEST_SELLER_READY ? ["Bán chạy"] : [])
  ];

  // Khi mới mở trang mà cache Bán chạy đang được tải,
  // vẫn giữ trạng thái Bán chạy. Nếu API thật sự lỗi và không có cache,
  // loadBestSellers() sẽ tự chuyển về Tất cả.
  if(!all.includes(ACTIVE_CATEGORY) && ACTIVE_CATEGORY !== "Bán chạy"){
    ACTIVE_CATEGORY = "Tất cả";
  }

  categoryFilters.innerHTML = "";

  all.forEach(filter=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="category-btn" + (filter===ACTIVE_CATEGORY ? " active" : "");
    btn.textContent=filter;

    if(filter==="Bán chạy"){
      btn.classList.add("best-seller-filter");
    }

    btn.addEventListener("click",()=>{
      ACTIVE_CATEGORY=filter;
      sendAnalytics("filter_click",{action:"Hãng: "+filter});
      renderCategoryFilters();
      render();
      updateUrlFromState();
    });

    categoryFilters.appendChild(btn);
  });

  renderPriceFilters();
}

function colorHex(name){
  const s=String(name||"").trim().toLowerCase();

  const map=[
    [["đen","black"], "#202124"],
    [["trắng","white"], "#f5f5f5"],
    [["xanh dương","blue","xanh biển"], "#6f8fe8"],
    [["xanh lá","green"], "#75b84f"],
    [["xanh"], "#70a7d9"],
    [["đỏ","red"], "#d84a4a"],
    [["hồng","pink"], "#e8a7bb"],
    [["tím","purple"], "#9a79d6"],
    [["bạc","silver"], "#c9ced4"],
    [["titan","titanium"], "#8a8a86"],
    [["xám","gray","grey"], "#8a8f98"],
    [["cam","orange"], "#e58a4a"],
    [["vàng","gold","yellow"], "#d8b15c"],
    [["nâu","brown"], "#8b6a55"],
    [["be","cream"], "#d8c8ae"]
  ];

  for(const [keys,hex] of map){
    if(keys.some(k=>s.includes(k))) return hex;
  }

  return "#d9dde3";
}


const COMPARE_STORAGE_KEY="sieudidong-compare-v1";
const MAX_COMPARE_ITEMS=3;
let COMPARE_ITEMS=[];

function saveCompareItems(){
  try{
    localStorage.setItem(COMPARE_STORAGE_KEY,JSON.stringify(COMPARE_ITEMS.map(x=>x.name)));
  }catch(_){}
}

function loadCompareItems(){
  try{
    const names=JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY)||"[]");
    if(!Array.isArray(names)) return;
    const groups=groupItems(flattenProducts(PRODUCTS));
    COMPARE_ITEMS=names
      .map(name=>groups.find(g=>g.name===name))
      .filter(Boolean)
      .slice(0,MAX_COMPARE_ITEMS);
  }catch(_){
    COMPARE_ITEMS=[];
  }
}

function isCompared(group){
  return COMPARE_ITEMS.some(x=>x.name===group.name);
}

function toggleCompare(group){
  const exists=isCompared(group);
  if(exists){
    COMPARE_ITEMS=COMPARE_ITEMS.filter(x=>x.name!==group.name);
  }else{
    if(COMPARE_ITEMS.length>=MAX_COMPARE_ITEMS){
      showCompareNotice(`Chỉ có thể so sánh tối đa ${MAX_COMPARE_ITEMS} sản phẩm.`);
      return false;
    }
    COMPARE_ITEMS.push(group);
    sendAnalytics("filter_click",{action:"So sánh: "+group.name});
  }
  saveCompareItems();
  renderCompareBar();
  return true;
}

function showCompareNotice(message){
  let el=document.getElementById("compareNotice");
  if(!el){
    el=document.createElement("div");
    el.id="compareNotice";
    el.className="compare-notice";
    document.body.appendChild(el);
  }
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function renderCompareBar(){
  let bar=document.getElementById("compareBar");
  if(!bar){
    bar=document.createElement("div");
    bar.id="compareBar";
    bar.className="compare-bar";
    document.body.appendChild(bar);
  }

  if(!COMPARE_ITEMS.length){
    bar.classList.remove("show");
    bar.innerHTML="";
    return;
  }

  bar.innerHTML="";
  const left=document.createElement("div");
  left.className="compare-bar-items";

  COMPARE_ITEMS.forEach(group=>{
    const item=document.createElement("div");
    item.className="compare-chip";
    item.innerHTML=`<span>${group.name}</span><button type="button" aria-label="Bỏ ${group.name}">×</button>`;
    item.querySelector("button").addEventListener("click",e=>{
      e.stopPropagation();
      toggleCompare(group);
      render();
    });
    left.appendChild(item);
  });

  const actions=document.createElement("div");
  actions.className="compare-bar-actions";

  const clear=document.createElement("button");
  clear.type="button";
  clear.className="compare-clear-btn";
  clear.textContent="Xóa";
  clear.addEventListener("click",()=>{
    COMPARE_ITEMS=[];
    saveCompareItems();
    renderCompareBar();
    render();
  });

  const open=document.createElement("button");
  open.type="button";
  open.className="compare-open-btn";
  open.disabled=COMPARE_ITEMS.length<2;
  open.textContent=COMPARE_ITEMS.length<2 ? "Chọn thêm 1 máy" : `So sánh ngay (${COMPARE_ITEMS.length})`;
  open.addEventListener("click",openCompareModal);

  const instruction=document.createElement("div");
  instruction.className="compare-bar-instruction";
  instruction.textContent=COMPARE_ITEMS.length<2
    ? `Đã chọn ${COMPARE_ITEMS.length}/${MAX_COMPARE_ITEMS} • Chọn thêm ít nhất 1 máy`
    : `Đã chọn ${COMPARE_ITEMS.length}/${MAX_COMPARE_ITEMS} • Có thể so sánh`;

  actions.append(instruction,clear,open);
  bar.append(left,actions);
  bar.classList.add("show");
}

async function fetchCompareSpecs(group){
  const cached=getCachedSpecs(group.name);
  if(cached?.specs?.length){
    return {
      ok:true,
      specs:cached.specs,
      source:"cache",
      error:""
    };
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);

  try{
    const res=await fetch(
      "/api/specs?v=109&name="+encodeURIComponent(group.name),
      {cache:"default",signal:controller.signal}
    );

    if(!res.ok) throw new Error("HTTP "+res.status);

    const data=await res.json();

    if(Array.isArray(data.specs) && data.specs.length){
      saveCachedSpecs(group.name,data);
      return {
        ok:true,
        specs:data.specs,
        source:"api",
        error:""
      };
    }

    return {
      ok:false,
      specs:[],
      source:"none",
      error:"Chưa có dữ liệu thông số"
    };
  }catch(err){
    return {
      ok:false,
      specs:[],
      source:"error",
      error:err?.name==="AbortError"
        ? "Tải thông số quá lâu"
        : (err?.message||"Không tải được thông số")
    };
  }finally{
    clearTimeout(timer);
  }
}



let compareSpeechUtterance=null;
let compareSpeechText="";
let compareSpeechButton=null;

function cleanSpeechText(text=""){
  return String(text)
    .replace(/[#*_`>-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function stopCompareSpeech(){
  try{
    speechSynthesis.cancel();
  }catch(_){}
  compareSpeechUtterance=null;
  if(compareSpeechButton){
    compareSpeechButton.classList.remove("speaking");
    compareSpeechButton.textContent="🔊 Nghe tư vấn";
  }
}

function getVietnameseSpeechVoice(){
  if(!("speechSynthesis" in window)) return null;

  const voices=speechSynthesis.getVoices?.()||[];

  // Chỉ chấp nhận voice tiếng Việt. Tuyệt đối không fallback sang voice mặc định.
  const exact=voices.find(v=>String(v.lang||"").toLowerCase()==="vi-vn");
  if(exact) return exact;

  const byLang=voices.find(v=>/^vi(?:-|_)/i.test(String(v.lang||"")));
  if(byLang) return byLang;

  const byName=voices.find(v=>/vietnamese|tiếng việt|tieng viet/i.test(String(v.name||"")));
  return byName||null;
}

async function waitForVietnameseSpeechVoice(timeoutMs=2000){
  const voice=getVietnameseSpeechVoice();
  if(voice) return voice;

  return new Promise(resolve=>{
    let finished=false;

    const finish=(value)=>{
      if(finished) return;
      finished=true;
      clearTimeout(timer);
      try{ speechSynthesis.removeEventListener("voiceschanged",onVoicesChanged); }catch(_){}
      resolve(value||null);
    };

    const onVoicesChanged=()=>{
      const found=getVietnameseSpeechVoice();
      if(found) finish(found);
    };

    try{
      speechSynthesis.addEventListener("voiceschanged",onVoicesChanged);
      speechSynthesis.getVoices?.();
    }catch(_){}

    const timer=setTimeout(()=>finish(getVietnameseSpeechVoice()),timeoutMs);
  });
}

async function speakCompareAdvice(text,button){
  if(!("speechSynthesis" in window)){
    showCompareNotice("Trình duyệt này chưa hỗ trợ đọc văn bản.");
    return;
  }

  const normalized=cleanSpeechText(text);
  if(!normalized){
    showCompareNotice("Chưa có nội dung AI để đọc.");
    return;
  }

  if(speechSynthesis.speaking && compareSpeechText===normalized){
    stopCompareSpeech();
    return;
  }

  stopCompareSpeech();

  const originalText=button.textContent;
  button.disabled=true;
  button.textContent="Đang tìm giọng Việt...";

  const viVoice=await waitForVietnameseSpeechVoice();

  button.disabled=false;
  button.textContent=originalText;

  if(!viVoice){
    showCompareNotice("Thiết bị chưa có giọng đọc tiếng Việt.");
    return;
  }

  compareSpeechText=normalized;
  compareSpeechButton=button;

  const utter=new SpeechSynthesisUtterance(normalized);
  utter.lang="vi-VN";
  utter.voice=viVoice;
  utter.rate=1.02;
  utter.pitch=1;
  utter.volume=1;

  utter.onstart=()=>{
    button.classList.add("speaking");
    button.textContent="⏹ Dừng đọc";
  };

  utter.onend=stopCompareSpeech;

  utter.onerror=()=>{
    stopCompareSpeech();
    showCompareNotice("Không phát được giọng đọc tiếng Việt trên thiết bị này.");
  };

  compareSpeechUtterance=utter;

  try{
    speechSynthesis.speak(utter);
  }catch(_){
    stopCompareSpeech();
    showCompareNotice("Không phát được giọng đọc tiếng Việt trên thiết bị này.");
  }
}

function mountAiVoiceButton(result,text){
  let bar=result.parentElement?.querySelector(".compare-ai-voicebar");
  if(!bar){
    bar=document.createElement("div");
    bar.className="compare-ai-voicebar";

    const hint=document.createElement("span");
    hint.textContent="Lười đọc? Nghe AI tư vấn";

    const btn=document.createElement("button");
    btn.type="button";
    btn.className="compare-ai-voice-btn";
    btn.textContent="🔊 Nghe tư vấn";

    bar.append(hint,btn);
    result.parentElement?.insertBefore(bar,result);

    btn.addEventListener("click",()=>{
      speakCompareAdvice(btn.dataset.text||"",btn);
    });
  }

  const btn=bar.querySelector(".compare-ai-voice-btn");
  if(btn){
    btn.dataset.text=String(text||"");
    btn.disabled=!String(text||"").trim();
  }
}


function renderAiCompareText(container,text){
  container.innerHTML="";
  const chunks=String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);

  chunks.forEach(line=>{
    const p=document.createElement("div");
    p.className="compare-ai-line";

    // Hỗ trợ tiêu đề/bullet đơn giản nhưng render bằng textContent để an toàn.
    if(/^#{1,3}\s+/.test(line)){
      p.classList.add("heading");
      line=line.replace(/^#{1,3}\s+/,"");
    }else if(/^(Nhận xét nhanh|Điểm mạnh|Máy phù hợp nhất|Kết luận|Lưu ý)\s*[:：]?/i.test(line)){
      p.classList.add("heading");
    }else if(/^[-•*]\s+/.test(line)){
      p.classList.add("bullet");
      line="• "+line.replace(/^[-•*]\s+/,"");
    }

    p.textContent=line;
    container.appendChild(p);
  });
}

function aiComparePayload(groups,specs){
  return groups.map((group,index)=>{
    const variant=getDefaultVariantForGroup(group);
    return {
      name:group.name,
      price:Number(variant?.price||0),
      inStock:Boolean(variant && Number(variant.onHand||0)>0),
      specs:Array.isArray(specs[index]) ? specs[index] : []
    };
  });
}

async function runAiCompare(groups,specs,need,button,result){
  stopCompareSpeech();
  button.disabled=true;
  delete button.dataset.retried;
  const requestId="cmp_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
  const old=button.textContent;
  button.textContent="Gemini đang phân tích...";
  result.classList.add("loading");
  result.innerHTML='<div class="compare-ai-wait">Gemini đang đọc cấu hình và đối chiếu các máy...</div>';

  const waitNode=()=>result.querySelector(".compare-ai-wait");
  const statusTimer1=setTimeout(()=>{
    const el=waitNode();
    if(el) el.textContent="Gemini đang cân nhắc điểm mạnh, điểm yếu và mức giá...";
  },6000);
  const statusTimer2=setTimeout(()=>{
    const el=waitNode();
    if(el) el.textContent="Gemini đang hoàn thiện kết luận phù hợp với nhu cầu của bạn...";
  },14000);

  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),35000);

    let r;
    try{
      r=await fetch("/api/compare-ai",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal:controller.signal,
        body:JSON.stringify({
          requestId,
          need,
          products:aiComparePayload(groups,specs)
        })
      });
    }finally{
      clearTimeout(timer);
    }

    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const message=data.error||"AI đang bận.";
      if((r.status===429 || r.status===502) && !button.dataset.retried){
        button.dataset.retried="1";
        const el=waitNode();
        if(el) el.textContent="AI đang bận, hệ thống tự thử lại một lần...";
        await new Promise(resolve=>setTimeout(resolve,1200));

        const retryController=new AbortController();
        const retryTimer=setTimeout(()=>retryController.abort(),35000);
        try{
          const rr=await fetch("/api/compare-ai",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            signal:retryController.signal,
            body:JSON.stringify({
              requestId,
              need,
              products:aiComparePayload(groups,specs)
            })
          });
          const rd=await rr.json().catch(()=>({}));
          if(!rr.ok) throw new Error(rd.error||message);
          result.classList.remove("loading");
          renderAiCompareText(result,rd.text);
          mountAiVoiceButton(result,rd.text);
          return;
        }finally{
          clearTimeout(retryTimer);
        }
      }
      throw new Error(message);
    }

    result.classList.remove("loading");
    renderAiCompareText(result,data.text);
    mountAiVoiceButton(result,data.text);
  }catch(err){
    result.classList.remove("loading");
    result.innerHTML="";
    const error=document.createElement("div");
    error.className="compare-ai-error";
    error.textContent=err?.name==="AbortError" ? "AI phản hồi hơi lâu. Vui lòng thử lại." : (err?.message||"AI đang bận. Vui lòng thử lại sau ít phút.");
    result.appendChild(error);
  }finally{
    clearTimeout(statusTimer1);
    clearTimeout(statusTimer2);
    button.disabled=false;
    button.textContent=old;
  }
}


function specMap(rows){
  const map=new Map();
  (rows||[]).forEach(r=>{
    if(r?.label) map.set(String(r.label).trim(),String(r.value||"").trim());
  });
  return map;
}

async function openCompareModal(){
  if(COMPARE_ITEMS.length<2){
    showCompareNotice("Chọn ít nhất 2 sản phẩm để so sánh.");
    return;
  }

  // Một lượt so sánh = khách thực sự bấm mở bảng so sánh với >= 2 máy.
  try{
    sendAnalytics("compare_create",{
      products:COMPARE_ITEMS.map(x=>x.name).slice(0,3)
    });
  }catch(_){}

  let modal=document.getElementById("compareModal");
  if(!modal){
    modal=document.createElement("div");
    modal.id="compareModal";
    modal.className="compare-modal";
    document.body.appendChild(modal);
  }

  modal.innerHTML=`
    <div class="compare-modal-backdrop"></div>
    <div class="compare-modal-dialog">
      <button class="compare-modal-close" type="button" aria-label="Đóng">×</button>
      <div class="compare-modal-head">
        <div>
          <h2>So sánh sản phẩm</h2>
          <p>Đối chiếu giá, tình trạng và thông số kỹ thuật.</p>
        </div>
      </div>
      <div class="compare-loading">Đang tải thông số...</div>
    </div>`;

  modal.classList.add("open");
  document.body.classList.add("modal-open");

  const close=()=>{
    stopCompareSpeech();
    modal.classList.remove("open");
    document.body.classList.remove("modal-open");
  };
  modal.querySelector(".compare-modal-close").addEventListener("click",close);
  modal.querySelector(".compare-modal-backdrop").addEventListener("click",close);

  const dialog=modal.querySelector(".compare-modal-dialog");
  const loading=modal.querySelector(".compare-loading");

  const groups=[...COMPARE_ITEMS];

  async function loadCompareData(){
    const results=await Promise.all(groups.map(fetchCompareSpecs));
    const specs=results.map(x=>Array.isArray(x?.specs)?x.specs:[]);
    const maps=specs.map(specMap);
    return {results,specs,maps};
  }

  let compareData;
  try{
    compareData=await loadCompareData();
  }catch(err){
    compareData={
      results:groups.map(()=>({ok:false,specs:[],error:err?.message||"Không tải được thông số"})),
      specs:groups.map(()=>[]),
      maps:groups.map(()=>new Map())
    };
  }

  let specs=compareData.specs;
  let maps=compareData.maps;
  let specResults=compareData.results;

  const aiBox=document.createElement("section");
  aiBox.className="compare-ai-box";

  const aiTop=document.createElement("div");
  aiTop.className="compare-ai-top";

  const aiTitleWrap=document.createElement("div");
  aiTitleWrap.className="compare-ai-title-wrap";
  aiTitleWrap.innerHTML=`
    <strong>Gemini AI phân tích</strong>
    <span>AI đọc đúng các thông số đang hiển thị để gợi ý máy phù hợp.</span>`;

  const aiControls=document.createElement("div");
  aiControls.className="compare-ai-controls";

  const needSelect=document.createElement("select");
  needSelect.className="compare-ai-select";
  needSelect.setAttribute("aria-label","Nhu cầu sử dụng");
  [
    ["Cân bằng","Nhu cầu: Cân bằng"],
    ["Chơi game / hiệu năng","Ưu tiên: Chơi game"],
    ["Chụp ảnh / camera","Ưu tiên: Camera"],
    ["Pin lâu / sử dụng nhiều","Ưu tiên: Pin lâu"],
    ["Giá / hiệu năng","Ưu tiên: Giá / hiệu năng"]
  ].forEach(([value,label])=>{
    const op=document.createElement("option");
    op.value=value;
    op.textContent=label;
    needSelect.appendChild(op);
  });

  const aiBtn=document.createElement("button");
  aiBtn.type="button";
  aiBtn.className="compare-ai-btn";
  aiBtn.textContent="✨ Gemini phân tích";

  aiControls.append(needSelect,aiBtn);
  aiTop.append(aiTitleWrap,aiControls);

  const aiResult=document.createElement("div");
  aiResult.className="compare-ai-result";
  const incompleteCount=specResults.filter(x=>!x?.ok).length;
  aiResult.innerHTML=incompleteCount
    ? `<div class="compare-ai-placeholder">Có ${incompleteCount} máy chưa có đủ thông số. Gemini vẫn có thể phân tích phần dữ liệu đang có.</div>`
    : '<div class="compare-ai-placeholder">Chọn nhu cầu rồi bấm “Gemini phân tích” để nhận gợi ý.</div>';

  aiBtn.addEventListener("click",()=>{
    runAiCompare(groups,specs,needSelect.value,aiBtn,aiResult);
  });

  aiBox.append(aiTop,aiResult);
  if(dialog) dialog.appendChild(aiBox);

  const preferred=[
    "Màn hình","Hệ điều hành","Camera sau","Camera trước",
    "CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"
  ];
  const labels=[...new Set(specs.flat().map(x=>String(x.label||"").trim()).filter(Boolean))];
  labels.sort((a,b)=>{
    const ai=preferred.indexOf(a), bi=preferred.indexOf(b);
    if(ai!==-1||bi!==-1){
      if(ai===-1) return 1;
      if(bi===-1) return -1;
      return ai-bi;
    }
    return a.localeCompare(b,"vi");
  });

  if(loading) loading.remove();

  const failedIndexes=specResults
    .map((x,i)=>x?.ok ? -1 : i)
    .filter(i=>i>=0);

  if(failedIndexes.length){
    const warn=document.createElement("div");
    warn.className="compare-spec-warning";

    const names=failedIndexes.map(i=>groups[i]?.name).filter(Boolean);
    const text=document.createElement("div");
    text.className="compare-spec-warning-text";
    text.innerHTML=`<strong>Một số máy chưa tải được đầy đủ thông số.</strong><span>${names.join(", ")}</span>`;

    const retry=document.createElement("button");
    retry.type="button";
    retry.className="compare-spec-retry-btn";
    retry.textContent="Thử tải lại";

    retry.addEventListener("click",async()=>{
      retry.disabled=true;
      retry.textContent="Đang tải lại...";

      compareData=await loadCompareData();
      specs=compareData.specs;
      maps=compareData.maps;
      specResults=compareData.results;

      const stillFailed=specResults.some(x=>!x?.ok);

      if(!stillFailed){
        warn.remove();
        retry.textContent="Đã tải";
      }else{
        retry.disabled=false;
        retry.textContent="Thử tải lại";
        const failedNames=specResults
          .map((x,i)=>x?.ok ? "" : groups[i]?.name)
          .filter(Boolean);
        text.innerHTML=`<strong>Vẫn còn máy chưa có đủ thông số.</strong><span>${failedNames.join(", ")}</span>`;
      }

      // Cập nhật lại nội dung so sánh bằng cách đóng/mở modal.
      setTimeout(()=>{
        modal.classList.remove("open");
        document.body.classList.remove("modal-open");
        openCompareModal();
      },150);
    });

    warn.append(text,retry);
    dialog.appendChild(warn);
  }

  const wrap=document.createElement("div");
  wrap.className="compare-table-wrap";

  // DESKTOP: bảng đối chiếu truyền thống.
  const table=document.createElement("div");
  table.className="compare-table";

  const header=document.createElement("div");
  header.className="compare-row compare-header-row";
  const blank=document.createElement("div");
  blank.className="compare-label";
  blank.textContent="Sản phẩm";
  header.appendChild(blank);

  groups.forEach(group=>{
    const variant=getDefaultVariantForGroup(group);
    const cell=document.createElement("div");
    cell.className="compare-product-head";
    cell.innerHTML=`
      <div class="compare-product-image">${imageHTML(group)}</div>
      <strong>${group.name}</strong>
      <span class="compare-product-price">${variant?money(variant.price):"Liên hệ"}</span>
      <span class="compare-product-stock ${variant&&Number(variant.onHand||0)>0?"in":"out"}">${variant&&Number(variant.onHand||0)>0?"✓ Còn hàng":"Hết hàng"}</span>`;
    header.appendChild(cell);
  });
  table.appendChild(header);

  labels.forEach(label=>{
    const row=document.createElement("div");
    row.className="compare-row";

    const labelCell=document.createElement("div");
    labelCell.className="compare-label";
    labelCell.textContent=label;
    row.appendChild(labelCell);

    maps.forEach(map=>{
      const cell=document.createElement("div");
      cell.className="compare-value";
      cell.textContent=map.get(label)||"—";
      row.appendChild(cell);
    });
    table.appendChild(row);
  });

  // MOBILE: mỗi thông số là một khối, giá trị từng máy xếp dọc.
  const mobile=document.createElement("div");
  mobile.className="compare-mobile";

  const mobileProducts=document.createElement("div");
  mobileProducts.className="compare-mobile-products";
  groups.forEach(group=>{
    const variant=getDefaultVariantForGroup(group);
    const card=document.createElement("div");
    card.className="compare-mobile-product-card";
    card.innerHTML=`
      <div class="compare-mobile-product-image">${imageHTML(group)}</div>
      <div class="compare-mobile-product-name">${group.name}</div>
      <div class="compare-product-price">${variant?money(variant.price):"Liên hệ"}</div>
      <div class="compare-product-stock ${variant&&Number(variant.onHand||0)>0?"in":"out"}">${variant&&Number(variant.onHand||0)>0?"✓ Còn hàng":"Hết hàng"}</div>`;
    mobileProducts.appendChild(card);
  });
  mobile.appendChild(mobileProducts);

  labels.forEach(label=>{
    const section=document.createElement("section");
    section.className="compare-mobile-spec";

    const h=document.createElement("h3");
    h.textContent=label;
    section.appendChild(h);

    groups.forEach((group,index)=>{
      const item=document.createElement("div");
      item.className="compare-mobile-spec-item";

      const name=document.createElement("div");
      name.className="compare-mobile-spec-name";
      name.textContent=group.name;

      const value=document.createElement("div");
      value.className="compare-mobile-spec-value";
      value.textContent=maps[index].get(label)||"—";

      item.append(name,value);
      section.appendChild(item);
    });

    mobile.appendChild(section);
  });

  if(!labels.length){
    const empty=document.createElement("div");
    empty.className="compare-empty";
    empty.textContent="Các sản phẩm này chưa có đủ thông số kỹ thuật để so sánh.";
    wrap.appendChild(empty);
  }else{
    wrap.append(table,mobile);
  }

  dialog.appendChild(wrap);
}


function render(){
  const q=searchInput.value.trim().toLowerCase();
  let items=flattenProducts(PRODUCTS).filter(productMatchesMainCategory);

  if(ACTIVE_CATEGORY==="Bán chạy"){
    const bestNames = typeof getBestSellerBaseNames==="function"
      ? new Set(getBestSellerBaseNames())
      : new Set();
    items = items.filter(x=>bestNames.has(x.baseName));
  }else if(ACTIVE_CATEGORY!=="Tất cả"){
    items=items.filter(x=>x.brand===ACTIVE_CATEGORY);
  }

  if(q){
    items=items.filter(x=>
      x.fullName.toLowerCase().includes(q) ||
      x.baseName.toLowerCase().includes(q)
    );
  }

  let groups=groupItems(items);
  groups=groups.filter(groupMatchesPrice);
  groups=sortGroups(groups);

  grid.innerHTML="";

  const totalVariants=groups.reduce((sum,g)=>sum+g.items.length,0);
  summary.textContent="";

  if(!groups.length){
    grid.innerHTML='<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  groups.forEach(group=>{
    const variants=[...group.items];
    if(!variants.length) return;

    const defaultVariant=getDefaultVariantForGroup(group);

    const card=document.createElement("article");
    card.className="compact-product-card";
    card.tabIndex=0;

    const media=document.createElement("div");
    media.className="compact-product-media";
    media.innerHTML=imageHTML(group);

    const body=document.createElement("div");
    body.className="compact-product-body";

    const title=document.createElement("div");
    title.className="compact-product-title";
    title.textContent=group.name;

    const price=document.createElement("div");
    price.className="compact-product-price";
    price.textContent=defaultVariant ? money(defaultVariant.price) : "Liên hệ";

    const meta=document.createElement("div");
    meta.className="compact-product-meta";

    const stock=document.createElement("span");
    const inStock=Boolean(defaultVariant && Number(defaultVariant.onHand||0)>0);
    stock.className="compact-stock " + (inStock ? "in-stock" : "out-stock");
    stock.textContent=inStock ? "✓ Còn hàng" : "Hết hàng";

    const buttons=document.createElement("div");
    buttons.className="compact-card-actions";

    const compareBtn=document.createElement("button");
    compareBtn.type="button";
    compareBtn.className="compact-compare-btn" + (isCompared(group) ? " active" : "");
    compareBtn.textContent=isCompared(group) ? "✓ Đã chọn" : "+ So sánh";
    compareBtn.addEventListener("click",(e)=>{
      e.stopPropagation();
      if(toggleCompare(group)){
        compareBtn.classList.toggle("active",isCompared(group));
        compareBtn.textContent=isCompared(group) ? "✓ Đã chọn" : "+ So sánh";
      }
    });

    const cta=document.createElement("button");
    cta.type="button";
    cta.className="compact-detail-btn";
    cta.textContent="Chi tiết";
    cta.addEventListener("click",(e)=>{
      e.stopPropagation();
      openInlineProductDetail(group,defaultVariant);
    });

    buttons.append(compareBtn,cta);
    meta.append(stock,buttons);

    body.append(title,price,meta);
    card.append(media,body);

    const open=()=>openInlineProductDetail(group,defaultVariant);
    card.addEventListener("click",open);
    card.addEventListener("keydown",e=>{
      if(e.key==="Enter" || e.key===" "){
        e.preventDefault();
        open();
      }
    });

    grid.appendChild(card);
  });
}


function relatedProductGroups(currentGroup, limit=3){
  const flat=flattenProducts(PRODUCTS);
  const allGroups=groupItems(flat);

  const currentBrand=currentGroup.items[0]?.brand || "";

  return allGroups
    .filter(g=>g.name!==currentGroup.name)
    .filter(g=>{
      const brand=g.items[0]?.brand || "";
      return currentBrand && brand===currentBrand;
    })
    .slice(0,limit);
}



const SPEC_CACHE_PREFIX = "sieudidong-specs-v8-strict-table:";
const SPEC_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function specCacheKey(name){
  return SPEC_CACHE_PREFIX + String(name||"").toLowerCase().trim();
}

function getCachedSpecs(name){
  try{
    const raw=localStorage.getItem(specCacheKey(name));
    if(!raw) return null;

    const data=JSON.parse(raw);
    if(!data?.savedAt || !Array.isArray(data?.specs)) return null;
    if(Date.now()-Number(data.savedAt)>SPEC_CACHE_MAX_AGE) return null;

    return data;
  }catch(_){
    return null;
  }
}

function saveCachedSpecs(name,data){
  try{
    localStorage.setItem(specCacheKey(name),JSON.stringify({
      savedAt:Date.now(),
      specs:data.specs || [],
      sourceName:data.sourceName || "",
      sourceUrl:data.sourceUrl || ""
    }));
  }catch(_){}
}

function renderTechnicalSpecs(container,data){
  container.innerHTML="";

  if(!data || !Array.isArray(data.specs) || !data.specs.length){
    container.innerHTML='<div class="tech-spec-empty">Chưa có thông số kỹ thuật cho sản phẩm này.</div>';
    return;
  }

  const table=document.createElement("div");
  table.className="tech-spec-table";

  data.specs.forEach(row=>{
    const line=document.createElement("div");
    line.className="tech-spec-row";

    const label=document.createElement("div");
    label.className="tech-spec-label";
    label.textContent=row.label;

    const value=document.createElement("div");
    value.className="tech-spec-value";
    value.textContent=row.value;

    line.append(label,value);
    table.appendChild(line);
  });

  container.appendChild(table);
}

async function loadTechnicalSpecs(productName,container){
  const cached=getCachedSpecs(productName);

  if(cached){
    renderTechnicalSpecs(container,cached);
  }else{
    container.innerHTML='<div class="tech-spec-loading">Đang tải thông số kỹ thuật...</div>';
  }

  try{
    const res=await fetch(
      "/api/specs?v=64&name="+encodeURIComponent(productName),
      {cache:"default"}
    );

    if(!res.ok) throw new Error("HTTP "+res.status);

    const data=await res.json();

    if(Array.isArray(data.specs) && data.specs.length){
      saveCachedSpecs(productName,data);
      renderTechnicalSpecs(container,data);
    }else if(!cached){
      renderTechnicalSpecs(container,null);
    }
  }catch(err){
    console.error("Technical specs:",err);

    // Nếu đã có cache thì giữ nguyên cache; không làm ảnh hưởng trang sản phẩm.
    if(!cached){
      container.innerHTML='<div class="tech-spec-empty">Chưa xác minh được đúng model để lấy thông số kỹ thuật.</div>';
    }
  }
}


function slugifyProductName(text=""){
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d")
    .replace(/Đ/g,"D")
    .toLowerCase()
    .replace(/\([^)]*\)/g," ")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

function productUrl(groupName=""){
  return "/san-pham/" + slugifyProductName(groupName);
}

function currentProductSlug(){
  const m=location.pathname.match(/^\/san-pham\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}

function findGroupBySlug(slug){
  if(!slug || !PRODUCTS.length) return null;

  const groups=groupItems(flattenProducts(PRODUCTS));
  return groups.find(g=>slugifyProductName(g.name)===slug) || null;
}

function openProductFromUrl(){
  const slug=currentProductSlug();
  if(!slug) return false;

  const group=findGroupBySlug(slug);
  if(!group) return false;

  const variants=[...group.items];
  const defaultVariant=variants.sort((a,b)=>{
    const stockDiff=(b.onHand>0)-(a.onHand>0);
    if(stockDiff!==0) return stockDiff;
    return Number(a.price||0)-Number(b.price||0);
  })[0] || null;

  openInlineProductDetail(group,defaultVariant,{updateUrl:false});
  return true;
}

function openInlineProductDetail(group,initialVariant,options={}){
  
  sendAnalytics("product_view",{product:String(group?.name||"")});
  sendAnalytics("detail_click",{product:String(group?.name||"")});
  updateSeoForProduct(group,initialVariant || group?.items?.[0]);
if(!inlineProductDetail) return;

  if(options.updateUrl !== false){
    const url=productUrl(group.name);
    if(location.pathname !== url){
      history.pushState(
        {view:"detail", slug:slugifyProductName(group.name)},
        "",
        url
      );
    }
  }

  const variants=[...group.items];
  let selected=initialVariant || variants[0] || null;
  let selectedColor=selected?.color || "";
  let selectedMemory=selected?.memory || "";

  inlineProductDetail.innerHTML="";

  const shell=document.createElement("div");
  shell.className="detail-page inline-detail-page";

  const topbar=document.createElement("div");
  topbar.className="inline-detail-topbar";

  const backBtn=document.createElement("button");
  backBtn.type="button";
  backBtn.className="inline-back-btn";
  backBtn.textContent="← Về trang chủ";
  backBtn.addEventListener("click",()=>{
    // Về đúng trang chủ và xóa trạng thái sản phẩm/bộ lọc trên URL.
    window.location.href="/";
  });

  topbar.appendChild(backBtn);

  const breadcrumb=document.createElement("div");
  breadcrumb.className="detail-breadcrumb";
  const brand=group.items[0]?.brand || "Điện thoại";
  breadcrumb.textContent=`Điện thoại  ›  ${brand}`;

  const heading=document.createElement("div");
  heading.className="detail-heading";

  const title=document.createElement("h2");
  title.textContent=group.name;

  const statusTop=document.createElement("div");
  statusTop.className="detail-status-top";

  const detailCompareBtn=document.createElement("button");
  detailCompareBtn.type="button";
  detailCompareBtn.className="detail-compare-btn" + (isCompared(group) ? " active" : "");
  detailCompareBtn.textContent=isCompared(group) ? "✓ Đã chọn so sánh" : "+ Thêm vào so sánh";
  detailCompareBtn.addEventListener("click",(e)=>{
    e.stopPropagation();
    if(toggleCompare(group)){
      detailCompareBtn.classList.toggle("active",isCompared(group));
      detailCompareBtn.textContent=isCompared(group) ? "✓ Đã chọn so sánh" : "+ Thêm vào so sánh";
    }
  });

  heading.append(title,statusTop);

  const main=document.createElement("div");
  main.className="detail-main";

  const gallery=document.createElement("div");
  gallery.className="detail-gallery";

  const imageBox=document.createElement("div");
  imageBox.className="detail-image-box";
  imageBox.innerHTML=imageHTML(group);

  gallery.append(imageBox);

  const info=document.createElement("div");
  info.className="detail-info";

  const price=document.createElement("div");
  price.className="detail-price";

  const chooseText=document.createElement("div");
  chooseText.className="detail-choose-text";
  chooseText.textContent="Chọn phiên bản để xem giá và tình trạng hàng:";

  const compareHint=document.createElement("div");
  compareHint.className="detail-compare-hint";
  compareHint.textContent="Chọn máy này rồi chọn thêm ít nhất 1 máy khác để so cấu hình.";

  const colorRow=document.createElement("div");
  colorRow.className="detail-option-row";
  const colorLabel=document.createElement("div");
  colorLabel.className="detail-option-label";
  colorLabel.textContent="Màu sắc";
  const colorOptions=document.createElement("div");
  colorOptions.className="detail-color-options";
  const colorNote=document.createElement("span");
  colorNote.className="detail-color-note";
  colorRow.append(colorLabel,colorOptions);

  const memoryRow=document.createElement("div");
  memoryRow.className="detail-option-row";
  const memoryLabel=document.createElement("div");
  memoryLabel.className="detail-option-label";
  memoryLabel.textContent="Dung lượng";
  const memoryOptions=document.createElement("div");
  memoryOptions.className="detail-memory-options";
  memoryRow.append(memoryLabel,memoryOptions);

  const detailActions=document.createElement("div");
  detailActions.className="detail-actions";

  const buyZaloBtn=document.createElement("a");
  buyZaloBtn.className="detail-buy-zalo-btn";
  buyZaloBtn.href=SIEUDIDONG_ZALO_URL;
  buyZaloBtn.target="_blank";
  buyZaloBtn.rel="noopener noreferrer";
  buyZaloBtn.textContent="Liên hệ mua hàng";
  buyZaloBtn.addEventListener("click",()=>{
    try{ sendAnalyticsEvent("zalo_click",{source:"product_detail",product:group.name}); }catch(_){}
  });

  detailActions.append(buyZaloBtn,detailCompareBtn);

  const infoBox=document.createElement("div");
  infoBox.className="detail-info-box";
  infoBox.innerHTML=`
    <div class="detail-info-box-title">Thông tin sản phẩm</div>
    <div class="detail-info-line"><span>Hãng</span><strong>${brand}</strong></div>
    <div class="detail-info-line"><span>Số phiên bản</span><strong>${variants.length}</strong></div>
    <div class="detail-info-line"><span>Tình trạng</span><strong class="js-stock-text"></strong></div>
  `;

  info.append(price,chooseText);
  if(variants.some(v=>v.color)) info.appendChild(colorRow);
  if(variants.some(v=>v.memory)) info.appendChild(memoryRow);
  info.appendChild(detailActions);

  const related=document.createElement("aside");
  related.className="detail-related";

  const relatedTitle=document.createElement("div");
  relatedTitle.className="detail-related-title";
  relatedTitle.textContent="Sản phẩm tương tự";
  related.appendChild(relatedTitle);

  const relatedGroups=relatedProductGroups(group,3);

  if(!relatedGroups.length){
    const empty=document.createElement("div");
    empty.className="detail-related-empty";
    empty.textContent="Chưa có sản phẩm tương tự.";
    related.appendChild(empty);
  }else{
    relatedGroups.forEach(rg=>{
      const rv=[...rg.items].sort((a,b)=>{
        const stockDiff=(b.onHand>0)-(a.onHand>0);
        if(stockDiff!==0) return stockDiff;
        return Number(a.price||0)-Number(b.price||0);
      })[0];

      const item=document.createElement("button");
      item.type="button";
      item.className="detail-related-item";

      const thumb=document.createElement("div");
      thumb.className="detail-related-thumb";
      thumb.innerHTML=imageHTML(rg);

      const text=document.createElement("div");
      text.className="detail-related-text";

      const name=document.createElement("div");
      name.className="detail-related-name";
      name.textContent=rg.name;

      const p=document.createElement("div");
      p.className="detail-related-price";
      p.textContent=rv ? money(rv.price) : "Liên hệ";

      text.append(name,p);
      item.append(thumb,text);
      item.addEventListener("click",()=>openInlineProductDetail(rg,rv));

      related.appendChild(item);
    });
  }

  main.append(gallery,info,related);

  const note=document.createElement("section");
  note.className="detail-note detail-note-compact";
  const noteBody=document.createElement("div");
  noteBody.className="detail-note-body";
  noteBody.textContent="Giá và tình trạng hàng được cập nhật thường xuyên theo màu sắc và dung lượng đang chọn.";

  const technical=document.createElement("section");
  technical.className="technical-spec-section";

  const technicalTitle=document.createElement("div");
  technicalTitle.className="technical-spec-title";
  technicalTitle.textContent="Thông Số Kỹ Thuật";

  const technicalBody=document.createElement("div");
  technicalBody.className="technical-spec-body";

  technical.append(technicalTitle,technicalBody);

  shell.append(topbar,breadcrumb,heading,main,note,technical);
  inlineProductDetail.appendChild(shell);

  const colors=[...new Set(variants.map(v=>v.color).filter(Boolean))];
  const memories=[...new Set(variants.map(v=>v.memory).filter(Boolean))];
  const colorButtons=new Map();
  const memoryButtons=new Map();
  const stockText=statusTop;

  function findVariant(){
    let matches=variants.filter(v=>{
      const cOk=!selectedColor || v.color===selectedColor;
      const mOk=!selectedMemory || v.memory===selectedMemory;
      return cOk && mOk;
    });

    if(!matches.length && selectedColor){
      matches=variants.filter(v=>v.color===selectedColor);
    }
    if(!matches.length && selectedMemory){
      matches=variants.filter(v=>v.memory===selectedMemory);
    }
    if(!matches.length) matches=[...variants];

    return matches.sort((a,b)=>{
      const stockDiff=(b.onHand>0)-(a.onHand>0);
      if(stockDiff!==0) return stockDiff;
      return Number(a.price||0)-Number(b.price||0);
    })[0] || null;
  }

  function updateAvailability(){
    colorButtons.forEach((btn,color)=>{
      const exists=variants.some(v=>{
        const mOk=!selectedMemory || v.memory===selectedMemory;
        return mOk && v.color===color;
      });
      btn.classList.toggle("disabled",!exists);
    });

    memoryButtons.forEach((btn,mem)=>{
      const exists=variants.some(v=>{
        const cOk=!selectedColor || v.color===selectedColor;
        return cOk && v.memory===mem;
      });
      btn.classList.toggle("disabled",!exists);
    });
  }

  function updateUI(){
    selected=findVariant();

    if(selected){
      selectedColor=selected.color || selectedColor;
      selectedMemory=selected.memory || selectedMemory;

      // Đổi ảnh theo đúng biến thể màu/dung lượng đang chọn.
      // Nếu biến thể có ảnh riêng từ KiotViet thì dùng ảnh đó.
      if(selected.image){
        const currentImg=imageBox.querySelector(".product-image");

        if(currentImg){
          if(currentImg.src !== selected.image){
            currentImg.src=selected.image;
            currentImg.alt=`${group.name} - ${selectedColor || ""}`.trim();
          }
        }else{
          imageBox.innerHTML=`
            <img
              class="product-image"
              src="${selected.image}"
              alt="${group.name} - ${selectedColor || ""}"
              loading="eager"
              referrerpolicy="no-referrer"
              onerror="this.style.display='none';this.parentElement.innerHTML='<div class=&quot;image-placeholder&quot;>Chưa có ảnh</div>'"
            >
          `;
        }
      }

      price.textContent=money(selected.price);
      const inStock=Number(selected.onHand||0)>0;
      const stockLabel=inStock ? "✓ Còn hàng" : "Hết hàng";

      statusTop.textContent=stockLabel;
      statusTop.classList.toggle("out",!inStock);
      stockText.textContent=inStock ? "Còn hàng" : "Hết hàng";
      stockText.classList.toggle("out",!inStock);
    }

    colorButtons.forEach((btn,color)=>{
      btn.classList.toggle("active",color===selectedColor);
    });

    memoryButtons.forEach((btn,mem)=>{
      btn.classList.toggle("active",mem===selectedMemory);
    });

    colorNote.textContent=selectedColor ? `(${selectedColor})` : "";
    updateAvailability();
  }

  colors.forEach(color=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="detail-color-swatch";
    btn.title=color;

    const swatch=document.createElement("span");
    swatch.style.background=colorHex(color);
    btn.appendChild(swatch);

    btn.addEventListener("click",()=>{
      if(btn.classList.contains("disabled")) return;

      selectedColor=color;
      const compatible=variants.filter(v=>v.color===selectedColor);

      if(selectedMemory && !compatible.some(v=>v.memory===selectedMemory)){
        selectedMemory=compatible.find(v=>v.memory)?.memory || "";
      }
      updateUI();
    });

    colorButtons.set(color,btn);
    colorOptions.appendChild(btn);
  });

  if(colors.length){
    colorOptions.appendChild(colorNote);
  }

  memories.forEach(mem=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="detail-memory-btn";
    btn.textContent=mem;

    btn.addEventListener("click",()=>{
      if(btn.classList.contains("disabled")) return;

      selectedMemory=mem;
      const compatible=variants.filter(v=>v.memory===selectedMemory);

      if(selectedColor && !compatible.some(v=>v.color===selectedColor)){
        selectedColor=compatible.find(v=>v.color)?.color || "";
      }
      updateUI();
    });

    memoryButtons.set(mem,btn);
    memoryOptions.appendChild(btn);
  });

  productGrid.hidden=true;
  inlineProductDetail.hidden=false;

  document.body.classList.add("detail-view-active");
  window.scrollTo({top:0,left:0,behavior:"auto"});
  if(!history.state || history.state.view!=="detail"){
    history.pushState({view:"detail"},"",location.href);
  }
  updateUI();
  loadTechnicalSpecs(group.name,technicalBody);
}

function closeInlineProductDetail(){
  if(location.pathname.startsWith("/san-pham/")){
    history.back();
    return;
  }

  if(!inlineProductDetail) return;
  inlineProductDetail.hidden=true;
  inlineProductDetail.innerHTML="";
  productGrid.hidden=false;
  document.body.classList.remove("detail-view-active");
  window.scrollTo({top:0,left:0,behavior:"auto"});
}


window.addEventListener("popstate",()=>{
  const slug=currentProductSlug();

  if(slug){
    const group=findGroupBySlug(slug);
    if(group){
      const variants=[...group.items];
      const defaultVariant=variants.sort((a,b)=>{
        const stockDiff=(b.onHand>0)-(a.onHand>0);
        if(stockDiff!==0) return stockDiff;
        return Number(a.price||0)-Number(b.price||0);
      })[0] || null;

      openInlineProductDetail(group,defaultVariant,{updateUrl:false});
      return;
    }
  }

  if(inlineProductDetail){
    inlineProductDetail.hidden=true;
    inlineProductDetail.innerHTML="";
  }

  productGrid.hidden=false;
  document.body.classList.remove("detail-view-active");
  window.scrollTo({top:0,left:0,behavior:"auto"});
});

async function load(){
  try{
    const res=await fetch("/api/products?ts="+Date.now(),{cache:"no-store"});

    if(!res.ok){
      throw new Error("HTTP "+res.status);
    }

    const data=await res.json();

    if(!Array.isArray(data.products) || !data.products.length){
      throw new Error("Empty product data");
    }

    PRODUCTS=data.products;
    saveProductCache(PRODUCTS);

    updatedAt.textContent=data.stale
      ? "Đang hiển thị dữ liệu gần nhất"
      : "Cập nhật lúc "+new Date().toLocaleTimeString("vi-VN");

    renderMainCategoryMenu();
    renderCategoryFilters();
    render();

    if(currentProductSlug()){
      openProductFromUrl();
    }

  }catch(err){
    console.error(err);

    // Không xóa bảng đang hiển thị nếu lần refresh sau bị lỗi.
    if(PRODUCTS.length){
      updatedAt.textContent="Đang hiển thị dữ liệu gần nhất";
      return;
    }

    // Lần mở đầu tiên mà API lỗi thì thử cache trình duyệt.
    loadStateFromUrl();
if(document.getElementById("sortSelect")){
  document.getElementById("sortSelect").value=ACTIVE_SORT;
}

if(loadProductCache()){
      updatedAt.textContent="Đang hiển thị dữ liệu gần nhất";
      renderCategoryFilters();
      render();
      return;
    }

    updatedAt.textContent="Không thể cập nhật";
    grid.innerHTML='<div class="empty">Không tải được bảng giá. Vui lòng tải lại trang sau ít phút.</div>';
  }
}

// Nạp dữ liệu tìm kiếm phổ biến gần nhất để trang mặc định sắp xếp ngay.
loadSearchPopularityCache();

// Nạp danh sách bán chạy gần nhất trước để tab mặc định hiển thị ngay.
loadBestSellerCache();

// Hiện cache sản phẩm ngay nếu có, rồi cập nhật nền.
if(loadProductCache()){
  updatedAt.textContent="Đang cập nhật...";
  renderMainCategoryMenu();
  loadCompareItems();
  renderCompareBar();
  renderCategoryFilters();
  render();

  if(currentProductSlug()){
    openProductFromUrl();
  }
}

load();
loadBestSellers();
loadSearchPopularity();
setInterval(load,60000);
setInterval(loadBestSellers,60*60*1000);


const searchSuggestions=document.getElementById("searchSuggestions");

function getSearchSuggestionGroups(query,limit=5){
  const q=String(query||"").trim().toLowerCase();
  if(!q) return [];
  let items=flattenProducts(PRODUCTS).filter(productMatchesMainCategory);
  items=items.filter(x=>
    String(x.fullName||"").toLowerCase().includes(q) ||
    String(x.baseName||"").toLowerCase().includes(q) ||
    String(x.brand||"").toLowerCase().includes(q)
  );
  return groupItems(items).slice(0,limit);
}

function closeSearchSuggestions(){
  if(!searchSuggestions) return;
  searchSuggestions.hidden=true;
  searchSuggestions.innerHTML="";
}

function renderSearchSuggestions(){
  if(!searchSuggestions) return;
  const q=searchInput.value.trim();
  if(!q){
    closeSearchSuggestions();
    return;
  }

  const groups=getSearchSuggestionGroups(q,5);
  searchSuggestions.innerHTML="";

  if(!groups.length){
    const empty=document.createElement("div");
    empty.className="search-suggestion-empty";
    empty.textContent="Không tìm thấy sản phẩm.";
    searchSuggestions.appendChild(empty);
    searchSuggestions.hidden=false;
    return;
  }

  groups.forEach(group=>{
    const variant=getDefaultVariantForGroup(group);
    const row=document.createElement("button");
    row.type="button";
    row.className="search-suggestion-item";

    const media=document.createElement("div");
    media.className="search-suggestion-image";
    media.innerHTML=imageHTML(group);

    const info=document.createElement("div");
    info.className="search-suggestion-info";

    const name=document.createElement("div");
    name.className="search-suggestion-name";
    name.textContent=group.name;

    const bottom=document.createElement("div");
    bottom.className="search-suggestion-bottom";

    const price=document.createElement("span");
    price.className="search-suggestion-price";
    price.textContent=variant?money(variant.price):"Liên hệ";

    const stock=document.createElement("span");
    const inStock=Boolean(variant&&Number(variant.onHand||0)>0);
    stock.className="search-suggestion-stock "+(inStock?"in":"out");
    stock.textContent=inStock?"Còn hàng":"Hết hàng";

    bottom.append(price,stock);
    info.append(name,bottom);
    row.append(media,info);

    row.addEventListener("pointerdown",e=>e.preventDefault());
    row.addEventListener("click",()=>{
      closeSearchSuggestions();
      searchInput.blur();
      openInlineProductDetail(group,variant);
    });

    searchSuggestions.appendChild(row);
  });

  const all=document.createElement("button");
  all.type="button";
  all.className="search-suggestion-all";
  all.textContent="Xem tất cả kết quả cho “"+q+"”";
  all.addEventListener("pointerdown",e=>e.preventDefault());
  all.addEventListener("click",()=>{
    closeSearchSuggestions();
    searchInput.blur();
    render();
    updateUrlFromState();
    document.querySelector(".catalog-overview")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  searchSuggestions.appendChild(all);
  searchSuggestions.hidden=false;
}

searchInput.addEventListener("focus",renderSearchSuggestions);
document.addEventListener("pointerdown",e=>{
  if(!e.target.closest(".commerce-search")) closeSearchSuggestions();
});

searchInput.addEventListener("input",()=>{
  render();
  renderSearchSuggestions();
  updateUrlFromState();
});
onlyStock.addEventListener("change",render);

clearSearch.addEventListener("click",()=>{
  searchInput.value="";
  searchInput.focus();
  closeSearchSuggestions();
  render();
});



const commerceCategoryBtn=document.getElementById("commerceCategoryBtn");
const commerceCategoryMenu=document.querySelector(".commerce-category-menu");

if(commerceCategoryBtn && commerceCategoryMenu){
  commerceCategoryBtn.addEventListener("click",(e)=>{
    e.stopPropagation();
    const open=commerceCategoryMenu.classList.toggle("open");
    commerceCategoryBtn.setAttribute("aria-expanded",open ? "true":"false");
  });

  document.addEventListener("click",(e)=>{
    if(!commerceCategoryMenu.contains(e.target)){
      commerceCategoryMenu.classList.remove("open");
      commerceCategoryBtn.setAttribute("aria-expanded","false");
    }
  });
}





const sortSelect=document.getElementById("sortSelect");

if(sortSelect){
  sortSelect.value=ACTIVE_SORT;
  sortSelect.addEventListener("change",()=>{
    ACTIVE_SORT=sortSelect.value || "default";
    sendAnalytics("filter_click",{action:"Sắp xếp: "+ACTIVE_SORT});
    render();
    updateUrlFromState();
  });
}


if(searchInput) searchInput.addEventListener("input",trackSearchQuery);
const analyticsZaloButton=document.getElementById("zaloConsultBtn");
if(analyticsZaloButton) analyticsZaloButton.addEventListener("click",()=>sendAnalytics("zalo_click"));

if(!location.pathname.startsWith("/san-pham/")) updateSeoForHome();


sendAnalytics("heartbeat");
setInterval(()=>sendAnalytics("heartbeat"),60000);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") sendAnalytics("heartbeat");
});



/* =========================================================
   V137 - AI Chat tư vấn sản phẩm / Siêu Di Động
   ========================================================= */
window.__AI_CHAT_V138_READY=true;
const aiChatPanel=document.getElementById("aiChatPanel");
const aiChatClose=document.getElementById("aiChatClose");
const aiChatMessages=document.getElementById("aiChatMessages");
const aiChatForm=document.getElementById("aiChatForm");
const aiChatInput=document.getElementById("aiChatInput");
const aiChatSend=document.getElementById("aiChatSend");
const aiChatSuggestions=document.getElementById("aiChatSuggestions");
const aiHumanHandoff=document.getElementById("aiHumanHandoff");
const aiHumanZaloBtn=document.getElementById("aiHumanZaloBtn");
const zaloConsultBtn=document.getElementById("zaloConsultBtn");
const aiChatFloatLabel=document.getElementById("aiChatFloatLabel");
const aiMobileZaloDirect=document.getElementById("aiMobileZaloDirect");

const aiChatIconImg=document.querySelector("#zaloConsultBtn .ai-round-logo img");

async function loadPublicAiChatIcon(){
  if(!aiChatIconImg) return;
  try{
    const r=await fetch("/api/ai-chat-icon?ts="+Date.now(),{cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    if(r.ok && data.iconUrl) aiChatIconImg.src=data.iconUrl;
  }catch(_){}
}

loadPublicAiChatIcon();
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") loadPublicAiChatIcon();
});


const AI_CHAT_HISTORY=[];

function parseAiChatSuggestions(raw=""){
  return String(raw||"")
    .split(/\r?\n/)
    .map(line=>line.trim())
    .filter(Boolean)
    .slice(0,8)
    .map(line=>{
      const pos=line.indexOf("|");
      if(pos<0){
        const text=line.slice(0,80).trim();
        return {label:text,question:text};
      }
      const label=line.slice(0,pos).trim().slice(0,50);
      const question=line.slice(pos+1).trim().slice(0,300);
      return {label:label||question,question:question||label};
    })
    .filter(x=>x.label&&x.question);
}

function renderAiChatSuggestions(raw=""){
  if(!aiChatSuggestions) return;
  const items=parseAiChatSuggestions(raw);
  if(!items.length) return;

  aiChatSuggestions.innerHTML="";
  items.forEach(item=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.dataset.aiQuestion=item.question;
    btn.textContent=item.label;
    aiChatSuggestions.appendChild(btn);
  });
}

let aiChatWelcomeLoaded=false;
async function aiChatLoadWelcome(){
  if(aiChatWelcomeLoaded) return;
  aiChatWelcomeLoaded=true;
  try{
    const r=await fetch("/api/ai-chat",{cache:"no-store"});
    const data=await r.json();
    const text=String(data?.welcomeMessage||"").trim();
    if(!r.ok) return;
    const first=aiChatMessages?.querySelector(".ai-chat-message.assistant .ai-chat-bubble");
    if(text && first) first.textContent=text;
    renderAiChatSuggestions(data?.suggestions||"");
  }catch(_){}
}

let aiChatBusy=false;

function aiChatOpen(){
  if(!aiChatPanel) return;
  const isMobile=window.matchMedia("(max-width:720px)").matches;

  // Mobile: mở chatbox nhưng không tự gọi bàn phím.
  if(isMobile){
    try{ document.activeElement?.blur?.(); }catch(_){}
    if(aiChatInput){
      aiChatInput.blur();
      aiChatInput.setAttribute("readonly","readonly");
      setTimeout(()=>aiChatInput.removeAttribute("readonly"),250);
    }
  }

  aiChatLoadWelcome();
  aiChatSetHumanHandoff(false);
  aiChatPanel.hidden=false;
  document.body.classList.add("ai-chat-open");
  if(zaloConsultBtn) zaloConsultBtn.style.setProperty("display","none","important");
  if(aiChatFloatLabel) aiChatFloatLabel.style.display="none";
  sendAnalytics("filter_click",{action:"ai_chat_open"});

  if(!isMobile){
    setTimeout(()=>aiChatInput?.focus(),80);
  }
}
function aiChatHide(){
  if(!aiChatPanel) return;
  aiChatPanel.hidden=true;
  document.body.classList.remove("ai-chat-open");
  if(zaloConsultBtn){
    zaloConsultBtn.style.removeProperty("display");
  }
  setTimeout(()=>{
    syncAiChatFloatLabel();
  },60);
}

function aiChatSetHumanHandoff(show,reason=""){
  if(!aiHumanHandoff) return;

  // Luôn cho khách lựa chọn nhắn nhân viên ngay khi vào chat.
  aiHumanHandoff.hidden=false;
  aiHumanHandoff.classList.toggle("is-priority",Boolean(show));

  const note=aiHumanHandoff.querySelector("span");
  if(note){
    note.textContent=(show && reason)
      ? reason
      : "Nếu muốn nói chuyện với nhân viên ngay, bạn có thể nhắn Zalo trực tiếp.";
  }
}

function aiChatCustomerRequestsHuman(text=""){
  const s=normalizeSearchText(text);
  const patterns=[
    "nhan vien",
    "tu van truc tiep",
    "nguoi tu van",
    "gap nhan vien",
    "noi chuyen nhan vien",
    "chat zalo",
    "nhan zalo",
    "zalo shop",
    "cho toi gap nguoi",
    "muon hoi nguoi that",
    "muon gap nguoi that",
    "tu van vien"
  ];
  return patterns.some(k=>s.includes(k));
}

function aiChatNeedsHuman(reply=""){
  const s=String(reply||"").toLowerCase();
  return [
    "zalo",
    "nhân viên",
    "nhan vien",
    "xác nhận",
    "xac nhan",
    "liên hệ",
    "lien he",
    "chưa có dữ liệu",
    "chua co du lieu",
    "địa chỉ",
    "dia chi",
    "giờ mở cửa",
    "gio mo cua"
  ].some(k=>s.includes(k));
}
function aiChatAppend(role,text){
  const row=document.createElement("div");
  row.className="ai-chat-message "+(role==="user"?"user":"assistant");
  const bubble=document.createElement("div");
  bubble.className="ai-chat-bubble";
  bubble.textContent=String(text||"");
  row.appendChild(bubble);
  aiChatMessages.appendChild(row);
  aiChatMessages.scrollTop=aiChatMessages.scrollHeight;
  return row;
}
function aiChatTyping(show){
  let el=document.getElementById("aiChatTyping");
  if(show){
    if(el) return;
    el=document.createElement("div");
    el.id="aiChatTyping";
    el.className="ai-chat-message assistant";
    el.innerHTML='<div class="ai-chat-bubble ai-chat-typing"><span></span><span></span><span></span></div>';
    aiChatMessages.appendChild(el);
    aiChatMessages.scrollTop=aiChatMessages.scrollHeight;
  }else{
    el?.remove();
  }
}
function aiChatPriceFromText(text){
  const s=String(text||"").toLowerCase();
  const m=s.match(/(?:dưới|duoi|tầm|tam|khoảng|khoang)?\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr|củ|cu)/i);
  if(!m) return null;
  return Math.round(Number(m[1].replace(",","."))*1000000);
}
function aiChatProductSnapshot(question){
  const q=normalizeSearchText(question);
  const tokens=q.split(" ").filter(x=>x.length>=2);
  const target=aiChatPriceFromText(question);
  const groups=groupItems(flattenProducts(PRODUCTS).filter(productMatchesMainCategory));

  return groups.map((group,index)=>{
    const variants=(group.variants||[]).filter(Boolean);
    const prices=variants.map(v=>Number(v.price||0)).filter(x=>x>0);
    const minPrice=prices.length?Math.min(...prices):0;
    const maxPrice=prices.length?Math.max(...prices):0;
    // V176: dùng CHÍNH biến thể mặc định mà card website đang dùng.
    // Card gọi getDefaultVariantForGroup(group), nên AI cũng phải dùng đúng biến thể đó.
    // Không cộng tồn của toàn bộ variants vì như vậy có thể lệch trạng thái card.
    const webVariant=getDefaultVariantForGroup(group);
    const stockQty=Math.max(0,Number(webVariant?.onHand||0));
    const inStock=Boolean(webVariant && stockQty>0);
    const name=String(group.name||"");
    const normalized=normalizeSearchText(name);
    let score=0;

    for(const t of tokens){
      if(normalized.includes(t)) score+=t.length>=5?5:2;
    }

    // Ưu tiên rất mạnh tên máy mà khách vừa gõ, kể cả thiếu chữ/sai nhẹ.
    const compactName=normalized.replace(/\s+/g,"");
    const compactQ=q.replace(/\s+/g,"");
    if(compactQ && (compactName.includes(compactQ) || compactQ.includes(compactName))) score+=40;
    const matchedTokens=tokens.filter(t=>normalized.includes(t));
    if(tokens.length>=2 && matchedTokens.length>=Math.ceil(tokens.length*.65)) score+=20;

    const brand=String(group.brand||variants[0]?.brand||"");
    if(brand&&q.includes(normalizeSearchText(brand))) score+=8;

    if(target&&minPrice){
      const delta=Math.abs(minPrice-target);
      score+=Math.max(0,10-delta/1000000);
      if(/dưới|duoi|không quá|khong qua/i.test(question)&&minPrice<=target) score+=7;
    }

    if(inStock) score+=1;

    // Khi câu hỏi chung, dùng thứ tự phổ biến hiện tại làm tie-break.
    score+=Math.max(0,2-index*.02);

    return {
      name,
      minPrice,
      maxPrice,
      inStock,
      stockStatus:inStock?"Còn hàng":"Hết hàng",
      stockQty,
      webVariantId:String(webVariant?.id||webVariant?.productId||""),
      webVariantName:String(webVariant?.name||webVariant?.fullName||""),
      brand,
      score
    };
  })
  .sort((a,b)=>b.score-a.score)
  .slice(0,14)
  .map(({score,...x})=>x);
}
async function aiChatAsk(question){
  const text=String(question||"").trim();
  if(!text||aiChatBusy) return;

  if(aiChatCustomerRequestsHuman(text)){
    aiChatAppend("user",text);
    aiChatAppend("assistant","Được, tôi chuyển bạn sang nhân viên tư vấn trực tiếp. Bấm nút Nhắn Zalo ngay bên dưới.");
    aiChatSetHumanHandoff(true,"Bạn đang muốn gặp nhân viên tư vấn trực tiếp. Bấm Nhắn Zalo ngay để mở cuộc trò chuyện với shop.");
    sendAnalytics("filter_click",{action:"ai_chat_human_requested"});
    return;
  }

  aiChatBusy=true;
  aiChatInput.disabled=true;
  aiChatSend.disabled=true;

  aiChatAppend("user",text);
  AI_CHAT_HISTORY.push({role:"user",text});
  if(AI_CHAT_HISTORY.length>10) AI_CHAT_HISTORY.splice(0,AI_CHAT_HISTORY.length-10);

  aiChatInput.value="";
  aiChatTyping(true);
  sendAnalytics("filter_click",{action:"ai_chat_question"});

  try{
    const r=await fetch("/api/ai-chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        message:text,
        products:aiChatProductSnapshot(text),
        history:AI_CHAT_HISTORY.slice(-6)
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||"AI chưa thể trả lời.");

    const reply=String(data.text||"").trim()||"AI chưa có câu trả lời phù hợp.";
    aiChatAppend("assistant",reply);
    AI_CHAT_HISTORY.push({role:"assistant",text:reply});
    if(aiChatNeedsHuman(reply)){
      aiChatSetHumanHandoff(true,"Phần này nên để nhân viên xác nhận trực tiếp cho chắc. Bạn có thể chuyển sang Zalo.");
    }
    if(AI_CHAT_HISTORY.length>10) AI_CHAT_HISTORY.splice(0,AI_CHAT_HISTORY.length-10);
  }catch(e){
    aiChatAppend("assistant",e.message||"AI đang bận. Bạn có thể nhờ nhân viên tư vấn trực tiếp.");
    aiChatSetHumanHandoff(true,"AI đang chưa xử lý được câu này. Chuyển sang nhân viên tư vấn trực tiếp trên Zalo.");
  }finally{
    aiChatTyping(false);
    aiChatBusy=false;
    aiChatInput.disabled=false;
    aiChatSend.disabled=false;
    // Mobile: không tự bật lại bàn phím sau khi AI trả lời.
    if(!window.matchMedia("(max-width:720px)").matches){
      aiChatInput.focus();
    }else{
      aiChatInput.blur();
    }
  }
}

zaloConsultBtn?.addEventListener("click",()=>{
  if(zaloConsultBtn.dataset.dragJustEnded==="1") return;
  aiChatOpen();
  aiChatAppend("assistant","Bạn cứ hỏi AI trước nha. Nếu cần xác nhận thêm, tôi sẽ đưa nút chuyển sang nhân viên tư vấn trực tiếp.");
});
aiChatClose?.addEventListener("click",aiChatHide);
aiChatForm?.addEventListener("submit",e=>{
  e.preventDefault();
  aiChatAsk(aiChatInput.value);
});
aiChatInput?.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){
    e.preventDefault();
    aiChatAsk(aiChatInput.value);
  }
});
aiChatSuggestions?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-ai-question]");
  if(btn) aiChatAsk(btn.dataset.aiQuestion||btn.textContent);
});

aiHumanZaloBtn?.addEventListener("click",()=>{
  sendAnalytics("zalo_click");
  sendAnalytics("filter_click",{action:"ai_chat_handoff_zalo"});
});


function aiChatAdjustForKeyboard(){
  if(!aiChatPanel || aiChatPanel.hidden) return;
  const vv=window.visualViewport;
  if(!vv) return;
  const isMobile=window.matchMedia("(max-width:720px)").matches;
  if(!isMobile) return;

  const keyboard=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);
  document.documentElement.style.setProperty("--ai-keyboard-offset",keyboard+"px");
  document.documentElement.style.setProperty("--ai-vv-height",vv.height+"px");
}
window.visualViewport?.addEventListener("resize",aiChatAdjustForKeyboard);
window.visualViewport?.addEventListener("scroll",aiChatAdjustForKeyboard);


aiMobileZaloDirect?.addEventListener("click",()=>{
  sendAnalytics("zalo_click");
  sendAnalytics("filter_click",{action:"ai_chat_mobile_direct_zalo"});
});



function setAiSupportPositionImportant(btn,x,y){
  if(!btn) return;
  btn.style.setProperty("left",Math.round(x)+"px","important");
  btn.style.setProperty("top",Math.round(y)+"px","important");
  btn.style.setProperty("right","auto","important");
  btn.style.setProperty("bottom","auto","important");
  btn.style.setProperty("transform","none","important");
}


function syncAiChatFloatLabel(){
  if(!aiChatFloatLabel || !zaloConsultBtn) return;

  if(!window.matchMedia("(max-width:720px)").matches){
    aiChatFloatLabel.style.display="none";
    return;
  }

  aiChatFloatLabel.style.display="flex";
  const r=zaloConsultBtn.getBoundingClientRect();
  const lw=aiChatFloatLabel.offsetWidth||92;
  const lh=aiChatFloatLabel.offsetHeight||30;

  const preferLeft = r.left > window.innerWidth/2;
  let left = preferLeft ? r.left-lw-8 : r.right+8;
  left=Math.max(8,Math.min(window.innerWidth-lw-8,left));

  let top=r.top+(r.height-lh)/2;
  top=Math.max(8,Math.min(window.innerHeight-lh-8,top));

  aiChatFloatLabel.style.left=Math.round(left)+"px";
  aiChatFloatLabel.style.top=Math.round(top)+"px";
}

/* V142 - Kéo thả nút hỗ trợ AI trên mobile */
(function initDraggableAiSupport(){
  const btn=zaloConsultBtn;
  if(!btn) return;

  const KEY="sdd-ai-round-pos-v2";
  let dragging=false;
  let moved=false;
  let startX=0,startY=0,startLeft=0,startTop=0;
  let pointerId=null;

  function isMobile(){
    return window.matchMedia("(max-width:720px)").matches;
  }

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }

  function applySaved(){
    if(!isMobile()) return;
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw){
        // Vị trí mặc định: mép phải, thấp vừa đủ để không che thanh điều hướng.
        const r=btn.getBoundingClientRect();
        setAiSupportPositionImportant(
          btn,
          Math.max(10,window.innerWidth-r.width-14),
          Math.max(90,window.innerHeight-r.height-110)
        );
        return;
      }
      const p=JSON.parse(raw);
      if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y)) return;

      const r=btn.getBoundingClientRect();
      const maxX=Math.max(8,window.innerWidth-r.width-8);
      const maxY=Math.max(8,window.innerHeight-r.height-8);

      setAiSupportPositionImportant(btn,clamp(p.x,8,maxX),clamp(p.y,8,maxY));
    }catch(_){}
  }

  function savePos(){
    if(!isMobile()) return;
    const r=btn.getBoundingClientRect();
    try{
      localStorage.setItem(KEY,JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)}));
    }catch(_){}
  }

  btn.addEventListener("pointerdown",e=>{
    if(!isMobile()) return;
    if(e.button!==undefined && e.button!==0) return;

    const r=btn.getBoundingClientRect();
    dragging=true;
    moved=false;
    pointerId=e.pointerId;
    startX=e.clientX;
    startY=e.clientY;
    startLeft=r.left;
    startTop=r.top;
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add("is-dragging");
  });

  btn.addEventListener("pointermove",e=>{
    if(!dragging || e.pointerId!==pointerId || !isMobile()) return;

    const dx=e.clientX-startX;
    const dy=e.clientY-startY;
    if(Math.abs(dx)+Math.abs(dy)>5) moved=true;
    if(!moved) return;

    e.preventDefault();
    const r=btn.getBoundingClientRect();
    const maxX=Math.max(8,window.innerWidth-r.width-8);
    const maxY=Math.max(8,window.innerHeight-r.height-8);

    setAiSupportPositionImportant(
      btn,
      clamp(startLeft+dx,8,maxX),
      clamp(startTop+dy,8,maxY)
    );
    syncAiChatFloatLabel();
  },{passive:false});

  function endDrag(e){
    if(!dragging) return;
    dragging=false;
    btn.classList.remove("is-dragging");
    try{ btn.releasePointerCapture?.(pointerId); }catch(_){}
    if(moved){
      savePos();
      setTimeout(()=>{snapAiSupportToEdge();syncAiChatFloatLabel();},40);
      // Chặn click phát sinh sau thao tác kéo.
      btn.dataset.dragJustEnded="1";
      setTimeout(()=>delete btn.dataset.dragJustEnded,180);
    }
    pointerId=null;
  }

  btn.addEventListener("pointerup",endDrag);
  btn.addEventListener("pointercancel",endDrag);

  btn.addEventListener("click",e=>{
    if(btn.dataset.dragJustEnded==="1"){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);

  window.addEventListener("resize",()=>setTimeout(()=>{applySaved();syncAiChatFloatLabel();},80));
  requestAnimationFrame(()=>{applySaved();setTimeout(syncAiChatFloatLabel,60);});
})();



function snapAiSupportToEdge(){
  const btn=zaloConsultBtn;
  if(!btn || !window.matchMedia("(max-width:720px)").matches) return;
  const r=btn.getBoundingClientRect();
  const margin=10;
  const targetLeft = r.left + r.width/2 < window.innerWidth/2
    ? margin
    : Math.max(margin,window.innerWidth-r.width-margin);
  const maxTop=Math.max(margin,window.innerHeight-r.height-margin);
  const targetTop=Math.max(margin,Math.min(maxTop,r.top));

  setAiSupportPositionImportant(btn,targetLeft,targetTop);

  try{
    localStorage.setItem("sdd-ai-support-pos-v1",JSON.stringify({
      x:Math.round(targetLeft),
      y:Math.round(targetTop)
    }));
  }catch(_){}
}



(function addAiDragHint(){
  if(!window.matchMedia("(max-width:720px)").matches) return;
  const btn=zaloConsultBtn;
  if(!btn) return;
  const KEY="sdd-ai-drag-hint-v1";
  try{
    if(localStorage.getItem(KEY)) return;
  }catch(_){}

  const hint=document.createElement("div");
  hint.className="ai-drag-hint";
  hint.textContent="Kéo để di chuyển";
  document.body.appendChild(hint);

  function place(){
    const r=btn.getBoundingClientRect();
    const w=hint.offsetWidth||110;
    let left=r.left+r.width/2-w/2;
    left=Math.max(8,Math.min(window.innerWidth-w-8,left));
    let top=r.top-42;
    if(top<8) top=r.bottom+10;
    hint.style.left=left+"px";
    hint.style.top=top+"px";
  }

  requestAnimationFrame(()=>{
    place();
    hint.classList.add("show");
  });

  setTimeout(()=>{
    hint.classList.remove("show");
    setTimeout(()=>hint.remove(),220);
    try{localStorage.setItem(KEY,"1");}catch(_){}
  },2600);
})();


window.addEventListener("load",()=>setTimeout(syncAiChatFloatLabel,150));
setTimeout(syncAiChatFloatLabel,500);

(function initChatNotifyDot(){
  const dot=document.querySelector(".ai-chat-notify-dot");
  if(!dot || !zaloConsultBtn) return;

  try{
    if(sessionStorage.getItem("sdd-chat-seen")==="1"){
      dot.style.display="none";
    }
  }catch(_){}

  zaloConsultBtn.addEventListener("click",()=>{
    try{sessionStorage.setItem("sdd-chat-seen","1");}catch(_){}
    dot.style.display="none";
  });
})();

aiChatInput?.addEventListener("pointerdown",()=>{
  aiChatInput.removeAttribute("readonly");
});
aiChatInput?.addEventListener("touchstart",()=>{
  aiChatInput.removeAttribute("readonly");
},{passive:true});

/* V153 - floating chat label + remove old header employee shortcut */
document.addEventListener("DOMContentLoaded",()=>{
  const oldEmployee=document.getElementById("aiMobileZaloDirect");
  if(oldEmployee) oldEmployee.remove();

  const label=document.getElementById("aiChatFloatLabel");
  if(label){
    label.textContent="Tư vấn ngay";
    label.setAttribute("aria-hidden","true");
  }
});


/* =========================================================
   V164 - Header interactions
   ========================================================= */
const sddMobileMenuBtn=document.getElementById("sddMobileMenuBtn");
const sddMobileDrawer=document.getElementById("sddMobileDrawer");
const sddMobileDrawerClose=document.getElementById("sddMobileDrawerClose");
const sddConsultAction=document.getElementById("sddConsultAction");
const sddNavConsultBtn=document.getElementById("sddNavConsultBtn");
const sddMobileConsultBtn=document.getElementById("sddMobileConsultBtn");
const sddNavCategoryBtn=document.getElementById("sddNavCategoryBtn");

function openSddMobileDrawer(){
  if(!sddMobileDrawer) return;
  sddMobileDrawer.hidden=false;
  document.documentElement.style.overflow="hidden";
}
function closeSddMobileDrawer(){
  if(!sddMobileDrawer) return;
  sddMobileDrawer.hidden=true;
  document.documentElement.style.overflow="";
}
sddMobileMenuBtn?.addEventListener("click",openSddMobileDrawer);
sddMobileDrawerClose?.addEventListener("click",closeSddMobileDrawer);
sddMobileDrawer?.addEventListener("click",e=>{
  if(e.target===sddMobileDrawer) closeSddMobileDrawer();
});
sddMobileDrawer?.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeSddMobileDrawer));

function openHeaderAiConsult(){
  try{
    if(typeof aiChatOpen==="function"){
      aiChatOpen();
      return;
    }
  }catch(_){}
  document.getElementById("zaloConsultBtn")?.click();
}
sddConsultAction?.addEventListener("click",openHeaderAiConsult);
sddNavConsultBtn?.addEventListener("click",openHeaderAiConsult);
sddMobileConsultBtn?.addEventListener("click",()=>{
  closeSddMobileDrawer();
  setTimeout(openHeaderAiConsult,80);
});

sddNavCategoryBtn?.addEventListener("click",()=>{
  document.getElementById("commerceCategoryBtn")?.click();
});

/* Search icon behaves like Enter/search: scroll to products after query */
document.querySelector(".sdd-search-submit")?.addEventListener("click",()=>{
  document.getElementById("searchInput")?.dispatchEvent(new Event("input",{bubbles:true}));
  document.getElementById("products")?.scrollIntoView({behavior:"smooth",block:"start"});
});



/* V188: normalize product stock badges by visible text */
(function(){
  function enhanceStockBadges(root){
    var scope=root || document;
    scope.querySelectorAll('.product-card button, .product-card span, .product-card div, .product-card a').forEach(function(el){
      if(el.children.length) return;
      var t=(el.textContent||'').trim().toLowerCase();
      if(t === 'còn hàng' || t === '✓ còn hàng' || t === '✔ còn hàng'){
        el.classList.add('stock-status','in-stock');
      } else if(t === 'hết hàng'){
        el.classList.add('stock-status','out-of-stock');
      }
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',function(){ enhanceStockBadges(document); });
  }else{
    enhanceStockBadges(document);
  }
  new MutationObserver(function(){ enhanceStockBadges(document); })
    .observe(document.documentElement,{childList:true,subtree:true});
})();
