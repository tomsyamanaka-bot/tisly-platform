/**
 * TiSLY Navigation Stack v1 — React Native 移植しやすい純粋ロジック
 * sessionStorage 永続化はブラウザ側ラッパーが担当。ここはスタック操作のみ。
 */

export const NAV_STACK_STORAGE_KEY_V1 = "tisly_nav_stack_v1";
export const NAV_STACK_MAX_DEPTH_V1 = 64;

export type NavZoneV1 = "internal" | "customer";

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

export function sanitizeNavPathV1(path: string | null | undefined): string | null {
  const p = String(path ?? "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
}

export function getNavZoneV1(pathname: string): NavZoneV1 | null {
  const base = String(pathname ?? "").split("?")[0];
  if (base === "/customer" || base.startsWith("/customer/")) return "customer";
  if (INTERNAL_PREFIXES_V1.some((prefix) => base === prefix || base.startsWith(prefix))) {
    return "internal";
  }
  return null;
}

/** customer ↔ internal クロスゾーン遷移を禁止 */
export function isValidReturnUrlV1(returnUrl: string, currentZone: NavZoneV1): boolean {
  const safe = sanitizeNavPathV1(returnUrl);
  if (!safe) return false;
  const targetZone = getNavZoneV1(safe);
  if (!targetZone) return false;
  return targetZone === currentZone;
}

export function getDefaultNavFallbackV1(pathname: string): string {
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

export function pushScreen(stack: string[], currentUrl: string): string[] {
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

/** @alias pushScreen */
export const pushNavStackV1 = pushScreen;

/** 1 画面だけ戻る — スタックから 1 件 pop */
export function backOne(stack: string[]): { stack: string[]; target: string | null } {
  if (!stack.length) return { stack: [], target: null };
  const next = stack.slice();
  const target = next.pop() ?? null;
  return { stack: next, target: sanitizeNavPathV1(target) };
}

/** @alias backOne */
export const popNavStackV1 = backOne;

export function peekNavStackV1(stack: string[]): string | null {
  if (!stack.length) return null;
  return sanitizeNavPathV1(stack[stack.length - 1]);
}

/** スタック先頭を現在画面で置換（タブ切替等） */
export function replaceCurrent(stack: string[], currentUrl: string): string[] {
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

/** 戻り先 URL をゾーン検証付きで解決 */
export function getReturnUrl(
  stack: string[],
  fallback: string,
  zone: NavZoneV1
): string {
  const peek = peekNavStackV1(stack);
  if (peek && isValidReturnUrlV1(peek, zone)) return peek;
  const fb = sanitizeNavPathV1(fallback) ?? getDefaultNavFallbackV1(zone === "customer" ? "/customer" : "/app");
  if (isValidReturnUrlV1(fb, zone)) return fb;
  return getDefaultNavFallbackV1(zone === "customer" ? "/customer" : "/app");
}

export interface SafeReturnOptionsV1 {
  fallback: string;
  zone: NavZoneV1;
  explicitReturn?: string | null;
}

/** 1 画面戻る — stack pop → explicitReturn → fallback（すべてゾーン検証） */
export function safeReturn(
  stack: string[],
  opts: SafeReturnOptionsV1
): { stack: string[]; target: string } {
  const popped = backOne(stack);
  const fromStack = popped.target;
  if (fromStack && isValidReturnUrlV1(fromStack, opts.zone)) {
    return { stack: popped.stack, target: fromStack };
  }

  const explicit = opts.explicitReturn ? sanitizeNavPathV1(opts.explicitReturn) : null;
  if (explicit && isValidReturnUrlV1(explicit, opts.zone)) {
    return { stack: popped.stack, target: explicit };
  }

  return {
    stack: popped.stack,
    target: getReturnUrl(popped.stack, opts.fallback, opts.zone),
  };
}
