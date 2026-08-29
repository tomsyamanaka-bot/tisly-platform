/** TiSLY Knowledge Module v1 —
 * 現場ナレッジ（PDF/写真/動画添付 · タグ）
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import {
  FAB_FINISH_MODULE_SEED_IDS,
  getFabFinishModuleSeedItemsV1,
} from "./knowledge-fab-finish-seed-v1.js";
import {
  ECO_WATER_PH_MODULE_SEED_IDS,
  getEcoWaterPhModuleSeedItemsV1,
} from "./knowledge-eco-water-ph-seed-v1.js";
import {
  ECO_WATER_FIELD_MODULE_SEED_IDS,
  getEcoWaterFieldModuleSeedItemsV1,
} from "./knowledge-eco-water-field-seed-v1.js";
import {
  SECURITY_FLOOR_MODULE_SEED_IDS,
  getSecurityFloorModuleSeedItemsV1,
} from "./knowledge-security-floor-seed-v1.js";
import {
  OPS_INSIGHT_MODULE_SEED_IDS,
  getOpsInsightModuleSeedItemsV1,
} from "./knowledge-ops-insight-seed-v1.js";
import {
  SECURITY_STREAM_MODULE_SEED_IDS,
  getSecurityStreamModuleSeedItemsV1,
} from "./knowledge-security-stream-seed-v1.js";
import {
  VOICE_CALL_MODULE_SEED_IDS,
  getVoiceCallModuleSeedItemsV1,
} from "./knowledge-voice-call-seed-v1.js";
import {
  FACTORY_STL_MODULE_SEED_IDS,
  getFactoryStlModuleSeedItemsV1,
} from "./knowledge-factory-stl-seed-v1.js";
import {
  REVOPOINT_SCAN_MODULE_SEED_IDS,
  getRevopointScanModuleSeedItemsV1,
} from "./knowledge-revopoint-scan-seed-v1.js";
import {
  HYBRID_3D_STORE_MODULE_SEED_IDS,
  getHybrid3dStoreModuleSeedItemsV1,
} from "./knowledge-hybrid-3d-store-seed-v1.js";
import {
  PARAMETRIC_3D_MODULE_SEED_IDS,
  getParametric3dModuleSeedItemsV1,
} from "./knowledge-parametric-3d-seed-v1.js";
import { bindUnifiedGenresToKnowledgeItemV1 } from "./knowledge-genre-map-v1.js";

export interface KnowledgeModuleItemV1 {
  id: string;
  title: string;
  summary: string;
  genre: string;
  tags: string[];
  /** 添付 URL（互換のため pdf_url）。
   * PDF / 画像 / 動画いずれか */
  pdf_url: string | null;
  /** 複数添付の正規化済み配列 */
  medias?: KnowledgeModuleMediaV1[];
  /** URL 配列を使う旧・外部データとの互換フィールド */
  files?: Array<string | KnowledgeModuleMediaV1>;
  /** 単一添付を使う旧データとの互換フィールド */
  file?: string | KnowledgeModuleMediaV1 | null;
  media?: string | KnowledgeModuleMediaV1 | null;
  createdAt: string;
  /** 本文詳細（任意・既存カードは未設定） */
  body?: string;
  /** 8統一ジャンル（既存 genre は維持） */
  unifiedGenre?: string;
  [key: string]: unknown;
}

export interface KnowledgeModuleMediaV1 {
  url: string;
  fileName?: string;
  kind?: MediaKind | "unknown";
}

export interface KnowledgeModuleItemInputV1 {
  title: string;
  summary: string;
  genre: string;
  tags?: string[];
  /** 本文詳細（任意） */
  body?: string;
  pdf_url?: string | null;
  medias?: unknown[];
  files?: unknown[];
  file?: unknown;
  media?: unknown;
}

const MODULE_ITEMS_FILE = "module-items.json";
/** PDF・画像の上限 */
const MEDIA_MAX_BYTES_DEFAULT = 15 * 1024 * 1024;
/** 動画は現場撮影向けに大きめ */
const MEDIA_MAX_BYTES_VIDEO = 80 * 1024 * 1024;

const ALLOWED_EXTS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
  ".mp4",
  ".mov",
]);

