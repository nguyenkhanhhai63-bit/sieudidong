
import { redisCommand } from "../redis.js";

const KEY="ai:chat:icon:v1";
const DEFAULT_ICON="/assets/ai-chat-robot.png?v=179";

function validDataUrl(v=""){
  const s=String(v||"").trim();
  if(!/^data:image\/(png|webp|jpeg);base64,/i.test(s)) return "";
  if(s.length>500000) return "";
  return s;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=60, s-maxage=60");
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const raw=await redisCommand(["GET",KEY]);
    if(!raw) return res.status(200).json({ok:true,iconUrl:DEFAULT_ICON,custom:false});
    const parsed=JSON.parse(raw)||{};
    const iconUrl=validDataUrl(parsed.iconUrl||"");
    return res.status(200).json({
      ok:true,
      iconUrl:iconUrl||DEFAULT_ICON,
      custom:Boolean(iconUrl),
      updatedAt:Number(parsed.updatedAt||0)
    });
  }catch(_){
    return res.status(200).json({ok:true,iconUrl:DEFAULT_ICON,custom:false});
  }
}
