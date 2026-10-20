/**
 * 社内 Security 画面の上部に、選択中テナントの設定サマリーを出す。
 */

import { TOYOSHIMA_RULES_CHANNEL } from "./use-toyoshima-status-v1.js";

const SUMMARY_PATH = "/api/home/v1/setting-summary";

/** 社内 Security（/app）だけ。顧客画面では出さない */
export function isOperatorSettingSummaryScope() {
  if (typeof document === "undefined" || typeof location === "undefined") {
    return false;
  }
  if (document.body?.classList.contains("sf-customer")) return false;
  const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
  if (path === "/customer" || path.startsWith("/customer/")) return false;
  return (
    path === "/app/security" ||
    path === "/app/security-v1" ||
    path === "/security-v1" ||
    path.endsWith("/security-v1.html")
  );
}

export async function paintTenantSettingSummary(siteId) {
  const root = document.getElementById("sf-setting-summary");
  const text = document.getElementById("sf-setting-summary-text");
  if (!root || !text) return;
  if (!isOperatorSettingSummaryScope()) {
    text.textContent = "";
    root.hidden = true;
    return;
  }
  const id = String(siteId || "").trim();
  if (!id) {
    root.hidden = true;
    return;
  }
  try {
    const res = await fetch(
      `${SUMMARY_PATH}?siteId=${encodeURIComponent(id)}&t=${Date.now()}`,
      { credentials: "same-origin", cache: "no-store" }
    );
    if (!res.ok) {
      root.hidden = true;
      return;
    }
    const data = await res.json();
    const summary = String(data.summary || "").trim();
    if (!summary) {
      root.hidden = true;
      return;
    }
    text.textContent = summary;
    root.hidden = false;
  } catch {
    root.hidden = true;
  }
}

export function bindTenantSettingSummaryRefresh(readSiteId) {
  const refresh = () => {
    paintTenantSettingSummary(readSiteId()).catch(() => {});
  };
  document.addEventListener("tisly-setting-summary-refresh", refresh);
  if (typeof BroadcastChannel === "function") {
    try {
      const channel = new BroadcastChannel(TOYOSHIMA_RULES_CHANNEL);
      channel.onmessage = () => refresh();
    } catch {
      /* 非対応ブラウザは物件切替時の再取得に任せる */
    }
  }
  refresh();
}
