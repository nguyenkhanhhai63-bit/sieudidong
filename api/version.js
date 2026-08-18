export default function handler(req,res){res.setHeader("Cache-Control","no-store");return res.status(200).json({version:"V128",seoAdmin:true});}
