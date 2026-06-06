/**
 * Phase 1921–1960 — Production Launch Verification & Browser Test
 * （Phase 1881–1920 本番起動後の確認手順を拡張）
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

export interface VpsFailureBranch {
  id: string;
  symptom: string;
  likelyCause: string;
  checkCommands: string[];
  fix: string;
}

export interface ProductionLaunchGuide {
  phase: string;
  title: string;
  sectionA_now: string;
  sectionB_vpsCommands: string;
  sectionC_envExample: string;
  sectionD_success: string;
  sectionE_failure: string;
  sectionF_urls: string[];
  envPrepBlock: string[];
  startBlock: string[];
  verifyBlock: string[];
  failureBranches: VpsFailureBranch[];
}

export interface ProductionVerificationGuide {
  phase: string;
  title: string;
  sectionA_urls: string[];
  sectionB_success: string;
  sectionC_failure: string;
  sectionD_nextPhase: string;
  gitPullStartBlock: string[];
  postDeployVerifyBlock: string[];
  checklistStatusVerifyBlock: string[];
  browserTestUrls: { path: string; label: string; priority: number }[];
  failureBranches: VpsFailureBranch[];
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
  productionLaunch: ProductionLaunchGuide;
  productionVerification: ProductionVerificationGuide;
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

/** .env 準備（秘密生成 · プレースホルダのみ · VNC 用） */
export const VPS_ENV_PREP_ONE_BLOCK: string[] = [
  "cd /opt/tisly/server",
  "test -f .env || cp .env.production.example .env && chmod 600 .env",
  "# JWT_SECRET（出力を .env の JWT_SECRET= に貼り付け）",
  "openssl rand -base64 48",
  "# INGEST_SECRET（JWT と別値）",
  "openssl rand -base64 48",
  "# DEPLOY_OPS_TOKEN",
  "openssl rand -hex 32",
  "# ADMIN_PASSWORD_HASH（build 後 · 'YOUR_STRONG_PASSWORD' を自分の強力なパスワードに置換）",
  "npm run build",
  "node -e \"import { hashPassword } from './dist/auth/password.js'; console.log(hashPassword(process.argv[1]));\" 'YOUR_STRONG_PASSWORD'",
  "nano .env",
  "# 必須: JWT_SECRET · ADMIN_PASSWORD_HASH · INGEST_SECRET · DEPLOY_OPS_TOKEN · NODE_ENV=production · TISLY_PUBLIC_URL=https://tisly.jp",
];

/** VNC コンソールへ貼る本番起動コマンド（.env 完了後 · 1 ブロック） */
export const VPS_PRODUCTION_START_ONE_BLOCK: string[] = [
  "cd /opt/tisly",
  "bash scripts/vps-production-start.sh",
];

/** 手動起動（スクリプト不可時の代替 · 秘密値なし） */
export const VPS_PRODUCTION_START_MANUAL_BLOCK: string[] = [
  "cd /opt/tisly/server",
  "test -f .env && grep -qE '^JWT_SECRET=.+$' .env && grep -qE '^ADMIN_PASSWORD_HASH=.+$' .env && grep -qE '^INGEST_SECRET=.+$' .env && grep -qE '^DEPLOY_OPS_TOKEN=.+$' .env || { echo '✋ .env 未完了 — docs/env_fill_in_guide.md を参照'; exit 1; }",
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
];

/** git pull 後の本番起動（.env 入力済み · Phase 1881–1920） */
export const VPS_GIT_PULL_START_ONE_BLOCK: string[] = [
  "cd /opt/tisly && git pull && test -f scripts/vps-production-start.sh || { echo \"ERROR: scripts/vps-production-start.sh なし — git remote/branch を確認\"; ls -la scripts/ 2>/dev/null; exit 1; } && bash scripts/vps-production-start.sh",
];

/** 起動後の確認コマンド（Phase 1961–2000） */
export const VPS_PRODUCTION_VERIFY_ONE_BLOCK: string[] = [
  "systemctl is-active tisly-server",
  "curl -s http://127.0.0.1:3080/api/health",
  "nginx -t",
  "curl -sI https://tisly.jp/app | head -5",
  "curl -sI https://tisly.jp/deployment/checklist | head -3",
];

/** /deployment/checklist ステータス行の VPS / SSL / PWA 確認（VPS 上） */
export const VPS_CHECKLIST_STATUS_VERIFY_BLOCK: string[] = [
  "curl -s https://tisly.jp/api/deploy/rehearsal-checklist | grep -E '\"id\":\"(vps|ssl|pwa)\"' -A3",
  "# 期待: vps → displayLabel VPS DEPLOYED · status deployed",
  "# 期待: ssl → displayLabel SSL READY · status checked",
  "# 期待: pwa → displayLabel PWA installReady N/N · status ready",
  "curl -s https://tisly.jp/api/health",
  "curl -s https://tisly.jp/api/deploy/preflight | head -c 300",
];

