#!/usr/bin/env tsx
/**
 * Phase 1291–1320 — VPS デプロイ前 dry-run CLI
 * Usage: npm run deploy:dry-run
 */

import {
  buildDeployDryRun,
  writeLastDryRunReport,
} from "../src/deploy/deploy-dry-run.js";

const report = buildDeployDryRun(process.env);
writeLastDryRunReport(report);

const statusIcon = (s: string) => (s === "pass" ? "✓" : s === "warn" ? "!" : "✗");

console.log("\n[TiSLY] Deploy Dry Run — Phase 1291–1320\n");
console.log(`Generated: ${report.generatedAt}`);
console.log(`Result: ${report.passed ? "PASS" : "FAIL"} (${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail)\n`);

for (const c of report.checks) {
  console.log(`  [${statusIcon(c.status)}] ${c.name}: ${c.message}`);
  if (c.hint) console.log(`      hint: ${c.hint}`);
}

console.log(`\nProduction URLs (${report.productionUrls.length}):`);
for (const u of report.productionUrls) {
  console.log(`  ${u}`);
}

console.log(`\nPWA installReady: ${report.pwaInstallReady}`);
console.log(`Mock 維持: ${report.mockItems.length} 項目`);
console.log(`Real 切替必要: ${report.realSwitchItems.length} 項目`);

if (!report.passed) {
  console.error("\n[Dry Run FAILED] VPS デプロイ前に上記を修正してください。\n");
  process.exit(1);
}

console.log("\n[Dry Run PASSED] npm run release:gate の一部として合格。\n");
process.exit(0);
