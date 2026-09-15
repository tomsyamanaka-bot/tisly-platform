/**
 * TESTER001 実機遮断モック v1
 *
 * テスターセッションでは RP2350 物理 DO / SwitchBot 実機へ
 * 一切送信せず、200 OK 相当の成功を返す。
 * 既存テナント・物件配列は削除しない。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";
import { resolveAnySession } from "../../auth/customer-auth.js";
import { isTesterTenantV1 } from "./tester-tenant-v1.js";

export const TESTER_HARDWARE_MOCK_TRANSPORT_V1 = "tester_demo_mock";

export interface TesterHardwareMockContextV1 {
  customerCode: string;
  mockHardware: boolean;
}

const testerHardwareAlsV1 =
  new AsyncLocalStorage<TesterHardwareMockContextV1>();

function extractBearerTokenV1(req: Request): string | undefined {
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const queryToken = req.query.access_token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  return (
    req.header("x-tisly-admin-token") ??
    req.header("x-tisly-customer-token") ??
    undefined
  );
}

function pickCustomerCodeV1(req: Request): string {
  const token = extractBearerTokenV1(req);
  const session = resolveAnySession(token);
  const fromSession =
    session && "customerCode" in session
      ? String(session.customerCode ?? "").trim()
      : "";
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromBody = String(
    body.customerCode ?? body.customer_code ?? ""
  ).trim();
  const fromHeader = String(
    req.header("x-tisly-customer-code") ?? ""
  ).trim();
  const fromQuery = String(
    typeof req.query.customerCode === "string" ? req.query.customerCode : ""
  ).trim();
  return (fromSession || fromHeader || fromBody || fromQuery).toUpperCase();
}

/** リクエストからテスターモック文脈を組み立てる */
export function resolveTesterHardwareMockContextV1(
  req: Request
): TesterHardwareMockContextV1 {
  const customerCode = pickCustomerCodeV1(req);
  return {
    customerCode,
    mockHardware: isTesterTenantV1(customerCode),
  };
}

/** Express 全 API にテスター文脈を載せる */
export function attachTesterHardwareMockContextV1(
  req: Request,
  _res: unknown,
  next: () => void
): void {
  const ctx = resolveTesterHardwareMockContextV1(req);
  testerHardwareAlsV1.run(ctx, () => next());
}

/** 単体テスト / 内部呼び出し用 */
export function runWithTesterHardwareMockContextV1<T>(
  customerCode: string,
  fn: () => T
): T {
  const code = String(customerCode ?? "").trim().toUpperCase();
  return testerHardwareAlsV1.run(
    {
      customerCode: code,
      mockHardware: isTesterTenantV1(code),
    },
    fn
  );
}

/** 現在のリクエストが TESTER001 モックか */
export function isTesterHardwareMockActiveV1(): boolean {
  const store = testerHardwareAlsV1.getStore();
  if (store?.mockHardware) return true;
  return isTesterTenantV1(store?.customerCode);
}

export function getTesterHardwareMockCustomerCodeV1(): string {
  return String(testerHardwareAlsV1.getStore()?.customerCode ?? "").trim();
}

/** 物理出力をキューせず成功扱いにする */
export function shouldBlockPhysicalDoV1(): boolean {
  return isTesterHardwareMockActiveV1();
}
