import { apiPost } from "./api.js";

const TOKEN_KEY = "tisly_token";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSettings() {
  const data = await apiGet("/api/security/automation/rules");
  const s = data.settings || {};
  document.getElementById("switchbot-enabled").checked = !!s.switchbotIntegrationEnabled;
  document.getElementById("auto-arm").checked = !!s.autoArmEnabled;
  document.getElementById("auto-disarm").checked = !!s.autoDisarmEnabled;
  document.getElementById("delay-seconds").value = s.delaySeconds ?? 300;
  document.getElementById("unknown-policy").value = s.unknownDevicePolicy || "block_auto_arm";
}

async function loadPresence() {
  const data = await apiGet("/api/security/presence/devices");
  const summary = data.summary || {};
  document.getElementById("presence-summary").textContent =
    `登録 ${summary.total} · 有効 ${summary.enabled} · home ${summary.home} · away ${summary.away} · unknown ${summary.unknown}`;
  const tbody = document.querySelector("#device-table tbody");
  tbody.innerHTML = (data.devices || [])
    .map(
      (d) =>
        `<tr>
          <td>${d.name}</td><td>${d.type}</td><td>${d.presenceStatus}</td>
          <td>
            <button type="button" data-id="${d.id}" data-status="home">home</button>
            <button type="button" data-id="${d.id}" data-status="away">away</button>
            <button type="button" data-id="${d.id}" data-status="unknown">unknown</button>
          </td>
        </tr>`
    )
    .join("");
  tbody.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPatch(`/api/security/presence/devices/${btn.dataset.id}`, {
        presenceStatus: btn.dataset.status,
      });
      await loadPresence();
    });
  });
}

document.getElementById("btn-save-settings")?.addEventListener("click", async () => {
  await apiPatch("/api/security/automation/settings", {
    switchbotIntegrationEnabled: document.getElementById("switchbot-enabled").checked,
    autoArmEnabled: document.getElementById("auto-arm").checked,
    autoDisarmEnabled: document.getElementById("auto-disarm").checked,
    delaySeconds: Number(document.getElementById("delay-seconds").value),
    unknownDevicePolicy: document.getElementById("unknown-policy").value,
  });
  document.getElementById("settings-status").textContent = "保存しました";
});

document.getElementById("btn-add-device")?.addEventListener("click", async () => {
  const n = Date.now();
  await apiPost("/api/security/presence/devices", {
    name: `Test Phone ${n}`,
    type: "iphone",
    presenceStatus: "away",
  });
  await loadPresence();
});

document.getElementById("btn-lock-status")?.addEventListener("click", async () => {
  const res = await fetch("/api/integrations/switchbot/lock/status").then((r) => r.json());
  document.getElementById("switchbot-status").textContent = JSON.stringify(res, null, 2);
});

document.getElementById("btn-mock-locked")?.addEventListener("click", async () => {
  const res = await apiPost("/api/security/automation/switchbot/locked", {});
  document.getElementById("switchbot-status").textContent = JSON.stringify(res, null, 2);
});

document.getElementById("btn-mock-unlocked")?.addEventListener("click", async () => {
  const res = await apiPost("/api/security/automation/switchbot/unlocked", {});
  document.getElementById("switchbot-status").textContent = JSON.stringify(res, null, 2);
});

Promise.all([loadSettings(), loadPresence()]).catch(console.error);
