
const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const onlyStock = { checked: false, addEventListener: ()=>{} };
const updatedAt = document.getElementById("updatedAt");
const darkMode = document.getElementById("darkMode");
const summary = document.getElementById("summary");
const categoryFilters = document.getElementById("categoryFilters");

const inlineProductDetail = document.getElementById("inlineProductDetail");


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
    ["Xiaomi", ["xiaomi", "redmi", "poco"]],
    ["Apple", ["iphone", "ipad", "apple"]],
    ["Samsung", ["samsung", "galaxy"]],
    ["OPPO", ["oppo", "oneplus", "realme"]],
    ["vivo", ["vivo", "iqoo"]],
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
        brand:detectBrand(fullName)
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
  const flat = flattenProducts(PRODUCTS);

  const brands = [...new Set(
    flat.map(p => p.brand).filter(Boolean)
  )]
  .filter(b => b !== "Khác")
  .sort((a,b)=>a.localeCompare(b,"vi"));

  const hasOther = flat.some(p => p.brand === "Khác");
  if(hasOther) brands.push("Khác");

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
      renderCategoryFilters();
      render();
    });

    categoryFilters.appendChild(btn);
  });
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

function render(){
  const q=searchInput.value.trim().toLowerCase();
  let items=flattenProducts(PRODUCTS);

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

  const groups=groupItems(items);
  grid.innerHTML="";

  const totalVariants=groups.reduce((sum,g)=>sum+g.items.length,0);
  summary.textContent=`${groups.length} mẫu • ${totalVariants} phiên bản`;

  if(!groups.length){
    grid.innerHTML='<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  groups.forEach(group=>{
    const variants=[...group.items];
    if(!variants.length) return;

    const defaultVariant=[...variants].sort((a,b)=>{
      const stockDiff=(b.onHand>0)-(a.onHand>0);
      if(stockDiff!==0) return stockDiff;
      return Number(a.price||0)-Number(b.price||0);
    })[0];

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

    body.append(title,price);
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


function openInlineProductDetail(group,initialVariant){
  if(!inlineProductDetail) return;

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
  backBtn.textContent="← Quay lại danh sách";
  backBtn.addEventListener("click",closeInlineProductDetail);

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
  info.append(infoBox);

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

  const lower=document.createElement("div");
  lower.className="detail-lower";

  const specs=document.createElement("section");
  specs.className="detail-specs";

  const specsTitle=document.createElement("div");
  specsTitle.className="detail-section-title";
  specsTitle.textContent="Thông tin phiên bản";

  const specsBody=document.createElement("div");
  specsBody.className="detail-specs-body";

  const rowBrand=document.createElement("div");
  rowBrand.className="detail-spec-row";
  rowBrand.innerHTML=`<span>Hãng</span><strong>${brand}</strong>`;

  const rowColors=document.createElement("div");
  rowColors.className="detail-spec-row";
  rowColors.innerHTML=`<span>Màu sắc</span><strong>${[...new Set(variants.map(v=>v.color).filter(Boolean))].join(", ") || "Đang cập nhật"}</strong>`;

  const rowMem=document.createElement("div");
  rowMem.className="detail-spec-row";
  rowMem.innerHTML=`<span>Dung lượng</span><strong>${[...new Set(variants.map(v=>v.memory).filter(Boolean))].join(", ") || "Đang cập nhật"}</strong>`;

  specsBody.append(rowBrand,rowColors,rowMem);
  specs.append(specsTitle,specsBody);

  const note=document.createElement("section");
  note.className="detail-note";
  const noteTitle=document.createElement("div");
  noteTitle.className="detail-section-title";
  noteTitle.textContent="Lưu ý";
  const noteBody=document.createElement("div");
  noteBody.className="detail-note-body";
  noteBody.textContent="Giá và tình trạng hàng được cập nhật thường xuyên. Vui lòng chọn đúng màu sắc và dung lượng để xem giá của từng phiên bản.";
  note.append(noteTitle,noteBody);

  lower.append(specs,note);

  shell.append(topbar,breadcrumb,heading,main,lower);
  inlineProductDetail.appendChild(shell);

  const colors=[...new Set(variants.map(v=>v.color).filter(Boolean))];
  const memories=[...new Set(variants.map(v=>v.memory).filter(Boolean))];
  const colorButtons=new Map();
  const memoryButtons=new Map();
  const stockText=infoBox.querySelector(".js-stock-text");

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
}

function closeInlineProductDetail(){
  if(!inlineProductDetail) return;

  inlineProductDetail.hidden=true;
  inlineProductDetail.innerHTML="";
  productGrid.hidden=false;

  document.body.classList.remove("detail-view-active");
  window.scrollTo({top:0,left:0,behavior:"auto"});
}


window.addEventListener("popstate",()=>{
  if(inlineProductDetail && !inlineProductDetail.hidden){
    inlineProductDetail.hidden=true;
    inlineProductDetail.innerHTML="";
    productGrid.hidden=false;
    document.body.classList.remove("detail-view-active");
    window.scrollTo({top:0,left:0,behavior:"auto"});
  }
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

    renderCategoryFilters();
    render();

  }catch(err){
    console.error(err);

    // Không xóa bảng đang hiển thị nếu lần refresh sau bị lỗi.
    if(PRODUCTS.length){
      updatedAt.textContent="Đang hiển thị dữ liệu gần nhất";
      return;
    }

    // Lần mở đầu tiên mà API lỗi thì thử cache trình duyệt.
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

// Nạp danh sách bán chạy gần nhất trước để tab mặc định hiển thị ngay.
loadBestSellerCache();

// Hiện cache sản phẩm ngay nếu có, rồi cập nhật nền.
if(loadProductCache()){
  updatedAt.textContent="Đang cập nhật...";
  renderCategoryFilters();
  render();
}

load();
loadBestSellers();
setInterval(load,60000);
setInterval(loadBestSellers,60*60*1000);

searchInput.addEventListener("input",render);
onlyStock.addEventListener("change",render);

clearSearch.addEventListener("click",()=>{
  searchInput.value="";
  searchInput.focus();
  render();
});

const savedTheme=localStorage.getItem("kv-theme");

if(savedTheme==="dark"){
  document.body.classList.add("dark");
  darkMode.checked=true;
}

darkMode.addEventListener("change",()=>{
  document.body.classList.toggle("dark",darkMode.checked);
  localStorage.setItem("kv-theme",darkMode.checked ? "dark" : "light");
});

