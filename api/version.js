export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({
    version:"V129",
    seoAdmin:true,
    uploadReady:true
  });
}
