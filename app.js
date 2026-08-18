
const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const onlyStock = document.getElementById("onlyStock");
const updatedAt = document.getElementById("updatedAt");
const darkMode = document.getElementById("darkMode");
const summary = document.getElementById("summary");

let PRODUCTS = [];

function money(v){
  return new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + " đ";
}

function cleanBaseName(name){
  let s = String(name || "").trim();

  s = s.replace(/\s*-\s*\d+\s*\/\s*(?:\d+|1T|2T)\s*$/i, "");
  s = s.replace(/\s*-\s*(Đen|Trắng|Xanh|Đỏ|Hồng|Tím|Bạc|Titan|Cam|Vàng|Green|Blue|Black|White|Silver)\s*$/i, "");

  return s.trim();
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

function flattenProducts(raw){
  const items=[];

  raw.forEach(p=>{
    (p.variants || []).forEach(v=>{
      items.push({
        id:v.id || p.id,
        fullName:v.name || p.name || "",
        baseName:cleanBaseName(v.name || p.name || ""),
        memory:extractMemory(v.name || p.name || ""),
        color:extractColor(v.name || p.name || ""),
        price:Number(v.price || 0),
        onHand:Number(v.onHand || 0),
        image:v.image || p.image || ""
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
        items:[]
      });
    }

    const group=map.get(key);

    if(!group.image && item.image){
      group.image=item.image;
    }

    group.items.push(item);
  });

  return [...map.values()]
    .sort((a,b)=>a.name.localeCompare(b.name,"vi"));
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
  const parts=[v.color,v.memory].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Phiên bản";
}

function render(){
  const q=searchInput.value.trim().toLowerCase();
  let items=flattenProducts(PRODUCTS);

  if(onlyStock.checked){
    items=items.filter(x=>x.onHand>0);
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
    card.className="product-card";

    const media=document.createElement("div");
    media.className="product-media";
    media.innerHTML=imageHTML(group);

    const body=document.createElement("div");
    body.className="product-body";

    const title=document.createElement("div");
    title.className="product-name";
    title.textContent=group.name;

    const variants=document.createElement("div");
    variants.className="variant-list";

    group.items
      .sort((a,b)=>{
        if(a.memory!==b.memory) return a.memory.localeCompare(b.memory,"vi");
        return a.fullName.localeCompare(b.fullName,"vi");
      })
      .forEach(v=>{
        const row=document.createElement("div");
        row.className="variant";

        const info=document.createElement("div");
        info.className="variant-info";

        const main=document.createElement("div");
        main.className="variant-main";
        main.textContent=variantLabel(v);

        const stock=document.createElement("div");
        stock.className="stock" + (v.onHand>0 ? " in" : "");
        stock.textContent=v.onHand>0 ? "Còn hàng" : "Hết hàng";

        info.append(main,stock);

        const price=document.createElement("div");
        price.className="price";
        price.textContent=money(v.price);

        row.append(info,price);
        variants.appendChild(row);
      });

    body.append(title,variants);
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
    render();

  }catch(err){
    console.error(err);
    updatedAt.textContent="Không thể cập nhật";
    grid.innerHTML='<div class="empty">Không tải được dữ liệu KiotViet.</div>';
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
