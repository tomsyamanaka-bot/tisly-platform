/**
 * 豊島邸ステータス SSOT フック
 * /customer と /app が同じ API を読む
 * cache: no-store と ?t= で強制再取得
 */

export const TOYOSHIMA_STATUS_PATH =
  "/api/home/v1/toyoshima/status";
export const TOYOSHIMA_DASHBOARD_PATH =
  "/api/home/v1/toyoshima/dashboard";
export const TOYOSHIMA_SEC_ID = "SEC-JP-TOYOSHIMA-001";

/** 直近 5 分以内の HB のみオンライン */
export const HB_UI_ONLINE_MS = 5 * 60 * 1000;

export const NO_STORE_FETCH = {
  cache: "no-store",
  headers: {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  },
};

/**
 * キャッシュを迂回する URL を作る
 * t と _fresh を毎回付け直す
 */
export function bustCacheUrl(path, extra = {}) {
  const qs = new URLSearchParams();
  const t = String(Date.now());
  qs.set("t", t);
  qs.set("_fresh", t);
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    qs.set(key, String(value));
  });
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${qs.toString()}`;
}

export function isToyoshimaHeartbeatOnline(iso, now = Date.now()) {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return false;
  return now - at < HB_UI_ONLINE_MS;
}

function emptyStatus() {
  return {
    ok: false,
    ssot: "toyoshima-commHealth",
    lastHeartbeatAt: null,
    lastHeartbeatLabelJst: "未受信",
    confirmLabelJst: "—",
    uiOnline: false,
    customerOnline: "🔴 オフライン",
    operatorOnline: "🔴 オフライン（通信途絶）",
    onlineSummary: "🔴 オフライン（通信途絶）",
    boardTempC: null,
    boardTempLabel: "正常監視中",
    boardTempLevel: "normal",
    devices: [],
  };
}

/**
 * 実機 HB が更新したステートを取得
 * lastCommAt など別キーは使わない
 */
export async function fetchToyoshimaStatus(opts = {}) {
  const extra = {
    siteId: opts.siteId || TOYOSHIMA_SEC_ID,
  };
  if (opts.force) extra.forceSync = "1";
  const url = bustCacheUrl(TOYOSHIMA_STATUS_PATH, extra);
  const res = await fetch(url, { ...NO_STORE_FETCH });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    return {
      ...emptyStatus(),
      error: data?.error || "状態の取得に失敗しました",
    };
  }
  const lastHeartbeatAt = data.lastHeartbeatAt || null;
  const uiOnline =
    typeof data.uiOnline === "boolean"
      ? data.uiOnline
      : isToyoshimaHeartbeatOnline(lastHeartbeatAt);
  return {
    ok: true,
    ssot: data.ssot || "toyoshima-commHealth",
    lastHeartbeatAt,
    lastHeartbeatLabelJst:
      data.lastHeartbeatLabelJst ||
      (lastHeartbeatAt ? String(lastHeartbeatAt) : "未受信"),
    confirmLabelJst: data.confirmLabelJst || "—",
    uiOnline,
    customerOnline: uiOnline
      ? data.customerOnline || "🟢 正常稼働中（オンライン）"
      : "🔴 オフライン",
    operatorOnline: uiOnline
      ? data.operatorOnline || "🟢 オンライン（実機稼働中）"
      : "🔴 オフライン（通信途絶）",
    onlineSummary: uiOnline
      ? data.onlineSummary || "🟢 オンライン（実機稼働中）"
      : "🔴 オフライン（通信途絶）",
    boardTempC: data.boardTempC ?? null,
    boardTempLabel: data.boardTempLabel || "正常監視中",
    boardTempLevel: data.boardTempLevel || "normal",
    devices: Array.isArray(data.devices) ? data.devices : [],
  };
}

/** ダッシュボード本体も同じ no-store 規則で取る */
export async function fetchToyoshimaDashboard(opts = {}) {
  const extra = {
    siteId: opts.siteId || TOYOSHIMA_SEC_ID,
  };
  if (opts.force) extra.forceSync = "1";
  const url = bustCacheUrl(TOYOSHIMA_DASHBOARD_PATH, extra);
  const res = await fetch(url, { ...NO_STORE_FETCH });
  const data = await res.json().catch(() => ({}));
  return data;
}

/**
 * /customer と /app 共通の購読フック
 * refresh() でキャッシュを破棄して再取得
 */
export function useToyoshimaStatus(onUpdate) {
  let timer = null;
  let last = emptyStatus();

  async function refresh(force = true) {
    const data = await fetchToyoshimaStatus({ force });
    last = data;
    if (typeof onUpdate === "function") onUpdate(data);
    return data;
  }

  function start(intervalMs = 1500) {
    stop();
    const ms = Number(intervalMs) > 0 ? Number(intervalMs) : 1500;
    timer = setInterval(() => {
      refresh(false).catch(() => {});
    }, ms);
    refresh(true).catch(() => {});
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function getLast() {
    return last;
  }

  return { refresh, start, stop, getLast };
}

export { emptyStatus as emptyToyoshimaStatus };
