const TOKEN_KEY = "tisly_token";

/** @typedef {'live'|'offline'|'mock'|'real'|'warning'|'disabled'|'mockOnly'|'dryRun'|'html'|'puppeteer'} ConnState */

/**
 * @param {Array<{ state: string; label: string }>} badges
 * @param {string} rootId
 */
export function renderConnectionBadges(badges, rootId = "tisly-connection-badges") {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = badges
    .map(
      (b) =>
        `<span class="conn-badge conn-${b.state}" role="status" title="${b.label}">${b.label}</span>`
    )
    .join("");
}

export function badgesFromConnectionStatus(s) {
  const live = navigator.onLine ? s.live : "offline";
  const items = [
    {
      state: live,
      label: live === "mock" ? "Mock" : live === "warning" ? "Warning" : live === "live" ? "Live" : "Offline",
    },
    {
      state: s.mqtt?.tls?.ready ? "real" : s.mqtt?.mode ?? "mock",
      label: s.mqtt?.tls?.ready
        ? "MQTT TLS"
        : `MQTT ${s.mqtt?.mode ?? "mock"}`,
    },
    {
      state: s.gmail?.connected ? (s.gmail.sendMode === "real" ? "real" : s.gmail.sendMode) : "mockOnly",
      label: s.gmail?.connected ? `Gmail ${s.gmail.mode}` : "Gmail mock",
    },
    { state: s.qnap?.mode ?? "mock", label: `QNAP ${s.qnap?.mode ?? "mock"}` },
    { state: s.pdf?.mode === "puppeteer" ? "real" : "mock", label: `PDF ${s.pdf?.mode ?? "html"}` },
    {
      state: s.wsDisconnected ? "offline" : "live",
      label: s.wsDisconnected ? "WS offline" : `WS ${s.wsClients ?? 0}`,
    },
  ];
  return items;
}

export async function loadConnectionBadges(rootId = "tisly-connection-badges") {
  const token = sessionStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch("/api/toms/live/connection-status", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      renderConnectionBadges([{ state: "offline", label: "Offline" }], rootId);
      return;
    }
    const s = await res.json();
    s.wsDisconnected = typeof window !== "undefined" && window.__tislyWsDisconnected === true;
    renderConnectionBadges(badgesFromConnectionStatus(s), rootId);
    if (s.live === "warning" || s.mqtt?.tls?.mode === "incomplete") {
      highlightAnomalyCard("[data-conn-card='mqtt']", 10000);
    }
  } catch {
    renderConnectionBadges([{ state: "offline", label: "Offline" }], rootId);
  }
}

export function highlightAnomalyCard(selector, ms = 10000) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.add("anomaly-highlight");
  setTimeout(() => el.classList.remove("anomaly-highlight"), ms);
}

export function setWsDisconnectedBadge(disconnected) {
  if (typeof window !== "undefined") {
    window.__tislyWsDisconnected = disconnected;
  }
  loadConnectionBadges().catch(() => {});
}
