/**
 * Phase 1461–1500 — デプロイ / ロールバック / ビルド履歴
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import { getBuildVersion } from "./build-version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const HISTORY_FILE = path.join(serverRoot, "data", "deploy-history.json");
const MAX_ENTRIES = 100;

export type DeployEventType = "deploy" | "rollback" | "build";

export interface DeployHistoryEntry {
  id: string;
  type: DeployEventType;
  commit: string;
  commitShort: string;
  build: string;
  status: "success" | "failed" | "pending" | "rolled_back";
  message?: string;
  actor?: string;
  at: string;
}

function readAll(): DeployHistoryEntry[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeAll(entries: DeployHistoryEntry[]): void {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const trimmed = entries.slice(0, MAX_ENTRIES);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), "utf8");
}

export function appendDeployHistory(
  entry: Omit<DeployHistoryEntry, "id" | "at"> & { at?: string }
): DeployHistoryEntry {
  const full: DeployHistoryEntry = {
    id: uuid(),
    at: entry.at || new Date().toISOString(),
    ...entry,
  };
  const all = readAll();
  all.unshift(full);
  writeAll(all);
  return full;
}

export function listDeployHistory(limit = 50): DeployHistoryEntry[] {
  return readAll().slice(0, limit);
}

export function listByType(type: DeployEventType, limit = 30): DeployHistoryEntry[] {
  return readAll().filter((e) => e.type === type).slice(0, limit);
}

export function getLatestDeploy(): DeployHistoryEntry | null {
  return readAll().find((e) => e.type === "deploy") ?? null;
}

export function getLatestRollback(): DeployHistoryEntry | null {
  return readAll().find((e) => e.type === "rollback") ?? null;
}

export interface DeployCenterStatus {
  currentCommit: string;
  currentCommitShort: string;
  currentBuild: string;
  deployDate: string | null;
  deployStatus: "success" | "failed" | "pending" | "never" | "rolled_back";
  deployMessage: string;
  rollbackAvailable: boolean;
  phase: string;
  generatedAt: string;
}

export function buildDeployCenterStatus(): DeployCenterStatus {
  const version = getBuildVersion();
  const latest = getLatestDeploy();
  const latestRollback = getLatestRollback();

  let deployStatus: DeployCenterStatus["deployStatus"] = "never";
  let deployDate: string | null = null;
  let deployMessage = "デプロイ履歴なし";

  if (latest) {
    deployStatus = latest.status === "rolled_back" ? "rolled_back" : latest.status;
    deployDate = latest.at;
    deployMessage = latest.message || `${latest.type} ${latest.status}`;
  } else if (latestRollback) {
    deployStatus = "rolled_back";
    deployDate = latestRollback.at;
    deployMessage = latestRollback.message || "ロールバック実行済み";
  }

  const hasSuccessfulDeploy = readAll().some(
    (e) => e.type === "deploy" && e.status === "success"
  );

  return {
    currentCommit: version.commit,
    currentCommitShort: version.commitShort,
    currentBuild: version.build,
    deployDate,
    deployStatus,
    deployMessage,
    rollbackAvailable: hasSuccessfulDeploy,
    phase: version.phase,
    generatedAt: new Date().toISOString(),
  };
}
