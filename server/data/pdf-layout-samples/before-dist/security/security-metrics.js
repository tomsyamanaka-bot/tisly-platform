import { getPlatformSetting, setPlatformSetting } from "../db/database.js";
export function recordSignatureError(reason) {
    const prev = getPlatformSetting("security:signature-errors") ?? { count: 0 };
    setPlatformSetting("security:signature-errors", {
        count: prev.count + 1,
        lastAt: new Date().toISOString(),
        lastReason: reason,
    });
}
export function getSignatureErrorCount() {
    return getPlatformSetting("security:signature-errors")?.count ?? 0;
}
import { pingRedis } from "../redis/redis-client.js";
import { config } from "../config.js";
export async function getRateLimitProviderStatusAsync() {
    const provider = config.rateLimitProvider;
    return {
        provider,
        redisReachable: provider === "redis" ? await pingRedis() : false,
    };
}
export function getRateLimitProviderStatus() {
    const provider = config.rateLimitProvider;
    return {
        provider,
        redisReachable: false,
    };
}
