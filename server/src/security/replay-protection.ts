import { config } from "../config.js";
import { getPlatformSetting, setPlatformSetting } from "../db/database.js";

interface ReplayEntry {
  signature: string;
  eventId?: string;
  timestamp: string;
  seenAt: number;
}

const store = new Map<string, ReplayEntry>();
const MAX_ENTRIES = 10_000;

/** In-memory replay store — TODO: Redis for multi-instance production */
export function isReplay(signature: string, eventId?: string, timestamp?: string): boolean {
  if (!config.security.replayProtectionEnabled) return false;
  const key = signature;
  if (store.has(key)) return true;
  if (eventId) {
    for (const entry of store.values()) {
      if (entry.eventId === eventId) return true;
    }
  }
  return false;
}

export function recordReplay(signature: string, eventId?: string, timestamp?: string): void {
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
}
