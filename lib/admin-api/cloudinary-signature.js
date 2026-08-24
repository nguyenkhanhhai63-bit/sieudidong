import { isAdmin } from "../admin-auth.js";
import { getCloudinaryConfig, cloudinaryConfigured, signCloudinaryParams } from "../cloudinary.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!(await isAdmin(req))) return res.status(401).json({error:"Unauthorized"});
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});

  const cfg=getCloudinaryConfig();
  if(!cloudinaryConfigured()){
    return res.status(200).json({
      ok:false,
      configured:false,
      error:"Cloudinary chưa cấu hình. Hãy thêm CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trên Vercel."
    });
  }

  const timestamp=Math.floor(Date.now()/1000);
  const folder=cfg.folder || "sieu-di-dong/may-cu";
  const signature=signCloudinaryParams({folder,timestamp});

  return res.status(200).json({
    ok:true,
    configured:true,
    cloudName:cfg.cloudName,
    apiKey:cfg.apiKey,
    folder,
    timestamp,
    signature
  });
}
