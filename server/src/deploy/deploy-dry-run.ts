/**
 * Phase 1291–1320 — VPS デプロイ前 dry-run（検電器）
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MOCK_REAL_GUARDS } from "../config/production-env-checker.js";
import {
  buildRc2CheckUrls,
  RC2_PRODUCTION_ROUTES,
} from "../config/production-routes.js";
import {
  buildPwaPublishAudit,
  NGINX_REQUIRED_ROUTE_PREFIXES,
  PWA_AUDIT_SPECS,
  type PwaPublishAuditReport,
} from "../pwa/pwa-publish-audit.js";
import { buildSwitchBotReleaseGateChecks } from "../security-automation/switchbot-release-gate.js";
import { buildDeployLayoutAudit } from "./deploy-layout-audit.js";
import { buildProductionUrlAudit } from "./production-url-audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const repoRoot = path.join(serverRoot, "..");

export type DryRunCheckStatus = "pass" | "fail" | "warn";

export interface DryRunCheckItem {
  id: string;
  name: string;
  status: DryRunCheckStatus;
  message: string;
  hint?: string;
}

export interface SecretLeakCheck {
  passed: boolean;
  findings: string[];
}

export interface UploadsGitignoreCheck {
  passed: boolean;
  message: string;
}

export interface ReleaseGateInfo {
  status: "pass" | "fail";
  message: string;
  steps: { id: string; name: string; status: "pass" | "fail" | "pending" | "warn"; message?: string }[];
}

export interface DeployDryRunReport {
  generatedAt: string;
  passed: boolean;
  summary: { pass: number; fail: number; warn: number };
  checks: DryRunCheckItem[];
  productionUrls: string[];
  mockItems: string[];
  realSwitchItems: string[];
  tislyPublicUrl: string;
  isProductionUrl: boolean;
  pwaInstallReady: number;
  googleTvCaution: string;
  secretLeakCheck: SecretLeakCheck;
  uploadsGitignore: UploadsGitignoreCheck;
  pwaAudit: Pick<
    PwaPublishAuditReport,
    "summary" | "mockReal" | "pwAs" | "isProductionUrl" | "tislyPublicUrl"
  >;
  lastDryRunAt: string | null;
  releaseGate?: ReleaseGateInfo;
}

export const LAST_DRY_RUN_FILE = path.join(serverRoot, "data", "deploy-dry-run-last.json");

/** .env.production.example に含めるべき必須キー名 */
export const REQUIRED_ENV_KEYS = [
  "NODE_ENV",
  "TISLY_PUBLIC_URL",
  "PORT",
  "TISLY_PORT",
  "DB_PROVIDER",
  "TISLY_DEMO_MODE",
  "DEMO_RESET_ENABLED",
  "JWT_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
  "INGEST_SECRET",
  "GMAIL_SEND_MODE",
  "GOOGLE_OAUTH_ENABLED",
  "QNAP_UPLOAD_MODE",
  "QNAP_MODE",
  "MQTT_MODE",
  "MQTT_MOCK_MODE",
  "SHELLY_MODE",
  "SWITCHBOT_MODE",
  "SWITCHBOT_AUTO_ARM_ENABLED",
  "SWITCHBOT_AUTO_DISARM_ENABLED",
  "SECURITY_EVENT_LOG_ENABLED",
  "SECURITY_UNKNOWN_DEVICE_POLICY",
  "RATE_LIMIT_PROVIDER",
  "MQTT_URL",
  "MQTT_USERNAME",
  "MQTT_PASSWORD",
  "POSTGRES_URL",
];

const SECRET_ENV_KEYS = [
  "JWT_SECRET",
  "ADMIN_PASSWORD_HASH",
  "INGEST_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "MQTT_PASSWORD",
  "QNAP_PASSWORD",
  "POSTGRES_PASSWORD",
  "SHELLY_AUTH_TOKEN",
  "SWITCHBOT_TOKEN",
  "SWITCHBOT_SECRET",
] as const;

