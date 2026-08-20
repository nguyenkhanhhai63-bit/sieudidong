
import { lookupWarrantyByPhone } from "../warranty-service.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const result=await lookupWarrantyByPhone(req.body?.phone);
    if(result?.code==="INVALID_PHONE"){
      return res.status(400).json({error:result.error});
    }
    return res.status(200).json(result);
  }catch(err){
    console.error("Warranty lookup:",err);
    return res.status(500).json({
      error:"Chưa thể tra cứu bảo hành từ hệ thống. Vui lòng thử lại sau."
    });
  }
}
