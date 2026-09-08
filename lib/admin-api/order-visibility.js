import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="order:visibility:hidden-models";
function cleanName(v){return String(v??"").replace(/[<>]/g,"").trim().slice(0,180)}
function normalize(body={}){
  const src=Array.isArray(body.hiddenModels)?body.hiddenModels:[];
  return [...new Set(src.map(cleanName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
}
async function read(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?normalize({hiddenModels:parsed}):[];
  }catch(_){return []}
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0, s-maxage=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Expires","0");
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET")return res.status(200).json({ok:true,hiddenModels:await read()});
  if(req.method==="POST"){
    const hiddenModels=normalize(req.body||{});
    await redisCommand(["SET",KEY,JSON.stringify(hiddenModels)]);
    // Đọc lại ngay sau khi lưu để chắc chắn dữ liệu thật sự đã nằm trong Redis.
    const verifyRaw=await redisCommand(["GET",KEY]);
    const verified=verifyRaw?normalize({hiddenModels:JSON.parse(verifyRaw)}):[];
    return res.status(200).json({ok:true,hiddenModels:verified,updatedAt:Date.now()});
  }
  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,hiddenModels:[]});
  }
  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
