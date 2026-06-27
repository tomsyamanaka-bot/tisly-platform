/**
 * 実務 PWA — 1 画面ずつ戻るナビゲーションスタック（history.back 非使用）
 */
import {
  NAV_STACK_STORAGE_KEY_V1,
  getDefaultNavFallbackV1,
  getNavZoneV1,
  isValidReturnUrlV1,
  peekNavStackV1,
  pushNavStackV1,
  replaceCurrent,
  safeReturn,
  sanitizeNavPathV1,
} from "./tisly-navigation-stack-shared-v1.js";

export {
  sanitizeNavPathV1,
  getDefaultNavFallbackV1,
  getNavZoneV1,
  isValidReturnUrlV1,
  pushNavStackV1 as pushScreen,
  replaceCurrent,
  safeReturn,
  getReturnUrl,
} from "./tisly-navigation-stack-shared-v1.js";

export function getCurrentPageUrl() {
  return `${location.pathname}${location.search}`;
}

function readStack() {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_STORAGE_KEY_V1);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((u) => sanitizeNavPathV1(u)) : [];
  } catch {
    return [];
  }
}

function writeStack(stack) {
  sessionStorage.setItem(NAV_STACK_STORAGE_KEY_V1, JSON.stringify(stack));
}

function currentZone() {
  return getNavZoneV1(location.pathname) || "internal";
}

export function getNavigationStack() {
  return readStack();
}

export function clearNavigationStack() {
  sessionStorage.removeItem(NAV_STACK_STORAGE_KEY_V1);
}

/** ページ遷移前に呼ぶ — 現在画面をスタックへ記録 */
export function recordNavDeparture(currentUrl = getCurrentPageUrl()) {
  writeStack(pushNavStackV1(readStack(), currentUrl));
}

/**
 * 別画面へ遷移（スタックに現在 URL を積んでから移動）
 * customer ↔ internal クロスゾーンは拒否
 * @param {string} href
 * @param {{ record?: boolean }} [opts]
 */
export function navigateTo(href, { record = true } = {}) {
  const safe = sanitizeNavPathV1(href);
  if (!safe) return;
  const fromZone = currentZone();
  const toZone = getNavZoneV1(safe);
  if (toZone && fromZone && toZone !== fromZone) return;
  if (record) recordNavDeparture();
  location.href = safe;
}

/**
 * 1 画面だけ戻る（スタック pop · ブラウザ履歴は使わない）
 * @param {string | { fallback?: string; explicitReturn?: string | null }} [fallbackOrOpts]
 */
export function navigateBackOne(fallbackOrOpts) {
  const zone = currentZone();
  const stack = readStack();
  let fallback;
  let explicitReturn;
  if (fallbackOrOpts && typeof fallbackOrOpts === "object") {
    fallback = fallbackOrOpts.fallback;
    explicitReturn = fallbackOrOpts.explicitReturn;
  } else {
    fallback = fallbackOrOpts;
  }
  const fb = sanitizeNavPathV1(fallback) || getDefaultNavFallbackV1(location.pathname);
  const result = safeReturn(stack, { fallback: fb, zone, explicitReturn });
  writeStack(result.stack);
  location.href = result.target;
}

const POPSTATE_GUARD_FLAG = "__tislyPopstateGuardV1";

/** @type {(() => void) | null} */
let popstateBackHandler = null;

/**
 * iPhone Safari / PWA のスワイプ戻りをナビスタック経由に統一（ゾーン混在防止）
 * @param {() => void} [handler] — 未指定時は navigateBackOne
 */
export function bindPopstateBackGuard(handler) {
  if (typeof window === "undefined") return;
  popstateBackHandler = handler || null;
  if (window[POPSTATE_GUARD_FLAG]) return;
  window[POPSTATE_GUARD_FLAG] = true;

  try {
    const seed = { ...(history.state || {}), tislyNavGuard: 1 };
    history.replaceState(seed, "", location.href);
    history.pushState({ tislyNavGuard: 2 }, "", location.href);
  } catch {
    /* ignore */
  }

  window.addEventListener("popstate", () => {
    try {
      history.pushState({ tislyNavGuard: 2 }, "", location.href);
    } catch {
      /* ignore */
    }
    const fn =
      popstateBackHandler ||
      (() => navigateBackOne(getDefaultNavFallbackV1(location.pathname)));
    fn();
  });
}

/** 現在画面 URL をスタック先頭で置換 */
export function replaceCurrentScreen(currentUrl = getCurrentPageUrl()) {
  writeStack(replaceCurrent(readStack(), currentUrl));
}

/** スタックに戻り先があるか */
export function hasNavStackEntry() {
  return readStack().length > 0;
}

/** 直接 URL で開かれた場合のフォールバック — referrer を 1 件だけシード（ゾーン一致時のみ） */
export function seedNavigationStackFromReferrer() {
  if (readStack().length > 0) return;
  try {
    const ref = document.referrer;
    if (!ref) return;
    const u = new URL(ref);
    if (u.origin !== location.origin) return;
    const path = sanitizeNavPathV1(`${u.pathname}${u.search}`);
    if (!path || path === getCurrentPageUrl()) return;
    const zone = currentZone();
    if (!isValidReturnUrlV1(path, zone)) return;
    writeStack([path]);
  } catch {
    /* ignore */
  }
}

/** return クエリから戻り先を 1 件シード（スタック空・ゾーン一致時のみ） */
export function seedNavigationStackFromReturnQuery() {
  if (readStack().length > 0) return;
  try {
    const ret = new URLSearchParams(location.search).get("return");
    if (!ret?.startsWith("/")) return;
    const path = sanitizeNavPathV1(ret);
    if (!path || path === getCurrentPageUrl()) return;
    const zone = currentZone();
    if (!isValidReturnUrlV1(path, zone)) return;
    writeStack([path]);
  } catch {
    /* ignore */
  }
}

const LINK_CAPTURE_FLAG = "__tislyNavLinkCaptureV1";

/** 通常の <a href> 遷移前に現在 URL をスタックへ記録 */
export function bindInternalLinkDepartureCapture() {
  if (typeof document === "undefined" || window[LINK_CAPTURE_FLAG]) return;
  window[LINK_CAPTURE_FLAG] = true;

  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.("a[href]");
      if (!a || a.hasAttribute("data-nav-no-record")) return;
      const href = a.getAttribute("href");
      if (!href?.startsWith("/") || href.startsWith("//")) return;
      if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.closest("#tisly-practical-bottomnav-root, #tisly-practical-topbar-root")) return;
      recordNavDeparture();
    },
    true
  );
}

export function initNavigationStack() {
  seedNavigationStackFromReferrer();
  seedNavigationStackFromReturnQuery();
  bindInternalLinkDepartureCapture();
}

/** 診断用 */
export function navigationStackDiagnostics() {
  const stack = readStack();
  return {
    depth: stack.length,
    peek: peekNavStackV1(stack),
    stack: stack.slice(-8),
    zone: currentZone(),
  };
}
