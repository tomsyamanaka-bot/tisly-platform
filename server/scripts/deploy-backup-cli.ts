#!/usr/bin/env tsx
/** Phase 1461–1500 — デプロイ前バックアップ CLI */

import { runDeployBackup } from "../src/deploy/deploy-backup.js";

const result = runDeployBackup();
console.log("[TiSLY] deploy backup:", result.backupDir);
console.log("[TiSLY] files:", result.files.length);
if (result.errors.length) {
  console.warn("[TiSLY] backup warnings:", result.errors.join("; "));
}
process.exit(result.ok ? 0 : 1);
