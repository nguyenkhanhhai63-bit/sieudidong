import { isAdmin } from "../admin-auth.js";
import { redisGet, redisSet } from "../redis.js";

const PREFIX="sdd:manual-spec:v1:";
const ORDER=["Màn hình","Hệ điều hành","Camera sau","Camera trước","CPU","RAM","Bộ nhớ trong","Thẻ SIM","Dung lượng pin","Thiết kế"];

function unmark(s=""){return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")}
function norm(s=""){return unmark(s).toLowerCase().replace(/\([^)]*\)/g," ").replace(/\b(5g|4g)\b/g," ").replace(/\b\d+\s*(gb|tb)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function key(name){return PREFIX+encodeURIComponent(norm(name))}
function clean(v){return String(v||"").replace(/\r/g,"").trim().slice(0,3000)}

export default async function handler(req,res){
  if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
  const model=String(req.query?.model||req.body?.model||"").trim();
  if(!model)return res.status(400).json({error:"Thiếu model"});
  if(req.method==="GET"){
    const raw=await redisGet(key(model));
    if(!raw)return res.status(200).json({model,specs:[]});
    try{return res.status(200).json(typeof raw==="string"?JSON.parse(raw):raw)}
    catch{return res.status(200).json({model,specs:[]})}
  }
  if(req.method==="POST"){
    const input=req.body?.specs||{};
    const specs=ORDER.map(label=>({label,value:clean(input[label])})).filter(x=>x.value);
    if(specs.length<1)return res.status(400).json({error:"Chưa nhập thông số"});
    const data={productName:model,specs,updatedAt:new Date().toISOString()};
    await redisSet(key(model),JSON.stringify(data));
    return res.status(200).json({ok:true,...data});
  }
  if(req.method==="DELETE"){
    // Redis wrapper may not expose delete; store empty marker so public won't use it.
    await redisSet(key(model),JSON.stringify({productName:model,specs:[],updatedAt:new Date().toISOString()}));
    return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:"Method not allowed"});
}
