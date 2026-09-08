import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const MSG_KEY="community:chat:messages:v1";
const ONLINE_KEY="community:chat:online:v1";
const SETTINGS_KEY="community:chat:settings:v1";
const BAN_KEY="community:chat:banned:v1";
const ONLINE_TTL_MS=45000;
const DEFAULTS={enabled:true,title:"Cộng đồng Siêu Di Động",announcement:"Hỏi máy, chia sẻ trải nghiệm và trò chuyện cùng mọi người.",slowModeSeconds:2};
function clean(v,max=500){return String(v??"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,max)}
function safeId(v){return clean(v,90).replace(/[^a-zA-Z0-9_\-:.]/g,"")}
function parseJson(x,fallback=null){try{return JSON.parse(x)}catch{return fallback}}
function messageId(){return Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9)}
async function readSettings(){try{const raw=await redisCommand(["GET",SETTINGS_KEY]);return raw?{...DEFAULTS,...(parseJson(raw,{})||{})}:{...DEFAULTS}}catch{return {...DEFAULTS}}}
async function readMessages(){try{const rows=await redisCommand(["LRANGE",MSG_KEY,"0","149"]);return (Array.isArray(rows)?rows:[]).map(x=>parseJson(x,null)).filter(Boolean).reverse()}catch{return []}}
async function writeMessages(items){await redisCommand(["DEL",MSG_KEY]);for(const m of [...items].reverse())await redisCommand(["RPUSH",MSG_KEY,JSON.stringify(m)]);await redisCommand(["LTRIM",MSG_KEY,"0","249"])}
async function online(){const now=Date.now();try{await redisCommand(["ZREMRANGEBYSCORE",ONLINE_KEY,"0",String(now-ONLINE_TTL_MS)]);return Number(await redisCommand(["ZCARD",ONLINE_KEY]))||0}catch{return 0}}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET")return res.status(200).json({ok:true,settings:await readSettings(),online:await online(),messages:await readMessages()});
  if(req.method==="POST"){
    const action=clean(req.body?.action,30);
    if(action==="settings"){
      const s={enabled:req.body?.enabled!==false,title:clean(req.body?.title,60)||DEFAULTS.title,announcement:clean(req.body?.announcement,180),slowModeSeconds:Math.max(1,Math.min(30,Number(req.body?.slowModeSeconds)||2))};
      await redisCommand(["SET",SETTINGS_KEY,JSON.stringify(s)]);
      return res.status(200).json({ok:true,settings:s});
    }
    if(action==="send"){
      const text=clean(req.body?.text,500);if(!text)return res.status(400).json({error:"Chưa nhập nội dung"});
      const msg={id:messageId(),at:Date.now(),sessionId:"staff",nickname:clean(req.body?.nickname,24)||"Siêu Di Động",role:"staff",text};
      await redisCommand(["LPUSH",MSG_KEY,JSON.stringify(msg)]);await redisCommand(["LTRIM",MSG_KEY,"0","249"]);
      return res.status(200).json({ok:true,message:msg});
    }
    if(action==="delete"){
      const id=safeId(req.body?.id);let a=await readMessages();a=a.filter(x=>String(x.id)!==id);await writeMessages(a);return res.status(200).json({ok:true});
    }
    if(action==="ban"){
      const sid=safeId(req.body?.sessionId);if(!sid||sid==="staff")return res.status(400).json({error:"Phiên không hợp lệ"});
      await redisCommand(["SADD",BAN_KEY,sid]);return res.status(200).json({ok:true});
    }
    if(action==="unban"){
      const sid=safeId(req.body?.sessionId);await redisCommand(["SREM",BAN_KEY,sid]);return res.status(200).json({ok:true});
    }
    if(action==="clear"){
      await redisCommand(["DEL",MSG_KEY]);return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:"Thao tác không hợp lệ"});
  }
  res.setHeader("Allow","GET, POST");
  return res.status(405).json({error:"Method not allowed"});
}
