import { redisCommand } from "../redis.js";
const KEY="used:products:v1";
function pub(x={}){
 return {id:String(x.id||""),name:String(x.name||""),brand:String(x.brand||""),memory:String(x.memory||""),color:String(x.color||""),
 price:Number(x.price||0),condition:String(x.condition||""),battery:String(x.battery||""),warranty:String(x.warranty||""),
 accessories:String(x.accessories||""),note:String(x.note||""),status:x.status==="sold"?"sold":"available",
 images:Array.isArray(x.images)?x.images.slice(0,8):[],updatedAt:String(x.updatedAt||"")};
}
export default async function handler(req,res){
 if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
 res.setHeader("Cache-Control","public, max-age=15, s-maxage=30");
 try{const raw=await redisCommand(["GET",KEY]);const a=raw?JSON.parse(raw):[];return res.status(200).json({ok:true,items:(Array.isArray(a)?a:[]).filter(x=>x?.status!=="sold").map(pub)})}
 catch(_){return res.status(200).json({ok:true,items:[]})}
}