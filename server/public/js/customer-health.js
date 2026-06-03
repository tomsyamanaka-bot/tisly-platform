import { apiGet, apiPost, getAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";

document.getElementById("health-code").textContent = customerCode;
document.getElementById("link-portal").href = `/customer/${customerCode}`;
document.getElementById("link-onboard").href = `/customer/${customerCode}/install/device-onboard`;

async function load() {
  if (!getAdminToken()) {
    location.href = `/customer/${customerCode}`;
    return;
  }
  const h = await apiGet(`/api/customer/${customerCode}/health`);
  const grid = document.getElementById("health-grid");
  const tiles = [
    { label: "Devices 総数", value: h.devices.total, cls: "ok" },
    { label: "ONLINE", value: h.devices.online, cls: "ok" },
    { label: "WARNING", value: h.devices.warning, cls: "warn" },
    { label: "OFFLINE", value: h.devices.offline, cls: "warn" },
    { label: "MQTT", value: h.mqtt.status, cls: h.mqtt.status === "ok" ? "ok" : "warn" },
    { label: "Webhooks", value: h.webhooks.enabled, cls: "ok" },
    { label: "Storage", value: h.storage.provider, cls: "ok" },
    { label: "TV", value: h.tv.count, cls: "ok" },
    { label: "Certificate", value: h.certificate.status, cls: h.certificate.status === "ok" ? "ok" : "warn" },
  ];
  grid.innerHTML = tiles
    .map(
      (t) =>
        `<div class="health-tile ${t.cls}"><div class="label">${t.label}</div><div class="value" style="font-size:1.4rem;font-weight:700">${t.value}</div></div>`
    )
    .join("");

  const tl = await apiGet(`/api/customer/${customerCode}/devices/timeline`);
  document.getElementById("timeline-list").innerHTML = (tl.entries ?? [])
    .slice(0, 30)
    .map(
      (e) =>
        `<li><strong>${e.title}</strong> — ${e.deviceId} <small>${e.createdAt}</small></li>`
    )
    .join("");
}

document.getElementById("btn-notify-test")?.addEventListener("click", async () => {
  const res = await apiPost(`/api/customer/${customerCode}/notifications/test-all`, {});
  document.getElementById("notify-result").textContent = JSON.stringify(res, null, 2);
});

document.querySelectorAll("[data-scenario]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const res = await apiPost(`/api/customer/${customerCode}/simulator/event`, {
      scenario: btn.dataset.scenario,
    });
    document.getElementById("sim-result").textContent = JSON.stringify(res, null, 2);
    await load();
  });
});

load().catch(console.error);
