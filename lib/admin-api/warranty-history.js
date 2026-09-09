import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const HISTORY_KEY="sdd:warranty:history:v803";

function parseRow(v){
  try{
    const x=JSON.parse(String(v||"{}"));
    if(!x || Number(x.schemaVersion)!==803) return null;
    return x;
  }catch{return null;}
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.setHeader("X-SDD-Warranty-History-Build","v803");
  if(!(await isAdmin(req))) return res.status(401).json({ok:false,error:"Unauthorized"});
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({ok:false,error:"Method not allowed"});
  }
  try{
    const raw=await redisCommand(["LRANGE",HISTORY_KEY,"0","99"]);
    const items=(Array.isArray(raw)?raw:[]).map(parseRow).filter(Boolean);
    return res.status(200).json({ok:true,build:"v803",items});
  }catch(err){
    console.error("Warranty history v803:",err);
    return res.status(500).json({ok:false,error:"Không đọc được lịch sử bảo hành."});
  }
}
