import { apiGet, apiPost, getAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
document.getElementById("install-code").textContent = customerCode;
document.getElementById("link-map").href = `/customer/${customerCode}/map`;
document.getElementById("link-portal").href = `/customer/${customerCode}`;

async function loadDevices() {
  const data = await apiGet(`/api/customer/${customerCode}/install`);
  const tbody = document.getElementById("install-devices");
  tbody.innerHTML = (data.devices ?? [])
    .map(
      (d) =>
        `<tr>
          <td>${d.deviceId}</td>
          <td>${d.deviceType}</td>
          <td>${d.rssi ?? "—"}</td>
          <td>${d.lastSeen ?? "—"}</td>
          <td>${d.firmwareVersion ?? "—"}</td>
          <td>${d.online ? "オンライン" : "オフライン"}</td>
        </tr>`
    )
    .join("");
}

document.getElementById("device-wizard")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await apiPost(`/api/customer/${customerCode}/devices/wizard`, {
      serial: fd.get("serial"),
      type: fd.get("type"),
      floor: fd.get("floor") || undefined,
      room: fd.get("room") || undefined,
      icon: fd.get("icon"),
      siteId: fd.get("siteId") || undefined,
    });
    document.getElementById("wizard-result").textContent = `登録: ${res.deviceId}`;
    await loadDevices();
  } catch (err) {
    document.getElementById("wizard-result").textContent = String(err);
  }
});

if (!getAdminToken()) {
  location.href = `/customer/${customerCode}`;
} else {
  loadDevices().catch(console.error);
}
