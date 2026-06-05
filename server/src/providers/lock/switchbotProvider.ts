/**
 * Phase 1361–1380 — SwitchBot LockProvider implementation
 */
import {
  getSwitchBotLastUnlockAt,
  getSwitchBotLockStateSync,
  getSwitchBotLockStatus,
  getSwitchBotMode,
  isRealUnlockGuarded,
  lockSwitchBot,
  resetSwitchBotMockState,
  unlockSwitchBot,
} from "../../services/switchbotService.js";
import type {
  LockCommandResult,
  LockLastOperation,
  LockOperator,
  LockProvider,
  LockState,
  LockStatus,
} from "./types.js";

export class SwitchBotLockProvider implements LockProvider {
  readonly providerId = "switchbot" as const;

  async getStatus(deviceId?: string): Promise<LockStatus> {
    const raw = await getSwitchBotLockStatus(deviceId);
    return {
      deviceId: raw.deviceId,
      lockState: raw.lockState,
      battery: raw.battery,
      provider: this.providerId,
      mode: raw.mode,
      fetchedAt: raw.fetchedAt,
      error: raw.error,
    };
  }

  async lock(deviceId?: string, confirmed = false): Promise<LockCommandResult> {
    const raw = await lockSwitchBot(deviceId, confirmed);
    return {
      ok: raw.ok,
      command: raw.command,
      deviceId: raw.deviceId,
      provider: this.providerId,
      message: raw.message,
      dryRun: raw.dryRun,
      mode: raw.mode,
      statusCode: raw.statusCode,
    };
  }

  async unlock(deviceId?: string, confirmed = false): Promise<LockCommandResult> {
    const raw = await unlockSwitchBot(deviceId, confirmed);
    return {
      ok: raw.ok,
      command: raw.command,
      deviceId: raw.deviceId,
      provider: this.providerId,
      message: raw.message,
      dryRun: raw.dryRun,
      mode: raw.mode,
      statusCode: raw.statusCode,
    };
  }

  async getBattery(deviceId?: string): Promise<number | null> {
    const status = await this.getStatus(deviceId);
    return status.battery ?? null;
  }

  getLastOperation(): LockLastOperation | null {
    const at = getSwitchBotLastUnlockAt();
    if (!at) return null;
    const state = getSwitchBotLockStateSync();
    return {
      operation: state === "locked" ? "lock" : "unlock",
      at,
    };
  }

  getLastOperator(): LockOperator | null {
    return null;
  }

  supportsRemoteUnlock(): boolean {
    return true;
  }

  supportsFaceRecognition(): boolean {
    return false;
  }

  supportsFingerprint(): boolean {
    return false;
  }

  supportsNfc(): boolean {
    return false;
  }

  getLockStateSync(): LockState {
    return getSwitchBotLockStateSync();
  }

  getMode(): "mock" | "dryRun" | "real" {
    return getSwitchBotMode();
  }

  resetMockState(state: "locked" | "unlocked" = "unlocked"): void {
    resetSwitchBotMockState(state);
  }

  isRealCommandGuarded(): boolean {
    return isRealUnlockGuarded();
  }
}
