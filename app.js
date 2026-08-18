
const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const onlyStock = document.getElementById("onlyStock");
const updatedAt = document.getElementById("updatedAt");
const darkMode = document.getElementById("darkMode");
const summary = document.getElementById("summary");
const categoryFilters = document.getElementById("categoryFilters");

let PRODUCTS = [];
let ACTIVE_CATEGORY = "Tất cả";

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
  const brands = [...new Set(
    flattenProducts(PRODUCTS)
      .map(p => p.brand)
      .filter(Boolean)
  )]
  .filter(b => b !== "Khác")
  .sort((a,b)=>a.localeCompare(b,"vi"));

  const hasOther = flattenProducts(PRODUCTS).some(p => p.brand === "Khác");
  if(hasOther) brands.push("Khác");

  const all = ["Tất cả", ...brands];

  if(ACTIVE_CATEGORY !== "Tất cả" && !brands.includes(ACTIVE_CATEGORY)){
    ACTIVE_CATEGORY = "Tất cả";
  }

  categoryFilters.innerHTML = "";

  all.forEach(brand=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="category-btn" + (brand===ACTIVE_CATEGORY ? " active" : "");
    btn.textContent=brand;

    btn.addEventListener("click",()=>{
      ACTIVE_CATEGORY=brand;
      renderCategoryFilters();
      render();
    });

    categoryFilters.appendChild(btn);
  });
}

function render(){
  const q=searchInput.value.trim().toLowerCase();
  let items=flattenProducts(PRODUCTS);

  if(onlyStock.checked){
    items=items.filter(x=>x.onHand>0);
  }

  if(ACTIVE_CATEGORY!=="Tất cả"){
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

  const visibleGroups=groups.filter(g=>{
    if(!onlyStock.checked) return true;
    return g.items.some(v=>Number(v.onHand||0)>0);
  });

  const totalVariants=visibleGroups.reduce((sum,g)=>{
    const variants=onlyStock.checked
      ? g.items.filter(v=>Number(v.onHand||0)>0)
      : g.items;
    return sum+variants.length;
  },0);

  summary.textContent=`${visibleGroups.length} mẫu • ${totalVariants} phiên bản`;

  if(!visibleGroups.length){
    grid.innerHTML='<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  visibleGroups.forEach(group=>{
    const selectableVariants=onlyStock.checked
      ? group.items.filter(v=>Number(v.onHand||0)>0)
      : [...group.items];

    const sorted=[...selectableVariants].sort((a,b)=>{
      const stockDiff=(b.onHand>0)-(a.onHand>0);
      if(stockDiff!==0) return stockDiff;
      return Number(a.price||0)-Number(b.price||0);
    });

    const defaultVariant=sorted[0]||null;

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

    const specs=document.createElement("div");
    specs.className="shop-specs";

    const chips=[];
    if(defaultVariant?.memory) chips.push(defaultVariant.memory);
    if(defaultVariant?.color) chips.push(defaultVariant.color);

    chips.forEach(x=>{
      const chip=document.createElement("span");
      chip.className="shop-chip";
      chip.textContent=x;
      specs.appendChild(chip);
    });

    const price=document.createElement("div");
    price.className="shop-price";
    price.textContent=defaultVariant ? money(defaultVariant.price) : "Liên hệ";

    const buy=document.createElement("button");
    buy.className="buy-btn";
    buy.type="button";
    buy.textContent="XEM PHIÊN BẢN";

    const status=document.createElement("div");
    status.className="shop-status";
    status.textContent=defaultVariant?.onHand>0 ? "✓ Còn hàng" : "Hết hàng";

    const variants=document.createElement("div");
    variants.className="quick-variants";

    // Chỉ hiện tối đa 4 biến thể để card gọn giống trang mẫu.
    sorted.slice(0,4).forEach(v=>{
      const row=document.createElement("button");
      row.type="button";
      row.className="quick-variant";

      const left=document.createElement("span");
      left.textContent=[v.color,v.memory].filter(Boolean).join(" • ") || "Phiên bản";

      const right=document.createElement("strong");
      right.textContent=money(v.price);

      row.append(left,right);

      row.addEventListener("click",()=>{
        price.textContent=money(v.price);
        status.textContent=v.onHand>0 ? "✓ Còn hàng" : "Hết hàng";

        specs.innerHTML="";
        [v.memory,v.color].filter(Boolean).forEach(x=>{
          const chip=document.createElement("span");
          chip.className="shop-chip";
          chip.textContent=x;
          specs.appendChild(chip);
        });

        variants.querySelectorAll(".quick-variant").forEach(el=>el.classList.remove("active"));
        row.classList.add("active");
      });

      variants.appendChild(row);
    });

    if(variants.firstElementChild){
      variants.firstElementChild.classList.add("active");
    }

    buy.addEventListener("click",()=>{
      variants.classList.toggle("open");
      buy.textContent=variants.classList.contains("open")
        ? "ẨN PHIÊN BẢN"
        : "XEM PHIÊN BẢN";
    });

    body.append(title,specs,price,buy,status,variants);
    card.append(media,body);
    grid.appendChild(card);
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
