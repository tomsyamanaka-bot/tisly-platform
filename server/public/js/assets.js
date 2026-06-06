import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";

function headers() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function healthClass(code) {
  if (code === "normal") return "health-normal";
  if (code === "warning") return "health-warning";
  return "health-abnormal";
}

async function loadAssets() {
  const customerCode = document.getElementById("assets-customer")?.value || "TOMS001";
  const kind = document.getElementById("assets-kind")?.value || "";
  const health = document.getElementById("assets-health")?.value || "";
  const params = new URLSearchParams({ customerCode });
  if (kind) params.set("kind", kind);
  if (health) params.set("health", health);

  const res = await fetch(`/api/field-operations/assets?${params}`, { headers: headers() });
  if (!res.ok) {
    document.getElementById("assets-tbody").innerHTML =
      `<tr><td colspan="5">要ログイン（App Hub から assets）</td></tr>`;
    return;
  }
  const data = await res.json();
  const s = data.summary || {};
  document.getElementById("assets-summary").innerHTML = `
    <div><strong>${s.total ?? 0}</strong>合計</div>
    <div><strong class="health-normal">${s.normal ?? 0}</strong>正常</div>
    <div><strong class="health-warning">${s.warning ?? 0}</strong>注意</div>
    <div><strong class="health-abnormal">${s.abnormal ?? 0}</strong>異常</div>
    <div><strong>${s.ESP ?? 0}</strong>ESP</div>
    <div><strong>${s.Shelly ?? 0}</strong>Shelly</div>
    <div><strong>${s.Camera ?? 0}</strong>Camera</div>
    <div><strong>${s.SwitchBot ?? 0}</strong>SwitchBot</div>
    <div><strong>${s.Sensor ?? 0}</strong>Sensor</div>`;

  const tbody = document.getElementById("assets-tbody");
  tbody.innerHTML = (data.assets || [])
    .map(
      (a) =>
        `<tr>
          <td>${a.deviceKind}</td>
          <td>${a.label}</td>
          <td><a href="/asset/${a.assetId}">${a.deviceId}</a></td>
          <td class="${healthClass(a.healthCode)}">${a.health}</td>
          <td>${a.lastSeen ? a.lastSeen.slice(0, 10) : "—"}</td>
        </tr>`
    )
    .join("") || `<tr><td colspan="5">資産なし</td></tr>`;
}

document.getElementById("btn-assets-refresh")?.addEventListener("click", () =>
  loadAssets().catch(console.error)
);
document.getElementById("assets-customer")?.addEventListener("change", () => loadAssets());
document.getElementById("assets-kind")?.addEventListener("change", () => loadAssets());
document.getElementById("assets-health")?.addEventListener("change", () => loadAssets());

renderPwaTopbar("installer", "資産管理");
loadAssets().catch(console.error);
