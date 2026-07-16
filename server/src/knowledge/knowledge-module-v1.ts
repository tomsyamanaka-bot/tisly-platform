/** TiSLY Knowledge Module v1 — 現場ナレッジ（PDF添付 · タグ付け） */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import {
  FAB_FINISH_MODULE_SEED_IDS,
  getFabFinishModuleSeedItemsV1,
} from "./knowledge-fab-finish-seed-v1.js";

export interface KnowledgeModuleItemV1 {
  id: string;
  title: string;
  summary: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export interface KnowledgeModuleItemInputV1 {
  title: string;
  summary: string;
  genre: string;
  tags?: string[];
  pdf_url?: string | null;
}

const MODULE_ITEMS_FILE = "module-items.json";
const PDF_MAX_BYTES = 15 * 1024 * 1024;

function getModuleDataPath(): string {
  return path.join(process.cwd(), "data", "knowledge", MODULE_ITEMS_FILE);
}

export function getKnowledgeModulePdfUploadDir(): string {
  return path.join(process.cwd(), "uploads", "knowledge", "module");
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
      JSON.stringify(existing.tags) === JSON.stringify(seed.tags);
    if (!same) {
      byId.set(seed.id, {
        ...seed,
        createdAt: existing.createdAt,
        pdf_url: existing.pdf_url ?? null,
      });
      changed = true;
    }
  }

  const nonSeed = items.filter((item) => !seedIds.has(item.id));
  const seedItems = seeds.map((seed) => byId.get(seed.id)!);
  return { items: [...seedItems, ...nonSeed], changed };
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
      }
    } catch {
      items = [];
    }
  }

  const merged = mergeFabFinishSeed(items);
  if (merged.changed) {
    writeAll(merged.items);
  }
  return merged.items;
}

function writeAll(items: KnowledgeModuleItemV1[]): void {
  ensureDirs();
  fs.writeFileSync(getModuleDataPath(), JSON.stringify(items, null, 2), "utf8");
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

function normalizeItem(raw: unknown): KnowledgeModuleItemV1 {
  const r = raw as Partial<KnowledgeModuleItemV1>;
  const title = String(r.title ?? "").trim();
  const summary = String(r.summary ?? "").trim();
  const genre = String(r.genre ?? "プラント").trim() || "プラント";
  const pdfUrl =
    r.pdf_url === null || r.pdf_url === undefined
      ? null
      : String(r.pdf_url).trim() || null;
  return {
    id: String(r.id ?? `kn-${uuid()}`),
    title,
    summary,
    genre,
    tags: parseKnowledgeModuleTags(r.tags),
    pdf_url: pdfUrl,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
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
  const pdfUrl =
    input.pdf_url === null || input.pdf_url === undefined
      ? null
      : String(input.pdf_url).trim() || null;

  if (!title) throw new Error("title is required");
  if (!summary && !pdfUrl) throw new Error("summary is required when no PDF is attached");
  if (!genre) throw new Error("genre is required");

  const item: KnowledgeModuleItemV1 = {
    id: `kn-${Date.now()}-${uuid().slice(0, 8)}`,
    title,
    summary,
    genre,
    tags: parseKnowledgeModuleTags(input.tags),
    pdf_url: pdfUrl,
    createdAt: new Date().toISOString(),
  };

  const items = readAll();
  items.unshift(item);
  writeAll(items);
  return item;
}

export function saveKnowledgeModulePdfV1(input: {
  fileName?: string;
  fileBase64: string;
}): { pdf_url: string; fileName: string } {
  const base64 = String(input.fileBase64 ?? "").trim();
  if (!base64) throw new Error("fileBase64 is required");

  const originalName = String(input.fileName ?? "attachment.pdf").trim() || "attachment.pdf";
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== ".pdf") {
    throw new Error("Only PDF files are allowed");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw new Error("Invalid PDF data");
  if (buffer.length > PDF_MAX_BYTES) {
    throw new Error(`PDF exceeds ${PDF_MAX_BYTES / (1024 * 1024)}MB limit`);
  }

  const header = buffer.subarray(0, 5).toString("ascii");
  if (!header.startsWith("%PDF-")) {
    throw new Error("File is not a valid PDF");
  }

  ensureDirs();
  const safeName = `${uuid()}${ext}`;
  const fullPath = path.join(getKnowledgeModulePdfUploadDir(), safeName);
  fs.writeFileSync(fullPath, buffer);

  return {
    pdf_url: `/uploads/knowledge/module/${safeName}`,
    fileName: safeName,
  };
}

export function collectKnowledgeModuleTagsV1(items: KnowledgeModuleItemV1[]): string[] {
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
