
import { redisCommand } from "../redis.js";

function n(v){
  const x=Number(v);
  return Number.isFinite(x)?x:0;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=60, s-maxage=300, stale-while-revalidate=600");

  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const raw=await redisCommand([
      "ZREVRANGE","analytics:searches:all","0","39","WITHSCORES"
    ]);

    const items=[];
    if(Array.isArray(raw)){
      for(let i=0;i<raw.length;i+=2){
        const query=String(raw[i]||"").trim().toLowerCase();
        const count=n(raw[i+1]);
        if(query.length>=2 && count>0){
          items.push({query,count});
        }
      }
    }

    return res.status(200).json({ok:true,items});
  }catch(err){
    console.error("search-popular:",err);
    return res.status(200).json({ok:true,items:[]});
  }
}
