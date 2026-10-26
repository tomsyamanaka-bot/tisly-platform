/**
 * お客様画面のシステム安心ステータス。
 * 豊島邸・板橋自宅・龍ヶ崎店は、社内と同じ死活 API を読む。
 */

import { tislyCustomerUpdateStatusLabel } from "../../tisly-release-version-v1.js";
import { isItabashiSecuritySite, fetchItabashiStatus } from "./use-itabashi-status-v1.js";
import { fetchToyoshimaStatus, isHardwareOnline } from "./use-toyoshima-status-v1.js";
import { isToyoshimaSecuritySite } from "./toyoshima-security-dashboard-v1.js";
import { isWashmateSecuritySite } from "./washmate-customer-settings-v1.js";

const RYUGASAKI_STATUS_PATH = "/api/home/v1/ryugasaki/status";

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

function tempLabel(status) {
  const raw = status?.boardTempC;
  if (raw == null || raw === "") return "取得中";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "取得中";
  return `${n.toFixed(1)}℃`;
}

function onlineOf(status) {
  if (status?.isHardwareOnline === true || status?.online === true) return true;
  if (status?.isHardwareOnline === false || status?.online === false) {
    return false;
  }
  return isHardwareOnline(status?.lastHeartbeatAt);
}

export function paintCustomerAssureCardV1(status) {
  const online = onlineOf(status);
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
  });
  refresh();
  timer = window.setInterval(refresh, 5000);
  return () => window.clearInterval(timer);
}
