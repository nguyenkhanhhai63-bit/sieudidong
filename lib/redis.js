import { createClient } from "redis";

let clientPromise = null;

async function getClient() {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) throw new Error("Thiếu biến môi trường REDIS_URL");

  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createClient({ url });
      client.on("error", (err) => console.error("Redis client error:", err?.message || err));
      await client.connect();
      return client;
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }

  const client = await clientPromise;
  if (!client.isOpen) {
    clientPromise = null;
    return getClient();
  }
  return client;
}

export async function redisGet(key) {
  const client = await getClient();
  return client.get(key);
}

export async function redisSet(key, value) {
  const client = await getClient();
  return client.set(key, value);
}

export async function redisCommand(args) {
  const client = await getClient();
  return client.sendCommand(args.map(v => String(v)));
}
