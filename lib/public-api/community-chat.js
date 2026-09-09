import { redisCommand } from "../redis.js";

const MSG_KEY="community:chat:messages:v1";
const ONLINE_KEY="community:chat:online:v1";
const SETTINGS_KEY="community:chat:settings:v1";
const BAN_KEY="community:chat:banned:v1";
const MAX_MESSAGES=250;
const ONLINE_TTL_MS=45000;

const DEFAULTS={enabled:true,title:"Cộng đồng Siêu Di Động",announcement:"Hỏi máy, chia sẻ trải nghiệm và trò chuyện cùng mọi người.",slowModeSeconds:2};
function clean(v,max=500){return String(v??"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,max)}
function safeId(v){return clean(v,90).replace(/[^a-zA-Z0-9_\-:.]/g,"")}
function nickname(v){let x=clean(v,24);if(!x)x="Khách "+String(Math.floor(1000+Math.random()*9000));return x}
function messageId(){return Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9)}
function parseJson(x,fallback=null){try{return JSON.parse(x)}catch{return fallback}}
async function settings(){try{const raw=await redisCommand(["GET",SETTINGS_KEY]);return raw?{...DEFAULTS,...(parseJson(raw,{})||{})}:{...DEFAULTS}}catch{return {...DEFAULTS}}}
async function isBanned(sid){try{return Number(await redisCommand(["SISMEMBER",BAN_KEY,sid]))===1}catch{return false}}
async function heartbeat(sid,nick){
  if(!sid)return;
  const now=Date.now();
  try{
    await redisCommand(["ZADD",ONLINE_KEY,String(now),sid]);
    await redisCommand(["HSET","community:chat:nicks:v1",sid,nick]);
    await redisCommand(["ZREMRANGEBYSCORE",ONLINE_KEY,"0",String(now-ONLINE_TTL_MS)]);
  }catch{}
}
async function onlineCount(){
  const now=Date.now();
  try{
    await redisCommand(["ZREMRANGEBYSCORE",ONLINE_KEY,"0",String(now-ONLINE_TTL_MS)]);
    return Number(await redisCommand(["ZCARD",ONLINE_KEY]))||0;
  }catch{return 0}
}
async function readMessages(){
  try{
    const rows=await redisCommand(["LRANGE",MSG_KEY,"0","99"]);
    return (Array.isArray(rows)?rows:[]).map(x=>parseJson(x,null)).filter(Boolean).reverse();
  }catch{return []}
}
async function appendMessage(msg){
  await redisCommand(["LPUSH",MSG_KEY,JSON.stringify(msg)]);
  await redisCommand(["LTRIM",MSG_KEY,"0",String(MAX_MESSAGES-1)]);
}
async function rateLimit(sid,slow){
  try{
    const key=`community:chat:rate:${sid}`;
    const ok=await redisCommand(["SET",key,"1","NX","EX",String(Math.max(1,slow||2))]);
    return ok==="OK";
  }catch{return true}
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
  const cfg=await settings();
  const sid=safeId(req.method==="GET"?req.query?.sessionId:req.body?.sessionId);
  const nick=nickname(req.method==="GET"?req.query?.nickname:req.body?.nickname);

  if(req.method==="GET"){
    if(sid) await heartbeat(sid,nick);
    return res.status(200).json({ok:true,settings:cfg,online:await onlineCount(),messages:cfg.enabled?await readMessages():[],banned:sid?await isBanned(sid):false,serverTime:Date.now()});
  }

  if(req.method==="POST"){
    const action=clean(req.body?.action,30)||"send";
    if(!sid)return res.status(400).json({error:"Thiếu phiên trò chuyện"});
    await heartbeat(sid,nick);
    if(action==="heartbeat")return res.status(200).json({ok:true,online:await onlineCount(),banned:await isBanned(sid)});
    if(!cfg.enabled)return res.status(403).json({error:"Kênh cộng đồng đang tạm đóng"});
    if(await isBanned(sid))return res.status(403).json({error:"Bạn đang bị hạn chế gửi tin nhắn trong kênh cộng đồng"});
    if(action!=="send")return res.status(400).json({error:"Thao tác không hợp lệ"});

    const text=clean(req.body?.text,500);
    if(!text)return res.status(400).json({error:"Bạn chưa nhập nội dung"});
    if(!(await rateLimit(sid,Number(cfg.slowModeSeconds)||2)))return res.status(429).json({error:`Gửi hơi nhanh, chờ ${Math.max(1,Number(cfg.slowModeSeconds)||2)} giây nha`});

    const msg={id:messageId(),at:Date.now(),sessionId:sid,nickname:nick,role:"guest",text};
    await appendMessage(msg);
    return res.status(200).json({ok:true,message:msg,online:await onlineCount()});
  }

  res.setHeader("Allow","GET, POST");
  return res.status(405).json({error:"Method not allowed"});
}
