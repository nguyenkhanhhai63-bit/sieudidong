import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";
import { getUsedSheetConfig, saveUsedSheetConfig, DEFAULT_USED_SHEET_URL } from "../used-products-sheet.js";

function clean(v,max=1600){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0, s-maxage=0");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});

  if(req.method==="GET"){
    const cfg=await getUsedSheetConfig();
    return res.status(200).json({ok:true,...cfg,defaultUrl:DEFAULT_USED_SHEET_URL});
  }

  if(req.method==="POST"){
    const url=clean(req.body?.url);
    if(!url) return res.status(400).json({error:"Vui lòng nhập link Google Sheet"});
    try{
      const cfg=await saveUsedSheetConfig(url);
      return res.status(200).json({ok:true,...cfg});
    }catch(error){
      return res.status(400).json({error:error?.message||"Link Google Sheet không hợp lệ"});
    }
  }

  if(req.method==="DELETE"){
    await redisCommand(["DEL","used:sheet:settings:v1"]);
    await redisCommand(["DEL","used:sheet:cache:v3"]);
    const cfg=await getUsedSheetConfig();
    return res.status(200).json({ok:true,...cfg,reset:true});
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
