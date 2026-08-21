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
  void sensors;
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
  /* 旧2D固定ピン撤去 — センサーは Three.js 3D のみ */
  return `
    <svg
      class="sf-map"
      viewBox="-8 -8 116 116"
      role="img"
      aria-label="フロア俯瞰図"
    >
      ${roomRects}
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

export function isEmptyFloorPlaceholder(room) {
  if (!room) return true;
  const id = String(room.id || "");
  const label = String(room.label || "");
  return (
    /empty/i.test(id) ||
    /なし/.test(label) ||
    /\(なし\)|（なし）/.test(label)
  );
}

/** 部屋・センサーが実在するフロアだけ true */
export function floorHasContent(site, floorId) {
  const rooms = (site?.rooms || []).filter(
    (r) => r.floorId === floorId && !isEmptyFloorPlaceholder(r)
  );
  const sensors = (site?.sensors || []).filter(
    (s) => s.floorId === floorId
  );
  return rooms.length > 0 || sensors.length > 0;
}

export function socFloorLabel(id, fallback) {
  if (id === "outdoor") return "外周・敷地";
  if (id === "1f") return "1F";
  if (id === "2f") return "2F";
  if (id === "all") return "全体俯瞰";
  return fallback || id;
}

export function visibleFloors(floors, site = null) {
  const order = { "2f": 0, "1f": 1, outdoor: 2 };
  return (floors || [])
    .filter((f) => f.id !== "roof")
    .filter((f) => f.enabled !== false)
    .filter((f) => (site ? floorHasContent(site, f.id) : true))
    .sort(
      (a, b) => (order[a.id] ?? 9) - (order[b.id] ?? 9)
    );
}

export function pickDefaultFloor(floors, site = null) {
  const list = visibleFloors(floors, site);
  const oneF = list.find((f) => f.id === "1f");
  if (oneF) return "1f";
  return (list[0] || { id: "1f" }).id;
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
  const showZones = opts.showZones !== false;
  const showLabels = opts.showLabels !== false;
  const floorRooms = (rooms || []).filter(
    (r) => r.floorId === floorId
  );
  void sensors;
  void opts.showCameras;
  void opts.showSensors;
  const roomRects = showZones
    ? floorRooms
        .map((r) => {
          const cls = r.alertVisible
            ? "sf-room is-alert pulse-alarm alert-beacon"
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
  /* 旧2D固定ピンは完全撤去 — 3Dメッシュのみ（sf-iso3d） */
  return `
    <svg class="sf-map sf-iso-svg" viewBox="-10 -12 120 124" role="img"
      aria-label="${escapeHtml(socFloorLabel(floorId))}">
      <rect class="sf-iso-slab" x="2" y="2" width="96" height="96" rx="3"></rect>
      ${roomRects}
      ${layerDecorations(floorId, opts)}
    </svg>`;
}

export function renderIsoStack(site, focusId, opts = {}) {
  try {
    const floors = visibleFloors(site?.floors, site);
    if (!floors.length) {
      throw new Error("no-floors");
    }
    const zOrder = { "2f": 0, "1f": 1, outdoor: 2 };
    const layers = [...floors].sort(
      (a, b) => (zOrder[a.id] ?? 9) - (zOrder[b.id] ?? 9)
    );
    const focus =
      !focusId || focusId === "all"
        ? layers.find((f) => f.id === "1f")?.id ||
          layers[0]?.id ||
          "1f"
        : focusId;
    const layerOpts = {
      ...opts,
      lightingOn: site.soc?.lightingOn ?? opts.lightingOn ?? 0,
    };
    const cards = layers
      .map((f, i) => {
        const alert = (site.rooms || []).some(
          (r) => r.floorId === f.id && r.alertVisible
        );
        const dim = focus !== f.id ? " is-dim" : "";
        const on = focus === f.id ? " is-focus" : "";
        const al = alert ? " is-alert alert-beacon" : "";
        return `
        <article class="sf-iso-layer${dim}${on}${al}"
          data-layer="${escapeHtml(f.id)}" style="--drum-i:${i}">
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
    /* 3Dマウントを主表示 · SVGドラムはデータ/フォールバック用に保持 */
    return `<div class="sf-iso-scene sf-iso3d-scene">
      <div id="sf-iso3d-mount" class="sf-iso3d-mount" role="img" aria-label="3Dアイソメ俯瞰"></div>
      <div class="sf-iso3d-hud"><span id="sf-iso3d-floor-label">${escapeHtml(socFloorLabel(focus))}</span><span class="sf-iso3d-hint">ドラッグで回転 · ピンチで拡大</span></div>
      <div class="sf-iso-orbit sf-iso-orbit--data" id="sf-iso-orbit" data-focus="${escapeHtml(focus)}">${cards}</div>
    </div>`;
  } catch (err) {
    console.warn("[security-floor] iso fallback", err);
    if (typeof document !== "undefined") {
      const wrap = document.getElementById("sf-map-wrap");
      if (wrap?.querySelector(".sf-iso-layer")) {
        return wrap.innerHTML;
      }
    }
    return STATIC_ISO_HTML;
  }
}

export const STATIC_ISO_HTML = `<div class="sf-iso-scene sf-iso3d-scene">
  <div id="sf-iso3d-mount" class="sf-iso3d-mount" role="img" aria-label="3Dアイソメ俯瞰"></div>
  <div class="sf-iso3d-hud"><span id="sf-iso3d-floor-label">1F</span><span class="sf-iso3d-hint">ドラッグで回転 · ピンチで拡大</span></div>
  <div class="sf-iso-orbit sf-iso-orbit--data" id="sf-iso-orbit" data-focus="1f"></div>
</div>`;

export function renderSocLayerButtons(floors, activeId, site = null) {
  const items = visibleFloors(floors, site).map((f) => ({
    id: f.id,
    label:
      f.id === "outdoor" ? "外周" : socFloorLabel(f.id, f.label),
    enabled: true,
  }));
  const focus =
    !activeId || activeId === "all"
      ? items.find((it) => it.id === "1f")?.id ||
        items[0]?.id ||
        "1f"
      : activeId;
  return items
    .map((it) => {
      const on = it.id === focus ? " is-on" : "";
      return `<button type="button" class="sf-tab${on}"
        data-floor="${escapeHtml(it.id)}">${escapeHtml(it.label)}</button>`;
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

