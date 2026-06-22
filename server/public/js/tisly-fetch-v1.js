/** Shared fetch — AbortController · timeout · Safari "Load failed" normalization */

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

const NETWORK_RE =
  /load failed|failed to fetch|networkerror|network error|the internet connection appears to be offline|offline/i;

export function normalizeFetchError(err, label = "") {
  const msg = String(err?.message || err || "");
  const prefix = label ? `${label}: ` : "";
  if (err?.name === "AbortError" || /aborted|timeout/i.test(msg)) {
    return Object.assign(
      new Error(`${prefix}応答がタイムアウトしました（${Math.round(DEFAULT_FETCH_TIMEOUT_MS / 1000)}秒）`),
      { code: "timeout", cause: err }
    );
  }
  if (NETWORK_RE.test(msg)) {
    return Object.assign(new Error(`${prefix}通信に失敗しました（電波またはWi-Fiを確認）`), {
      code: "network_error",
      cause: err,
    });
  }
  return err;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const { signal: userSignal, label, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (e) {
    throw normalizeFetchError(e, label);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.message || data.error || `HTTP ${res.status}`);
    e.status = res.status;
    e.code = data.code;
    e.details = data.details;
    throw e;
  }
  return data;
}

/** Re-schedule a watchdog; call clear() in finally when load completes. */
export function createLoadWatchdog(ms, onTimeout) {
  let timer = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    clear();
    timer = setTimeout(onTimeout, ms);
  };
  arm();
  return { arm, clear };
}

export function withTimeout(promise, ms, label = "load") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          Object.assign(new Error(`${label} timeout (${ms}ms)`), {
            code: "timeout",
          })
        );
      }, ms);
    }),
  ]);
}
