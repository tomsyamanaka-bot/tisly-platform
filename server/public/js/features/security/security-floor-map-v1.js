/**
 * フロア俯瞰 SVG 描画
 * 部屋とセンサーを重ねる
 */

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderFloorMapSvg(rooms, sensors, floorId) {
  const floorRooms = (rooms || []).filter(
    (r) => r.floorId === floorId
  );
  const floorSensors = (sensors || []).filter(
    (s) => s.floorId === floorId
  );
  const roomRects = floorRooms
    .map((r) => {
      const cls = r.alertVisible
        ? "sf-room is-alert"
        : "sf-room";
      const tx = r.x + r.w / 2;
      const ty = r.y + r.h / 2;
      return `
        <rect
          class="${cls}"
          data-room-id="${escapeHtml(r.id)}"
          x="${r.x}" y="${r.y}"
          width="${r.w}" height="${r.h}"
          rx="2"
        ></rect>
        <text
          class="sf-room-label"
          x="${tx}" y="${ty}"
          text-anchor="middle"
        >${escapeHtml(r.label)}</text>`;
    })
    .join("");
  const pins = floorSensors
    .map((s) => {
      const cls = s.alertVisible
        ? "sf-pin is-alert"
        : "sf-pin";
      return `
        <g
          class="${cls}"
          data-sensor-id="${escapeHtml(s.id)}"
          transform="translate(${s.x} ${s.y})"
        >
          <circle class="sf-pin-bg" r="5.6"></circle>
          <text class="sf-pin-icon" y="0.6"
          >${s.icon || "●"}</text>
        </g>`;
    })
    .join("");
  return `
    <svg
      class="sf-map"
      viewBox="0 0 100 100"
      role="img"
      aria-label="フロア俯瞰図"
    >
      ${roomRects}
      ${pins}
    </svg>`;
}

export function renderFloorTabs(floors, activeId) {
  return (floors || [])
    .map((f) => {
      const on = f.id === activeId ? " is-on" : "";
      const disabled = f.enabled ? "" : "disabled";
      return `
        <button
          type="button"
          class="sf-tab${on}"
          data-floor="${escapeHtml(f.id)}"
          ${disabled}
        >${escapeHtml(f.label)}</button>`;
    })
    .join("");
}

export function renderGuardModes(mode) {
  const items = [
    { id: "home", label: "🟢 在宅警備" },
    { id: "away", label: "🔵 外出警戒" },
    { id: "disarmed", label: "⚪ 警戒解除" },
  ];
  return items
    .map((it) => {
      const on = it.id === mode ? " is-on" : "";
      return `
        <button
          type="button"
          class="sf-mode${on}"
          data-mode="${it.id}"
        >${it.label}</button>`;
    })
    .join("");
}

export function pickDefaultFloor(floors) {
  const list = floors || [];
  const enabled = list.filter((f) => f.enabled);
  return (enabled[0] || list[0] || { id: "1f" }).id;
}
