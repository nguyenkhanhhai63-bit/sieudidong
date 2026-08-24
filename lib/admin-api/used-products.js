import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";
import { destroyCloudinaryAssets } from "../cloudinary.js";

const KEY="used:products:v1";
const MAX_ITEMS=500, MAX_IMAGES=8;

function clean(v,max=500){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function money(v){const n=Number(String(v??"").replace(/[^\d.-]/g,""));return Number.isFinite(n)?Math.max(0,Math.round(n)):0}
function cleanUrl(v){
  const s=String(v||"").trim();
  if(/^https:\/\/res\.cloudinary\.com\//i.test(s)) return s.slice(0,1200);
  // Backward compatibility for old records already saved before V260.
  if(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(s)) return s;
  if(/^https?:\/\//i.test(s)) return s.slice(0,1200);
  return "";
}
function cleanAssets(x={}){
  const supplied=Array.isArray(x.imageAssets)?x.imageAssets:[];
  let assets=supplied.map(a=>({
    url:cleanUrl(a?.url||a?.secure_url),
    publicId:clean(a?.publicId||a?.public_id,300)
  })).filter(a=>a.url).slice(0,MAX_IMAGES);

  // Old records only have images[]; keep them readable/editable.
  if(!assets.length && Array.isArray(x.images)){
    assets=x.images.map(url=>({url:cleanUrl(url),publicId:""})).filter(a=>a.url).slice(0,MAX_IMAGES);
  }
  return assets;
}
function normalize(x={}){
  const now=new Date().toISOString();
  const imageAssets=cleanAssets(x);
  return {
    id:clean(x.id,80)||`used_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
    name:clean(x.name,140),brand:clean(x.brand,60),memory:clean(x.memory,60),color:clean(x.color,60),
    price:money(x.price),condition:clean(x.condition,100),battery:clean(x.battery,100),warranty:clean(x.warranty,140),
    accessories:clean(x.accessories,240),note:clean(x.note,900),imei:clean(x.imei,80),
    status:x.status==="sold"?"sold":"available",
    imageAssets,
    images:imageAssets.map(a=>a.url),
    createdAt:clean(x.createdAt,40)||now,updatedAt:now
  };
}
async function read(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    const a=raw?JSON.parse(raw):[];
    return Array.isArray(a)?a.slice(0,MAX_ITEMS):[];
  }catch(_){return []}
}
async function write(a){await redisCommand(["SET",KEY,JSON.stringify(a.slice(0,MAX_ITEMS))])}
function assetIds(item){
  return (Array.isArray(item?.imageAssets)?item.imageAssets:[])
    .map(a=>String(a?.publicId||a?.public_id||"").trim()).filter(Boolean);
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});

  if(req.method==="GET") return res.status(200).json({ok:true,items:await read()});

  if(req.method==="POST"){
    const item=normalize(req.body?.item||req.body||{});
    if(!item.name) return res.status(400).json({error:"Vui lòng nhập tên máy"});
    if(!item.price) return res.status(400).json({error:"Vui lòng nhập giá bán"});
    if(!item.images.length) return res.status(400).json({error:"Máy cũ cần ít nhất 1 ảnh thực tế"});

    const a=await read();
    const i=a.findIndex(x=>String(x.id)===item.id);
    if(i>=0){
      const previous=a[i]||{};
      item.createdAt=previous.createdAt||item.createdAt;

      // Any Cloudinary image removed in edit mode is deleted from storage.
      const keep=new Set(assetIds(item));
      const removed=assetIds(previous).filter(id=>!keep.has(id));
      if(removed.length) await destroyCloudinaryAssets(removed);

      a[i]=item;
    }else{
      a.unshift(item);
    }
    await write(a);
    return res.status(200).json({ok:true,item,items:a});
  }

  if(req.method==="DELETE"){
    const id=clean(req.query?.id||req.body?.id,80);
    if(!id) return res.status(400).json({error:"Thiếu mã máy"});
    const current=await read();
    const removed=current.find(x=>String(x.id)===id);
    const a=current.filter(x=>String(x.id)!==id);
    await write(a);

    // Delete Cloudinary assets after Redis is safely updated.
    const ids=assetIds(removed);
    if(ids.length) await destroyCloudinaryAssets(ids);

    return res.status(200).json({ok:true,items:a});
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
