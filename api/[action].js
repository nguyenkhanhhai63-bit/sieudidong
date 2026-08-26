const handlers = {
  "ai-chat": () => import("../lib/public-api/ai-chat.js"),
  "ai-chat-icon": () => import("../lib/public-api/ai-chat-icon.js"),
  "analytics": () => import("../lib/public-api/analytics.js"),
  "bestsellers": () => import("../lib/public-api/bestsellers.js"),
  "installment-settings": () => import("../lib/public-api/installment-settings.js"),
  "service-pricing": () => import("../lib/public-api/service-pricing.js"),
  "compare-ai": () => import("../lib/public-api/compare-ai.js"),
  "products": () => import("../lib/public-api/products.js"),
  "search-popular": () => import("../lib/public-api/search-popular.js"),
  "seo-settings": () => import("../lib/public-api/seo-settings.js"),
  "sitemap": () => import("../lib/public-api/sitemap.js"),
  "specs": () => import("../lib/public-api/specs.js"),
  "version": () => import("../lib/public-api/version.js"),
  "warranty-lookup": () => import("../lib/public-api/warranty-lookup.js"),
  "used-products": () => import("../lib/public-api/used-products.js"),
  "order-products": () => import("../lib/public-api/order-products.js"),
  "order-visibility": () => import("../lib/public-api/order-visibility.js")
};

export default async function handler(req,res){
  const action=String(req.query?.action||"").trim();
  const load=handlers[action];
  if(!load) return res.status(404).json({error:"API không tồn tại"});
  try{
    const mod=await load();
    return await mod.default(req,res);
  }catch(error){
    console.error("Public API dispatch error:",action,error);
    return res.status(500).json({error:"Lỗi API"});
  }
}
