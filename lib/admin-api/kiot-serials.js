import { isAdmin } from '../admin-auth.js';
const BASE='https://public.kiotapi.com';
let cachedToken=null, expires=0;
async function token(){
 if(cachedToken&&Date.now()<expires)return cachedToken;
 const body=new URLSearchParams({scopes:'PublicApi.Access',grant_type:'client_credentials',client_id:process.env.KIOTVIET_CLIENT_ID||'',client_secret:process.env.KIOTVIET_CLIENT_SECRET||''});
 const r=await fetch('https://id.kiotviet.vn/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 if(!r.ok)throw new Error(`Không lấy được token KiotViet (${r.status})`);
 const d=await r.json();cachedToken=d.access_token;expires=Date.now()+(Number(d.expires_in||3600)-90)*1000;return cachedToken;
}
async function get(path){const r=await fetch(BASE+path,{headers:{Retailer:process.env.KIOTVIET_RETAILER||'',Authorization:`Bearer ${await token()}`}});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={}};if(!r.ok)throw new Error(`KiotViet trả về ${r.status}`);return data;}
function parseSerials(data,id){
 const list=Array.isArray(data.productSerials)?data.productSerials:[];
 const imeis=[];
 for(const entry of list){
  if(!entry||typeof entry!=="object")continue;
  if(entry.productId!=null&&Number(entry.productId)!==id)continue;
  if(entry.status!=null&&Number(entry.status)!==1)continue;
  if(entry.quantity!=null&&Number(entry.quantity)<=0)continue;
  const imei=String(entry.serialNumber??"").replace(/\D/g,"");
  if(/^\d{15}$/.test(imei)&&!imeis.includes(imei))imeis.push(imei);
 }
 return {imeis,total:list.length,hasField:Array.isArray(data.productSerials)};
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!(await isAdmin(req)))return res.status(401).json({error:"Chưa đăng nhập quản trị"});
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 const id=Number(req.query?.productId);
 if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:"Thiếu productId hợp lệ"});
 try{
  const path=`/products/${id}?includeInventory=true`;
  const data=await get(path);
  const parsed=parseSerials(data,id);
  return res.status(200).json({productId:id,imeis:parsed.imeis,available:true,checks:[{source:path,ok:true,hasSerialField:parsed.hasField,serialCount:parsed.total,isLotSerialControl:data.isLotSerialControl??null}],warning:parsed.imeis.length?"":parsed.hasField?"Không có IMEI 15 số còn hàng trong productSerials.":"KiotViet không trả productSerials cho sản phẩm này. Kiểm tra cấu hình quản lý Serial/IMEI."});
 }catch(e){console.error("KiotViet serial lookup",e);return res.status(502).json({error:"Không truy vấn được chi tiết sản phẩm KiotViet: "+e.message});}
}
