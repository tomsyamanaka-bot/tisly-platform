import { config } from "../config.js";
import { getRedisClient, pingRedis } from "./redis-client.js";
const MEMORY = new Map();
const MAX_ENTRIES = 10_000;
const TTL_SEC = 3600;
export async function replayStoreHas(signature, eventId) {
    if (!config.security.replayProtectionEnabled)
        return false;
    if (config.rateLimitProvider === "redis" && (await pingRedis())) {
        const r = getRedisClient();
        if (r) {
            const hit = await r.get(`replay:${signature}`);
            if (hit)
                return true;
            if (eventId) {
                const eid = await r.get(`replay:eid:${eventId}`);
                if (eid)
                    return true;
            }
            return false;
        }
    }
    if (MEMORY.has(signature))
        return true;
    if (eventId) {
        for (const entry of MEMORY.values()) {
            if (entry.eventId === eventId)
                return true;
        }
    }
    return false;
}
export async function replayStoreAdd(signature, eventId, timestamp) {
    const ts = timestamp ?? new Date().toISOString();
    if (config.rateLimitProvider === "redis" && (await pingRedis())) {
        const r = getRedisClient();
        if (r) {
            await r.setex(`replay:${signature}`, TTL_SEC, ts);
            if (eventId)
                await r.setex(`replay:eid:${eventId}`, TTL_SEC, signature);
            return;
        }
    }
    if (MEMORY.size >= MAX_ENTRIES) {
        const oldest = MEMORY.keys().next().value;
        if (oldest)
            MEMORY.delete(oldest);
    }
    MEMORY.set(signature, { eventId, timestamp: ts, seenAt: Date.now() });
}
export function resetReplayStoreForTests() {
    MEMORY.clear();
}
