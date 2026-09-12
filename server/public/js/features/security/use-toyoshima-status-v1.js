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
/** タブ間の即時同期チャネル名 */
export const TOYOSHIMA_STATUS_CHANNEL =
  "tisly-toyoshima-hw-status-v1";

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

/**
 * ヘッダー／カード共通の死活判定
 * lastHeartbeatAt のみを見る
 */
export function isHardwareOnline(iso, now = Date.now()) {
  return isToyoshimaHeartbeatOnline(iso, now);
}

function emptyStatus() {
  return {
    ok: false,
    ssot: "toyoshima-commHealth",
    lastHeartbeatAt: null,
    lastHeartbeatLabelJst: "未受信",
    confirmLabelJst: "—",
    uiOnline: false,
    isHardwareOnline: false,
    customerOnline: "🔴 オフライン（通信途絶）",
    operatorOnline: "🔴 オフライン（通信途絶）",
    onlineSummary: "🔴 オフライン（通信途絶）",
    boardTempC: null,
    boardTempLabel: "正常監視中",
    boardTempLevel: "normal",
    firmwareVersion: null,
    firmwareServerVersion: null,
    firmwareLatest: false,
    firmwareLabel: "―",
    devices: [],
  };
}

export function formatFirmwareCustomerLabel(running) {
  const raw = String(running ?? "").trim();
  if (!raw) return "―";
  return /^v/i.test(raw) ? raw : `v${raw}`;
}

function paintFirmwareEls(status) {
  const run =
    status.firmwareVersion || status.runningVersion || null;
  const label =
    status.firmwareLabel || formatFirmwareCustomerLabel(run);
  const latest =
    status.firmwareLatest === true && label !== "―";
  const fwEl = document.getElementById("ts-assure-fw");
  if (fwEl) fwEl.textContent = label;
  const badge = document.getElementById("ts-assure-fw-badge");
  if (badge) badge.hidden = !latest;
  const cvFw = document.getElementById("cv-firmware-val");
  if (cvFw) cvFw.textContent = label;
  const cvBadge = document.getElementById("cv-firmware-badge");
  if (cvBadge) cvBadge.hidden = !latest;
  /* /app OTA カードも同じ実機版を描く */
  if (run) {
    const painted = formatFirmwareCustomerLabel(run);
    const op = document.getElementById("ts-ota-running");
    if (op) op.textContent = painted;
    const sf = document.getElementById("sf-ota-running");
    if (sf) sf.textContent = painted;
  }
}

function paintTempEl(el, status) {
  if (!el) return;
  const level = status.boardTempLevel || "normal";
  const emoji =
    level === "warning" ? "🔴" : level === "caution" ? "🟡" : "🟢";
  const c = status.boardTempC;
  const hasTemp = typeof c === "number" && Number.isFinite(c);
  const label = hasTemp
    ? status.boardTempLabel || `${Number(c).toFixed(1)}℃`
    : status.boardTempLabel || "正常監視中";
  el.textContent = `${emoji} ${label}`;
  el.classList.remove("is-normal", "is-caution", "is-warning");
  el.classList.add(`is-${level}`);
}

/**
 * ヘッダー丸バッジと通信カードを
 * 同一 isHardwareOnline で再描画する
 */
export function applyToyoshimaHardwareStatus(status) {
  if (!status) return;
  const online = !!status.isHardwareOnline;
  const cardOnline = online
    ? status.customerOnline ||
      status.operatorOnline ||
      "🟢 正常稼働中（オンライン）"
    : "🔴 オフライン（通信途絶）";
  const operatorOnline = online
    ? status.operatorOnline || cardOnline
    : "🔴 オフライン（通信途絶）";

  const pill = document.getElementById("sf-online");
  if (pill) {
    pill.textContent = online ? "🟢 オンライン" : "🔴 オフライン";
    pill.classList.toggle("is-offline", !online);
    pill.classList.remove("is-alert");
  }

  const operatorEl = document.getElementById("ts-online-val");
  if (operatorEl) {
    operatorEl.textContent = operatorOnline;
    operatorEl.classList.toggle("is-offline", !online);
  }

  const assureEl = document.getElementById("ts-assure-online");
  if (assureEl) {
    assureEl.textContent = cardOnline;
    assureEl.classList.toggle("is-offline", !online);
  }

  const hbEl = document.getElementById("ts-heartbeat-val");
  if (hbEl) {
    hbEl.textContent = online
      ? status.lastHeartbeatLabelJst || "—"
      : status.lastHeartbeatAt
        ? status.lastHeartbeatLabelJst || "—"
        : "未受信";
  }

  const confirmEl = document.getElementById("ts-assure-confirm");
  if (confirmEl) {
    confirmEl.textContent = status.confirmLabelJst || "—";
  }

  paintTempEl(document.getElementById("ts-board-temp-val"), status);
  paintTempEl(document.getElementById("ts-assure-temp"), status);
  paintFirmwareEls(status);

  const big = document.getElementById("cv-status-big");
  if (big) big.textContent = cardOnline;
  const last = document.getElementById("cv-last-checked");
  if (last) {
    const time = status.confirmLabelJst || "—";
    last.textContent = `最終確認：${time}`;
  }
}

