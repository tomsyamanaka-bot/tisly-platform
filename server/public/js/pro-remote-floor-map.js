const TOKEN_KEY = "tisly_token";

function customerCodeFromPath() {
  const m = window.location.pathname.match(/\/customer\/([^/]+)/i);
  return (m?.[1] || "TOMS001").toUpperCase();
}

function apiHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: apiHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const PIN_COLORS = { ONLINE: "#22c55e", WARNING: "#eab308", OFFLINE: "#ef4444" };
const CODE = customerCodeFromPath();
const TIER_ORDER = ["perimeter", "1f", "2f"];

let stackData = { layers: [], alert: {} };
let activeTier = null;
const layerZoom = new Map();

function renderLayer(layer) {
  const section = document.createElement("section");
  section.className = "floor-map-layer";
  section.dataset.tier = layer.tier;
  section.dataset.layerId = layer.layerId;

  const header = document.createElement("div");
  header.className = "floor-map-layer-header";

  const title = document.createElement("h2");
  title.textContent = layer.displayName;
  header.appendChild(title);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "floor-map-name-input";
  nameInput.value = layer.displayName;
  nameInput.title = "フロア名編集";
  nameInput.addEventListener("change", async () => {
    try {
      await apiPatch(`/api/customer/${CODE}/pro-remote/floor-stack/layers/${layer.layerId}`, {
        displayName: nameInput.value,
      });
      title.textContent = nameInput.value;
    } catch {
      alert("名前保存にはログインが必要です");
    }
  });
  header.appendChild(nameInput);

  const zoomBar = document.createElement("div");
  zoomBar.className = "floor-map-zoom-bar";
  const zoomOut = document.createElement("button");
  zoomOut.type = "button";
  zoomOut.textContent = "−";
  zoomOut.title = "ズームアウト";
  const zoomReset = document.createElement("button");
  zoomReset.type = "button";
  zoomReset.textContent = "リセット";
  zoomReset.title = "ズームリセット";
  const zoomIn = document.createElement("button");
  zoomIn.type = "button";
  zoomIn.textContent = "+";
  zoomIn.title = "ズームイン";
  zoomBar.append(zoomOut, zoomReset, zoomIn);
  header.appendChild(zoomBar);
  section.appendChild(header);

  const svgPlaceholder = document.createElement("p");
  svgPlaceholder.className = "floor-map-svg-hint hint";
  svgPlaceholder.textContent = "SVG枠線編集: Phase 521+（placeholder）";
  section.appendChild(svgPlaceholder);

  const canvas = document.createElement("div");
  canvas.className = "floor-map-canvas";
  const plan = document.createElement("div");
  plan.className = "floor-map-plan";
  const zoomInner = document.createElement("div");
  zoomInner.className = "floor-map-zoom-inner";
  let zoom = layerZoom.get(layer.layerId) ?? 1;
  const applyZoom = () => {
    zoomInner.style.transform = `scale(${zoom})`;
    layerZoom.set(layer.layerId, zoom);
  };
  applyZoom();
  zoomIn.addEventListener("click", () => {
    zoom = Math.min(2.5, zoom + 0.15);
    applyZoom();
  });
  zoomOut.addEventListener("click", () => {
    zoom = Math.max(0.5, zoom - 0.15);
    applyZoom();
  });
  zoomReset.addEventListener("click", () => {
    zoom = 1;
    applyZoom();
  });

  if (layer.imageUrl) {
    const img = document.createElement("img");
    img.src = layer.imageUrl;
    img.alt = layer.displayName;
    img.className = "floor-map-image";
    zoomInner.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "floor-map-placeholder";
    ph.textContent = "図面未設定（現調図面を PRO にインポート可能）";
    zoomInner.appendChild(ph);
  }

  const overlay = document.createElement("div");
  overlay.className = "floor-map-overlay";

  const allPins = [
    ...(layer.pins || []),
    ...(layer.devices || [])
      .filter((d) => d.posX != null && d.posY != null)
      .map((d) => ({
        id: d.deviceId,
        pinType: d.iconType || d.deviceType || "esp",
        label: d.label,
        posX: d.posX,
        posY: d.posY,
        status: d.deviceStatus === "ONLINE" ? "ONLINE" : d.deviceStatus === "WARNING" ? "WARNING" : "OFFLINE",
        draggable: false,
      })),
  ];

  for (const pin of allPins) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "floor-map-pin";
    el.dataset.pinId = pin.id;
    el.style.left = `${Math.min(98, Math.max(2, pin.posX))}%`;
    el.style.top = `${Math.min(98, Math.max(2, pin.posY))}%`;
    el.style.background = PIN_COLORS[pin.status] || PIN_COLORS.OFFLINE;
    el.title = `${pin.pinType}: ${pin.label || pin.id} (${pin.status}) — ドラッグで移動`;
    el.textContent = (pin.pinType || "?").slice(0, 2).toUpperCase();
    overlay.style.pointerEvents = "auto";
    if (pin.draggable !== false && pin.id && layer.pins?.some((p) => p.id === pin.id)) {
      setupPinDrag(el, pin, layer.layerId, plan);
    }
    overlay.appendChild(el);
  }

  plan.appendChild(zoomInner);
  plan.appendChild(overlay);
  canvas.appendChild(plan);
  section.appendChild(canvas);

  plan.addEventListener("click", async (ev) => {
    if (ev.target.closest(".floor-map-pin")) return;
    if (!ev.target.classList.contains("floor-map-plan") && !ev.target.classList.contains("floor-map-image") && !ev.target.classList.contains("floor-map-placeholder") && !ev.target.closest(".floor-map-zoom-inner")) return;
    const rect = plan.getBoundingClientRect();
    const posX = ((ev.clientX - rect.left) / rect.width) * 100;
    const posY = ((ev.clientY - rect.top) / rect.height) * 100;
    const pinType = document.getElementById("floor-pin-type")?.value || "esp";
    try {
      await apiPost(`/api/customer/${CODE}/pro-remote/floor-stack/pins`, {
        layerId: layer.layerId,
        pinType,
        posX,
        posY,
        label: "現場ピン",
      });
      await loadStack();
    } catch {
      alert("ピン配置にはログインが必要です");
    }
  });

  return section;
}

