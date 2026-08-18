
import { redisCommand } from "../../lib/redis.js";
import { isAdmin } from "../../lib/admin-auth.js";

function vnDay(offset=0){
  const d=new Date(Date.now()+7*60*60*1000);
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
function dates(n){
  return Array.from({length:n},(_,i)=>vnDay(-(n-1-i)));
}
function n(v){ return Number(v||0); }

function timeout(ms){
  return new Promise((_,reject)=>{
    setTimeout(()=>reject(new Error("Redis timeout")),ms);
  });
}

async function safeCommand(args,fallback){
  try{
    const result=await Promise.race([
      redisCommand(args),
      timeout(2500)
    ]);
    return result ?? fallback;
  }catch(err){
    console.warn("Analytics Redis command failed:",args?.[0],err?.message||err);
    return fallback;
  }
}

async function mget(keys){
  if(!keys.length) return [];
  const a=await safeCommand(["MGET",...keys],[]);
  return Array.isArray(a) ? a.map(n) : keys.map(()=>0);
}
async function getNum(key){
  return n(await safeCommand(["GET",key],0));
}
async function pf(keys){
  if(!keys.length) return 0;
  return n(await safeCommand(["PFCOUNT",...keys],0));
}
async function top(key,limit=12){
  const raw=await safeCommand(["ZREVRANGE",key,"0",String(limit-1),"WITHSCORES"],[]);
  if(!Array.isArray(raw)) return [];
  const out=[];
  for(let i=0;i<raw.length;i+=2){
    out.push({name:String(raw[i]||""),value:n(raw[i+1])});
  }
  return out.filter(x=>x.name);
}
async function hash(key){
  const raw=await safeCommand(["HGETALL",key],[]);
  if(Array.isArray(raw)){
    const out={};
    for(let i=0;i<raw.length;i+=2) out[String(raw[i])]=n(raw[i+1]);
    return out;
  }
  if(raw && typeof raw==="object"){
    return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,n(v)]));
  }
  return {};
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  if(!(await isAdmin(req))){
    return res.status(401).json({error:"Unauthorized"});
  }
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const d30=dates(30);
    const d7=d30.slice(-7);
    const today=d30[d30.length-1];

    const [
      dailyViews,dailyZalo,todayVisitors,visitors7,visitors30,
      totalViews,totalVisitors,zaloAll,devices,topProducts,topSearches
    ]=await Promise.all([
      mget(d30.map(d=>`analytics:pageviews:day:${d}`)),
      mget(d30.map(d=>`analytics:zalo:day:${d}`)),
      pf([`analytics:visitors:day:${today}`]),
      pf(d7.map(d=>`analytics:visitors:day:${d}`)),
      pf(d30.map(d=>`analytics:visitors:day:${d}`)),
      getNum("analytics:pageviews:all"),
      pf(["analytics:visitors:all"]),
      getNum("analytics:zalo:all"),
      hash("analytics:devices:all"),
      top("analytics:product_views:all"),
      top("analytics:searches:all")
    ]);

    const daily=d30.map((date,i)=>({
      date,
      views:n(dailyViews[i]),
      zalo:n(dailyZalo[i])
    }));

    const sum=(arr,key)=>arr.reduce((s,x)=>s+n(x[key]),0);
    const last7=daily.slice(-7);

    return res.status(200).json({
      ok:true,
      overview:{
        todayViews:daily.at(-1)?.views||0,
        views7:sum(last7,"views"),
        views30:sum(daily,"views"),
        totalViews,
        todayVisitors,
        visitors7,
        visitors30,
        totalVisitors,
        todayZalo:daily.at(-1)?.zalo||0,
        zalo7:sum(last7,"zalo"),
        zalo30:sum(daily,"zalo"),
        zaloAll
      },
      daily,
      devices,
      topProducts,
      topSearches
    });
  }catch(err){
    console.error("Analytics fatal:",err);
    // Always return JSON so the admin UI never ends in browser-level "Failed to fetch"
    return res.status(200).json({
      ok:false,
      warning:err?.message||"Analytics unavailable",
      overview:{},
      daily:dates(30).map(date=>({date,views:0,zalo:0})),
      devices:{},
      topProducts:[],
      topSearches:[]
    });
  }
}
