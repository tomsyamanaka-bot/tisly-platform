/**
 * TiSLY Knowledge パス v1
 * QNAP: \\192.168.1.10\TiSLY\AI\{folder}/
 * ローカル: server/data/knowledge/{folder}/
 */
import fs from "fs";
import path from "path";
import type { KnowledgeFolderName } from "./knowledge-types.js";
import { KNOWLEDGE_FOLDERS, THREEDPRINT_SUBFOLDERS_V1 } from "./knowledge-types.js";

export { KNOWLEDGE_FOLDERS };

/** QNAP MotherShip 上の AI/Knowledge 相対パス */
export function buildMothershipKnowledgeRelativePath(
  folder: KnowledgeFolderName,
  subPath = ""
): string {
  const sub = subPath.replace(/^\/+|\/+$/g, "");
  const base = `AI/${folder}`;
  return sub ? `${base}/${sub}` : base;
}

export function buildKnowledgeCardFileName(cardId: string): string {
  const safe = String(cardId ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${safe}.json`;
}

export function getKnowledgeDataRoot(): string {
  return path.join(process.cwd(), "data", "knowledge");
}

export function getKnowledgeFolderPath(folder: KnowledgeFolderName): string {
  return path.join(getKnowledgeDataRoot(), folder);
}

export function getKnowledgeCardsDir(): string {
  return getKnowledgeFolderPath("KnowledgeCards");
}

export function getKnowledgeSearchIndexPath(): string {
  return path.join(getKnowledgeFolderPath("SearchIndex"), "index.json");
}

export function getKnowledgeAttachmentsDir(): string {
  return path.join(getKnowledgeDataRoot(), "attachments");
}

export function getWorkCategoriesMasterPath(): string {
  return path.join(process.cwd(), "..", "master", "work-categories.json");
}

export function getKnowledgeQnapSyncQueuePath(): string {
  return path.join(getKnowledgeDataRoot(), "qnap-sync-queue.json");
}

/** ローカル Knowledge フォルダ構造を初期化 */
export function ensureKnowledgeFolderStructure(): void {
  const root = getKnowledgeDataRoot();
  fs.mkdirSync(root, { recursive: true });
  for (const folder of KNOWLEDGE_FOLDERS) {
    fs.mkdirSync(getKnowledgeFolderPath(folder), { recursive: true });
  }
  for (const sub of THREEDPRINT_SUBFOLDERS_V1) {
    fs.mkdirSync(path.join(getKnowledgeFolderPath("3DPrint"), sub), { recursive: true });
  }
  fs.mkdirSync(getKnowledgeAttachmentsDir(), { recursive: true });
  fs.mkdirSync(path.join(root, "Candidates"), { recursive: true });
  fs.mkdirSync(path.join(root, "Assets"), { recursive: true });
  fs.mkdirSync(path.join(root, "Factory"), { recursive: true });
}
