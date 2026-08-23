/**
 * TiSLY HOME — SwitchBot Cloud API v1.1 クライアント
 *
 * HMAC-SHA256 署名（sign / t / nonce）付き。
 * トークン未設定・API 失敗時は例外を投げず Result で返し、
 * 呼び出し側がモックへフォールバックできるようにする。
 */

import { createHmac, randomUUID } from "node:crypto";

const SWITCHBOT_API_BASE = "https://api.switch-bot.com/v1.1";
const REQUEST_TIMEOUT_MS = 8000;

export interface SwitchBotHomeEnvV1 {
  token: string;
  secret: string;
  lockDeviceId: string;
  airConditionerDeviceId: string;
  ceilingDeviceId: string;
  bathBotDeviceId: string;
  meterDeviceId: string;
  tvDeviceId: string;
  humidifierDeviceId: string;
  plugDeviceId: string;
}

export interface SwitchBotDeviceV1 {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
  /** 赤外線リモコン（仮想デバイス）なら true */
  infrared: boolean;
}

export interface SwitchBotLockStatusV1 {
  deviceId: string;
  /** LOCKED / UNLOCKED / JAMMED / UNKNOWN */
  lockState: "LOCKED" | "UNLOCKED" | "JAMMED" | "UNKNOWN";
  /** open / close / unknown（Lock Lite 等は unknown） */
  doorState: "open" | "close" | "unknown";
  battery: number | null;
  raw?: Record<string, unknown>;
}

export interface SwitchBotApiResultV1<T> {
  ok: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  /** 実機 API を呼ばずスキップした（未設定） */
  skipped?: boolean;
}

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

/** HOME 向け SwitchBot 環境変数 */
export function getSwitchBotHomeEnvV1(): SwitchBotHomeEnvV1 {
  return {
    token: envTrim("SWITCHBOT_TOKEN"),
    secret: envTrim("SWITCHBOT_SECRET"),
    lockDeviceId: envTrim("SWITCHBOT_LOCK_DEVICE_ID"),
    airConditionerDeviceId: envTrim(
      "SWITCHBOT_AIR_CONDITIONER_DEVICE_ID"
    ),
    ceilingDeviceId: envTrim("SWITCHBOT_CEILING_DEVICE_ID"),
    bathBotDeviceId: envTrim("SWITCHBOT_BATH_BOT_DEVICE_ID"),
    meterDeviceId: envTrim("SWITCHBOT_METER_DEVICE_ID"),
    tvDeviceId: envTrim("SWITCHBOT_TV_DEVICE_ID"),
    humidifierDeviceId: envTrim("SWITCHBOT_HUMIDIFIER_DEVICE_ID"),
    plugDeviceId: envTrim("SWITCHBOT_PLUG_DEVICE_ID"),
  };
}

export function isSwitchBotHomeConfiguredV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): boolean {
  return Boolean(env.token && env.secret);
}

export function isSwitchBotLockConfiguredV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): boolean {
  return isSwitchBotHomeConfiguredV1(env) && Boolean(env.lockDeviceId);
}

export function isSwitchBotAirconConfiguredV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): boolean {
  return (
    isSwitchBotHomeConfiguredV1(env) &&
    Boolean(env.airConditionerDeviceId)
  );
}

/** TiSLY HOME の実機/モック判定 */
export type SwitchBotHomeModeV1 = "real" | "mock";

export interface SwitchBotHomeStatusV1 {
  /** 資格情報があれば real、無ければ mock（本番/ローカル共通の自動判定） */
  mode: SwitchBotHomeModeV1;
  credentialsConfigured: boolean;
  lockConfigured: boolean;
  airConditionerConfigured: boolean;
  /** deviceId は末尾4文字のみ（トークン類は一切返さない） */
  lockDeviceIdMask: string;
  airConditionerDeviceIdMask: string;
  /** 追加デバイス（env 明示 or 名前解決後に埋まる） */
  extrasConfigured: {
    ceiling: boolean;
    bathBot: boolean;
    meter: boolean;
    tv: boolean;
    humidifier: boolean;
    plug: boolean;
  };
  /** 未設定の環境変数名 */
  missing: string[];
  message: string;
}

