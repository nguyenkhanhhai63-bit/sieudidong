
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
  try{ await redisCommand(["EXPIRE",key,String(400*24*60*60)]); }catch(_){}
}

function parseDeviceFromServerUa(req,device="other"){
  const ua=String(req.headers?.["user-agent"]||"");
  let brand="";
  let model="";
  let os="";

  const android=ua.match(/Android\s+([^;)\s]+)/i);
  if(android) os="Android "+android[1];

  if(/iPhone/i.test(ua)){
    brand="Apple";
    model="iPhone (không xác định model)";
    const m=ua.match(/OS\s+([\d_]+)/i);
    if(m) os="iOS "+m[1].replace(/_/g,".");
  }else if(/iPad/i.test(ua)){
    brand="Apple";
    model="iPad (không xác định model)";
    const m=ua.match(/OS\s+([\d_]+)/i);
    if(m) os="iPadOS "+m[1].replace(/_/g,".");
  }else if(/Android/i.test(ua)){
    const m=ua.match(/Android[^;]*;\s*(?:[a-z]{2}-[A-Z]{2};\s*)?([^;)]+?)(?:\s+Build\/|;|\))/i);
    if(m) model=clean(m[1],120);

    const text=(model+" "+ua).toLowerCase();
    if(/samsung|sm-[a-z0-9]+/i.test(text)) brand="Samsung";
    else if(/redmi|xiaomi|poco|\bmi\s/i.test(text)) brand="Xiaomi/Redmi";
    else if(/oppo|cph/i.test(text)) brand="OPPO";
    else if(/vivo|v\d{4}/i.test(text)) brand="vivo";
    else if(/oneplus|kb\d|le\d/i.test(text)) brand="OnePlus";
    else if(/honor|bvl-|any-|rea-/i.test(text)) brand="HONOR";
    else if(/realme|rmx/i.test(text)) brand="realme";
    else if(/pixel/i.test(text)) brand="Google";

    if(!model && device==="mobile") model="Android (không xác định model)";
  }else{
    if(/Windows NT 10\.0/i.test(ua)) os="Windows";
    else if(/Windows NT/i.test(ua)) os="Windows";
    else if(/Mac OS X\s+([\d_]+)/i.test(ua)){
      const m=ua.match(/Mac OS X\s+([\d_]+)/i);
      os="macOS "+(m?.[1]||"").replace(/_/g,".");
    }else if(/CrOS/i.test(ua)) os="ChromeOS";
    else if(/Linux/i.test(ua)) os="Linux";
  }

  return {brand:clean(brand,100),model:clean(model,120),os:clean(os,120)};
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
    const serverDevice=parseDeviceFromServerUa(req,device);
    const deviceBrand=clean(req.body?.deviceBrand,100)||serverDevice.brand;
    const deviceModel=clean(req.body?.deviceModel,120)||serverDevice.model;
    const deviceOs=clean(req.body?.deviceOs,120)||serverDevice.os;
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

        // V163: dùng key version mới để khách cũ cũng được ghi nhận lại sau khi nâng cấp.
        // Model chỉ thống kê mobile/tablet. Nếu trình duyệt không cho biết model, vẫn ghi nhãn chung.
        let modelLabel=deviceModel;
        if(!modelLabel && device==="mobile") modelLabel="Điện thoại (không xác định model)";
        if(!modelLabel && device==="tablet") modelLabel="Máy tính bảng (không xác định model)";

        if(modelLabel && (device==="mobile" || device==="tablet")){
          const isNewModel=await redisCommand(["SADD","analytics:v2:device_model_visitors:all",vid]);
          if(Number(isNewModel)===1){
            const label=deviceBrand && !modelLabel.toLowerCase().includes(deviceBrand.toLowerCase())
              ? `${deviceBrand} · ${modelLabel}`
              : modelLabel;
            await redisCommand(["ZINCRBY","analytics:v2:device_models:all","1",label]);
          }
        }

        // Hệ điều hành ghi độc lập với model và áp dụng cả mobile lẫn desktop.
        if(deviceOs){
          const isNewOs=await redisCommand(["SADD","analytics:v2:device_os_visitors:all",vid]);
          if(Number(isNewOs)===1){
            await redisCommand(["ZINCRBY","analytics:v2:device_os:all","1",deviceOs]);
          }
        }
      }
    }
    // V262: bổ sung model/HĐH sau page_view mà không cộng thêm lượt truy cập.
    // Giúp page_view không còn phụ thuộc High Entropy UA API của trình duyệt.
    if(type==="device_enrich" && vid){
      let modelLabel=deviceModel;
      if(!modelLabel && device==="mobile") modelLabel="Điện thoại (không xác định model)";
      if(!modelLabel && device==="tablet") modelLabel="Máy tính bảng (không xác định model)";

      if(modelLabel && (device==="mobile" || device==="tablet")){
        const isNewModel=await redisCommand(["SADD","analytics:v2:device_model_visitors:all",vid]);
        if(Number(isNewModel)===1){
          const label=deviceBrand && !modelLabel.toLowerCase().includes(deviceBrand.toLowerCase())
            ? `${deviceBrand} · ${modelLabel}` : modelLabel;
          await redisCommand(["ZINCRBY","analytics:v2:device_models:all","1",label]);
        }
      }
      if(deviceOs){
        const isNewOs=await redisCommand(["SADD","analytics:v2:device_os_visitors:all",vid]);
        if(Number(isNewOs)===1){
          await redisCommand(["ZINCRBY","analytics:v2:device_os:all","1",deviceOs]);
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
