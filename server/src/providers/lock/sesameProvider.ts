/**
 * Phase 1361–1380 — SESAME / SESAME Face placeholder provider
 */
import { config } from "../../config.js";
import type {
  LockCommandResult,
  LockLastOperation,
  LockOperator,
  LockProvider,
  LockState,
  LockStatus,
} from "./types.js";

let placeholderState: LockState = "locked";
let lastOperation: LockLastOperation | null = null;
let lastOperator: LockOperator | null = null;

/** SESAME API 接続は Phase1381+ で実装予定 */
export class SesameLockProvider implements LockProvider {
  readonly providerId = "sesame" as const;

  getStatus(deviceId?: string): Promise<LockStatus> {
    const id = deviceId || config.switchbot.lockDeviceId || "sesame-lock-001";
    return Promise.resolve({
      deviceId: id,
      lockState: placeholderState,
      battery: 78,
      provider: this.providerId,
      mode: "mock",
      fetchedAt: new Date().toISOString(),
      error: undefined,
    });
  }

  async lock(deviceId?: string, _confirmed = false): Promise<LockCommandResult> {
    const id = deviceId || config.switchbot.lockDeviceId || "sesame-lock-001";
    placeholderState = "locked";
    const now = new Date().toISOString();
    lastOperation = { operation: "lock", at: now };
    return {
      ok: true,
      command: "lock",
      deviceId: id,
      provider: this.providerId,
      message: "[SESAME placeholder] lock simulated",
      mode: "mock",
    };
  }

  async unlock(deviceId?: string, _confirmed = false): Promise<LockCommandResult> {
    const id = deviceId || config.switchbot.lockDeviceId || "sesame-lock-001";
    placeholderState = "unlocked";
    const now = new Date().toISOString();
    lastOperation = { operation: "face_unlock", at: now, method: "SESAME Face" };
    return {
      ok: true,
      command: "unlock",
      deviceId: id,
      provider: this.providerId,
      message: "[SESAME placeholder] unlock simulated",
      mode: "mock",
    };
  }

  async getBattery(deviceId?: string): Promise<number | null> {
    const status = await this.getStatus(deviceId);
    return status.battery ?? null;
  }

  getLastOperation(): LockLastOperation | null {
    return lastOperation;
  }

  getLastOperator(): LockOperator | null {
    return lastOperator;
  }

  supportsRemoteUnlock(): boolean {
    return true;
  }

  supportsFaceRecognition(): boolean {
    return true;
  }

  supportsFingerprint(): boolean {
    return true;
  }

  supportsNfc(): boolean {
    return true;
  }

  getLockStateSync(): LockState {
    return placeholderState;
  }

  getMode(): "mock" {
    return "mock";
  }

  setLastOperator(op: LockOperator): void {
    lastOperator = op;
  }

  setLastOperation(op: LockLastOperation): void {
    lastOperation = op;
  }

  resetPlaceholderState(state: "locked" | "unlocked" = "locked"): void {
    placeholderState = state;
  }
}
