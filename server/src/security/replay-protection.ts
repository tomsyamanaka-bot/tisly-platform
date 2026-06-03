import { config } from "../config.js";
import { getPlatformSetting, setPlatformSetting } from "../db/database.js";
import {
  replayStoreAdd,
  replayStoreHas,
  resetReplayStoreForTests as resetRedisReplay,
} from "../redis/replay-store.js";
import { pingRedis } from "../redis/redis-client.js";

interface ReplayEntry {
  signature: string;
  eventId?: string;
  timestamp: string;
  seenAt: number;
}

const store = new Map<string, ReplayEntry>();
const MAX_ENTRIES = 10_000;

function memoryIsReplay(signature: string, eventId?: string): boolean {
  if (store.has(signature)) return true;
  if (eventId) {
    for (const entry of store.values()) {
      if (entry.eventId === eventId) return true;
    }
  }
  return false;
}

function memoryRecordReplay(
  signature: string,
  eventId?: string,
  timestamp?: string
): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(signature, {
    signature,
    eventId,
    timestamp: timestamp ?? new Date().toISOString(),
    seenAt: Date.now(),
  });
}

/** Sync check — memory store (always); Redis when provider=redis and already connected */
export function isReplay(signature: string, eventId?: string, _timestamp?: string): boolean {
  if (!config.security.replayProtectionEnabled) return false;
  if (memoryIsReplay(signature, eventId)) return true;
  return false;
}

export async function isReplayAsync(
  signature: string,
  eventId?: string,
  _timestamp?: string
): Promise<boolean> {
  if (!config.security.replayProtectionEnabled) return false;
  if (memoryIsReplay(signature, eventId)) return true;
  if (config.rateLimitProvider === "redis" && (await pingRedis())) {
    return replayStoreHas(signature, eventId);
  }
  return false;
}

export function recordReplay(signature: string, eventId?: string, timestamp?: string): void {
  memoryRecordReplay(signature, eventId, timestamp);
  void replayStoreAdd(signature, eventId, timestamp);
}

export async function recordReplayAsync(
  signature: string,
  eventId?: string,
  timestamp?: string
): Promise<void> {
  memoryRecordReplay(signature, eventId, timestamp);
  await replayStoreAdd(signature, eventId, timestamp);
}

export function recordReplayBlocked(): void {
  const prev = getPlatformSetting<{ count: number }>("security:replay-blocked") ?? { count: 0 };
  setPlatformSetting("security:replay-blocked", {
    count: prev.count + 1,
    lastAt: new Date().toISOString(),
  });
}

export function getReplayBlockedCount(): number {
  return getPlatformSetting<{ count: number }>("security:replay-blocked")?.count ?? 0;
}

export function resetReplayStoreForTests(): void {
  store.clear();
  resetRedisReplay();
}
