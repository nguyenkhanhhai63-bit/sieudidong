
const grid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const onlyStock = document.getElementById("onlyStock");
const updatedAt = document.getElementById("updatedAt");
const darkMode = document.getElementById("darkMode");

let PRODUCTS = [];

function money(v){
  return new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + " đ";
}

function render(){
  const q = searchInput.value.trim().toLowerCase();

  const filtered = PRODUCTS
    .map(p => ({
      ...p,
      variants: (p.variants || []).filter(v => {
        const stockOk = !onlyStock.checked || Number(v.onHand || 0) > 0;
        const searchOk = !q ||
          String(p.name || "").toLowerCase().includes(q) ||
          String(p.code || "").toLowerCase().includes(q) ||
          String(v.name || "").toLowerCase().includes(q);
        return stockOk && searchOk;
      })
    }))
    .filter(p => p.variants.length > 0);

  grid.innerHTML = "";

  if(!filtered.length){
    grid.innerHTML = '<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>';
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement("article");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="card-title">${p.name || ""}</div>
      <div class="card-code">${p.code ? "Mã: " + p.code : ""}</div>
    `;

    const variants = document.createElement("div");
    variants.className = "variants";

    p.variants.forEach(v => {
      const row = document.createElement("div");
      row.className = "variant";
      row.innerHTML = `
        <div class="variant-name">${v.name || v.code || "Phiên bản"}</div>
        <div class="stock ${Number(v.onHand || 0) > 0 ? "in" : ""}">
          ${Number(v.onHand || 0) > 0 ? "Còn hàng" : "Hết hàng"}
        </div>
        <div class="price">${money(v.price)}</div>
      `;
      variants.appendChild(row);
    });

    card.append(head, variants);
    grid.appendChild(card);
  });
}

async function load(){
  try{
    const res = await fetch("/api/products", { cache: "no-store" });
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

searchInput.addEventListener("input", render);
onlyStock.addEventListener("change", render);

const savedTheme = localStorage.getItem("kv-theme");
if(savedTheme === "dark"){
  document.body.classList.add("dark");
  darkMode.checked = true;
}
darkMode.addEventListener("change", () => {
  document.body.classList.toggle("dark", darkMode.checked);
  localStorage.setItem("kv-theme", darkMode.checked ? "dark" : "light");
});

load();
setInterval(load, 60000);
