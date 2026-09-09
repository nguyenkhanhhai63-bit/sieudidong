import { redisCommand } from "../redis.js";

const KEY = "order:visibility:hidden-models";

function cleanList(value) {
  const src = Array.isArray(value) ? value : [];
  return [...new Set(src.map(x => String(x ?? "").trim()).filter(Boolean))];
}

export default async function handler(req, res) {
  // Quan trọng: trạng thái ẩn/hiện phải phản ánh ngay, tuyệt đối không cache ở CDN/trình duyệt.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const raw = await redisCommand(["GET", KEY]);
    let parsed = [];
    if (raw) {
      try { parsed = JSON.parse(raw); }
      catch { throw new Error("Dữ liệu cấu hình ẩn/hiện bị lỗi"); }
    }
    const hiddenModels = cleanList(parsed);
    return res.status(200).json({ ok: true, hiddenModels, updatedAt: Date.now() });
  } catch (error) {
    console.error("Order visibility public read error:", error?.message || error);
    // Fail closed: không trả [] vì như vậy máy đã ẩn có thể bị lộ ra ngoài.
    return res.status(503).json({ ok: false, error: "Không đọc được cấu hình hiển thị" });
  }
}
