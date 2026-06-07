/**
 * Phase 2351–2380 — 管理者パスワードハッシュ整備（Gmail test-email 認証）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { verifyPassword } from "../auth/password.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const repoRoot = path.join(serverRoot, "..");

export interface ProductionCheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface Phase2380ProductionReport {
  phase: "2351-2380";
  ready: boolean;
  shellVersion: string;
  shellTag: string;
  productionRatePercent: number;
  operationalReady: boolean;
  implemented: string[];
  mockRemaining: string[];
  nextPhase: string;
  checks: ProductionCheckItem[];
}

function readText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function buildPhase2380ProductionCheck(): Phase2380ProductionReport {
  const packageJson = readText(path.join(serverRoot, "package.json")) ?? "";
  const hashScript = readText(path.join(serverRoot, "scripts/hash-admin-password.mjs")) ?? "";
  const adminAuth = readText(path.join(__dirname, "..", "auth/admin-auth.ts")) ?? "";
  const notificationsRoute = readText(path.join(__dirname, "..", "api/routes/notifications.ts")) ?? "";
  const envGuide = readText(path.join(repoRoot, "docs/env_fill_in_guide.md")) ?? "";
  const invalidHashRejected = !verifyPassword("temp", "temp");

  const checks: ProductionCheckItem[] = [
    {
      id: "hash-admin-password-script",
      label: "hash-admin-password.mjs（scrypt ハッシュ生成）",
      ok: hashScript.includes("scrypt:") && hashScript.includes("scryptSync"),
    },
    {
      id: "npm-hash-admin-password",
      label: "npm run hash:admin-password",
      ok: packageJson.includes('"hash:admin-password"'),
    },
    {
      id: "reject-plaintext-hash",
      label: "平文 ADMIN_PASSWORD_HASH=temp はログイン拒否",
      ok: invalidHashRejected,
      detail: invalidHashRejected ? "verifyPassword rejects non-scrypt values" : "temp accepted as hash",
    },
    {
      id: "admin-auth-verify-password",
      label: "loginAdmin が verifyPassword を使用",
      ok: adminAuth.includes("verifyPassword"),
    },
    {
      id: "test-email-admin-auth",
      label: "POST /api/notifications/test-email は admin 認証必須",
      ok: notificationsRoute.includes("/test-email") && notificationsRoute.includes("requireAdminAuth"),
    },
    {
      id: "docs-hash-admin-password",
      label: "docs — npm run hash:admin-password 手順",
      ok: envGuide.includes("hash:admin-password"),
    },
    {
      id: "shell-version-2380",
      label: "PWA shell v2380+",
      ok: Number(PWA_SHELL_VERSION) >= 2380 && PWA_SHELL_TAG.includes("production"),
    },
  ];

  const implemented = [
    "npm run hash:admin-password — ADMIN_PASSWORD_HASH 生成（scrypt 形式）",
    "平文ハッシュ（例: temp）では admin ログイン不可",
    "POST /api/notifications/test-email — admin Bearer token 必須",
    "VPS 手順: ハッシュ生成 → .env 更新 → systemctl restart → login → test-email",
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
      ["hash-admin-password-script", "reject-plaintext-hash", "test-email-admin-auth"].includes(c.id)
    )
    .every((c) => c.ok);

  return {
    phase: "2351-2380",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady: criticalOk && productionRatePercent >= 85,
    implemented,
    mockRemaining,
    nextPhase: "2381-2400 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}
