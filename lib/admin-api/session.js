import { isAdmin } from "../admin-auth.js";

export default async function handler(req,res){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }
  const authenticated=await isAdmin(req);
  if(!authenticated) return res.status(401).json({authenticated:false});
  res.setHeader("Cache-Control","no-store, max-age=0");
  return res.status(200).json({authenticated:true});
}
