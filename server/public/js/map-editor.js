import { apiGet, apiPost, apiPut, getAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
document.getElementById("editor-customer-code").textContent = customerCode;
document.getElementById("link-portal").href = `/customer/${customerCode}`;
document.getElementById("link-install").href = `/customer/${customerCode}/install`;

const params = new URLSearchParams(location.search);
const jumpFloor = params.get("floor");
const jumpX = params.get("x");
const jumpY = params.get("y");

const canvas = document.getElementById("map-canvas");
const floorSelect = document.getElementById("floor-select");
const floorBg = document.getElementById("floor-bg");
const statusEl = document.getElementById("map-status");
const palette = document.getElementById("palette-devices");

let sites = [];
let devices = [];
let selectedDeviceId = null;
let currentFloorId = null;

function pctFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
  };
}

function renderPins(floorView) {
  canvas.querySelectorAll(".map-pin-device").forEach((el) => el.remove());
  const list = floorView?.devices ?? devices.filter((d) => d.floorId === currentFloorId || d.posX != null);
  for (const d of list) {
    if (d.posX == null && d.posY == null) continue;
    const pin = document.createElement("div");
    pin.className = `map-pin-device ${d.online ? "" : "offline"}`;
    pin.textContent = d.label || d.deviceId;
    pin.style.left = `${(d.posX ?? 0) * 100}%`;
    pin.style.top = `${(d.posY ?? 0) * 100}%`;
    pin.dataset.deviceId = d.deviceId;
    pin.draggable = true;
    pin.addEventListener("dragstart", (e) => {
      selectedDeviceId = d.deviceId;
      e.dataTransfer.setData("text/plain", d.deviceId);
    });
    if (jumpFloor === currentFloorId && d.deviceId && jumpX && Math.abs(d.posX - parseFloat(jumpX)) < 0.05) {
      pin.style.outline = "3px solid #f59e0b";
    }
    canvas.appendChild(pin);
  }
}

async function loadFloor(floorId) {
  currentFloorId = floorId;
  const view = await apiGet(`/api/customer/${customerCode}/map/floor/${floorId}`);
  if (view.imageUrl) {
    floorBg.src = view.imageUrl;
    floorBg.hidden = false;
  } else {
    floorBg.hidden = true;
  }
  devices = view.devices;
  renderPins(view);
  statusEl.textContent = `${view.floorName} — ${view.devices.length} 設備`;
}

async function init() {
  if (!getAdminToken()) {
    location.href = `/customer/${customerCode}`;
    return;
  }
  const data = await apiGet(`/api/customer/${customerCode}/sites/builder`);
  sites = data.sites ?? [];
  floorSelect.innerHTML = "";
  for (const s of sites) {
    for (const f of s.floors ?? []) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = `${s.name} / ${f.name}`;
      floorSelect.appendChild(opt);
    }
  }
  const allDevices = await apiGet(`/api/customer/${customerCode}/map/devices`);
  devices = allDevices.devices ?? [];
  palette.innerHTML = devices
    .map(
      (d) =>
        `<li data-id="${d.deviceId}">${d.label || d.deviceId} <small>${d.deviceType}</small></li>`
    )
    .join("");
  palette.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      selectedDeviceId = li.dataset.id;
      statusEl.textContent = `選択: ${selectedDeviceId}`;
    });
  });

  if (floorSelect.options.length) {
    floorSelect.value = jumpFloor || floorSelect.options[0].value;
    await loadFloor(floorSelect.value);
  }

  floorSelect.addEventListener("change", () => loadFloor(floorSelect.value));

  canvas.addEventListener("dragover", (e) => e.preventDefault());
  canvas.addEventListener("drop", async (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || selectedDeviceId;
    if (!id) return;
    const pos = pctFromEvent(e);
    await apiPut(`/api/customer/${customerCode}/map/devices/${encodeURIComponent(id)}`, {
      posX: pos.x,
      posY: pos.y,
      floorId: currentFloorId,
      iconType: "sensor",
    });
    await loadFloor(currentFloorId);
  });

  canvas.addEventListener("click", async (e) => {
    if (!selectedDeviceId) return;
    const pos = pctFromEvent(e);
    await apiPut(`/api/customer/${customerCode}/map/devices/${encodeURIComponent(selectedDeviceId)}`, {
      posX: pos.x,
      posY: pos.y,
      floorId: currentFloorId,
    });
    await loadFloor(currentFloorId);
  });

  document.getElementById("floor-upload")?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file || !currentFloorId) return;
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    await apiPost(`/api/customer/${customerCode}/floors/upload`, {
      floorId: currentFloorId,
      fileName: file.name,
      mimeType: file.type,
      imageBase64: b64,
    });
    await loadFloor(currentFloorId);
  });

  document.getElementById("btn-save-map")?.addEventListener("click", () => {
    statusEl.textContent = "保存済み（各操作で自動保存）";
  });

  document.getElementById("btn-add-camera")?.addEventListener("click", async () => {
    const name = prompt("カメラ名");
    if (!name) return;
    await apiPost(`/api/customer/${customerCode}/cameras`, { cameraName: name, siteId: sites[0]?.id });
    statusEl.textContent = "カメラ登録しました";
  });
}

init().catch((e) => {
  statusEl.textContent = String(e);
});
