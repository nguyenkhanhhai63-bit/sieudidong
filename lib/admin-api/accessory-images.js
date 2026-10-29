import {isAdmin} from '../admin-auth.js';
import {redisGet,redisSet} from '../redis.js';
const KEY='accessories:sheet:images:v1';
export default async function handler(req,res){
 if(!await isAdmin(req))return res.status(401).json({error:'Unauthorized'});
 res.setHeader('Cache-Control','no-store');
 try{
  const raw=await redisGet(KEY);const images=raw?JSON.parse(raw):{};
  if(req.method==='GET')return res.json({ok:true,images});
  if(req.method==='POST'){
   const id=String(req.body?.id||'');const image=String(req.body?.image||'');
   if(!/^sheet_acc_\d+$/.test(id))return res.status(400).json({error:'ID phụ kiện không hợp lệ'});
   if(image&&!/^https:\/\//i.test(image))return res.status(400).json({error:'Ảnh phải là URL HTTPS'});
   if(image)images[id]=image;else delete images[id];
   await redisSet(KEY,JSON.stringify(images));return res.json({ok:true,images});
  }
  return res.status(405).json({error:'Method not allowed'});
 }catch(e){return res.status(500).json({error:e.message})}
}
