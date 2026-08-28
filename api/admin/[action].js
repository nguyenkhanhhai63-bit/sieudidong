const handlers = {
  "ai-settings": () => import("../../lib/admin-api/ai-settings.js"),
  "ai-chat-training": () => import("../../lib/admin-api/ai-chat-training.js"),
  "ai-chat-history": () => import("../../lib/admin-api/ai-chat-history.js"),
  "ai-chat-icon": () => import("../../lib/admin-api/ai-chat-icon.js"),
  "analytics": () => import("../../lib/admin-api/analytics.js"),
  "installment-settings": () => import("../../lib/admin-api/installment-settings.js"),
  "service-pricing": () => import("../../lib/admin-api/service-pricing.js"),
  "login": () => import("../../lib/admin-api/login.js"),
  "logout": () => import("../../lib/admin-api/logout.js"),
  "seo-settings": () => import("../../lib/admin-api/seo-settings.js"),
  "spec-links": () => import("../../lib/admin-api/spec-links.js"),
  "used-products": () => import("../../lib/admin-api/used-products.js"),
  "cloudinary-signature": () => import("../../lib/admin-api/cloudinary-signature.js"),
  "order-visibility": () => import("../../lib/admin-api/order-visibility.js"),
  "footer-settings": () => import("../../lib/admin-api/footer-settings.js")
};

export default async function handler(req, res) {
  const action = String(req.query?.action || "").trim();
  const load = handlers[action];

  if (!load) {
    return res.status(404).json({ error: "API admin không tồn tại" });
  }

  try {
    const mod = await load();
    return await mod.default(req, res);
  } catch (error) {
    console.error("Admin API dispatch error:", action, error);
    return res.status(500).json({ error: "Lỗi API quản trị" });
  }
}
