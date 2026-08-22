/**
 * TiSLY HOME — 風呂推定ステータス v1
 *
 * 湯はり開始から約30分のカウントダウンを
 * SQLite で永続化し、複数端末で整合する。
 */

import { getDatabase } from "../db/database.js";
import { queueRp2350RelayPulseV1 } from "../device/rp2350-relay-pulse-v1.js";
import {
  findHomeSiteV1,
  listHomeSitesV1,
  type HomeBathFillStateV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

/** 推定湯はり時間（ms） */
export const HOME_BATH_FILL_DURATION_MS_V1 = 30 * 60 * 1000;

export interface HomeBathPersistedStateV1 {
  siteId: string;
  fillState: HomeBathFillStateV1;
  startedAt: string | null;
  estimatedEndAt: string | null;
  lastMessage: string | null;
  updatedAt: string;
}

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureBathStateTableV1(): void {
  if (tableReady) return;
  tableReady = true;
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS home_bath_state_v1 (
        site_id TEXT PRIMARY KEY,
        fill_state TEXT NOT NULL DEFAULT 'idle',
        started_at TEXT,
        estimated_end_at TEXT,
        last_message TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  } catch {
    // DB 未初期化でも画面は動かす
  }
}

function isOneshotBathSiteV1(site: HomeSiteV1): boolean {
  return (
    site.bath.uiProfile === "oneshot_autofill" ||
    site.operationMode === "live"
  );
}

function readPersistedStateV1(
  siteId: string
): HomeBathPersistedStateV1 | null {
  try {
    ensureBathStateTableV1();
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT site_id, fill_state, started_at,
                estimated_end_at, last_message, updated_at
         FROM home_bath_state_v1
         WHERE site_id = ?`
      )
      .get(siteId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      siteId: String(row.site_id),
      fillState: String(row.fill_state) as HomeBathFillStateV1,
      startedAt: row.started_at ? String(row.started_at) : null,
      estimatedEndAt: row.estimated_end_at
        ? String(row.estimated_end_at)
        : null,
      lastMessage: row.last_message ? String(row.last_message) : null,
      updatedAt: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

function writePersistedStateV1(
  siteId: string,
  state: Omit<HomeBathPersistedStateV1, "siteId">
): void {
  try {
    ensureBathStateTableV1();
    const db = getDatabase();
    db.prepare(
      `INSERT INTO home_bath_state_v1 (
        site_id, fill_state, started_at,
        estimated_end_at, last_message, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET
        fill_state = excluded.fill_state,
        started_at = excluded.started_at,
        estimated_end_at = excluded.estimated_end_at,
        last_message = excluded.last_message,
        updated_at = excluded.updated_at`
    ).run(
      siteId,
      state.fillState,
      state.startedAt,
      state.estimatedEndAt,
      state.lastMessage,
      state.updatedAt
    );
  } catch {
    // 永続化失敗でもメモリ状態は維持
  }
}

/** メモリ上の bath へ推定状態を反映 */
export function applyBathPersistedToSiteV1(
  site: HomeSiteV1,
  persisted: HomeBathPersistedStateV1 | null
): void {
  if (!persisted) return;
  site.bath.fillState = persisted.fillState;
  site.bath.fillStartedAt = persisted.startedAt;
  site.bath.fillEstimatedEndAt = persisted.estimatedEndAt;
  site.bath.lastPulseMessage = persisted.lastMessage;
  site.bath.autoFill = persisted.fillState === "filling";
  if (persisted.fillState === "filling") {
    site.bath.fillPercent = Math.max(site.bath.fillPercent, 5);
  } else if (persisted.fillState === "idle") {
    site.bath.fillPercent = 0;
  }
}

/** 起動時・API 前に DB から復元 */
export function hydrateHomeBathStateV1(siteId: string): void {
  const site = findHomeSiteV1(siteId);
  if (!isOneshotBathSiteV1(site)) return;
  const persisted = readPersistedStateV1(siteId);
  if (persisted) {
    applyBathPersistedToSiteV1(site, persisted);
  }
  syncBathEstimationForSiteV1(site);
}

/** 全 oneshot 物件を復元 */
export function hydrateAllHomeBathStatesV1(): void {
  ensureBathStateTableV1();
  for (const site of listHomeSitesV1()) {
    if (!isOneshotBathSiteV1(site)) continue;
    hydrateHomeBathStateV1(site.id);
  }
}

function isCurrentlyFillingV1(site: HomeSiteV1): boolean {
  if (site.bath.fillState !== "filling") return false;
  const endAt = site.bath.fillEstimatedEndAt;
  if (!endAt) return true;
  const endMs = Date.parse(endAt);
  if (Number.isNaN(endMs)) return true;
  return Date.now() < endMs;
}

/** 30分経過で自動完了へ遷移 */
export function syncBathEstimationForSiteV1(site: HomeSiteV1): boolean {
  if (!isOneshotBathSiteV1(site)) return false;
  if (site.bath.fillState !== "filling") return false;
  const endAt = site.bath.fillEstimatedEndAt;
  if (!endAt) return false;
  const endMs = Date.parse(endAt);
  if (Number.isNaN(endMs) || Date.now() < endMs) return false;

  site.bath.fillState = "done";
  site.bath.autoFill = false;
  site.bath.fillPercent = 100;
  site.bath.lastPulseMessage = "湯はり完了 / 待機中";
  site.bath.fillStartedAt = site.bath.fillStartedAt ?? null;
  site.bath.fillEstimatedEndAt = endAt;

  writePersistedStateV1(site.id, {
    fillState: "done",
    startedAt: site.bath.fillStartedAt ?? null,
    estimatedEndAt: endAt,
    lastMessage: site.bath.lastPulseMessage,
    updatedAt: nowIso(),
  });

  recordSystemLogV1({
    siteId: site.id,
    tenantId: site.tenantId,
    category: "bath_state",
    message: `${site.displayName}: 推定30分経過により湯はり完了（待機中）`,
    detail: { fillState: "done", estimatedEndAt: endAt },
    actor: "system",
  });
  return true;
}

/** 全物件の推定タイマーを同期 */
export function syncAllBathEstimationsV1(): number {
  let changed = 0;
  for (const site of listHomeSitesV1()) {
    if (syncBathEstimationForSiteV1(site)) changed += 1;
  }
  return changed;
}

function queueBathPulseV1(
  site: HomeSiteV1,
  reason: string
): { ok: boolean; error?: string; command?: string } {
  const channel = Number(site.bath.relayChannel ?? 1);
  const durationMs = Number(site.bath.pulseDurationMs ?? 500);
  const pulse = queueRp2350RelayPulseV1({
    channel,
    durationMs,
    reason,
  });
  if (pulse.ok) {
    recordSystemLogV1({
      siteId: site.id,
      tenantId: site.tenantId,
      category: "rp2350_comm",
      message: `${site.displayName}: CH${channel}（${durationMs}ms）パルスを送信`,
      detail: {
        channel,
        durationMs,
        command: pulse.command,
        reason,
      },
      actor: "system",
    });
  }
  return pulse;
}

export type HomeBathFillSourceV1 =
  | "manual"
  | "schedule"
  | "delay";

/** 湯はり開始（パルス + 30分推定） */
export function startBathFillV1(input: {
  site: HomeSiteV1;
  actor?: string | null;
  source?: HomeBathFillSourceV1;
}): { ok: boolean; error?: string; message?: string } {
  const site = input.site;
  if (!isOneshotBathSiteV1(site)) {
    return { ok: false, error: "この物件は推定湯はり非対応です" };
  }

  const source = input.source ?? "manual";
  const pulse = queueBathPulseV1(
    site,
    `home_bath_start:${site.id}:${source}`
  );
  if (!pulse.ok) {
    return {
      ok: false,
      error: pulse.error || "湯はりパルス送信に失敗しました",
    };
  }

  const startedAt = nowIso();
  const estimatedEndAt = new Date(
    Date.now() + HOME_BATH_FILL_DURATION_MS_V1
  ).toISOString();

  site.bath.fillState = "filling";
  site.bath.autoFill = true;
  site.bath.fillPercent = 5;
  site.bath.reheating = false;
  site.bath.keepWarm = false;
  site.bath.fillStartedAt = startedAt;
  site.bath.fillEstimatedEndAt = estimatedEndAt;
  site.bath.lastPulseMessage = "湯はり中（残り約30分）";

  writePersistedStateV1(site.id, {
    fillState: "filling",
    startedAt,
    estimatedEndAt,
    lastMessage: site.bath.lastPulseMessage,
    updatedAt: nowIso(),
  });

  const logCategory =
    source === "schedule"
      ? "schedule_run"
      : source === "delay"
        ? "delay_run"
        : "manual_control";
  const logPrefix =
    source === "schedule"
      ? "スケジュール実行により湯はりを開始"
      : source === "delay"
        ? "遅延実行により湯はりを開始"
        : "ユーザー操作により湯はりを開始";

  recordSystemLogV1({
    siteId: site.id,
    tenantId: site.tenantId,
    category: logCategory,
    message: `${site.displayName}: ${logPrefix}しました`,
    detail: {
      channel: site.bath.relayChannel ?? 1,
      durationMs: site.bath.pulseDurationMs ?? 500,
      command: pulse.command,
      startedAt,
      estimatedEndAt,
    },
    actor: input.actor ?? "app",
  });

  return {
    ok: true,
    message: site.bath.lastPulseMessage ?? "湯はりを開始しました",
  };
}

/** 湯はり停止（再パルス + 即時 idle） */
export function stopBathFillV1(input: {
  site: HomeSiteV1;
  actor?: string | null;
}): { ok: boolean; error?: string; message?: string } {
  const site = input.site;
  if (!isOneshotBathSiteV1(site)) {
    return { ok: false, error: "この物件は推定湯はり非対応です" };
  }

  const pulse = queueBathPulseV1(
    site,
    `home_bath_stop:${site.id}`
  );
  if (!pulse.ok) {
    return {
      ok: false,
      error: pulse.error || "停止パルス送信に失敗しました",
    };
  }

  site.bath.fillState = "idle";
  site.bath.autoFill = false;
  site.bath.fillPercent = 0;
  site.bath.reheating = false;
  site.bath.keepWarm = false;
  site.bath.fillStartedAt = null;
  site.bath.fillEstimatedEndAt = null;
  site.bath.lastPulseMessage = "停止中";

  writePersistedStateV1(site.id, {
    fillState: "idle",
    startedAt: null,
    estimatedEndAt: null,
    lastMessage: site.bath.lastPulseMessage,
    updatedAt: nowIso(),
  });

  recordSystemLogV1({
    siteId: site.id,
    tenantId: site.tenantId,
    category: "manual_control",
    message: `${site.displayName}: ユーザー操作により湯はりを停止（CH${site.bath.relayChannel ?? 1} 500ms）`,
    detail: {
      channel: site.bath.relayChannel ?? 1,
      durationMs: site.bath.pulseDurationMs ?? 500,
      command: pulse.command,
    },
    actor: input.actor ?? "app",
  });

  return { ok: true, message: "湯はりを停止しました" };
}

/** 推定残り秒数 */
export function getBathRemainingSecondsV1(site: HomeSiteV1): number {
  if (site.bath.fillState !== "filling") return 0;
  const endAt = site.bath.fillEstimatedEndAt;
  if (!endAt) return Math.round(HOME_BATH_FILL_DURATION_MS_V1 / 1000);
  const endMs = Date.parse(endAt);
  if (Number.isNaN(endMs)) return 0;
  return Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
}

/** MM:SS 表示 */
export function formatBathCountdownV1(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** oneshot 自動湯はり（開始 or 停止） */
export function toggleOneshotBathFillV1(input: {
  site: HomeSiteV1;
  actor?: string | null;
}): { ok: boolean; error?: string; message?: string } {
  syncBathEstimationForSiteV1(input.site);
  hydrateHomeBathStateV1(input.site.id);
  if (isCurrentlyFillingV1(input.site)) {
    return stopBathFillV1(input);
  }
  return startBathFillV1({ ...input, source: "manual" });
}

export { isCurrentlyFillingV1, isOneshotBathSiteV1 };
