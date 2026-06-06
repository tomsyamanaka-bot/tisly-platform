/**
 * Phase 1801–1840 — VPS Production Start Command Finalize
 * （Phase 1761–1800 リハーサルチェックリストを拡張）
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildDeployDryRun, buildReleaseGateInfo } from "./deploy-dry-run.js";
import { buildDeployLayoutAudit } from "./deploy-layout-audit.js";
import { buildDeployPreflight } from "./deploy-preflight.js";
import { buildProductionReadiness } from "./production-readiness.js";
import { buildSecurityRehearsalAudit } from "./production-rehearsal.js";
import { buildPwaInstallAudit } from "../pwa/pwa-install-audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");

export type RehearsalBadgeStatus = "ready" | "not_ready" | "set" | "not_set" | "deployed" | "not_deployed" | "checked" | "not_checked";

export interface RehearsalStatusRow {
  id: string;
  label: string;
  displayLabel: string;
  status: RehearsalBadgeStatus;
  message: string;
}

export type EnvCheckState = "required" | "optional" | "missing" | "set";

export interface EnvChecklistRow {
  key: string;
  label: string;
  requirement: "required" | "optional";
  state: EnvCheckState;
  message: string;
}

export interface VpsCommandStep {
  id: string;
  title: string;
  commands: string[];
  note?: string;
}

export interface ProductionStartInfo {
  method: "systemd";
  methodLabel: string;
  packageJson: string;
  startScript: string;
  entryPoint: string;
  systemdUnit: string;
  nginxConf: string;
  envTemplate: string;
  oneBlock: string[];
  note: string;
}

export interface DeployRehearsalChecklistReport {
  phase: string;
  title: string;
  generatedAt: string;
  rehearsalReady: boolean;
  rehearsalReadyLabel: string;
  statusRows: RehearsalStatusRow[];
  envChecklist: EnvChecklistRow[];
  vpsCommands: VpsCommandStep[];
  productionStart: ProductionStartInfo;
  pwaInstallReady: { ready: number; total: number; label: string };
}

const INSECURE_VALUES = new Set([
  "",
  "change-me",
  "change-me-before-production",
  "change-me-use-openssl-rand-hex-32",
  "test-jwt-secret-32-characters-long!!",
]);

function isSystemdActive(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const active = execSync("systemctl is-active tisly-server", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return active === "active";
  } catch {
    return false;
  }
}

function isSslReadyOnVps(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const out = execSync("certbot certificates 2>/dev/null | grep -c 'Certificate Name: tisly.jp' || true", {
      encoding: "utf8",
      shell: "/bin/bash",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return parseInt(out, 10) > 0;
  } catch {
    const nginxConf = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
    if (!fs.existsSync(nginxConf)) return false;
    return fs.readFileSync(nginxConf, "utf8").includes("ssl_certificate");
  }
}

function envValue(source: NodeJS.ProcessEnv, key: string): string {
  return (source[key] ?? "").trim();
}

function isSecretSet(val: string, minLen = 8): boolean {
  return val.length >= minLen && !INSECURE_VALUES.has(val);
}

function buildEnvChecklist(source: NodeJS.ProcessEnv = process.env): EnvChecklistRow[] {
  const get = (key: string) => envValue(source, key);
  const mqttReal = get("MQTT_MODE").toLowerCase() === "real";
  const qnapReal = get("QNAP_UPLOAD_MODE").toLowerCase() === "real";
  const dbProvider = get("DB_PROVIDER") || "sqlite";

  const rows: { key: string; label: string; requirement: "required" | "optional"; set: boolean; message: string }[] = [
    {
      key: "JWT_SECRET",
      label: "JWT_SECRET",
      requirement: "required",
      set: isSecretSet(get("JWT_SECRET"), 32),
      message: "openssl rand -base64 48 で生成",
    },
    {
      key: "ADMIN_PASSWORD_HASH",
      label: "ADMIN_PASSWORD_HASH",
      requirement: "required",
      set: get("ADMIN_PASSWORD_HASH").length > 20,
      message: "hashPassword() で生成",
    },
    {
      key: "INGEST_SECRET",
      label: "INGEST_SECRET",
      requirement: "required",
      set: isSecretSet(get("INGEST_SECRET")),
      message: "JWT と別値 · openssl rand -base64 48",
    },
    {
      key: "TISLY_PUBLIC_URL",
      label: "TISLY_PUBLIC_URL",
      requirement: "required",
      set: get("TISLY_PUBLIC_URL").startsWith("https://tisly.jp"),
      message: "https://tisly.jp",
    },
    {
      key: "NODE_ENV",
      label: "NODE_ENV",
      requirement: "required",
      set: get("NODE_ENV") === "production",
      message: "production",
    },
    {
      key: "PORT",
      label: "PORT",
      requirement: "required",
      set: !!get("PORT") || !!get("TISLY_PORT"),
      message: "3080 推奨",
    },
    {
      key: "DATABASE",
      label: dbProvider === "postgres" ? "DATABASE_URL / POSTGRES" : "SQLite (TISLY_DB_PATH)",
      requirement: "required",
      set:
        dbProvider === "postgres"
          ? !!(get("POSTGRES_URL") || get("POSTGRES_PASSWORD"))
          : !!(get("TISLY_DB_PATH") || dbProvider === "sqlite"),
      message:
        dbProvider === "postgres"
          ? "POSTGRES_URL または POSTGRES_PASSWORD"
          : "DB_PROVIDER=sqlite · TISLY_DB_PATH=./data/tisly_notifications.db",
    },
    {
      key: "MQTT_URL",
      label: "MQTT_URL",
      requirement: mqttReal ? "required" : "optional",
      set: mqttReal ? !!get("MQTT_URL") : true,
      message: mqttReal ? "real モード時は必須" : "mock 初回は空で OK",
    },
    {
      key: "MQTT_USERNAME",
      label: "MQTT_USERNAME",
      requirement: mqttReal ? "required" : "optional",
      set: mqttReal ? !!get("MQTT_USERNAME") : true,
      message: mqttReal ? "real モード時は必須" : "mock 初回は空で OK",
    },
    {
      key: "MQTT_PASSWORD",
      label: "MQTT_PASSWORD",
      requirement: mqttReal ? "required" : "optional",
      set: mqttReal ? isSecretSet(get("MQTT_PASSWORD")) : true,
      message: mqttReal ? "real モード時は必須" : "mock 初回は空で OK",
    },
    {
      key: "QNAP_WEBDAV_URL",
      label: "QNAP_WEBDAV_URL",
      requirement: qnapReal ? "required" : "optional",
      set: qnapReal ? !!get("QNAP_WEBDAV_URL") : true,
      message: qnapReal ? "QNAP_UPLOAD_MODE=real 時は必須" : "mock 初回は空で OK",
    },
    {
      key: "GOOGLE_OAUTH_ENABLED",
      label: "GOOGLE_OAUTH_ENABLED",
      requirement: "optional",
      set: true,
      message: get("GOOGLE_OAUTH_ENABLED").toLowerCase() === "true" ? "有効 — CLIENT_ID 等も要確認" : "false 推奨（初回）",
    },
  ];

  return rows.map((r) => {
    let state: EnvCheckState;
    if (r.set) {
      state = "set";
    } else if (r.requirement === "required") {
      state = "missing";
    } else {
      state = "optional";
    }
    return {
      key: r.key,
      label: r.label,
      requirement: r.requirement,
      state,
      message: r.message,
    };
  });
}

/** VNC コンソールへ貼る本番起動コマンド（1 ブロック · 秘密値なし） */
export const VPS_PRODUCTION_START_ONE_BLOCK: string[] = [
  "cd /opt/tisly/server",
  "test -f .env || cp .env.production.example .env && chmod 600 .env",
  "test -f .env && grep -qE '^JWT_SECRET=.+$' .env && grep -qE '^ADMIN_PASSWORD_HASH=.+$' .env || { echo '✋ .env 未完了 — docs/env_fill_in_guide.md を参照'; exit 1; }",
  "npm ci",
  "npm run build",
  "npm run release:gate",
  "npm run db:init",
  "cp deploy/systemd/tisly-server.service /etc/systemd/system/",
  "systemctl daemon-reload",
  "systemctl enable tisly-server",
  "systemctl restart tisly-server",
  "systemctl is-active tisly-server",
  "cp deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp",
  "ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/",
  "rm -f /etc/nginx/sites-enabled/default",
  "nginx -t && systemctl reload nginx",
  "curl -sS http://127.0.0.1:3080/api/health",
  "curl -sI https://tisly.jp/app | head -5",
  "curl -sS https://tisly.jp/api/health",
];

