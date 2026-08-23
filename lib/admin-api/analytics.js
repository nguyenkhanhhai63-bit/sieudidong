import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const VN_OFFSET_MS=7*60*60*1000;
const RETENTION=400*24*60*60;
function vnDay(offset=0){
  const d=new Date(Date.now()+VN_OFFSET_MS);
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
function dates(n){return Array.from({length:n},(_,i)=>vnDay(-(n-1-i)))}
function num(v){return Number(v||0)}
function timeout(ms){return new Promise((_,reject)=>setTimeout(()=>reject(new Error("Redis timeout")),ms))}
async function cmd(args,fallback=null,ms=8000){
  try{return (await Promise.race([redisCommand(args),timeout(ms)])) ?? fallback}
  catch(e){console.warn("Analytics v5 Redis:",args?.[0],e?.message||e);return fallback}
}
async function hash(key){
  const raw=await cmd(["HGETALL",key],[],8000);
  if(Array.isArray(raw)){
    const o={};for(let i=0;i<raw.length;i+=2)o[String(raw[i])]=num(raw[i+1]);return o;
  }
  if(raw&&typeof raw==="object")return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,num(v)]));
  return {};
}
async function zcard(key){return num(await cmd(["ZCARD",key],0,8000))}
async function getNum(key){return num(await cmd(["GET",key],0,8000))}
async function top(key,limit=12){
  const raw=await cmd(["ZREVRANGE",key,"0",String(limit-1),"WITHSCORES"],[],8000);
  if(!Array.isArray(raw))return[];
  const a=[];for(let i=0;i<raw.length;i+=2)a.push({name:String(raw[i]||""),value:num(raw[i+1])});
  return a.filter(x=>x.name);
}
async function hgetall(key){
  const raw=await cmd(["HGETALL",key],[],8000);
  if(Array.isArray(raw)){const o={};for(let i=0;i<raw.length;i+=2)o[String(raw[i])]=num(raw[i+1]);return o}
  return raw&&typeof raw==="object"?raw:{};
}
async function recentWarranty(limit=20){
  const raw=await cmd(["LRANGE","analytics:warranty_recent","0",String(limit-1)],[],8000);
  if(!Array.isArray(raw))return[];
  return raw.map(x=>{try{return JSON.parse(String(x||"{}"))}catch{return null}}).filter(Boolean);
}
async function readDay(day){
  const [h,visitors]=await Promise.all([
    hash(`analytics:v5:day:${day}`),
    zcard(`analytics:v5:visitors:${day}`)
  ]);
  return {
    date:day,
    visitors,
    views:num(h.pageviews),
    rawViews:num(h.pageviews),
    detailClicks:num(h.detailClicks),
    compare:num(h.compare),
    zalo:num(h.zalo),
    warrantyChecks:num(h.warrantyChecks),
    warrantyFound:num(h.warrantyFound),
    warrantyNotFound:num(h.warrantyNotFound),
    warrantyErrors:num(h.warrantyErrors)
  };
}
async function uniqueVisitors(days){
  // ZSET theo ngày. Dùng ZUNIONSTORE vào key tạm có TTL ngắn để lấy union chính xác,
  // tránh tải hàng nghìn visitor ID về server.
  if(!days.length)return 0;
  if(days.length===1)return zcard(`analytics:v5:visitors:${days[0]}`);
  const temp=`analytics:v5:tmp:union:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  const keys=days.map(d=>`analytics:v5:visitors:${d}`);
  const count=num(await cmd(["ZUNIONSTORE",temp,String(keys.length),...keys],0,12000));
  await cmd(["EXPIRE",temp,"30"],0,3000);
  return count;
}
const sum=(rows,key)=>rows.reduce((a,x)=>a+num(x?.[key]),0);
function period(rows,visitors){
  return {
    visitors:num(visitors),
    views:sum(rows,"views"),
    detailClicks:sum(rows,"detailClicks"),
    compare:sum(rows,"compare"),
    zalo:sum(rows,"zalo"),
    warrantyChecks:sum(rows,"warrantyChecks"),
    warrantyFound:sum(rows,"warrantyFound")
  };
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});

  try{
    const today=vnDay(),yesterday=vnDay(-1);
    const now=Date.now(),onlineMin=String(now-5*60*1000);

    // Online chỉ là trạng thái 5 phút gần nhất.
    await cmd(["ZREMRANGEBYSCORE","analytics:online","0",onlineMin],0);
    const onlineIds=await cmd(["ZRANGEBYSCORE","analytics:online",onlineMin,"+inf"],[],8000);
    const active=[...new Set((Array.isArray(onlineIds)?onlineIds:[]).map(String).filter(Boolean))];

    // Migration/recovery: bất kỳ ai đang online chắc chắn là visitor hôm nay.
    // Dùng cùng ZSET family với online, nên nếu online hoạt động thì thao tác này cũng hoạt động.
    if(active.length){
      const visitorKey=`analytics:v5:visitors:${today}`;
      const visitSeenKey=`analytics:v5:visit_seen:${today}`;
      for(const vid of active){
        await cmd(["ZADD",visitorKey,"NX",String(now),vid],0);
        const first=num(await cmd(["ZADD",visitSeenKey,"NX",String(now),vid],0));
        if(first===1){
          await cmd(["HINCRBY",`analytics:v5:day:${today}`,"pageviews","1"],0);
          await cmd(["INCR","analytics:v5:pageviews:all"],0);
        }
      }
      await cmd(["EXPIRE",visitorKey,String(RETENTION)],0);
      await cmd(["EXPIRE",visitSeenKey,String(RETENTION)],0);
      await cmd(["EXPIRE",`analytics:v5:day:${today}`,String(RETENTION)],0);
    }

    const d30=dates(30),d7=d30.slice(-7);
    const daily=[];
    // Chỉ 30 ngày cho dashboard chính => tối đa 60 Redis calls, rõ và ổn định.
    for(const day of d30) daily.push(await readDay(day));

    const todayRow=daily[daily.length-1]||await readDay(today);
    const yesterdayRow=daily[daily.length-2]||await readDay(yesterday);

    const monthDays=d30.filter(d=>d.startsWith(today.slice(0,7)));
    // year days up to current day; max 365 but only unique calculation when user needs summary
    const startYear=`${today.slice(0,4)}-01-01`;
    const yearDays=dates(365).filter(d=>d>=startYear && d<=today);

    const [vis7,vis30,visMonth,visYear,totalVisitors,totalPageviews,
      devices,topProducts,topSearches,topCompareProducts,topComparePairs,topDeviceModels,topDeviceOs,filters,warrantyRecent
    ]=await Promise.all([
      uniqueVisitors(d7),
      uniqueVisitors(d30),
      uniqueVisitors(monthDays),
      uniqueVisitors(yearDays),
      zcard("analytics:v5:visitors:all"),
      getNum("analytics:v5:pageviews:all"),
      hgetall("analytics:devices:all"),
      top("analytics:product_views:all",12),
      top("analytics:searches:all",12),
      top("analytics:compare_products:all",12),
      top("analytics:compare_pairs:all",12),
      (async()=>{const x=await top("analytics:v2:device_models:all",20);return x.length?x:top("analytics:device_models:all",20)})(),
      (async()=>{const x=await top("analytics:v2:device_os:all",12);return x.length?x:top("analytics:device_os:all",12)})(),
      hgetall("analytics:filters:all"),
      recentWarranty(20)
    ]);

    const rows7=daily.slice(-7);
    const rowsMonth=daily.filter(x=>monthDays.includes(x.date));
    // For annual event totals, read hashes only. Do in small sequential loop for reliability.
    const rowsYear=[];
    for(const day of yearDays){
      if(d30.includes(day)) rowsYear.push(daily[d30.indexOf(day)]);
      else rowsYear.push(await readDay(day));
    }

    const periods={
      today:period([todayRow],todayRow.visitors),
      yesterday:period([yesterdayRow],yesterdayRow.visitors),
      days7:period(rows7,vis7),
      days30:period(daily,vis30),
      month:period(rowsMonth,visMonth),
      year:period(rowsYear,visYear)
    };

    const monthlyMap={};
    for(const x of rowsYear){
      const m=x.date.slice(0,7);
      if(!monthlyMap[m])monthlyMap[m]={month:m,views:0,detailClicks:0,compare:0,zalo:0,warrantyChecks:0,warrantyFound:0};
      for(const k of ["views","detailClicks","compare","zalo","warrantyChecks","warrantyFound"])monthlyMap[m][k]+=num(x[k]);
    }

    return res.status(200).json({
      ok:true,
      analyticsVersion:"v5",
      generatedAt:new Date().toISOString(),
      analyticsDay:today,
      timezone:"Asia/Ho_Chi_Minh",
      periods,
      daily,
      monthly:Object.values(monthlyMap).slice(-12),
      overview:{
        todayVisitors:todayRow.visitors,
        todayViews:todayRow.views,
        onlineNow:active.length,
        totalVisitors,
        totalViews:totalPageviews,
        totalRawViews:totalPageviews,
        detailClicks:await getNum("analytics:v5:detailClicks:all"),
        compareAll:await getNum("analytics:v5:compare:all"),
        zaloAll:await getNum("analytics:v5:zalo:all"),
        todayCompare:todayRow.compare,
        todayZalo:todayRow.zalo,
        todayWarrantyChecks:todayRow.warrantyChecks,
        todayWarrantyFound:todayRow.warrantyFound
      },
      devices,topProducts,topSearches,topCompareProducts,topComparePairs,topDeviceModels,topDeviceOs,filters,warrantyRecent,
      diagnostics:{
        model:"V5-ZSET-HASH",
        todayVisitorKey:`analytics:v5:visitors:${today}`,
        todayDayKey:`analytics:v5:day:${today}`,
        todayVisitors:todayRow.visitors,
        todayViews:todayRow.views,
        onlineNow:active.length,
        activeMigrated:active.length
      }
    });
  }catch(e){
    console.error("Analytics V5 fatal",e);
    return res.status(200).json({
      ok:false,analyticsVersion:"v5",warning:String(e?.message||e),
      analyticsDay:vnDay(),timezone:"Asia/Ho_Chi_Minh",
      periods:{},daily:[],monthly:[],overview:{onlineNow:0},devices:{},
      topProducts:[],topSearches:[],topCompareProducts:[],topComparePairs:[],topDeviceModels:[],topDeviceOs:[],filters:{},warrantyRecent:[]
    });
  }
}