type MediaKind = "pdf" | "image" | "video";

function mediaKindFromExt(ext: string): MediaKind | null {
  if (ext === ".pdf") return "pdf";
  if (
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".png" ||
    ext === ".heic" ||
    ext === ".heif" ||
    ext === ".webp"
  ) {
    return "image";
  }
  if (ext === ".mp4" || ext === ".mov") return "video";
  return null;
}

/**
 * マジックバイトで実体を確認。
 * HEIC/動画は ftyp ベースで緩和判定。
 */
function looksLikeAllowedMedia(
  buffer: Buffer,
  kind: MediaKind,
  ext: string
): boolean {
  if (buffer.length < 12) return false;
  if (kind === "pdf") {
    return buffer.subarray(0, 5).toString("ascii").startsWith("%PDF-");
  }
  if (kind === "image") {
    if (ext === ".jpg" || ext === ".jpeg") {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (ext === ".png") {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }
    if (ext === ".webp") {
      const riff = buffer.subarray(0, 4).toString("ascii");
      const webp = buffer.subarray(8, 12).toString("ascii");
      return riff === "RIFF" && webp === "WEBP";
    }
    if (ext === ".heic" || ext === ".heif") {
      const brand = buffer.subarray(4, 8).toString("ascii");
      const type = buffer.subarray(8, 12).toString("ascii").toLowerCase();
      return (
        brand === "ftyp" &&
        (type.includes("hei") || type.includes("mif") || type.includes("hevc"))
      );
    }
  }
  if (kind === "video") {
    // MP4 / MOV は ISO BMFF（ftyp）が多い
    const brand = buffer.subarray(4, 8).toString("ascii");
    if (brand === "ftyp") return true;
    // 一部 MOV は moov から始まる
    const head = buffer.subarray(4, 8).toString("ascii");
    return head === "moov" || head === "mdat" || head === "free";
  }
  return false;
}

function getModuleDataPath(): string {
  const customDir = String(process.env.KNOWLEDGE_MODULE_DATA_DIR ?? "").trim();
  return customDir
    ? path.join(path.resolve(customDir), MODULE_ITEMS_FILE)
    : path.join(process.cwd(), "data", "knowledge", MODULE_ITEMS_FILE);
}

export function getKnowledgeModulePdfUploadDir(): string {
  const customDir = String(process.env.KNOWLEDGE_MODULE_UPLOAD_DIR ?? "").trim();
  return customDir
    ? path.resolve(customDir)
    : path.join(process.cwd(), "uploads", "knowledge", "module");
}

function getKnowledgeModuleUploadUrlPrefix(): string {
  const customPrefix = String(
    process.env.KNOWLEDGE_MODULE_UPLOAD_URL_PREFIX ?? ""
  ).trim();
  return (customPrefix || "/uploads/knowledge/module").replace(/\/+$/, "");
}

function tagsContainAll(
  existing: string[],
  required: string[]
): boolean {
  return required.every((tag) => existing.includes(tag));
}

function mergeKeepExtraTags(
  existing: string[],
  seedTags: string[]
): string[] {
  const next = [...existing];
  for (const tag of seedTags) {
    if (!next.includes(tag)) next.push(tag);
  }
  return next;
}

function ensureDirs(): void {
  fs.mkdirSync(path.dirname(getModuleDataPath()), { recursive: true });
  fs.mkdirSync(getKnowledgeModulePdfUploadDir(), { recursive: true });
}

/**
 * 仕上げノウハウ 4 件を upsert。
 * 既存ユーザー登録は保持し、シード ID のみ更新する。
 */
function mergeFabFinishSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(FAB_FINISH_MODULE_SEED_IDS);
  const seeds = getFabFinishModuleSeedItemsV1();
  const byId = new Map(items.map((item) => [item.id, item]));
  let changed = false;

  for (const seed of seeds) {
    const existing = byId.get(seed.id);
    if (!existing) {
      byId.set(seed.id, { ...seed });
      changed = true;
      continue;
    }
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      byId.set(seed.id, {
        ...seed,
        createdAt: existing.createdAt,
        pdf_url: existing.pdf_url ?? null,
        medias: existing.medias,
        files: existing.files,
        file: existing.file,
        media: existing.media,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
        unifiedGenre: existing.unifiedGenre,
      });
      changed = true;
    }
  }

  const nonSeed = items.filter((item) => !seedIds.has(item.id));
  const seedItems = seeds.map((seed) => byId.get(seed.id)!);
  return { items: [...seedItems, ...nonSeed], changed };
}