/** 9 URL 一括 HTTP 確認（PC または VPS） */
export const VPS_BROWSER_SMOKE_ONE_BLOCK: string[] = [
  "BASE=https://tisly.jp",
  "for path in /app /survey /business /sales /customer/TOMS001 /customer/TOMS001/pro-remote /customer/TOMS001/install/home /tv/TOMS001 /deployment/checklist; do",
  "  code=$(curl -sI -o /dev/null -w \"%{http_code}\" \"${BASE}${path}\")",
  "  echo \"${path} → HTTP ${code}\"",
  "done",
];

/** 失敗時の分岐表 */
export const VPS_FAILURE_BRANCHES: VpsFailureBranch[] = [
  {
    id: "env_missing",
    symptom: "スクリプトが .env 不足で exit 1",
    likelyCause: "JWT_SECRET / ADMIN_PASSWORD_HASH / INGEST_SECRET / DEPLOY_OPS_TOKEN 等が空",
    checkCommands: [
      "cd /opt/tisly/server && bash ../scripts/vps-first-deploy-check.sh",
      "grep -E '^(JWT_SECRET|ADMIN_PASSWORD_HASH|INGEST_SECRET|DEPLOY_OPS_TOKEN)=' .env | sed 's/=.*/=***/'",
    ],
    fix: "VPS_ENV_PREP_ONE_BLOCK の openssl / hashPassword を実行し nano .env で必須項目を埋めてから再実行",
  },
  {
    id: "port_3080_down",
    symptom: "curl http://127.0.0.1:3080/api/health が失敗 · systemctl inactive",
    likelyCause: "Node 起動エラー · .env 構文 · 権限 · dist 未ビルド",
    checkCommands: [
      "systemctl status tisly-server",
      "journalctl -u tisly-server -n 80 --no-pager",
      "ss -tlnp | grep 3080",
      "test -f /opt/tisly/server/dist/index.js && echo dist OK",
    ],
    fix: "journalctl のエラーを修正 → cd /opt/tisly/server && npm run build && systemctl restart tisly-server",
  },
  {
    id: "nginx_error",
    symptom: "nginx -t が syntax error / failed",
    likelyCause: "設定ファイル破損 · 別サイトとの server_name 競合",
    checkCommands: [
      "nginx -t",
      "ls -la /etc/nginx/sites-enabled/",
      "cat /etc/nginx/sites-available/tisly.jp | head -40",
    ],
    fix: "cp /opt/tisly/server/deploy/nginx/tisly.jp.conf /etc/nginx/sites-available/tisly.jp && nginx -t && systemctl reload nginx",
  },
  {
    id: "certbot_missing",
    symptom: "https://tisly.jp が接続不可 · curl -I https が失敗",
    likelyCause: "certbot 未実施 · DNS 未反映 · ファイアウォール",
    checkCommands: [
      "certbot certificates",
      "curl -sI http://tisly.jp/app | head -5",
      "ufw status",
    ],
    fix: "certbot --nginx -d tisly.jp -d www.tisly.jp を実行（メール・規約同意）→ nginx -t && systemctl reload nginx",
  },
  {
    id: "bad_gateway_502",
    symptom: "ブラウザで 502 Bad Gateway · nginx は動くが API が死んでいる",
    likelyCause: "tisly-server 停止 · 3080 未リッスン · upstream タイムアウト",
    checkCommands: [
      "systemctl is-active tisly-server",
      "curl -s http://127.0.0.1:3080/api/health",
      "journalctl -u tisly-server -n 50 --no-pager",
    ],
    fix: "systemctl restart tisly-server → localhost health OK を確認してから nginx reload",
  },
];

