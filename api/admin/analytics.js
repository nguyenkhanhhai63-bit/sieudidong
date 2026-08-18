
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

function toNumber(v){
  return Number(v || 0);
}

async function mget(keys){
  if(!keys.length) return [];
  const values = await redisCommand(["MGET", ...keys]);
  return Array.isArray(values) ? values.map(toNumber) : [];
}

async function getNumber(key){
  return toNumber(await redisCommand(["GET",key]));
}

async function pfCount(keys){
  if(!keys.length) return 0;
  return toNumber(await redisCommand(["PFCOUNT",...keys]));
}

async function topZSet(key,n=10){
  const raw=await redisCommand(["ZREVRANGE",key,"0",String(n-1),"WITHSCORES"])||[];
  const out=[];
  for(let i=0;i<raw.length;i+=2){
    out.push({name:String(raw[i]),value:toNumber(raw[i+1])});
  }
  return out;
}

async function hGetAll(key){
  const raw=await redisCommand(["HGETALL",key])||[];

  // node-redis sendCommand thường trả array với HGETALL.
  if(Array.isArray(raw)){
    const out={};
    for(let i=0;i<raw.length;i+=2){
      out[String(raw[i])]=toNumber(raw[i+1]);
    }
    return out;
  }

  // Fallback nếu provider trả object.
  const out={};
  for(const [k,v] of Object.entries(raw||{})) out[k]=toNumber(v);
  return out;
}

export default async function handler(req,res){
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

    // Quan trọng V81:
    // Không còn gọi Redis tuần tự 60-90 lần như V79/V80.
    // MGET toàn bộ 30 ngày trong 2 lệnh, các thống kê khác chạy song song.
    const viewKeys=d30.map(d=>`analytics:pageviews:day:${d}`);
    const zaloKeys=d30.map(d=>`analytics:zalo:day:${d}`);

    const [
      dailyViews,
      dailyZalo,
      todayVisitors,
      visitors7,
      visitors30,
      totalViews,
      totalVisitors,
      zaloAll,
      devices,
      topProducts,
      topSearches
    ]=await Promise.all([
      mget(viewKeys),
      mget(zaloKeys),
      pfCount([`analytics:visitors:day:${today}`]),
      pfCount(d7.map(d=>`analytics:visitors:day:${d}`)),
      pfCount(d30.map(d=>`analytics:visitors:day:${d}`)),
      getNumber("analytics:pageviews:all"),
      pfCount(["analytics:visitors:all"]),
      getNumber("analytics:zalo:all"),
      hGetAll("analytics:devices:all"),
      topZSet("analytics:product_views:all",12),
      topZSet("analytics:searches:all",12)
    ]);

    const daily=d30.map((date,i)=>({
      date,
      views:toNumber(dailyViews[i]),
      zalo:toNumber(dailyZalo[i])
    }));

    const sum=(arr,key)=>arr.reduce((s,x)=>s+toNumber(x[key]),0);
    const last7=daily.slice(-7);

    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({
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
    console.error("Admin analytics V81:",err);
    return res.status(500).json({
      error:err?.message || "Không tải được thống kê"
    });
  }
}