/**
 * Eco-Water pH 保守 2 件を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeEcoWaterPhSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(ECO_WATER_PH_MODULE_SEED_IDS);
  const seeds = getEcoWaterPhModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * Eco-Water 現場ナレッジ 3 件を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeEcoWaterFieldSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(ECO_WATER_FIELD_MODULE_SEED_IDS);
  const seeds = getEcoWaterFieldModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * ホームセキュリティ施工ナレッジ 4 件を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeSecurityFloorSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(SECURITY_FLOOR_MODULE_SEED_IDS);
  const seeds = getSecurityFloorModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * TiSLY 運用知見ナレッジ 5 件を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeOpsInsightSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(OPS_INSIGHT_MODULE_SEED_IDS);
  const seeds = getOpsInsightModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * 防犯・映像・施工ナレッジ 5 件を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeSecurityStreamSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(SECURITY_STREAM_MODULE_SEED_IDS);
  const seeds = getSecurityStreamModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * 現場DX・音声AIナレッジを末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeVoiceCallSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(VOICE_CALL_MODULE_SEED_IDS);
  const seeds = getVoiceCallModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * 製造DX・方眼紙→STL ナレッジを末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeFactoryStlSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(FACTORY_STL_MODULE_SEED_IDS);
  const seeds = getFactoryStlModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * 製造DX・Revopoint スキャンを末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeRevopointScanSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(REVOPOINT_SCAN_MODULE_SEED_IDS);
  const seeds = getRevopointScanModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * 製造DX・3Dハイブリッド保存を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeHybrid3dStoreSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(HYBRID_3D_STORE_MODULE_SEED_IDS);
  const seeds = getHybrid3dStoreModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

/**
 * 製造DX・パラメトリック寸法 2 件を末尾追記。
 * 既存行は削除せず、未登録 ID のみ append する。
 */
function mergeParametric3dSeed(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  const seedIds = new Set<string>(PARAMETRIC_3D_MODULE_SEED_IDS);
  const seeds = getParametric3dModuleSeedItemsV1();
  const next = [...items];
  let changed = false;

  for (const seed of seeds) {
    if (!seedIds.has(seed.id)) continue;
    const index = next.findIndex((item) => item.id === seed.id);
    if (index < 0) {
      next.push({ ...seed });
      changed = true;
      continue;
    }
    const existing = next[index];
    const same =
      existing.title === seed.title &&
      existing.summary === seed.summary &&
      existing.body === seed.body &&
      existing.genre === seed.genre &&
      tagsContainAll(existing.tags, seed.tags);
    if (!same) {
      next[index] = {
        ...existing,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        genre: seed.genre,
        tags: mergeKeepExtraTags(existing.tags, seed.tags),
      };
      changed = true;
    }
  }

  return { items: next, changed };
}

function mergeUnifiedGenreBindings(
  items: KnowledgeModuleItemV1[]
): { items: KnowledgeModuleItemV1[]; changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    const bound = bindUnifiedGenresToKnowledgeItemV1(item);
    if (bound.changed) changed = true;
    return bound.item;
  });
  return { items: next, changed };
}

