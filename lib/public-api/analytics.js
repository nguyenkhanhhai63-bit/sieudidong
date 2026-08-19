
import { redisCommand } from "../redis.js";
import crypto from "node:crypto";

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

function clientIp(req){
  return String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"")
    .split(",")[0].trim().slice(0,120);
}
function fallbackVisitor(req){
  const ip=clientIp(req);
  const ua=clean(req.headers["user-agent"]||"",240);
  if(!ip && !ua) return "";
  return "f_"+crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0,32);
}
function safeProducts(v){
  return (Array.isArray(v)?v:[])
    .map(x=>clean(x,180))
    .filter(Boolean)
    .slice(0,3);
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
    const vid=visitor(req.body?.visitorId) || fallbackVisitor(req);
    const product=clean(req.body?.product,180);
    const query=clean(req.body?.query,100).toLowerCase();
    const device=["mobile","desktop","tablet"].includes(req.body?.device) ? req.body.device : "other";
    const action=clean(req.body?.action,80);
    const products=safeProducts(req.body?.products);
    const day=vnDay();

    if(type==="page_view"){
      // Raw views vẫn lưu riêng để chẩn đoán, nhưng dashboard "lượt truy cập"
      // chỉ tính 1 lần / visitor / ngày.
      await redisCommand(["INCR","analytics:raw_pageviews:all"]);
      await redisCommand(["INCR",`analytics:raw_pageviews:day:${day}`]); await exp(`analytics:raw_pageviews:day:${day}`);

      let countVisit=true;
      if(vid){
        const visitKey=`analytics:visit_seen:day:${day}`;
        const added=Number(await redisCommand(["SADD",visitKey,vid])||0);
        await exp(visitKey);
        countVisit=added===1;
      }

      if(countVisit){
        await redisCommand(["INCR","analytics:pageviews:all"]);
        await redisCommand(["INCR",`analytics:pageviews:day:${day}`]); await exp(`analytics:pageviews:day:${day}`);
      }

      if(vid){
        await redisCommand(["PFADD","analytics:visitors:all",vid]);
        await redisCommand(["PFADD",`analytics:visitors:day:${day}`,vid]); await exp(`analytics:visitors:day:${day}`);

        // Thiết bị chỉ tính 1 lần cho mỗi visitor toàn thời gian.
        const isNewDevice=await redisCommand(["SADD","analytics:device_visitors:all",vid]);
        if(Number(isNewDevice)===1){
          await redisCommand(["HINCRBY","analytics:devices:all",device,"1"]);
        }
      }
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

    if(type==="heartbeat" && vid){
      const now=Date.now();
      await redisCommand(["ZADD","analytics:online",String(now),vid]);
      await redisCommand(["ZREMRANGEBYSCORE","analytics:online","0",String(now-5*60*1000)]);
    }
    if(type==="detail_click"){
      await redisCommand(["INCR","analytics:detail_clicks:all"]);
      await redisCommand(["INCR",`analytics:detail_clicks:day:${day}`]); await exp(`analytics:detail_clicks:day:${day}`);
    }
    if(type==="filter_click" && action){
      await redisCommand(["HINCRBY","analytics:filters:all",action,"1"]);
    }

    if(type==="compare_create" && products.length>=2){
      await redisCommand(["INCR","analytics:compare:all"]);
      await redisCommand(["INCR",`analytics:compare:day:${day}`]); await exp(`analytics:compare:day:${day}`);

      // Danh sách máy được đưa vào so sánh nhiều nhất.
      for(const name of products){
        await redisCommand(["ZINCRBY","analytics:compare_products:all","1",name]);
      }

      // Chuỗi cặp/bộ máy để biết khách thường cân những máy nào với nhau.
      const combo=[...products].sort((a,b)=>a.localeCompare(b,"vi")).join(" ↔ ");
      if(combo){
        await redisCommand(["ZINCRBY","analytics:compare_pairs:all","1",combo]);
      }
    }

    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:true});
  }catch(err){
    console.error("Analytics:",err?.message||err);
    // Không để lỗi thống kê làm ảnh hưởng web.
    return res.status(200).json({ok:false});
  }
}
