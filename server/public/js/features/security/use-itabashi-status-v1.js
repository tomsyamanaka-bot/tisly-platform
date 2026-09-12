/**
 * 板橋自宅 通信ステータスフック
 * /customer と /app が同じ API を読む
 */

import {
  applyToyoshimaHardwareStatus,
  bustCacheUrl,
  formatFirmwareCustomerLabel,
  isHardwareOnline,
  NO_STORE_FETCH,
} from "./use-toyoshima-status-v1.js";

export const ITABASHI_STATUS_PATH = "/api/home/v1/itabashi/status";
export const ITABASHI_HEARTBEAT_PATH = "/api/home/v1/itabashi/heartbeat";
export const ITABASHI_CONFIG_PATH = "/api/home/v1/itabashi/config";
export const ITABASHI_HOME_ID = "HOME-JP-ITABASHI-LIVE";
export const ITABASHI_SEC_ID = "SEC-JP-ITABASHI-LIVE";

function emptyStatus() {
  return {
    ok: false,
    ssot: "itabashi-commHealth",
    lastHeartbeatAt: null,
    lastHeartbeatLabelJst: "未受信",
    confirmLabelJst: "—",
    uiOnline: false,
    isHardwareOnline: false,
    customerOnline: "🔴 オフライン（通信途絶）",
    operatorOnline: "🔴 通信途絶",
    onlineSummary: "🔴 通信途絶",
    boardTempC: null,
    boardTempLabel: "―（取得中）",
    boardTempLevel: "normal",
    firmwareVersion: null,
    firmwareServerVersion: null,
    firmwareLatest: false,
    firmwareLabel: "―",
    heartbeatWatchEnabled: true,
  };
}

function normalizeStatus(data) {
  const lastHeartbeatAt = data.lastHeartbeatAt || null;
  const hardwareOnline = isHardwareOnline(lastHeartbeatAt);
  return {
    ok: true,
    ssot: data.ssot || "itabashi-commHealth",
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
      : "🔴 通信途絶",
    onlineSummary: hardwareOnline
      ? data.onlineSummary || "🟢 正常稼働中（オンライン）"
      : "🔴 通信途絶",
    boardTempC: data.boardTempC ?? null,
    boardTempLabel: data.boardTempLabel || "―（取得中）",
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
    heartbeatWatchEnabled: data.heartbeatWatchEnabled !== false,
  };
}

export async function fetchItabashiStatus(opts = {}) {
  const extra = {};
  if (opts.force) extra.forceSync = "1";
  const url = bustCacheUrl(ITABASHI_STATUS_PATH, extra);
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const res = await fetch(url, { ...NO_STORE_FETCH });
  const data = await res.json().catch(() => ({}));
  const latencyMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      t0
  );
  if (!data?.ok && data?.ssot !== "itabashi-commHealth") {
    const empty = { ...emptyStatus(), latencyMs };
    if (opts.apply !== false) applyItabashiHardwareStatus(empty);
    return empty;
  }
  const status = { ...normalizeStatus(data), latencyMs };
  if (opts.apply !== false) applyItabashiHardwareStatus(status);
  return status;
}

export function applyItabashiHardwareStatus(status) {
  applyToyoshimaHardwareStatus(status);
  const online = !!status?.isHardwareOnline;
  const opOnline = online
    ? status.operatorOnline || "🟢 正常稼働中（オンライン）"
    : "🔴 通信途絶";
  const custOnline = online
    ? status.customerOnline || "🟢 正常稼働中（オンライン）"
    : "🔴 オフライン（通信途絶）";
  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setTxt("ib-online-val", opOnline);
  setTxt("ib-assure-online", custOnline);
  setTxt(
    "ib-heartbeat-val",
    status.lastHeartbeatLabelJst || (status.lastHeartbeatAt ? "—" : "未受信")
  );
  setTxt("ib-assure-confirm", status.confirmLabelJst || "—");
  const hasTemp =
    typeof status.boardTempC === "number" &&
    Number.isFinite(status.boardTempC);
  const tempText = hasTemp
    ? `${
        status.boardTempLevel === "warning"
          ? "🔴"
          : status.boardTempLevel === "caution"
            ? "🟡"
            : "🟢"
      } ${status.boardTempLabel}`
    : status.boardTempLabel || "―（取得中）";
  setTxt("ib-board-temp-val", tempText);
  setTxt("ib-assure-temp", tempText);
  setTxt("cv-board-temp-val", status.boardTempLabel || "―（取得中）");
  setTxt("ib-assure-fw", status.firmwareLabel || "―");
  const badge = document.getElementById("ib-assure-fw-badge");
  if (badge) {
    badge.hidden = !(status.firmwareLatest === true && status.firmwareLabel !== "―");
  }
  const pill = document.getElementById("sf-online");
  if (pill && document.body.classList.contains("sf-customer")) {
    /* 顧客ヘッダーは applyToyoshima 側で更新 */
  }
  const latencyEl = document.getElementById("ib-latency-val");
  if (latencyEl && status.latencyMs != null) {
    const ms = Math.max(0, Math.round(Number(status.latencyMs) || 0));
    const quality = ms < 80 ? "良好" : ms < 200 ? "普通" : "遅延";
    latencyEl.textContent = `${ms} ms（${quality}）`;
  }
}

export async function postItabashiSimHeartbeat() {
  const res = await fetch(ITABASHI_HEARTBEAT_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NO_STORE_FETCH.headers },
    cache: "no-store",
    body: JSON.stringify({
      siteId: ITABASHI_HOME_ID,
      actor: "operator-sim",
      board_temp: 36.2,
      boardTemp: 36.2,
      deviceId: "sim-itabashi-main",
    }),
  });
  const data = await res.json().catch(() => ({}));
  const status = data.status
    ? normalizeStatus(data.status)
    : await fetchItabashiStatus({ force: true });
  applyItabashiHardwareStatus(status);
  return { data, status };
}

export async function setItabashiHeartbeatWatch(enabled) {
  const res = await fetch(ITABASHI_CONFIG_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...NO_STORE_FETCH.headers },
    cache: "no-store",
    body: JSON.stringify({
      siteId: ITABASHI_HOME_ID,
      heartbeatWatchEnabled: !!enabled,
    }),
  });
  return res.json().catch(() => ({}));
}

export function useItabashiStatus(onUpdate) {
  let timer = null;
  let last = emptyStatus();

  async function refresh(force = true) {
    const data = await fetchItabashiStatus({ force });
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

export function isItabashiSecuritySite(siteId) {
  const id = String(siteId || "");
  return (
    id === ITABASHI_SEC_ID ||
    id === ITABASHI_HOME_ID ||
    id.includes("ITABASHI")
  );
}

export { emptyStatus as emptyItabashiStatus };
