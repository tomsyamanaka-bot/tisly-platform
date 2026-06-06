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
const PIN_ABBR = {
  camera: "CA",
  beam: "BE",
  pir: "PI",
  door: "DO",
  window: "WI",
  relay: "RE",
  esp: "ES",
  shelly: "SH",
  speaker: "SP",
  light: "LI",
};

function pinLabel(pin) {
  const t = (pin.pinType || pin.iconType || pin.deviceType || "esp").toLowerCase();
  return PIN_ABBR[t] || t.slice(0, 2).toUpperCase();
}
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
    img.addEventListener("load", () => {
      console.log("[floor-map] SVG loaded", { tier: layer.tier, url: layer.imageUrl });
    });
    img.addEventListener("error", () => {
      console.error("[floor-map] SVG load failed", {
        tier: layer.tier,
        layerId: layer.layerId,
        url: layer.imageUrl,
        displayName: layer.displayName,
      });
      const err = document.createElement("p");
      err.className = "floor-map-svg-error hint";
      err.textContent = `図面読込失敗: ${layer.imageUrl}`;
      section.appendChild(err);
    });
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
    el.className = "floor-map-pin" + (pin.blink ? " floor-map-pin--blink" : "");
    el.dataset.pinId = pin.id;
    el.dataset.cameraId = pin.cameraId || pin.deviceId || "";
    el.style.left = `${Math.min(98, Math.max(2, pin.posX))}%`;
    el.style.top = `${Math.min(98, Math.max(2, pin.posY))}%`;
    el.style.background = PIN_COLORS[pin.status] || PIN_COLORS.OFFLINE;
    el.title = `${pin.pinType}: ${pin.label || pin.id} (${pin.status}) — ドラッグで移動`;
    el.textContent = pinLabel(pin);
    overlay.style.pointerEvents = "auto";
    if (pin.draggable !== false && pin.id && layer.pins?.some((p) => p.id === pin.id)) {
      setupPinDrag(el, pin, layer.layerId, plan);
    }
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showPinActions(pin, layer);
    });
    overlay.appendChild(el);
  }

  plan.appendChild(zoomInner);
  plan.appendChild(overlay);
  canvas.appendChild(plan);
  section.appendChild(canvas);

  if (layer.fieldMedia?.length) {
    const mediaBar = document.createElement("div");
    mediaBar.className = "floor-map-field-media";
    for (const m of layer.fieldMedia.slice(0, 6)) {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "floor-map-media-thumb";
      thumb.title = `${m.source}: ${m.label}`;
      const img = document.createElement("img");
      img.src = m.url;
      img.alt = m.label;
      img.loading = "lazy";
      thumb.appendChild(img);
      const badge = document.createElement("span");
      badge.className = "floor-map-media-badge";
      badge.textContent = m.source === "drawing" ? "図" : m.source === "install" ? "施" : "調";
      thumb.appendChild(badge);
      thumb.addEventListener("click", () => window.open(m.url, "_blank"));
      mediaBar.appendChild(thumb);
    }
    section.appendChild(mediaBar);
  }

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

function showPinActions(pin, layer) {
  const cameraId = pin.cameraId || (pin.pinType === "camera" ? pin.deviceId : null);
  const actions = [];
  if (cameraId) {
    actions.push(`カメラ: ${pin.linkedCameraLabel || cameraId}`);
  }
  const choice = window.prompt(
    `${pin.label || pin.id} (${layer.displayName})\n` +
      (actions.length ? actions.join("\n") + "\n\n" : "") +
      "1=TVへ送る  2=施工写真  3=フォーカス",
    "1"
  );
  if (choice === "1" && cameraId) {
    void apiPost(`/api/customer/${CODE}/pro-remote/focus`, {
      floor: layer.tier,
      pinId: pin.id,
      cameraId,
      trigger: "pro_remote_ui",
    });
    void fetch("/api/tv/focus-camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerCode: CODE,
        cameraId,
        floor: layer.tier,
        trigger: "pro_remote",
      }),
    });
    alert(`TVへ送信中: ${cameraId}`);
  } else if (choice === "2" && pin.constructionPhotoUrl) {
    window.open(pin.constructionPhotoUrl, "_blank");
  } else if (choice === "3") {
    scrollToTier(layer.tier);
    void apiPost(`/api/customer/${CODE}/pro-remote/focus`, {
      floor: layer.tier,
      pinId: pin.id,
      cameraId,
      trigger: "manual",
    });
  }
}

function renderSecurityBadge(security) {
  const el = document.getElementById("pro-remote-security-badge");
  if (!el || !security) return;
  el.hidden = false;
  el.className = `pro-security-badge${security.armed ? " pro-security-badge--armed" : ""}`;
  el.textContent = `${security.label} · ${security.lockState} · ${security.switchbotMode}`;
}

async function loadStack() {
  const root = document.getElementById("floor-map-stack");
  if (!root) return;
  root.innerHTML = "<p class='hint'>読込中…</p>";
  try {
    stackData = await apiGet(`/api/customer/${CODE}/pro-remote/floor-stack?rc=2`);
    renderSecurityBadge(stackData.security);
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
        scrollToTier(alert.tier);
        activeTier = alert.tier;
        document.querySelectorAll(".floor-map-pin--blink").forEach((el) => {
          el.classList.add("floor-map-pin--blink-active");
        });
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

function connectSecurityWs() {
  if (typeof WebSocket === "undefined") return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const payload = msg.payload ?? msg;
      if (msg.type === "security_focus" || payload.event?.startsWith("switchbot_")) {
        if (!payload.customerCode || payload.customerCode.toUpperCase() === CODE) {
          const floor = payload.floor ?? (payload.event === "switchbot_locked" ? "perimeter" : "1f");
          scrollToTier(floor);
          void loadStack();
        }
      }
    } catch {
      /* */
    }
  };
}

export function initProRemoteFloorMap() {
  loadStack();
  connectSecurityWs();
  setInterval(loadStack, 30000);
}
