/**
 * Phase 1441–1460 — VPS Deploy Status（/app カード用）
 */

import type { DeployDryRunReport } from "./deploy-dry-run.js";
import { buildProductionReadiness } from "./production-readiness.js";

export type VpsDeployItemStatus = "pass" | "fail" | "warn";

export interface VpsDeployStatusItem {
  id: string;
  label: string;
  status: VpsDeployItemStatus;
  message: string;
}

export interface VpsDeployStatusReport {
  generatedAt: string;
  ready: boolean;
  readyLabel: string;
  items: VpsDeployStatusItem[];
}

export function buildVpsDeployStatus(dryRun: DeployDryRunReport): VpsDeployStatusReport {
  const readiness = buildProductionReadiness(dryRun);
  const marker = readiness.items;
  const byId = Object.fromEntries(marker.map((i) => [i.id, i]));
  const gate = dryRun.releaseGate;

  const items: VpsDeployStatusItem[] = [
    {
      id: "build",
      label: "Build",
      status: byId.build?.status === "pass" ? "pass" : byId.build?.status === "warn" ? "warn" : "fail",
      message: byId.build?.message || "—",
    },
    {
      id: "test",
      label: "Test",
      status: byId.test?.status === "pass" ? "pass" : byId.test?.status === "warn" ? "warn" : "fail",
      message: byId.test?.message || "—",
    },
    {
      id: "release_gate",
      label: "Release Gate",
      status: gate?.status === "pass" ? "pass" : gate ? "fail" : dryRun.passed ? "pass" : "fail",
      message: gate?.message || (dryRun.passed ? "release:gate 合格" : "release:gate 未合格"),
    },
    {
      id: "deploy_dry_run",
      label: "Deploy Dry Run",
      status: dryRun.passed ? "pass" : "fail",
      message: dryRun.passed
        ? `合格 (${dryRun.summary.pass} pass / ${dryRun.summary.warn} warn)`
        : `不合格 (${dryRun.summary.fail} fail)`,
    },
    {
      id: "production_url",
      label: "Production URL",
      status: byId.production_url?.status === "pass" ? "pass" : "fail",
      message: byId.production_url?.message || dryRun.tislyPublicUrl,
    },
    {
      id: "https",
      label: "HTTPS",
      status: byId.https_ready?.status === "pass" ? "pass" : "fail",
      message: byId.https_ready?.message || "—",
    },
    {
      id: "websocket",
      label: "WebSocket",
      status: byId.ws_ready?.status === "pass" ? "pass" : "fail",
      message: byId.ws_ready?.message || "—",
    },
    {
      id: "pwa_ready",
      label: "PWA Ready",
      status: byId.pwa_ready?.status === "pass" ? "pass" : byId.pwa_ready?.status === "warn" ? "warn" : "fail",
      message: byId.pwa_ready?.message || "—",
    },
    {
      id: "deploy_ready",
      label: "Deploy Ready",
      status: byId.deploy_ready?.status === "pass" ? "pass" : "fail",
      message: byId.deploy_ready?.message || "—",
    },
  ];

  const ready = items.every((i) => i.status === "pass");

  return {
    generatedAt: new Date().toISOString(),
    ready,
    readyLabel: ready ? "READY FOR DEPLOY" : "NOT READY",
    items,
  };
}
