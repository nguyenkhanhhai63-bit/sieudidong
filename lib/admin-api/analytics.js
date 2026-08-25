import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const VN_OFFSET_MS=7*60*60*1000;
const RETENTION=400*24*60*60;
function vnDay(offset=0){const d=new Date(Date.now()+VN_OFFSET_MS);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
function dates(n){return Array.from({length:n},(_,i)=>vnDay(-(n-1-i)))}
function num(v){return Number(v||0)}
function timeout(ms){return new Promise((_,reject)=>setTimeout(()=>reject(new Error("Redis timeout")),ms))}
async function cmd(args,fallback=null,ms=5000){try{return (await Promise.race([redisCommand(args),timeout(ms)])) ?? fallback}catch(e){console.warn("Analytics Redis:",args?.[0],e?.message||e);return fallback}}
async function zcard(key){return num(await cmd(["ZCARD",key],0))}
async function getNum(key){return num(await cmd(["GET",key],0))}
async function top(key,limit=12){const raw=await cmd(["ZREVRANGE",key,"0",String(limit-1),"WITHSCORES"],[]);if(!Array.isArray(raw))return[];const a=[];for(let i=0;i<raw.length;i+=2)a.push({name:String(raw[i]||""),value:num(raw[i+1])});return a.filter(x=>x.name)}
async function hgetall(key){const raw=await cmd(["HGETALL",key],[]);if(Array.isArray(raw)){const o={};for(let i=0;i<raw.length;i+=2)o[String(raw[i])]=num(raw[i+1]);return o}return raw&&typeof raw==="object"?raw:{}}
async function hgetallRaw(key){
  const raw=await cmd(["HGETALL",key],[]);
  if(Array.isArray(raw)){const o={};for(let i=0;i<raw.length;i+=2)o[String(raw[i])]=String(raw[i+1]??"");return o}
  return raw&&typeof raw==="object"?Object.fromEntries(Object.entries(raw).map(([k,v])=>[String(k),String(v??"")])):{};
}
async function topAcross(prefix,days,limit=12){
  if(!days.length)return[];
  if(days.length===1)return top(`${prefix}${days[0]}`,limit);
  const temp=`analytics:v5:tmp:rank:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  const keys=days.map(d=>`${prefix}${d}`);
  const ok=await cmd(["ZUNIONSTORE",temp,String(keys.length),...keys],0,7000);
  if(!num(ok))return[];
  await cmd(["EXPIRE",temp,"30"],0,2000);
  return top(temp,limit);
}
async function deviceStatsAcross(days){
  const typeByVisitor=new Map(), modelByVisitor=new Map(), osByVisitor=new Map();
  for(const day of days){
    const [types,models,oses]=await Promise.all([
      hgetallRaw(`analytics:v5:device_type_by_visitor:${day}`),
      hgetallRaw(`analytics:v5:device_model_by_visitor:${day}`),
      hgetallRaw(`analytics:v5:device_os_by_visitor:${day}`)
    ]);
    for(const [vid,v] of Object.entries(types)) if(v) typeByVisitor.set(vid,v);
    for(const [vid,v] of Object.entries(models)) if(v) modelByVisitor.set(vid,v);
    for(const [vid,v] of Object.entries(oses)) if(v) osByVisitor.set(vid,v);
  }
  const devices={mobile:0,desktop:0,tablet:0,other:0};
  for(const v of typeByVisitor.values()) devices[v in devices?v:"other"]++;
  const rank=(map,limit)=>{
    const counts=new Map();
    for(const v of map.values())counts.set(v,(counts.get(v)||0)+1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([name,value])=>({name,value}));
  };
  return {devices,models:rank(modelByVisitor,20),os:rank(osByVisitor,12)};
}
async function recentWarranty(limit=20){const raw=await cmd(["LRANGE","analytics:warranty_recent","0",String(limit-1)],[]);if(!Array.isArray(raw))return[];return raw.map(x=>{try{return JSON.parse(String(x||"{}"))}catch{return null}}).filter(Boolean)}

// Đọc toàn bộ thống kê ngày bằng MỘT Redis round-trip thay vì hàng trăm lệnh tuần tự.
async function readDays(days){
  if(!days.length)return[];
  const script=`
    local out={}
    for i,key in ipairs(KEYS) do
      local dayKey='analytics:v5:day:'..key
      local h=redis.call('HGETALL',dayKey)
      -- Tương thích dữ liệu tra bảo hành cũ: trước đây counters nằm ở key riêng,
      -- trong khi dashboard chỉ đọc hash analytics:v5:day:* nên luôn hiện 0.
      if not redis.call('HGET',dayKey,'warrantyChecks') then
        local n=redis.call('GET','analytics:warranty_checks:day:'..key)
        if n then table.insert(h,'warrantyChecks'); table.insert(h,n) end
      end
      if not redis.call('HGET',dayKey,'warrantyFound') then
        local n=redis.call('GET','analytics:warranty_found:day:'..key)
        if n then table.insert(h,'warrantyFound'); table.insert(h,n) end
      end
      if not redis.call('HGET',dayKey,'warrantyNotFound') then
        local n=redis.call('GET','analytics:warranty_not_found:day:'..key)
        if n then table.insert(h,'warrantyNotFound'); table.insert(h,n) end
      end
      if not redis.call('HGET',dayKey,'warrantyErrors') then
        local n=redis.call('GET','analytics:warranty_error:day:'..key)
        if n then table.insert(h,'warrantyErrors'); table.insert(h,n) end
      end
      local v=redis.call('ZCARD','analytics:v5:visitors:'..key)
      table.insert(out,key); table.insert(out,tostring(v)); table.insert(out,h)
    end
    return out`;
  const raw=await cmd(["EVAL",script,String(days.length),...days],null,7000);
  if(!Array.isArray(raw)) return days.map(date=>({date,visitors:0,views:0,rawViews:0,detailClicks:0,compare:0,zalo:0,aiOpens:0,aiQuestions:0,warrantyChecks:0,warrantyFound:0,warrantyNotFound:0,warrantyErrors:0}));
  const rows=[];
  for(let i=0;i<raw.length;i+=3){
    const date=String(raw[i]||""); const visitors=num(raw[i+1]); const hraw=Array.isArray(raw[i+2])?raw[i+2]:[]; const h={};
    for(let j=0;j<hraw.length;j+=2)h[String(hraw[j])]=num(hraw[j+1]);
    rows.push({date,visitors,views:num(h.pageviews),rawViews:num(h.pageviews),detailClicks:num(h.detailClicks),compare:num(h.compare),zalo:num(h.zalo),aiOpens:num(h.aiOpens),aiQuestions:num(h.aiQuestions),warrantyChecks:num(h.warrantyChecks),warrantyFound:num(h.warrantyFound),warrantyNotFound:num(h.warrantyNotFound),warrantyErrors:num(h.warrantyErrors)});
  }
  return rows;
}
async function uniqueVisitors(days){if(!days.length)return 0;if(days.length===1)return zcard(`analytics:v5:visitors:${days[0]}`);const temp=`analytics:v5:tmp:union:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;const keys=days.map(d=>`analytics:v5:visitors:${d}`);const count=num(await cmd(["ZUNIONSTORE",temp,String(keys.length),...keys],0,7000));cmd(["EXPIRE",temp,"30"],0,2000);return count}
async function uniquePhones(days){if(!days.length)return 0;return num(await cmd(["PFCOUNT",...days.map(d=>`analytics:warranty_phones:day:${d}`)],0,5000))}
async function uniqueAiUsers(days){
  if(!days.length)return 0;
  if(days.length===1)return zcard(`analytics:v5:ai_users:${days[0]}`);
  const temp=`analytics:v5:tmp:ai_union:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  const keys=days.map(d=>`analytics:v5:ai_users:${d}`);
  const count=num(await cmd(["ZUNIONSTORE",temp,String(keys.length),...keys],0,7000));
  cmd(["EXPIRE",temp,"30"],0,2000);
  return count;
}
const sum=(rows,key)=>rows.reduce((a,x)=>a+num(x?.[key]),0);
function period(rows,visitors,warrantyPhones=0,aiUsers=0){return{visitors:num(visitors),views:sum(rows,"views"),detailClicks:sum(rows,"detailClicks"),compare:sum(rows,"compare"),zalo:sum(rows,"zalo"),aiUsers:num(aiUsers),aiOpens:sum(rows,"aiOpens"),aiQuestions:sum(rows,"aiQuestions"),warrantyChecks:sum(rows,"warrantyChecks"),warrantyFound:sum(rows,"warrantyFound"),warrantyPhones:num(warrantyPhones)}}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  try{
    const today=vnDay(), now=Date.now(), onlineMin=String(now-5*60*1000);
    await cmd(["ZREMRANGEBYSCORE","analytics:online","0",onlineMin],0,3000);
    const onlineIds=await cmd(["ZRANGEBYSCORE","analytics:online",onlineMin,"+inf"],[],4000);
    const active=[...new Set((Array.isArray(onlineIds)?onlineIds:[]).map(String).filter(Boolean))];

    // Người đang online luôn phải xuất hiện trong khách hôm nay, nhưng KHÔNG tự cộng pageview giả.
    if(active.length){
      const visitorKey=`analytics:v5:visitors:${today}`;
      for(const vid of active) await cmd(["ZADD",visitorKey,"NX",String(now),vid],0,2500);
      await cmd(["EXPIRE",visitorKey,String(RETENTION)],0,2000);
    }

    const d30=dates(30), d7=d30.slice(-7), startYear=`${today.slice(0,4)}-01-01`, yearDays=dates(366).filter(d=>d>=startYear&&d<=today), monthDays=yearDays.filter(d=>d.startsWith(today.slice(0,7)));
    const rowsYear=await readDays(yearDays);
    const rowMap=new Map(rowsYear.map(x=>[x.date,x]));
    const daily=d30.map(d=>rowMap.get(d)||{date:d,visitors:0,views:0,rawViews:0,detailClicks:0,compare:0,zalo:0,aiOpens:0,aiQuestions:0,warrantyChecks:0,warrantyFound:0,warrantyNotFound:0,warrantyErrors:0});
    const todayRow=rowMap.get(today)||daily[daily.length-1];
    const yesterdayRow=rowMap.get(vnDay(-1))||daily[daily.length-2];
    const rows7=d7.map(d=>rowMap.get(d)).filter(Boolean), rowsMonth=monthDays.map(d=>rowMap.get(d)).filter(Boolean);

    const [vis7,vis30,visMonth,visYear,phonesToday,phones7,phones30,phonesMonth,phonesYear,totalVisitors,totalPageviews,devices,topProducts,topSearches,topCompareProducts,topComparePairs,modelsV2,modelsOld,osV2,osOld,filters,warrantyRecent,warrantyPhonesAll]=await Promise.all([
      uniqueVisitors(d7),uniqueVisitors(d30),uniqueVisitors(monthDays),uniqueVisitors(yearDays),
      uniquePhones([today]),uniquePhones(d7),uniquePhones(d30),uniquePhones(monthDays),uniquePhones(yearDays),
      zcard("analytics:v5:visitors:all"),getNum("analytics:v5:pageviews:all"),hgetall("analytics:devices:all"),
      top("analytics:product_views:all",12),top("analytics:searches:all",12),top("analytics:compare_products:all",12),top("analytics:compare_pairs:all",12),
      top("analytics:v2:device_models:all",20),top("analytics:device_models:all",20),top("analytics:v2:device_os:all",12),top("analytics:device_os:all",12),
      hgetall("analytics:filters:all"),recentWarranty(20),num(await cmd(["PFCOUNT","analytics:warranty_phones:all"],0,5000))
    ]);

    const [aiToday,aiYesterday,ai7,ai30,aiMonth,aiYear]=await Promise.all([
      uniqueAiUsers([today]),uniqueAiUsers([vnDay(-1)]),uniqueAiUsers(d7),
      uniqueAiUsers(d30),uniqueAiUsers(monthDays),uniqueAiUsers(yearDays)
    ]);

    const periods={
      today:period([todayRow],todayRow.visitors,phonesToday,aiToday),
      yesterday:period([yesterdayRow],yesterdayRow.visitors,await uniquePhones([vnDay(-1)]),aiYesterday),
      days7:period(rows7,vis7,phones7,ai7),
      days30:period(daily,vis30,phones30,ai30),
      month:period(rowsMonth,visMonth,phonesMonth,aiMonth),
      year:period(rowsYear,visYear,phonesYear,aiYear)
    };

    // V350: toàn bộ các bảng/ranking dưới dashboard đi theo kỳ đang chọn.
    const periodDays={
      today:[today],
      yesterday:[vnDay(-1)],
      days7:d7,
      days30:d30,
      month:monthDays,
      year:yearDays
    };
    const rankingsByPeriod={};
    for(const [periodKey,daysForPeriod] of Object.entries(periodDays)){
      const [productRanks,searchRanks,compareProductRanks,comparePairRanks,devicePeriod]=await Promise.all([
        topAcross("analytics:v5:product_views:",daysForPeriod,12),
        topAcross("analytics:v5:searches:",daysForPeriod,12),
        topAcross("analytics:v5:compare_products:",daysForPeriod,12),
        topAcross("analytics:v5:compare_pairs:",daysForPeriod,12),
        deviceStatsAcross(daysForPeriod)
      ]);
      rankingsByPeriod[periodKey]={
        topProducts:productRanks,
        topSearches:searchRanks,
        topCompareProducts:compareProductRanks,
        topComparePairs:comparePairRanks,
        devices:devicePeriod.devices,
        topDeviceModels:devicePeriod.models,
        topDeviceOs:devicePeriod.os
      };
    }
    const monthlyMap={};
    for(const x of rowsYear){const m=x.date.slice(0,7);if(!monthlyMap[m])monthlyMap[m]={month:m,views:0,detailClicks:0,compare:0,zalo:0,aiOpens:0,aiQuestions:0,warrantyChecks:0,warrantyFound:0};for(const k of ["views","detailClicks","compare","zalo","aiOpens","aiQuestions","warrantyChecks","warrantyFound"])monthlyMap[m][k]+=num(x[k])}
    const p30=period(daily,vis30,phones30), p7=period(rows7,vis7,phones7);
    return res.status(200).json({ok:true,analyticsVersion:"v350-period-rankings",generatedAt:new Date().toISOString(),analyticsDay:today,timezone:"Asia/Ho_Chi_Minh",periods,rankingsByPeriod,history:rowsYear,daily,monthly:Object.values(monthlyMap).slice(-12),overview:{todayVisitors:todayRow.visitors,todayViews:todayRow.views,onlineNow:active.length,totalVisitors,totalViews:totalPageviews,totalRawViews:totalPageviews,views7:p7.views,views30:p30.views,visitors30:vis30,detailClicks:await getNum("analytics:v5:detailClicks:all"),compareAll:await getNum("analytics:v5:compare:all"),zaloAll:await getNum("analytics:v5:zalo:all"),todayCompare:todayRow.compare,compare30:p30.compare,todayZalo:todayRow.zalo,zalo30:p30.zalo,todayAiUsers:aiToday,aiUsers30:ai30,todayAiOpens:todayRow.aiOpens,aiOpens30:sum(daily,"aiOpens"),todayAiQuestions:todayRow.aiQuestions,aiQuestions30:sum(daily,"aiQuestions"),aiUsersAll:await zcard("analytics:v5:ai_users:all"),aiQuestionsAll:await getNum("analytics:v5:ai_questions:all"),todayWarrantyChecks:todayRow.warrantyChecks,warrantyChecks7:p7.warrantyChecks,warrantyChecks30:p30.warrantyChecks,warrantyChecksAll:sum(rowsYear,"warrantyChecks"),warrantyPhonesToday:phonesToday,warrantyPhones30:phones30,warrantyPhonesAll,todayWarrantyFound:todayRow.warrantyFound,warrantyFound30:p30.warrantyFound},devices,topProducts,topSearches,topCompareProducts,topComparePairs,topDeviceModels:modelsV2.length?modelsV2:modelsOld,topDeviceOs:osV2.length?osV2:osOld,filters,warrantyRecent,diagnostics:{model:"V6-BATCHED",todayVisitors:todayRow.visitors,todayViews:todayRow.views,onlineNow:active.length,daysRead:rowsYear.length}});
  }catch(e){console.error("Analytics V6 fatal",e);return res.status(503).json({ok:false,error:"Không thể đọc dữ liệu thống kê",detail:String(e?.message||e)})}
}
