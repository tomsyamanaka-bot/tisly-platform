/** 実運用フェーズ — 案件詳細から戻る際の return URL / ナビスタック処理 */

import { hasNavStackEntry, navigateBackOne, navigateTo } from "./tisly-navigation-stack-v1.js";

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
  if (hasNavStackEntry()) {
    navigateBackOne();
    return true;
  }
  const ret = readReturnUrl();
  if (ret) {
    navigateTo(ret, { record: false });
    return true;
  }
  if (typeof fallback === "function") fallback();
  return false;
}

export { navigateTo, navigateBackOne };
