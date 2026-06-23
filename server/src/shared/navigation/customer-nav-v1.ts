/**
 * お客様ポータル内ナビ — /app へ戻らない
 */

import {
  TISLY_CUSTOMER_PWA_START_URL,
  buildCustomerHomeUrlV1,
  buildCustomerProjectUrlV1,
} from "../routes/tisly-routes-v1.js";

export const CUSTOMER_NAV_FALLBACK_V1 = TISLY_CUSTOMER_PWA_START_URL;

/** ブラウザ履歴ではなく /customer 系 URL のみ許可 */
export function resolveCustomerBackUrlV1(opts: {
  referrerPath?: string | null;
  explicitReturn?: string | null;
  shareId?: string | null;
  customerCode?: string | null;
}): string {
  const explicit = String(opts.explicitReturn ?? "").trim();
  if (explicit.startsWith("/customer") && !explicit.startsWith("/app")) {
    return explicit;
  }

  const ref = String(opts.referrerPath ?? "").trim();
  if (ref.startsWith("/customer") && !ref.startsWith("/app")) {
    return ref;
  }

  if (opts.shareId) {
    return buildCustomerProjectUrlV1(opts.shareId);
  }
  if (opts.customerCode) {
    return buildCustomerHomeUrlV1(opts.customerCode);
  }
  return CUSTOMER_NAV_FALLBACK_V1;
}

export function isSafeCustomerPathV1(path: string): boolean {
  const p = String(path ?? "");
  return p.startsWith("/customer") && !p.startsWith("/app");
}