/**
 * 環境変数の有無だけで実機/モックを決める。
 * VPS 本番でも `.env` に値が入った時点で自動的に real へ切り替わる。
 */
export function resolveSwitchBotHomeModeV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): SwitchBotHomeModeV1 {
  return isSwitchBotHomeConfiguredV1(env) ? "real" : "mock";
}

function maskDeviceId(id: string): string {
  const v = String(id || "").trim();
  if (!v) return "";
  if (v.length <= 4) return `****${v}`;
  return `****${v.slice(-4)}`;
}

export function buildSwitchBotHomeStatusV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): SwitchBotHomeStatusV1 {
  const credentialsConfigured = isSwitchBotHomeConfiguredV1(env);
  const lockConfigured = isSwitchBotLockConfiguredV1(env);
  const airConditionerConfigured = isSwitchBotAirconConfiguredV1(env);
  const missing: string[] = [];
  if (!env.token) missing.push("SWITCHBOT_TOKEN");
  if (!env.secret) missing.push("SWITCHBOT_SECRET");
  if (!env.lockDeviceId) missing.push("SWITCHBOT_LOCK_DEVICE_ID");
  if (!env.airConditionerDeviceId) {
    missing.push("SWITCHBOT_AIR_CONDITIONER_DEVICE_ID");
  }
  const extrasConfigured = {
    ceiling: Boolean(env.ceilingDeviceId),
    bathBot: Boolean(env.bathBotDeviceId),
    meter: Boolean(env.meterDeviceId),
    tv: Boolean(env.tvDeviceId),
    humidifier: Boolean(env.humidifierDeviceId),
    plug: Boolean(env.plugDeviceId),
  };
  const mode = resolveSwitchBotHomeModeV1(env);
  let message: string;
  if (mode === "mock") {
    message = "SwitchBot 未設定 — モック動作中";
  } else if (missing.length === 0) {
    message =
      "SwitchBot 実機連携中（ロック・エアコン・照明・Bot・温湿度・AV）";
  } else {
    message = `SwitchBot 実機連携中（未設定: ${missing.join(", ")}）`;
  }
  return {
    mode,
    credentialsConfigured,
    lockConfigured,
    airConditionerConfigured,
    lockDeviceIdMask: maskDeviceId(env.lockDeviceId),
    airConditionerDeviceIdMask: maskDeviceId(env.airConditionerDeviceId),
    extrasConfigured,
    missing,
    message,
  };
}

function redactSecrets(text: string, env: SwitchBotHomeEnvV1): string {
  let out = text;
  if (env.token) out = out.split(env.token).join("[REDACTED_TOKEN]");
  if (env.secret) out = out.split(env.secret).join("[REDACTED_SECRET]");
  return out;
}

/** API v1.1 必須ヘッダー（HMAC-SHA256） */
export function createSwitchBotHomeAuthHeadersV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Record<string, string> {
  if (!env.token || !env.secret) {
    throw new Error("SWITCHBOT_TOKEN and SWITCHBOT_SECRET required");
  }
  const t = String(Date.now());
  const nonce = randomUUID();
  // SwitchBot Open API v1.1: Base64(HMAC-SHA256) を大文字化して送る
  const sign = createHmac("sha256", env.secret)
    .update(env.token + t + nonce, "utf8")
    .digest("base64")
    .toUpperCase();
  return {
    Authorization: env.token,
    sign,
    t,
    nonce,
    "Content-Type": "application/json",
  };
}

