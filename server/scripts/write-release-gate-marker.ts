#!/usr/bin/env tsx
/** Phase 1441–1460 — release:gate 成功時マーカー */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const repoRoot = path.join(serverRoot, "..");
const out = path.join(serverRoot, "data", "release-gate-last.json");

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

const payload = {
  generatedAt: new Date().toISOString(),
  build: true,
  tsc: true,
  test: true,
  phase: "1461-1500-conoha-vps-auto-deploy",
  buildNumber: "RC2-1500",
  commit: resolveCommit(),
};

const dir = path.dirname(out);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");
console.log("[TiSLY] release-gate marker written:", out);
