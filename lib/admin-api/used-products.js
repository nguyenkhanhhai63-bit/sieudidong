import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";
const KEY="used:products:v1";
const MAX_ITEMS=500, MAX_IMAGES=8, MAX_IMAGE_CHARS=720000;
function clean(v,max=500){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function money(v){const n=Number(String(v??"").replace(/[^\d.-]/g,""));return Number.isFinite(n)?Math.max(0,Math.round(n)):0}
function images(v){return (Array.isArray(v)?v:[]).filter(x=>typeof x==="string").map(x=>x.trim()).filter(x=>/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(x)||/^https?:\/\//i.test(x)).filter(x=>x.length<=MAX_IMAGE_CHARS).slice(0,MAX_IMAGES)}
function normalize(x={}){
  const now=new Date().toISOString();
  return {
    id:clean(x.id,80)||`used_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
    name:clean(x.name,140),brand:clean(x.brand,60),memory:clean(x.memory,60),color:clean(x.color,60),
    price:money(x.price),condition:clean(x.condition,100),battery:clean(x.battery,100),warranty:clean(x.warranty,140),
    accessories:clean(x.accessories,240),note:clean(x.note,900),imei:clean(x.imei,80),
    status:x.status==="sold"?"sold":"available",images:images(x.images),
    createdAt:clean(x.createdAt,40)||now,updatedAt:now
  };
}
async function read(){try{const raw=await redisCommand(["GET",KEY]);const a=raw?JSON.parse(raw):[];return Array.isArray(a)?a.slice(0,MAX_ITEMS):[]}catch(_){return []}}
async function write(a){await redisCommand(["SET",KEY,JSON.stringify(a.slice(0,MAX_ITEMS))])}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET") return res.status(200).json({ok:true,items:await read()});
  if(req.method==="POST"){
    const item=normalize(req.body?.item||req.body||{});
    if(!item.name) return res.status(400).json({error:"Vui lòng nhập tên máy"});
    if(!item.price) return res.status(400).json({error:"Vui lòng nhập giá bán"});
    if(!item.images.length) return res.status(400).json({error:"Máy cũ cần ít nhất 1 ảnh thực tế"});
    const a=await read(); const i=a.findIndex(x=>String(x.id)===item.id);
    if(i>=0){item.createdAt=a[i]?.createdAt||item.createdAt;a[i]=item}else a.unshift(item);
    await write(a); return res.status(200).json({ok:true,item,items:a});
  }
  if(req.method==="DELETE"){
    const id=clean(req.query?.id||req.body?.id,80);
    if(!id) return res.status(400).json({error:"Thiếu mã máy"});
    const a=(await read()).filter(x=>String(x.id)!==id); await write(a);
    return res.status(200).json({ok:true,items:a});
  }
  res.setHeader("Allow","GET, POST, DELETE"); return res.status(405).json({error:"Method not allowed"});
}