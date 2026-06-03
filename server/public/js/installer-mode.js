import { apiGet, apiPost, getAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
const OFFLINE_KEY = `tisly_installer_queue_${customerCode}`;

document.getElementById("install-code").textContent = customerCode;
document.getElementById("link-map").href = `/customer/${customerCode}/map`;
document.getElementById("link-portal").href = `/customer/${customerCode}`;
document.getElementById("link-map-full").href = `/customer/${customerCode}/map`;

let sites = [];
let devices = [];
let selectedSiteId = null;
let selectedFloorId = null;

function setStatus(msg) {
  document.getElementById("install-status").textContent = msg;
}

function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    const q = raw ? JSON.parse(raw) : [];
    document.getElementById("offline-hint").textContent =
      q.length > 0 ? `オフラインキュー: ${q.length} 件（復帰後同期 TODO）` : "オフライン一時保存: localStorage placeholder（空）";
  } catch {
    /* */
  }
}

function queueOffline(action, body) {
  const raw = localStorage.getItem(OFFLINE_KEY);
  const q = raw ? JSON.parse(raw) : [];
  q.push({ action, body, at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  loadOfflineQueue();
}

document.querySelectorAll("#installer-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#installer-tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".installer-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.panel}`)?.classList.add("active");
  });
});

function fillSelect(sel, items, valueKey, labelFn) {
  sel.innerHTML = "";
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    sel.appendChild(opt);
  }
}

function syncDeviceSelects() {
  const opts = devices.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
  for (const id of ["test-device-select", "mqtt-device-select", "check-device-select"]) {
    const sel = document.getElementById(id);
    if (sel) fillSelect(sel, opts, "id", (o) => o.label);
  }
  const list = document.getElementById("device-placement-list");
  if (list) {
    list.innerHTML = devices
      .map(
        (d) =>
          `<li>${d.label || d.deviceId} — ${d.mapPosition ? "配置済" : "未配置"} / ${d.commissioningStatus ?? "draft"}</li>`
      )
      .join("");
  }
  const tbody = document.getElementById("install-devices");
  if (tbody) {
    tbody.innerHTML = devices
      .map(
        (d) =>
          `<div class="checklist-item">${d.deviceId} <small>${d.deviceType}</small> ${d.online ? "🟢" : "🟠"}</div>`
      )
      .join("");
  }
}

async function loadSites() {
  const data = await apiGet(`/api/customer/${customerCode}/sites/builder`);
  sites = data.sites ?? [];
  const siteSel = document.getElementById("site-select");
  siteSel.innerHTML = "";
  for (const s of sites) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    siteSel.appendChild(opt);
  }
  selectedSiteId = sites[0]?.id ?? null;
  refreshFloors();
}

function refreshFloors() {
  const site = sites.find((s) => s.id === selectedSiteId);
  const floorSel = document.getElementById("floor-select");
  floorSel.innerHTML = "";
  for (const f of site?.floors ?? []) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    floorSel.appendChild(opt);
  }
  selectedFloorId = floorSel.value || null;
}

async function loadDevices() {
  const data = await apiGet(`/api/customer/${customerCode}/install`);
  devices = (data.devices ?? []).map((d) => ({
    ...d,
    commissioningStatus: d.commissioningStatus ?? d.commissioning_status,
  }));
  syncDeviceSelects();
}

async function loadTemplates() {
  const data = await apiGet(`/api/customer/${customerCode}/device-templates`);
  const sel = document.getElementById("device-type-select");
  sel.innerHTML = (data.templates ?? [])
    .map((t) => `<option value="${t.deviceType}">${t.name}</option>`)
    .join("");
}

document.getElementById("site-select")?.addEventListener("change", (e) => {
  selectedSiteId = e.target.value;
  refreshFloors();
});

document.getElementById("btn-new-site")?.addEventListener("click", async () => {
  const name = prompt("現場名");
  if (!name) return;
  if (!navigator.onLine) {
    queueOffline("createSite", { name });
    setStatus("オフライン: 現場作成をキューに保存");
    return;
  }
  await apiPost(`/api/customer/${customerCode}/sites`, { name });
  await loadSites();
  setStatus(`現場作成: ${name}`);
});

document.getElementById("floor-upload")?.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file || !selectedFloorId) return;
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  await apiPost(`/api/customer/${customerCode}/floors/upload`, {
    floorId: selectedFloorId,
    fileName: file.name,
    mimeType: file.type,
    imageBase64: b64,
  });
  setStatus("図面アップロード完了");
});

document.getElementById("btn-archive-floor")?.addEventListener("click", async () => {
  if (!selectedFloorId) return;
  const res = await apiPost(`/api/customer/${customerCode}/floorplans/${selectedFloorId}/archive`, {});
  setStatus(res.message ?? "アーカイブ完了");
});

document.getElementById("device-wizard")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    serial: fd.get("serial"),
    type: fd.get("type"),
    room: fd.get("room") || undefined,
    siteId: selectedSiteId || undefined,
    floor: selectedFloorId || undefined,
  };
  if (!navigator.onLine) {
    queueOffline("wizard", body);
    setStatus("オフライン: 登録をキューに保存");
    return;
  }
  const res = await apiPost(`/api/customer/${customerCode}/devices/wizard`, body);
  setStatus(`登録: ${res.deviceId}`);
  await loadDevices();
});

document.getElementById("btn-qr-create")?.addEventListener("click", async () => {
  const deviceId = document.getElementById("qr-device-id").value.trim();
  const deviceType = document.getElementById("qr-device-type").value.trim();
  const serialNumber = document.getElementById("qr-serial").value.trim();
  const res = await apiPost(`/api/customer/${customerCode}/devices/qr/create`, {
    deviceId,
    deviceType,
    serialNumber,
  });
  document.getElementById("qr-payload").value = res.qrPayload;
  document.getElementById("qr-result").textContent = `expires: ${res.expiresAt}`;
});

document.getElementById("btn-qr-claim")?.addEventListener("click", async () => {
  let payload;
  try {
    payload = JSON.parse(document.getElementById("qr-payload").value);
  } catch {
    setStatus("QR JSON が不正です");
    return;
  }
  const res = await apiPost(`/api/customer/${customerCode}/devices/qr/claim`, {
    device_id: payload.device_id,
    device_type: payload.device_type,
    serial_number: payload.serial_number,
    provisioning_token: payload.provisioning_token,
    siteId: selectedSiteId,
    floorId: selectedFloorId,
  });
  document.getElementById("qr-result").textContent = JSON.stringify(res, null, 2);
  await loadDevices();
  setStatus("QR Claim 完了");
});

document.getElementById("btn-nfc-claim")?.addEventListener("click", async () => {
  const nfcUid = document.getElementById("nfc-uid").value.trim();
  const res = await apiPost(`/api/customer/${customerCode}/devices/nfc/claim`, {
    nfcUid,
    siteId: selectedSiteId,
    floorId: selectedFloorId,
  });
  setStatus(`NFC: ${res.deviceId}`);
  await loadDevices();
});

document.querySelectorAll("[data-test]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.dataset.test;
    const id = document.getElementById("test-device-select").value;
    const res = await apiPost(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/test/${kind}`, {});
    document.getElementById("test-result").textContent = JSON.stringify(res, null, 2);
    await loadDevices();
  });
});

