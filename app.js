
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

  const totalVariants=groups.reduce((sum,g)=>sum+g.items.length,0);
  summary.textContent=`${groups.length} mẫu • ${totalVariants} phiên bản`;

  if(!groups.length){
    grid.innerHTML='<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  groups.forEach(group=>{
    const card=document.createElement("article");
    card.className="product-card product-detail-card";

    const media=document.createElement("div");
    media.className="product-media";
    media.innerHTML=imageHTML(group);

    const body=document.createElement("div");
    body.className="product-body";

    const brandLine=document.createElement("div");
    brandLine.className="product-brand";
    brandLine.textContent=group.items[0]?.brand || "";

    const title=document.createElement("div");
    title.className="product-name";
    title.textContent=group.name;

    const prices = group.items.map(x=>Number(x.price||0)).filter(x=>x>0);
    const minPrice = prices.length ? Math.min(...prices) : 0;

    const price=document.createElement("div");
    price.className="main-price";
    price.textContent=money(minPrice);

    const hint=document.createElement("div");
    hint.className="variant-hint";
    hint.textContent="Chọn phiên bản:";

    const memories=[...new Set(group.items.map(x=>x.memory).filter(Boolean))];
    const colors=[...new Set(group.items.map(x=>x.color).filter(Boolean))];

    const selectors=document.createElement("div");
    selectors.className="selectors";

    if(colors.length){
      const row=document.createElement("div");
      row.className="selector-row";
      const label=document.createElement("div");
      label.className="selector-label";
      label.textContent="Màu sắc";

      const options=document.createElement("div");
      options.className="selector-options";

      colors.forEach(c=>{
        const chip=document.createElement("span");
        chip.className="option-chip";
        chip.textContent=c;
        options.appendChild(chip);
      });

      row.append(label,options);
      selectors.appendChild(row);
    }

    if(memories.length){
      const row=document.createElement("div");
      row.className="selector-row";
      const label=document.createElement("div");
      label.className="selector-label";
      label.textContent="Dung lượng";

      const options=document.createElement("div");
      options.className="selector-options";

      memories.forEach(m=>{
        const chip=document.createElement("span");
        chip.className="option-chip memory-chip";
        chip.textContent=m;
        options.appendChild(chip);
      });

      row.append(label,options);
      selectors.appendChild(row);
    }

    const stock=document.createElement("div");
    stock.className="detail-stock";
    stock.textContent=group.items.some(x=>x.onHand>0) ? "✓ Còn hàng" : "Hết hàng";

    const variants=document.createElement("div");
    variants.className="variant-price-list";

    group.items
      .sort((a,b)=>a.price-b.price)
      .forEach(v=>{
        const row=document.createElement("div");
        row.className="variant-price-row";

        const info=document.createElement("div");
        info.className="variant-desc";
        info.textContent=[v.color,v.memory].filter(Boolean).join(" • ") || "Phiên bản";

        const p=document.createElement("div");
        p.className="variant-row-price";
        p.textContent=money(v.price);

        row.append(info,p);
        variants.appendChild(row);
      });

    body.append(brandLine,title,price,hint,selectors,stock,variants);
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
