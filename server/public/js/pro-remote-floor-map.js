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

const PIN_COLORS = { ONLINE: "#22c55e", WARNING: "#eab308", OFFLINE: "#ef4444" };
const CODE = customerCodeFromPath();

let stackData = { layers: [], alert: {} };
let activeTier = null;

function renderLayer(layer) {
  const section = document.createElement("section");
  section.className = "floor-map-layer";
  section.dataset.tier = layer.tier;
  section.dataset.layerId = layer.layerId;

  const title = document.createElement("h2");
  title.textContent = layer.displayName;
  section.appendChild(title);

  const canvas = document.createElement("div");
  canvas.className = "floor-map-canvas";
  const plan = document.createElement("div");
  plan.className = "floor-map-plan";

  if (layer.imageUrl) {
    const img = document.createElement("img");
    img.src = layer.imageUrl;
    img.alt = layer.displayName;
    img.className = "floor-map-image";
    plan.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "floor-map-placeholder";
    ph.textContent = "図面未設定（現調図面を PRO にインポート可能）";
    plan.appendChild(ph);
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
      })),
  ];

  for (const pin of allPins) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "floor-map-pin";
    el.style.left = `${Math.min(98, Math.max(2, pin.posX))}%`;
    el.style.top = `${Math.min(98, Math.max(2, pin.posY))}%`;
    el.style.background = PIN_COLORS[pin.status] || PIN_COLORS.OFFLINE;
    el.title = `${pin.pinType}: ${pin.label || pin.id} (${pin.status})`;
    el.textContent = (pin.pinType || "?").slice(0, 2).toUpperCase();
    overlay.appendChild(el);
  }

  plan.appendChild(overlay);
  canvas.appendChild(plan);
  section.appendChild(canvas);

  canvas.addEventListener("click", async (ev) => {
    if (!ev.target.classList.contains("floor-map-plan") && !ev.target.classList.contains("floor-map-image")) return;
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
    const sorted = [...(stackData.layers || [])].sort((a, b) => a.sortOrder - b.sortOrder);
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
        alertEl.textContent = "全階正常";
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
