import {redisGet} from '../redis.js';
const KEY='accessories:manual:settings:v1';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{const raw=await redisGet(KEY);const settings=raw?JSON.parse(raw):{products:[]};return res.status(200).json({ok:true,settings});}
 catch(e){return res.status(200).json({ok:false,settings:{products:[]},error:e.message});}
}
