import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";
const KEY="site:config-table:settings:v1";
const defaults={prefs:{},adjust:{auto:true,font:100,row:100,gap:100,scale:100},updatedAt:0};
const obj=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
function normalize(v={}){const a=obj(v.adjust),p=obj(v.prefs),prefs={};for(const [k,x] of Object.entries(p).slice(0,1500)){const q=obj(x);prefs[String(k).slice(0,180)]={name:String(q.name||'').slice(0,180),hidden:!!q.hidden};}return{prefs,adjust:{auto:a.auto!==false,font:+a.font||100,row:+a.row||100,gap:+a.gap||100,scale:+a.scale||100},updatedAt:Number(v.updatedAt)||0}}
async function read(){try{const raw=await redisCommand(["GET",KEY]);return raw?normalize(JSON.parse(raw)):defaults}catch{return defaults}}
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(!(await isAdmin(req)))return res.status(401).json({error:"Unauthorized"});if(req.method==="GET")return res.status(200).json({ok:true,settings:await read()});if(req.method==="POST"){const settings=normalize({...req.body,updatedAt:Date.now()});await redisCommand(["SET",KEY,JSON.stringify(settings)]);return res.status(200).json({ok:true,settings,updatedAt:settings.updatedAt})}res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"})}
