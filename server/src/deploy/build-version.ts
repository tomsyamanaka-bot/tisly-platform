/**
 * Phase 1441–1460 — ビルドバージョン・コミット追跡（/app 右下・/api/health）
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const RELEASE_GATE_MARKER = path.join(serverRoot, "data", "release-gate-last.json");

export interface BuildVersionInfo {
  label: string;
  build: string;
  commit: string;
  commitShort: string;
  date: string;
  phase: string;
}

interface ReleaseGateMarker {
  generatedAt?: string;
  build?: boolean;
  test?: boolean;
  tsc?: boolean;
  phase?: string;
  commit?: string;
  buildNumber?: string;
}

function readMarker(): ReleaseGateMarker | null {
  try {
    if (!fs.existsSync(RELEASE_GATE_MARKER)) return null;
    return JSON.parse(fs.readFileSync(RELEASE_GATE_MARKER, "utf8")) as ReleaseGateMarker;
  } catch {
    return null;
  }
}

function resolveGitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: path.join(serverRoot, ".."),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function getBuildVersion(): BuildVersionInfo {
  const marker = readMarker();
  const commit = marker?.commit || resolveGitCommit() || "unknown";
  const commitShort = commit === "unknown" ? "unknown" : commit.slice(0, 7);
  const date = marker?.generatedAt
    ? marker.generatedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    label: "TiSLY RC2",
    build: marker?.buildNumber || "1460",
    commit,
    commitShort,
    date,
    phase: marker?.phase || "1461-1500-conoha-vps-auto-deploy",
  };
}
