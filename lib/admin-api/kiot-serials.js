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
function extract(data){return Array.isArray(data?.data)?data.data:Array.isArray(data?.items)?data.items:Array.isArray(data?.serialNumbers)?data.serialNumbers:[]}
function normalized(v){return String(v||'').replace(/\D/g,'')}
function isAvailable(x){const status=String(x.status??x.serialStatus??'').toLowerCase();if(x.isSold===true||x.sold===true||x.isDeleted===true)return false;if(status&&/(sold|sale|xuất|bán|inactive|deleted)/i.test(status))return false;const quantity=x.onHand??x.quantity??x.stock;if(quantity!=null&&Number(quantity)<=0)return false;return true}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(!(await isAdmin(req)))return res.status(401).json({error:'Chưa đăng nhập quản trị'});
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const id=Number(req.query?.productId);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Thiếu productId hợp lệ'});
 try{
  // KiotViet may expose serials in a dedicated endpoint or in product details depending on API permissions.
  const paths=[`/serialNumbers?productId=${id}&pageSize=100`,`/products/${id}?includeInventory=true`];
  const found=[];let accessible=false;
  for(const path of paths){try{const d=await get(path);accessible=true;const items=extract(d);if(path.includes('/products/'))items.push(...(Array.isArray(d.serialNumbers)?d.serialNumbers:[]));for(const x of items){if(!x||typeof x!=='object'||!isAvailable(x))continue;const pid=Number(x.productId??x.product?.id??id);if(pid!==id)continue;const raw=x.serialNumber??x.serial??x.imei??x.number??'';const n=normalized(raw);if(/^\d{15}$/.test(n)&&!found.includes(n))found.push(n)}}catch(e){console.warn('KiotViet serial endpoint:',path,e.message)}}
  return res.status(200).json({productId:id,imeis:found,available:accessible,warning:found.length?'':'KiotViet chưa trả về IMEI tồn kho xác thực qua API hiện tại. Không tự tạo IMEI.'});
 }catch(e){console.error('KiotViet serial lookup',e);return res.status(502).json({error:'Không truy vấn được IMEI từ KiotViet'});}
}
