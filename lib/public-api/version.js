export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({
    version:"V131",
    seoAdmin:true,
    hobbyOptimized:true,
    serverlessFunctions:2
  });
}
