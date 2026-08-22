/**
 * TiSLY HOME — 風呂スケジュール / 遅延実行 v1
 *
 * 30/60/90分後の遅延キューと
 * 毎日指定時刻・一度きり予約を管理する。
 */

import { getDatabase } from "../db/database.js";
import {
  findHomeSiteV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";
import {
  isOneshotBathSiteV1,
  startBathFillV1,
} from "./home-bath-state-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

export type HomeBathScheduleKindV1 = "delay" | "daily" | "once";

export interface HomeBathScheduleRowV1 {
  id: number;
  siteId: string;
  kind: HomeBathScheduleKindV1;
  delayMinutes: number | null;
  dailyTime: string | null;
  runAt: string | null;
  nextRunAt: string | null;
  enabled: boolean;
  label: string;
  actor: string;
  createdAt: string;
  lastRunAt: string | null;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const VALID_DELAY_MINUTES = [30, 60, 90];

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureScheduleTableV1(): void {
  if (tableReady) return;
  tableReady = true;
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS home_bath_schedules_v1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        kind TEXT NOT NULL
          CHECK (kind IN ('delay', 'daily', 'once')),
        delay_minutes INTEGER,
        daily_time TEXT,
        run_at TEXT,
        next_run_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        label TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'app',
        created_at TEXT NOT NULL,
        last_run_at TEXT,
        cancelled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_home_bath_schedules_next
        ON home_bath_schedules_v1(enabled, next_run_at);
      CREATE INDEX IF NOT EXISTS idx_home_bath_schedules_site
        ON home_bath_schedules_v1(site_id, id DESC);
    `);
  } catch {
    // DB 未初期化でも画面は動かす
  }
}

function mapScheduleRow(row: Record<string, unknown>): HomeBathScheduleRowV1 {
  return {
    id: Number(row.id),
    siteId: String(row.site_id),
    kind: String(row.kind) as HomeBathScheduleKindV1,
    delayMinutes:
      row.delay_minutes == null ? null : Number(row.delay_minutes),
    dailyTime: row.daily_time ? String(row.daily_time) : null,
    runAt: row.run_at ? String(row.run_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    enabled: Number(row.enabled) !== 0,
    label: String(row.label ?? ""),
    actor: String(row.actor ?? "app"),
    createdAt: String(row.created_at),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
  };
}

function parseDailyTime(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** JST の次回 daily 実行 ISO */
export function computeNextDailyRunAtV1(
  dailyTime: string,
  fromMs = Date.now()
): string {
  const [hh, mm] = dailyTime.split(":").map((v) => Number(v));
  const jstNow = new Date(fromMs + JST_OFFSET_MS);
  const target = new Date(
    Date.UTC(
      jstNow.getUTCFullYear(),
      jstNow.getUTCMonth(),
      jstNow.getUTCDate(),
      hh - 9,
      mm,
      0,
      0
    )
  );
  if (target.getTime() <= fromMs) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.toISOString();
}

function assertOneshotSite(siteId: string): HomeSiteV1 {
  const site = findHomeSiteV1(siteId);
  if (!site || site.id !== siteId) {
    throw new Error("物件が見つかりません");
  }
  if (!isOneshotBathSiteV1(site)) {
    throw new Error("この物件は湯はり予約非対応です");
  }
  return site;
}

/** 遅延実行（30/60/90分後） */
export function createBathDelayScheduleV1(input: {
  siteId: string;
  delayMinutes: number;
  actor?: string | null;
}): HomeBathScheduleRowV1 {
  ensureScheduleTableV1();
  const site = assertOneshotSite(input.siteId);
  const delayMinutes = Number(input.delayMinutes);
  if (!VALID_DELAY_MINUTES.includes(delayMinutes)) {
    throw new Error("delayMinutes は 30 / 60 / 90 のいずれかです");
  }
  const nextRunAt = new Date(
    Date.now() + delayMinutes * 60 * 1000
  ).toISOString();
  const label = `${delayMinutes}分後に湯はり`;
  const actor = String(input.actor ?? "app");
  const createdAt = nowIso();

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO home_bath_schedules_v1 (
        site_id, kind, delay_minutes, next_run_at,
        enabled, label, actor, created_at
      ) VALUES (?, 'delay', ?, ?, 1, ?, ?, ?)`
    )
    .run(site.id, delayMinutes, nextRunAt, label, actor, createdAt);

  recordSystemLogV1({
    siteId: site.id,
    tenantId: site.tenantId,
    category: "delay_run",
    message: `${site.displayName}: ${delayMinutes}分後の湯はりを予約しました`,
    detail: { scheduleId: Number(result.lastInsertRowid), nextRunAt },
    actor,
  });

  return mapScheduleRow(
    db
      .prepare(`SELECT * FROM home_bath_schedules_v1 WHERE id = ?`)
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>
  );
}

/** 毎日指定時刻（HH:MM JST） */
export function createBathDailyScheduleV1(input: {
  siteId: string;
  dailyTime: string;
  actor?: string | null;
}): HomeBathScheduleRowV1 {
  ensureScheduleTableV1();
  const site = assertOneshotSite(input.siteId);
  const dailyTime = parseDailyTime(input.dailyTime);
  if (!dailyTime) {
    throw new Error("dailyTime は HH:MM 形式で指定してください");
  }
  const nextRunAt = computeNextDailyRunAtV1(dailyTime);
  const label = `毎日 ${dailyTime} に湯はり`;
  const actor = String(input.actor ?? "app");
  const createdAt = nowIso();

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO home_bath_schedules_v1 (
        site_id, kind, daily_time, next_run_at,
        enabled, label, actor, created_at
      ) VALUES (?, 'daily', ?, ?, 1, ?, ?, ?)`
    )
    .run(site.id, dailyTime, nextRunAt, label, actor, createdAt);

  recordSystemLogV1({
    siteId: site.id,
    tenantId: site.tenantId,
    category: "schedule_run",
    message: `${site.displayName}: 毎日${dailyTime}の湯はりを予約しました`,
    detail: {
      scheduleId: Number(result.lastInsertRowid),
      dailyTime,
      nextRunAt,
    },
    actor,
  });

  return mapScheduleRow(
    db
      .prepare(`SELECT * FROM home_bath_schedules_v1 WHERE id = ?`)
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>
  );
}

/** 指定日時（一度きり） */
export function createBathOnceScheduleV1(input: {
  siteId: string;
  runAt: string;
  actor?: string | null;
}): HomeBathScheduleRowV1 {
  ensureScheduleTableV1();
  const site = assertOneshotSite(input.siteId);
  const runAt = String(input.runAt ?? "").trim();
  const runMs = Date.parse(runAt);
  if (!runAt || Number.isNaN(runMs)) {
    throw new Error("runAt は有効な ISO 日時が必要です");
  }
  if (runMs <= Date.now()) {
    throw new Error("runAt は未来の日時を指定してください");
  }

  const d = new Date(runMs);
  const label = `指定 ${d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  })} に湯はり`;
  const actor = String(input.actor ?? "app");
  const createdAt = nowIso();

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO home_bath_schedules_v1 (
        site_id, kind, run_at, next_run_at,
        enabled, label, actor, created_at
      ) VALUES (?, 'once', ?, ?, 1, ?, ?, ?)`
    )
    .run(site.id, runAt, runAt, label, actor, createdAt);

  recordSystemLogV1({
    siteId: site.id,
    tenantId: site.tenantId,
    category: "schedule_run",
    message: `${site.displayName}: 指定日時の湯はりを予約しました`,
    detail: {
      scheduleId: Number(result.lastInsertRowid),
      runAt,
    },
    actor,
  });

  return mapScheduleRow(
    db
      .prepare(`SELECT * FROM home_bath_schedules_v1 WHERE id = ?`)
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>
  );
}

