import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { redisCommand } from "../redis.js";

const SETTINGS_KEY="facebook:comment:ai:settings:v1";
const DEDUPE_TTL=7*24*60*60;
const HISTORY_KEY="facebook:comment:ai:history:v1";
const DEFAULTS={enabled:false,prompt:"Trả lời comment Facebook ngắn, tự nhiên, đúng trọng tâm.",replyDelayMin:2500,replyDelayMax:6000,maxReplyLength:500,ignoreExact:".\n..\n...\nup\nbump\n^^\n❤️\n👍",ignoreContains:"",handoffTerms:"chốt đơn\nchốt máy\nđặt hàng\nđặt máy\ngiữ máy\nmua luôn"};

function clean(v,max=6000){return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function norm(v){return clean(v,2000).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function siteBase(req){const env=clean(process.env.SITE_URL||process.env.PUBLIC_SITE_URL,300).replace(/\/$/,"");if(env)return env;const proto=clean(req.headers?.["x-forwarded-proto"]||"https",20)||"https";const host=clean(req.headers?.["x-forwarded-host"]||req.headers?.host,250);return host?`${proto}://${host}`:"https://sieudidong.vn"}
function pageId(){return clean(process.env.FACEBOOK_PAGE_ID,300)}
function pageToken(){return clean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN,4096)}
function verifyToken(){return clean(process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,500)}
function graphVersion(){return clean(process.env.FACEBOOK_GRAPH_VERSION,40)||"v25.0"}
async function readSettings(){try{const raw=await redisCommand(["GET",SETTINGS_KEY]);return raw?{...DEFAULTS,...JSON.parse(raw)}:{...DEFAULTS}}catch{return {...DEFAULTS}}}
function lines(v){return String(v||"").split(/\r?\n|\|/).map(norm).filter(Boolean)}
function shouldIgnore(message,s){const n=norm(message);if(!n)return true;const exact=lines(s.ignoreExact);if(exact.includes(n))return true;return lines(s.ignoreContains).some(x=>n.includes(x))}
function wantsHandoff(message,s){const n=norm(message);return lines(s.handoffTerms).some(x=>n.includes(x))}
async function markOnce(id){if(!id)return true;try{return (await redisCommand(["SET",`facebook:comment:seen:${id}`,"1","NX","EX",String(DEDUPE_TTL)]))==="OK"}catch{return true}}
function signatureOk(req){const secret=clean(process.env.FACEBOOK_APP_SECRET,500);if(!secret)return true;const sig=clean(req.headers?.["x-hub-signature-256"],500);if(!sig)return false;const raw=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});const expected="sha256="+crypto.createHmac("sha256",secret).update(raw).digest("hex");try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig))}catch{return false}}
function extractEvents(body){
  const out=[];
  if(body?.object!=="page")return out;
  for(const entry of (Array.isArray(body.entry)?body.entry:[])){
    for(const change of (Array.isArray(entry?.changes)?entry.changes:[])){
      if(String(change?.field||"")!=="feed")continue;
      const v=change?.value||{};
      if(String(v.item||"")!=="comment" || String(v.verb||"")!=="add")continue;
      const commentId=clean(v.comment_id||v.comment?.id,300);
      const message=clean(v.message||v.comment?.message,2000);
      const fromId=clean(v.from?.id||v.comment?.from?.id,300);
      const fromName=clean(v.from?.name||v.comment?.from?.name,160);
      const postId=clean(v.post_id||v.parent_id,300);
      if(commentId&&message)out.push({commentId,message,fromId,fromName,postId,entryId:clean(entry?.id,300)});
    }
  }
  return out;
}
function normalizeProducts(raw,question){
  const q=norm(question);const words=q.split(/[^a-z0-9]+/).filter(x=>x.length>1);const list=Array.isArray(raw?.products)?raw.products:[];
  return list.map((p,index)=>{const vars=Array.isArray(p.variants)?p.variants:[];const prices=vars.map(v=>Number(v.price||0)).filter(n=>n>0);const stockQty=vars.reduce((s,v)=>s+Math.max(0,Number(v.onHand||0)),0);const minPrice=prices.length?Math.min(...prices):Number(p.basePrice||0);const maxPrice=prices.length?Math.max(...prices):minPrice;const name=clean(p.name||p.fullName||p.code,220);const nn=norm(name);let score=0;for(const w of words)if(nn.includes(w))score+=w.length>=4?5:2;if(stockQty>0)score++;score+=Math.max(0,1-index*.001);return {name,minPrice,maxPrice,inStock:stockQty>0,stockStatus:stockQty>0?"Còn hàng":"Hết hàng",stockQty,brand:"",score}}).filter(x=>x.name).sort((a,b)=>b.score-a.score).slice(0,20).map(({score,...x})=>x);
}
async function loadProducts(base,q){try{const r=await fetch(`${base}/api/products`,{headers:{"User-Agent":"Sieudidong-Facebook-Comment-AI/1.0"}});return r.ok?normalizeProducts(await r.json(),q):[]}catch{return []}}
async function askWebsiteAi(req,e){
  const base=siteBase(req);const products=await loadProducts(base,e.message);
  const r=await fetch(`${base}/api/ai-chat`,{method:"POST",headers:{"Content-Type":"application/json","X-Sieudidong-Channel":"facebook-comment"},body:JSON.stringify({message:e.message,products,history:[],sessionId:`fb_comment_${e.commentId}`.slice(0,90),visitorId:`fb_${e.fromId||e.commentId}`.slice(0,80),page:"/facebook-comment"})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(clean(data.error||`AI HTTP ${r.status}`,500));return clean(data.text,5000);
}
function fallbackReply(ai,max){const text=String(ai||"").split(/\n+/).map(x=>clean(x,1000)).filter(Boolean).join(" ");return text.slice(0,max).trim()}
async function rewriteForComment(e,ai,s){
  const key=clean(process.env.GEMINI_API_KEY,500);if(!key)return fallbackReply(ai,s.maxReplyLength);
  const model=clean(process.env.GEMINI_MODEL,120)||"gemini-2.5-flash";
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const prompt=["Bạn đang viết đúng 1 câu trả lời comment Facebook cho khách của Siêu Di Động.",s.prompt,`Comment khách: ${e.message}`,`Nội dung tư vấn đã lấy từ AI website: ${ai}`,"Giữ nguyên sự thật về giá/tồn kho/thông tin sản phẩm từ nội dung AI website. Không bịa thêm. Không markdown. Không xuống dòng. Không nhắc mình là AI. Không quá "+s.maxReplyLength+" ký tự."].join("\n");
  try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.55,maxOutputTokens:220}})});const d=await r.json().catch(()=>({}));const t=clean(d?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join(" "),s.maxReplyLength);return t||fallbackReply(ai,s.maxReplyLength)}catch{return fallbackReply(ai,s.maxReplyLength)}
}
async function graphReply(commentId,message){
  const token=pageToken();if(!token)throw new Error("Thiếu FACEBOOK_PAGE_ACCESS_TOKEN");
  const r=await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(commentId)}/comments`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({message:clean(message,1000),access_token:token})});
  const d=await r.json().catch(()=>({}));if(!r.ok||d?.error)throw new Error(clean(d?.error?.message||`Facebook HTTP ${r.status}`,500));return d;
}
async function saveHistory(e,reply,status="replied"){try{const row=JSON.stringify({at:Date.now(),commentId:e.commentId,postId:e.postId,fromName:e.fromName,message:e.message,reply:clean(reply,1000),status});await redisCommand(["LPUSH",HISTORY_KEY,row]);await redisCommand(["LTRIM",HISTORY_KEY,"0","499"])}catch{}}
async function processComment(req,e,s){
  if(!s.enabled)return;
  const pid=pageId();if(pid&&(e.fromId===pid||e.entryId&&e.fromId===e.entryId))return;
  if(shouldIgnore(e.message,s)){await saveHistory(e,"","ignored");return}
  const delay=Math.max(0,Number(s.replyDelayMin)||0)+Math.floor(Math.random()*Math.max(1,(Number(s.replyDelayMax)||0)-(Number(s.replyDelayMin)||0)+1));if(delay)await sleep(delay);
  let reply="";
  if(wantsHandoff(e.message,s)) reply="Dạ được b nha, b nhắn inbox page giúp mình xíu để bên mình hỗ trợ chốt/giữ máy cho nhanh nha.";
  else {const ai=await askWebsiteAi(req,e);if(!ai)return;reply=await rewriteForComment(e,ai,s)}
  if(!reply)return;
  await graphReply(e.commentId,reply);await saveHistory(e,reply,"replied");
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method==="GET"){
    const mode=clean(req.query?.["hub.mode"],50), token=clean(req.query?.["hub.verify_token"],500), challenge=clean(req.query?.["hub.challenge"],1000);
    if(mode==="subscribe"&&challenge){if(verifyToken()&&token===verifyToken())return res.status(200).send(challenge);return res.status(403).send("Verification failed")}
    const s=await readSettings();return res.status(200).json({ok:true,service:"Siêu Di Động Facebook Comment AI",enabled:!!s.enabled,pageConfigured:!!pageId(),tokenConfigured:!!pageToken(),verifyConfigured:!!verifyToken(),graphVersion:graphVersion()});
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!signatureOk(req))return res.status(401).json({error:"Webhook signature không hợp lệ"});
  const events=extractEvents(req.body||{});const s=await readSettings();
  for(const e of events){if(!(await markOnce(e.commentId)))continue;waitUntil(processComment(req,e,s).catch(err=>console.error("Facebook Comment AI:",err?.message||err)))}
  return res.status(200).json({ok:true,received:events.length});
}
