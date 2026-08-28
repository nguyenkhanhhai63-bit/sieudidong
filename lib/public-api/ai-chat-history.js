import { redisCommand, redisGet, redisSet } from "../redis.js";

const INDEX_KEY="ai:chat:history:index";
const PREFIX="ai:chat:history:";
const MAX_SESSIONS=1200;
const MAX_MESSAGES=80;
const TTL_SECONDS=30*24*60*60;
const ANALYTICS_TTL_SECONDS=400*24*60*60;

function clean(v,max=3000){return String(v??"").replace(/\u0000/g,"").trim().slice(0,max)}
function validSessionId(v){return /^[a-zA-Z0-9_-]{12,90}$/.test(String(v||""))}
function vnDay(){ return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10); }
function cleanVisitor(v){
  const s=clean(v,80);
  return /^[A-Za-z0-9_-]{8,80}$/.test(s)?s:"Khách";
}

async function trimIndex(){
  try{
    const count=Number(await redisCommand(["ZCARD",INDEX_KEY]))||0;
    if(count>MAX_SESSIONS){
      const excess=count-MAX_SESSIONS;
      const old=await redisCommand(["ZRANGE",INDEX_KEY,"0",String(excess-1)]);
      if(Array.isArray(old)&&old.length){
        await redisCommand(["ZREM",INDEX_KEY,...old]);
        for(const id of old){ try{await redisCommand(["DEL",PREFIX+id])}catch(_){} }
      }
    }
  }catch(_){}
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const body=req.body||{};
    const sessionId=clean(body.sessionId,90);
    if(!validSessionId(sessionId)) return res.status(400).json({error:"Phiên chat không hợp lệ"});
    const userText=clean(body.userText,3000);
    const assistantText=clean(body.assistantText,5000);
    if(!userText&&!assistantText) return res.status(400).json({error:"Không có nội dung"});

    const key=PREFIX+sessionId;
    let data={sessionId,startedAt:Date.now(),updatedAt:Date.now(),messages:[],page:"/",meta:{}};
    try{
      const raw=await redisGet(key);
      if(raw){ const parsed=JSON.parse(raw); if(parsed&&typeof parsed==="object") data={...data,...parsed}; }
    }catch(_){}

    const now=Date.now();
    const sentAt=Number(body.sentAt)||now;
    if(userText) data.messages.push({role:"user",text:userText,at:sentAt});
    if(assistantText) data.messages.push({role:"assistant",text:assistantText,at:now});
    if(data.messages.length>MAX_MESSAGES) data.messages=data.messages.slice(-MAX_MESSAGES);
    data.updatedAt=now;
    data.page=clean(body.page||data.page,180)||"/";
    data.meta={
      ...(data.meta||{}),
      needsHuman:body.needsHuman===true,
      source:clean(body.source,80),
      intent:clean(body.intent,120)
    };

    await redisSet(key,JSON.stringify(data));
    await redisCommand(["EXPIRE",key,String(TTL_SECONDS)]);
    await redisCommand(["ZADD",INDEX_KEY,String(now),sessionId]);

    // V418: đây là nguồn lưu chính cho mục “Lịch sử khách hỏi AI chatbox”.
    // Trước đây câu trả lời phụ thuộc vào một request analytics thứ hai từ trình duyệt,
    // nên có thể bị mất dù câu hỏi đã được ghi. Giờ câu hỏi + câu AI trả lời được
    // ghi cùng lúc, cùng request, ngay sau khi AI đã trả lời xong.
    if(userText && assistantText){
      const historyKey=`analytics:v5:ai_question_history:${vnDay()}`;
      const item=JSON.stringify({
        ts:now,
        visitorId:cleanVisitor(body.visitorId),
        sessionId,
        question:userText,
        answer:assistantText,
        action:clean(body.action||"ai_chat_answer",80)
      });
      await redisCommand(["LPUSH",historyKey,item]);
      await redisCommand(["LTRIM",historyKey,"0","499"]);
      await redisCommand(["EXPIRE",historyKey,String(ANALYTICS_TTL_SECONDS)]);
    }

    await trimIndex();
    return res.status(200).json({ok:true,savedAnswer:Boolean(userText&&assistantText)});
  }catch(error){
    console.error("AI chat history save error",error);
    return res.status(500).json({error:"Không lưu được lịch sử chat"});
  }
}