function readAll(): KnowledgeModuleItemV1[] {
  ensureDirs();
  const filePath = getModuleDataPath();
  let items: KnowledgeModuleItemV1[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        items = parsed.map(normalizeItem);
      } else {
        throw new Error("Knowledge module data must be an array");
      }
    } catch (error) {
      throw new Error(
        `Knowledge module data could not be read; existing data was not overwritten: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const mergedFab = mergeFabFinishSeed(items);
  const mergedPh = mergeEcoWaterPhSeed(mergedFab.items);
  const mergedField = mergeEcoWaterFieldSeed(mergedPh.items);
  const mergedSec = mergeSecurityFloorSeed(mergedField.items);
  const mergedOps = mergeOpsInsightSeed(mergedSec.items);
  const mergedStream = mergeSecurityStreamSeed(mergedOps.items);
  const mergedVoice = mergeVoiceCallSeed(mergedStream.items);
  const mergedFactory = mergeFactoryStlSeed(mergedVoice.items);
  const mergedRevopoint = mergeRevopointScanSeed(mergedFactory.items);
  const mergedHybrid = mergeHybrid3dStoreSeed(mergedRevopoint.items);
  const mergedParametric = mergeParametric3dSeed(mergedHybrid.items);
  const mergedGenre = mergeUnifiedGenreBindings(mergedParametric.items);
  if (
    mergedFab.changed ||
    mergedPh.changed ||
    mergedField.changed ||
    mergedSec.changed ||
    mergedOps.changed ||
    mergedStream.changed ||
    mergedVoice.changed ||
    mergedFactory.changed ||
    mergedRevopoint.changed ||
    mergedHybrid.changed ||
    mergedParametric.changed ||
    mergedGenre.changed
  ) {
    writeAll(mergedGenre.items);
  }
  return mergedGenre.items;
}

function writeAll(items: KnowledgeModuleItemV1[]): void {
  ensureDirs();
  const filePath = getModuleDataPath();
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(items, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

export function parseKnowledgeModuleTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string") {
      return parseKnowledgeModuleTagsFromText(raw);
    }
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = String(t ?? "").trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function parseKnowledgeModuleTagsFromText(text: string): string[] {
  return parseKnowledgeModuleTags(
    String(text ?? "")
      .split(/[,、\s#]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function normalizeMediaEntry(raw: unknown): KnowledgeModuleMediaV1 | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;
    return {
      url,
      fileName: path.basename(url.split("?")[0].split("#")[0]),
      kind: mediaKindFromExt(path.extname(url.split("?")[0]).toLowerCase()) ?? "unknown",
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const url = String(
    source.url ?? source.pdf_url ?? source.path ?? source.src ?? ""
  ).trim();
  if (!url) return null;
  const fileName = String(source.fileName ?? source.name ?? "").trim();
  const detected =
    mediaKindFromExt(path.extname(fileName || url.split("?")[0]).toLowerCase()) ??
    "unknown";
  return {
    ...source,
    url,
    ...(fileName ? { fileName } : {}),
    kind:
      source.kind === "pdf" || source.kind === "image" || source.kind === "video"
        ? source.kind
        : detected,
  } as KnowledgeModuleMediaV1;
}

/** 配列を優先し、単一添付は不足分として末尾に統合する */
export function normalizeKnowledgeModuleMediasV1(raw: unknown): KnowledgeModuleMediaV1[] {
  const r =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const candidates: unknown[] = [];
  if (Array.isArray(r.medias)) candidates.push(...r.medias);
  if (Array.isArray(r.files)) candidates.push(...r.files);
  if (r.media != null) candidates.push(r.media);
  if (r.file != null) candidates.push(r.file);
  if (r.pdf_url != null) candidates.push(r.pdf_url);

  const byUrl = new Map<string, KnowledgeModuleMediaV1>();
  for (const candidate of candidates) {
    const media = normalizeMediaEntry(candidate);
    if (!media || byUrl.has(media.url)) continue;
    byUrl.set(media.url, media);
  }
  return [...byUrl.values()];
}

function normalizeItem(raw: unknown): KnowledgeModuleItemV1 {
  const r =
    raw && typeof raw === "object"
      ? (raw as Partial<KnowledgeModuleItemV1>)
      : {};
  const title = String(r.title ?? "").trim();
  const summary = String(r.summary ?? "").trim();
  const genre = String(r.genre ?? "プラント").trim() || "プラント";
  const medias = normalizeKnowledgeModuleMediasV1(r);
  const pdfUrl = medias[0]?.url ?? null;
  const body = String(r.body ?? "").trim();
  return {
    ...r,
    id: String(r.id ?? `kn-${uuid()}`),
    title,
    summary,
    genre,
    tags: parseKnowledgeModuleTags(r.tags),
    pdf_url: pdfUrl,
    medias,
    files: medias.map((entry) => entry.url),
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    ...(body ? { body } : {}),
  };
}

export function listKnowledgeModuleItemsV1(): KnowledgeModuleItemV1[] {
  return readAll().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function createKnowledgeModuleItemV1(
  input: KnowledgeModuleItemInputV1
): KnowledgeModuleItemV1 {
  const title = String(input.title ?? "").trim();
  const summary = String(input.summary ?? "").trim();
  const genre = String(input.genre ?? "").trim();
  const medias = normalizeKnowledgeModuleMediasV1(input);
  const pdfUrl = medias[0]?.url ?? null;

  if (!title) throw new Error("title is required");
  if (!summary && !pdfUrl) {
    throw new Error("summary is required when no media is attached");
  }
  if (!genre) throw new Error("genre is required");

  const body = String(input.body ?? "").trim();
  const item: KnowledgeModuleItemV1 = {
    id: `kn-${Date.now()}-${uuid().slice(0, 8)}`,
    title,
    summary,
    genre,
    tags: parseKnowledgeModuleTags(input.tags),
    pdf_url: pdfUrl,
    medias,
    files: medias.map((entry) => entry.url),
    createdAt: new Date().toISOString(),
    ...(body ? { body } : {}),
  };

  const items = readAll();
  items.unshift(item);
  writeAll(items);
  return item;
}

export function updateKnowledgeModuleItemV1(
  id: string,
  input: KnowledgeModuleItemInputV1
): KnowledgeModuleItemV1 {
  const itemId = String(id ?? "").trim();
  const items = readAll();
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error("Knowledge item not found");

  const current = items[index];
  const hasAttachmentUpdate =
    Object.prototype.hasOwnProperty.call(input, "medias") ||
    Object.prototype.hasOwnProperty.call(input, "files") ||
    Object.prototype.hasOwnProperty.call(input, "media") ||
    Object.prototype.hasOwnProperty.call(input, "file") ||
    Object.prototype.hasOwnProperty.call(input, "pdf_url");
  const attachmentUpdate = hasAttachmentUpdate
    ? {
        medias: input.medias ?? [],
        files: input.files ?? [],
        media: input.media ?? null,
        file: input.file ?? null,
        pdf_url: input.pdf_url ?? null,
      }
    : {};
  const next = normalizeItem({
    ...current,
    ...input,
    ...attachmentUpdate,
    id: current.id,
    createdAt: current.createdAt,
  });
  if (!next.title) throw new Error("title is required");
  if (!next.summary && next.medias?.length === 0) {
    throw new Error("summary is required when no media is attached");
  }
  if (!next.genre) throw new Error("genre is required");

  items[index] = next;
  writeAll(items);
  return next;
}

/**
 * PDF / 画像 / 動画を保存。
 * 戻り値の pdf_url は互換フィールド名。
 */
export function saveKnowledgeModulePdfV1(input: {
  fileName?: string;
  fileBase64: string;
}): { pdf_url: string; fileName: string } {
  const base64 = String(input.fileBase64 ?? "").trim();
  if (!base64) throw new Error("fileBase64 is required");

  const originalName =
    String(input.fileName ?? "attachment.pdf").trim() || "attachment.pdf";
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error(
      "Unsupported file type (allowed: pdf, jpg, jpeg, png, heic, webp, mp4, mov)"
    );
  }
  const kind = mediaKindFromExt(ext);
  if (!kind) {
    throw new Error("Unsupported file type");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw new Error("Invalid file data");

  const maxBytes =
    kind === "video" ? MEDIA_MAX_BYTES_VIDEO : MEDIA_MAX_BYTES_DEFAULT;
  if (buffer.length > maxBytes) {
    throw new Error(
      `File exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`
    );
  }

  if (!looksLikeAllowedMedia(buffer, kind, ext)) {
    throw new Error(`File content does not match ${ext} type`);
  }

  ensureDirs();
  const safeName = `${uuid()}${ext}`;
  const fullPath = path.join(getKnowledgeModulePdfUploadDir(), safeName);
  fs.writeFileSync(fullPath, buffer);

  return {
    pdf_url: `${getKnowledgeModuleUploadUrlPrefix()}/${safeName}`,
    fileName: safeName,
  };
}

export function collectKnowledgeModuleTagsV1(
  items: KnowledgeModuleItemV1[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    for (const tag of item.tags) {
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "ja"));
}
