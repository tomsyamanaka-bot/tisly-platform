async function loadShellyLab() {
  const res = await fetch("/api/demo-kit/shelly/lab-status");
  const data = await res.json();
  if (!res.ok) return;
  const el = document.getElementById("shelly-lab-status");
  if (el) {
    el.textContent = data.message ?? "—";
    el.style.color = data.online ? "#1a7f37" : "#cf222e";
  }
}

function formatShellyCell(d) {
  if (d.kind !== "Shelly") return "—";
  const t = d.shellyTelemetry;
  if (!t) return "—";
  if (t.connectionError) return `<span style="color:#cf222e">${t.connectionError}</span>`;
  const parts = [
    t.online ? "online" : "offline",
    t.relay != null ? `relay=${t.relay}` : "",
    t.wifiRssi != null ? `RSSI ${t.wifiRssi}` : "",
    t.temperatureC != null ? `${t.temperatureC}°C` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

async function loadDevices() {
  const customer = document.getElementById("customer-filter")?.value ?? "";
  const q = customer ? `?customerCode=${encodeURIComponent(customer)}` : "";
  const res = await fetch(`/api/demo-kit/devices/registry${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);

  document.getElementById("device-mode").textContent = data.summary?.deviceMode ?? "—";
  const shellyEnv = document.getElementById("shelly-env");
  if (shellyEnv) shellyEnv.textContent = (data.shellyEnvMode ?? "mock").toUpperCase();
  void loadShellyLab();
  const s = data.summary ?? {};
  document.getElementById("summary").innerHTML = `
    <span>合計 <strong>${s.deviceCount ?? 0}</strong></span>
    <span>ONLINE <strong>${s.onlineCount ?? 0}</strong></span>
    <span>WARNING <strong>${s.warningCount ?? 0}</strong></span>
    <span>OFFLINE <strong>${s.offlineCount ?? 0}</strong></span>
  `;

  const tbody = document.getElementById("device-rows");
  tbody.innerHTML = (data.devices ?? [])
    .map(
      (d) => `<tr>
        <td><code>${d.deviceId}</code></td>
        <td>${d.name}</td>
        <td>${d.kind}</td>
        <td><span class="badge ${d.status}">${d.status}</span></td>
        <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString("ja-JP") : "—"}</td>
        <td>${d.source}</td>
        <td><code style="font-size:0.75rem">${d.mqttTopicProduction ?? d.mqttTopic ?? "—"}</code></td>
        <td>${formatShellyCell(d)}</td>
      </tr>`
    )
    .join("");
}

document.getElementById("btn-refresh")?.addEventListener("click", () => loadDevices().catch(alert));
document.getElementById("customer-filter")?.addEventListener("change", () => loadDevices().catch(alert));
loadDevices().catch(alert);
