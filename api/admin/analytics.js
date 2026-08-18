
import { redisCommand } from "../../lib/redis.js";
import { isAdmin } from "../../lib/admin-auth.js";

function vnDay(offset=0){
  const d=new Date(Date.now()+7*60*60*1000);
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
function dates(n){ return Array.from({length:n},(_,i)=>vnDay(-(n-1-i))); }
async function num(key){ return Number(await redisCommand(["GET",key])||0); }
async function pf(keys){ return keys.length ? Number(await redisCommand(["PFCOUNT",...keys])||0) : 0; }
async function top(key,n=10){
  const a=await redisCommand(["ZREVRANGE",key,"0",String(n-1),"WITHSCORES"])||[];
  const out=[]; for(let i=0;i<a.length;i+=2) out.push({name:String(a[i]),value:Number(a[i+1]||0)});
  return out;
}
async function hash(key){
  const a=await redisCommand(["HGETALL",key])||[];
  const o={}; for(let i=0;i<a.length;i+=2) o[String(a[i])]=Number(a[i+1]||0);
  return o;
}
export default async function handler(req,res){
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  try{
    const d30=dates(30), d7=d30.slice(-7);
    const daily=[];
    for(const d of d30){
      daily.push({
        date:d,
        views:await num(`analytics:pageviews:day:${d}`),
        visitors:await pf([`analytics:visitors:day:${d}`]),
        zalo:await num(`analytics:zalo:day:${d}`)
      });
    }
    const [totalViews,totalVisitors,visitors7,visitors30,zaloAll,devices,topProducts,topSearches]=await Promise.all([
      num("analytics:pageviews:all"),
      pf(["analytics:visitors:all"]),
      pf(d7.map(d=>`analytics:visitors:day:${d}`)),
      pf(d30.map(d=>`analytics:visitors:day:${d}`)),
      num("analytics:zalo:all"),
      hash("analytics:devices:all"),
      top("analytics:product_views:all",12),
      top("analytics:searches:all",12)
    ]);
    const last7=daily.slice(-7);
    const sum=(arr,k)=>arr.reduce((s,x)=>s+Number(x[k]||0),0);
    return res.status(200).json({
      overview:{
        todayViews:daily.at(-1)?.views||0,
        views7:sum(last7,"views"), views30:sum(daily,"views"), totalViews,
        todayVisitors:daily.at(-1)?.visitors||0, visitors7, visitors30, totalVisitors,
        todayZalo:daily.at(-1)?.zalo||0, zalo7:sum(last7,"zalo"), zalo30:sum(daily,"zalo"), zaloAll
      },
      daily, devices, topProducts, topSearches
    });
  }catch(err){
    console.error("Admin analytics:",err);
    return res.status(500).json({error:err.message||"Không tải được thống kê"});
  }
}
