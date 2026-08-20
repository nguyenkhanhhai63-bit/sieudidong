
const KV_TOKEN_URL="https://id.kiotviet.vn/connect/token";
const KV_API="https://public.kiotapi.com";

export function warrantyDigits(v){
  return String(v||"").replace(/\D/g,"");
}

function addMonths(date,months){
  const d=new Date(date);
  const day=d.getDate();
  d.setMonth(d.getMonth()+months);
  if(d.getDate()<day) d.setDate(0);
  return d;
}

function dateOnly(d){
  return new Intl.DateTimeFormat("vi-VN",{
    day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Asia/Ho_Chi_Minh"
  }).format(new Date(d));
}

function maskInvoice(code){
  const s=String(code||"");
  if(s.length<=4) return s;
  return s.slice(0,2)+"•••"+s.slice(-3);
}

function maskSerial(raw=""){
  const s=String(raw||"").trim();
  if(!s) return "";
  // Có thể chứa nhiều serial; chỉ hiển thị dạng che bớt trong AI/chat công khai.
  return s.split(/[,\s;]+/).filter(Boolean).map(x=>{
    if(x.length<=6) return "••"+x.slice(-3);
    return x.slice(0,3)+"••••"+x.slice(-4);
  }).join(", ");
}

async function jsonFetch(url,options={}){
  const r=await fetch(url,options);
  const txt=await r.text();
  let data={};
  try{ data=txt?JSON.parse(txt):{}; }catch{ data={message:txt}; }
  if(!r.ok){
    throw new Error(data?.responseStatus?.message||data?.message||`KiotViet HTTP ${r.status}`);
  }
  return data;
}

async function token(){
  const id=process.env.KIOTVIET_CLIENT_ID;
  const secret=process.env.KIOTVIET_CLIENT_SECRET;
  if(!id||!secret) throw new Error("KiotViet API chưa được cấu hình.");
  const body=new URLSearchParams({
    scopes:"PublicApi.Access",
    grant_type:"client_credentials",
    client_id:id,
    client_secret:secret
  });
  const data=await jsonFetch(KV_TOKEN_URL,{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body
  });
  return data.access_token;
}

async function kvGet(path,accessToken){
  const retailer=process.env.KIOTVIET_RETAILER;
  if(!retailer) throw new Error("KiotViet retailer chưa được cấu hình.");
  return jsonFetch(KV_API+path,{
    headers:{Retailer:retailer,Authorization:`Bearer ${accessToken}`}
  });
}

export async function lookupWarrantyByPhone(phoneInput){
  const phone=warrantyDigits(phoneInput);
  if(phone.length<9 || phone.length>11){
    return {ok:false,code:"INVALID_PHONE",error:"Số điện thoại không hợp lệ.",items:[]};
  }

  const access=await token();

  const customers=await kvGet(`/customers?contactNumber=${encodeURIComponent(phone)}&pageSize=100`,access);
  const exact=(customers.data||[]).filter(c=>
    warrantyDigits(c.contactNumber)===phone || warrantyDigits(c.subNumber)===phone
  );

  if(!exact.length){
    return {
      ok:true,found:false,items:[],
      message:"Không tìm thấy lịch sử mua hàng với số điện thoại này."
    };
  }

  const ids=exact.map(c=>c.id).filter(Boolean);
  const params=new URLSearchParams();
  ids.forEach(id=>params.append("customerIds",String(id)));
  params.set("pageSize","100");
  params.set("orderBy","purchaseDate");
  params.set("orderDirection","Desc");

  const invoices=await kvGet(`/invoices?${params.toString()}`,access);

  const warrantyMonths=Math.max(1,Number(process.env.WARRANTY_MONTHS||12));
  const exchangeMonths=Math.max(0,Number(process.env.EXCHANGE_MONTHS||1));
  const now=new Date();
  const items=[];

  for(const inv of (invoices.data||[])){
    if(String(inv.statusValue||"").toLowerCase().includes("hủy")) continue;

    const purchase=new Date(inv.purchaseDate);
    if(Number.isNaN(purchase.getTime())) continue;

    const warrantyEnd=addMonths(purchase,warrantyMonths);
    const exchangeEnd=addMonths(purchase,exchangeMonths);
    const remaining=Math.max(0,Math.ceil((warrantyEnd-now)/86400000));
    const details=Array.isArray(inv.invoiceDetails)?inv.invoiceDetails:[];

    for(const d of details){
      if(!d?.productName || Number(d.quantity||0)<=0) continue;
      items.push({
        productName:String(d.productName||""),
        productCode:String(d.productCode||""),
        serialNumbers:String(d.serialNumbers||""),
        serialMasked:maskSerial(d.serialNumbers||""),
        purchaseDate:dateOnly(purchase),
        warrantyEnd:dateOnly(warrantyEnd),
        exchangeEnd:exchangeMonths?dateOnly(exchangeEnd):null,
        remainingDays:remaining,
        inWarranty:warrantyEnd>=now,
        invoiceCode:maskInvoice(inv.code),
        branchName:String(inv.branchName||"Siêu Di Động")
      });
    }
  }

  return {
    ok:true,
    found:items.length>0,
    warrantyMonths,
    exchangeMonths,
    items,
    message:items.length?"":"Có thông tin khách hàng nhưng chưa tìm thấy sản phẩm trong hóa đơn."
  };
}
