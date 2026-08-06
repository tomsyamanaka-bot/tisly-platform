/**
 * 見積・請求 PDF の QNAP 同期待ちキュー（VPS ローカル保持）
 * WebDAV / File Station 全滅時に enqueue → Worker が再送
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

export type EstimateInvoiceQnapPendingStatusV1 =
  | "pending"
  | "uploading"
  | "success"
  | "failed";

export type EstimateInvoiceQnapPendingFileV1 = {
  kind: "estimate" | "invoice";
  localPath: string;
  remotePath: string;
  displayPath: string;
};

export type EstimateInvoiceQnapPendingItemV1 = {
  id: string;
  projectId: string;
  files: EstimateInvoiceQnapPendingFileV1[];
  status: EstimateInvoiceQnapPendingStatusV1;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EstimateInvoiceQnapPendingQueueV1 = {
  version: 1;
  updatedAt: string;
  items: EstimateInvoiceQnapPendingItemV1[];
};

const MAX_ATTEMPTS = 8;
const MAX_QUEUE = 200;

function queuePath(): string {
  return path.join(process.cwd(), "data", "estimate-invoice-qnap-pending-v1.json");
}

function readQueue(): EstimateInvoiceQnapPendingQueueV1 {
  const filePath = queuePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), items: [] };
    }
    const parsed = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    ) as EstimateInvoiceQnapPendingQueueV1;
    if (parsed?.items && Array.isArray(parsed.items)) {
      return {
        version: 1,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        items: parsed.items,
      };
    }
  } catch {
    /* */
  }
  return { version: 1, updatedAt: new Date().toISOString(), items: [] };
}

function writeQueue(queue: EstimateInvoiceQnapPendingQueueV1): void {
  const filePath = queuePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  queue.updatedAt = new Date().toISOString();
  queue.items = queue.items.slice(-MAX_QUEUE);
  fs.writeFileSync(filePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

export function enqueueEstimateInvoiceQnapPendingV1(input: {
  projectId: string;
  files: EstimateInvoiceQnapPendingFileV1[];
  lastError?: string | null;
}): EstimateInvoiceQnapPendingItemV1 {
  const queue = readQueue();
  const now = new Date().toISOString();
  // 同一案件の pending を統合
  const existing = queue.items.find(
    (i) => i.projectId === input.projectId && i.status === "pending"
  );
  if (existing) {
    const byKind = new Map(existing.files.map((f) => [f.kind, f]));
    for (const f of input.files) byKind.set(f.kind, f);
    existing.files = [...byKind.values()];
    existing.lastError = input.lastError ?? existing.lastError;
    existing.updatedAt = now;
    writeQueue(queue);
    return existing;
  }
  const item: EstimateInvoiceQnapPendingItemV1 = {
    id: uuid(),
    projectId: input.projectId,
    files: input.files,
    status: "pending",
    attempts: 0,
    lastError: input.lastError ?? null,
    createdAt: now,
    updatedAt: now,
  };
  queue.items.push(item);
  writeQueue(queue);
  console.log(
    `[QNAP pending] enqueued project=${input.projectId} files=${input.files.length}`
  );
  return item;
}

export function listEstimateInvoiceQnapPendingV1(
  limit = 5
): EstimateInvoiceQnapPendingItemV1[] {
  const queue = readQueue();
  return queue.items
    .filter(
      (i) =>
        i.status === "pending" ||
        i.status === "failed" ||
        i.status === "uploading"
    )
    .filter((i) => i.attempts < MAX_ATTEMPTS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(1, limit));
}

export function markEstimateInvoiceQnapPendingV1(
  id: string,
  patch: Partial<
    Pick<
      EstimateInvoiceQnapPendingItemV1,
      "status" | "attempts" | "lastError"
    >
  >
): void {
  const queue = readQueue();
  const item = queue.items.find((i) => i.id === id);
  if (!item) return;
  if (patch.status != null) item.status = patch.status;
  if (patch.attempts != null) item.attempts = patch.attempts;
  if (patch.lastError !== undefined) item.lastError = patch.lastError;
  item.updatedAt = new Date().toISOString();
  // 成功分はキューから除去
  if (item.status === "success") {
    queue.items = queue.items.filter((i) => i.id !== id);
  }
  writeQueue(queue);
}

export function countEstimateInvoiceQnapPendingV1(): number {
  return readQueue().items.filter(
    (i) =>
      (i.status === "pending" || i.status === "failed") &&
      i.attempts < MAX_ATTEMPTS
  ).length;
}

export { MAX_ATTEMPTS as ESTIMATE_INVOICE_QNAP_PENDING_MAX_ATTEMPTS };
