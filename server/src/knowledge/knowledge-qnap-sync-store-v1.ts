/** TiSLY Knowledge QNAP 同期キュー v1 — ローカル JSON */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getKnowledgeQnapSyncQueuePath } from "./knowledge-paths-v1.js";

export type KnowledgeQnapQueueStatusV1 = "pending" | "uploading" | "success" | "failed";

export interface KnowledgeQnapQueueItemV1 {
  id: string;
  cardId: string;
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

const MAX_ATTEMPTS = 3;

function readQueue(): KnowledgeQnapSyncQueueV1 {
  const filePath = getKnowledgeQnapSyncQueuePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), items: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as KnowledgeQnapSyncQueueV1;
    if (parsed?.items) return parsed;
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

export function enqueueKnowledgeQnapSyncV1(input: {
  cardId: string;
  localPath: string;
  relativePath: string;
}): KnowledgeQnapQueueItemV1 {
  const queue = readQueue();
  const existing = queue.items.find(
    (i) => i.cardId === input.cardId && i.status !== "success"
  );
  if (existing) return existing;

  const item: KnowledgeQnapQueueItemV1 = {
    id: uuid(),
    cardId: input.cardId,
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
}

export function getKnowledgeQnapSyncStatusV1(): {
  pending: number;
  failed: number;
  success: number;
  total: number;
} {
  const queue = readQueue();
  return {
    pending: queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length,
    failed: queue.items.filter((i) => i.status === "failed" && i.attempts < MAX_ATTEMPTS).length,
    success: queue.items.filter((i) => i.status === "success").length,
    total: queue.items.length,
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