/** .env 入力例（実値なし · プレースホルダのみ） */
export const PRODUCTION_ENV_EXAMPLE_PLACEHOLDER = `# --- 必須（✋ 智紀さんが入力） ---
NODE_ENV=production
TISLY_PUBLIC_URL=https://tisly.jp

# JWT_SECRET ← openssl rand -base64 48
JWT_SECRET=ここに入れる
# ADMIN_PASSWORD_HASH ← hashPassword（scrypt:... 形式）
ADMIN_PASSWORD_HASH=ここに入れる
# INGEST_SECRET ← openssl rand -base64 48（JWT と別値）
INGEST_SECRET=ここに入れる
# DEPLOY_OPS_TOKEN ← openssl rand -hex 32
DEPLOY_OPS_TOKEN=ここに入れる

# --- 初回公開は mock 安全値（テンプレのまま可） ---
PORT=3080
TISLY_PORT=3080
DB_PROVIDER=sqlite
MQTT_MODE=mock
MQTT_MOCK_MODE=true
SHELLY_MODE=mock
QNAP_MODE=mock
GMAIL_SEND_MODE=mock
DEMO_RESET_ENABLED=false
ADMIN_USERNAME=admin`;

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
    id: "env_prep",
    title: ".env 準備（秘密生成 · プレースホルダのみ）",
    commands: VPS_ENV_PREP_ONE_BLOCK,
    note: "✋ openssl 出力と hashPassword 出力を nano .env に貼り付け。詳細 docs/vps_phase1841_launch.md",
  },
  {
    id: "git_pull_start",
    title: "git pull + 本番起動（.env 入力済み · 1 ブロック）",
    commands: VPS_GIT_PULL_START_ONE_BLOCK,
    note: "Phase 1881–1920。scripts/vps-production-start.sh が GitHub 上に存在することを git pull で確認してから起動します。",
  },
  {
    id: "production_start",
    title: "本番起動（.env 完了後 · 1 ブロック）",
    commands: VPS_PRODUCTION_START_ONE_BLOCK,
    note:
      "起動方式は systemd（公式）。PM2 は代替のみ。scripts/vps-production-start.sh が build · release:gate · db:init · systemd · nginx まで実行します。",
  },
  {
    id: "production_verify",
    title: "起動後確認",
    commands: VPS_PRODUCTION_VERIFY_ONE_BLOCK,
    note: "すべて OK なら https://tisly.jp/app をブラウザで開く",
  },
  {
    id: "checklist_status_verify",
    title: "チェックリスト VPS / SSL / PWA 確認",
    commands: VPS_CHECKLIST_STATUS_VERIFY_BLOCK,
    note: "/deployment/checklist の Rehearsal グリッドで VPS DEPLOYED · SSL READY · PWA installReady が緑になることを確認",
  },
  {
    id: "browser_smoke",
    title: "9 URL 一括スモーク",
    commands: VPS_BROWSER_SMOKE_ONE_BLOCK,
    note: "各 path が HTTP 200（または 301→200）であること。詳細 docs/vps_phase1921_launch.md",
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
      "正式 .env テンプレートは server/.env.production.example。.env 完了後に bash scripts/vps-production-start.sh を 1 回実行。",
  };
}

export const PRODUCTION_BROWSER_TEST_URLS: { path: string; label: string; priority: number }[] = [
  { path: "/app", label: "App Hub（最優先）", priority: 1 },
  { path: "/deployment/checklist", label: "本番公開チェックリスト", priority: 2 },
  { path: "/api/health", label: "API Health", priority: 3 },
  { path: "/survey", label: "現調 PWA", priority: 4 },
  { path: "/business", label: "TOMS Business", priority: 5 },
  { path: "/sales", label: "営業デモ", priority: 6 },
  { path: "/customer/TOMS001", label: "顧客ポータル", priority: 7 },
  { path: "/customer/TOMS001/pro-remote", label: "PRO Remote", priority: 8 },
  { path: "/customer/TOMS001/install/home", label: "施工 PWA", priority: 9 },
  { path: "/tv/TOMS001", label: "Google TV Web", priority: 10 },
];

export function buildProductionVerificationGuide(): ProductionVerificationGuide {
  const failureTable = VPS_FAILURE_BRANCHES.map(
    (b) =>
      `| ${b.symptom} | ${b.likelyCause} | ${b.checkCommands.join(" · ")} | ${b.fix} |`,
  ).join("\n");

  return {
    phase: "1921-1960",
    title: "Production Launch Verification & Browser Test",
    sectionA_urls: PRODUCTION_BROWSER_TEST_URLS.map(
      (u) => `https://tisly.jp${u.path} — ${u.label}`,
    ),
    sectionB_success: [
      "スクリプト末尾: [TiSLY start] === 本番起動完了 ===",
      "systemctl is-active tisly-server → active",
      'curl -s http://127.0.0.1:3080/api/health → {"ok":true,...}',
      "curl -sI https://tisly.jp/app → HTTP/2 200（または 304）",
      "/deployment/checklist Rehearsal グリッド: VPS DEPLOYED · SSL READY · PWA installReady N/N（緑）",
      "9 URL 一覧: すべて HTTP 200 · 白画面なし · コンソールに連続 500 なし",
      "https://tisly.jp/app: App Hub · Production Readiness カードが表示される",
    ].join("\n"),
    sectionC_failure: [
      "| 症状 | 原因 | 確認 | 対処 |",
      "|------|------|------|------|",
      failureTable,
    ].join("\n"),
    sectionD_nextPhase: [
      "Phase 1961–2000: iPhone Safari / Android Chrome で PWA 追加・standalone 起動の実機確認",
      "Phase 1961–2000: Google TV ブラウザで /tv/TOMS001 のリモコン操作確認",
      "初回顧客トライアル: docs/first_customer_trial_runbook.md",
      "監視: journalctl -u tisly-server -f · certbot renew --dry-run の定期確認",
      "real 連携切替計画: MQTT / QNAP / Gmail（mock → real）は別フェーズで実施",
    ].join("\n"),
    gitPullStartBlock: VPS_GIT_PULL_START_ONE_BLOCK,
    postDeployVerifyBlock: VPS_PRODUCTION_VERIFY_ONE_BLOCK,
    checklistStatusVerifyBlock: VPS_CHECKLIST_STATUS_VERIFY_BLOCK,
    browserTestUrls: PRODUCTION_BROWSER_TEST_URLS,
    failureBranches: VPS_FAILURE_BRANCHES,
  };
}

