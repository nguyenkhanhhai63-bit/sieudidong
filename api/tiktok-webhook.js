import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { redisCommand } from "../lib/redis.js";
import { loadTikTokShopConnection, sendTikTokShopText, tiktokShopConfig, verifyTikTokShopWebhook } from "../lib/tiktok-shop.js";

export const config={api:{bodyParser:false}};
const HISTORY_TTL=7*24*60*60;
const DEDUPE_TTL=3*24*60*60;

function clean(v,max=6000){return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
async function rawBody(req){
  const chunks=[];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function parseContent(v){try{return typeof v==="string"?JSON.parse(v):(v||{})}catch{return {}}}
function extractTextEvent(body){
  const data=body?.data||{};
  const sender=data?.sender||{};
  const type=clean(data?.type||data?.msg_type,80).toUpperCase();
  const content=parseContent(data?.content);
  return {
    notificationId:clean(body?.tts_notification_id||data?.message_id,300),
    shopId:clean(body?.shop_id,300),
    messageId:clean(data?.message_id,300),
    conversationId:clean(data?.conversation_id,300),
    senderRole:clean(sender?.role||data?.sender_role,80).toUpperCase(),
    senderId:clean(sender?.im_user_id||data?.sender_id,300),
    type,
    text:clean(content?.content||content?.text||"",6000)
  };
}
async function once(id){
  if(!id) return true;
  try{return (await redisCommand(["SET",`tiktokshop:seen:${id}`,"1","NX","EX",String(DEDUPE_TTL)]))==="OK"}catch{return true}
}
async function getHistory(id){try{const v=await redisCommand(["GET",`tiktokshop:history:${id}`]);return v?JSON.parse(v):[]}catch{return []}}
async function saveHistory(id,h){try{await redisCommand(["SET",`tiktokshop:history:${id}`,JSON.stringify(h.slice(-10)),"EX",String(HISTORY_TTL)])}catch{}}
async function loadProducts(req,q){
  try{
    const proto=String(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
    const host=String(req.headers["x-forwarded-host"]||req.headers.host||"sieudidong.vn").split(",")[0].trim();
    const base=String(process.env.SITE_URL||`${proto}://${host}`).replace(/\/$/,"");
    const r=await fetch(`${base}/api/products`); if(!r.ok) return [];
    const raw=await r.json(); const list=Array.isArray(raw?.products)?raw.products:[];
    const words=clean(q,1000).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>1);
    return list.map((p,i)=>{const vs=Array.isArray(p.variants)?p.variants:[];const prices=vs.map(v=>Number(v.price||0)).filter(n=>n>0);const stockQty=vs.reduce((s,v)=>s+Math.max(0,Number(v.onHand||0)),0);const name=clean(p.name||p.fullName||p.code,220);const nn=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();let score=stockQty>0?1:0;for(const w of words)if(nn.includes(w))score+=w.length>=4?5:2;score+=Math.max(0,1-i*.001);return{name,minPrice:prices.length?Math.min(...prices):Number(p.basePrice||0),maxPrice:prices.length?Math.max(...prices):Number(p.basePrice||0),inStock:stockQty>0,stockStatus:stockQty>0?"Còn hàng":"Hết hàng",stockQty,brand:"",score}}).filter(x=>x.name).sort((a,b)=>b.score-a.score).slice(0,20).map(({score,...x})=>x);
  }catch{return []}
}
async function askAi(req,e,history){
  const proto=String(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"sieudidong.vn").split(",")[0].trim();
  const base=String(process.env.SITE_URL||`${proto}://${host}`).replace(/\/$/,"");
  const products=await loadProducts(req,e.text);
  const r=await fetch(`${base}/api/ai-chat`,{method:"POST",headers:{"content-type":"application/json","x-sieudidong-channel":"tiktok-shop"},body:JSON.stringify({message:e.text,products,history:history.slice(-6),sessionId:`tiktokshop_${e.conversationId}`.slice(0,90),visitorId:`tiktokshop_${e.senderId||e.conversationId}`.slice(0,80),page:"/tiktok-shop-chat"})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(clean(data?.error||`AI HTTP ${r.status}`,500));
  return clean(data?.text,6000);
}
function wantsHuman(t){return /(nhân viên|nhan vien|người thật|nguoi that|gặp người|gap nguoi|tư vấn viên|tu van vien|chốt máy|chot may|giữ máy|giu may)/i.test(clean(t,600))}
function resumeAi(t){return /(ai trả lời|ai tra loi|bot trả lời|bot tra loi|tư vấn ai|tu van ai)/i.test(clean(t,400))}
async function handoff(id,on){try{if(on)return redisCommand(["SET",`tiktokshop:handoff:${id}`,"1","EX","1800"]);return redisCommand(["DEL",`tiktokshop:handoff:${id}`])}catch{}}
async function handoffOn(id){try{return !!(await redisCommand(["GET",`tiktokshop:handoff:${id}`]))}catch{return false}}
function chunks(text){return String(text||"").split(/\n+/).map(x=>clean(x,1000)).filter(Boolean).slice(0,5)}
async function processMessage(req,e){
  if(!tiktokShopConfig().enabled) return;
  const conn=await loadTikTokShopConnection(e.shopId); if(!conn) throw new Error("TikTok Shop chưa được authorize vào web");
  if(resumeAi(e.text)){await handoff(e.conversationId,false);await sendTikTokShopText(conn,e.conversationId,"Được bạn nha, AI tư vấn tiếp đây.");return}
  if(wantsHuman(e.text)){await handoff(e.conversationId,true);await sendTikTokShopText(conn,e.conversationId,"Được bạn nha. Mình nhường cuộc chat để nhân viên tư vấn trực tiếp cho bạn.");return}
  if(await handoffOn(e.conversationId)) return;
  const history=await getHistory(e.conversationId);history.push({role:"user",text:e.text,ts:Date.now()});await saveHistory(e.conversationId,history);
  const reply=await askAi(req,e,history);const out=chunks(reply);if(!out.length)return;
  for(const c of out) await sendTikTokShopText(conn,e.conversationId,c);
  history.push({role:"assistant",text:out.join(" "),ts:Date.now()});await saveHistory(e.conversationId,history);
}

export default async function handler(req,res){
  res.setHeader("cache-control","no-store");
  if(req.method==="GET"){
    const cfg=tiktokShopConfig();
    const conn=await loadTikTokShopConnection().catch(()=>null);
    return res.status(200).json({ok:true,service:"Siêu Di Động TikTok Shop AI webhook",enabled:cfg.enabled,appConfigured:!!(cfg.appKey&&cfg.appSecret),connected:!!conn});
  }
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const raw=await rawBody(req);
  if(!verifyTikTokShopWebhook(raw,req.headers.authorization)) return res.status(401).json({error:"Webhook signature không hợp lệ"});
  let body={};try{body=JSON.parse(raw)}catch{return res.status(400).json({error:"JSON không hợp lệ"})}
  const e=extractTextEvent(body);
  if(!(await once(e.notificationId||e.messageId||crypto.createHash("sha1").update(raw).digest("hex")))) return res.status(200).json({ok:true,duplicate:true});
  if(e.conversationId&&e.text&&e.type==="TEXT"&&e.senderRole==="BUYER") waitUntil(processMessage(req,e).catch(err=>console.error("TikTok Shop AI:",err?.message||err)));
  return res.status(200).json({ok:true});
}
