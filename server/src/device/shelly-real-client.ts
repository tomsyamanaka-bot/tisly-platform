/**
 * Phase941 — Shelly Gen3/Plus 実機 RPC（env: SHELLY_MODE, SHELLY_BASE_URL, SHELLY_AUTH_TOKEN）
 */
import { config } from "../config.js";

export type ShellyEnvMode = "mock" | "real";

export interface ShellyStatusResult {
  mode: ShellyEnvMode;
  online: boolean;
  relay?: boolean;
  voltage?: number;
  current?: number;
  powerW?: number;
  raw?: Record<string, unknown>;
  mock: boolean;
  baseUrl: string | null;
  fetchedAt: string;
}

export interface ShellyActionResult {
  ok: boolean;
  dryRun: boolean;
  action: "reboot" | "toggle";
  mode: ShellyEnvMode;
  mock: boolean;
  message: string;
}

export function getShellyEnvMode(): ShellyEnvMode {
  return config.shelly.mode;
}

function resolveBaseUrl(override?: string): string | null {
  const base = (override ?? config.shelly.baseUrl)?.trim();
  return base || null;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (config.shelly.authToken) {
    h.Authorization = `Bearer ${config.shelly.authToken}`;
  }
  return h;
}

async function shellyRpc(
  method: string,
  params?: Record<string, unknown>,
  baseOverride?: string
): Promise<Record<string, unknown> | null> {
  const base = resolveBaseUrl(baseOverride);
  if (!base) return null;
  const url = `${base.replace(/\/$/, "")}/rpc/${method}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchShellyDeviceStatus(baseOverride?: string): Promise<ShellyStatusResult> {
  const now = new Date().toISOString();
  const mode = getShellyEnvMode();
  const baseUrl = resolveBaseUrl(baseOverride);

  if (mode === "mock" || !baseUrl) {
    return {
      mode,
      online: true,
      relay: true,
      voltage: 100.2,
      current: 0.41,
      powerW: 41,
      mock: true,
      baseUrl,
      fetchedAt: now,
    };
  }

  const data = await shellyRpc("Shelly.GetStatus", {}, baseUrl);
  if (!data) {
    return { mode, online: false, mock: false, baseUrl, fetchedAt: now };
  }
  const sw = (data["switch:0"] ?? data.switch0) as Record<string, unknown> | undefined;
  const em = (data["em:0"] ?? data.em0) as Record<string, unknown> | undefined;
  return {
    mode,
    online: true,
    relay: Boolean(sw?.output ?? sw?.on),
    voltage: Number(em?.voltage ?? sw?.voltage ?? 0),
    current: Number(em?.current ?? 0),
    powerW: Number(em?.act_power ?? em?.power ?? 0),
    raw: data,
    mock: false,
    baseUrl,
    fetchedAt: now,
  };
}

export function assertRealActionGuard(input: { confirm?: boolean; dryRun?: boolean }): {
  dryRun: boolean;
  blocked: boolean;
  reason?: string;
} {
  const dryRun = input.dryRun === true;
  if (getShellyEnvMode() === "mock") {
    return { dryRun: dryRun || true, blocked: false };
  }
  if (!input.confirm && !dryRun) {
    return { dryRun, blocked: true, reason: "real mode requires confirm:true or dryRun:true" };
  }
  return { dryRun, blocked: false };
}

export async function shellyReboot(input: {
  confirm?: boolean;
  dryRun?: boolean;
  baseUrl?: string;
}): Promise<ShellyActionResult> {
  const guard = assertRealActionGuard(input);
  if (guard.blocked) {
    return {
      ok: false,
      dryRun: false,
      action: "reboot",
      mode: getShellyEnvMode(),
      mock: getShellyEnvMode() === "mock",
      message: guard.reason ?? "blocked",
    };
  }
  if (guard.dryRun || getShellyEnvMode() === "mock") {
    return {
      ok: true,
      dryRun: true,
      action: "reboot",
      mode: getShellyEnvMode(),
      mock: getShellyEnvMode() === "mock",
      message: "dry-run: Shelly.Reboot skipped",
    };
  }
  const base = resolveBaseUrl(input.baseUrl);
  if (!base) {
    return {
      ok: false,
      dryRun: false,
      action: "reboot",
      mode: "real",
      mock: false,
      message: "SHELLY_BASE_URL required",
    };
  }
  const res = await shellyRpc("Shelly.Reboot", {}, base);
  return {
    ok: !!res,
    dryRun: false,
    action: "reboot",
    mode: "real",
    mock: false,
    message: res ? "Shelly.Reboot sent" : "Shelly.Reboot failed",
  };
}

export async function shellyToggle(input: {
  confirm?: boolean;
  dryRun?: boolean;
  on?: boolean;
  baseUrl?: string;
}): Promise<ShellyActionResult> {
  const guard = assertRealActionGuard(input);
  if (guard.blocked) {
    return {
      ok: false,
      dryRun: false,
      action: "toggle",
      mode: getShellyEnvMode(),
      mock: getShellyEnvMode() === "mock",
      message: guard.reason ?? "blocked",
    };
  }
  if (guard.dryRun || getShellyEnvMode() === "mock") {
    return {
      ok: true,
      dryRun: true,
      action: "toggle",
      mode: getShellyEnvMode(),
      mock: getShellyEnvMode() === "mock",
      message: "dry-run: Switch.Set skipped",
    };
  }
  const base = resolveBaseUrl(input.baseUrl);
  if (!base) {
    return {
      ok: false,
      dryRun: false,
      action: "toggle",
      mode: "real",
      mock: false,
      message: "SHELLY_BASE_URL required",
    };
  }
  const res = await shellyRpc("Switch.Set", { id: 0, on: input.on !== false }, base);
  return {
    ok: !!res,
    dryRun: false,
    action: "toggle",
    mode: "real",
    mock: false,
    message: res ? "Switch.Set sent" : "Switch.Set failed",
  };
}
