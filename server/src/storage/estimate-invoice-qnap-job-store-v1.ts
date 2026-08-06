/**
 * 見積・請求 QNAP 保存ジョブ（非同期結果ポーリング用）
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { EstimateInvoiceQnapSaveResultV1 } from "./estimate-invoice-qnap-save-v1.js";

export type EstimateInvoiceQnapJobStatusV1 =
  | "queued"
  | "running"
  | "success"
  | "pending_sync"
  | "failed";

export type EstimateInvoiceQnapJobV1 = {
  id: string;
  projectId: string;
  status: EstimateInvoiceQnapJobStatusV1;
  createdAt: string;
  updatedAt: string;
  message: string;
  /** 実際に保存された絶対パス */
  savedAbsolutePaths: string[];
  result?: EstimateInvoiceQnapSaveResultV1 | null;
  error?: string | null;
};

type JobStoreV1 = {
  version: 1;
  updatedAt: string;
  jobs: EstimateInvoiceQnapJobV1[];
};

const MAX_JOBS = 100;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function storePath(): string {
  return path.join(process.cwd(), "data", "estimate-invoice-qnap-jobs-v1.json");
}

function readStore(): JobStoreV1 {
  const filePath = storePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), jobs: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as JobStoreV1;
    if (parsed?.jobs && Array.isArray(parsed.jobs)) {
      return {
        version: 1,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        jobs: parsed.jobs,
      };
    }
  } catch {
    /* */
  }
  return { version: 1, updatedAt: new Date().toISOString(), jobs: [] };
}

function prune(jobs: EstimateInvoiceQnapJobV1[]): EstimateInvoiceQnapJobV1[] {
  const cutoff = Date.now() - JOB_TTL_MS;
  return jobs
    .filter((j) => {
      const t = Date.parse(j.updatedAt || j.createdAt);
      return !Number.isFinite(t) || t >= cutoff;
    })
    .slice(-MAX_JOBS);
}

function writeStore(store: JobStoreV1): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  store.jobs = prune(store.jobs);
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function createEstimateInvoiceQnapJobV1(
  projectId: string
): EstimateInvoiceQnapJobV1 {
  const now = new Date().toISOString();
  const job: EstimateInvoiceQnapJobV1 = {
    id: uuid(),
    projectId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    message: "QNAPへの保存処理を開始しました（キュー保存完了）",
    savedAbsolutePaths: [],
    result: null,
    error: null,
  };
  const store = readStore();
  store.jobs.push(job);
  writeStore(store);
  return job;
}

export function getEstimateInvoiceQnapJobV1(
  jobId: string
): EstimateInvoiceQnapJobV1 | null {
  const id = String(jobId || "").trim();
  if (!id) return null;
  return readStore().jobs.find((j) => j.id === id) || null;
}

export function updateEstimateInvoiceQnapJobV1(
  jobId: string,
  patch: Partial<
    Pick<
      EstimateInvoiceQnapJobV1,
      "status" | "message" | "savedAbsolutePaths" | "result" | "error"
    >
  >
): EstimateInvoiceQnapJobV1 | null {
  const store = readStore();
  const idx = store.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) return null;
  const next: EstimateInvoiceQnapJobV1 = {
    ...store.jobs[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.jobs[idx] = next;
  writeStore(store);
  return next;
}

export function markJobFromSaveResultV1(
  jobId: string,
  result: EstimateInvoiceQnapSaveResultV1
): EstimateInvoiceQnapJobV1 | null {
  const paths = (result.files || [])
    .filter((f) => f.ok && f.absolutePath)
    .map((f) => f.absolutePath as string);
  const status: EstimateInvoiceQnapJobStatusV1 = !result.ok
    ? "failed"
    : result.pendingSync
      ? "pending_sync"
      : "success";
  return updateEstimateInvoiceQnapJobV1(jobId, {
    status,
    message: result.message,
    savedAbsolutePaths: paths.length
      ? paths
      : result.folderPath
        ? [result.folderPath]
        : [],
    result,
    error: result.error || null,
  });
}
