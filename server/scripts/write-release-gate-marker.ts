#!/usr/bin/env tsx
/** Phase 1381–1400 — release:gate 成功時マーカー */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "data", "release-gate-last.json");

const payload = {
  generatedAt: new Date().toISOString(),
  build: true,
  tsc: true,
  test: true,
  phase: "1381-1400",
};

const dir = path.dirname(out);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");
console.log("[TiSLY] release-gate marker written:", out);
