#!/usr/bin/env tsx
/** Phase 1461–1500 — deploy.sh / rollback.sh から履歴記録 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import {
  appendDeployHistory,
  type DeployEventType,
} from "../src/deploy/deploy-history.js";
import { getBuildVersion } from "../src/deploy/build-version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function resolveCommit(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const type = (process.argv[2] || "deploy") as DeployEventType;
const status = (process.argv[3] || "success") as "success" | "failed" | "pending" | "rolled_back";
const message = process.argv[4] || "";
const actor = process.argv[5] || "deploy-script";

const version = getBuildVersion();
const commit = resolveCommit();

const entry = appendDeployHistory({
  type,
  commit,
  commitShort: commit === "unknown" ? "unknown" : commit.slice(0, 7),
  build: version.build,
  status,
  message: message || `${type} ${status}`,
  actor,
});

console.log("[TiSLY] deploy history recorded:", entry.id, entry.type, entry.status);
