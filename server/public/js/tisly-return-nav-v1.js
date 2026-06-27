/** 実運用フェーズ — 案件詳細から戻る際の return URL / ナビスタック処理 */

import {
  getDefaultNavFallbackV1,
  getNavZoneV1,
  hasNavStackEntry,
  isValidReturnUrlV1,
  navigateBackOne,
  navigateTo,
} from "./tisly-navigation-stack-v1.js";

export function readReturnUrl() {
  const ret = new URLSearchParams(location.search).get("return");
  if (ret && ret.startsWith("/")) return ret;
  return null;
}

/**
 * 1 画面戻る（スタック優先 · return クエリはスタック空時のみ）
 * @param {() => void} [fallback]
 * @returns {boolean} navigated away
 */
export function navigatePracticalReturn(fallback) {
  const zone = getNavZoneV1(location.pathname) || "internal";
  const ret = readReturnUrl();
  const fb = getDefaultNavFallbackV1(location.pathname);

  if (hasNavStackEntry()) {
    navigateBackOne({ fallback: fb });
    return true;
  }
  if (ret && isValidReturnUrlV1(ret, zone)) {
    navigateTo(ret, { record: false });
    return true;
  }
  navigateBackOne({ fallback: fb, explicitReturn: ret });
  if (typeof fallback === "function") fallback();
  return true;
}

export { navigateTo, navigateBackOne };
