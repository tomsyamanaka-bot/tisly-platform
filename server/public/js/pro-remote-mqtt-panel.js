const TOKEN_KEY = "tisly_token";

function customerCodeFromPath() {
  const m = window.location.pathname.match(/\/customer\/([^/]+)/i);
  return (m?.[1] || "TOMS001").toUpperCase();
}

function apiHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatLastReceived(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

function connectionLabel(state, mode) {
  if (state === "connected") return "接続中";
  if (state === "mock" || mode === "mock") return "Mock（シミュレーション）";
  return "未接続";
}

export async function loadProRemoteMqttPanel() {
  const code = customerCodeFromPath();
  const brokerEl = document.getElementById("pro-mqtt-broker");
  const connEl = document.getElementById("pro-mqtt-connection");
  const countEl = document.getElementById("pro-mqtt-count");
  const topicsEl = document.getElementById("pro-mqtt-topics");
  const lastEl = document.getElementById("pro-mqtt-last");
  const hintEl = document.getElementById("pro-mqtt-mode-hint");
  if (!brokerEl) return;

  try {
    const res = await fetch(`/api/customer/${code}/pro-remote/mqtt-status`, {
      headers: apiHeaders(),
    });
    if (!res.ok) throw new Error(String(res.status));
    const s = await res.json();
    brokerEl.textContent = s.broker || "mqtt.tisly.jp";
    connEl.textContent = connectionLabel(s.connectionState, s.mode);
    const isDisconnected = s.mode === "real" && s.connectionState === "disconnected";
    connEl.className =
      s.connectionState === "connected"
        ? "mqtt-live"
        : s.mode === "mock"
          ? "mqtt-mock"
          : "mqtt-off";
    if (isDisconnected) {
      connEl.className = "mqtt-off";
      connEl.textContent = "接続断";
    }
    countEl.textContent = String(s.messageCount ?? 0);
    if (topicsEl) topicsEl.textContent = String(s.topicCount ?? 0);
    lastEl.textContent = formatLastReceived(s.lastReceivedAt);
    if (hintEl) {
      hintEl.textContent =
        s.mode === "real"
          ? "実MQTTブローカー経由（mqtt.tisly.jp）"
          : "MQTT_MODE=mock — 本番は MQTT_MODE=real で切替";
    }
  } catch (e) {
    brokerEl.textContent = "mqtt.tisly.jp";
    connEl.textContent = "取得失敗";
    if (hintEl) hintEl.textContent = String(e);
  }
}

export function startProRemoteMqttPolling(intervalMs = 15000) {
  loadProRemoteMqttPanel().catch(() => {});
  return setInterval(() => loadProRemoteMqttPanel().catch(() => {}), intervalMs);
}
