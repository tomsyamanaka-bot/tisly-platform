import { Redis } from "ioredis";
import { config } from "../config.js";

let client: Redis | null = null;
let reachable = false;
let lastPingAt = 0;
let lastError: string | null = null;

export function getRedisClient(): Redis | null {
  if (!config.redis.url) return null;
  if (!client) {
    client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      connectTimeout: 3_000,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 2_000)),
    });
    client.on("error", (err: Error) => {
      lastError = err.message;
      reachable = false;
    });
    client.on("connect", () => {
      lastError = null;
    });
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const now = Date.now();
  if (now - lastPingAt < 3_000) return reachable;
  lastPingAt = now;
  const r = getRedisClient();
  if (!r) {
    reachable = false;
    return false;
  }
  try {
    if (r.status !== "ready") await r.connect();
    const pong = await r.ping();
    reachable = pong === "PONG";
    return reachable;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    reachable = false;
    return false;
  }
}

export function isRedisReachableSync(): boolean {
  return reachable;
}

export function getRedisLastError(): string | null {
  return lastError;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
    reachable = false;
  }
}

export function resetRedisForTests(): void {
  if (client) {
    client.disconnect();
  }
  client = null;
  reachable = false;
  lastPingAt = 0;
  lastError = null;
}
