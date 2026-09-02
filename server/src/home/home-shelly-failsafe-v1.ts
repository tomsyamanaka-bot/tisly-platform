/**
 * 電源フェイルセーフ（Shelly連動）v1
 *
 * RP2350 通信途絶時に Shelly 電源を
 * 自動再投入する設定と実行ロジック。
 * 既存物件データは削除せず追記のみ。
 */

import { getDatabase } from "../db/database.js";
import { shellyToggle } from "../device/shelly-real-client.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

/** 自動再起動クールダウン既定（分） */
export const SHELLY_FAILSAFE_COOLDOWN_MIN_V1 = 20;
/** OFF→ON 間隔（秒） */
export const SHELLY_FAILSAFE_OFF_SEC_V1 = 5;

export interface HomeShellyFailsafeConfigV1 {
  siteId: string;
  /** 自動電源復旧 ON/OFF */
  autoRebootEnabled: boolean;
  /** Shelly ローカルIP または http(s) URL */
  shellyHost: string;
  /** Shelly Cloud デバイスID（任意） */
  shellyCloudId: string;
  /** 認証キー（保存用・表示はマスク） */
  shellyAuthKey: string;
  /** クールダウン（分）15〜30 */
  cooldownMinutes: number;
  /** 最終自動再投入時刻 */
  lastAutoRebootAt: string | null;
  updatedAt: string;
}

