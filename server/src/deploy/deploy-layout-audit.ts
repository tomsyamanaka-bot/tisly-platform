/**
 * Phase 1681–1720 — Deploy Layout & GitHub Sync 監査
 * VPS デプロイ可能なリポジトリ構成を検証（フロントは server/public/ を標準とする）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const repoRoot = path.join(serverRoot, "..");

export type LayoutVerdict = "READY" | "NOT READY";

export interface LayoutCheckItem {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  required: boolean;
  message: string;
}

export interface DeployLayoutAuditReport {
  phase: string;
  title: string;
  generatedAt: string;
  verdict: LayoutVerdict;
  readyCount: number;
  totalRequired: number;
  checks: LayoutCheckItem[];
  notes: string[];
}

const REQUIRED_LAYOUT: { id: string; label: string; rel: string }[] = [
  { id: "server", label: "server/", rel: "server" },
  { id: "server_public", label: "server/public/（フロント）", rel: "server/public" },
  {
    id: "env_example",
    label: "server/.env.production.example",
    rel: "server/.env.production.example",
  },
  {
    id: "nginx_conf",
    label: "nginx tisly.jp.conf",
    rel: "server/deploy/nginx/tisly.jp.conf",
  },
  {
    id: "systemd_unit",
    label: "systemd tisly-server.service",
    rel: "server/deploy/systemd/tisly-server.service",
  },
  {
    id: "vps_check",
    label: "vps-first-deploy-check.sh",
    rel: "scripts/vps-first-deploy-check.sh",
  },
  {
    id: "vps_deploy",
    label: "vps-deploy-one-command.sh",
    rel: "scripts/vps-deploy-one-command.sh",
  },
  {
    id: "vps_production_start",
    label: "vps-production-start.sh",
    rel: "scripts/vps-production-start.sh",
  },
  { id: "github_workflows", label: ".github/workflows", rel: ".github/workflows" },
];

const LAYOUT_NOTES = [
  "フロントエンドは server/public/ に内包（ルート web/ は不要）",
  "本番 .env テンプレート標準: server/.env.production.example",
  "VPS アプリ本体: /opt/tisly/server",
  "GitHub リポジトリ名: tisly-platform",
];

function pathExists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

export function buildDeployLayoutAudit(root = repoRoot): DeployLayoutAuditReport {
  const checks: LayoutCheckItem[] = REQUIRED_LAYOUT.map((spec) => {
    const exists = pathExists(root, spec.rel);
    return {
      id: spec.id,
      label: spec.label,
      path: spec.rel,
      exists,
      required: true,
      message: exists ? `${spec.rel} OK` : `${spec.rel} なし`,
    };
  });

  const legacyWeb = pathExists(root, "web");
  checks.push({
    id: "legacy_web_optional",
    label: "ルート web/（任意・非必須）",
    path: "web",
    exists: legacyWeb,
    required: false,
    message: legacyWeb
      ? "web/ あり（server/public を優先）"
      : "web/ なし — server/public で代替（正常）",
  });

  const required = checks.filter((c) => c.required);
  const readyCount = required.filter((c) => c.exists).length;
  const verdict: LayoutVerdict =
    readyCount === required.length ? "READY" : "NOT READY";

  return {
    phase: "1681-1720",
    title: "Deploy Layout Fix & GitHub Sync",
    generatedAt: new Date().toISOString(),
    verdict,
    readyCount,
    totalRequired: required.length,
    checks,
    notes: LAYOUT_NOTES,
  };
}
