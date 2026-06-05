/**
 * Phase 1361–1380 — Lock Provider factory & registry
 */
import { config } from "../../config.js";
import { MockLockProvider } from "./mockLockProvider.js";
import { SesameLockProvider } from "./sesameProvider.js";
import { SwitchBotLockProvider } from "./switchbotProvider.js";
import type { LockProvider, LockProviderId } from "./types.js";

export * from "./types.js";
export { MockLockProvider } from "./mockLockProvider.js";
export { SesameLockProvider } from "./sesameProvider.js";
export { SwitchBotLockProvider } from "./switchbotProvider.js";

let lockProvider: LockProvider | null = null;

function createProvider(id: LockProviderId): LockProvider {
  switch (id) {
    case "sesame":
      return new SesameLockProvider();
    case "mock":
      return new MockLockProvider();
    case "switchbot":
    default:
      return new SwitchBotLockProvider();
  }
}

export function resolveLockProviderId(): LockProviderId {
  const raw = config.lock.provider;
  if (raw === "sesame" || raw === "mock") return raw;
  return "switchbot";
}

export function initLockProvider(): LockProvider {
  lockProvider = createProvider(resolveLockProviderId());
  return lockProvider;
}

export function setLockProvider(provider: LockProvider): void {
  lockProvider = provider;
}

export function getLockProvider(): LockProvider {
  if (!lockProvider) {
    lockProvider = createProvider(resolveLockProviderId());
  }
  return lockProvider;
}

export function resetLockProviderForTests(): void {
  lockProvider = null;
}
