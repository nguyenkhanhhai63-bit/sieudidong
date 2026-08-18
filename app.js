
const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const onlyStock = { checked: false, addEventListener: ()=>{} };
const updatedAt = document.getElementById("updatedAt");
const darkMode = document.getElementById("darkMode");
const summary = document.getElementById("summary");
const categoryFilters = document.getElementById("categoryFilters");

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
let ACTIVE_CATEGORY = "Bán chạy";

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
    "Đen","Trắng","Xanh","Đỏ","Hồng","Tím","Bạc","Titan",
    "Cam","Vàng","Green","Blue","Black","White","Silver"
  ];

  const text = String(name || "");

  for(const c of colors){
    const re = new RegExp(`(?:^|\\s-\\s)${c}(?:\\s-\\s|$)`,"i");
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

function flattenProducts(raw){
  const items=[];

  raw.forEach(p=>{
    (p.variants || []).forEach(v=>{
      const attrs = Array.isArray(v.attributes) && v.attributes.length
        ? v.attributes
        : (p.attributes || []);

      const fullName = v.name || p.name || "";

      items.push({
        id:v.id || p.id,
        fullName,
        baseName:cleanBaseName(fullName),
        memory:getMemory(attrs, fullName),
        color:getColor(attrs, fullName),
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
    ...(BEST_SELLER_READY ? ["Bán chạy"] : []),
    "Tất cả",
    ...brands
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
  if(ACTIVE_CATEGORY==="Bán chạy" && !BEST_SELLER_READY){
    grid.innerHTML='<div class="loading">Đang tải sản phẩm bán chạy...</div>';
    summary.textContent="";
    return;
  }

  const q=searchInput.value.trim().toLowerCase();
  let items=flattenProducts(PRODUCTS);

  // Không lọc bỏ toàn bộ sản phẩm hết hàng ở đây.
  // Khi bật "Chỉ hiện hàng còn tồn":
  // - sản phẩm còn hàng: chỉ hiện các biến thể còn hàng
  // - sản phẩm hết toàn bộ: vẫn giữ card và báo "Hết hàng"
  

  if(ACTIVE_CATEGORY==="Bán chạy"){
    const rank = new Map(
      BEST_SELLER_PRODUCT_IDS.map((id,index)=>[Number(id),index])
    );

    items = items
      .filter(x=>rank.has(Number(x.id)))
      .sort((a,b)=>rank.get(Number(a.id))-rank.get(Number(b.id)));
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

  // Luôn hiển thị tất cả model đang kinh doanh, kể cả hết hàng.
  const visibleGroups=[...groups];

  const totalVariants=visibleGroups.reduce((sum,g)=>sum+g.items.length,0);

  summary.textContent=`${visibleGroups.length} mẫu • ${totalVariants} phiên bản`;

  if(!visibleGroups.length){
    grid.innerHTML='<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  visibleGroups.forEach(group=>{
    const inStockVariants=group.items.filter(v=>Number(v.onHand||0)>0);
    const isProductOutOfStock=inStockVariants.length===0;

    // Nếu model còn ít nhất 1 biến thể có hàng và checkbox đang bật,
    // chỉ hiện các biến thể còn hàng.
    // Nếu model hết toàn bộ, vẫn dùng toàn bộ biến thể để hiện thông tin + báo Hết hàng.
    const variants=[...group.items];

    if(!variants.length) return;

    const sorted=[...variants].sort((a,b)=>{
      const stockDiff=(b.onHand>0)-(a.onHand>0);
      if(stockDiff!==0) return stockDiff;
      return Number(a.price||0)-Number(b.price||0);
    });

    let selected=sorted[0];
    let selectedColor=selected?.color || "";
    let selectedMemory=selected?.memory || "";

    const card=document.createElement("article");
    card.className="shop-card";

    const media=document.createElement("div");
    media.className="shop-media";
    media.innerHTML=imageHTML(group);

    const body=document.createElement("div");
    body.className="shop-body";

    const title=document.createElement("div");
    title.className="shop-title";
    title.textContent=group.name;

    const groupBestSeller=group.items.some(v=>
      BEST_SELLER_PRODUCT_IDS.includes(Number(v.id))
    );
    if(groupBestSeller){
      const badge=document.createElement("span");
      badge.className="best-seller-badge";
      badge.textContent="BÁN CHẠY";
      body.appendChild(badge);
    }

    const attributeArea=document.createElement("div");
    attributeArea.className="shop-attributes";

    const colorRow=document.createElement("div");
    colorRow.className="shop-attr-row";

    const colorLabel=document.createElement("div");
    colorLabel.className="shop-attr-label";
    colorLabel.textContent="Màu";

    const colorOptions=document.createElement("div");
    colorOptions.className="shop-attr-options";

    const memoryRow=document.createElement("div");
    memoryRow.className="shop-attr-row";

    const memoryLabel=document.createElement("div");
    memoryLabel.className="shop-attr-label";
    memoryLabel.textContent="Dung lượng";

    const memoryOptions=document.createElement("div");
    memoryOptions.className="shop-attr-options";

    const uniqueColors=[...new Set(variants.map(v=>v.color).filter(Boolean))];
    const uniqueMemories=[...new Set(variants.map(v=>v.memory).filter(Boolean))];

    const colorButtons=new Map();
    const memoryButtons=new Map();

    function pickVariant(){
      let matches=variants.filter(v=>{
        const colorOk=!selectedColor || v.color===selectedColor;
        const memoryOk=!selectedMemory || v.memory===selectedMemory;
        return colorOk && memoryOk;
      });

      if(!matches.length && selectedColor){
        matches=variants.filter(v=>v.color===selectedColor);
      }

      if(!matches.length && selectedMemory){
        matches=variants.filter(v=>v.memory===selectedMemory);
      }

      if(!matches.length){
        matches=[...variants];
      }

      matches.sort((a,b)=>{
        const stockDiff=(b.onHand>0)-(a.onHand>0);
        if(stockDiff!==0) return stockDiff;
        return Number(a.price||0)-Number(b.price||0);
      });

      return matches[0] || null;
    }

    const price=document.createElement("div");
    price.className="shop-price";

    const status=document.createElement("div");
    status.className="shop-status" + (isProductOutOfStock ? " out" : "");

    const buy=document.createElement("button");
    buy.className="buy-btn";
    buy.type="button";
    buy.textContent=isProductOutOfStock ? "HẾT HÀNG" : "CÒN HÀNG";

    const variantsList=document.createElement("div");
    variantsList.className="quick-variants";

    function updateAvailableButtons(){
      memoryButtons.forEach((btn,mem)=>{
        const exists=variants.some(v=>{
          const colorOk=!selectedColor || v.color===selectedColor;
          return colorOk && v.memory===mem;
        });
        btn.classList.toggle("disabled",!exists);
      });

      colorButtons.forEach((btn,color)=>{
        const exists=variants.some(v=>{
          const memOk=!selectedMemory || v.memory===selectedMemory;
          return memOk && v.color===color;
        });
        btn.classList.toggle("disabled",!exists);
      });
    }

    function renderVariantList(){
      variantsList.innerHTML="";

      variants.forEach(v=>{
        const row=document.createElement("button");
        row.type="button";
        row.className="quick-variant";

        if(selected && v.id===selected.id){
          row.classList.add("active");
        }

        const left=document.createElement("span");
        left.textContent=[v.color,v.memory].filter(Boolean).join(" • ") || "Phiên bản";

        const right=document.createElement("strong");
        right.textContent=money(v.price);

        row.append(left,right);

        row.addEventListener("click",()=>{
          selected=v;
          selectedColor=v.color || "";
          selectedMemory=v.memory || "";
          updateUI();
        });

        variantsList.appendChild(row);
      });
    }

    function updateUI(){
      selected=pickVariant();

      if(selected){
        selectedColor=selected.color || selectedColor;
        selectedMemory=selected.memory || selectedMemory;

        price.textContent=money(selected.price);
        const selectedInStock=Number(selected.onHand||0)>0;
        status.textContent=selectedInStock ? "✓ Còn hàng" : "Hết hàng";
        status.classList.toggle("out", !selectedInStock);

        buy.textContent=selectedInStock ? "CÒN HÀNG" : "HẾT HÀNG";
        buy.classList.toggle("out-of-stock", !selectedInStock);
      }else{
        price.textContent="Liên hệ";
        status.textContent="";
      }

      colorButtons.forEach((btn,color)=>{
        btn.classList.toggle("active",color===selectedColor);
      });

      if(typeof colorNote!=="undefined"){
        colorNote.textContent=selectedColor ? `(${selectedColor})` : "";
      }

      memoryButtons.forEach((btn,mem)=>{
        btn.classList.toggle("active",mem===selectedMemory);
      });

      updateAvailableButtons();
      renderVariantList();
    }

    const colorNote=document.createElement("span");
    colorNote.className="color-note";

    uniqueColors.forEach(color=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="color-swatch";
      btn.setAttribute("aria-label",color);
      btn.title=color;

      const dot=document.createElement("span");
      dot.className="color-swatch-dot";
      dot.style.background=colorHex(color);

      btn.appendChild(dot);

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

    colorOptions.appendChild(colorNote);

    uniqueMemories.forEach(mem=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="shop-attr-btn";
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

    if(uniqueColors.length){
      colorRow.append(colorLabel,colorOptions);
      attributeArea.appendChild(colorRow);
    }

    if(uniqueMemories.length){
      memoryRow.append(memoryLabel,memoryOptions);
      attributeArea.appendChild(memoryRow);
    }

    buy.addEventListener("click",()=>{
      variantsList.classList.toggle("open");
    });

    body.append(title,attributeArea,price,buy,status,variantsList);
    card.append(media,body);
    grid.appendChild(card);

    updateUI();
  });
}
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