export function broadcastToyoshimaStatus(status) {
  if (!status || typeof BroadcastChannel !== "function") return;
  try {
    const ch = new BroadcastChannel(TOYOSHIMA_STATUS_CHANNEL);
    ch.postMessage({ type: "hw-status", status });
    ch.close();
  } catch {
    /* 非対応ブラウザはポーリングに任せる */
  }
}

export function subscribeToyoshimaStatus(onStatus) {
  if (typeof BroadcastChannel !== "function") {
    return () => {};
  }
  try {
    const ch = new BroadcastChannel(TOYOSHIMA_STATUS_CHANNEL);
    ch.onmessage = (ev) => {
      const msg = ev?.data;
      if (msg?.type !== "hw-status" || !msg.status) return;
      if (typeof onStatus === "function") onStatus(msg.status);
    };
    return () => {
      try {
        ch.close();
      } catch {
        /* close 失敗は無視 */
      }
    };
  } catch {
    return () => {};
  }
}

function normalizeStatus(data) {
  const lastHeartbeatAt = data.lastHeartbeatAt || null;
  /* 表示はクライアント側 5 分判定を優先 */
  const hardwareOnline = isHardwareOnline(lastHeartbeatAt);
  return {
    ok: true,
    ssot: data.ssot || "toyoshima-commHealth",
    lastHeartbeatAt,
    lastHeartbeatLabelJst:
      data.lastHeartbeatLabelJst ||
      (lastHeartbeatAt ? String(lastHeartbeatAt) : "未受信"),
    confirmLabelJst: data.confirmLabelJst || "—",
    uiOnline: hardwareOnline,
    isHardwareOnline: hardwareOnline,
    customerOnline: hardwareOnline
      ? data.customerOnline || "🟢 正常稼働中（オンライン）"
      : "🔴 オフライン（通信途絶）",
    operatorOnline: hardwareOnline
      ? data.operatorOnline || "🟢 正常稼働中（オンライン）"
      : "🔴 オフライン（通信途絶）",
    onlineSummary: hardwareOnline
      ? data.onlineSummary || "🟢 正常稼働中（オンライン）"
      : "🔴 オフライン（通信途絶）",
    boardTempC: data.boardTempC ?? null,
    boardTempLabel: data.boardTempLabel || "正常監視中",
    boardTempLevel: data.boardTempLevel || "normal",
    firmwareVersion: data.firmwareVersion || data.runningVersion || null,
    firmwareServerVersion:
      data.firmwareServerVersion || data.serverVersion || null,
    firmwareLatest: data.firmwareLatest === true,
    firmwareLabel:
      data.firmwareLabel ||
      formatFirmwareCustomerLabel(
        data.firmwareVersion || data.runningVersion
      ),
    devices: Array.isArray(data.devices) ? data.devices : [],
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
    const empty = {
      ...emptyStatus(),
      error: data?.error || "状態の取得に失敗しました",
    };
    if (opts.apply !== false) applyToyoshimaHardwareStatus(empty);
    return empty;
  }
  const status = normalizeStatus(data);
  if (opts.apply !== false) applyToyoshimaHardwareStatus(status);
  if (opts.force) broadcastToyoshimaStatus(status);
  return status;
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
  let unsubscribe = () => {};

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
    unsubscribe = subscribeToyoshimaStatus((status) => {
      last = { ...last, ...status };
      applyToyoshimaHardwareStatus(last);
      if (typeof onUpdate === "function") onUpdate(last);
    });
    refresh(true).catch(() => {});
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    unsubscribe();
    unsubscribe = () => {};
  }

  function getLast() {
    return last;
  }

  return { refresh, start, stop, getLast };
}

export { emptyStatus as emptyToyoshimaStatus };
