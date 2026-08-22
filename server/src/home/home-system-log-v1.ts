/**
 * TiSLY HOME — 総合システムログ v1
 *
 * 手動操作・スケジュール・遅延実行・
 * RP2350 通信などを一元記録する。
 */

import { getDatabase } from "../db/database.js";
import { findHomeSiteV1 } from "./home-sites-v1.js";

export type HomeSystemLogCategoryV1 =
  | "manual_control"
  | "schedule_run"
  | "delay_run"
  | "sensor_alert"
  | "rp2350_comm"
  | "bath_state";

export interface HomeSystemLogRowV1 {
  id: number;
  siteId: string;
  siteName: string;
  tenantId: string;
  category: HomeSystemLogCategoryV1;
  message: string;
  detail: Record<string, unknown> | null;
  actor: string;
  createdAt: string;
}

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureSystemLogTableV1(): void {
  if (tableReady) return;
  tableReady = true;
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS home_system_logs_v1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL DEFAULT '',
        tenant_id TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'manual_control',
        message TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        actor TEXT NOT NULL DEFAULT 'system',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_home_system_logs_site
        ON home_system_logs_v1(site_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_home_system_logs_created
        ON home_system_logs_v1(created_at DESC);
    `);
  } catch {
    // DB 未初期化でも制御は継続
  }
}

/** タイムスタンプ付きログを追記 */
export function recordSystemLogV1(input: {
  siteId?: string | null;
  tenantId?: string | null;
  category: HomeSystemLogCategoryV1;
  message: string;
  detail?: Record<string, unknown> | null;
  actor?: string | null;
  createdAt?: string;
}): void {
  try {
    ensureSystemLogTableV1();
    const siteId = String(input.siteId ?? "").trim();
    let tenantId = String(input.tenantId ?? "").trim();
    if (!tenantId && siteId) {
      tenantId = findHomeSiteV1(siteId).tenantId;
    }
    const db = getDatabase();
    db.prepare(
      `INSERT INTO home_system_logs_v1 (
        site_id, tenant_id, category, message,
        detail_json, actor, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      siteId,
      tenantId,
      input.category,
      input.message,
      JSON.stringify(input.detail ?? {}),
      String(input.actor ?? "system"),
      input.createdAt ?? nowIso()
    );
  } catch {
    // ログ失敗で本処理を止めない
  }
}

function parseDetail(raw: unknown): Record<string, unknown> | null {
  const text = String(raw ?? "").trim();
  if (!text || text === "{}") return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/** 総合ログ一覧（新しい順） */
export function listSystemLogsV1(input: {
  siteId?: string | null;
  category?: string | null;
  limit?: number;
} = {}): HomeSystemLogRowV1[] {
  try {
    ensureSystemLogTableV1();
    const db = getDatabase();
    const limit = Math.max(1, Math.min(500, Number(input.limit ?? 50)));
    const siteId = String(input.siteId ?? "").trim();
    const category = String(input.category ?? "").trim();

    let sql = `
      SELECT id, site_id, tenant_id, category, message,
             detail_json, actor, created_at
      FROM home_system_logs_v1
    `;
    const params: unknown[] = [];
    const where: string[] = [];
    if (siteId) {
      where.push("site_id = ?");
      params.push(siteId);
    }
    if (category) {
      where.push("category = ?");
      params.push(category);
    }
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    sql += " ORDER BY id DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => {
      const sid = String(r.site_id ?? "");
      const site = sid ? findHomeSiteV1(sid) : null;
      return {
        id: Number(r.id),
        siteId: sid,
        siteName: site?.displayName ?? (sid || "—"),
        tenantId: String(r.tenant_id ?? ""),
        category: String(r.category) as HomeSystemLogCategoryV1,
        message: String(r.message),
        detail: parseDetail(r.detail_json),
        actor: String(r.actor ?? ""),
        createdAt: String(r.created_at),
      };
    });
  } catch {
    return [];
  }
}

/** 表示用 HH:MM:SS（JST） */
export function formatSystemLogTimeV1(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Tokyo",
    });
  } catch {
    return iso;
  }
}
