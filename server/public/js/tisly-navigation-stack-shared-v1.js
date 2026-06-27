/** @typedef {import('../../src/shared/navigation/tisly-navigation-stack-v1.ts')} */

export const NAV_STACK_STORAGE_KEY_V1 = "tisly_nav_stack_v1";
export const NAV_STACK_MAX_DEPTH_V1 = 64;

const INTERNAL_PREFIXES_V1 = [
  "/app",
  "/schedule",
  "/survey",
  "/estimate",
  "/projects",
  "/field-",
  "/project-",
  "/document",
  "/purchase",
  "/master",
  "/settings",
  "/google-calendar",
  "/knowledge",
  "/storage",
  "/checklist",
  "/monitoring",
  "/tisly-monitoring",
  "/mothership",
  "/route-health",
  "/customer-admin",
  "/search-v1",
  "/ai-estimate",
];

export function sanitizeNavPathV1(path) {
  const p = String(path ?? "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
}

export function getNavZoneV1(pathname) {
  const base = String(pathname ?? "").split("?")[0];
  if (base === "/customer" || base.startsWith("/customer/")) return "customer";
  if (INTERNAL_PREFIXES_V1.some((prefix) => base === prefix || base.startsWith(prefix))) {
    return "internal";
  }
  return null;
}

export function isValidReturnUrlV1(returnUrl, currentZone) {
  const safe = sanitizeNavPathV1(returnUrl);
  if (!safe) return false;
  const targetZone = getNavZoneV1(safe);
  if (!targetZone) return false;
  return targetZone === currentZone;
}

export function getDefaultNavFallbackV1(pathname) {
  const base = String(pathname ?? "").split("?")[0];
  if (base.startsWith("/customer")) return "/customer";
  if (base.startsWith("/project-mgmt-detail")) return "/project-dashboard-v1";
  if (base.includes("/document-viewer")) return "/document-center-v1";
  if (base.startsWith("/survey-drawing")) return "/survey-v1";
  if (base.startsWith("/project-dashboard")) return "/app";
  if (base.startsWith("/project-mgmt-v1")) return "/app";
  if (base.startsWith("/document-center") || base.startsWith("/documents-v1"))
    return "/projects-v1";
  if (base.startsWith("/estimate-v1") || base.startsWith("/survey-v1")) return "/projects-v1";
  if (base.startsWith("/schedule-day")) return "/schedule-v1";
  if (base.startsWith("/field-check") || base.startsWith("/purchase-v1")) return "/app";
  return "/app";
}

export function pushScreen(stack, currentUrl) {
  const url = sanitizeNavPathV1(currentUrl);
  if (!url) return stack.slice();
  const next = stack.slice();
  if (next[next.length - 1] !== url) {
    next.push(url);
  }
  while (next.length > NAV_STACK_MAX_DEPTH_V1) {
    next.shift();
  }
  return next;
}

export const pushNavStackV1 = pushScreen;

export function backOne(stack) {
  if (!stack.length) return { stack: [], target: null };
  const next = stack.slice();
  const target = next.pop() ?? null;
  return { stack: next, target: sanitizeNavPathV1(target) };
}

export const popNavStackV1 = backOne;

export function peekNavStackV1(stack) {
  if (!stack.length) return null;
  return sanitizeNavPathV1(stack[stack.length - 1]);
}

export function replaceCurrent(stack, currentUrl) {
  const url = sanitizeNavPathV1(currentUrl);
  if (!url) return stack.slice();
  const next = stack.slice();
  if (next.length) {
    next[next.length - 1] = url;
  } else {
    next.push(url);
  }
  return next;
}

export function getReturnUrl(stack, fallback, zone) {
  const peek = peekNavStackV1(stack);
  if (peek && isValidReturnUrlV1(peek, zone)) return peek;
  const fb = sanitizeNavPathV1(fallback) ?? getDefaultNavFallbackV1(zone === "customer" ? "/customer" : "/app");
  if (isValidReturnUrlV1(fb, zone)) return fb;
  return getDefaultNavFallbackV1(zone === "customer" ? "/customer" : "/app");
}

export function safeReturn(stack, opts) {
  // スタック優先 — 必ず 1 件だけ pop して直前画面へ
  const popped = backOne(stack);
  const fromStack = popped.target;
  if (fromStack && isValidReturnUrlV1(fromStack, opts.zone)) {
    return { stack: popped.stack, target: fromStack };
  }

  // スタック空 — return クエリをフォールバック
  const explicit = opts.explicitReturn ? sanitizeNavPathV1(opts.explicitReturn) : null;
  if (explicit && isValidReturnUrlV1(explicit, opts.zone)) {
    return { stack: popped.stack, target: explicit };
  }

  // 親階層フォールバック
  return {
    stack: popped.stack,
    target: getReturnUrl(popped.stack, opts.fallback, opts.zone),
  };
}
