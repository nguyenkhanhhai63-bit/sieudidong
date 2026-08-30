import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { redisCommand } from "../redis.js";

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
const HANDOFF_TTL_SECONDS = 30 * 60;
const HISTORY_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEDUPE_TTL_SECONDS = 3 * 24 * 60 * 60;

function clean(v,max=6000){
  return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function siteBase(req){
  const env=clean(process.env.SITE_URL||process.env.PUBLIC_SITE_URL,300).replace(/\/$/,"");
  if(env) return env;
  const proto=clean(req.headers?.["x-forwarded-proto"]||"https",20)||"https";
  const host=clean(req.headers?.["x-forwarded-host"]||req.headers?.host,250);
  return host?`${proto}://${host}`:"https://sieudidong.vn";
}
function envEnabled(){
  return !["0","false","off","no"].includes(clean(process.env.TIKTOK_AI_ENABLED||"1",20).toLowerCase());
}
function token(){ return clean(process.env.TIKTOK_BUSINESS_ACCESS_TOKEN,4096); }
function configuredBusinessId(){ return clean(process.env.TIKTOK_BUSINESS_ID,300); }
function maybeJson(v){
  if(v && typeof v==="object") return v;
  if(typeof v!=="string") return {};
  try{return JSON.parse(v)}catch{return {}}
}
function first(...vals){
  for(const v of vals){ const x=clean(v,6000); if(x) return x; }
  return "";
}
function eventPayload(body){
  // Business Messaging webhook sends `content` as stringified JSON. Older/newer payloads may also use `data`.
  const outer=body&&typeof body==="object"?body:{};
  const content=maybeJson(outer.content);
  const data=Object.keys(content).length?content:maybeJson(outer.data);
  const nestedContent=maybeJson(data.content);
  const msg=maybeJson(data.message||outer.message||(Object.keys(nestedContent).length?nestedContent:data));
  return {outer,data,msg};
}
function extractEvent(body){
  const {outer,data,msg}=eventPayload(body);
  const eventType=first(outer.event_type,outer.event,outer.type,data.event_type,data.event,data.type).toUpperCase();
  const messageType=first(msg.message_type,data.message_type,outer.message_type,msg.type).toUpperCase();
  const text=first(msg.text?.body,msg.text,msg.content?.text,msg.content,data.text?.body,data.text,outer.text?.body,outer.text);
  const conversationId=first(msg.conversation_id,data.conversation_id,outer.conversation_id,msg.conversationId,data.conversationId);
  const messageId=first(msg.message_id,data.message_id,outer.message_id,msg.id,data.id,outer.id);
  const businessId=first(msg.business_id,data.business_id,outer.business_id,configuredBusinessId());
  const sender=first(msg.sender,data.sender,outer.sender,msg.from_user_id,data.from_user_id);
  const fromBusiness=[msg.from_business,data.from_business,outer.from_business,msg.is_from_business,data.is_from_business]
    .some(v=>v===true||String(v).toLowerCase()==="true");
  return {eventType,messageType,text,conversationId,messageId,businessId,sender,fromBusiness,raw:body};
}
function looksLikeDirectMessage(e){
  if(!e.conversationId||!e.text) return false;
  if(e.fromBusiness) return false;
  if(e.messageType && !["TEXT","MESSAGE","DIRECT_MESSAGE"].includes(e.messageType)) return false;
  if(!e.eventType) return true;
  return e.eventType.includes("DIRECT_MESSAGE") || e.eventType.includes("MESSAGE") || e.eventType.startsWith("IM_");
}
function userRequestsHuman(text){
  const t=clean(text,500).toLowerCase();
  return /(nhân viên|nhan vien|người thật|nguoi that|gặp người|gap nguoi|tư vấn viên|tu van vien|chốt máy|chot may|giữ máy|giu may)/i.test(t);
}
function resumeAi(text){
  const t=clean(text,300).toLowerCase();
  return /(ai trả lời|ai tra loi|bot trả lời|bot tra loi|tư vấn ai|tu van ai)/i.test(t);
}
async function redisGetJson(key,fallback=[]){
  try{ const raw=await redisCommand(["GET",key]); return raw?JSON.parse(raw):fallback; }catch{return fallback;}
}
async function redisSetJson(key,value,ttl=HISTORY_TTL_SECONDS){
  await redisCommand(["SET",key,JSON.stringify(value),"EX",String(ttl)]);
}
async function markOnce(id){
  if(!id) return true;
  try{
    const r=await redisCommand(["SET",`tiktok:webhook:seen:${id}`,"1","NX","EX",String(DEDUPE_TTL_SECONDS)]);
    return r==="OK";
  }catch{return true;}
}
async function handoffActive(conversationId){
  try{return !!(await redisCommand(["GET",`tiktok:handoff:${conversationId}`]));}catch{return false;}
}
async function setHandoff(conversationId,on){
  if(on) return redisCommand(["SET",`tiktok:handoff:${conversationId}`,"1","EX",String(HANDOFF_TTL_SECONDS)]);
  return redisCommand(["DEL",`tiktok:handoff:${conversationId}`]);
}
async function tiktokSend(businessId,conversationId,text,action=""){
  const accessToken=token();
  if(!accessToken) throw new Error("Thiếu TIKTOK_BUSINESS_ACCESS_TOKEN");
  const payload={
    business_id: businessId||configuredBusinessId(),
    recipient_type:"CONVERSATION",
    recipient:conversationId,
    message_type: action?"SENDER_ACTION":"TEXT"
  };
  if(action) payload.sender_action=action;
  else payload.text={body:clean(text,6000)};
  const r=await fetch(`${TIKTOK_API}/business/message/send/`,{
    method:"POST",
    headers:{"Access-Token":accessToken,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || (data.code!==undefined && Number(data.code)!==0)){
    throw new Error(`TikTok send ${r.status}: ${clean(data.message||data.error?.message||JSON.stringify(data),500)}`);
  }
  return data;
}
function normalizeProducts(raw,question){
  const q=clean(question,1000).toLowerCase();
  const words=q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(x=>x.length>1);
  const list=Array.isArray(raw?.products)?raw.products:[];
  return list.map((p,index)=>{
    const vars=Array.isArray(p.variants)?p.variants:[];
    const prices=vars.map(v=>Number(v.price||0)).filter(n=>n>0);
    const stockQty=vars.reduce((s,v)=>s+Math.max(0,Number(v.onHand||0)),0);
    const minPrice=prices.length?Math.min(...prices):Number(p.basePrice||0);
    const maxPrice=prices.length?Math.max(...prices):minPrice;
    const name=clean(p.name||p.fullName||p.code,220);
    const nn=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    let score=0;
    for(const w of words) if(nn.includes(w)) score+=w.length>=4?5:2;
    if(stockQty>0) score+=1;
    score+=Math.max(0,1-index*0.001);
    return {name,minPrice,maxPrice,inStock:stockQty>0,stockStatus:stockQty>0?"Còn hàng":"Hết hàng",stockQty,brand:"",score};
  }).filter(x=>x.name).sort((a,b)=>b.score-a.score).slice(0,20).map(({score,...x})=>x);
}
async function loadProducts(base,question){
  try{
    const r=await fetch(`${base}/api/products`,{headers:{"User-Agent":"Sieudidong-TikTok-AI/1.0"}});
    if(!r.ok) return [];
    return normalizeProducts(await r.json(),question);
  }catch{return [];}
}
async function askWebsiteAi(req,e,history){
  const base=siteBase(req);
  const products=await loadProducts(base,e.text);
  const r=await fetch(`${base}/api/ai-chat`,{
    method:"POST",
    headers:{"Content-Type":"application/json","X-Sieudidong-Channel":"tiktok"},
    body:JSON.stringify({
      message:e.text,
      products,
      history:history.slice(-6),
      sessionId:`tiktok_${e.conversationId}`.slice(0,90),
      visitorId:`tiktok_${e.sender||e.conversationId}`.slice(0,80),
      page:"/tiktok-dm"
    })
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(clean(data.error||`AI HTTP ${r.status}`,500));
  return data;
}
function splitReply(text){
  const lines=String(text||"").split(/\n+/).map(x=>clean(x,6000)).filter(Boolean);
  if(lines.length) return lines.slice(0,5);
  const t=clean(text,6000); return t?[t]:[];
}
async function saveHistory(conversationId,history){
  const trimmed=history.slice(-10).map(x=>({role:x.role,text:clean(x.text,1000),ts:x.ts||Date.now()}));
  await redisSetJson(`tiktok:history:${conversationId}`,trimmed);
}
async function processDirectMessage(req,e){
  if(!envEnabled()) return;
  const businessId=e.businessId||configuredBusinessId();
  if(!businessId || !e.conversationId) return;

  if(resumeAi(e.text)){
    await setHandoff(e.conversationId,false).catch(()=>{});
    await tiktokSend(businessId,e.conversationId,"Được bạn nha, AI tư vấn tiếp đây.");
    return;
  }
  if(userRequestsHuman(e.text)){
    await setHandoff(e.conversationId,true).catch(()=>{});
    await tiktokSend(businessId,e.conversationId,"Được bạn nha. Mình nhường cuộc chat để nhân viên tư vấn trực tiếp cho bạn.");
    return;
  }
  if(await handoffActive(e.conversationId)) return;

  const history=await redisGetJson(`tiktok:history:${e.conversationId}`,[]);
  history.push({role:"user",text:e.text,ts:Date.now()});
  await saveHistory(e.conversationId,history).catch(()=>{});
  await tiktokSend(businessId,e.conversationId,"","TYPING").catch(()=>{});

  const ai=await askWebsiteAi(req,e,history);
  const chunks=splitReply(ai.text||"");
  if(!chunks.length) return;

  for(let i=0;i<chunks.length;i++){
    if(i>0) await sleep(350+Math.floor(Math.random()*450));
    await tiktokSend(businessId,e.conversationId,chunks[i]);
  }
  history.push({role:"assistant",text:chunks.join(" "),ts:Date.now()});
  await saveHistory(e.conversationId,history).catch(()=>{});
}
function verifySignature(req){
  const secret=clean(process.env.TIKTOK_WEBHOOK_SECRET,500);
  if(!secret) return true; // optional because Business Messaging webhook config may not expose a signing secret on all accounts.
  const sig=first(req.headers?.["x-tiktok-signature"],req.headers?.["tiktok-signature"],req.headers?.["x-signature"]);
  if(!sig) return false;
  const body=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});
  const expected=crypto.createHmac("sha256",secret).update(body).digest("hex");
  const actual=sig.replace(/^sha256=/i,"").trim();
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual));}catch{return false;}
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  if(req.method==="GET"){
    const challenge=clean(req.query?.challenge||req.query?.hub_challenge,1000);
    if(challenge) return res.status(200).send(challenge);
    return res.status(200).json({
      ok:true,
      service:"Siêu Di Động TikTok AI webhook",
      enabled:envEnabled(),
      businessConfigured:!!configuredBusinessId(),
      tokenConfigured:!!token()
    });
  }
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!verifySignature(req)) return res.status(401).json({error:"Webhook signature không hợp lệ"});

  const body=req.body||{};
  const challenge=clean(body.challenge||body?.data?.challenge,1000);
  if(challenge) return res.status(200).json({challenge});

  const e=extractEvent(body);
  const unique=e.messageId||crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex");
  if(!(await markOnce(unique))) return res.status(200).json({ok:true,duplicate:true});

  // TikTok asks webhook callbacks to ACK quickly. Continue the AI work after the HTTP response lifecycle.
  if(looksLikeDirectMessage(e)){
    waitUntil(processDirectMessage(req,e).catch(err=>console.error("TikTok AI process:",err?.message||err)));
  }
  return res.status(200).json({ok:true});
}