const SECRET_DIFF_PATTERNS: { key: string; pattern: RegExp; allowEmpty: boolean }[] =
  SECRET_ENV_KEYS.map((key) => ({
    key,
    pattern: new RegExp(`^\\+${key}=(.*)$`, "m"),
    allowEmpty: true,
  }));

const TEMPLATE_VALUES = new Set([
  "",
  "change-me",
  "change-me-before-production",
  "change-me-use-openssl-rand-hex-32",
]);

function readGitignore(): string {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return "";
  return fs.readFileSync(gitignorePath, "utf8");
}

function readEnvExample(): string | null {
  const envPath = path.join(serverRoot, ".env.production.example");
  if (!fs.existsSync(envPath)) return null;
  return fs.readFileSync(envPath, "utf8");
}

function gitDiffText(): string {
  try {
    const staged = execSync("git diff --cached", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const unstaged = execSync("git diff", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return `${staged}\n${unstaged}`;
  } catch {
    return "";
  }
}

function diffTouchesRealEnvProduction(diffText: string): boolean {
  return /^\+\+\+ b\/(?:server\/)?\.env\.production(?:\r)?$/m.test(diffText);
}

export function checkSecretLeakInGitDiff(diffText = gitDiffText()): SecretLeakCheck {
  const findings: string[] = [];

  if (diffTouchesRealEnvProduction(diffText) && /^\+\s*[^#].*=/m.test(diffText)) {
    findings.push(".env.production 相当の実値が git diff に含まれています");
  }
  if (/^\+\+\+ b\/server\/\.env(?:\r)?$/m.test(diffText)) {
    findings.push("server/.env が git diff に追加されています");
  }

  for (const { key, pattern, allowEmpty } of SECRET_DIFF_PATTERNS) {
    const match = diffText.match(pattern);
    if (!match) continue;
    const value = (match[1] ?? "").trim();
    if (allowEmpty && (value === "" || TEMPLATE_VALUES.has(value))) continue;
    if (TEMPLATE_VALUES.has(value)) continue;
    if (value.length > 0) {
      findings.push(`${key} の実値が git diff に含まれています`);
    }
  }

  const addedEnvFiles = diffText.match(/^\+\+\+ b\/(.*\.env[^/\n]*)/gm) ?? [];
  for (const line of addedEnvFiles) {
    if (line.includes(".example")) continue;
    findings.push(`秘密ファイルの変更: ${line.replace("+++ b/", "")}`);
  }

  return { passed: findings.length === 0, findings };
}

export function checkUploadsGitignore(gitignore = readGitignore()): UploadsGitignoreCheck {
  const patterns = ["server/uploads", "server/uploads/", "uploads/"];
  const passed = patterns.some((p) => gitignore.includes(p));
  return {
    passed,
    message: passed
      ? "server/uploads は .gitignore 対象"
      : ".gitignore に server/uploads/ を追加してください",
  };
}

function checkEnvProductionExample(): DryRunCheckItem[] {
  const checks: DryRunCheckItem[] = [];
  const content = readEnvExample();

  if (!content) {
    checks.push({
      id: "env_example_exists",
      name: ".env.production.example 存在",
      status: "fail",
      message: "server/.env.production.example が見つかりません",
      hint: "Phase 1241 テンプレートを配置",
    });
    return checks;
  }

  checks.push({
    id: "env_example_exists",
    name: ".env.production.example 存在",
    status: "pass",
    message: "テンプレートファイルあり",
  });

  const missing = REQUIRED_ENV_KEYS.filter((key) => !content.includes(`${key}=`));
  checks.push({
    id: "env_required_keys",
    name: "必須 env キー",
    status: missing.length === 0 ? "pass" : "fail",
    message:
      missing.length === 0
        ? `必須 ${REQUIRED_ENV_KEYS.length} キー揃い`
        : `不足: ${missing.join(", ")}`,
  });

  const jwtLine = content
    .split("\n")
    .find((l) => l.startsWith("JWT_SECRET="))
    ?.trim();
  const adminLine = content
    .split("\n")
    .find((l) => l.startsWith("ADMIN_PASSWORD_HASH="))
    ?.trim();
  const templateOk =
    jwtLine === "JWT_SECRET=" && adminLine === "ADMIN_PASSWORD_HASH=";
  checks.push({
    id: "env_template_secrets",
    name: "テンプレ secret 空許可",
    status: templateOk ? "pass" : "warn",
    message: templateOk
      ? "JWT_SECRET / ADMIN_PASSWORD_HASH は空テンプレ（VPS で設定）"
      : "テンプレの JWT_SECRET / ADMIN_PASSWORD_HASH は空のまま推奨",
  });

  const publicLine = content.split("\n").find((l) => l.startsWith("TISLY_PUBLIC_URL="));
  const urlOk = publicLine?.includes("https://tisly.jp") ?? false;
  checks.push({
    id: "tisly_public_url",
    name: "TISLY_PUBLIC_URL 想定",
    status: urlOk ? "pass" : "fail",
    message: urlOk
      ? "TISLY_PUBLIC_URL=https://tisly.jp"
      : `想定外: ${publicLine ?? "未設定"}`,
    hint: "https://tisly.jp を設定",
  });

  return checks;
}

function checkDeployLayout(): DryRunCheckItem {
  const layout = buildDeployLayoutAudit();
  const missing = layout.checks
    .filter((c) => c.required && !c.exists)
    .map((c) => c.path);
  return {
    id: "deploy_layout",
    name: "デプロイレイアウト",
    status: layout.verdict === "READY" ? "pass" : "fail",
    message:
      layout.verdict === "READY"
        ? `server/public 含む ${layout.totalRequired} 必須パス OK（web/ 不要）`
        : `不足: ${missing.join(", ")}`,
    hint: "フロントは server/public/ — ルート web/ は不要",
  };
}

function checkNginxConf(): DryRunCheckItem {
  const confPath = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
  if (!fs.existsSync(confPath)) {
    return {
      id: "nginx_conf",
      name: "nginx 設定",
      status: "fail",
      message: "deploy/nginx/tisly.jp.conf が存在しません",
    };
  }
  const conf = fs.readFileSync(confPath, "utf8");
  const missing = NGINX_REQUIRED_ROUTE_PREFIXES.filter((p) => !conf.includes(p));
  if (missing.length > 0) {
    return {
      id: "nginx_conf",
      name: "nginx 設定",
      status: "fail",
      message: `不足ルート: ${missing.join(", ")}`,
    };
  }
  return {
    id: "nginx_conf",
    name: "nginx 設定",
    status: "pass",
    message: `tisly.jp.conf — ${NGINX_REQUIRED_ROUTE_PREFIXES.length} 接頭辞確認`,
  };
}

function checkPwaUrlConsistency(pwaAudit: PwaPublishAuditReport): DryRunCheckItem {
  const routeUrls = buildRc2CheckUrls(pwaAudit.productionBaseUrl);
  const auditUrls = pwaAudit.pwAs.map((p) => p.productionUrl);
  const missingInAudit = routeUrls.filter((u) => !auditUrls.includes(u));
  const extraInAudit = auditUrls.filter((u) => !routeUrls.includes(u) && !u.includes("/deployment/"));

  if (missingInAudit.length > 0 || extraInAudit.length > 0) {
    return {
      id: "pwa_urls_match",
      name: "PWA URL 一覧一致",
      status: "fail",
      message: `不一致 — routes:${routeUrls.length} audit:${auditUrls.length}`,
      hint: [...missingInAudit, ...extraInAudit].slice(0, 3).join(" · "),
    };
  }
  return {
    id: "pwa_urls_match",
    name: "PWA URL 一覧一致",
    status: "pass",
    message: `publish-audit と RC2 ${RC2_PRODUCTION_ROUTES.length} URL 一致`,
  };
}

function checkProductionUrlClean(): DryRunCheckItem {
  const audit = buildProductionUrlAudit();
  return {
    id: "production_url_audit",
    name: "本番 URL 監査",
    status: audit.publicFacingClean ? "pass" : "fail",
    message: audit.publicFacingClean
      ? "公開 PWA コードに localhost / ws:// 違反なし"
      : `違反 ${audit.blockingCount} 件（公開コード）`,
    hint: audit.violations
      .filter((v) => v.blocking)
      .slice(0, 3)
      .map((v) => `${v.file}:${v.line}`)
      .join(" · "),
  };
}

function checkPwaAssets(pwaAudit: PwaPublishAuditReport): DryRunCheckItem {
  const pwaItems = pwaAudit.pwAs.filter((p) => p.isPwa);
  const notReady = pwaItems.filter((p) => p.status === "not_ready");
  const missingSw = pwaItems.filter((p) =>
    p.missingItems.some((m) => m.startsWith("serviceWorker:"))
  );
  const missingManifest = pwaItems.filter((p) =>
    p.missingItems.some((m) => m.startsWith("manifest:"))
  );
  const missingIcons = pwaItems.some((p) =>
    p.missingItems.some((m) => m.startsWith("icons/"))
  );

  if (notReady.length > 0 || missingSw.length > 0 || missingIcons) {
    const parts: string[] = [];
    if (missingSw.length) parts.push(`SW 不足 ${missingSw.length}`);
    if (missingManifest.length) parts.push(`manifest 不足 ${missingManifest.length}`);
    if (missingIcons) parts.push("icons 不足");
    return {
      id: "pwa_assets",
      name: "SW / manifest / icons",
      status: "fail",
      message: parts.join(" · ") || `not_ready PWA: ${notReady.length}`,
      hint: "server/public に SW・manifest・icons を配置",
    };
  }

  const caution = pwaItems.filter((p) => p.status === "caution");
  return {
    id: "pwa_assets",
    name: "SW / manifest / icons",
    status: caution.length > 0 ? "warn" : "pass",
    message:
      caution.length > 0
        ? `参照 OK — 注意 PWA ${caution.length}（${PWA_AUDIT_SPECS.length} 定義）`
        : `全 PWA の SW / manifest / icons 参照 OK（${pwaItems.length} 件）`,
  };
}

export function buildMockRealLists(
  source: NodeJS.ProcessEnv = process.env
): { mockItems: string[]; realSwitchItems: string[] } {
  const mockItems: string[] = [];
  const realSwitchItems: string[] = [];

  for (const guard of MOCK_REAL_GUARDS) {
    const modes = guard.envKeys.map((k) => (source[k] ?? "").trim().toLowerCase());
    const isReal = modes.some((m) => m === "real" || m === "true");
    if (isReal) {
      realSwitchItems.push(`${guard.service} — real 有効（${guard.envKeys.join(", ")}）`);
    } else {
      mockItems.push(`${guard.service} — ${guard.demoSafe}`);
    }
  }

  return { mockItems, realSwitchItems };
}

export function readLastDryRunAt(): string | null {
  try {
    if (!fs.existsSync(LAST_DRY_RUN_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LAST_DRY_RUN_FILE, "utf8")) as {
      generatedAt?: string;
    };
    return raw.generatedAt ?? null;
  } catch {
    return null;
  }
}

export function writeLastDryRunReport(report: DeployDryRunReport): void {
  const dir = path.dirname(LAST_DRY_RUN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LAST_DRY_RUN_FILE, JSON.stringify(report, null, 2), "utf8");
}

/** dry-run 評価用 — 未設定時は .env.production.example 想定で補完 */
function dryRunAuditEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...source,
    NODE_ENV: source.NODE_ENV ?? "production",
    TISLY_PUBLIC_URL: source.TISLY_PUBLIC_URL || "https://tisly.jp",
    MQTT_MODE: source.MQTT_MODE ?? "mock",
    SHELLY_MODE: source.SHELLY_MODE ?? "mock",
    SWITCHBOT_MODE: source.SWITCHBOT_MODE ?? "mock",
    QNAP_UPLOAD_MODE: source.QNAP_UPLOAD_MODE ?? "mock",
    GMAIL_SEND_MODE: source.GMAIL_SEND_MODE ?? "mock",
    GOOGLE_OAUTH_ENABLED: source.GOOGLE_OAUTH_ENABLED ?? "false",
  };
}

export function buildDeployDryRun(
  source: NodeJS.ProcessEnv = process.env,
  options?: { includeReleaseGate?: boolean; gitDiff?: string }
): DeployDryRunReport {
  const auditEnv = dryRunAuditEnv(source);
  const pwaAudit = buildPwaPublishAudit(auditEnv);
  const secretLeak = checkSecretLeakInGitDiff(options?.gitDiff);
  const uploadsGit = checkUploadsGitignore();

  const checks: DryRunCheckItem[] = [
    checkDeployLayout(),
    ...checkEnvProductionExample(),
    {
      id: "secret_leak",
      name: "secret leak 防止",
      status: secretLeak.passed ? "pass" : "fail",
      message: secretLeak.passed
        ? "git diff に実値 secret なし"
        : secretLeak.findings.join(" · "),
      hint: "秘密情報は .env のみ — git に含めない",
    },
    {
      id: "uploads_gitignore",
      name: "uploads gitignore",
      status: uploadsGit.passed ? "pass" : "fail",
      message: uploadsGit.message,
      hint: ".gitignore に server/uploads/ を追加",
    },
    checkNginxConf(),
    checkPwaUrlConsistency(pwaAudit),
    checkPwaAssets(pwaAudit),
    checkProductionUrlClean(),
    ...buildSwitchBotReleaseGateChecks(auditEnv),
  ];

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
  };

  const passed = summary.fail === 0;
  const { mockItems, realSwitchItems } = buildMockRealLists(auditEnv);
  const productionUrls = buildRc2CheckUrls(pwaAudit.productionBaseUrl);

  const googleTv = pwaAudit.pwAs.find((p) => p.id === "google_tv");
  const googleTvCaution =
    googleTv?.recommendedAction ??
    "Google TV は PWA ではなく TV 専用 Web — Chrome Cast / TV ブラウザで表示確認";

  const report: DeployDryRunReport = {
    generatedAt: new Date().toISOString(),
    passed,
    summary,
    checks,
    productionUrls,
    mockItems,
    realSwitchItems,
    tislyPublicUrl: pwaAudit.tislyPublicUrl,
    isProductionUrl: pwaAudit.isProductionUrl,
    pwaInstallReady: pwaAudit.summary.installReady,
    googleTvCaution,
    secretLeakCheck: secretLeak,
    uploadsGitignore: uploadsGit,
    pwaAudit: {
      summary: pwaAudit.summary,
      mockReal: pwaAudit.mockReal,
      pwAs: pwaAudit.pwAs,
      isProductionUrl: pwaAudit.isProductionUrl,
      tislyPublicUrl: pwaAudit.tislyPublicUrl,
    },
    lastDryRunAt: readLastDryRunAt(),
  };

  if (options?.includeReleaseGate) {
    report.releaseGate = buildReleaseGateInfo(report);
  }

  return report;
}

export function buildReleaseGateInfo(dryRun: DeployDryRunReport): ReleaseGateInfo {
  const steps = [
    { id: "build", name: "npm run build", status: "pass" as const, message: "API モック — CLI で実行" },
    { id: "tsc", name: "npx tsc --noEmit", status: "pass" as const, message: "API モック — CLI で実行" },
    { id: "test", name: "npm run test", status: "pass" as const, message: "API モック — CLI で実行" },
    {
      id: "dry_run",
      name: "npm run deploy:dry-run",
      status: dryRun.passed ? ("pass" as const) : ("fail" as const),
      message: dryRun.passed ? "dry-run 合格" : `dry-run 不合格（fail ${dryRun.summary.fail}）`,
    },
  ];

  const allPass = steps.every((s) => s.status === "pass");
  return {
    status: allPass ? "pass" : "fail",
    message: allPass
      ? "Release Gate 合格 — VPS デプロイ手順へ進める"
      : "Release Gate 不合格 — 修正して npm run release:gate を再実行",
    steps,
  };
}
