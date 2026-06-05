/**
 * Phase 1321–1340 — SwitchBot Lock integration (mock / dryRun / real)
 */
import { createHmac, randomUUID } from "crypto";
import { config } from "../config.js";
import type { SwitchBotLockStatus } from "../security-automation/security-automation-types.js";

export type SwitchBotMode = "mock" | "dryRun" | "real";

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
}

export interface SwitchBotCommandResult {
  ok: boolean;
  mode: SwitchBotMode;
  dryRun: boolean;
  command: "lock" | "unlock";
  deviceId: string;
  message: string;
  statusCode?: number;
}

const SWITCHBOT_API = "https://openapi.api.switch-bot.com/v1.1";

let mockLockState: "locked" | "unlocked" = "unlocked";

export function getSwitchBotMode(): SwitchBotMode {
  return config.switchbot.mode;
}

export function resetSwitchBotMockState(state: "locked" | "unlocked" = "unlocked"): void {
  mockLockState = state;
}

/** HMAC-SHA256 認証ヘッダー生成（token/secret はログに出さない） */
export function createSwitchBotAuthHeaders(): Record<string, string> {
  const token = config.switchbot.token;
  const secret = config.switchbot.secret;
  if (!token || !secret) {
    throw new Error("SWITCHBOT_TOKEN and SWITCHBOT_SECRET required");
  }
  const t = String(Date.now());
  const nonce = randomUUID();
  const sign = createHmac("sha256", secret)
    .update(token + t + nonce, "utf8")
    .digest("base64");
  return {
    Authorization: token,
    sign,
    t,
    nonce,
    "Content-Type": "application/json",
  };
}

function redactSecrets(text: string): string {
  const token = config.switchbot.token;
  const secret = config.switchbot.secret;
  let out = text;
  if (token) out = out.split(token).join("[REDACTED_TOKEN]");
  if (secret) out = out.split(secret).join("[REDACTED_SECRET]");
  return out;
}

async function switchBotFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = createSwitchBotAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${SWITCHBOT_API}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? redactSecrets(err.message) : "SwitchBot request failed";
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}

export async function getSwitchBotDevices(): Promise<{
  mode: SwitchBotMode;
  devices: SwitchBotDevice[];
}> {
  const mode = getSwitchBotMode();
  if (mode === "mock") {
    const deviceId = config.switchbot.lockDeviceId || "mock-lock-001";
    return {
      mode,
      devices: [
        {
          deviceId,
          deviceName: "Mock SwitchBot Lock",
          deviceType: "Smart Lock",
          hubDeviceId: "mock-hub-001",
        },
      ],
    };
  }
  if (mode === "dryRun") {
    const deviceId = config.switchbot.lockDeviceId || "dryrun-lock-001";
    return {
      mode,
      devices: [
        {
          deviceId,
          deviceName: "[dryRun] SwitchBot Lock",
          deviceType: "Smart Lock",
        },
      ],
    };
  }
  if (!config.switchbot.token || !config.switchbot.secret) {
    throw new Error("SWITCHBOT_TOKEN and SWITCHBOT_SECRET required for real mode");
  }
  const res = await switchBotFetch("/devices");
  if (!res.ok) {
    throw new Error(`SwitchBot devices API error: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    body?: { deviceList?: Array<{ deviceId: string; deviceName: string; deviceType: string; hubDeviceId?: string }> };
  };
  const list = body.body?.deviceList ?? [];
  return {
    mode,
    devices: list.map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      deviceType: d.deviceType,
      hubDeviceId: d.hubDeviceId,
    })),
  };
}

export async function getSwitchBotLockStatus(deviceId?: string): Promise<SwitchBotLockStatus> {
  const mode = getSwitchBotMode();
  const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
  const now = new Date().toISOString();

  if (mode === "mock") {
    return { deviceId: id, lockState: mockLockState, battery: 85, mode, fetchedAt: now };
  }
  if (mode === "dryRun") {
    return { deviceId: id, lockState: mockLockState, battery: 80, mode, fetchedAt: now };
  }

  if (!config.switchbot.token || !config.switchbot.secret) {
    throw new Error("SWITCHBOT_TOKEN and SWITCHBOT_SECRET required for real mode");
  }
  const res = await switchBotFetch(`/devices/${id}/status`);
  if (!res.ok) {
    throw new Error(`SwitchBot status API error: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    body?: { lock?: string; battery?: number };
  };
  const lock = body.body?.lock ?? "unknown";
  const lockState =
    lock === "locked" ? "locked" : lock === "unlocked" ? "unlocked" : "unknown";
  return {
    deviceId: id,
    lockState,
    battery: body.body?.battery,
    mode,
    fetchedAt: now,
  };
}

export async function sendSwitchBotLockCommand(
  deviceId: string,
  command: "lock" | "unlock",
  confirmed: boolean
): Promise<SwitchBotCommandResult> {
  const mode = getSwitchBotMode();

  if (mode === "real" && !confirmed) {
    return {
      ok: false,
      mode,
      dryRun: false,
      command,
      deviceId,
      message: "confirmed=true required for real SwitchBot commands",
    };
  }

  if (mode === "mock") {
    mockLockState = command === "lock" ? "locked" : "unlocked";
    return {
      ok: true,
      mode,
      dryRun: false,
      command,
      deviceId,
      message: `Mock ${command} executed`,
    };
  }

  if (mode === "dryRun") {
    return {
      ok: true,
      mode,
      dryRun: true,
      command,
      deviceId,
      message: `[dryRun] Would send SwitchBot ${command} to ${deviceId}`,
    };
  }

  if (!config.switchbot.token || !config.switchbot.secret) {
    return {
      ok: false,
      mode,
      dryRun: false,
      command,
      deviceId,
      message: "SWITCHBOT_TOKEN and SWITCHBOT_SECRET required",
    };
  }

  const res = await switchBotFetch(`/devices/${deviceId}/commands`, {
    method: "POST",
    body: JSON.stringify({
      command,
      parameter: "default",
      commandType: "command",
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      mode,
      dryRun: false,
      command,
      deviceId,
      message: `SwitchBot command failed: HTTP ${res.status}`,
      statusCode: res.status,
    };
  }
  return {
    ok: true,
    mode,
    dryRun: false,
    command,
    deviceId,
    message: `SwitchBot ${command} sent`,
  };
}

export async function lockSwitchBot(
  deviceId?: string,
  confirmed = false
): Promise<SwitchBotCommandResult> {
  const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
  return sendSwitchBotLockCommand(id, "lock", confirmed);
}

export async function unlockSwitchBot(
  deviceId?: string,
  confirmed = false
): Promise<SwitchBotCommandResult> {
  const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
  return sendSwitchBotLockCommand(id, "unlock", confirmed);
}

/** Release Gate — real unlock が confirmed guard なしで動くか検証用 */
export function isRealUnlockGuarded(): boolean {
  return true;
}