function setupPinDrag(el, pin, layerId, plan) {
  let dragging = false;
  el.addEventListener("pointerdown", (ev) => {
    dragging = true;
    el.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  });
  el.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const rect = plan.getBoundingClientRect();
    const posX = Math.min(98, Math.max(2, ((ev.clientX - rect.left) / rect.width) * 100));
    const posY = Math.min(98, Math.max(2, ((ev.clientY - rect.top) / rect.height) * 100));
    el.style.left = `${posX}%`;
    el.style.top = `${posY}%`;
  });
  el.addEventListener("pointerup", async (ev) => {
    if (!dragging) return;
    dragging = false;
    const rect = plan.getBoundingClientRect();
    const posX = Math.min(98, Math.max(2, ((ev.clientX - rect.left) / rect.width) * 100));
    const posY = Math.min(98, Math.max(2, ((ev.clientY - rect.top) / rect.height) * 100));
    try {
      await apiPatch(`/api/customer/${CODE}/pro-remote/floor-stack/pins/${pin.id}`, { posX, posY });
    } catch {
      /* revert on next poll */
    }
  });
}

function scrollToTier(tier) {
  const el = document.querySelector(`.floor-map-layer[data-tier="${tier}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadStack() {
  const root = document.getElementById("floor-map-stack");
  if (!root) return;
  root.innerHTML = "<p class='hint'>読込中…</p>";
  try {
    stackData = await apiGet(`/api/customer/${CODE}/pro-remote/floor-stack`);
    root.innerHTML = "";
    const sorted = [...(stackData.layers || [])].sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
    );
    for (const layer of sorted) {
      root.appendChild(renderLayer(layer));
    }
    const alert = stackData.alert;
    const alertEl = document.getElementById("floor-map-alert");
    if (alertEl) {
      if (alert?.tier) {
        alertEl.textContent = `異常検知: ${alert.tier} へジャンプ可能`;
        alertEl.hidden = false;
        if (!activeTier) {
          scrollToTier(alert.tier);
          activeTier = alert.tier;
        }
      } else {
        alertEl.textContent = "全階正常（外周 → 1F → 2F）";
        alertEl.hidden = false;
      }
    }
  } catch {
    root.innerHTML = "<p>フロアマップの読込には App Hub からのログインが必要です。</p>";
  }
}

document.getElementById("btn-floor-alert-jump")?.addEventListener("click", () => {
  const tier = stackData.alert?.tier;
  if (tier) scrollToTier(tier);
  else alert("異常階はありません");
});

export function initProRemoteFloorMap() {
  loadStack();
  setInterval(loadStack, 30000);
}
