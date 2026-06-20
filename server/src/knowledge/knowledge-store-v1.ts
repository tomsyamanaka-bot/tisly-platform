/** TiSLY Knowledge Core v1 — ローカル JSON ストア */

import fs from "fs";
import path from "path";
import type {
  KnowledgeCardInputV1,
  KnowledgeCardV1,
  KnowledgeSearchIndexV1,
  WorkCategoriesMasterV1,
} from "./knowledge-types.js";
import {
  buildKnowledgeCardFileName,
  ensureKnowledgeFolderStructure,
  getKnowledgeCardsDir,
  getKnowledgeSearchIndexPath,
  getWorkCategoriesMasterPath,
} from "./knowledge-paths-v1.js";
import { enqueueKnowledgeQnapSyncV1 } from "./knowledge-qnap-sync-store-v1.js";

const ID_RE = /^[A-Z0-9][A-Z0-9_-]{2,63}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

function normalizeOptionalCardFields(input: KnowledgeCardInputV1): Partial<KnowledgeCardV1> {
  const out: Partial<KnowledgeCardV1> = {};
  if (input.sourceType) out.sourceType = input.sourceType;
  const related = normalizeStringArray(input.relatedProjectIds);
  if (related.length) out.relatedProjectIds = related;
  if (input.projectNo?.trim()) out.projectNo = input.projectNo.trim();
  if (input.customerName?.trim()) out.customerName = input.customerName.trim();
  if (input.photoMeta?.photoId) out.photoMeta = input.photoMeta;
  if (input.pdfMeta?.localPath) out.pdfMeta = input.pdfMeta;
  if (input.qnapSyncStatus) out.qnapSyncStatus = input.qnapSyncStatus;
  return out;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t ?? "").trim()).filter(Boolean))];
}

function normalizeFiles(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.map((f) => String(f ?? "").trim().replace(/\\/g, "/")).filter(Boolean))];
}

export function loadWorkCategoriesMaster(): WorkCategoriesMasterV1 {
  const fromRepo = readJsonFile<WorkCategoriesMasterV1>(getWorkCategoriesMasterPath());
  if (fromRepo?.categories?.length) return fromRepo;
  return {
    version: 1,
    updatedAt: todayIsoDate(),
    categories: ["その他"],
  };
}

export function validateKnowledgeCategory(category: string): boolean {
  const master = loadWorkCategoriesMaster();
  return master.categories.includes(category);
}

export function normalizeKnowledgeCardInput(input: KnowledgeCardInputV1): KnowledgeCardV1 {
  const id = String(input.id ?? "")
    .trim()
    .toUpperCase();
  const title = String(input.title ?? "").trim();
  const category = String(input.category ?? "").trim();
  const summary = String(input.summary ?? "").trim();
  const updatedAt = String(input.updatedAt ?? todayIsoDate()).trim();

  if (!id || !ID_RE.test(id)) {
    throw new Error("id is required (alphanumeric, hyphen, underscore; 3–64 chars)");
  }
  if (!title) throw new Error("title is required");
  if (!category) throw new Error("category is required");
  if (!validateKnowledgeCategory(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!summary) throw new Error("summary is required");
  if (!DATE_RE.test(updatedAt)) {
    throw new Error("updatedAt must be YYYY-MM-DD");
  }

  return {
    id,
    title,
    category,
    tags: normalizeTags(input.tags),
    summary,
    files: normalizeFiles(input.files),
    updatedAt,
    ...normalizeOptionalCardFields(input),
  };
}

export function listKnowledgeCardsV1(): KnowledgeCardV1[] {
  ensureKnowledgeFolderStructure();
  const dir = getKnowledgeCardsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const cards: KnowledgeCardV1[] = [];
  for (const file of files) {
    const card = readJsonFile<KnowledgeCardV1>(path.join(dir, file));
    if (card?.id) cards.push(card);
  }
  return cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function getKnowledgeCardV1(id: string): KnowledgeCardV1 | null {
  ensureKnowledgeFolderStructure();
  const filePath = path.join(getKnowledgeCardsDir(), buildKnowledgeCardFileName(id));
  return readJsonFile<KnowledgeCardV1>(filePath);
}

export function saveKnowledgeCardV1(input: KnowledgeCardInputV1, opts?: { skipQnapQueue?: boolean }): KnowledgeCardV1 {
  ensureKnowledgeFolderStructure();
  const card = normalizeKnowledgeCardInput({
    ...input,
    qnapSyncStatus: input.qnapSyncStatus ?? "pending",
  });
  const filePath = path.join(getKnowledgeCardsDir(), buildKnowledgeCardFileName(card.id));
  writeJsonFile(filePath, card);
  rebuildKnowledgeSearchIndexV1();
  if (!opts?.skipQnapQueue) {
    enqueueKnowledgeQnapSyncV1({
      localPath: filePath,
      relativePath: `AI/KnowledgeCards/${buildKnowledgeCardFileName(card.id)}`,
      cardId: card.id,
    });
  }
  return card;
}

export function loadKnowledgeSearchIndexV1(): KnowledgeSearchIndexV1 {
  ensureKnowledgeFolderStructure();
  const existing = readJsonFile<KnowledgeSearchIndexV1>(getKnowledgeSearchIndexPath());
  if (existing?.entries) return existing;
  return rebuildKnowledgeSearchIndexV1();
}

export function rebuildKnowledgeSearchIndexV1(): KnowledgeSearchIndexV1 {
  const cards = listKnowledgeCardsV1();
  const index: KnowledgeSearchIndexV1 = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: cards.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      tags: c.tags,
      summary: c.summary,
      updatedAt: c.updatedAt,
      projectNo: c.projectNo,
      customerName: c.customerName,
      sourceType: c.sourceType,
    })),
  };
  writeJsonFile(getKnowledgeSearchIndexPath(), index);
  return index;
}

export function getKnowledgeStructureV1() {
  ensureKnowledgeFolderStructure();
  return {
    qnapRoot: "\\\\192.168.1.10\\TiSLY\\AI",
    localRoot: getKnowledgeCardsDir().replace(/KnowledgeCards$/, "").replace(/\\/g, "/"),
    folders: [
      "Standards",
      "Procedures",
      "Troubles",
      "Templates",
      "Ladder",
      "Materials",
      "Tools",
      "Notes",
      "PLC",
      "RP",
      "3DPrint",
      "KnowledgeCards",
      "SearchIndex",
    ],
    cardCount: listKnowledgeCardsV1().length,
    indexUpdatedAt: loadKnowledgeSearchIndexV1().updatedAt,
  };
}