/** 予約一覧（有効のみ） */
export function listBathSchedulesV1(
  siteId: string,
  includeDisabled = false
): HomeBathScheduleRowV1[] {
  ensureScheduleTableV1();
  try {
    const db = getDatabase();
    const sql = includeDisabled
      ? `SELECT * FROM home_bath_schedules_v1
         WHERE site_id = ?
         ORDER BY id DESC`
      : `SELECT * FROM home_bath_schedules_v1
         WHERE site_id = ? AND enabled = 1 AND cancelled_at IS NULL
         ORDER BY id DESC`;
    const rows = db.prepare(sql).all(siteId) as Array<
      Record<string, unknown>
    >;
    return rows.map(mapScheduleRow);
  } catch {
    return [];
  }
}

/** 予約キャンセル */
export function cancelBathScheduleV1(input: {
  siteId: string;
  scheduleId: number;
  actor?: string | null;
}): boolean {
  ensureScheduleTableV1();
  const site = assertOneshotSite(input.siteId);
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE home_bath_schedules_v1
       SET enabled = 0, cancelled_at = ?
       WHERE id = ? AND site_id = ? AND enabled = 1`
    )
    .run(nowIso(), input.scheduleId, input.siteId);

  if (result.changes > 0) {
    recordSystemLogV1({
      siteId: site.id,
      tenantId: site.tenantId,
      category: "schedule_run",
      message: `${site.displayName}: 湯はり予約 #${input.scheduleId} をキャンセルしました`,
      detail: { scheduleId: input.scheduleId },
      actor: input.actor ?? "app",
    });
  }
  return result.changes > 0;
}

function markScheduleRanV1(
  schedule: HomeBathScheduleRowV1,
  ranAt: string
): void {
  const db = getDatabase();
  if (schedule.kind === "daily" && schedule.dailyTime) {
    const nextRunAt = computeNextDailyRunAtV1(schedule.dailyTime, Date.now());
    db.prepare(
      `UPDATE home_bath_schedules_v1
       SET last_run_at = ?, next_run_at = ?
       WHERE id = ?`
    ).run(ranAt, nextRunAt, schedule.id);
    return;
  }
  db.prepare(
    `UPDATE home_bath_schedules_v1
     SET enabled = 0, last_run_at = ?, next_run_at = NULL
     WHERE id = ?`
  ).run(ranAt, schedule.id);
}

/** 期限到来の予約を実行 */
export function tickBathSchedulesV1(): number {
  ensureScheduleTableV1();
  let executed = 0;
  try {
    const db = getDatabase();
    const now = nowIso();
    const rows = db
      .prepare(
        `SELECT * FROM home_bath_schedules_v1
         WHERE enabled = 1
           AND cancelled_at IS NULL
           AND next_run_at IS NOT NULL
           AND next_run_at <= ?
         ORDER BY next_run_at ASC
         LIMIT 20`
      )
      .all(now) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const schedule = mapScheduleRow(row);
      const site = findHomeSiteV1(schedule.siteId);
      if (!isOneshotBathSiteV1(site)) {
        cancelBathScheduleV1({
          siteId: schedule.siteId,
          scheduleId: schedule.id,
          actor: "system",
        });
        continue;
      }
      const source =
        schedule.kind === "delay" ? "delay" : "schedule";
      const result = startBathFillV1({
        site,
        actor: schedule.actor,
        source,
      });
      if (result.ok) {
        markScheduleRanV1(schedule, now);
        executed += 1;
      }
    }
  } catch {
    // 次 tick で再試行
  }
  return executed;
}

export { VALID_DELAY_MINUTES };
