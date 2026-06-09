import { Redis } from "ioredis";
import { config } from "../config.js";
let client = null;
let reachable = false;
let lastPingAt = 0;
let lastError = null;
export function getRedisClient() {
    if (!config.redis.url)
        return null;
    if (!client) {
        client = new Redis(config.redis.url, {
            maxRetriesPerRequest: 2,
            lazyConnect: true,
            connectTimeout: 3_000,
            retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2_000)),
        });
        client.on("error", (err) => {
            lastError = err.message;
            reachable = false;
        });
        client.on("connect", () => {
            lastError = null;
        });
    }
    return client;
}
export async function pingRedis() {
    const now = Date.now();
    if (now - lastPingAt < 3_000)
        return reachable;
    lastPingAt = now;
    const r = getRedisClient();
    if (!r) {
        reachable = false;
        return false;
    }
    try {
        if (r.status !== "ready")
            await r.connect();
        const pong = await r.ping();
        reachable = pong === "PONG";
        return reachable;
    }
    catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        reachable = false;
        return false;
    }
}
export function isRedisReachableSync() {
    return reachable;
}
export function getRedisLastError() {
    return lastError;
}
export async function closeRedis() {
    if (client) {
        await client.quit().catch(() => undefined);
        client = null;
        reachable = false;
    }
}
export function resetRedisForTests() {
    if (client) {
        client.disconnect();
    }
    client = null;
    reachable = false;
    lastPingAt = 0;
    lastError = null;
}
