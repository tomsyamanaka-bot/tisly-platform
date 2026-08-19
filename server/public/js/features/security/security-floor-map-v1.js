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
    { id: "home", label: "🛡️ 在宅警備" },
    { id: "away", label: "🛡️ 外出警戒" },
    { id: "disarmed", label: "🛡️ 警戒解除" },
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

export function socFloorLabel(id, fallback) {
  if (id === "outdoor") return "外周・敷地";
  if (id === "1f") return "1F";
  if (id === "2f") return "2F";
  if (id === "all") return "全体俯瞰";
  return fallback || id;
}

export function visibleFloors(floors) {
  const order = { outdoor: 0, "2f": 1, "1f": 2 };
  return (floors || [])
    .filter((f) => f.id !== "roof")
    .sort(
      (a, b) => (order[a.id] ?? 9) - (order[b.id] ?? 9)
    );
}

function furnitureHints(room) {
  if (room.w < 18 || room.h < 16) return "";
  const fx = room.x + 3;
  const fy = room.y + 3;
  const fw = Math.max(6, room.w * 0.28);
  const fh = Math.max(4, room.h * 0.18);
  return `<rect class="sf-furn" x="${fx}" y="${fy}"
    width="${fw}" height="${fh}" rx="0.8"></rect>`;
}

function layerDecorations(floorId, opts = {}) {
  if (floorId === "outdoor") {
    return `
      <g class="sf-deco sf-deco-yard" pointer-events="none">
        <rect class="sf-car" x="14" y="38" width="16" height="9" rx="1.6"></rect>
        <rect class="sf-car" x="34" y="52" width="16" height="9" rx="1.6"></rect>
        <rect class="sf-garage" x="10" y="20" width="28" height="14" rx="1.2"></rect>
      </g>`;
  }
  if (opts.lightingOn > 0 && (floorId === "1f" || floorId === "2f")) {
    return `
      <g class="sf-deco sf-deco-lights is-on" pointer-events="none">
        <circle class="sf-light" cx="22" cy="22" r="2.2"></circle>
        <circle class="sf-light" cx="52" cy="28" r="2.2"></circle>
        <circle class="sf-light" cx="78" cy="24" r="2.2"></circle>
      </g>`;
  }
  return "";
}

export function renderIsoLayerSvg(
  rooms,
  sensors,
  floorId,
  opts = {}
) {
  const showCam = opts.showCameras !== false;
  const showSens = opts.showSensors !== false;
  const showZones = opts.showZones !== false;
  const showLabels = opts.showLabels !== false;
  const floorRooms = (rooms || []).filter(
    (r) => r.floorId === floorId
  );
  const floorSensors = (sensors || []).filter(
    (s) => s.floorId === floorId
  );
  const roomRects = showZones
    ? floorRooms
        .map((r) => {
          const cls = r.alertVisible
            ? "sf-room is-alert"
            : "sf-room";
          const tx = r.x + r.w / 2;
          const ty = r.y + r.h / 2;
          const label = showLabels
            ? `<text class="sf-room-label" x="${tx}" y="${ty}"
                text-anchor="middle">${escapeHtml(r.label)}</text>`
            : "";
          return `
        <rect class="${cls}" data-room-id="${escapeHtml(r.id)}"
          x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="2"></rect>
        ${furnitureHints(r)}
        ${label}`;
        })
        .join("")
    : "";
  const pins = floorSensors
    .filter((s) => {
      if (s.kind === "camera") return showCam;
      return showSens;
    })
    .map((s) => {
      const cls = s.alertVisible
        ? "sf-pin is-alert"
        : "sf-pin";
      const kindCls =
        s.kind === "camera" ? " is-cam" : " is-sens";
      const badge = s.alertVisible
        ? `<g class="sf-alert-pin" transform="translate(0 -11)">
            <rect x="-16" y="-6" width="32" height="9" rx="1.5"></rect>
            <text x="0" y="0.5" text-anchor="middle">発報地点</text>
          </g>`
        : "";
      return `
        <g class="${cls}${kindCls}" data-sensor-id="${escapeHtml(s.id)}"
          data-kind="${escapeHtml(s.kind)}"
          data-camera="${escapeHtml(s.linkedCameraId || s.id)}"
          transform="translate(${s.x} ${s.y})">
          <circle class="sf-pin-pulse" r="9"></circle>
          <circle class="sf-pin-bg" r="5.6"></circle>
          <text class="sf-pin-icon" y="0.6">${s.icon || "●"}</text>
          ${badge}
        </g>`;
    })
    .join("");
  return `
    <svg class="sf-map sf-iso-svg" viewBox="0 0 100 100" role="img"
      aria-label="${escapeHtml(socFloorLabel(floorId))}">
      <rect class="sf-iso-slab" x="1" y="1" width="98" height="98" rx="3"></rect>
      ${roomRects}
      ${layerDecorations(floorId, opts)}
      ${pins}
    </svg>`;
}

export function renderIsoStack(site, focusId, opts = {}) {
  const floors = visibleFloors(site.floors).filter(
    (f) => f.enabled
  );
  const zOrder = { outdoor: 0, "1f": 1, "2f": 2 };
  const layers = [...floors].sort(
    (a, b) => (zOrder[a.id] ?? 9) - (zOrder[b.id] ?? 9)
  );
  const focus = focusId || "all";
  const layerOpts = {
    ...opts,
    lightingOn: site.soc?.lightingOn ?? opts.lightingOn ?? 0,
  };
  const cards = layers
    .map((f, i) => {
      const alert = (site.rooms || []).some(
        (r) => r.floorId === f.id && r.alertVisible
      );
      const dim =
        focus !== "all" && focus !== f.id ? " is-dim" : "";
      const on = focus === f.id ? " is-focus" : "";
      const al = alert ? " is-alert" : "";
      return `
        <article class="sf-iso-layer${dim}${on}${al}"
          data-layer="${escapeHtml(f.id)}" style="--z:${i}">
          <p class="sf-iso-caption">${escapeHtml(
            socFloorLabel(f.id, f.label)
          )}${alert ? "（発報中）" : ""}</p>
          ${renderIsoLayerSvg(
            site.rooms,
            site.sensors,
            f.id,
            layerOpts
          )}
        </article>`;
    })
    .join("");
  return `<div class="sf-iso-scene"><div class="sf-iso-orbit" id="sf-iso-orbit" data-focus="${escapeHtml(focus)}">${cards}</div></div>`;
}

export function renderSocLayerButtons(floors, activeId) {
  const items = [
    { id: "all", label: "全体俯瞰", enabled: true },
    ...visibleFloors(floors).map((f) => ({
      id: f.id,
      label: socFloorLabel(f.id, f.label),
      enabled: f.enabled,
    })),
  ];
  return items
    .map((it) => {
      const on = it.id === activeId ? " is-on" : "";
      const disabled = it.enabled ? "" : "disabled";
      return `<button type="button" class="sf-tab${on}"
        data-floor="${escapeHtml(it.id)}" ${disabled}>${escapeHtml(it.label)}</button>`;
    })
    .join("");
}

export function formatAlarmTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