export function buildProductionLaunchGuide(): ProductionLaunchGuide {
  const envPrep = VPS_ENV_PREP_ONE_BLOCK.join("\n");
  const start = VPS_GIT_PULL_START_ONE_BLOCK.join("\n");
  const verify = VPS_PRODUCTION_VERIFY_ONE_BLOCK.join("\n");
  const failureTable = VPS_FAILURE_BRANCHES.map(
    (b) =>
      `| ${b.symptom} | ${b.likelyCause} | ${b.checkCommands.join(" · ")} | ${b.fix} |`,
  ).join("\n");

  return {
    phase: "1921-1960",
    title: "Production Launch Verification & Browser Test",
    sectionA_now: [
      "1. VNC コンソールで root ログイン（/opt/tisly · .env 入力済み）",
      "2. git pull + 本番起動: bash scripts/vps-production-start.sh（A ブロック 1 行）",
      "3. 起動後確認: systemctl · journalctl · nginx · curl health",
      "4. SSL 未設定なら certbot --nginx -d tisly.jp -d www.tisly.jp",
      "5. https://tisly.jp/deployment/checklist を開き「再確認」",
      "6. VPS DEPLOYED · SSL READY · PWA installReady が緑であることを確認",
      "7. 最優先 https://tisly.jp/app をブラウザで開く",
    ].join("\n"),
    sectionB_vpsCommands: [
      "## .env 準備",
      envPrep,
      "",
      "## 本番起動（.env 完了後）",
      start,
      "",
      "## 起動後確認",
      verify,
      "",
      "## SSL 未設定時のみ",
      "certbot --nginx -d tisly.jp -d www.tisly.jp",
    ].join("\n"),
    sectionC_envExample: PRODUCTION_ENV_EXAMPLE_PLACEHOLDER,
    sectionD_success: [
      "systemctl is-active tisly-server → active",
      'curl -s http://127.0.0.1:3080/api/health → {"ok":true,...}',
      "nginx -t → syntax is ok · test is successful",
      "curl -sI https://tisly.jp/app → HTTP/2 200（または 304）",
      "/deployment/checklist Rehearsal: VPS DEPLOYED · SSL READY · PWA installReady N/N が緑",
    ].join("\n"),
    sectionE_failure: [
      "| 症状 | 原因 | 確認 | 対処 |",
      "|------|------|------|------|",
      failureTable,
    ].join("\n"),
    sectionF_urls: PRODUCTION_BROWSER_TEST_URLS.map((u) => `https://tisly.jp${u.path}`),
    envPrepBlock: VPS_ENV_PREP_ONE_BLOCK,
    startBlock: VPS_GIT_PULL_START_ONE_BLOCK,
    verifyBlock: VPS_PRODUCTION_VERIFY_ONE_BLOCK,
    failureBranches: VPS_FAILURE_BRANCHES,
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
    phase: "1921-1960",
    title: "Production Launch Verification & Browser Test",
    generatedAt: new Date().toISOString(),
    rehearsalReady,
    rehearsalReadyLabel: rehearsalReady ? "REHEARSAL READY" : "REHEARSAL NOT READY",
    statusRows,
    envChecklist,
    vpsCommands: VPS_DEPLOY_COMMAND_STEPS,
    productionStart: buildProductionStartInfo(),
    productionLaunch: buildProductionLaunchGuide(),
    productionVerification: buildProductionVerificationGuide(),
    pwaInstallReady: {
      ready: pwaAudit.readyCount,
      total: pwaAudit.totalPwa,
      label: `${pwaAudit.readyCount}/${pwaAudit.totalPwa} installReady`,
    },
  };
}
