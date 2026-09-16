import { redisCommand } from "../redis.js";
const KEY="seo:site:settings";
const FALLBACK="https://sieudidong.vn/assets/share-logo-v265.jpg";
export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).end();
  let target=FALLBACK;
  try{
    const raw=await redisCommand(["GET",KEY]);
    const data=raw?JSON.parse(raw):{};
    const v=String(data.shareImage||"").trim();
    if(/^https:\/\//i.test(v)) target=v;
    else if(v.startsWith("/")) target="https://sieudidong.vn"+v;
  }catch(_){}
  res.setHeader("Cache-Control","public, max-age=60, s-maxage=60");
  res.statusCode=302;
  res.setHeader("Location",target);
  res.end();
}
