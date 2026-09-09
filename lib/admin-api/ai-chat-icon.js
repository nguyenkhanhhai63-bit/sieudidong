
import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="ai:chat:icon:v1";
const DEFAULT_ICON="/assets/ai-chat-robot.png?v=179";

function validDataUrl(v=""){
  const s=String(v||"").trim();
  if(!s) return "";
  if(!/^data:image\/(png|webp|jpeg);base64,/i.test(s)) return "";
  if(s.length>500000) return "";
  return s;
}

async function readIcon(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    if(!raw) return {iconUrl:DEFAULT_ICON,custom:false};
    const parsed=JSON.parse(raw)||{};
    const iconUrl=validDataUrl(parsed.iconUrl||"");
    return iconUrl
      ? {iconUrl,custom:true,updatedAt:Number(parsed.updatedAt||0)}
      : {iconUrl:DEFAULT_ICON,custom:false};
  }catch(_){
    return {iconUrl:DEFAULT_ICON,custom:false};
  }
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});

  if(req.method==="GET"){
    return res.status(200).json({ok:true,...await readIcon()});
  }

  if(req.method==="POST"){
    try{
      const iconUrl=validDataUrl(req.body?.iconUrl);
      if(!iconUrl) return res.status(400).json({error:"Ảnh không hợp lệ hoặc dung lượng quá lớn."});

      await redisCommand(["SET",KEY,JSON.stringify({iconUrl,updatedAt:Date.now()})]);
      const saved=await readIcon();
      if(!saved.custom) return res.status(500).json({error:"Server chưa xác nhận icon đã được lưu."});

      return res.status(200).json({ok:true,persisted:true,...saved});
    }catch(err){
      return res.status(500).json({error:"Không lưu được icon chat: "+(err?.message||"Redis error")});
    }
  }

  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,iconUrl:DEFAULT_ICON,custom:false});
  }

  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
