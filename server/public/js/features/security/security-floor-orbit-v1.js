/**
 * 3D俯瞰のスクロール連動360度回転
 * タッチドラッグでも視点を動かす
 */

const orbit = {
  dragZ: 0,
  pitch: 55,
  dragging: false,
  lastX: 0,
  lastY: 0,
  pointerId: null,
};

export function applySecurityOrbit() {
  const el = document.getElementById("sf-iso-orbit");
  if (!el) return;
  const vh = Math.max(120, window.innerHeight * 0.85);
  const scrollZ =
    ((window.scrollY || 0) / vh) * 360;
  const z = ((scrollZ + orbit.dragZ) % 360 + 360) % 360;
  el.style.transform = `rotateX(${orbit.pitch}deg) rotateZ(${z}deg)`;
}

function onPointerDown(e) {
  const wrap = e.target.closest("#sf-map-wrap");
  if (!wrap) return;
  orbit.dragging = true;
  orbit.lastX = e.clientX;
  orbit.lastY = e.clientY;
  orbit.pointerId = e.pointerId;
  wrap.classList.add("is-dragging");
  try {
    wrap.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!orbit.dragging) return;
  if (
    orbit.pointerId != null &&
    e.pointerId !== orbit.pointerId
  ) {
    return;
  }
  const dx = e.clientX - orbit.lastX;
  const dy = e.clientY - orbit.lastY;
  orbit.lastX = e.clientX;
  orbit.lastY = e.clientY;
  orbit.dragZ += dx * 0.45;
  orbit.pitch = Math.min(
    72,
    Math.max(28, orbit.pitch - dy * 0.18)
  );
  if (e.cancelable) e.preventDefault();
  applySecurityOrbit();
}

function onPointerUp(e) {
  if (!orbit.dragging) return;
  if (
    orbit.pointerId != null &&
    e.pointerId !== orbit.pointerId
  ) {
    return;
  }
  orbit.dragging = false;
  orbit.pointerId = null;
  document
    .getElementById("sf-map-wrap")
    ?.classList.remove("is-dragging");
}

let bound = false;

export function bindSecurityOrbit() {
  applySecurityOrbit();
  if (bound || window.__TISLY_SF_ORBIT_BOUND) return;
  bound = true;
  window.addEventListener("scroll", applySecurityOrbit, {
    passive: true,
  });
  window.addEventListener("resize", applySecurityOrbit);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, {
    passive: false,
  });
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
}
