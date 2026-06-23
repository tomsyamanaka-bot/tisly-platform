/** 実運用フェーズ1 — 案件詳細から戻る際の return URL 処理 */

export function readReturnUrl() {
  const ret = new URLSearchParams(location.search).get("return");
  if (ret && ret.startsWith("/")) return ret;
  return null;
}

/**
 * @param {() => void} fallback
 * @returns {boolean} navigated away
 */
export function navigatePracticalReturn(fallback) {
  const ret = readReturnUrl();
  if (ret) {
    window.location.href = ret;
    return true;
  }
  if (typeof fallback === "function") fallback();
  return false;
}
