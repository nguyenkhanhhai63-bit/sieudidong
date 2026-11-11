import { isAdmin } from "../admin-auth.js";
import { redisCommand } from "../redis.js";
import { AI_DIAGNOSTICS_KEY } from "../ai-diagnostics.js";
export default async function handler(req,res){
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  try{
    const limit=Math.min(200,Math.max(10,Number(req.query?.limit)||100));
    const raw=await redisCommand(["LRANGE",AI_DIAGNOSTICS_KEY,"0",String(limit-1)]);
    const items=(Array.isArray(raw)?raw:[]).flatMap(x=>{try{return [JSON.parse(x)]}catch{return []}});
    return res.status(200).json({ok:true,items});
  }catch(err){console.error("Admin AI diagnostics error:",err);return res.status(500).json({error:"Không tải được nhật ký AI"})}
}
