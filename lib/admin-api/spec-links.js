import { isAdmin } from "../admin-auth.js";

const SPEC_LINKS_KEY = "sdd:spec-links:v1";

import { redisGet, redisSet } from "../redis.js";

async function getSpecLinks() {
  const raw = await redisGet(SPEC_LINKS_KEY);
  if (!raw) return {};

  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

async function saveSpecLinks(map) {
  await redisSet(SPEC_LINKS_KEY, JSON.stringify(map));
}

function cleanModel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanUrl(value) {
  const url = String(value || "").trim();

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

export default async function handler(req, res) {
  if (!(await isAdmin(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const links = await getSpecLinks();
      return res.status(200).json({ links });
    }

    if (req.method === "POST") {
      const model = cleanModel(req.body?.model);
      const url = cleanUrl(req.body?.url);

      if (!model) {
        return res.status(400).json({ error: "Thiếu tên model" });
      }

      if (!url) {
        return res.status(400).json({ error: "Link không hợp lệ" });
      }

      const links = await getSpecLinks();
      links[model] = {
        url,
        updatedAt: new Date().toISOString()
      };

      await saveSpecLinks(links);
      return res.status(200).json({ ok: true, item: links[model] });
    }

    if (req.method === "DELETE") {
      const model = cleanModel(req.body?.model);

      if (!model) {
        return res.status(400).json({ error: "Thiếu tên model" });
      }

      const links = await getSpecLinks();
      delete links[model];
      await saveSpecLinks(links);

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });

  } catch (error) {
    console.error("Admin spec links:", error);
    return res.status(500).json({
      error: error.message || "Không thể lưu dữ liệu"
    });
  }
}
