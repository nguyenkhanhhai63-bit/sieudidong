import crypto from "crypto";

export function getCloudinaryConfig(){
  return {
    cloudName: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: String(process.env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: String(process.env.CLOUDINARY_API_SECRET || "").trim(),
    folder: String(process.env.CLOUDINARY_USED_FOLDER || "sieu-di-dong/may-cu").trim()
  };
}

export function cloudinaryConfigured(){
  const c=getCloudinaryConfig();
  return Boolean(c.cloudName && c.apiKey && c.apiSecret);
}

export function signCloudinaryParams(params={}){
  const {apiSecret}=getCloudinaryConfig();
  if(!apiSecret) throw new Error("Cloudinary chưa được cấu hình");
  const body=Object.entries(params)
    .filter(([,v])=>v!==undefined && v!==null && v!=="")
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>`${k}=${Array.isArray(v)?v.join(","):v}`)
    .join("&");
  return crypto.createHash("sha1").update(body+apiSecret).digest("hex");
}

export async function destroyCloudinaryAsset(publicId){
  const id=String(publicId||"").trim();
  if(!id || !cloudinaryConfigured()) return {ok:false,skipped:true};
  const {cloudName,apiKey}=getCloudinaryConfig();
  const timestamp=Math.floor(Date.now()/1000);
  const signature=signCloudinaryParams({public_id:id,timestamp});
  const body=new URLSearchParams({
    public_id:id,
    timestamp:String(timestamp),
    api_key:apiKey,
    signature
  });
  try{
    const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body
    });
    const data=await r.json().catch(()=>({}));
    return {ok:r.ok,result:data?.result||"",data};
  }catch(error){
    console.error("Cloudinary destroy error:",error);
    return {ok:false,error:String(error?.message||error)};
  }
}

export async function destroyCloudinaryAssets(publicIds=[]){
  const ids=[...new Set((Array.isArray(publicIds)?publicIds:[]).map(x=>String(x||"").trim()).filter(Boolean))];
  const results=[];
  for(const id of ids) results.push(await destroyCloudinaryAsset(id));
  return results;
}
