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

export function getRateLimitProviderStatus(): { provider: string; redisReachable: boolean } {
  const provider = process.env.RATE_LIMIT_PROVIDER ?? "memory";
  return {
    provider,
    redisReachable: false, // TODO: ping Redis when RATE_LIMIT_PROVIDER=redis
  };
}
