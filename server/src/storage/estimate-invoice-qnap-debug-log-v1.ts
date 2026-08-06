/**
 * QNAP 見積・請求保存 — 通信デバッグログ（ストレージ設定 UI 表示用）
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

export type QnapSaveDebugLogEntryV1 = {
  id: string;
  createdAt: string;
  projectId: string;
  jobId?: string | null;
  ok: boolean;
  pendingSync?: boolean;
  route?: string | null;
  host?: string | null;
  port?: number | null;
  /** 実際に保存された絶対パス一覧 */
  savedAbsolutePaths: string[];
  message: string;
  /** MKCOL / PUT / File Station の通信トレース */
  steps: Array<{
    at: string;
    method: string;
    urlOrPath: string;
    status?: number | null;
    ok: boolean;
    detail?: string;
  }>;
  error?: string | null;
};

type DebugLogStoreV1 = {
  version: 1;
  updatedAt: string;
  entries: QnapSaveDebugLogEntryV1[];
};

const MAX_ENTRIES = 80;

function storePath(): string {
  return path.join(process.cwd(), "data", "estimate-invoice-qnap-debug-log-v1.json");
}

function readStore(): DebugLogStoreV1 {
  const filePath = storePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as DebugLogStoreV1;
    if (parsed?.entries && Array.isArray(parsed.entries)) {
      return {
        version: 1,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        entries: parsed.entries,
      };
    }
  } catch {
    /* */
  }
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

function writeStore(store: DebugLogStoreV1): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  store.entries = store.entries.slice(-MAX_ENTRIES);
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function appendQnapSaveDebugLogV1(
  input: Omit<QnapSaveDebugLogEntryV1, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
): QnapSaveDebugLogEntryV1 {
  const entry: QnapSaveDebugLogEntryV1 = {
    id: input.id || uuid(),
    createdAt: input.createdAt || new Date().toISOString(),
    projectId: input.projectId,
    jobId: input.jobId ?? null,
    ok: Boolean(input.ok),
    pendingSync: Boolean(input.pendingSync),
    route: input.route ?? null,
    host: input.host ?? null,
    port: input.port ?? null,
    savedAbsolutePaths: Array.isArray(input.savedAbsolutePaths)
      ? input.savedAbsolutePaths
      : [],
    message: String(input.message || ""),
    steps: Array.isArray(input.steps) ? input.steps : [],
    error: input.error ?? null,
  };
  const store = readStore();
  store.entries.push(entry);
  writeStore(store);
  return entry;
}

export function listQnapSaveDebugLogsV1(limit = 40): QnapSaveDebugLogEntryV1[] {
  const n = Math.min(Math.max(Number(limit) || 40, 1), MAX_ENTRIES);
  const store = readStore();
  return store.entries.slice(-n).reverse();
}

export function clearQnapSaveDebugLogsV1(): void {
  writeStore({ version: 1, updatedAt: new Date().toISOString(), entries: [] });
}
