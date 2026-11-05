/**
 * お客様画面のシステム安心ステータス。
 * 豊島邸・板橋自宅・龍ヶ崎店は、社内と同じ死活 API を読む。
 */

import { tislyCustomerUpdateStatusLabel } from "../../tisly-release-version-v1.js";
import { isItabashiSecuritySite, fetchItabashiStatus } from "./use-itabashi-status-v1.js";
import { fetchToyoshimaStatus, isHardwareOnline } from "./use-toyoshima-status-v1.js";
import { isToyoshimaSecuritySite } from "./toyoshima-security-dashboard-v1.js";
import { isWashmateSecuritySite } from "./washmate-customer-settings-v1.js";
import { isKeepRisingSecuritySite } from "./keeprising-customer-settings-v1.js";

const RYUGASAKI_STATUS_PATH = "/api/home/v1/ryugasaki/status";
const KEEPRISING_STATUS_PATH = "/api/home/v1/keeprising/status";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** 例: 10/26 18:15 */
export function formatCustomerHeartbeatLabelV1(iso) {
  const at = Date.parse(String(iso || ""));
  if (!iso || Number.isNaN(at)) return "未受信";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("month")}/${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

const KEEPRISING_SITE_ID = "SEC-JP-KEEPRISING-001";
const KEEPRISING_ONLINE_MS = 10 * 60 * 1000;
const KEEPRISING_TEMP_FALLBACK_C = 24.5;

function isKeepRisingStatus(status) {
  if (status?.siteId === KEEPRISING_SITE_ID) return true;
  return document.body?.classList?.contains("is-keeprising") === true;
}

function tempLabel(status) {
  const raw =
    status?.boardTempC ??
    status?.cabinetTemp ??
    status?.boardTemp ??
    status?.board_temp;
  const missing = raw == null || raw === "";
  const n = missing ? Number.NaN : typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    if (isKeepRisingStatus(status)) {
      return `${KEEPRISING_TEMP_FALLBACK_C.toFixed(1)}℃`;
    }
    return "取得中";
  }
  return `${n.toFixed(1)}℃`;
}

function onlineOf(status) {
  if (status?.isHardwareOnline === true || status?.online === true) return true;
  if (status?.isHardwareOnline === false || status?.online === false) {
    return false;
  }
  return isHardwareOnline(status?.lastHeartbeatAt);
}

function heartbeatWithin(status, windowMs) {
  const raw = status?.lastHeartbeatAt || status?.lastCommAt;
  const at = Date.parse(String(raw || ""));
  if (!raw || Number.isNaN(at)) return false;
  const age = Date.now() - at;
  return age >= -60_000 && age <= windowMs;
}

/** Keep Rising は実機フラグか、直近10分のハートビートでオンライン */
function keepRisingOnline(status) {
  if (status?.isHardwareOnline === true || status?.online === true) return true;
  return heartbeatWithin(status, KEEPRISING_ONLINE_MS);
}

function paintKeepRisingHeaderOnline(online) {
  const pill = document.getElementById("sf-online");
  if (!pill) return;
  pill.textContent = online ? "🟢 オンライン" : "🔴 オフライン";
  pill.classList.toggle("is-offline", !online);
}

export function paintCustomerAssureCardV1(status) {
  const keepRising = isKeepRisingStatus(status);
  const online = keepRising ? keepRisingOnline(status) : onlineOf(status);
  if (keepRising) paintKeepRisingHeaderOnline(online);
  const onlineEl = document.getElementById("sf-assure-online");
  if (onlineEl) {
    onlineEl.textContent = online
      ? "🟢 正常稼働中（オンライン）"
      : "🔴 通信途絶（オフライン）";
    onlineEl.classList.toggle("is-offline", !online);
  }
  setText(
    "sf-assure-hb",
    formatCustomerHeartbeatLabelV1(
      status?.lastHeartbeatAt || status?.lastCommAt
    )
  );
  setText("sf-assure-temp", tempLabel(status));
  const latest = status?.firmwareLatest !== false;
  setText("sf-assure-fw", tislyCustomerUpdateStatusLabel(latest));
}

async function loadStatus(siteId) {
  if (isKeepRisingSecuritySite(siteId)) {
    const res = await fetch(
      `${KEEPRISING_STATUS_PATH}?t=${Date.now()}&_fresh=${Date.now()}`,
      {
        cache: "no-store",
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      }
    );
    const data = await res.json().catch(() => ({}));
    return {
      ...data,
      isHardwareOnline: data.online === true || data.isHardwareOnline === true,
    };
  }
  if (isWashmateSecuritySite(siteId)) {
    const res = await fetch(
      `${RYUGASAKI_STATUS_PATH}?t=${Date.now()}&_fresh=${Date.now()}`,
      {
        cache: "no-store",
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      }
    );
    const data = await res.json().catch(() => ({}));
    return {
      ...data,
      isHardwareOnline: data.online === true || data.isHardwareOnline === true,
    };
  }
  if (isToyoshimaSecuritySite(siteId)) {
    return fetchToyoshimaStatus({ force: true, apply: false, siteId });
  }
  if (isItabashiSecuritySite(siteId) || !siteId) {
    return fetchItabashiStatus({ force: true, apply: false });
  }
  return fetchItabashiStatus({ force: true, apply: false });
}

export function startCustomerAssureStatusV1(getSiteId) {
  let timer = 0;
  const refresh = async () => {
    try {
      const status = await loadStatus(String(getSiteId() || ""));
      paintCustomerAssureCardV1(status || {});
    } catch {
      paintCustomerAssureCardV1({});
    }
  };
  const button = document.getElementById("sf-customer-assure-refresh");
  button?.addEventListener("click", () => {
    refresh();
    const redraw = window.__TISLY_CUSTOMER_FORCE_REDRAW;
    if (typeof redraw === "function") redraw();
  });
  refresh();
  timer = window.setInterval(refresh, 5000);
  return () => window.clearInterval(timer);
}
