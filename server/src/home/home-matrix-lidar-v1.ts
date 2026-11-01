/**
 * 板橋自宅の Matrix LiDAR（SEN0628 8x8）。
 * 既存の防犯ルールや他現場の行は更新しない。
 */

import { getDatabase } from "../db/database.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

export const MATRIX_LIDAR_CELLS_V1 = 64;
export const MATRIX_LIDAR_NEAR_MM_V1 = 1200;
export const MATRIX_LIDAR_MIN_NEAR_CELLS_V1 = 3;
const SHIFT_CELLS_V1 = 0.75;
const KEEP_EVENTS_V1 = 80;

export type MatrixLidarDirectionV1 =
  | "none"
  | "still"
  | "left"
  | "right"
  | "forward"
  | "back";

export interface MatrixLidarCentroidV1 {
  x: number;
  y: number;
}

export interface MatrixLidarReadingV1 {
  present: boolean;
  direction: MatrixLidarDirectionV1;
  centroid: MatrixLidarCentroidV1 | null;
  minMm: number | null;
  nearCount: number;
}

export interface MatrixLidarSnapshotV1 extends MatrixLidarReadingV1 {
  siteId: string;
  deviceId: string | null;
  matrix: number[];
  status: "clear" | "detected";
  directionLabel: string;
  updatedAt: string | null;
}

let tableReady = false;

