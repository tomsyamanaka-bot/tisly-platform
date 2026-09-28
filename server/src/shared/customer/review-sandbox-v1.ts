/**
 * クローズドテスト用の実機隔離 v1
 *
 * 未ログインと TESTER001 は実機物件を一覧から外し、
 * 実機向けの操作 API は送信せず成功モックを返す。
 * TOMS001 / TOYOSHIMA001 / 社内ログインは従来どおり実機へ届く。
 */

import type { Request, Response } from "express";
import { resolveAnySession } from "../../auth/customer-auth.js";
import { listHomeSitesV1 } from "../../home/home-sites-v1.js";
import { isTesterTenantV1 } from "./tester-tenant-v1.js";

export const REVIEW_SANDBOX_MESSAGE_V1 =
  "テストモードです。実機には送信していません";

const LIVE_OWNER_CODES_V1 = new Set([
  "TOMS001",
  "HOME001",
  "TOYOSHIMA001",
  "TOSHIMA001",
]);

const LIVE_SITE_IDS_V1 = new Set([
  "HOME-JP-ITABASHI-LIVE",
  "SEC-JP-ITABASHI-LIVE",
  "HOME-JP-TOYOSHIMA",
  "HOME-JP-TOSHIMA",
  "SEC-JP-TOYOSHIMA-001",
  "SEC-JP-TOSHIMA-001",
]);

/** 本番、または TISLY_REVIEW_SANDBOX=1 のとき有効 */
export function reviewSandboxEnabledV1(): boolean {
  const flag = String(process.env.TISLY_REVIEW_SANDBOX ?? "").trim();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return process.env.NODE_ENV === "production";
}

function requestPathV1(req: Request): string {
  return String(req.originalUrl || req.url || "").split("?")[0];
}

function bearerTokenV1(req: Request): string {
  const auth = req.header("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

/** 施主または社内セッションなら実機操作を許可する */
export function viewerMayUseLiveHardwareV1(req: Request): boolean {
  if (!reviewSandboxEnabledV1()) return true;
  const session = resolveAnySession(bearerTokenV1(req));
  if (!session) return false;
  if ("scope" in session && session.scope === "platform") return true;
  const code = String(
    "customerCode" in session ? session.customerCode ?? "" : ""
  )
    .trim()
    .toUpperCase();
  if (!code || isTesterTenantV1(code)) return false;
  return LIVE_OWNER_CODES_V1.has(code);
}

export function isLiveControlledSiteIdV1(
  siteId: string | null | undefined
): boolean {
  const id = String(siteId ?? "").trim();
  if (!id) return false;
  if (LIVE_SITE_IDS_V1.has(id)) return true;
  const upper = id.toUpperCase();
  if (upper.includes("ITABASHI-LIVE") || upper.includes("TOYOSHIMA")) {
    return true;
  }
  const site = listHomeSitesV1().find((row) => row.id === id);
  if (!site) return false;
  return site.operationMode === "live" || site.kind === "live_home";
}

function readSiteIdV1(req: Request): string {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return String(body.siteId ?? body.site_id ?? req.query.siteId ?? "").trim();
}

function isMutatingV1(req: Request): boolean {
  const method = String(req.method || "GET").toUpperCase();
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function isDeviceIngressPathV1(path: string): boolean {
  return /\/(heartbeat|event)$/.test(path);
}

function isInherentlyLiveCommandPathV1(path: string): boolean {
  if (isDeviceIngressPathV1(path)) return false;
  if (path.includes("/api/devices/rp2350/relay/")) return true;
  if (path.includes("/api/home/v1/hardware/")) return true;
  if (path.includes("/api/home/v1/toyoshima/")) return true;
  if (path.includes("/api/home/v1/itabashi/")) return true;
  return false;
}

function isConditionalLiveCommandPathV1(path: string): boolean {
  return (
    path === "/api/home/v1/control" ||
    path === "/api/home/v1/doorphone/control" ||
    path === "/api/home/v1/scene" ||
    path === "/api/home/v1/security/mode" ||
    path === "/api/home/v1/security/config" ||
    path === "/api/home/v1/security-rules" ||
    path.startsWith("/api/home/v1/bath-schedules")
  );
}

/** このリクエストを実機へ流さずモック応答にするか */
export function shouldSandboxLiveCommandV1(req: Request): boolean {
  if (!reviewSandboxEnabledV1()) return false;
  if (!isMutatingV1(req)) return false;
  if (viewerMayUseLiveHardwareV1(req)) return false;
  const path = requestPathV1(req);
  if (isDeviceIngressPathV1(path)) return false;
  if (isInherentlyLiveCommandPathV1(path)) return true;
  if (!isConditionalLiveCommandPathV1(path)) return false;
  return isLiveControlledSiteIdV1(readSiteIdV1(req));
}

export function reviewSandboxGuardV1(
  req: Request,
  res: Response,
  next: () => void
): void {
  if (!shouldSandboxLiveCommandV1(req)) {
    next();
    return;
  }
  res.status(200).json({
    ok: true,
    success: true,
    hardwareMock: true,
    reviewSandbox: true,
    mocked: true,
    transport: "review_sandbox",
    message: REVIEW_SANDBOX_MESSAGE_V1,
  });
}
