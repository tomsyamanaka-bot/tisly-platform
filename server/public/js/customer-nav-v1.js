/* お客様ポータル共通ナビ — /app へ戻らない */
export const CUSTOMER_FALLBACK = "/customer";

export function resolveCustomerBackUrl(opts = {}) {
  const explicit = String(opts.explicitReturn ?? "").trim();
  if (explicit.startsWith("/customer") && !explicit.startsWith("/app")) {
    return explicit;
  }
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
  location.href = resolveCustomerBackUrl(opts);
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