function ensureLidarTablesV1(): void {
  if (tableReady) return;
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_matrix_lidar_latest_v1 (
      site_id TEXT PRIMARY KEY,
      device_id TEXT,
      matrix_json TEXT NOT NULL,
      present INTEGER NOT NULL,
      direction TEXT NOT NULL,
      centroid_json TEXT,
      min_mm INTEGER,
      near_count INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS home_matrix_lidar_event_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      present INTEGER NOT NULL,
      direction TEXT NOT NULL,
      min_mm INTEGER,
      created_at TEXT NOT NULL
    );
  `);
  tableReady = true;
}

function clampCellV1(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(65535, Math.round(n)));
}

export function directionLabelJaV1(
  direction: MatrixLidarDirectionV1,
  present: boolean
): string {
  if (!present || direction === "none") return "人はいません";
  if (direction === "left") return "左へ移動";
  if (direction === "right") return "右へ移動";
  if (direction === "forward") return "奥へ移動";
  if (direction === "back") return "手前へ移動";
  return "その場にいます";
}

/** 8x8 の距離（mm）から人と移動方向を決める。 */
export function analyzeMatrixLidarV1(
  cells: number[],
  previous?: Pick<MatrixLidarReadingV1, "present" | "centroid"> | null
): MatrixLidarReadingV1 {
  const near: Array<{ x: number; y: number; mm: number }> = [];
  let minMm: number | null = null;
  for (let i = 0; i < MATRIX_LIDAR_CELLS_V1; i += 1) {
    const mm = clampCellV1(cells[i]);
    const x = i % 8;
    const y = Math.floor(i / 8);
    if (mm < 20 || mm > 4000) continue;
    if (minMm == null || mm < minMm) minMm = mm;
    if (mm <= MATRIX_LIDAR_NEAR_MM_V1) near.push({ x, y, mm });
  }
  const present = near.length >= MATRIX_LIDAR_MIN_NEAR_CELLS_V1;
  const centroid = present
    ? {
        x: Math.round((near.reduce((s, p) => s + p.x, 0) / near.length) * 100) / 100,
        y: Math.round((near.reduce((s, p) => s + p.y, 0) / near.length) * 100) / 100,
      }
    : null;
  let direction: MatrixLidarDirectionV1 = present ? "still" : "none";
  if (
    present &&
    centroid &&
    previous?.present &&
    previous.centroid
  ) {
    const dx = centroid.x - previous.centroid.x;
    const dy = centroid.y - previous.centroid.y;
    if (Math.abs(dx) >= SHIFT_CELLS_V1 && Math.abs(dx) >= Math.abs(dy)) {
      direction = dx > 0 ? "right" : "left";
    } else if (Math.abs(dy) >= SHIFT_CELLS_V1) {
      direction = dy > 0 ? "back" : "forward";
    }
  }
  return {
    present,
    direction,
    centroid,
    minMm,
    nearCount: near.length,
  };
}

function emptySnapshotV1(siteId: string): MatrixLidarSnapshotV1 {
  return {
    siteId,
    deviceId: null,
    matrix: Array.from({ length: MATRIX_LIDAR_CELLS_V1 }, () => 0),
    present: false,
    direction: "none",
    centroid: null,
    minMm: null,
    nearCount: 0,
    status: "clear",
    directionLabel: directionLabelJaV1("none", false),
    updatedAt: null,
  };
}

export function getMatrixLidarSnapshotV1(
  siteId = HOME_ITABASHI_LIVE_SITE_ID_V1
): MatrixLidarSnapshotV1 {
  const sid = String(siteId || HOME_ITABASHI_LIVE_SITE_ID_V1).trim();
  if (sid !== HOME_ITABASHI_LIVE_SITE_ID_V1) return emptySnapshotV1(sid);
  try {
    ensureLidarTablesV1();
    const row = getDatabase()
      .prepare(
        `SELECT device_id, matrix_json, present, direction, centroid_json,
                min_mm, near_count, updated_at
         FROM home_matrix_lidar_latest_v1 WHERE site_id = ?`
      )
      .get(sid) as
      | {
          device_id?: string;
          matrix_json?: string;
          present?: number;
          direction?: string;
          centroid_json?: string;
          min_mm?: number;
          near_count?: number;
          updated_at?: string;
        }
      | undefined;
    if (!row?.matrix_json) return emptySnapshotV1(sid);
    const matrix = JSON.parse(row.matrix_json) as number[];
    const centroid = row.centroid_json
      ? (JSON.parse(row.centroid_json) as MatrixLidarCentroidV1)
      : null;
    const present = row.present === 1;
    const direction = (row.direction || "none") as MatrixLidarDirectionV1;
    return {
      siteId: sid,
      deviceId: row.device_id || null,
      matrix: Array.isArray(matrix) ? matrix.slice(0, MATRIX_LIDAR_CELLS_V1) : [],
      present,
      direction,
      centroid,
      minMm: row.min_mm ?? null,
      nearCount: row.near_count ?? 0,
      status: present ? "detected" : "clear",
      directionLabel: directionLabelJaV1(direction, present),
      updatedAt: row.updated_at || null,
    };
  } catch {
    return emptySnapshotV1(sid);
  }
}

export function ingestMatrixLidarFrameV1(input: {
  siteId?: string;
  deviceId?: string;
  matrix: unknown;
}): { ok: true; snapshot: MatrixLidarSnapshotV1; changed: boolean } | { ok: false; error: string } {
  const siteId = String(input.siteId || HOME_ITABASHI_LIVE_SITE_ID_V1).trim();
  if (siteId !== HOME_ITABASHI_LIVE_SITE_ID_V1) {
    return { ok: false, error: "itabashi_only" };
  }
  if (!Array.isArray(input.matrix) || input.matrix.length < MATRIX_LIDAR_CELLS_V1) {
    return { ok: false, error: "matrix_8x8_required" };
  }
  const matrix = input.matrix.slice(0, MATRIX_LIDAR_CELLS_V1).map(clampCellV1);
  ensureLidarTablesV1();
  const before = getMatrixLidarSnapshotV1(siteId);
  const reading = analyzeMatrixLidarV1(matrix, before.updatedAt ? before : null);
  const changed =
    !before.updatedAt ||
    before.present !== reading.present ||
    before.direction !== reading.direction;
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO home_matrix_lidar_latest_v1 (
       site_id, device_id, matrix_json, present, direction,
       centroid_json, min_mm, near_count, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET
       device_id = excluded.device_id,
       matrix_json = excluded.matrix_json,
       present = excluded.present,
       direction = excluded.direction,
       centroid_json = excluded.centroid_json,
       min_mm = excluded.min_mm,
       near_count = excluded.near_count,
       updated_at = excluded.updated_at`
  ).run(
    siteId,
    String(input.deviceId || "").trim() || null,
    JSON.stringify(matrix),
    reading.present ? 1 : 0,
    reading.direction,
    reading.centroid ? JSON.stringify(reading.centroid) : null,
    reading.minMm,
    reading.nearCount,
    now
  );
  if (changed) {
    db.prepare(
      `INSERT INTO home_matrix_lidar_event_v1 (
         site_id, present, direction, min_mm, created_at
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(
      siteId,
      reading.present ? 1 : 0,
      reading.direction,
      reading.minMm,
      now
    );
    db.prepare(
      `DELETE FROM home_matrix_lidar_event_v1
       WHERE site_id = ?
         AND id NOT IN (
           SELECT id FROM home_matrix_lidar_event_v1
           WHERE site_id = ?
           ORDER BY id DESC
           LIMIT ${KEEP_EVENTS_V1}
         )`
    ).run(siteId, siteId);
    recordSystemLogV1({
      siteId,
      category: "sensor_alert",
      message: reading.present
        ? `Matrix LiDAR: ${directionLabelJaV1(reading.direction, true)}`
        : "Matrix LiDAR: クリア",
      detail: {
        direction: reading.direction,
        minMm: reading.minMm,
        nearCount: reading.nearCount,
      },
      actor: input.deviceId || "rp2350",
    });
  }
  return {
    ok: true,
    changed,
    snapshot: {
      ...reading,
      siteId,
      deviceId: String(input.deviceId || "").trim() || null,
      matrix,
      status: reading.present ? "detected" : "clear",
      directionLabel: directionLabelJaV1(reading.direction, reading.present),
      updatedAt: now,
    },
  };
}
