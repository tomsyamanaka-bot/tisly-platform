const TOKEN_KEY = "tisly_token";

export async function loadConnectionBadges(rootId = "tisly-connection-badges") {
  const root = document.getElementById(rootId);
  if (!root) return;
  const token = sessionStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch("/api/toms/live/connection-status", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const s = await res.json();
    const live = navigator.onLine ? s.live : "offline";
    const badges = [
      { cls: live, label: live === "mock" ? "Mock" : live === "live" ? "Live" : "Offline" },
      { cls: s.mqtt.mode, label: `MQTT ${s.mqtt.mode}` },
      { cls: s.gmail.connected ? s.gmail.sendMode : "mockOnly", label: s.gmail.connected ? `Gmail ${s.gmail.mode}` : "Gmail mockOnly" },
      { cls: s.qnap.mode, label: `QNAP ${s.qnap.mode}` },
      { cls: s.pdf.mode, label: `PDF ${s.pdf.mode}` },
    ];
    root.innerHTML = badges
      .map((b) => `<span class="conn-badge conn-${b.cls}">${b.label}</span>`)
      .join("");
  } catch {
    root.innerHTML = `<span class="conn-badge conn-offline">Offline</span>`;
  }
}

export function highlightAnomalyCard(selector, ms = 10000) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.add("anomaly-highlight");
  setTimeout(() => el.classList.remove("anomaly-highlight"), ms);
}
