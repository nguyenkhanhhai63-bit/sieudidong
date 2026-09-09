import { redisCommand } from "../redis.js";
const KEY="installment:site:settings";
const DEFAULTS={
  intro:"Siêu Di Động hỗ trợ tư vấn trả góp theo hồ sơ và sản phẩm thực tế. Nhân viên sẽ hỗ trợ số tiền trả trước, kỳ hạn và khoản góp dự kiến trước khi đăng ký.",
  providers:[
    {id:"hd-saison",name:"HD SAISON",logo:"",enabled:true,staff:[]},
    {id:"mirae-asset",name:"Mirae Asset",logo:"",enabled:true,staff:[]}
  ]
};
export default async function handler(req,res){
  res.setHeader("Cache-Control","public, max-age=30, s-maxage=60");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  try{
    const raw=await redisCommand(["GET",KEY]);
    const data=raw?JSON.parse(raw):DEFAULTS;
    return res.status(200).json({ok:true,settings:data});
  }catch(_){
    return res.status(200).json({ok:true,settings:DEFAULTS});
  }
}
