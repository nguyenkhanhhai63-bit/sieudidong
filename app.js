
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

  const visibleGroups = groups.filter(g =>
    !onlyStock.checked || g.items.some(v => Number(v.onHand || 0) > 0)
  );
  const totalVariants = visibleGroups.reduce((sum,g)=>{
    const variants = onlyStock.checked
      ? g.items.filter(v => Number(v.onHand || 0) > 0)
      : g.items;
    return sum + variants.length;
  },0);
  summary.textContent=`${visibleGroups.length} mẫu • ${totalVariants} phiên bản`;

  if(!groups.length){
    grid.innerHTML='<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  groups.forEach(group=>{
    const selectableVariants = onlyStock.checked
      ? group.items.filter(v => Number(v.onHand || 0) > 0)
      : [...group.items];

    // Nếu đang bật "Chỉ hiện hàng còn tồn" và model không còn biến thể nào có hàng,
    // ẩn luôn toàn bộ model.
    if(!selectableVariants.length) return;

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

    // Chọn biến thể mặc định: ưu tiên còn hàng, sau đó giá thấp nhất.
    const sortedVariants=[...selectableVariants].sort((a,b)=>{
      const stockDiff=(b.onHand>0)-(a.onHand>0);
      if(stockDiff!==0) return stockDiff;
      return Number(a.price||0)-Number(b.price||0);
    });

    let selectedVariant=sortedVariants[0] || null;
    let selectedColor=selectedVariant?.color || "";
    let selectedMemory=selectedVariant?.memory || "";

    const price=document.createElement("div");
    price.className="main-price";

    const selectedInfo=document.createElement("div");
    selectedInfo.className="selected-info";

    const hint=document.createElement("div");
    hint.className="variant-hint";
    hint.textContent="Chọn phiên bản:";

    const selectors=document.createElement("div");
    selectors.className="selectors";

    const colors=[...new Set(selectableVariants.map(x=>x.color).filter(Boolean))];
    const memories=[...new Set(selectableVariants.map(x=>x.memory).filter(Boolean))];

    const colorOptions=new Map();
    const memoryOptions=new Map();

    function findBestVariant(){
      // Khớp chính xác cả màu + dung lượng nếu có.
      let matches=selectableVariants.filter(v=>{
        const colorOk=!selectedColor || v.color===selectedColor;
        const memoryOk=!selectedMemory || v.memory===selectedMemory;
        return colorOk && memoryOk;
      });

      // Nếu tổ hợp không tồn tại, giữ lựa chọn vừa click và tìm biến thể gần nhất.
      if(!matches.length && selectedColor){
        matches=selectableVariants.filter(v=>v.color===selectedColor);
      }
      if(!matches.length && selectedMemory){
        matches=selectableVariants.filter(v=>v.memory===selectedMemory);
      }
      if(!matches.length){
        matches=[...selectableVariants];
      }

      return matches.sort((a,b)=>{
        const stockDiff=(b.onHand>0)-(a.onHand>0);
        if(stockDiff!==0) return stockDiff;
        return Number(a.price||0)-Number(b.price||0);
      })[0] || null;
    }

    function updateAvailability(){
      // Với màu đang chọn, chỉ enable dung lượng có tổ hợp thật.
      memoryOptions.forEach((chip,mem)=>{
        const exists=selectableVariants.some(v=>{
          const colorOk=!selectedColor || v.color===selectedColor;
          return colorOk && v.memory===mem;
        });
        chip.classList.toggle("disabled",!exists);
      });

      // Với dung lượng đang chọn, chỉ enable màu có tổ hợp thật.
      colorOptions.forEach((chip,color)=>{
        const exists=selectableVariants.some(v=>{
          const memOk=!selectedMemory || v.memory===selectedMemory;
          return memOk && v.color===color;
        });
        chip.classList.toggle("disabled",!exists);
      });
    }

    function updateSelectedUI(){
      selectedVariant=findBestVariant();

      if(selectedVariant){
        selectedColor=selectedVariant.color || selectedColor;
        selectedMemory=selectedVariant.memory || selectedMemory;

        price.textContent=money(selectedVariant.price);

        selectedInfo.textContent=[
          selectedVariant.color ? `Màu: ${selectedVariant.color}` : "",
          selectedVariant.memory ? `Dung lượng: ${selectedVariant.memory}` : "",
          selectedVariant.onHand>0 ? "Còn hàng" : "Hết hàng"
        ].filter(Boolean).join(" • ");
      }else{
        price.textContent="Liên hệ";
        selectedInfo.textContent="";
      }

      colorOptions.forEach((chip,color)=>{
        chip.classList.toggle("active",color===selectedColor);
      });

      memoryOptions.forEach((chip,mem)=>{
        chip.classList.toggle("active",mem===selectedMemory);
      });

      updateAvailability();
    }

    if(colors.length){
      const row=document.createElement("div");
      row.className="selector-row";

      const label=document.createElement("div");
      label.className="selector-label";
      label.textContent="Màu sắc";

      const options=document.createElement("div");
      options.className="selector-options";

      colors.forEach(c=>{
        const chip=document.createElement("button");
        chip.type="button";
        chip.className="option-chip";
        chip.textContent=c;

        chip.addEventListener("click",()=>{
          if(chip.classList.contains("disabled")) return;
          selectedColor=c;

          // Nếu dung lượng hiện tại không có với màu mới, tự chọn dung lượng đầu tiên phù hợp.
          const compatible=selectableVariants.filter(v=>v.color===selectedColor);
          if(selectedMemory && !compatible.some(v=>v.memory===selectedMemory)){
            selectedMemory=compatible.find(v=>v.memory)?.memory || "";
          }

          updateSelectedUI();
        });

        colorOptions.set(c,chip);
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
        const chip=document.createElement("button");
        chip.type="button";
        chip.className="option-chip memory-chip";
        chip.textContent=m;

        chip.addEventListener("click",()=>{
          if(chip.classList.contains("disabled")) return;
          selectedMemory=m;

          // Nếu màu hiện tại không có với dung lượng mới, tự chọn màu đầu tiên phù hợp.
          const compatible=selectableVariants.filter(v=>v.memory===selectedMemory);
          if(selectedColor && !compatible.some(v=>v.color===selectedColor)){
            selectedColor=compatible.find(v=>v.color)?.color || "";
          }

          updateSelectedUI();
        });

        memoryOptions.set(m,chip);
        options.appendChild(chip);
      });

      row.append(label,options);
      selectors.appendChild(row);
    }

    const stock=document.createElement("div");
    stock.className="detail-stock";

    function updateStock(){
      if(selectedVariant){
        stock.textContent=selectedVariant.onHand>0 ? "✓ Còn hàng" : "Hết hàng";
        stock.classList.toggle("out",!(selectedVariant.onHand>0));
      }else{
        stock.textContent="";
      }
    }

    const originalUpdateSelectedUI=updateSelectedUI;
    updateSelectedUI=()=>{
      originalUpdateSelectedUI();
      updateStock();
    };

    body.append(
      brandLine,
      title,
      price,
      selectedInfo,
      hint,
      selectors,
      stock
    );

    card.append(media,body);
    grid.appendChild(card);

    updateSelectedUI();
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
