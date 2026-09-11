import { redisCommand } from "../redis.js";
const KEY="site:price-table:settings:v1";
const defaults={hidden:[],names:{},colors:{},order:[],a4:{enabled:false,font:100,row:100,gap:100,scale:100}};
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 try{const raw=await redisCommand(["GET",KEY]);return res.status(200).json({ok:true,settings:raw?JSON.parse(raw):defaults})}catch{return res.status(200).json({ok:true,settings:defaults})}
}
