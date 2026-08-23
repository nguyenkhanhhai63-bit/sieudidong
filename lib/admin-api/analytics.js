import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const VN_OFFSET_MS=7*60*60*1000;
function vnDay(offset=0){
  const d=new Date(Date.now()+VN_OFFSET_MS);
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
function dates(n){ return Array.from({length:n},(_,i)=>vnDay(-(n-1-i))); }
function num(v){ return Number(v||0); }
function timeout(ms){ return new Promise((_,reject)=>setTimeout(()=>reject(new Error("Redis timeout")),ms)); }

async function safeCommand(args,fallback,ms=8000){
  try{
    const result=await Promise.race([redisCommand(args),timeout(ms)]);
    return result ?? fallback;
  }catch(err){
    console.warn("Analytics Redis command failed:",args?.[0],err?.message||err);
    return fallback;
  }
}

/* Không MGET hàng nghìn key trong một lệnh nữa.
   Chia thành lô nhỏ để Redis/Vercel ổn định hơn. */
async function mget(keys,chunkSize=80){
  if(!keys.length) return [];
  const out=[];
  for(let i=0;i<keys.length;i+=chunkSize){
    const part=keys.slice(i,i+chunkSize);
    const a=await safeCommand(["MGET",...part],part.map(()=>null),8000);
    if(Array.isArray(a)) out.push(...a.map(num));
    else out.push(...part.map(()=>0));
  }
  return out;
}
async function getNum(key){ return num(await safeCommand(["GET",key],0)); }
async function pf(keys){
  if(!keys.length) return 0;
  // PFCOUNT nhiều key trong một lần vẫn nhẹ với tối đa 365 key, nhưng chia lô
  // và merge bằng PFMERGE sẽ làm thay đổi Redis nên không dùng. Các period thực tế
  // chỉ gọi <= 31 ngày, riêng năm dùng HLL all-time gần đúng nếu cần.
  return num(await safeCommand(["PFCOUNT",...keys],0,8000));
}
async function top(key,limit=12){
  const raw=await safeCommand(["ZREVRANGE",key,"0",String(limit-1),"WITHSCORES"],[],8000);
  if(!Array.isArray(raw)) return [];
  const out=[];
  for(let i=0;i<raw.length;i+=2) out.push({name:String(raw[i]||""),value:num(raw[i+1])});
  return out.filter(x=>x.name);
}
async function hash(key){
  const raw=await safeCommand(["HGETALL",key],[],8000);
  if(Array.isArray(raw)){
    const out={}; for(let i=0;i<raw.length;i+=2) out[String(raw[i])]=num(raw[i+1]);
    return out;
  }
  if(raw&&typeof raw==="object") return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,num(v)]));
  return {};
}
async function recentWarranty(limit=20){
  const raw=await safeCommand(["LRANGE","analytics:warranty_recent","0",String(limit-1)],[],8000);
  if(!Array.isArray(raw)) return [];
  return raw.map(x=>{
    try{
      const v=JSON.parse(String(x||"{}"));
      return {phone:String(v.phone||""),ts:Number(v.ts||0),status:["found","not_found","error"].includes(v.status)?v.status:"error",itemCount:Number(v.itemCount||0)};
    }catch{return null}
  }).filter(Boolean);
}
const sum=(arr,key)=>arr.reduce((s,x)=>s+num(x?.[key]),0);

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="GET"){ res.setHeader("Allow","GET"); return res.status(405).json({error:"Method not allowed"}); }

  try{
    const d365=dates(365), d30=d365.slice(-30), d7=d365.slice(-7);
    const today=vnDay(0), yesterday=vnDay(-1);
    const monthPrefix=today.slice(0,7), yearPrefix=today.slice(0,4);
    const monthDates=d365.filter(d=>d.startsWith(monthPrefix));
    const yearDates=d365.filter(d=>d.startsWith(yearPrefix));

    /* CRITICAL: Hôm nay/Hôm qua đọc trực tiếp trước.
       Không phụ thuộc mảng lịch sử 365 ngày. */
    const [
      todayVisits,yesterdayVisits,todayVisitors,yesterdayVisitors,
      todayZalo,yesterdayZalo,todayCompare,yesterdayCompare,
      todayDetail,yesterdayDetail,todayWarranty,yesterdayWarranty,
      todayWarrantyFound,yesterdayWarrantyFound,
      warrantyPhonesToday,warrantyPhonesYesterday,
      totalRawViews,totalVisitors,zaloAll,compareAll,detailClicksAll,
      devices,topProducts,topSearches,topCompareProducts,topComparePairs,
      topDeviceModels,topDeviceOs,filters,warrantyRecent,onlineNow
    ]=await Promise.all([
      getNum(`analytics:raw_pageviews:day:${today}`),
      getNum(`analytics:raw_pageviews:day:${yesterday}`),
      pf([`analytics:v3:visitors:day:${today}`]),
      pf([`analytics:v3:visitors:day:${yesterday}`]),
      getNum(`analytics:zalo:day:${today}`),
      getNum(`analytics:zalo:day:${yesterday}`),
      getNum(`analytics:compare:day:${today}`),
      getNum(`analytics:compare:day:${yesterday}`),
      getNum(`analytics:detail_clicks:day:${today}`),
      getNum(`analytics:detail_clicks:day:${yesterday}`),
      getNum(`analytics:warranty_checks:day:${today}`),
      getNum(`analytics:warranty_checks:day:${yesterday}`),
      getNum(`analytics:warranty_found:day:${today}`),
      getNum(`analytics:warranty_found:day:${yesterday}`),
      pf([`analytics:warranty_phones:day:${today}`]),
      pf([`analytics:warranty_phones:day:${yesterday}`]),
      getNum("analytics:raw_pageviews:all"),
      pf(["analytics:v3:visitors:all"]),
      getNum("analytics:zalo:all"),
      getNum("analytics:compare:all"),
      getNum("analytics:detail_clicks:all"),
      hash("analytics:devices:all"),
      top("analytics:product_views:all"),
      top("analytics:searches:all"),
      top("analytics:compare_products:all"),
      top("analytics:compare_pairs:all"),
      (async()=>{const x=await top("analytics:v2:device_models:all",20);return x.length?x:top("analytics:device_models:all",20)})(),
      (async()=>{const x=await top("analytics:v2:device_os:all",12);return x.length?x:top("analytics:device_os:all",12)})(),
      hash("analytics:filters:all"),
      recentWarranty(20),
      (async()=>{
        const now=Date.now();
        const min=String(now-5*60*1000);
        await safeCommand(["ZREMRANGEBYSCORE","analytics:online","0",min],0);
        const active=await safeCommand(["ZRANGEBYSCORE","analytics:online",min,"+inf"],[],8000);
        const ids=Array.isArray(active)?active.map(String).filter(Boolean):[];
        if(ids.length){
          // Tự sửa số hôm nay từ chính danh sách visitor đang online.
          await safeCommand(["PFADD","analytics:v3:visitors:all",...ids],0,8000);
          await safeCommand(["PFADD",`analytics:v3:visitors:day:${today}`,...ids],0,8000);
          await safeCommand(["EXPIRE",`analytics:v3:visitors:day:${today}`,String(400*24*60*60)],0,8000);
        }
        return ids.length;
      })()
    ]);

    /* 30 ngày dùng cho biểu đồ và 7/30-day aggregate.
       Lượt truy cập = raw page views thật, không phải dedup 1 visitor/ngày. */
    const [
      visits30,zalo30,compare30,detail30,warranty30,warrantyFound30,warrantyNotFound30,warrantyErrors30
    ]=await Promise.all([
      mget(d30.map(d=>`analytics:raw_pageviews:day:${d}`)),
      mget(d30.map(d=>`analytics:zalo:day:${d}`)),
      mget(d30.map(d=>`analytics:compare:day:${d}`)),
      mget(d30.map(d=>`analytics:detail_clicks:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_checks:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_found:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_not_found:day:${d}`)),
      mget(d30.map(d=>`analytics:warranty_error:day:${d}`))
    ]);

    const daily=d30.map((date,i)=>({
      date,
      views:num(visits30[i]),
      rawViews:num(visits30[i]),
      zalo:num(zalo30[i]),
      compare:num(compare30[i]),
      detailClicks:num(detail30[i]),
      warrantyChecks:num(warranty30[i]),
      warrantyFound:num(warrantyFound30[i]),
      warrantyNotFound:num(warrantyNotFound30[i]),
      warrantyErrors:num(warrantyErrors30[i])
    }));

    const visitors7=await pf(d7.map(d=>`analytics:v3:visitors:day:${d}`));
    const visitors30=await pf(d30.map(d=>`analytics:v3:visitors:day:${d}`));
    const warrantyPhones7=await pf(d7.map(d=>`analytics:warranty_phones:day:${d}`));
    const warrantyPhones30=await pf(d30.map(d=>`analytics:warranty_phones:day:${d}`));

    /* Lịch sử 365 đọc sau cùng theo lô nhỏ. Nếu phần này lỗi, Hôm nay vẫn đúng. */
    const [visits365,zalo365,compare365,detail365,warranty365,warrantyFound365]=await Promise.all([
      mget(d365.map(d=>`analytics:raw_pageviews:day:${d}`)),
      mget(d365.map(d=>`analytics:zalo:day:${d}`)),
      mget(d365.map(d=>`analytics:compare:day:${d}`)),
      mget(d365.map(d=>`analytics:detail_clicks:day:${d}`)),
      mget(d365.map(d=>`analytics:warranty_checks:day:${d}`)),
      mget(d365.map(d=>`analytics:warranty_found:day:${d}`))
    ]);

    const history=d365.map((date,i)=>({
      date,views:num(visits365[i]),rawViews:num(visits365[i]),zalo:num(zalo365[i]),
      compare:num(compare365[i]),detailClicks:num(detail365[i]),
      warrantyChecks:num(warranty365[i]),warrantyFound:num(warrantyFound365[i])
    }));
    const hByDate=Object.fromEntries(history.map(x=>[x.date,x]));
    const periodSum=(ds,key)=>ds.reduce((acc,d)=>acc+num(hByDate[d]?.[key]),0);

    const visitorsFor=ds=>pf(ds.map(d=>`analytics:v3:visitors:day:${d}`));
    const warrantyPhonesFor=ds=>pf(ds.map(d=>`analytics:warranty_phones:day:${d}`));
    const [visitorsMonth,warrantyPhonesMonth]=await Promise.all([
      visitorsFor(monthDates),warrantyPhonesFor(monthDates)
    ]);
    /* Năm có thể tới 365 HLL key; dùng all-time unique làm upper bound hợp lý nếu hệ thống
       mới bắt đầu lưu <= 1 năm. Khi có dữ liệu >1 năm vẫn giữ history views chính xác. */
    const visitorsYear = yearDates.length<=120 ? await visitorsFor(yearDates) : totalVisitors;
    const warrantyPhonesYear = yearDates.length<=120 ? await warrantyPhonesFor(yearDates) : await pf(["analytics:warranty_phones:all"]);

    const makePeriod=(ds,visitors,warrantyPhones)=>({
      views:periodSum(ds,"views"),visitors:num(visitors),zalo:periodSum(ds,"zalo"),
      compare:periodSum(ds,"compare"),detailClicks:periodSum(ds,"detailClicks"),
      warrantyChecks:periodSum(ds,"warrantyChecks"),warrantyFound:periodSum(ds,"warrantyFound"),warrantyPhones:num(warrantyPhones)
    });

    const last7=daily.slice(-7);
    const periods={
      /* Direct values guarantee today/yesterday aren't zero because history timed out. */
      today:{views:todayVisits,visitors:todayVisitors,zalo:todayZalo,compare:todayCompare,detailClicks:todayDetail,warrantyChecks:todayWarranty,warrantyFound:todayWarrantyFound,warrantyPhones:warrantyPhonesToday},
      yesterday:{views:yesterdayVisits,visitors:yesterdayVisitors,zalo:yesterdayZalo,compare:yesterdayCompare,detailClicks:yesterdayDetail,warrantyChecks:yesterdayWarranty,warrantyFound:yesterdayWarrantyFound,warrantyPhones:warrantyPhonesYesterday},
      days7:{views:sum(last7,"views"),visitors:visitors7,zalo:sum(last7,"zalo"),compare:sum(last7,"compare"),detailClicks:sum(last7,"detailClicks"),warrantyChecks:sum(last7,"warrantyChecks"),warrantyFound:sum(last7,"warrantyFound"),warrantyPhones:warrantyPhones7},
      days30:{views:sum(daily,"views"),visitors:visitors30,zalo:sum(daily,"zalo"),compare:sum(daily,"compare"),detailClicks:sum(daily,"detailClicks"),warrantyChecks:sum(daily,"warrantyChecks"),warrantyFound:sum(daily,"warrantyFound"),warrantyPhones:warrantyPhones30},
      month:makePeriod(monthDates,visitorsMonth,warrantyPhonesMonth),
      year:makePeriod(yearDates,visitorsYear,warrantyPhonesYear)
    };

    const monthlyMap={};
    for(const x of history){
      const month=x.date.slice(0,7);
      if(!monthlyMap[month])monthlyMap[month]={month,views:0,zalo:0,compare:0,detailClicks:0,warrantyChecks:0,warrantyFound:0};
      for(const k of ["views","zalo","compare","detailClicks","warrantyChecks","warrantyFound"])monthlyMap[month][k]+=num(x[k]);
    }

    return res.status(200).json({
      ok:true,
      generatedAt:new Date().toISOString(),
      analyticsDay:today,
      timezone:"Asia/Ho_Chi_Minh",
      periods,
      monthly:Object.values(monthlyMap).slice(-12),
      history,
      retentionDays:400,
      overview:{
        todayViews:todayVisits,
        views7:periods.days7.views,
        views30:periods.days30.views,
        totalViews:totalRawViews,
        todayVisitors,visitors7,visitors30,totalVisitors,
        todayZalo,zalo7:periods.days7.zalo,zalo30:periods.days30.zalo,zaloAll,
        onlineNow,detailClicks:detailClicksAll,
        todayCompare,compare7:periods.days7.compare,compare30:periods.days30.compare,compareAll,
        todayRawViews:todayVisits,totalRawViews,
        todayWarrantyChecks:todayWarranty,warrantyChecks7:periods.days7.warrantyChecks,warrantyChecks30:periods.days30.warrantyChecks,
        todayWarrantyFound,warrantyFound30:periods.days30.warrantyFound,
        warrantyPhonesToday,warrantyPhones7,warrantyPhones30
      },
      daily,devices,topProducts,topSearches,topCompareProducts,topComparePairs,topDeviceModels,topDeviceOs,filters,warrantyRecent,
      diagnostics:{
        today,
        todayVisitKey:`analytics:raw_pageviews:day:${today}`,
        visitorKey:`analytics:v3:visitors:day:${today}`,
        todayVisits,
        todayVisitors,
        onlineNow
      }
    });
  }catch(err){
    console.error("Analytics fatal:",err);
    return res.status(200).json({
      ok:false,warning:err?.message||"Analytics unavailable",
      analyticsDay:vnDay(),timezone:"Asia/Ho_Chi_Minh",
      periods:{},monthly:[],history:[],overview:{},daily:[],devices:{},topProducts:[],topSearches:[],topDeviceModels:[],topDeviceOs:[]
    });
  }
}
