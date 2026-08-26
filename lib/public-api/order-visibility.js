import { redisCommand } from "../redis.js";
const KEY="order:visibility:hidden-models";
export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=20, s-maxage=30, stale-while-revalidate=60");
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  try{
    const raw=await redisCommand(["GET",KEY]);
    const parsed=raw?JSON.parse(raw):[];
    const hiddenModels=Array.isArray(parsed)?parsed.map(x=>String(x||"").trim()).filter(Boolean):[];
    return res.status(200).json({ok:true,hiddenModels});
  }catch(_){return res.status(200).json({ok:true,hiddenModels:[]})}
}