/** VPS 投入コマンド（秘密値はすべてプレースホルダ） */
export const VPS_DEPLOY_COMMAND_STEPS: VpsCommandStep[] = [
  {
    id: "ssh",
    title: "SSH 接続",
    commands: ["ssh root@<VPSのIPアドレス>"],
    note: "✋ <VPSのIPアドレス> を ConoHa の IP に置き換えます",
  },
  {
    id: "clone",
    title: "git clone",
    commands: [
      "sudo -u tisly git clone <リポジトリURL> /opt/tisly",
      "cd /opt/tisly",
      "ls -la server/public",
    ],
    note: "✋ <リポジトリURL> を GitHub の clone URL に置き換えます",
  },
  {
    id: "server",
    title: "server へ移動",
    commands: ["cd /opt/tisly/server"],
  },
  {
    id: "env",
    title: ".env 作成",
    commands: [
      "cp .env.production.example .env",
      "chmod 600 .env",
      "nano .env",
      "# 以下を設定（秘密値はここに入れる）",
      "JWT_SECRET=ここに入れる",
      "ADMIN_PASSWORD_HASH=ここに入れる",
      "INGEST_SECRET=ここに入れる",
      "DEPLOY_OPS_TOKEN=ここに入れる",
      "NODE_ENV=production",
      "TISLY_PUBLIC_URL=https://tisly.jp",
    ],
    note: "詳細は docs/env_fill_in_guide.md を参照",
  },
  {
    id: "npm_ci",
    title: "npm ci",
    commands: ["cd /opt/tisly/server", "sudo -u tisly npm ci"],
  },
  {
    id: "build",
    title: "npm run build",
    commands: [
      "cd /opt/tisly/server",
      "sudo -u tisly npm run build",
      'test -f dist/index.js && echo "build OK"',
    ],
  },
  {
    id: "release_gate",
    title: "npm run release:gate",
    commands: ["cd /opt/tisly/server", "sudo -u tisly npm run release:gate"],
    note: "すべて合格するまで次に進みません",
  },
  {
    id: "db_init",
    title: "npm run db:init",
    commands: ["cd /opt/tisly/server", "sudo -u tisly npm run db:init"],
  },
  {
    id: "systemd",
    title: "systemd 登録",
    commands: [
      "cp /opt/tisly/server/deploy/systemd/tisly-server.service /etc/systemd/system/",
      "systemctl daemon-reload",
      "systemctl enable tisly-server",
      "systemctl start tisly-server",
      "systemctl status tisly-server",
    ],
  },
  {
    id: "nginx",
    title: "nginx 反映",
    commands: [
      "cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp",
      "ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/",
      "rm -f /etc/nginx/sites-enabled/default",
      "nginx -t",
      "systemctl reload nginx",
    ],
  },
  {
    id: "certbot",
    title: "certbot（SSL）",
    commands: [
      "certbot --nginx -d tisly.jp -d www.tisly.jp",
      "certbot renew --dry-run",
    ],
    note: "✋ メールアドレス・規約同意 · HTTPS リダイレクトは 2（Redirect）推奨",
  },
  {
    id: "health",
    title: "health 確認",
    commands: [
      "cd /opt/tisly",
      "bash scripts/vps-first-deploy-check.sh",
      "curl -sS https://tisly.jp/api/health",
      "curl -sI https://tisly.jp/app | head -5",
    ],
    note: "READY FOR DEPLOY と表示されるまで ✗ を解消",
  },
  {
    id: "rollback",
    title: "rollback（失敗時）",
    commands: ["cd /opt/tisly", "bash scripts/rollback.sh"],
    note: "詳細は docs/rollback_guide.md",
  },
  {
    id: "production_start",
    title: "本番起動（一本化 · VNC コンソール用）",
    commands: VPS_PRODUCTION_START_ONE_BLOCK,
    note:
      "起動方式は systemd（公式）。PM2 は代替のみ — 本番では使いません。秘密値は表示しません。",
  },
];

