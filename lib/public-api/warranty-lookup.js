import { lookupWarrantyByPhone, warrantyDigits } from "../warranty-service.js";
import { redisCommand } from "../redis.js";

const HISTORY_KEY="sdd:warranty:history:v803";
const HISTORY_LIMIT=300;

function vnDay(){
  const d=new Date(Date.now()+7*60*60*1000);
  return d.toISOString().slice(0,10);
}

function clean(v,max=260){
  return String(v??"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
}

async function safeRedis(args){
  try{return await redisCommand(args)}catch(err){
    console.error("Warranty Redis:",args?.[0],err?.message||err);
    return null;
  }
}

function historyRecord(phoneInput,result){
  const phone=warrantyDigits(phoneInput);
  const source=Array.isArray(result?.items)?result.items:[];
  const items=source.slice(0,50).map(x=>({
    productName:clean(x?.productName,260),
    productCode:clean(x?.productCode,120),
    purchaseDate:clean(x?.purchaseDate,40),
    warrantyEnd:clean(x?.warrantyEnd,40),
    exchangeEnd:clean(x?.exchangeEnd,40),
    invoiceCode:clean(x?.invoiceCode,80)
  }));
  const status=result?.ok===false?"error":result?.found?"found":"not_found";
  return {
    schemaVersion:803,
    ts:Date.now(),
    phone,
    phoneFull:phone,
    customerName:clean(result?.customerName,180),
    status,
    itemCount:items.length,
    productNames:items.map(x=>x.productName).filter(Boolean),
    purchaseDate:clean(items.find(x=>x.purchaseDate)?.purchaseDate,40),
    purchaseDates:[...new Set(items.map(x=>x.purchaseDate).filter(Boolean))],
    items
  };
}

async function persistLookup(phoneInput,result){
  const phone=warrantyDigits(phoneInput);
  if(phone.length<9||phone.length>11) return;
  const record=historyRecord(phone,result);

  // Lịch sử v803: ghi trực tiếp chính object đang trả cho trang khách.
  // Không đi qua analytics, không fallback schema cũ.
  let historySaved=false;
  try{
    await redisCommand(["LPUSH",HISTORY_KEY,JSON.stringify(record)]);
    await redisCommand(["LTRIM",HISTORY_KEY,"0",String(HISTORY_LIMIT-1)]);
    historySaved=true;
  }catch(err){
    console.error("Warranty history v803 write:",err?.message||err);
  }

  // KPI thống kê giữ riêng, không tham gia render lịch sử.
  const day=vnDay();
  const exp=400*24*60*60;
  await safeRedis(["INCR","analytics:warranty_checks:all"]);
  await safeRedis(["INCR",`analytics:warranty_checks:day:${day}`]);
  await safeRedis(["EXPIRE",`analytics:warranty_checks:day:${day}`,String(exp)]);
  await safeRedis(["HINCRBY",`analytics:v5:day:${day}`,"warrantyChecks","1"]);
  await safeRedis(["EXPIRE",`analytics:v5:day:${day}`,String(exp)]);
  await safeRedis(["PFADD","analytics:warranty_phones:all",phone]);
  await safeRedis(["PFADD",`analytics:warranty_phones:day:${day}`,phone]);
  await safeRedis(["EXPIRE",`analytics:warranty_phones:day:${day}`,String(exp)]);

  if(record.status==="found"||record.status==="not_found"||record.status==="error"){
    const s=record.status;
    await safeRedis(["INCR",`analytics:warranty_${s}:all`]);
    await safeRedis(["INCR",`analytics:warranty_${s}:day:${day}`]);
    await safeRedis(["EXPIRE",`analytics:warranty_${s}:day:${day}`,String(exp)]);
    const field=s==="found"?"warrantyFound":s==="not_found"?"warrantyNotFound":"warrantyErrors";
    await safeRedis(["HINCRBY",`analytics:v5:day:${day}`,field,"1"]);
    await safeRedis(["EXPIRE",`analytics:v5:day:${day}`,String(exp)]);
  }
  return historySaved;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.setHeader("X-SDD-Warranty-Build","v803");
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  const phone=req.body?.phone;
  try{
    const result=await lookupWarrantyByPhone(phone);
    if(result?.code==="INVALID_PHONE") return res.status(400).json({error:result.error});

    // Quan trọng: lưu TRƯỚC khi trả response; dùng đúng object result mà khách sẽ thấy.
    const historySaved=await persistLookup(phone,result);
    return res.status(200).json({...result,_historyBuild:"v803",_historySaved:historySaved});
  }catch(err){
    console.error("Warranty lookup v803:",err);
    const failed={ok:false,found:false,customerName:"",items:[]};
    await persistLookup(phone,failed);
    return res.status(500).json({error:"Chưa thể tra cứu bảo hành từ hệ thống. Vui lòng thử lại sau."});
  }
}
