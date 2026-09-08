import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="facebook:comment:ai:settings:v1";
const DEFAULTS={
  enabled:false,
  prompt:"Trả lời comment Facebook như nhân viên trẻ của Siêu Di Động: ngắn, tự nhiên, đúng trọng tâm, có thể viết tắt nhẹ. Nếu khách hỏi giá/tồn kho/sản phẩm thì dùng đúng dữ liệu AI của website. Không viết kiểu quảng cáo, không dài dòng, không dùng markdown. Nếu khách muốn chốt/đặt/giữ máy thì hướng khách nhắn inbox để nhân viên xử lý đơn.",
  replyDelayMin:2500,
  replyDelayMax:6000,
  maxReplyLength:500,
  ignoreExact:".\n..\n...\nup\nbump\n^^\n❤️\n👍",
  ignoreContains:"tag bạn bè|share bài",
  handoffTerms:"chốt đơn\nchốt máy\nđặt hàng\nđặt máy\ngiữ máy\nmua luôn\ninbox mình\nib mình"
};

function clean(v,max=4000){return String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim().slice(0,max)}
function num(v,min,max,f){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):f}
function normalize(body={}){
  let a=num(body.replyDelayMin,0,30000,DEFAULTS.replyDelayMin), b=num(body.replyDelayMax,0,45000,DEFAULTS.replyDelayMax);
  if(b<a)[a,b]=[b,a];
  return {
    enabled:body.enabled===true,
    prompt:clean(body.prompt,4000)||DEFAULTS.prompt,
    replyDelayMin:a,
    replyDelayMax:b,
    maxReplyLength:num(body.maxReplyLength,80,1000,DEFAULTS.maxReplyLength),
    ignoreExact:clean(body.ignoreExact,3000),
    ignoreContains:clean(body.ignoreContains,3000),
    handoffTerms:clean(body.handoffTerms,3000)
  };
}
async function read(){
  try{const raw=await redisCommand(["GET",KEY]);return raw?{...DEFAULTS,...JSON.parse(raw)}:{...DEFAULTS}}catch{return {...DEFAULTS}}
}
function envStatus(){
  return {
    pageIdConfigured:!!clean(process.env.FACEBOOK_PAGE_ID,300),
    pageTokenConfigured:!!clean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN,4096),
    verifyTokenConfigured:!!clean(process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,500),
    appSecretConfigured:!!clean(process.env.FACEBOOK_APP_SECRET,500),
    graphVersion:clean(process.env.FACEBOOK_GRAPH_VERSION,40)||"v25.0",
    webhookUrl:"https://sieudidong.vn/api/facebook-webhook"
  };
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET") return res.status(200).json({ok:true,settings:await read(),env:envStatus()});
  if(req.method==="POST"){
    const settings=normalize(req.body||{});
    await redisCommand(["SET",KEY,JSON.stringify(settings)]);
    return res.status(200).json({ok:true,settings,env:envStatus(),persisted:true});
  }
  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,settings:{...DEFAULTS},env:envStatus()});
  }
  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
