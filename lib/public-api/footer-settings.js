import { redisCommand } from "../redis.js";
const KEY="site:footer:settings:v1";
export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=30, s-maxage=60, stale-while-revalidate=300");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"});}
  try{const raw=await redisCommand(["GET",KEY]);return res.status(200).json({ok:true,settings:raw?JSON.parse(raw):null});}
  catch(e){return res.status(200).json({ok:true,settings:null});}
}
