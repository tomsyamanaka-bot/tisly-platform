/**
 * Phase 1361–1380 — Lock Provider factory & registry
 */
import { config } from "../../config.js";
import { MockLockProvider } from "./mockLockProvider.js";
import { SesameLockProvider } from "./sesameProvider.js";
import { SwitchBotLockProvider } from "./switchbotProvider.js";
export * from "./types.js";
export { MockLockProvider } from "./mockLockProvider.js";
export { SesameLockProvider } from "./sesameProvider.js";
export { SwitchBotLockProvider } from "./switchbotProvider.js";
let lockProvider = null;
function createProvider(id) {
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
export function resolveLockProviderId() {
    const raw = config.lock.provider;
    if (raw === "sesame" || raw === "mock")
        return raw;
    return "switchbot";
}
export function initLockProvider() {
    lockProvider = createProvider(resolveLockProviderId());
    return lockProvider;
}
export function setLockProvider(provider) {
    lockProvider = provider;
}
export function getLockProvider() {
    if (!lockProvider) {
        lockProvider = createProvider(resolveLockProviderId());
    }
    return lockProvider;
}
export function resetLockProviderForTests() {
    lockProvider = null;
}