export interface HomeShellyFailsafePatchV1 {
  autoRebootEnabled?: boolean;
  shellyHost?: string;
  shellyCloudId?: string;
  shellyAuthKey?: string;
  cooldownMinutes?: number;
  lastAutoRebootAt?: string | null;
}

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureTableV1(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS home_shelly_failsafe_v1 (
      site_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tableReady = true;
}

function clampCooldownMin(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(15, Math.min(30, Math.round(n)));
}

function defaultConfigV1(siteId: string): HomeShellyFailsafeConfigV1 {
  return {
    siteId,
    autoRebootEnabled: false,
    shellyHost: "",
    shellyCloudId: "",
    shellyAuthKey: "",
    cooldownMinutes: SHELLY_FAILSAFE_COOLDOWN_MIN_V1,
    lastAutoRebootAt: null,
    updatedAt: nowIso(),
  };
}

function parseConfigV1(
  siteId: string,
  raw: unknown
): HomeShellyFailsafeConfigV1 {
  const base = defaultConfigV1(siteId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    siteId,
    autoRebootEnabled: Boolean(o.autoRebootEnabled),
    shellyHost: String(o.shellyHost ?? "").trim(),
    shellyCloudId: String(o.shellyCloudId ?? "").trim(),
    shellyAuthKey: String(o.shellyAuthKey ?? "").trim(),
    cooldownMinutes: clampCooldownMin(
      o.cooldownMinutes,
      SHELLY_FAILSAFE_COOLDOWN_MIN_V1
    ),
    lastAutoRebootAt:
      typeof o.lastAutoRebootAt === "string" ? o.lastAutoRebootAt : null,
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
  };
}

function persistV1(cfg: HomeShellyFailsafeConfigV1): void {
  ensureTableV1();
  getDatabase()
    .prepare(
      `INSERT INTO home_shelly_failsafe_v1 (site_id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    )
    .run(cfg.siteId, JSON.stringify(cfg), cfg.updatedAt);
}

/** 物件の Shelly フェイルセーフ設定を取得 */
export function getHomeShellyFailsafeV1(
  siteId: string
): HomeShellyFailsafeConfigV1 {
  const sid = String(siteId || "").trim();
  if (!sid) return defaultConfigV1("");
  ensureTableV1();
  const row = getDatabase()
    .prepare(
      `SELECT config_json FROM home_shelly_failsafe_v1 WHERE site_id = ?`
    )
    .get(sid) as { config_json: string } | undefined;
  if (!row?.config_json) return defaultConfigV1(sid);
  try {
    return parseConfigV1(sid, JSON.parse(row.config_json));
  } catch {
    return defaultConfigV1(sid);
  }
}

/** 設定更新（既存キーは保持） */
export function updateHomeShellyFailsafeV1(
  siteId: string,
  patch: HomeShellyFailsafePatchV1
): HomeShellyFailsafeConfigV1 {
  const sid = String(siteId || "").trim();
  if (!sid) throw new Error("siteId required");
  const current = getHomeShellyFailsafeV1(sid);
  const next: HomeShellyFailsafeConfigV1 = {
    ...current,
    autoRebootEnabled:
      patch.autoRebootEnabled !== undefined
        ? Boolean(patch.autoRebootEnabled)
        : current.autoRebootEnabled,
    shellyHost:
      patch.shellyHost !== undefined
        ? String(patch.shellyHost).trim()
        : current.shellyHost,
    shellyCloudId:
      patch.shellyCloudId !== undefined
        ? String(patch.shellyCloudId).trim()
        : current.shellyCloudId,
    shellyAuthKey:
      patch.shellyAuthKey !== undefined
        ? String(patch.shellyAuthKey).trim()
        : current.shellyAuthKey,
    cooldownMinutes:
      patch.cooldownMinutes !== undefined
        ? clampCooldownMin(patch.cooldownMinutes, current.cooldownMinutes)
        : current.cooldownMinutes,
    lastAutoRebootAt:
      patch.lastAutoRebootAt !== undefined
        ? patch.lastAutoRebootAt
        : current.lastAutoRebootAt,
    updatedAt: nowIso(),
  };
  persistV1(next);
  return next;
}

/** UI 表示用（認証キーをマスク） */
export function maskHomeShellyFailsafeV1(
  cfg: HomeShellyFailsafeConfigV1
): HomeShellyFailsafeConfigV1 & { shellyAuthKeyMasked: string } {
  const key = cfg.shellyAuthKey || "";
  const masked =
    key.length <= 4
      ? key
        ? "••••"
        : ""
      : `${"•".repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
  return {
    ...cfg,
    shellyAuthKey: "",
    shellyAuthKeyMasked: masked,
  };
}

/** Shelly RPC 用ベースURLを組み立て */
export function resolveShellyFailsafeBaseUrlV1(
  cfg: HomeShellyFailsafeConfigV1
): string | null {
  const host = String(cfg.shellyHost || "").trim();
  if (!host) return null;
  if (/^https?:\/\//i.test(host)) {
    return host.replace(/\/$/, "");
  }
  return `http://${host.replace(/\/$/, "")}`;
}

function isInCooldownV1(cfg: HomeShellyFailsafeConfigV1): boolean {
  if (!cfg.lastAutoRebootAt) return false;
  const last = Date.parse(cfg.lastAutoRebootAt);
  if (!Number.isFinite(last)) return false;
  const coolMs = cfg.cooldownMinutes * 60_000;
  return Date.now() - last < coolMs;
}

export interface ShellyColdCycleResultV1 {
  ok: boolean;
  message: string;
  dryRun?: boolean;
  offResult?: { ok: boolean; message: string };
  onResult?: { ok: boolean; message: string };
}

/**
 * Shelly リレー OFF → 5秒 → ON
 * （物件設定の接続先を優先）
 */
export async function runShellyColdPowerCycleFromConfigV1(input: {
  siteId: string;
  actor?: string;
  /** 自動キック時 true */
  auto?: boolean;
  reason?: string;
}): Promise<ShellyColdCycleResultV1> {
  const siteId = String(input.siteId || "").trim();
  const cfg = getHomeShellyFailsafeV1(siteId);
  const baseUrl = resolveShellyFailsafeBaseUrlV1(cfg);
  const authToken = cfg.shellyAuthKey || undefined;

  const offResult = await shellyToggle({
    confirm: true,
    on: false,
    baseUrl: baseUrl || undefined,
    authToken,
  });
  await new Promise((r) => setTimeout(r, SHELLY_FAILSAFE_OFF_SEC_V1 * 1000));
  const onResult = await shellyToggle({
    confirm: true,
    on: true,
    baseUrl: baseUrl || undefined,
    authToken,
  });

  const ok = offResult.ok && onResult.ok;
  const message = ok
    ? "Shelly電源制御：5秒OFF後に再投入しました"
    : "Shelly電源制御の一部が失敗しました";

  recordSystemLogV1({
    siteId,
    category: "manual_control",
    message: input.auto
      ? "電源自動復旧（Shelly連動）"
      : "Shelly コールドリブート（手動）",
    detail: {
      auto: !!input.auto,
      reason: input.reason,
      offResult,
      onResult,
      baseUrl: baseUrl || "(env default)",
    },
    actor: input.actor ?? (input.auto ? "failsafe-worker" : "operator-pro"),
  });

  return {
    ok,
    message,
    dryRun: offResult.dryRun || onResult.dryRun,
    offResult: { ok: offResult.ok, message: offResult.message },
    onResult: { ok: onResult.ok, message: onResult.message },
  };
}

export interface ShellyAutoRebootAttemptV1 {
  triggered: boolean;
  skippedReason?: string;
  result?: ShellyColdCycleResultV1;
  config: HomeShellyFailsafeConfigV1;
}

/**
 * 通信途絶時の自動キック（クールダウン付き）
 */
export async function maybeTriggerShellyAutoRebootV1(input: {
  siteId: string;
  buildingLabel?: string;
  reason?: string;
}): Promise<ShellyAutoRebootAttemptV1> {
  const siteId = String(input.siteId || "").trim();
  const cfg = getHomeShellyFailsafeV1(siteId);

  if (!cfg.autoRebootEnabled) {
    return { triggered: false, skippedReason: "自動再起動OFF", config: cfg };
  }
  if (!resolveShellyFailsafeBaseUrlV1(cfg) && !process.env.SHELLY_BASE_URL) {
    return {
      triggered: false,
      skippedReason: "Shelly接続先未設定",
      config: cfg,
    };
  }
  if (isInCooldownV1(cfg)) {
    return {
      triggered: false,
      skippedReason: `クールダウン中（${cfg.cooldownMinutes}分）`,
      config: cfg,
    };
  }

  const result = await runShellyColdPowerCycleFromConfigV1({
    siteId,
    auto: true,
    actor: "failsafe-worker",
    reason:
      input.reason ||
      `${input.buildingLabel || "RP2350"}通信途絶による電源自動復旧`,
  });

  const updated = updateHomeShellyFailsafeV1(siteId, {
    lastAutoRebootAt: nowIso(),
  });

  return { triggered: true, result, config: updated };
}

/** Shelly Script 用テンプレート生成 */
export function buildShellyLocalWatchdogScriptV1(input?: {
  targetUrl?: string;
  failThreshold?: number;
  intervalMs?: number;
  offMs?: number;
}): string {
  const target =
    String(input?.targetUrl || "http://192.168.1.50/").trim() ||
    "http://192.168.1.50/";
  const failThreshold = Math.max(1, Math.min(10, input?.failThreshold ?? 3));
  const intervalMs = Math.max(10000, input?.intervalMs ?? 60000);
  const offMs = Math.max(1000, Math.min(30000, input?.offMs ?? 5000));

  return `// TiSLY 電源フェイルセーフ — Shelly 1 Mini Gen3
// RP2350 疎通監視 → 連続失敗で電源再投入
// このスクリプトを Shelly に保存して有効化してください

let TARGET_URL = ${JSON.stringify(target)};
let FAIL_LIMIT = ${failThreshold};
let INTERVAL_MS = ${intervalMs};
let OFF_MS = ${offMs};
let failCount = 0;
let cycling = false;

function powerCycle() {
  if (cycling) return;
  cycling = true;
  print("[TiSLY] RP不通 → Shelly電源OFF");
  Shelly.call("Switch.Set", { id: 0, on: false }, function () {
    Timer.set(OFF_MS, false, function () {
      print("[TiSLY] Shelly電源ON（再投入）");
      Shelly.call("Switch.Set", { id: 0, on: true }, function () {
        cycling = false;
        failCount = 0;
      });
    });
  });
}

function checkTarget() {
  if (cycling) return;
  Shelly.call(
    "HTTP.GET",
    { url: TARGET_URL, timeout: 5 },
    function (res, err_code) {
      let ok = err_code === 0 && res && (res.code === 200 || res.code === 204);
      if (ok) {
        failCount = 0;
        return;
      }
      failCount = failCount + 1;
      print("[TiSLY] 疎通失敗 ", failCount, "/", FAIL_LIMIT);
      if (failCount >= FAIL_LIMIT) {
        powerCycle();
      }
    }
  );
}

Timer.set(INTERVAL_MS, true, checkTarget);
print("[TiSLY] ローカル自律Ping監視を開始");
`;
}