async function switchBotHomeFetchV1(
  path: string,
  init?: RequestInit,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<Response> {
  const headers = createSwitchBotHomeAuthHeadersV1(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${SWITCHBOT_API_BASE}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(
  res: Response
): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * アカウント内デバイス一覧（実機 + 赤外線リモコン）
 */
export async function listSwitchBotDevicesV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<SwitchBotDeviceV1[]>> {
  if (!isSwitchBotHomeConfiguredV1(env)) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_TOKEN / SWITCHBOT_SECRET が未設定です",
    };
  }
  try {
    const res = await switchBotHomeFetchV1("/devices", undefined, env);
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: `SwitchBot devices API error: HTTP ${res.status}`,
      };
    }
    const payload = (body.body ?? {}) as {
      deviceList?: Array<{
        deviceId?: string;
        deviceName?: string;
        deviceType?: string;
        hubDeviceId?: string;
      }>;
      infraredRemoteList?: Array<{
        deviceId?: string;
        deviceName?: string;
        remoteType?: string;
        hubDeviceId?: string;
      }>;
    };
    const physical = (payload.deviceList ?? []).map((d) => ({
      deviceId: String(d.deviceId ?? ""),
      deviceName: String(d.deviceName ?? ""),
      deviceType: String(d.deviceType ?? ""),
      hubDeviceId: d.hubDeviceId ? String(d.hubDeviceId) : undefined,
      infrared: false,
    }));
    const infrared = (payload.infraredRemoteList ?? []).map((d) => ({
      deviceId: String(d.deviceId ?? ""),
      deviceName: String(d.deviceName ?? ""),
      deviceType: String(d.remoteType ?? "Infrared Remote"),
      hubDeviceId: d.hubDeviceId ? String(d.hubDeviceId) : undefined,
      infrared: true,
    }));
    return {
      ok: true,
      data: [...physical, ...infrared].filter((d) => d.deviceId),
      statusCode: res.status,
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? redactSecrets(err.message, env)
        : "SwitchBot devices fetch failed";
    return { ok: false, error: msg };
  }
}

function normalizeLockStateV1(
  raw: unknown
): SwitchBotLockStatusV1["lockState"] {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "LOCKED" || s === "LOCK") return "LOCKED";
  if (s === "UNLOCKED" || s === "UNLOCK") return "UNLOCKED";
  if (s === "JAMMED") return "JAMMED";
  // 既存サービス互換（小文字 locked/unlocked）
  const lower = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (lower === "locked") return "LOCKED";
  if (lower === "unlocked") return "UNLOCKED";
  return "UNKNOWN";
}

function normalizeDoorStateV1(
  raw: unknown
): SwitchBotLockStatusV1["doorState"] {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "open" || s === "opened") return "open";
  if (s === "close" || s === "closed") return "close";
  return "unknown";
}

/**
 * ロック状態取得（lockState / doorState / battery）
 */
export async function getSwitchBotLockStatusV1(
  deviceId?: string,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<SwitchBotLockStatusV1>> {
  const id = String(deviceId || env.lockDeviceId || "").trim();
  if (!isSwitchBotHomeConfiguredV1(env)) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_TOKEN / SWITCHBOT_SECRET が未設定です",
    };
  }
  if (!id) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_LOCK_DEVICE_ID が未設定です",
    };
  }
  try {
    const res = await switchBotHomeFetchV1(
      `/devices/${encodeURIComponent(id)}/status`,
      undefined,
      env
    );
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: `SwitchBot lock status error: HTTP ${res.status}`,
      };
    }
    const statusBody = (body.body ?? {}) as Record<string, unknown>;
    const lockRaw =
      statusBody.lockState ?? statusBody.lock ?? statusBody.LockState;
    const doorRaw = statusBody.doorState ?? statusBody.door;
    const batteryRaw = statusBody.battery;
    const battery =
      typeof batteryRaw === "number" && Number.isFinite(batteryRaw)
        ? Math.max(0, Math.min(100, Math.round(batteryRaw)))
        : null;
    return {
      ok: true,
      statusCode: res.status,
      data: {
        deviceId: id,
        lockState: normalizeLockStateV1(lockRaw),
        doorState: normalizeDoorStateV1(doorRaw),
        battery,
        raw: statusBody,
      },
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? redactSecrets(err.message, env)
        : "SwitchBot lock status failed";
    return { ok: false, error: msg };
  }
}

export interface SwitchBotCommandPayloadV1 {
  command: string;
  parameter?: string | Record<string, unknown>;
  commandType?: string;
}

