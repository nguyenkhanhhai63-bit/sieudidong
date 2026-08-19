import { redisCommand } from "../redis.js";
import { isAdmin } from "../admin-auth.js";

const KEY="seo:site:settings";
const DEFAULTS={
  siteName:"Siêu Di Động",
  seoTitle:"Siêu Di Động | Điện thoại & sản phẩm công nghệ",
  description:"Siêu Di Động Quy Nhơn - điện thoại, máy tính bảng và sản phẩm công nghệ. Giá và tình trạng hàng được cập nhật thường xuyên.",
  ogDescription:"Điện thoại, máy tính bảng và sản phẩm công nghệ tại Siêu Di Động Quy Nhơn.",
  favicon:"/assets/logo-square.jpg",
  logo:"/assets/logo-square.jpg",
  areaServed:"Quy Nhơn"
};
function clean(v,max=300){return String(v??"").replace(/[<>]/g,"").trim().slice(0,max)}
function normalize(b={}){return {
  siteName:clean(b.siteName,80)||DEFAULTS.siteName,
  seoTitle:clean(b.seoTitle,120)||DEFAULTS.seoTitle,
  description:clean(b.description,320)||DEFAULTS.description,
  ogDescription:clean(b.ogDescription,320)||DEFAULTS.ogDescription,
  favicon:clean(b.favicon,300)||DEFAULTS.favicon,
  logo:clean(b.logo,300)||DEFAULTS.logo,
  areaServed:clean(b.areaServed,100)||DEFAULTS.areaServed
}}
async function read(){try{const raw=await redisCommand(["GET",KEY]);return raw?{...DEFAULTS,...normalize(JSON.parse(raw))}:{...DEFAULTS}}catch(_){return {...DEFAULTS}}}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method==="GET") return res.status(200).json({ok:true,settings:await read()});
  if(req.method==="POST"){const settings=normalize(req.body||{});await redisCommand(["SET",KEY,JSON.stringify(settings)]);return res.status(200).json({ok:true,settings})}
  if(req.method==="DELETE"){await redisCommand(["DEL",KEY]);return res.status(200).json({ok:true,settings:{...DEFAULTS}})}
  res.setHeader("Allow","GET, POST, DELETE");return res.status(405).json({error:"Method not allowed"});
}
