import {redisGet} from '../redis.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, stale-while-revalidate=60');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{const raw=await redisGet('accessories:sheet:images:v1');return res.json({ok:true,images:raw?JSON.parse(raw):{}})}catch(e){return res.json({ok:false,images:{}})}
}
