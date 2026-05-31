// TiSLY PLC Builder v5.16 — TiSLY UI Dashboard Template
// PWA Dashboard — MQTT over WebSocket (browser)

const CONFIG = {
  project: "CARSHOP_NIGHT_SECURITY",
  deviceId: "211",
  mqtt: {
    broker: "mqtt.tisly.local",
    wsPort: 9001,
    clientId: "tisly-ui-211-" + Math.random().toString(16).slice(2, 8),
  },
  topics: {
    state: "tisly/device/211/state",
    alarm: "tisly/device/211/alarm",
    motion: "tisly/device/211/motion",
    output: "tisly/device/211/output",
    cmd: "tisly/device/211/cmd",
  },
};

const connBadge = document.getElementById("conn-status");
const lastUpdate = document.getElementById("last-update");

function setConnection(online, label) {
  connBadge.textContent = label;
  connBadge.classList.toggle("online", online);
  connBadge.classList.toggle("offline", !online);
}

function updateDeviceCard(name, value, activeClass) {
  document.querySelectorAll(".device-card").forEach((card) => {
    if (card.dataset.device !== name) return;
    const status = card.querySelector(".device-status");
    const isActive = value === true || value === 1 || value === "1" || value === "ON";
    status.textContent = isActive ? "ACTIVE" : "—";
    card.classList.toggle(activeClass, isActive);
  });
  lastUpdate.textContent = new Date().toLocaleString("ja-JP");
}

function handlePayload(topic, payload) {
  let data = payload;
  try {
    data = JSON.parse(payload);
  } catch (_) { /* raw string */ }
  const name = typeof data === "object" && data ? (data.name || data.device || "") : "";
  const value = typeof data === "object" && data ? (data.value ?? data.state ?? data.active) : data;
  if (name) {
    if (topic.includes("/alarm")) updateDeviceCard(name, value, "active-alarm");
    else if (topic.includes("/motion")) updateDeviceCard(name, value, "active-motion");
    else if (topic.includes("/output")) updateDeviceCard(name, value, "active-output");
    else updateDeviceCard(name, value, "active-contact");
  }
}

// Demo / offline mode — simulates MQTT until broker is configured
function initDemoMode() {
  setConnection(false, "デモモード（MQTT未接続）");
  console.info("[TiSLY UI] Configure WebSocket broker in UI_CONFIG.json for live MQTT.");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(console.warn);
}

initDemoMode();
export { CONFIG };
