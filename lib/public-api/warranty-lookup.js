
import { lookupWarrantyByPhone, warrantyDigits } from "../warranty-service.js";
import { redisCommand } from "../redis.js";

function vnDay(){
  const d=new Date(Date.now()+7*60*60*1000);
  return d.toISOString().slice(0,10);
}

function maskPhone(phone){
  const s=warrantyDigits(phone);
  if(s.length<7) return s;
  return s.slice(0,4)+"•••"+s.slice(-3);
}

async function recordWarrantyLookup(phoneInput,{status="error",itemCount=0}={}){
  const phone=warrantyDigits(phoneInput);
  if(phone.length<9 || phone.length>11) return;
  const day=vnDay();
  const exp=45*24*60*60;
  const safe=async(args)=>{ try{return await redisCommand(args);}catch(_){return null;} };
  await safe(["INCR","analytics:warranty_checks:all"]);
  await safe(["INCR",`analytics:warranty_checks:day:${day}`]);
  await safe(["EXPIRE",`analytics:warranty_checks:day:${day}`,String(exp)]);
  await safe(["PFADD","analytics:warranty_phones:all",phone]);
  await safe(["PFADD",`analytics:warranty_phones:day:${day}`,phone]);
  await safe(["EXPIRE",`analytics:warranty_phones:day:${day}`,String(exp)]);

  if(status==="found" || status==="not_found" || status==="error"){
    await safe(["INCR",`analytics:warranty_${status}:all`]);
    await safe(["INCR",`analytics:warranty_${status}:day:${day}`]);
    await safe(["EXPIRE",`analytics:warranty_${status}:day:${day}`,String(exp)]);
  }

  const entry=JSON.stringify({
    phone:maskPhone(phone),
    ts:Date.now(),
    status,
    itemCount:Number(itemCount||0)
  });
  await safe(["LPUSH","analytics:warranty_recent",entry]);
  await safe(["LTRIM","analytics:warranty_recent","0","99"]);
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const result=await lookupWarrantyByPhone(req.body?.phone);
    if(result?.code==="INVALID_PHONE"){
      return res.status(400).json({error:result.error});
    }
    await recordWarrantyLookup(req.body?.phone,{
      status:result?.found ? "found" : "not_found",
      itemCount:Array.isArray(result?.items)?result.items.length:0
    });
    return res.status(200).json(result);
  }catch(err){
    console.error("Warranty lookup:",err);
    await recordWarrantyLookup(req.body?.phone,{status:"error",itemCount:0});
    return res.status(500).json({
      error:"Chưa thể tra cứu bảo hành từ hệ thống. Vui lòng thử lại sau."
    });
  }
}
