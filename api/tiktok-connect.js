import {
  configureNewMessageWebhook,
  exchangeTikTokShopCode,
  getAuthorizedShops,
  loadTikTokShopConnection,
  makeTikTokAuthState,
  saveTikTokShopConnection,
  tiktokSellerAuthorizeUrl,
  tiktokShopConfig,
  verifyTikTokAuthState
} from "../lib/tiktok-shop.js";

function baseUrl(req){
  const configured=String(process.env.SITE_URL||process.env.PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
  if(configured) return configured;
  const proto=String(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"sieudidong.vn").split(",")[0].trim();
  return `${proto}://${host}`;
}
function html(res,title,body,status=200){
  res.status(status).setHeader("content-type","text/html; charset=utf-8");
  return res.end(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#f6f7f9;margin:0;padding:30px;color:#111}.box{max-width:680px;margin:60px auto;background:#fff;border:1px solid #ddd;border-radius:16px;padding:28px;line-height:1.55}h1{font-size:24px;margin-top:0}.ok{color:#16803b}.err{color:#b42318}code{background:#f1f2f4;padding:2px 6px;border-radius:6px}</style><div class="box"><h1>${title}</h1>${body}</div></html>`);
}

export default async function handler(req,res){
  res.setHeader("cache-control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  const cfg=tiktokShopConfig();
  if(req.query?.status==="1"){
    const conn=await loadTikTokShopConnection().catch(()=>null);
    return res.json({ok:true,configured:!!(cfg.appKey&&cfg.appSecret&&cfg.serviceId),connected:!!conn,shop:conn?{id:conn.shopId,name:conn.shopName,region:conn.region,scopes:conn.grantedScopes}:null});
  }
  const code=String(req.query?.code||"").trim();
  const state=String(req.query?.state||"").trim();
  const error=String(req.query?.error||"").trim();
  if(error) return html(res,"TikTok Shop chưa kết nối",`<p class="err">TikTok trả về lỗi: <b>${error}</b></p>`,400);
  if(!code){
    try{return res.redirect(302,tiktokSellerAuthorizeUrl(makeTikTokAuthState()));}
    catch(e){return html(res,"Thiếu cấu hình TikTok Shop",`<p class="err">${e.message}</p><p>Hãy thêm App Key, App Secret và Service ID vào Environment Variables trên Vercel.</p>`,500);}
  }
  if(!verifyTikTokAuthState(state)) return html(res,"Kết nối TikTok Shop thất bại",`<p class="err">State không hợp lệ hoặc đã hết hạn. Mở lại <code>/api/tiktok-connect</code> để kết nối lại.</p>`,400);
  try{
    const token=await exchangeTikTokShopCode(code);
    const shops=await getAuthorizedShops(token.access_token);
    if(!shops.length) throw new Error("Tài khoản này chưa trả về TikTok Shop nào được ủy quyền");
    const conn=await saveTikTokShopConnection(token,shops[0]);
    let webhookOk=true, webhookError="";
    try{await configureNewMessageWebhook(conn,`${baseUrl(req)}/api/tiktok-webhook`);}catch(e){webhookOk=false;webhookError=e.message;}
    return html(res,"Đã kết nối TikTok Shop",`<p class="ok"><b>Kết nối thành công.</b></p><p>Shop: <b>${conn.shopName||conn.shopId||"TikTok Shop"}</b></p><p>AI TikTok: <b>${cfg.enabled?"Đang bật":"Đang tắt"}</b></p><p>Webhook NEW_MESSAGE: <b>${webhookOk?"Đã cấu hình":"Chưa cấu hình được"}</b></p>${webhookError?`<p class="err">${webhookError}</p><p>Kiểm tra app đã có scope <code>seller.authorization.info</code> và <code>seller.customer_service</code>.</p>`:""}<p>Có thể đóng trang này và nhắn thử từ tài khoản khách vào TikTok Shop.</p>`);
  }catch(e){
    console.error("TikTok connect:",e);
    return html(res,"Kết nối TikTok Shop thất bại",`<p class="err">${String(e?.message||e)}</p>`,500);
  }
}
