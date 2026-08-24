/**
 * フロア表示同期（ボタン切替専用）
 * 縦スワイプ / ホイールによる階層切替は無効。
 * 3D操作は OrbitControls（回転・ピンチ）へ委譲。
 */

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

/**
 * 枠外「1F」「外周」ボタンから階層を切替
 * ジェスチャ経路は持たない
 */
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

let bound = false;

/** ジェスチャ階層切替は登録しない（ボタン専用） */
export function bindSecurityOrbit() {
  applySecurityOrbit();
  if (bound || window.__TISLY_SF_ORBIT_BOUND) return;
  bound = true;
  window.__TISLY_SF_ORBIT_BOUND = true;
}
