/**
 * Phase 2381–2400 — 管理者パスワード復旧（ADMIN_PASSWORD_HASH=temp 検知 → RED）
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { isValidScryptPasswordHash, normalizeStoredPasswordHash, verifyPassword } from "../auth/password.js";
import { getRepoRoot, getServerRoot, getServerSrcDir } from "./server-paths.js";

const serverRoot = getServerRoot();
const repoRoot = getRepoRoot();
const serverSrcDir = getServerSrcDir();

export type ProductionCheckStatus = "GREEN" | "YELLOW" | "RED";

export interface ProductionCheckItem {
  id: string;
  label: string;
  ok: boolean;
  status?: ProductionCheckStatus;
  detail?: string;
}

export interface Phase2381ProductionReport {
  phase: "2381-2400";
  ready: boolean;
  shellVersion: string;
  shellTag: string;
  productionRatePercent: number;
  operationalReady: boolean;
  adminPasswordStatus: ProductionCheckStatus;
  implemented: string[];
  mockRemaining: string[];
  nextPhase: string;
  checks: ProductionCheckItem[];
}

function readText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

/** 実行時 .env の ADMIN_PASSWORD_HASH が平文 temp または scrypt 以外 */
export function isInsecureAdminPasswordHash(
  hash: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const value = normalizeStoredPasswordHash(hash ?? env.ADMIN_PASSWORD_HASH ?? "");
  if (!value) return true;
  if (value === "temp") return true;
  return !isValidScryptPasswordHash(value);
}

export function resolveAdminPasswordStatus(
  hash: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): { ok: boolean; status: ProductionCheckStatus; detail: string } {
  const value = normalizeStoredPasswordHash(hash ?? env.ADMIN_PASSWORD_HASH ?? "");
  if (!value) {
    return {
      ok: false,
      status: "RED",
      detail: "未設定 — docs/admin-password-recovery.md",
    };
  }
  if (value === "temp") {
    return {
      ok: false,
      status: "RED",
      detail: "ADMIN_PASSWORD_HASH=temp — docs/admin-password-recovery.md を実行",
    };
  }
  if (!value.startsWith("scrypt:")) {
    return {
      ok: false,
      status: "RED",
      detail: "平文または不正形式 — npm run hash:admin-password で scrypt 形式を生成",
    };
  }
  if (!isValidScryptPasswordHash(value)) {
    const parts = value.split(":");
    const hashLen = parts[2]?.length ?? 0;
    return {
      ok: false,
      status: "RED",
      detail: `scrypt ハッシュが不正（hash 部 ${hashLen}/128 文字）— npm run hash:admin-password を再実行`,
    };
  }
  return { ok: true, status: "GREEN", detail: "scrypt 形式（実行時 .env）" };
}

export function buildPhase2381ProductionCheck(
  env: NodeJS.ProcessEnv = process.env
): Phase2381ProductionReport {
  const packageJson = readText(path.join(serverRoot, "package.json")) ?? "";
  const hashScript = readText(path.join(serverRoot, "scripts/hash-admin-password.mjs")) ?? "";
  const adminAuth = readText(path.join(serverSrcDir, "auth/admin-auth.ts")) ?? "";
  const notificationsRoute = readText(path.join(serverSrcDir, "api/routes/notifications.ts")) ?? "";
  const recoveryDoc = readText(path.join(repoRoot, "docs/admin-password-recovery.md")) ?? "";
  const invalidHashRejected = !verifyPassword("temp", "temp");
  const runtimeAdmin = resolveAdminPasswordStatus(undefined, env);

  const checks: ProductionCheckItem[] = [
    {
      id: "admin-password-hash-runtime",
      label: "実行時 ADMIN_PASSWORD_HASH（temp / 平文禁止）",
      ok: runtimeAdmin.ok,
      status: runtimeAdmin.status,
      detail: runtimeAdmin.detail,
    },
    {
      id: "hash-admin-password-script",
      label: "hash-admin-password.mjs（scrypt ハッシュ生成）",
      ok: hashScript.includes("scrypt:") && hashScript.includes("scryptSync"),
      status: hashScript.includes("scryptSync") ? "GREEN" : "RED",
    },
    {
      id: "npm-hash-admin-password",
      label: "npm run hash:admin-password",
      ok: packageJson.includes('"hash:admin-password"'),
      status: packageJson.includes('"hash:admin-password"') ? "GREEN" : "RED",
    },
    {
      id: "reject-plaintext-hash",
      label: "平文 ADMIN_PASSWORD_HASH=temp はログイン拒否",
      ok: invalidHashRejected,
      status: invalidHashRejected ? "GREEN" : "RED",
      detail: invalidHashRejected ? "verifyPassword rejects non-scrypt values" : "temp accepted as hash",
    },
    {
      id: "admin-auth-verify-password",
      label: "loginAdmin が verifyPassword を使用",
      ok: adminAuth.includes("verifyPassword"),
      status: adminAuth.includes("verifyPassword") ? "GREEN" : "RED",
    },
    {
      id: "test-email-admin-auth",
      label: "POST /api/notifications/test-email は admin 認証必須",
      ok: notificationsRoute.includes("/test-email") && notificationsRoute.includes("requireAdminAuth"),
      status:
        notificationsRoute.includes("/test-email") && notificationsRoute.includes("requireAdminAuth")
          ? "GREEN"
          : "RED",
    },
    {
      id: "docs-admin-password-recovery",
      label: "docs/admin-password-recovery.md",
      ok: recoveryDoc.includes("hash:admin-password") && recoveryDoc.includes("systemctl restart"),
      status:
        recoveryDoc.includes("hash:admin-password") && recoveryDoc.includes("systemctl restart")
          ? "GREEN"
          : "RED",
    },
    {
      id: "shell-version-2381",
      label: "PWA shell v2381",
      ok: PWA_SHELL_VERSION === "2381" && PWA_SHELL_TAG.includes("production"),
      status: PWA_SHELL_VERSION === "2381" ? "GREEN" : "YELLOW",
    },
  ];

  const implemented = [
    "npm run hash:admin-password — ADMIN_PASSWORD_HASH 生成（scrypt 形式）",
    "production-check — ADMIN_PASSWORD_HASH=temp を RED 判定",
    "docs/admin-password-recovery.md — ハッシュ生成・.env 更新・再起動・test-email",
    "POST /api/notifications/test-email — admin Bearer token 必須",
  ];

  const mockRemaining = [
    "Business Gmail OAuth 実送信（営業 PDF 添付メール）",
    "QNAP 実機 WebDAV/SMB アップロード（QNAP_MODE=real）",
    "Shelly 実機 RPC（SHELLY_MODE=real）",
  ];

  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);
  const criticalOk = checks
    .filter((c) =>
      ["admin-password-hash-runtime", "hash-admin-password-script", "reject-plaintext-hash", "test-email-admin-auth"].includes(
        c.id
      )
    )
    .every((c) => c.ok);

  return {
    phase: "2381-2400",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady: criticalOk && productionRatePercent >= 85,
    adminPasswordStatus: runtimeAdmin.status,
    implemented,
    mockRemaining,
    nextPhase: "2401-2420 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}
