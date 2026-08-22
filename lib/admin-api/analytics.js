
import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

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
async function recentWarranty(limit=20){
  const raw=await safeCommand(["LRANGE","analytics:warranty_recent","0",String(limit-1)],[]);
  if(!Array.isArray(raw)) return [];
  return raw.map(x=>{
    try{
      const v=JSON.parse(String(x||"{}"));
      return {
        phone:String(v.phone||""),
        ts:Number(v.ts||0),
        status:["found","not_found","error"].includes(v.status)?v.status:"error",
        itemCount:Number(v.itemCount||0)
      };
    }catch{return null;}
  }).filter(Boolean);
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
    const d365=dates(365);
    const d30=d365.slice(-30);
    const d7=d365.slice(-7);
    const today=d365[d365.length-1];
    const monthPrefix=today.slice(0,7);
    const yearPrefix=today.slice(0,4);
    const monthDates=d365.filter(d=>d.startsWith(monthPrefix));
    const yearDates=d365.filter(d=>d.startsWith(yearPrefix));

    const [
      dailyViews,dailyZalo,todayVisitors,visitors7,visitors30,
      totalViews,totalVisitors,zaloAll,devices,topProducts,topSearches,onlineNow,detailClicks,filters,
      dailyCompare,compareAll,topCompareProducts,topComparePairs,dailyRawViews,totalRawViews,
      topDeviceModels,topDeviceOs,
      dailyWarrantyChecks,dailyWarrantyFound,dailyWarrantyNotFound,dailyWarrantyErrors,
      warrantyChecksAll,warrantyFoundAll,warrantyNotFoundAll,warrantyErrorsAll,
      warrantyPhonesToday,warrantyPhones7,warrantyPhones30,warrantyPhonesAll,warrantyRecent,
      dailyViews365,dailyZalo365,dailyCompare365,dailyDetailClicks365,dailyWarrantyChecks365,dailyWarrantyFound365
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
      top("analytics:searches:all"),
      (async()=>{
        const now=Date.now();
        await safeCommand(["ZREMRANGEBYSCORE","analytics:online","0",String(now-5*60*1000)],0);
        return n(await safeCommand(["ZCOUNT","analytics:online",String(now-5*60*1000),"+inf"],0));
      })(),
      getNum("analytics:detail_clicks:all"),
      hash("analytics:filters:all"),
      mget(d30.map(d=>`analytics:compare:day:${d}`)),
      getNum("analytics:compare:all"),
      top("analytics:compare_products:all"),
      top("analytics:compare_pairs:all"),
      mget(d30.map(d=>`analytics:raw_pageviews:day:${d}`)),
      getNum("analytics:raw_pageviews:all"),
      (async()=>{
        const v2=await top("analytics:v2:device_models:all",20);
        return v2.length?v2:top("analytics:device_models:all",20);
      })(),
      (async()=>{
        const v2=await top("analytics:v2:device_os:all",12);
        return v2.length?v2:top("analytics:device_os:all",12);
      })(),
      mget(d30.map(d=>`analytics:warranty_checks:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_found:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_not_found:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_error:day:${d}`)),
      getNum("analytics:warranty_checks:all"),
      getNum("analytics:warranty_found:all"),
      getNum("analytics:warranty_not_found:all"),
      getNum("analytics:warranty_error:all"),
      pf([`analytics:warranty_phones:day:${today}`]),
      pf(d7.map(d=>`analytics:warranty_phones:day:${d}`)),
      pf(d30.map(d=>`analytics:warranty_phones:day:${d}`)),
      pf(["analytics:warranty_phones:all"]),
      recentWarranty(20),
      mget(d365.map(d=>`analytics:pageviews:day:${d}`)),
      mget(d365.map(d=>`analytics:zalo:day:${d}`)),
      mget(d365.map(d=>`analytics:compare:day:${d}`)),
      mget(d365.map(d=>`analytics:detail_clicks:day:${d}`)),
      mget(d365.map(d=>`analytics:warranty_checks:day:${d}`)),
      mget(d365.map(d=>`analytics:warranty_found:day:${d}`))
    ]);

    const daily=d30.map((date,i)=>({
      date,
      views:n(dailyViews[i]),
      rawViews:n(dailyRawViews[i]),
      zalo:n(dailyZalo[i]),
      compare:n(dailyCompare[i]),
      warrantyChecks:n(dailyWarrantyChecks[i]),
      warrantyFound:n(dailyWarrantyFound[i]),
      warrantyNotFound:n(dailyWarrantyNotFound[i]),
      warrantyErrors:n(dailyWarrantyErrors[i])
    }));

    const sum=(arr,key)=>arr.reduce((s,x)=>s+n(x[key]),0);
    const last7=daily.slice(-7);

    const history=d365.map((date,i)=>({
      date,
      views:n(dailyViews365[i]),
      zalo:n(dailyZalo365[i]),
      compare:n(dailyCompare365[i]),
      detailClicks:n(dailyDetailClicks365[i]),
      warrantyChecks:n(dailyWarrantyChecks365[i]),
      warrantyFound:n(dailyWarrantyFound365[i])
    }));
    const hByDate=Object.fromEntries(history.map(x=>[x.date,x]));
    const periodSum=(ds,key)=>ds.reduce((acc,d)=>acc+n(hByDate[d]?.[key]),0);
    const visitorsFor=async(ds)=>pf(ds.map(d=>`analytics:visitors:day:${d}`));
    const warrantyPhonesFor=async(ds)=>pf(ds.map(d=>`analytics:warranty_phones:day:${d}`));
    const [visitorsMonth,visitorsYear,warrantyPhonesMonth,warrantyPhonesYear]=await Promise.all([
      visitorsFor(monthDates),visitorsFor(yearDates),warrantyPhonesFor(monthDates),warrantyPhonesFor(yearDates)
    ]);
    const makePeriod=(ds,visitors,warrantyPhones)=>({
      views:periodSum(ds,"views"), visitors:n(visitors), zalo:periodSum(ds,"zalo"),
      compare:periodSum(ds,"compare"), detailClicks:periodSum(ds,"detailClicks"),
      warrantyChecks:periodSum(ds,"warrantyChecks"), warrantyFound:periodSum(ds,"warrantyFound"), warrantyPhones:n(warrantyPhones)
    });
    const periods={
      today:makePeriod([today],todayVisitors,warrantyPhonesToday),
      days7:makePeriod(d7,visitors7,warrantyPhones7),
      days30:makePeriod(d30,visitors30,warrantyPhones30),
      month:makePeriod(monthDates,visitorsMonth,warrantyPhonesMonth),
      year:makePeriod(yearDates,visitorsYear,warrantyPhonesYear)
    };
    const monthlyMap={};
    for(const x of history){
      const month=x.date.slice(0,7);
      if(!monthlyMap[month]) monthlyMap[month]={month,views:0,zalo:0,compare:0,detailClicks:0,warrantyChecks:0,warrantyFound:0};
      for(const k of ["views","zalo","compare","detailClicks","warrantyChecks","warrantyFound"]) monthlyMap[month][k]+=n(x[k]);
    }
    const monthly=Object.values(monthlyMap).slice(-12);

    return res.status(200).json({
      ok:true,
      periods,
      monthly,
      history,
      retentionDays:400,
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
        zaloAll,
        onlineNow,
        detailClicks,
        todayCompare:daily.at(-1)?.compare||0,
        compare7:sum(last7,"compare"),
        compare30:sum(daily,"compare"),
        compareAll,
        todayRawViews:daily.at(-1)?.rawViews||0,
        totalRawViews,
        todayWarrantyChecks:daily.at(-1)?.warrantyChecks||0,
        warrantyChecks7:sum(last7,"warrantyChecks"),
        warrantyChecks30:sum(daily,"warrantyChecks"),
        warrantyChecksAll,
        todayWarrantyFound:daily.at(-1)?.warrantyFound||0,
        warrantyFound30:sum(daily,"warrantyFound"),
        warrantyFoundAll,
        todayWarrantyNotFound:daily.at(-1)?.warrantyNotFound||0,
        warrantyNotFound30:sum(daily,"warrantyNotFound"),
        warrantyNotFoundAll,
        todayWarrantyErrors:daily.at(-1)?.warrantyErrors||0,
        warrantyErrorsAll,
        warrantyPhonesToday,
        warrantyPhones7,
        warrantyPhones30,
        warrantyPhonesAll
      },
      daily,
      devices,
      topProducts,
      topSearches,
      topCompareProducts,
      topComparePairs,
      topDeviceModels,
      topDeviceOs,
      filters,
      warrantyRecent
    });
  }catch(err){
    console.error("Analytics fatal:",err);
    // Always return JSON so the admin UI never ends in browser-level "Failed to fetch"
    return res.status(200).json({
      ok:false,
      warning:err?.message||"Analytics unavailable",
      periods:{},
      monthly:[],
      overview:{},
      daily:dates(30).map(date=>({date,views:0,zalo:0})),
      devices:{},
      topProducts:[],
      topSearches:[],
      topDeviceModels:[],
      topDeviceOs:[]
    });
  }
}
