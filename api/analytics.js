
import { redisCommand } from "../lib/redis.js";

function vnDay(){
  const d=new Date(Date.now()+7*60*60*1000);
  return d.toISOString().slice(0,10);
}
function clean(v,max=160){
  return String(v||"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
function visitor(v){
  const s=clean(v,80);
  return /^[A-Za-z0-9_-]{8,80}$/.test(s) ? s : "";
}
async function exp(key){
  try{ await redisCommand(["EXPIRE",key,String(45*24*60*60)]); }catch(_){}
}
export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }
  try{
    const type=clean(req.body?.type,40);
    const vid=visitor(req.body?.visitorId);
    const product=clean(req.body?.product,180);
    const query=clean(req.body?.query,100).toLowerCase();
    const device=["mobile","desktop","tablet"].includes(req.body?.device) ? req.body.device : "other";
    const day=vnDay();

    if(type==="page_view"){
      await redisCommand(["INCR","analytics:pageviews:all"]);
      await redisCommand(["INCR",`analytics:pageviews:day:${day}`]); await exp(`analytics:pageviews:day:${day}`);
      if(vid){
        await redisCommand(["PFADD","analytics:visitors:all",vid]);
        await redisCommand(["PFADD",`analytics:visitors:day:${day}`,vid]); await exp(`analytics:visitors:day:${day}`);
      }
      await redisCommand(["HINCRBY","analytics:devices:all",device,"1"]);
    }
    if(type==="product_view" && product){
      await redisCommand(["ZINCRBY","analytics:product_views:all","1",product]);
    }
    if(type==="zalo_click"){
      await redisCommand(["INCR","analytics:zalo:all"]);
      await redisCommand(["INCR",`analytics:zalo:day:${day}`]); await exp(`analytics:zalo:day:${day}`);
    }
    if(type==="search" && query.length>=2){
      await redisCommand(["ZINCRBY","analytics:searches:all","1",query]);
    }
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:true});
  }catch(err){
    console.error("Analytics:",err?.message||err);
    // Không để lỗi thống kê làm ảnh hưởng web.
    return res.status(200).json({ok:false});
  }
}
