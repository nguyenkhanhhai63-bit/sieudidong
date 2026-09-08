import { isAdmin } from "../admin-auth.js";
import { redisCommand, redisGet } from "../redis.js";

const INDEX_KEY="ai:chat:history:index";
const PREFIX="ai:chat:history:";
function clean(v,max=300){return String(v??"").trim().slice(0,max)}
function safeParse(raw){try{return JSON.parse(raw)}catch{return null}}

export default async function handler(req,res){
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  try{
    if(req.method==="GET"){
      const limit=Math.min(100,Math.max(10,Number(req.query?.limit)||50));
      const q=clean(req.query?.q,120).toLowerCase();
      const ids=await redisCommand(["ZREVRANGE",INDEX_KEY,"0",String(Math.max(limit*4,200)-1)]);
      const rows=[]; const stale=[];
      for(const id of (Array.isArray(ids)?ids:[])){
        const raw=await redisGet(PREFIX+id);
        if(!raw){stale.push(id);continue}
        const item=safeParse(raw); if(!item) continue;
        const messages=Array.isArray(item.messages)?item.messages:[];
        const hay=messages.map(x=>x?.text||"").join(" ").toLowerCase();
        if(q && !hay.includes(q)) continue;
        rows.push({
          sessionId:id,
          startedAt:Number(item.startedAt)||0,
          updatedAt:Number(item.updatedAt)||0,
          page:item.page||"/",
          meta:item.meta||{},
          messageCount:messages.length,
          preview:messages.slice(-2).map(x=>({role:x.role,text:clean(x.text,220),at:x.at})),
          messages
        });
        if(rows.length>=limit) break;
      }
      if(stale.length){ try{await redisCommand(["ZREM",INDEX_KEY,...stale])}catch(_){} }
      const total=Number(await redisCommand(["ZCARD",INDEX_KEY]))||rows.length;
      return res.status(200).json({ok:true,total,items:rows});
    }
    if(req.method==="DELETE"){
      const id=clean(req.query?.id||req.body?.id,90);
      if(!id) return res.status(400).json({error:"Thiếu ID"});
      await redisCommand(["DEL",PREFIX+id]);
      await redisCommand(["ZREM",INDEX_KEY,id]);
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:"Method not allowed"});
  }catch(error){
    console.error("Admin AI chat history error",error);
    return res.status(500).json({error:"Không tải được lịch sử hội thoại"});
  }
}
