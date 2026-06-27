/* お客様ポータル共通ナビ — /app へ戻らない · ナビスタック管理 */
import { initCustomerCacheGuard } from "./customer-cache-v1.js";
import {
  bindPopstateBackGuard,
  getDefaultNavFallbackV1,
  hasNavStackEntry,
  initNavigationStack,
  navigateBackOne,
  navigateTo,
} from "./tisly-navigation-stack-v1.js";

export const CUSTOMER_FALLBACK = "/customer";
const RETURN_KEY = "tisly_customer_return_url_v1";

export function setCustomerReturnUrl(url) {
  const u = String(url ?? "").trim();
  if (u.startsWith("/customer") && !u.startsWith("/app")) {
    sessionStorage.setItem(RETURN_KEY, u);
  }
}

export function getCustomerReturnUrl() {
  const u = sessionStorage.getItem(RETURN_KEY);
  if (u && u.startsWith("/customer") && !u.startsWith("/app")) return u;
  return null;
}

export function clearCustomerReturnUrl() {
  sessionStorage.removeItem(RETURN_KEY);
}

if (typeof window !== "undefined") {
  window.__setCustomerReturnUrl = setCustomerReturnUrl;
}

export function resolveCustomerBackUrl(opts = {}) {
  const explicit = String(opts.explicitReturn ?? "").trim();
  if (explicit.startsWith("/customer") && !explicit.startsWith("/app")) {
    return explicit;
  }

  const stored = getCustomerReturnUrl();
  if (stored) return stored;

  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      if (u.origin === location.origin && u.pathname.startsWith("/customer")) {
        return u.pathname + u.search;
      }
    }
  } catch {
    /* ignore */
  }

  if (opts.shareId) return `/customer/project/${encodeURIComponent(opts.shareId)}`;
  if (opts.customerCode) return `/customer/${encodeURIComponent(opts.customerCode)}`;
  return CUSTOMER_FALLBACK;
}

export function goCustomerBack(opts = {}) {
  if (hasNavStackEntry()) {
    clearCustomerReturnUrl();
    navigateBackOne(getDefaultNavFallbackV1(location.pathname));
    return;
  }
  const target = resolveCustomerBackUrl(opts);
  clearCustomerReturnUrl();
  navigateTo(target, { record: false });
}

export function navigateCustomer(href) {
  setCustomerReturnUrl(location.pathname + location.search);
  navigateTo(href);
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function initCustomerPage() {
  initNavigationStack();
  bindPopstateBackGuard(() => goCustomerBack());
  const path = location.pathname;
  if (path === "/customer" || path === "/customer/") {
    initCustomerCacheGuard().catch(() => {});
    return;
  }
  setCustomerReturnUrl(getCustomerReturnUrl() || CUSTOMER_FALLBACK);
  initCustomerCacheGuard().catch(() => {});
}
