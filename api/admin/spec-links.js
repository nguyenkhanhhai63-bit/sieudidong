
async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  const parts = raw.split(";").map(x => x.trim());
  const prefix = name + "=";
  const hit = parts.find(x => x.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : "";
}

async function isAdmin(req) {
  const password = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.ADMIN_SESSION_SECRET || password;
  if (!password || !secret) return false;

  const token = getCookie(req, "sdd_admin");
  const [tsRaw, sig] = token.split(".");
  const ts = Number(tsRaw || 0);

  if (!ts || !sig) return false;
  if (Date.now() - ts > 12 * 60 * 60 * 1000) return false;

  const expected = await sha256(`${secret}|${ts}`);
  return sig === expected;
}


const SPEC_LINKS_KEY = "sdd:spec-links:v1";

function redisConfig() {
  return {
    url:
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      "",
    token:
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      ""
  };
}

async function redisCommand(command) {
  const { url, token } = redisConfig();

  if (!url || !token) {
    throw new Error(
      "Thiếu UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN"
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.result;
}

async function getSpecLinks() {
  const raw = await redisCommand(["GET", SPEC_LINKS_KEY]);
  if (!raw) return {};

  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

async function saveSpecLinks(map) {
  await redisCommand(["SET", SPEC_LINKS_KEY, JSON.stringify(map)]);
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