/**
 * デバイスへコマンド送信
 */
export async function sendSwitchBotCommandV1(
  deviceId: string,
  payload: SwitchBotCommandPayloadV1,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<{ message: string }>> {
  const id = String(deviceId || "").trim();
  if (!isSwitchBotHomeConfiguredV1(env)) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_TOKEN / SWITCHBOT_SECRET が未設定です",
    };
  }
  if (!id) {
    return { ok: false, skipped: true, error: "deviceId が空です" };
  }
  try {
    const res = await switchBotHomeFetchV1(
      `/devices/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        body: JSON.stringify({
          command: payload.command,
          parameter: payload.parameter ?? "default",
          commandType: payload.commandType ?? "command",
        }),
      },
      env
    );
    const body = await parseJsonSafe(res);
    const statusCode =
      typeof body.statusCode === "number" ? body.statusCode : res.status;
    const apiMessage =
      typeof body.message === "string" ? body.message : undefined;
    // SwitchBot は HTTP 200 でも body.statusCode !== 100 のことがある
    if (!res.ok || (typeof body.statusCode === "number" && body.statusCode !== 100)) {
      const msg =
        apiMessage ?? `SwitchBot command failed: HTTP ${res.status}`;
      return {
        ok: false,
        statusCode,
        error: redactSecrets(
          `SwitchBot ${payload.command}: ${msg} (statusCode=${statusCode})`,
          env
        ),
      };
    }
    return {
      ok: true,
      statusCode,
      data: {
        message: `SwitchBot ${payload.command} sent to ${id}`,
      },
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? redactSecrets(err.message, env)
        : "SwitchBot command failed";
    return { ok: false, error: msg };
  }
}

export async function sendSwitchBotLockCommandV1(
  command: "lock" | "unlock",
  deviceId?: string,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<{ message: string }>> {
  const id = String(deviceId || env.lockDeviceId || "").trim();
  if (!id) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_LOCK_DEVICE_ID が未設定です",
    };
  }
  return sendSwitchBotCommandV1(
    id,
    { command, parameter: "default", commandType: "command" },
    env
  );
}

/** HOME エアコンモード → SwitchBot setAll mode 番号 */
export function homeAirconModeToSwitchBotV1(
  mode: string
): 1 | 2 | 3 | 4 | 5 {
  switch (mode) {
    case "heat":
      return 5;
    case "dry":
      return 3;
    case "fan":
      return 4;
    case "cool":
    default:
      return 2;
  }
}

/** HOME 風量 → SwitchBot setAll fan 番号 */
export function homeAirconFanToSwitchBotV1(fan: string): 1 | 2 | 3 | 4 {
  switch (fan) {
    case "low":
      return 2;
    case "mid":
      return 3;
    case "high":
      return 4;
    case "auto":
    default:
      return 1;
  }
}

/**
 * 赤外線エアコン setAll
 * parameter: `{temp},{mode},{fan},{on|off}`
 */
export async function sendSwitchBotAirconSetAllV1(input: {
  deviceId?: string;
  temperatureC: number;
  mode: string;
  fan: string;
  power: boolean;
  env?: SwitchBotHomeEnvV1;
}): Promise<SwitchBotApiResultV1<{ message: string; parameter: string }>> {
  const env = input.env ?? getSwitchBotHomeEnvV1();
  const id = String(input.deviceId || env.airConditionerDeviceId || "").trim();
  if (!id) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_AIR_CONDITIONER_DEVICE_ID が未設定です",
    };
  }
  const temp = Math.max(
    16,
    Math.min(30, Math.round(Number(input.temperatureC) || 26))
  );
  const modeNum = homeAirconModeToSwitchBotV1(input.mode);
  const fanNum = homeAirconFanToSwitchBotV1(input.fan);
  const power = input.power ? "on" : "off";
  const parameter = `${temp},${modeNum},${fanNum},${power}`;
  const result = await sendSwitchBotCommandV1(
    id,
    { command: "setAll", parameter, commandType: "command" },
    env
  );
  if (!result.ok) {
    return {
      ok: false,
      skipped: result.skipped,
      error: result.error,
      statusCode: result.statusCode,
    };
  }
  return {
    ok: true,
    statusCode: result.statusCode,
    data: {
      message: result.data?.message ?? "setAll sent",
      parameter,
    },
  };
}

export async function sendSwitchBotAirconPowerV1(
  powerOn: boolean,
  deviceId?: string,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<{ message: string }>> {
  const id = String(deviceId || env.airConditionerDeviceId || "").trim();
  if (!id) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_AIR_CONDITIONER_DEVICE_ID が未設定です",
    };
  }
  return sendSwitchBotCommandV1(
    id,
    {
      command: powerOn ? "turnOn" : "turnOff",
      parameter: "default",
      commandType: "command",
    },
    env
  );
}

export interface SwitchBotDeviceStatusV1 {
  deviceId: string;
  /** 電源系: true=ON / false=OFF / null=不明 */
  power: boolean | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  raw?: Record<string, unknown>;
}

function parsePowerState(raw: Record<string, unknown>): boolean | null {
  const candidates = [
    raw.power,
    raw.powerState,
    raw.Power,
    raw.PowerState,
  ];
  for (const c of candidates) {
    if (typeof c === "boolean") return c;
    const s = String(c ?? "")
      .trim()
      .toLowerCase();
    if (s === "on" || s === "true" || s === "1") return true;
    if (s === "off" || s === "false" || s === "0") return false;
  }
  return null;
}

function parseNumberOrNull(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * 任意デバイスの status 取得（温湿度・電源など）
 */
export async function getSwitchBotDeviceStatusV1(
  deviceId: string,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<SwitchBotDeviceStatusV1>> {
  const id = String(deviceId || "").trim();
  if (!isSwitchBotHomeConfiguredV1(env)) {
    return {
      ok: false,
      skipped: true,
      error: "SWITCHBOT_TOKEN / SWITCHBOT_SECRET が未設定です",
    };
  }
  if (!id) {
    return { ok: false, skipped: true, error: "deviceId が空です" };
  }
  try {
    const res = await switchBotHomeFetchV1(
      `/devices/${encodeURIComponent(id)}/status`,
      undefined,
      env
    );
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: `SwitchBot status error: HTTP ${res.status}`,
      };
    }
    const statusBody = (body.body ?? {}) as Record<string, unknown>;
    const temperatureC = parseNumberOrNull(
      statusBody.temperature ?? statusBody.temp
    );
    const humidityPercent = parseNumberOrNull(
      statusBody.humidity ?? statusBody.humid
    );
    return {
      ok: true,
      statusCode: res.status,
      data: {
        deviceId: id,
        power: parsePowerState(statusBody),
        temperatureC:
          temperatureC === null
            ? null
            : Math.round(temperatureC * 10) / 10,
        humidityPercent:
          humidityPercent === null
            ? null
            : Math.max(0, Math.min(100, Math.round(humidityPercent))),
        raw: statusBody,
      },
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? redactSecrets(err.message, env)
        : "SwitchBot status failed";
    return { ok: false, error: msg };
  }
}

/** Bot の press（風呂自動ボタン等） */
export async function sendSwitchBotBotPressV1(
  deviceId: string,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<{ message: string }>> {
  const id = String(deviceId || "").trim();
  if (!id) {
    return { ok: false, skipped: true, error: "Bot deviceId が空です" };
  }
  return sendSwitchBotCommandV1(
    id,
    { command: "press", parameter: "default", commandType: "command" },
    env
  );
}

/** 照明・プラグ・加湿器・TV 等の ON/OFF */
export async function sendSwitchBotPowerCommandV1(
  deviceId: string,
  powerOn: boolean,
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Promise<SwitchBotApiResultV1<{ message: string }>> {
  const id = String(deviceId || "").trim();
  if (!id) {
    return { ok: false, skipped: true, error: "deviceId が空です" };
  }
  return sendSwitchBotCommandV1(
    id,
    {
      command: powerOn ? "turnOn" : "turnOff",
      parameter: "default",
      commandType: "command",
    },
    env
  );
}
