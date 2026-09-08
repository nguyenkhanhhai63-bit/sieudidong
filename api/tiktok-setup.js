import { loadTikTokShopConnection, tiktokShopConfig } from "../lib/tiktok-shop.js";

function baseUrl(req){
  const configured=String(process.env.SITE_URL||process.env.PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
  if(configured) return configured;
  const proto=String(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"sieudidong.vn").split(",")[0].trim();
  return `${proto}://${host}`;
}

export default async function handler(req,res){
  res.setHeader("cache-control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  const cfg=tiktokShopConfig();
  const conn=await loadTikTokShopConnection().catch(()=>null);
  const scopes=Array.isArray(conn?.grantedScopes)?conn.grantedScopes:[];
  return res.status(200).json({
    ok:true,
    app:{appKey:cfg.appKey,serviceId:cfg.serviceId,secretConfigured:!!cfg.appSecret,enabled:cfg.enabled,missing:cfg.missing||[]},
    urls:{redirect:`${baseUrl(req)}/api/tiktok-connect`,webhook:`${baseUrl(req)}/api/tiktok-webhook`,status:`${baseUrl(req)}/api/tiktok-connect?status=1`},
    connection:{connected:!!conn,shopId:conn?.shopId||null,shopName:conn?.shopName||null,region:conn?.region||null,scopes},
    readiness:{authorizationInfo:scopes.includes("seller.authorization.info"),customerService:scopes.includes("seller.customer_service"),readyToChat:!!conn&&scopes.includes("seller.customer_service")}
  });
}
