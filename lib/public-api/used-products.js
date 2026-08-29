import { redisCommand } from "../redis.js";
import { fetchUsedSheet, mergeSheetWithOverlays } from "../used-products-sheet.js";
const KEY="used:products:v1";
function imagesOf(x={}){
  if(Array.isArray(x.imageAssets)&&x.imageAssets.length) return x.imageAssets.map(a=>String(a?.url||"").trim()).filter(Boolean).slice(0,8);
  return Array.isArray(x.images)?x.images.map(String).filter(Boolean).slice(0,8):[];
}
function pub(x={}){
 return {id:String(x.id||""),name:String(x.name||""),brand:String(x.brand||""),memory:String(x.memory||""),color:String(x.color||""),
 price:Number(x.price||0),condition:String(x.condition||""),battery:String(x.battery||""),warranty:String(x.warranty||""),
 accessories:String(x.accessories||""),note:String(x.note||""),status:x.status==="sold"?"sold":"available",
 images:imagesOf(x),updatedAt:String(x.updatedAt||""),source:"sheet"};
}
async function overlays(){try{const raw=await redisCommand(["GET",KEY]);const a=raw?JSON.parse(raw):[];return Array.isArray(a)?a:[]}catch(_){return []}}
export default async function handler(req,res){
 if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
 res.setHeader("Cache-Control","public, max-age=20, s-maxage=60, stale-while-revalidate=180");
 try{
   const [sheet,ov]=await Promise.all([fetchUsedSheet(),overlays()]);
   const items=mergeSheetWithOverlays(sheet.items,ov).filter(x=>x.status!=="sold"&&Number(x.price||0)>0).map(pub);
   return res.status(200).json({ok:true,items,source:"google-sheet",syncedAt:sheet.fetchedAt,warning:sheet.warning||""});
 }catch(error){
   return res.status(200).json({ok:true,items:[],source:"google-sheet",error:error?.message||"Không tải được Google Sheet"});
 }
}
