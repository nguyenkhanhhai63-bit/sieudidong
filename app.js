
const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const onlyStock = { checked: false, addEventListener: ()=>{} };
const updatedAt = document.getElementById("updatedAt");
const darkMode = document.getElementById("darkMode");
const summary = document.getElementById("summary");
const categoryFilters = document.getElementById("categoryFilters");

let PRODUCTS = [];
let ACTIVE_CATEGORY = "Bán chạy";

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
        brand:detectBrand(fullName),
        bestSeller:Boolean(v.bestSeller || p.bestSeller),
        sold30d:Number(v.sold30d || p.sold30d || 0)
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

  const hasBestSeller = flat.some(p => p.bestSeller);
  const all = [
    ...(hasBestSeller ? ["Bán chạy"] : []),
    "Tất cả",
    ...brands
  ];

  if(!all.includes(ACTIVE_CATEGORY)){
    ACTIVE_CATEGORY = hasBestSeller ? "Bán chạy" : "Tất cả";
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

function render(){
  const q=searchInput.value.trim().toLowerCase();
  let items=flattenProducts(PRODUCTS);

  // Không lọc bỏ toàn bộ sản phẩm hết hàng ở đây.
  // Khi bật "Chỉ hiện hàng còn tồn":
  // - sản phẩm còn hàng: chỉ hiện các biến thể còn hàng
  // - sản phẩm hết toàn bộ: vẫn giữ card và báo "Hết hàng"
  

  if(ACTIVE_CATEGORY==="Bán chạy"){
    items=items.filter(x=>x.bestSeller);
    items.sort((a,b)=>Number(b.sold30d||0)-Number(a.sold30d||0));
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

    const groupBestSeller=group.items.some(v=>v.bestSeller);
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
    const res=await fetch("/api/products",{cache:"no-store"});

    if(!res.ok){
      throw new Error("HTTP "+res.status);
    }

    const data=await res.json();
    PRODUCTS=data.products || [];

    updatedAt.textContent="Cập nhật lúc "+new Date().toLocaleTimeString("vi-VN");

    renderCategoryFilters();
    render();

  }catch(err){
    console.error(err);
    updatedAt.textContent="Không thể cập nhật";
    grid.innerHTML='<div class="empty">Không tải được bảng giá. Vui lòng thử lại sau.</div>';
  }
}

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

load();
setInterval(load,60000);
