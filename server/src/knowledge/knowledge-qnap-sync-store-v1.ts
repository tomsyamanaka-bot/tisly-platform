/** TiSLY Knowledge QNAP 同期キュー v1 — ローカル JSON + 失敗ログ */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getKnowledgeQnapSyncQueuePath } from "./knowledge-paths-v1.js";

export type KnowledgeQnapQueueStatusV1 = "pending" | "uploading" | "success" | "failed";

export type KnowledgeQnapSyncKindV1 =
  | "KnowledgeCards"
  | "Candidates"
  | "Assets"
  | "SearchIndex";

export interface KnowledgeQnapQueueItemV1 {
  id: string;
  syncKind: KnowledgeQnapSyncKindV1;
  /** @deprecated cardId — use resourceId */
  cardId: string;
  resourceId: string;
  localPath: string;
  relativePath: string;
  status: KnowledgeQnapQueueStatusV1;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeQnapSyncQueueV1 {
  version: 1;
  updatedAt: string;
  items: KnowledgeQnapQueueItemV1[];
}

export interface KnowledgeQnapSyncFailureLogEntryV1 {
  id: string;
  syncKind: KnowledgeQnapSyncKindV1;
  resourceId: string;
  relativePath: string;
  error: string;
  attempts: number;
  at: string;
}

const MAX_ATTEMPTS = 3;
const MAX_FAILURE_LOG = 100;

function getFailureLogPath(): string {
  return path.join(path.dirname(getKnowledgeQnapSyncQueuePath()), "qnap-sync-failures.json");
}

function normalizeItem(raw: Partial<KnowledgeQnapQueueItemV1>): KnowledgeQnapQueueItemV1 {
  const resourceId = raw.resourceId ?? raw.cardId ?? "";
  const syncKind = raw.syncKind ?? "KnowledgeCards";
  return {
    id: raw.id ?? uuid(),
    syncKind,
    cardId: raw.cardId ?? resourceId,
    resourceId,
    localPath: raw.localPath ?? "",
    relativePath: (raw.relativePath ?? "").replace(/\\/g, "/"),
    status: raw.status ?? "pending",
    attempts: raw.attempts ?? 0,
    lastError: raw.lastError ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function readQueue(): KnowledgeQnapSyncQueueV1 {
  const filePath = getKnowledgeQnapSyncQueuePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), items: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as KnowledgeQnapSyncQueueV1;
    if (parsed?.items) {
      return {
        ...parsed,
        items: parsed.items.map((i) => normalizeItem(i)),
      };
    }
  } catch {
    /* */
  }
  return { version: 1, updatedAt: new Date().toISOString(), items: [] };
}

function writeQueue(queue: KnowledgeQnapSyncQueueV1): void {
  const filePath = getKnowledgeQnapSyncQueuePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  queue.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

function readFailureLog(): KnowledgeQnapSyncFailureLogEntryV1[] {
  const filePath = getFailureLogPath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      entries?: KnowledgeQnapSyncFailureLogEntryV1[];
    };
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

function appendFailureLog(entry: Omit<KnowledgeQnapSyncFailureLogEntryV1, "id" | "at">): void {
  const filePath = getFailureLogPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const entries = readFailureLog();
  entries.unshift({
    ...entry,
    id: uuid(),
    at: new Date().toISOString(),
  });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: entries.slice(0, MAX_FAILURE_LOG) }, null, 2)}\n`,
    "utf8"
  );
}

export function enqueueKnowledgeQnapSyncV1(input: {
  syncKind?: KnowledgeQnapSyncKindV1;
  resourceId: string;
  cardId?: string;
  localPath: string;
  relativePath: string;
}): KnowledgeQnapQueueItemV1 {
  const syncKind = input.syncKind ?? "KnowledgeCards";
  const resourceId = input.resourceId;
  const queue = readQueue();
  const existing = queue.items.find(
    (i) =>
      i.syncKind === syncKind &&
      i.resourceId === resourceId &&
      i.status !== "success"
  );
  if (existing) return existing;

  const item: KnowledgeQnapQueueItemV1 = {
    id: uuid(),
    syncKind,
    cardId: input.cardId ?? resourceId,
    resourceId,
    localPath: input.localPath,
    relativePath: input.relativePath.replace(/\\/g, "/"),
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  queue.items.push(item);
  writeQueue(queue);
  return item;
}

export function listKnowledgeQnapSyncQueueV1(limit = 20): KnowledgeQnapQueueItemV1[] {
  const queue = readQueue();
  return queue.items
    .filter((i) => i.status === "pending" || (i.status === "failed" && i.attempts < MAX_ATTEMPTS))
    .slice(0, limit);
}

export function markKnowledgeQnapUploadingV1(id: string): void {
  const queue = readQueue();
  const item = queue.items.find((i) => i.id === id);
  if (!item) return;
  item.status = "uploading";
  item.updatedAt = new Date().toISOString();
  writeQueue(queue);
}

export function markKnowledgeQnapSuccessV1(id: string): void {
  const queue = readQueue();
  const item = queue.items.find((i) => i.id === id);
  if (!item) return;
  item.status = "success";
  item.lastError = null;
  item.updatedAt = new Date().toISOString();
  writeQueue(queue);
}

export function markKnowledgeQnapFailedV1(id: string, error: string): void {
  const queue = readQueue();
  const item = queue.items.find((i) => i.id === id);
  if (!item) return;
  item.status = "failed";
  item.attempts += 1;
  item.lastError = error;
  item.updatedAt = new Date().toISOString();
  writeQueue(queue);
  appendFailureLog({
    syncKind: item.syncKind,
    resourceId: item.resourceId,
    relativePath: item.relativePath,
    error,
    attempts: item.attempts,
  });
}

export function getKnowledgeQnapSyncStatusV1(): {
  pending: number;
  failed: number;
  success: number;
  total: number;
  byKind: Record<KnowledgeQnapSyncKindV1, { pending: number; failed: number; success: number }>;
  lastSuccessAt: string | null;
  recentFailures: KnowledgeQnapSyncFailureLogEntryV1[];
} {
  const queue = readQueue();
  const byKind: Record<
    KnowledgeQnapSyncKindV1,
    { pending: number; failed: number; success: number }
  > = {
    KnowledgeCards: { pending: 0, failed: 0, success: 0 },
    Candidates: { pending: 0, failed: 0, success: 0 },
    Assets: { pending: 0, failed: 0, success: 0 },
    SearchIndex: { pending: 0, failed: 0, success: 0 },
  };

  let lastSuccessAt: string | null = null;
  for (const item of queue.items) {
    const bucket = byKind[item.syncKind] ?? byKind.KnowledgeCards;
    if (item.status === "pending" || item.status === "uploading") bucket.pending += 1;
    else if (item.status === "success") {
      bucket.success += 1;
      if (!lastSuccessAt || item.updatedAt > lastSuccessAt) lastSuccessAt = item.updatedAt;
    } else if (item.status === "failed" && item.attempts < MAX_ATTEMPTS) bucket.failed += 1;
  }

  return {
    pending: queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length,
    failed: queue.items.filter((i) => i.status === "failed" && i.attempts < MAX_ATTEMPTS).length,
    success: queue.items.filter((i) => i.status === "success").length,
    total: queue.items.length,
    byKind,
    lastSuccessAt,
    recentFailures: readFailureLog().slice(0, 10),
  };
}

export function resetKnowledgeQnapQueueItemV1(id: string): boolean {
  const queue = readQueue();
  const item = queue.items.find((i) => i.id === id);
  if (!item) return false;
  item.status = "pending";
  item.lastError = null;
  item.updatedAt = new Date().toISOString();
  writeQueue(queue);
  return true;
}

export function resetAllFailedKnowledgeQnapQueueV1(): number {
  const queue = readQueue();
  let count = 0;
  for (const item of queue.items) {
    if (item.status === "failed" && item.attempts < MAX_ATTEMPTS) {
      item.status = "pending";
      item.lastError = null;
      item.updatedAt = new Date().toISOString();
      count += 1;
    }
  }
  if (count > 0) writeQueue(queue);
  return count;
}
