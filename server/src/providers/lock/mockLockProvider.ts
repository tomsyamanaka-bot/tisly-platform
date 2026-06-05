/**
 * Phase 1361–1380 — Standalone mock lock provider (LOCK_PROVIDER=mock)
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

let mockLockState: LockState = "unlocked";
let lastOperation: LockLastOperation | null = null;
let lastOperator: LockOperator | null = null;

export class MockLockProvider implements LockProvider {
  readonly providerId = "mock" as const;

  getStatus(deviceId?: string): Promise<LockStatus> {
    const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
    return Promise.resolve({
      deviceId: id,
      lockState: mockLockState,
      battery: 92,
      provider: this.providerId,
      mode: "mock",
      fetchedAt: new Date().toISOString(),
    });
  }

  async lock(deviceId?: string, _confirmed = false): Promise<LockCommandResult> {
    const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
    mockLockState = "locked";
    const now = new Date().toISOString();
    lastOperation = { operation: "lock", at: now };
    lastOperator = { userName: "Mock Operator" };
    return {
      ok: true,
      command: "lock",
      deviceId: id,
      provider: this.providerId,
      message: "Mock lock executed",
      mode: "mock",
    };
  }

  async unlock(deviceId?: string, _confirmed = false): Promise<LockCommandResult> {
    const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
    mockLockState = "unlocked";
    const now = new Date().toISOString();
    lastOperation = { operation: "unlock", at: now };
    lastOperator = { userName: "Mock Operator" };
    return {
      ok: true,
      command: "unlock",
      deviceId: id,
      provider: this.providerId,
      message: "Mock unlock executed",
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
    return false;
  }

  supportsNfc(): boolean {
    return false;
  }

  getLockStateSync(): LockState {
    return mockLockState;
  }

  getMode(): "mock" {
    return "mock";
  }

  resetMockState(state: "locked" | "unlocked" = "unlocked"): void {
    mockLockState = state;
    if (state === "unlocked") {
      lastOperation = { operation: "unlock", at: new Date().toISOString() };
    }
  }
}
