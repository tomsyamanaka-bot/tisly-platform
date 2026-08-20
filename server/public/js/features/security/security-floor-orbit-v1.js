/**
 * 立体ドラム式フロア切替（rotateX + translateZ）
 * マップ上の縦スワイプ / ホイールで 2F → 1F → 外周 を回転
 */

const DRUM_ORDER = ["2f", "1f", "outdoor"];

const drum = {
  dragging: false,
  lastY: 0,
  accY: 0,
  pointerId: null,
};

function layersOf(el) {
  return [...(el?.querySelectorAll(".sf-iso-layer") || [])];
}

function syncFloorTabs(id) {
  document.querySelectorAll("#sf-floor-tabs [data-floor]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-floor") === id);
  });
}

export function applySecurityOrbit() {
  const el = document.getElementById("sf-iso-orbit");
  if (!el) return;
  const layers = layersOf(el);
  const n = Math.max(layers.length, 1);
  const step = 360 / n;
  const h = el.offsetHeight || 320;
  // 正多角形ドラム: 面の高さ H に対し r = H / (2·tan(π/n))
  const radius = Math.max(
    72,
    Math.round(h / (2 * Math.tan(Math.PI / Math.max(n, 2))))
  );
  const focus = el.getAttribute("data-focus") || "1f";
  let index = layers.findIndex((l) => l.getAttribute("data-layer") === focus);
  if (index < 0) index = 0;
  el.style.setProperty("--drum-step", `${step}deg`);
  el.style.setProperty("--drum-r", `${radius}px`);
  layers.forEach((layer, i) => {
    layer.style.setProperty("--drum-i", String(i));
    layer.classList.toggle("is-focus", i === index);
    layer.classList.toggle("is-dim", i !== index);
  });
  el.style.transform = `rotateX(${-index * step}deg)`;
  window.__TISLY_SF_FLOOR = layers[index]?.getAttribute("data-layer") || focus;
}

export function setSecurityDrumFloor(id) {
  const el = document.getElementById("sf-iso-orbit");
  if (!el) return;
  const layers = layersOf(el);
    const next = layers.some((l) => l.getAttribute("data-layer") === id)
    ? id
    : layers.find((l) => l.getAttribute("data-layer") === "1f")?.getAttribute(
        "data-layer"
      ) ||
      layers[0]?.getAttribute("data-layer") ||
      "1f";
  el.setAttribute("data-focus", next);
  syncFloorTabs(next);
  applySecurityOrbit();
  try {
    window.TislySecurityIso3d?.setFloor?.(next);
  } catch {
    /* ignore */
  }
  document.dispatchEvent(
    new CustomEvent("tisly-sf-floor", { detail: { id: next } })
  );
}

function stepFloor(dir) {
  const el = document.getElementById("sf-iso-orbit");
  if (!el) return;
  const layers = layersOf(el);
  if (!layers.length) return;
  const focus = el.getAttribute("data-focus") || "1f";
  let index = layers.findIndex((l) => l.getAttribute("data-layer") === focus);
  if (index < 0) {
    index = DRUM_ORDER.indexOf(focus);
  }
  const next = layers[(index + dir + layers.length) % layers.length];
  setSecurityDrumFloor(next.getAttribute("data-layer"));
}

function isIso3dPointerTarget(t) {
  return !!(
    t &&
    t.closest &&
    (t.closest("#sf-iso3d-mount") ||
      t.closest(".sf-iso3d-canvas") ||
      t.closest(".sf-iso3d-labels") ||
      t.closest(".sf-iso3d-pin"))
  );
}

function onPointerDown(e) {
  const wrap = e.target.closest("#sf-map-wrap");
  if (!wrap) return;
  /* 3Dキャンバス上は OrbitControls に委ね、ドラム縦スワイプは無効 */
  if (isIso3dPointerTarget(e.target)) return;
  drum.dragging = true;
  drum.lastY = e.clientY;
  drum.accY = 0;
  drum.pointerId = e.pointerId;
  wrap.classList.add("is-dragging");
  try {
    wrap.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!drum.dragging) return;
  if (drum.pointerId != null && e.pointerId !== drum.pointerId) return;
  const dy = e.clientY - drum.lastY;
  drum.lastY = e.clientY;
  drum.accY += dy;
  if (e.cancelable) e.preventDefault();
}

function onPointerUp(e) {
  if (!drum.dragging) return;
  if (drum.pointerId != null && e.pointerId !== drum.pointerId) return;
  if (drum.accY > 42) stepFloor(1);
  else if (drum.accY < -42) stepFloor(-1);
  drum.dragging = false;
  drum.pointerId = null;
  drum.accY = 0;
  document.getElementById("sf-map-wrap")?.classList.remove("is-dragging");
}

let bound = false;

export function bindSecurityOrbit() {
  applySecurityOrbit();
  if (bound || window.__TISLY_SF_ORBIT_BOUND) return;
  bound = true;
  window.__TISLY_SF_ORBIT_BOUND = true;
  const wrap = document.getElementById("sf-map-wrap");
  wrap?.addEventListener("pointerdown", onPointerDown);
  wrap?.addEventListener("pointermove", onPointerMove, { passive: false });
  wrap?.addEventListener("pointerup", onPointerUp);
  wrap?.addEventListener("pointercancel", onPointerUp);
  wrap?.addEventListener(
    "wheel",
    (e) => {
      /* 3D上のホイールはズーム。フロア切替は Shift+ホイール or HUD 上 */
      if (isIso3dPointerTarget(e.target) && !e.shiftKey) return;
      if (Math.abs(e.deltaY) < 8) return;
      e.preventDefault();
      stepFloor(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false }
  );
}
