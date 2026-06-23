/* お客様ポータル共通ナビ — /app へ戻らない · customerReturnUrl 管理 */
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
  const target = resolveCustomerBackUrl(opts);
  clearCustomerReturnUrl();
  location.href = target;
}

export function navigateCustomer(href) {
  setCustomerReturnUrl(location.pathname + location.search);
  location.href = href;
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function initCustomerPage() {
  const path = location.pathname;
  if (path === "/customer" || path === "/customer/") return;
  setCustomerReturnUrl(getCustomerReturnUrl() || CUSTOMER_FALLBACK);
}
