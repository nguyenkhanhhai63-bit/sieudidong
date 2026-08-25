import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="installment:site:settings";
const DEFAULTS={
  intro:"Siêu Di Động hỗ trợ tư vấn trả góp theo hồ sơ và sản phẩm thực tế. Nhân viên sẽ hỗ trợ số tiền trả trước, kỳ hạn và khoản góp dự kiến trước khi đăng ký.",
  providers:[
    {id:"hd-saison",name:"HD SAISON",logo:"",enabled:true,staff:[]},
    {id:"mirae-asset",name:"Mirae Asset",logo:"",enabled:true,staff:[]}
  ]
};
function clean(v,max=500){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function normalizeStaff(s={}){return {
  name:clean(s.name,80),
  zalo:clean(s.zalo,40).replace(/[^\d+]/g,""),
  note:clean(s.note,120),
  enabled:s.enabled!==false
}}
function normalizeProvider(p={},i=0){return {
  id:clean(p.id,60)||`provider-${i+1}`,
  name:clean(p.name,100)||`Đơn vị ${i+1}`,
  logo:clean(p.logo,500),
  enabled:p.enabled!==false,
  staff:(Array.isArray(p.staff)?p.staff:[]).slice(0,20).map(normalizeStaff).filter(x=>x.name||x.zalo)
}}
function normalize(b={}){return {
  intro:clean(b.intro,1000)||DEFAULTS.intro,
  providers:(Array.isArray(b.providers)?b.providers:DEFAULTS.providers).slice(0,10).map(normalizeProvider)
}}
async function read(){
  try{
    const raw=await redisCommand(["GET",KEY]);
    return raw?normalize(JSON.parse(raw)):structuredClone(DEFAULTS);
  }catch(_){return structuredClone(DEFAULTS)}
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET") return res.status(200).json({ok:true,settings:await read()});
  if(req.method==="POST"){
    const settings=normalize(req.body||{});
    await redisCommand(["SET",KEY,JSON.stringify(settings)]);
    return res.status(200).json({ok:true,settings});
  }
  if(req.method==="DELETE"){
    await redisCommand(["DEL",KEY]);
    return res.status(200).json({ok:true,settings:structuredClone(DEFAULTS)});
  }
  res.setHeader("Allow","GET, POST, DELETE");
  return res.status(405).json({error:"Method not allowed"});
}
