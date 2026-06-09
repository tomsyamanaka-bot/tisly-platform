import { getRedisClient, pingRedis } from "./redis-client.js";
import { config } from "../config.js";
const MEMORY = new Map();
export async function cacheGet(key) {
    if (config.rateLimitProvider === "redis" && (await pingRedis())) {
        const r = getRedisClient();
        if (r)
            return r.get(`cache:${key}`);
    }
    const entry = MEMORY.get(key);
    if (!entry)
        return null;
    if (entry.expiresAt < Date.now()) {
        MEMORY.delete(key);
        return null;
    }
    return entry.value;
}
export async function cacheSet(key, value, ttlSec = 300) {
    if (config.rateLimitProvider === "redis" && (await pingRedis())) {
        const r = getRedisClient();
        if (r) {
            await r.setex(`cache:${key}`, ttlSec, value);
            return;
        }
    }
    MEMORY.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}
export async function cacheDel(key) {
    if (config.rateLimitProvider === "redis") {
        const r = getRedisClient();
        if (r)
            await r.del(`cache:${key}`).catch(() => undefined);
    }
    MEMORY.delete(key);
}
export function resetCacheForTests() {
    MEMORY.clear();
}
