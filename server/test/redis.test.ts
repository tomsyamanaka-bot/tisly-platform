process.env.RATE_LIMIT_PROVIDER = "memory";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRateLimit, getRateLimitProviderName } from "../src/redis/rate-limit-redis.js";
import { cacheSet, cacheGet, resetCacheForTests } from "../src/redis/cache.js";
import { resetRedisForTests } from "../src/redis/redis-client.js";

describe("Redis infrastructure (Phase 201-220)", () => {
  it("memory rate limit provider is default", () => {
    assert.equal(getRateLimitProviderName(), "memory");
    assert.ok(typeof createRateLimit === "function");
  });

  it("cache works in memory mode", async () => {
    resetCacheForTests();
    resetRedisForTests();
    await cacheSet("test-key", "value1", 60);
    const v = await cacheGet("test-key");
    assert.equal(v, "value1");
  });
});
