
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


const RETENTION=400*24*60*60;
async function expireKey(key){
  try{ await redisCommand(["EXPIRE",key,String(RETENTION)]); }catch(_){}
}
async function markVisitor(day,vid,now=Date.now()){
  if(!vid) return 0;
  const visitorsKey=`analytics:v5:visitors:${day}`;
  // ZADD NX returns 1 for first visit of that visitor on this day.
  const added=Number(await redisCommand(["ZADD",visitorsKey,"NX",String(now),vid])||0);
  await expireKey(visitorsKey);

  // Keep all-time exact visitor set as ZSET as well.
  await redisCommand(["ZADD","analytics:v5:visitors:all","NX",String(now),vid]);
  return added;
}
async function dayIncr(day,field,by=1){
  const key=`analytics:v5:day:${day}`;
  await redisCommand(["HINCRBY",key,field,String(by)]);
  await expireKey(key);
}
async function ensureOneVisit(day,vid){
  if(!vid) return false;
  const key=`analytics:v5:visit_seen:${day}`;
  const added=Number(await redisCommand(["ZADD",key,"NX",String(Date.now()),vid])||0);
  await expireKey(key);
  if(added===1){
    await dayIncr(day,"pageviews",1);
    await redisCommand(["INCR","analytics:v5:pageviews:all"]);
    return true;
  }
  return false;
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
    const aiQuestion=clean(req.body?.question,500);
    const aiAnswer=clean(req.body?.answer,5000);
    const aiSessionId=clean(req.body?.sessionId,120);
    const device=["mobile","desktop","tablet"].includes(req.body?.device) ? req.body.device : "other";
    const action=clean(req.body?.action,80);
    const products=safeProducts(req.body?.products);
    const serverDevice=parseDeviceFromServerUa(req,device);
    const deviceBrand=clean(req.body?.deviceBrand,100)||serverDevice.brand;
    const deviceModel=clean(req.body?.deviceModel,120)||serverDevice.model;
    const deviceOs=clean(req.body?.deviceOs,120)||serverDevice.os;
    const day=vnDay();
    const now=Date.now();

    // BẤT KỲ event hợp lệ nào từ website cũng chứng minh visitor đã vào website hôm nay.
    if(vid){
      await markVisitor(day,vid,now);

      // V350: lưu thông tin thiết bị theo từng ngày để dashboard có thể lọc đúng theo kỳ.
      const deviceTypeKey=`analytics:v5:device_type_by_visitor:${day}`;
      await redisCommand(["HSET",deviceTypeKey,vid,device]);
      await expireKey(deviceTypeKey);

      let dailyModel=deviceModel;
      if(device==="mobile" && !dailyModel) dailyModel="Điện thoại Android (không xác định model)";
      if(device==="tablet" && !dailyModel) dailyModel="Tablet (không xác định model)";
      if(dailyModel){
        const modelKey=`analytics:v5:device_model_by_visitor:${day}`;
        await redisCommand(["HSET",modelKey,vid,dailyModel]);
        await expireKey(modelKey);
      }
      if(deviceOs){
        const osKey=`analytics:v5:device_os_by_visitor:${day}`;
        await redisCommand(["HSET",osKey,vid,deviceOs]);
        await expireKey(osKey);
      }
    }

    if(type==="page_view"){
      // Lượt truy cập = mỗi lần trang web được tải.
      await dayIncr(day,"pageviews",1);
      await redisCommand(["INCR","analytics:v5:pageviews:all"]);

      // Dùng để heartbeat biết visitor này đã có page_view hôm nay.
      const seenKey=`analytics:v5:visit_seen:${day}`;
      await redisCommand(["ZADD",seenKey,"NX",String(now),vid||fallbackVisitor(req)||`anon_${now}`]);
      await expireKey(seenKey);

      // rankings / device stats giữ nguyên hệ thống cũ vì đang hiển thị tốt
      if(vid){
        const isNewDevice=Number(await redisCommand(["SADD","analytics:device_visitors:all",vid])||0)===1;
        if(isNewDevice) await redisCommand(["HINCRBY","analytics:devices:all",device,"1"]);

        let modelLabel=deviceModel;
        if(device==="mobile" && !modelLabel) modelLabel="Điện thoại (không xác định model)";
        if(device==="tablet" && !modelLabel) modelLabel="Tablet (không xác định model)";
        if((device==="mobile"||device==="tablet") && modelLabel){
          await redisCommand(["ZINCRBY","analytics:v2:device_models:all","1",modelLabel]);
        }
        if(deviceOs) await redisCommand(["ZINCRBY","analytics:v2:device_os:all","1",deviceOs]);
      }
    }

    if(type==="heartbeat" && vid){
      await redisCommand(["ZADD","analytics:online",String(now),vid]);
      await redisCommand(["ZREMRANGEBYSCORE","analytics:online","0",String(now-5*60*1000)]);

      // Nếu page_view bị trình duyệt/mạng làm mất nhưng heartbeat tới server,
      // đảm bảo visitor vẫn có tối thiểu 1 lượt truy cập trong ngày.
      await ensureOneVisit(day,vid);
    }

    if(type==="product_view" && product){
      await dayIncr(day,"detailClicks",1);
      await redisCommand(["ZINCRBY","analytics:product_views:all","1",product]);
      await redisCommand(["ZINCRBY",`analytics:v5:product_views:${day}`,"1",product]);
      await expireKey(`analytics:v5:product_views:${day}`);
      await redisCommand(["INCR","analytics:v5:detailClicks:all"]);
    }

    if(type==="compare" || type==="compare_create"){
      await dayIncr(day,"compare",1);
      await redisCommand(["INCR","analytics:v5:compare:all"]);
      for(const p of products){
        await redisCommand(["ZINCRBY","analytics:compare_products:all","1",p]);
        await redisCommand(["ZINCRBY",`analytics:v5:compare_products:${day}`,"1",p]);
      }
      await expireKey(`analytics:v5:compare_products:${day}`);
      if(products.length>=2){
        const pair=[...products].sort((a,b)=>a.localeCompare(b,"vi")).join(" ↔ ");
        await redisCommand(["ZINCRBY","analytics:compare_pairs:all","1",pair]);
        await redisCommand(["ZINCRBY",`analytics:v5:compare_pairs:${day}`,"1",pair]);
        await expireKey(`analytics:v5:compare_pairs:${day}`);
      }
    }

    if(type==="zalo" || type==="zalo_click"){
      await dayIncr(day,"zalo",1);
      await redisCommand(["INCR","analytics:v5:zalo:all"]);
    }

    // AI chatbox analytics.
    // "Khách dùng AI" = visitor duy nhất đã mở chat hoặc gửi câu hỏi trong ngày.
    if((type==="ai_chat_open" || type==="ai_chat_question") && vid){
      const aiDayKey=`analytics:v5:ai_users:${day}`;
      await redisCommand(["ZADD",aiDayKey,"NX",String(now),vid]);
      await expireKey(aiDayKey);
      await redisCommand(["ZADD","analytics:v5:ai_users:all","NX",String(now),vid]);

      if(type==="ai_chat_open"){
        await dayIncr(day,"aiOpens",1);
        await redisCommand(["INCR","analytics:v5:ai_opens:all"]);
      }
      if(type==="ai_chat_question"){
        await dayIncr(day,"aiQuestions",1);
        await redisCommand(["INCR","analytics:v5:ai_questions:all"]);
        // V417: không đẩy câu hỏi riêng vào danh sách nữa. Chờ AI trả lời xong
        // rồi lưu 1 bản ghi hoàn chỉnh gồm cả câu hỏi + câu trả lời.
      }
    }

    // V417: lưu đầy đủ câu khách hỏi và câu AI đã trả lời để Admin xem lại.
    if(type==="ai_chat_answer" && aiQuestion && aiAnswer){
      const historyKey=`analytics:v5:ai_question_history:${day}`;
      const item=JSON.stringify({
        ts:now,
        visitorId:vid,
        sessionId:aiSessionId,
        question:aiQuestion,
        answer:aiAnswer,
        action:action||"ai_chat_answer"
      });
      await redisCommand(["LPUSH",historyKey,item]);
      await redisCommand(["LTRIM",historyKey,"0","499"]);
      await expireKey(historyKey);
    }

    if(type==="search" && query.length>=2){
      await redisCommand(["ZINCRBY","analytics:searches:all","1",query]);
      await redisCommand(["ZINCRBY",`analytics:v5:searches:${day}`,"1",query]);
      await expireKey(`analytics:v5:searches:${day}`);
    }

    if(type==="filter" && action){
      await redisCommand(["HINCRBY","analytics:filters:all",action,"1"]);
    }

    // Device info update event: does not increment pageviews.
    if((type==="device_info" || type==="device_enrich") && vid){
      if(deviceModel) await redisCommand(["ZINCRBY","analytics:v2:device_models:all","1",deviceModel]);
      if(deviceOs) await redisCommand(["ZINCRBY","analytics:v2:device_os:all","1",deviceOs]);
    }

    return res.status(200).json({ok:true,analyticsVersion:"v354-ai-question-history",day});
  }catch(e){
    console.error("Analytics event error",e);
    return res.status(200).json({ok:false,error:String(e?.message||e)});
  }
}
