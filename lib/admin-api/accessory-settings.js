import {isAdmin} from '../admin-auth.js';
import {redisGet,redisSet} from '../redis.js';
const KEY='accessories:manual:settings:v1';
export default async function handler(req,res){
 if(!await isAdmin(req))return res.status(401).json({error:'Unauthorized'});
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET'){const raw=await redisGet(KEY);return res.json({ok:true,settings:raw?JSON.parse(raw):{products:[]}})}
  if(req.method==='POST'){const products=Array.isArray(req.body?.products)?req.body.products.filter(x=>x&&x.source!=='sheet'):[];const settings={products,updatedAt:Date.now()};await redisSet(KEY,JSON.stringify(settings));return res.json({ok:true,settings})}
  return res.status(405).json({error:'Method not allowed'});
 }catch(e){return res.status(500).json({error:e.message})}
}
