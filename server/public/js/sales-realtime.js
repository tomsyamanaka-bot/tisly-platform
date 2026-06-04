/** Phase943 — /sales WebSocket 優先 + polling fallback */
const POLL_MS = 20000;
const WS_PATH = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

let ws = null;
let pollTimer = null;
let wsConnected = false;
let onRefresh = null;

function wsUrl() {
  return WS_PATH;
}

function connectSalesWs(refreshFn) {
  onRefresh = refreshFn;
  if (typeof WebSocket === "undefined") {
    startPolling(refreshFn);
    return;
  }
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    startPolling(refreshFn);
    return;
  }

  ws.onopen = () => {
    wsConnected = true;
    updateConnBadge("ws");
    ws.send(JSON.stringify({ type: "subscribe", channel: "sales" }));
    stopPolling();
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const kind = msg.payload?.kind;
      if (msg.type === "heartbeat" && msg.payload?.pong) return;
      if (msg.payload?.channel === "sales" || msg.topic === "sales/demo") {
        if (msg.payload?.liveBadge) setLiveBadge(msg.payload.liveBadge);
        if (typeof refreshFn === "function") refreshFn(kind);
      }
    } catch {
      /* */
    }
  };

  ws.onclose = () => {
    wsConnected = false;
    updateConnBadge("poll");
    startPolling(refreshFn);
    setTimeout(() => connectSalesWs(refreshFn), 5000);
  };

  ws.onerror = () => {
    wsConnected = false;
  };
}

function startPolling(refreshFn) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (typeof refreshFn === "function") refreshFn("poll");
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function setLiveBadge(state) {
  const el = document.getElementById("live-status-badge");
  if (!el) return;
  const labels = { live: "Live", mock: "Mock", offline: "Offline" };
  el.textContent = labels[state] ?? state;
  el.className = `live-badge live-badge--${state ?? "offline"}`;
}

function updateConnBadge(mode) {
  const el = document.getElementById("conn-mode-badge");
  if (!el) return;
  el.textContent = mode === "ws" ? "WS" : "Poll";
}

export function wireSalesRealtime(refreshFn) {
  if (!navigator.onLine) {
    setLiveBadge("offline");
    showOfflineBanner(true);
    return;
  }
  showOfflineBanner(false);
  connectSalesWs(refreshFn);
  window.addEventListener("online", () => {
    showOfflineBanner(false);
    connectSalesWs(refreshFn);
  });
  window.addEventListener("offline", () => {
    setLiveBadge("offline");
    showOfflineBanner(true);
    if (ws) {
      ws.close();
      ws = null;
    }
  });
}

export function showOfflineBanner(show) {
  const el = document.getElementById("offline-banner");
  if (el) el.hidden = !show;
}

export function isSalesWsConnected() {
  return wsConnected;
}
