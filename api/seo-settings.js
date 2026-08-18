import { redisCommand } from "../lib/redis.js";
const KEY="seo:site:settings";
const DEFAULTS={siteName:"Siêu Di Động",seoTitle:"Siêu Di Động | Điện thoại & sản phẩm công nghệ",description:"Siêu Di Động Quy Nhơn - điện thoại, máy tính bảng và sản phẩm công nghệ. Giá và tình trạng hàng được cập nhật thường xuyên.",ogDescription:"Điện thoại, máy tính bảng và sản phẩm công nghệ tại Siêu Di Động Quy Nhơn.",favicon:"/assets/logo-square.jpg",logo:"/assets/logo-square.jpg",areaServed:"Quy Nhơn"};
export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  try{const raw=await redisCommand(["GET",KEY]);const parsed=raw?JSON.parse(raw):{};return res.status(200).json({ok:true,settings:{...DEFAULTS,...parsed}})}catch(_){return res.status(200).json({ok:true,settings:DEFAULTS})}
}
