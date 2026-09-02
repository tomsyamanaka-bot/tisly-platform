/**
 * 物件別 現場施工写真・結線図ライブラリ v1
 *
 * survey/completion とは別管理。
 * QNAP 同期メタデータを保持する。
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { findHomeSiteV1 } from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

export type HomeFieldPhotoCategoryV1 =
  | "wiring"
  | "panel"
  | "exterior"
  | "memo";

export interface HomeFieldPhotoV1 {
  id: string;
  siteId: string;
  displayName: string;
  category: HomeFieldPhotoCategoryV1;
  categoryLabel: string;
  title: string;
  fileName: string;
  url: string;
  qnapSyncStatus: "pending" | "synced" | "failed";
  qnapPath: string | null;
  qnapSyncedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<HomeFieldPhotoCategoryV1, string> = {
  wiring: "盤内配線",
  panel: "端子台・結線図",
  exterior: "外構・設置",
  memo: "現場メモ",
};

const MAX_PHOTOS_PER_SITE = 60;
const DATA_DIR = path.join(process.cwd(), "data", "home-field-photos-v1");
const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "home-field");

function ensureDirs(siteId: string): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(UPLOAD_ROOT, siteId), { recursive: true });
}

function indexPath(siteId: string): string {
  return path.join(DATA_DIR, `${siteId}.json`);
}

function readIndex(siteId: string): HomeFieldPhotoV1[] {
  ensureDirs(siteId);
  const fp = indexPath(siteId);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as HomeFieldPhotoV1[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeIndex(siteId: string, rows: HomeFieldPhotoV1[]): void {
  ensureDirs(siteId);
  fs.writeFileSync(indexPath(siteId), JSON.stringify(rows, null, 2), "utf8");
}

function rowToPhoto(site: { id: string; displayName: string }, row: HomeFieldPhotoV1): HomeFieldPhotoV1 {
  return {
    ...row,
    siteId: site.id,
    displayName: site.displayName.replace(/\s*\([^)]+\)/g, "").trim(),
    categoryLabel: CATEGORY_LABELS[row.category] || row.category,
    url: `/uploads/home-field/${site.id}/${row.fileName}`,
  };
}

/** 物件の施工写真一覧 */
export function listHomeFieldPhotosV1(siteId: string): HomeFieldPhotoV1[] {
  const site = findHomeSiteV1(siteId);
  return readIndex(site.id).map((r) => rowToPhoto(site, r));
}

/** 施工写真を追加 */
export function addHomeFieldPhotoV1(input: {
  siteId: string;
  category?: HomeFieldPhotoCategoryV1;
  title?: string;
  imageBase64: string;
  fileName?: string;
  actor?: string;
}): HomeFieldPhotoV1 {
  const site = findHomeSiteV1(input.siteId);
  const rows = readIndex(site.id);
  if (rows.length >= MAX_PHOTOS_PER_SITE) {
    throw new Error(`写真は最大 ${MAX_PHOTOS_PER_SITE} 枚までです`);
  }
  const category = input.category ?? "wiring";
  const id = uuid();
  const ext = path.extname(input.fileName ?? ".jpg").toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext)
    ? ext
    : ".jpg";
  const fileName = `${id}${safeExt}`;
  ensureDirs(site.id);
  fs.writeFileSync(
    path.join(UPLOAD_ROOT, site.id, fileName),
    Buffer.from(input.imageBase64, "base64")
  );
  const title =
    String(input.title || "").trim() ||
    `${CATEGORY_LABELS[category]} ${rows.length + 1}`;
  const qnapPath = `/TiSLY/home-field/${site.id}/${fileName}`;
  const photo: HomeFieldPhotoV1 = {
    id,
    siteId: site.id,
    displayName: site.displayName.replace(/\s*\([^)]+\)/g, "").trim(),
    category,
    categoryLabel: CATEGORY_LABELS[category],
    title,
    fileName,
    url: `/uploads/home-field/${site.id}/${fileName}`,
    qnapSyncStatus: "pending",
    qnapPath,
    qnapSyncedAt: null,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(photo);
  writeIndex(site.id, rows);
  recordSystemLogV1({
    siteId: site.id,
    category: "manual_control",
    message: `現場写真を登録: ${title}`,
    detail: { photoId: id, category },
    actor: input.actor ?? "operator-pro",
  });
  return photo;
}

/** 写真を削除 */
export function deleteHomeFieldPhotoV1(
  siteId: string,
  photoId: string
): boolean {
  const site = findHomeSiteV1(siteId);
  const rows = readIndex(site.id);
  const idx = rows.findIndex((r) => r.id === photoId);
  if (idx < 0) return false;
  const [removed] = rows.splice(idx, 1);
  writeIndex(site.id, rows);
  try {
    fs.unlinkSync(path.join(UPLOAD_ROOT, site.id, removed.fileName));
  } catch {
    /* ignore */
  }
  return true;
}

/** QNAP 同期待ちを一括マーク（Worker 連携用メタ） */
export function queueHomeFieldPhotosQnapSyncV1(siteId: string): {
  ok: boolean;
  queued: number;
  photos: HomeFieldPhotoV1[];
} {
  const site = findHomeSiteV1(siteId);
  const rows = readIndex(site.id);
  let queued = 0;
  for (const row of rows) {
    if (row.qnapSyncStatus === "pending" || row.qnapSyncStatus === "failed") {
      row.qnapSyncStatus = "pending";
      queued += 1;
    }
  }
  writeIndex(site.id, rows);
  return {
    ok: true,
    queued,
    photos: rows.map((r) => rowToPhoto(site, r)),
  };
}

/** 単体 QNAP 同期完了マーク（モック / 手動トリガー） */
export function markHomeFieldPhotoQnapSyncedV1(
  siteId: string,
  photoId: string
): HomeFieldPhotoV1 | null {
  const site = findHomeSiteV1(siteId);
  const rows = readIndex(site.id);
  const row = rows.find((r) => r.id === photoId);
  if (!row) return null;
  row.qnapSyncStatus = "synced";
  row.qnapSyncedAt = new Date().toISOString();
  writeIndex(site.id, rows);
  return rowToPhoto(site, row);
}

/** POST /api/storage/qnap-sync 互換 — pending を synced に模擬反映 */
export async function syncHomeFieldPhotosToQnapV1(siteId: string): Promise<{
  ok: boolean;
  synced: number;
  message: string;
  photos: HomeFieldPhotoV1[];
}> {
  const site = findHomeSiteV1(siteId);
  const rows = readIndex(site.id);
  let synced = 0;
  for (const row of rows) {
    if (row.qnapSyncStatus !== "synced") {
      row.qnapSyncStatus = "synced";
      row.qnapSyncedAt = new Date().toISOString();
      synced += 1;
    }
  }
  writeIndex(site.id, rows);
  recordSystemLogV1({
    siteId: site.id,
    category: "manual_control",
    message: `現場写真 QNAP 同期待ち ${synced} 件を処理`,
    detail: { synced },
    actor: "qnap-sync",
  });
  return {
    ok: true,
    synced,
    message:
      synced > 0
        ? `${synced} 件の現場写真を QNAP 同期キューへ反映しました`
        : "同期対象の新規写真はありません",
    photos: rows.map((r) => rowToPhoto(site, r)),
  };
}

export { CATEGORY_LABELS as HOME_FIELD_PHOTO_CATEGORY_LABELS_V1 };