document.getElementById("btn-mqtt-refresh")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const res = await apiGet(`/api/customer/${customerCode}/install/mqtt/${encodeURIComponent(id)}`);
  document.getElementById("mqtt-diag").textContent = JSON.stringify(res, null, 2);
});

async function loadChecklist() {
  const id = document.getElementById("check-device-select").value;
  if (!id) return;
  const all = await apiGet(`/api/customer/${customerCode}/install/checklist`);
  const dev = (all.devices ?? []).find((d) => d.deviceId === id);
  const box = document.getElementById("checklist-items");
  box.innerHTML = (dev?.items ?? [])
    .map(
      (i) =>
        `<div class="checklist-item ${i.completed ? "done" : ""}">${i.label} ${i.completed ? "✓" : ""}</div>`
    )
    .join("");
}

document.getElementById("check-device-select")?.addEventListener("change", loadChecklist);

document.getElementById("btn-completion-report")?.addEventListener("click", () => {
  window.open(`/api/customer/${customerCode}/install/completion-report`, "_blank");
});

document.getElementById("btn-label")?.addEventListener("click", async () => {
  const id = document.getElementById("check-device-select").value;
  const res = await apiGet(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/label`);
  alert(res.labelText + "\n\nQR payload length: " + (res.qrPayload?.length ?? 0));
});

async function init() {
  if (!getAdminToken()) {
    location.href = `/customer/${customerCode}`;
    return;
  }
  loadOfflineQueue();
  await Promise.all([loadSites(), loadDevices(), loadTemplates()]);
  setStatus("施工 PWA 準備完了");
  await loadChecklist();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

init().catch((e) => setStatus(String(e)));
