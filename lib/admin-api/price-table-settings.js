import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";
const KEY="site:price-table:settings:v1";
const defaults={hidden:[],names:{},colors:{},order:[],a4:{enabled:false,font:100,row:100,gap:100,scale:100}};
const cleanObj=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
function normalize(v={}){
 const a=cleanObj(v.a4);
 return {
  hidden:Array.isArray(v.hidden)?v.hidden.map(String).slice(0,1000):[],
  names:Object.fromEntries(Object.entries(cleanObj(v.names)).slice(0,1000).map(([k,x])=>[String(k),String(x).slice(0,160)])),
  colors:Object.fromEntries(Object.entries(cleanObj(v.colors)).slice(0,1000).map(([k,x])=>[String(k),String(x).slice(0,160)])),
  order:Array.isArray(v.order)?v.order.map(String).slice(0,1000):[],
  a4:{enabled:!!a.enabled,font:+a.font||100,row:+a.row||100,gap:+a.gap||100,scale:+a.scale||100}
 };
}
async function read(){try{const raw=await redisCommand(["GET",KEY]);return raw?normalize(JSON.parse(raw)):defaults}catch{return defaults}}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});
 if(req.method==="GET")return res.status(200).json({ok:true,settings:await read()});
 if(req.method==="POST"){const settings=normalize(req.body||{});await redisCommand(["SET",KEY,JSON.stringify(settings)]);return res.status(200).json({ok:true,settings,updatedAt:Date.now()});}
 res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});
}
