import { getPlatformSetting, setPlatformSetting } from "../db/database.js";

export function recordSignatureError(reason: string): void {
  const prev = getPlatformSetting<{ count: number }>("security:signature-errors") ?? { count: 0 };
  setPlatformSetting("security:signature-errors", {
    count: prev.count + 1,
    lastAt: new Date().toISOString(),
    lastReason: reason,
  });
}

export function getSignatureErrorCount(): number {
  return getPlatformSetting<{ count: number }>("security:signature-errors")?.count ?? 0;
}

import { pingRedis } from "../redis/redis-client.js";
import { config } from "../config.js";

export async function getRateLimitProviderStatusAsync(): Promise<{
  provider: string;
  redisReachable: boolean;
}> {
  const provider = config.rateLimitProvider;
  return {
    provider,
    redisReachable: provider === "redis" ? await pingRedis() : false,
  };
}

export function getRateLimitProviderStatus(): { provider: string; redisReachable: boolean } {
  const provider = config.rateLimitProvider;
  return {
    provider,
    redisReachable: false,
  };
}
