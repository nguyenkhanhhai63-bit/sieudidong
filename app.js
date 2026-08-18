
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

  // Bỏ dung lượng ở cuối, ví dụ - 12/256
  s = s.replace(/\s*-\s*\d+\s*\/\s*\d+\s*$/i, "");

  // Bỏ màu ở cuối
  s = s.replace(/\s*-\s*(Đen|Trắng|Xanh|Đỏ|Hồng|Tím|Bạc|Titan|Cam|Vàng|Green|Blue|Black|White|Silver)\s*$/i, "");

  return s.trim();
}

function extractMemory(name, code){
  const text = `${name || ""} ${code || ""}`;
  const m = text.match(/(\d+)\s*\/\s*(\d+|1T|2T)/i);
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
  const items = [];

  raw.forEach(p => {
    (p.variants || []).forEach(v => {
      items.push({
        id: v.id || p.id,
        code: v.code || p.code || "",
        fullName: v.name || p.name || "",
        baseName: cleanBaseName(v.name || p.name || ""),
        memory: extractMemory(v.name || p.name, v.code || p.code),
        color: extractColor(v.name || p.name),
        price: Number(v.price || 0),
        onHand: Number(v.onHand || 0)
      });
    });
  });

  return items;
}

function groupItems(items){
  const map = new Map();

  items.forEach(item => {
    const key = item.baseName || item.fullName;
    if(!map.has(key)){
      map.set(key, { name:key, items:[] });
    }
    map.get(key).items.push(item);
  });

  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"vi"));
}

function render(){
  const q = searchInput.value.trim().toLowerCase();
  let items = flattenProducts(PRODUCTS);

  if(onlyStock.checked){
    items = items.filter(x => x.onHand > 0);
  }

  if(q){
    items = items.filter(x =>
      x.fullName.toLowerCase().includes(q) ||
      x.baseName.toLowerCase().includes(q) ||
      x.code.toLowerCase().includes(q)
    );
  }

  const groups = groupItems(items);
  grid.innerHTML = "";

  const totalVariants = groups.reduce((s,g)=>s+g.items.length,0);
  summary.textContent = `${groups.length} mẫu • ${totalVariants} phiên bản`;

  if(!groups.length){
    grid.innerHTML = '<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  groups.forEach(group => {
    const card = document.createElement("article");
    card.className = "product-group";

    const head = document.createElement("div");
    head.className = "group-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "group-title-wrap";
    titleWrap.innerHTML = `
      <div class="group-title">${group.name}</div>
      <div class="group-meta">${group.items.length} phiên bản</div>
    `;

    const chevron = document.createElement("div");
    chevron.className = "chevron";
    chevron.textContent = "⌄";

    head.append(titleWrap, chevron);
    head.addEventListener("click",()=>card.classList.toggle("collapsed"));

    const body = document.createElement("div");
    body.className = "group-body";

    group.items
      .sort((a,b)=>{
        if(a.memory !== b.memory) return a.memory.localeCompare(b.memory,"vi");
        return a.fullName.localeCompare(b.fullName,"vi");
      })
      .forEach(v => {
        const row = document.createElement("div");
        row.className = "variant-row";

        const desc = [v.color, v.memory].filter(Boolean).join(" • ") || v.fullName;

        row.innerHTML = `
          <div class="variant-cell variant-name">
            <div>${desc}</div>
            <div class="code">${v.code}</div>
          </div>
          <div class="variant-cell memory-wrap">
            ${v.memory ? `<span class="memory">${v.memory}</span>` : ""}
          </div>
          <div class="variant-cell stock ${v.onHand > 0 ? "in" : ""}">
            ${v.onHand > 0 ? "Còn hàng" : "Hết hàng"}
          </div>
          <div class="variant-cell price">${money(v.price)}</div>
        `;

        body.appendChild(row);
      });

    card.append(head,body);
    grid.appendChild(card);
  });
}

async function load(){
  try{
    const res = await fetch("/api/products", { cache:"no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    PRODUCTS = data.products || [];

    updatedAt.textContent = "Cập nhật lúc " + new Date().toLocaleTimeString("vi-VN");
    render();
  }catch(err){
    console.error(err);
    updatedAt.textContent = "Không thể cập nhật";
    grid.innerHTML = '<div class="empty">Không tải được dữ liệu KiotViet.</div>';
  }
}

searchInput.addEventListener("input",render);
onlyStock.addEventListener("change",render);
clearSearch.addEventListener("click",()=>{
  searchInput.value="";
  searchInput.focus();
  render();
});

const savedTheme = localStorage.getItem("kv-theme");
if(savedTheme === "dark"){
  document.body.classList.add("dark");
  darkMode.checked = true;
}
darkMode.addEventListener("change",()=>{
  document.body.classList.toggle("dark",darkMode.checked);
  localStorage.setItem("kv-theme",darkMode.checked ? "dark" : "light");
});

load();
setInterval(load,60000);
