// Deprecated. TikTok Shop webhook now uses /api/tiktok-webhook.js directly
// so Vercel can preserve the raw request body required for signature verification.
export default async function handler(req,res){
  return res.status(410).json({error:"Endpoint cũ đã được thay bằng /api/tiktok-webhook"});
}