export function buildProductionStartInfo(): ProductionStartInfo {
  return {
    method: "systemd",
    methodLabel: "systemd（推奨 · 公式）— PM2 は代替のみ",
    packageJson: "/opt/tisly/server/package.json",
    startScript: "npm start → node dist/index.js",
    entryPoint: "/opt/tisly/server/dist/index.js",
    systemdUnit: "/etc/systemd/system/tisly-server.service",
    nginxConf: "/etc/nginx/sites-available/tisly.jp",
    envTemplate: "/opt/tisly/server/.env.production.example",
    oneBlock: VPS_PRODUCTION_START_ONE_BLOCK,
    note:
      "正式 .env テンプレートは server/.env.production.example。ルート .env.production.example は参照用。",
  };
}

export function buildDeployRehearsalChecklist(
  source: NodeJS.ProcessEnv = process.env
): DeployRehearsalChecklistReport {
  const dryRun = buildDeployDryRun(source, { includeReleaseGate: true });
  const releaseGate = buildReleaseGateInfo(dryRun);
  const readiness = buildProductionReadiness({ ...dryRun, releaseGate });
  const layout = buildDeployLayoutAudit();
  const preflight = buildDeployPreflight(source);
  const security = buildSecurityRehearsalAudit(source);
  const pwaAudit = buildPwaInstallAudit();

  const buildItem = readiness.items.find((i) => i.id === "build");
  const testItem = readiness.items.find((i) => i.id === "test");
  const buildReady = buildItem?.status === "pass";
  const testReady = testItem?.status === "pass";
  const gateReady = releaseGate.status === "pass" || dryRun.passed;
  const githubReady = layout.verdict === "READY";
  const securityReady =
    security.verdict === "READY" &&
    dryRun.secretLeakCheck?.passed !== false;
  const envSet = preflight.ready;
  const vpsDeployed = isSystemdActive();
  const sslReady = isSslReadyOnVps();
  const pwaReady = pwaAudit.readyCount === pwaAudit.totalPwa && pwaAudit.totalPwa > 0;

  const statusRows: RehearsalStatusRow[] = [
    {
      id: "github",
      label: "GitHub",
      displayLabel: githubReady ? "GitHub READY" : "GitHub NOT READY",
      status: githubReady ? "ready" : "not_ready",
      message: githubReady
        ? `レイアウト ${layout.readyCount}/${layout.totalRequired} 必須ファイル`
        : `不足: ${layout.checks.filter((c) => c.required && !c.exists).map((c) => c.label).join(", ") || "—"}`,
    },
    {
      id: "build",
      label: "Build",
      displayLabel: buildReady ? "Build READY" : "Build NOT READY",
      status: buildReady ? "ready" : "not_ready",
      message: buildItem?.message || "—",
    },
    {
      id: "test",
      label: "Test",
      displayLabel: testReady ? "Test READY" : "Test NOT READY",
      status: testReady ? "ready" : "not_ready",
      message: testItem?.message || "—",
    },
    {
      id: "release_gate",
      label: "Release Gate",
      displayLabel: gateReady ? "Release Gate READY" : "Release Gate NOT READY",
      status: gateReady ? "ready" : "not_ready",
      message: releaseGate.message || (gateReady ? "release:gate PASS" : "release:gate 未合格"),
    },
    {
      id: "security",
      label: "Security",
      displayLabel: securityReady ? "Security READY" : "Security NOT READY",
      status: securityReady ? "ready" : "not_ready",
      message: securityReady
        ? "秘密漏洩なし · 必須シークレット設定済み"
        : security.blockingItems.slice(0, 3).join(" · ") || security.verdict,
    },
    {
      id: "env",
      label: "Env",
      displayLabel: envSet ? "Env SET" : "Env NOT SET",
      status: envSet ? "set" : "not_set",
      message: envSet
        ? "preflight 合格 — 本番 .env 設定済み"
        : `不足 ${preflight.missing.length} 件 — VPS 投入前に .env を完成させる`,
    },
    {
      id: "vps",
      label: "VPS",
      displayLabel: vpsDeployed ? "VPS DEPLOYED" : "VPS NOT DEPLOYED",
      status: vpsDeployed ? "deployed" : "not_deployed",
      message: vpsDeployed
        ? "tisly-server active — 本番 VPS 稼働中"
        : "ローカル / 未投入 — リハーサルモード",
    },
    {
      id: "ssl",
      label: "SSL",
      displayLabel: sslReady ? "SSL READY" : "SSL NOT CHECKED",
      status: sslReady ? "checked" : "not_checked",
      message: sslReady
        ? "certbot / nginx SSL 設定あり"
        : "VPS 投入後に certbot で確認",
    },
    {
      id: "pwa",
      label: "PWA",
      displayLabel: `PWA installReady ${pwaAudit.readyCount}/${pwaAudit.totalPwa}`,
      status: pwaReady ? "ready" : "not_ready",
      message: `${pwaAudit.readyCount}/${pwaAudit.totalPwa} installReady`,
    },
  ];

  const envChecklist = buildEnvChecklist(source);

  const rehearsalReady =
    githubReady &&
    buildReady &&
    testReady &&
    gateReady &&
    securityReady;

  return {
    phase: "1801-1840",
    title: "VPS Production Start Command Finalize",
    generatedAt: new Date().toISOString(),
    rehearsalReady,
    rehearsalReadyLabel: rehearsalReady ? "REHEARSAL READY" : "REHEARSAL NOT READY",
    statusRows,
    envChecklist,
    vpsCommands: VPS_DEPLOY_COMMAND_STEPS,
    productionStart: buildProductionStartInfo(),
    pwaInstallReady: {
      ready: pwaAudit.readyCount,
      total: pwaAudit.totalPwa,
      label: `${pwaAudit.readyCount}/${pwaAudit.totalPwa} installReady`,
    },
  };
}
