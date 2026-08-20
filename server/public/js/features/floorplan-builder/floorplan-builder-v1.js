/**
 * TiSLY 3D Floorplan Builder PWA
 * 方眼紙スキャン + AI解析 + 部屋枠編集 + アイソメ俯瞰 + Security 連携
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const LS_KEY = "tisly_floorplan_config";
const LS_ACTIVE = "tisly_floorplan_active_id";

const ROOM_PRESETS = [
  "玄関",
  "LDK",
  "リビング",
  "リビング洋",
  "キッチン",
  "勝手口",
  "和室",
  "和10畳",
  "和8畳",
  "洋室",
  "洋6畳",
  "寝室",
  "廊下",
  "土間",
  "風呂",
  "浴室",
  "洗面",
  "便所",
  "トイレ",
  "押入",
  "階段",
];

const DEFAULT_BG = { scale: 1, offsetX: 0, offsetY: 0, opacity: 0.85 };

/** @type {any} */
let state = null;
/** @type {THREE.Scene | null} */
let scene = null;
/** @type {THREE.PerspectiveCamera | null} */
let camera = null;
/** @type {THREE.WebGLRenderer | null} */
let renderer = null;
/** @type {OrbitControls | null} */
let controls = null;
/** @type {THREE.Group | null} */
let buildingGroup = null;

/** @type {string | null} */
let selectedRoomId = null;
/** @type {string | null} */
let renameRoomId = null;

/** 部屋ドラッグ状態 */
let drag = null;
/** 背景パン状態 */
let bgPan = null;
/** ピンチズーム状態 */
let pinch = null;

let rebuild3dTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  const el = $("fpb-status");
  if (el) el.textContent = msg;
}

function activeFloor() {
  if (!state) return null;
  return (
    state.floors.find((f) => f.id === state.activeFloor) ||
    state.floors.find((f) => f.enabled) ||
    state.floors[0]
  );
}

function ensureBgTransform(floor) {
  if (!floor) return DEFAULT_BG;
  if (!floor.bgTransform) {
    floor.bgTransform = { ...DEFAULT_BG };
  }
  const t = floor.bgTransform;
  if (!Number.isFinite(t.scale)) t.scale = 1;
  if (!Number.isFinite(t.offsetX)) t.offsetX = 0;
  if (!Number.isFinite(t.offsetY)) t.offsetY = 0;
  if (!Number.isFinite(t.opacity)) t.opacity = 0.85;
  return t;
}

function clampRoom(r) {
  r.w = Math.max(6, Math.min(96, Number(r.w) || 12));
  r.h = Math.max(6, Math.min(96, Number(r.h) || 12));
  r.x = Math.max(0, Math.min(100 - r.w, Number(r.x) || 0));
  r.y = Math.max(0, Math.min(100 - r.h, Number(r.y) || 0));
  return r;
}

function drawGrid() {
  const canvas = $("fpb-grid");
  if (!canvas) return;
  const floor = activeFloor();
  const cells = floor?.gridCells || 20;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 400;
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(2, 132, 199, 0.28)";
  ctx.lineWidth = 1;
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(5, 150, 105, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

function drawOverlay() {
  const svg = $("fpb-overlay");
  const floor = activeFloor();
  if (!svg || !floor) return;
  const rooms = (floor.rooms || [])
    .map((r) => {
      const selected = r.id === selectedRoomId ? " is-selected" : "";
      const tx = r.x + r.w / 2;
      const ty = r.y + r.h / 2;
      return `<g class="fpb-room-g${selected}" data-room-id="${escapeXml(r.id)}">
        <rect class="fpb-room" data-room-id="${escapeXml(r.id)}" data-handle="move"
          x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="1.2"></rect>
        <text class="fpb-room-label" data-room-id="${escapeXml(r.id)}" data-handle="label"
          x="${tx}" y="${ty}">${escapeXml(r.label)}</text>
        <circle class="fpb-handle" data-room-id="${escapeXml(r.id)}" data-handle="nw" cx="${r.x}" cy="${r.y}" r="1.6"></circle>
        <circle class="fpb-handle" data-room-id="${escapeXml(r.id)}" data-handle="ne" cx="${r.x + r.w}" cy="${r.y}" r="1.6"></circle>
        <circle class="fpb-handle" data-room-id="${escapeXml(r.id)}" data-handle="sw" cx="${r.x}" cy="${r.y + r.h}" r="1.6"></circle>
        <circle class="fpb-handle" data-room-id="${escapeXml(r.id)}" data-handle="se" cx="${r.x + r.w}" cy="${r.y + r.h}" r="1.6"></circle>
        <g class="fpb-del" data-room-id="${escapeXml(r.id)}" data-handle="delete"
          transform="translate(${r.x + r.w - 3.2}, ${r.y + 3.2})">
          <circle r="2.4" class="fpb-del-bg"></circle>
          <text class="fpb-del-icon" text-anchor="middle" dominant-baseline="central">🗑</text>
        </g>
      </g>`;
    })
    .join("");
  const openings = (floor.openings || [])
    .map(
      (o) =>
        `<circle class="fpb-opening" cx="${o.x}" cy="${o.y}" r="1.8"></circle>`
    )
    .join("");
  svg.innerHTML = rooms + openings;
}

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncBackground() {
  const img = $("fpb-bg");
  const floor = activeFloor();
  if (!img || !floor) return;
  const t = ensureBgTransform(floor);
  if (floor.backgroundImage) {
    img.src = floor.backgroundImage;
    img.hidden = false;
    img.style.opacity = String(t.opacity);
    img.style.transform = `translate(${t.offsetX}%, ${t.offsetY}%) scale(${t.scale})`;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    img.style.transform = "";
    img.style.opacity = "";
  }
  const zoom = $("fpb-bg-zoom");
  const zoomVal = $("fpb-bg-zoom-val");
  const opac = $("fpb-bg-opacity");
  const opacVal = $("fpb-bg-opacity-val");
  if (zoom) zoom.value = String(t.scale);
  if (zoomVal) zoomVal.textContent = `${Math.round(t.scale * 100)}%`;
  if (opac) opac.value = String(t.opacity);
  if (opacVal) opacVal.textContent = `${Math.round(t.opacity * 100)}%`;
}

function syncTabs() {
  if (!state) return;
  document.querySelectorAll("#fpb-floor-tabs .fpb-tab").forEach((btn) => {
    const id = btn.getAttribute("data-floor");
    const floor = state.floors.find((f) => f.id === id);
    btn.classList.toggle("is-on", id === state.activeFloor);
    btn.disabled = floor ? !floor.enabled : true;
  });
}

function scheduleRebuild3d() {
  clearTimeout(rebuild3dTimer);
  rebuild3dTimer = setTimeout(() => rebuild3d(), 40);
}

function refresh2d(opts = {}) {
  syncTabs();
  syncBackground();
  drawGrid();
  drawOverlay();
  if (!opts.skip3d) scheduleRebuild3d();
}

function init3d() {
  const mount = $("fpb-preview");
  if (!mount || renderer) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf1f5f9, 28, 70);

  const w = mount.clientWidth || 320;
  const h = mount.clientHeight || 360;
  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  camera.position.set(18, 18, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0xf8fafc, 1);
  mount.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 8;
  controls.maxDistance = 48;

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 0.75);
  key.position.set(8, 16, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbae6fd, 0.45);
  fill.position.set(-10, 10, -8);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xa7f3d0, 0.35);
  rim.position.set(0, 12, -14);
  scene.add(rim);

  const grid = new THREE.GridHelper(24, 24, 0x7dd3fc, 0xcbd5e1);
  grid.position.y = 0;
  scene.add(grid);

  buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  window.addEventListener("resize", onResize);
  animate();
}

function onResize() {
  const mount = $("fpb-preview");
  if (!mount || !camera || !renderer) return;
  const w = mount.clientWidth || 320;
  const h = mount.clientHeight || 360;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  drawGrid();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function pctToWorld(v) {
  return (v - 50) * 0.2;
}

function rebuild3d() {
  if (!buildingGroup || !state) return;
  while (buildingGroup.children.length) {
    const c = buildingGroup.children.pop();
    c.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    buildingGroup.remove(c);
  }

  const floor = activeFloor();
  if (!floor) return;

  const wallH = state.render?.wallHeight ?? 2.7;
  const opacity = state.render?.roomOpacity ?? 0.55;
  const accent = new THREE.Color(state.render?.glowColor || "#059669");
  const accentAlt = new THREE.Color(state.render?.glowColorAlt || "#0284c7");

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 0.12,
    metalness: 0.05,
    roughness: 0.85,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.15, 22), slabMat);
  slab.position.y = 0.05;
  buildingGroup.add(slab);

  const roomMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: accentAlt,
    emissiveIntensity: 0.08,
    transparent: true,
    opacity: Math.min(Math.max(opacity, 0.25), 0.85),
    metalness: 0.05,
    roughness: 0.55,
    depthWrite: false,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x86efac,
    emissive: accent,
    emissiveIntensity: 0.06,
    metalness: 0.08,
    roughness: 0.5,
    transparent: true,
    opacity: 0.78,
  });

  for (const r of floor.rooms || []) {
    const ww = Math.max(r.w * 0.2, 0.4);
    const dd = Math.max(r.h * 0.2, 0.4);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(ww, wallH * 0.55, dd),
      roomMat.clone()
    );
    mesh.position.set(
      pctToWorld(r.x + r.w / 2),
      wallH * 0.275 + 0.12,
      pctToWorld(r.y + r.h / 2)
    );
    buildingGroup.add(mesh);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: accentAlt,
        transparent: true,
        opacity: 0.95,
      })
    );
    edge.position.copy(mesh.position);
    buildingGroup.add(edge);
  }

  for (const w of floor.walls || []) {
    const x1 = pctToWorld(w.x1);
    const z1 = pctToWorld(w.y1);
    const x2 = pctToWorld(w.x2);
    const z2 = pctToWorld(w.y2);
    const len = Math.hypot(x2 - x1, z2 - z1) || 0.2;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(len, wallH, 0.18),
      wallMat
    );
    wall.position.set((x1 + x2) / 2, wallH / 2 + 0.12, (z1 + z2) / 2);
    wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    buildingGroup.add(wall);

    const wallEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(wall.geometry),
      new THREE.LineBasicMaterial({ color: 0x047857, transparent: true, opacity: 0.85 })
    );
    wallEdge.position.copy(wall.position);
    wallEdge.rotation.copy(wall.rotation);
    buildingGroup.add(wallEdge);
  }

  for (const o of floor.openings || []) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x059669,
        emissive: 0x34d399,
        emissiveIntensity: 0.35,
        metalness: 0.15,
        roughness: 0.4,
      })
    );
    marker.position.set(pctToWorld(o.x), wallH * 0.4, pctToWorld(o.y));
    buildingGroup.add(marker);
  }

  if (camera && controls) {
    const elev = ((state.render?.cameraElevationDeg ?? 45) * Math.PI) / 180;
    const dist = 22;
    camera.position.set(
      dist * Math.cos(elev) * 0.9,
      dist * Math.sin(elev),
      dist * Math.cos(elev) * 0.9
    );
    controls.update();
  }
}

function refreshSecurityBridge(cfg) {
  const rooms = cfg.floors.flatMap((f) =>
    (f.rooms || []).map((r) => ({
      id: r.id,
      floorId: f.id,
      label: r.label,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
    }))
  );
  const openings = cfg.floors.flatMap((f) =>
    (f.openings || []).map((o) => ({
      id: o.id,
      floorId: f.id,
      kind: o.kind,
      label: o.label,
      x: o.x,
      y: o.y,
    }))
  );
  cfg.security = { siteId: cfg.id, rooms, openings };
  cfg.updatedAt = new Date().toISOString();
  return cfg;
}

async function loadPreset(presetId) {
  setStatus("プリセット読込中…");
  try {
    const res = await fetch("/api/floorplan-builder/v1/load-preset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetId }),
    });
    const data = await res.json();
    if (!data.ok || !data.config) throw new Error(data.error || "読込失敗");
    state = data.config;
    selectedRoomId = null;
    persistLocal(state);
    refresh2d();
    setStatus(`読込完了: ${state.name}`);
  } catch (err) {
    setStatus(`プリセット失敗: ${err.message || err}`);
  }
}

function persistLocal(cfg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    localStorage.setItem(LS_ACTIVE, cfg.id);
  } catch {
    /* ignore quota */
  }
}

async function saveAll() {
  if (!state) {
    setStatus("保存するデータがありません");
    return;
  }
  refreshSecurityBridge(state);
  persistLocal(state);
  setStatus("サーバーへ保存中…");
  try {
    const res = await fetch("/api/floorplan-builder/v1/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "保存失敗");
    state = data.config;
    persistLocal(state);
    setStatus(`保存完了（${state.id}）· LocalStorage + サーバー`);
  } catch (err) {
    setStatus(`サーバー保存失敗（LocalStorageは保持）: ${err.message || err}`);
  }
}

async function sendToSecurity() {
  await saveAll();
  if (!state) return;
  try {
    localStorage.setItem("tisly_floorplan_for_security", "1");
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  window.location.href = "/security-v1?fromBuilder=1";
}

function applyImageFile(file, autoDetect = true) {
  if (!file || !state) return;
  if (!String(file.type || "").startsWith("image/")) {
    setStatus("画像ファイルを選択してください");
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const floor = activeFloor();
    if (!floor) return;
    floor.backgroundImage = String(reader.result || "");
    ensureBgTransform(floor);
    refresh2d();
    setStatus("方眼紙写真を取り込みました");
    if (autoDetect) {
      await runAutoDetect();
    }
  };
  reader.onerror = () => setStatus("画像の読み込みに失敗しました");
  reader.readAsDataURL(file);
}

function onFileChange(ev) {
  const input = ev.target;
  const file = input?.files?.[0];
  applyImageFile(file, true);
  if (input) input.value = "";
}

function clearBackground() {
  const floor = activeFloor();
  if (!floor) return;
  floor.backgroundImage = null;
  floor.bgTransform = { ...DEFAULT_BG };
  refresh2d();
  setStatus("背景をクリアしました");
}

async function runAutoDetect() {
  const floor = activeFloor();
  if (!floor) {
    setStatus("フロアがありません");
    return;
  }
  const btn = $("fpb-detect");
  if (btn) btn.disabled = true;
  setStatus("方眼紙をAI解析中…");
  try {
    const body = {
      imageBase64: floor.backgroundImage || undefined,
      forceRuleBased: !floor.backgroundImage,
    };
    const res = await fetch("/api/floorplan-builder/v1/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.rooms) || !data.rooms.length) {
      throw new Error(data.error || "部屋が検出できませんでした");
    }
    floor.rooms = data.rooms.map((r, i) =>
      clampRoom({
        id: r.id || `det-${Date.now()}-${i}`,
        label: r.label || `部屋${i + 1}`,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      })
    );
    if (Array.isArray(data.openings) && data.openings.length) {
      floor.openings = data.openings;
    }
    // 外周壁を部屋外接矩形で更新
    const xs = floor.rooms.map((r) => r.x);
    const ys = floor.rooms.map((r) => r.y);
    const xe = floor.rooms.map((r) => r.x + r.w);
    const ye = floor.rooms.map((r) => r.y + r.h);
    const minX = Math.max(0, Math.min(...xs) - 1);
    const minY = Math.max(0, Math.min(...ys) - 1);
    const maxX = Math.min(100, Math.max(...xe) + 1);
    const maxY = Math.min(100, Math.max(...ye) + 1);
    floor.walls = [
      { id: "aw1", x1: minX, y1: minY, x2: maxX, y2: minY },
      { id: "aw2", x1: maxX, y1: minY, x2: maxX, y2: maxY },
      { id: "aw3", x1: maxX, y1: maxY, x2: minX, y2: maxY },
      { id: "aw4", x1: minX, y1: maxY, x2: minX, y2: minY },
    ];
    selectedRoomId = floor.rooms[0]?.id || null;
    refreshSecurityBridge(state);
    persistLocal(state);
    refresh2d();
    const via = data.fallbackUsed
      ? `${data.provider}（Visionフォールバック）`
      : data.provider;
    setStatus(`間取り生成完了: ${floor.rooms.length}室 · ${via}`);
  } catch (err) {
    setStatus(`解析失敗: ${err.message || err}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function addRoom() {
  const floor = activeFloor();
  if (!floor) return;
  const id = `room-${Date.now().toString(36)}`;
  const room = clampRoom({
    id,
    label: "新しい部屋",
    x: 36,
    y: 36,
    w: 22,
    h: 18,
  });
  floor.rooms = floor.rooms || [];
  floor.rooms.push(room);
  selectedRoomId = id;
  refresh2d();
  openRenameSheet(id);
  setStatus("部屋を追加しました（名前を設定してください）");
}

function deleteRoom(roomId) {
  const floor = activeFloor();
  if (!floor) return;
  floor.rooms = (floor.rooms || []).filter((r) => r.id !== roomId);
  if (selectedRoomId === roomId) selectedRoomId = null;
  refresh2d();
  setStatus("部屋を削除しました");
}

function findRoom(roomId) {
  const floor = activeFloor();
  return floor?.rooms?.find((r) => r.id === roomId) || null;
}

function openRenameSheet(roomId) {
  const room = findRoom(roomId);
  if (!room) return;
  renameRoomId = roomId;
  const sheet = $("fpb-rename-sheet");
  const input = $("fpb-rename-input");
  const chips = $("fpb-rename-presets");
  if (input) input.value = room.label || "";
  if (chips) {
    chips.innerHTML = ROOM_PRESETS.map(
      (p) =>
        `<button type="button" class="fpb-chip" data-preset="${escapeXml(p)}">${escapeXml(p)}</button>`
    ).join("");
  }
  if (sheet) sheet.hidden = false;
  input?.focus();
}

function closeRenameSheet() {
  const sheet = $("fpb-rename-sheet");
  if (sheet) sheet.hidden = true;
  renameRoomId = null;
}

function applyRename(label) {
  const room = findRoom(renameRoomId);
  if (!room) {
    closeRenameSheet();
    return;
  }
  const next = String(label || "").trim();
  if (next) room.label = next;
  closeRenameSheet();
  refresh2d();
  persistLocal(state);
  setStatus(`部屋名: ${room.label}`);
}

function svgPointFromEvent(ev) {
  const svg = $("fpb-overlay");
  if (!svg) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  const clientX = ev.touches ? ev.touches[0]?.clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0]?.clientY : ev.clientY;
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x, y: loc.y };
}

function onOverlayPointerDown(ev) {
  const target = ev.target;
  if (!(target instanceof Element)) return;
  const handle = target.getAttribute("data-handle");
  const roomId = target.getAttribute("data-room-id");
  if (!handle || !roomId) {
    // 背景パン開始（部屋以外）
    if (ev.target === $("fpb-overlay") || target.classList.contains("fpb-opening")) {
      startBgPan(ev);
    }
    return;
  }

  if (handle === "delete") {
    ev.preventDefault();
    ev.stopPropagation();
    deleteRoom(roomId);
    return;
  }
  if (handle === "label") {
    ev.preventDefault();
    ev.stopPropagation();
    selectedRoomId = roomId;
    drawOverlay();
    openRenameSheet(roomId);
    return;
  }

  const room = findRoom(roomId);
  if (!room) return;
  ev.preventDefault();
  const pt = svgPointFromEvent(ev);
  selectedRoomId = roomId;
  drag = {
    roomId,
    handle,
    startX: pt.x,
    startY: pt.y,
    orig: { x: room.x, y: room.y, w: room.w, h: room.h },
  };
  drawOverlay();
  try {
    $("fpb-overlay")?.setPointerCapture?.(ev.pointerId);
  } catch {
    /* ignore */
  }
}

function onOverlayPointerMove(ev) {
  if (pinch) return;
  if (bgPan) {
    moveBgPan(ev);
    return;
  }
  if (!drag) return;
  const room = findRoom(drag.roomId);
  if (!room) return;
  const pt = svgPointFromEvent(ev);
  const dx = pt.x - drag.startX;
  const dy = pt.y - drag.startY;
  const o = drag.orig;
  if (drag.handle === "move") {
    room.x = o.x + dx;
    room.y = o.y + dy;
  } else if (drag.handle === "se") {
    room.w = o.w + dx;
    room.h = o.h + dy;
  } else if (drag.handle === "sw") {
    room.x = o.x + dx;
    room.w = o.w - dx;
    room.h = o.h + dy;
  } else if (drag.handle === "ne") {
    room.y = o.y + dy;
    room.w = o.w + dx;
    room.h = o.h - dy;
  } else if (drag.handle === "nw") {
    room.x = o.x + dx;
    room.y = o.y + dy;
    room.w = o.w - dx;
    room.h = o.h - dy;
  }
  clampRoom(room);
  drawOverlay();
  scheduleRebuild3d();
}

function onOverlayPointerUp() {
  if (drag) {
    drag = null;
    if (state) persistLocal(state);
    refresh2d();
  }
  if (bgPan) {
    bgPan = null;
    if (state) persistLocal(state);
  }
}

function startBgPan(ev) {
  const floor = activeFloor();
  if (!floor?.backgroundImage) return;
  const t = ensureBgTransform(floor);
  const clientX = ev.touches ? ev.touches[0]?.clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0]?.clientY : ev.clientY;
  bgPan = {
    startX: clientX,
    startY: clientY,
    origX: t.offsetX,
    origY: t.offsetY,
  };
}

function moveBgPan(ev) {
  if (!bgPan) return;
  const floor = activeFloor();
  if (!floor) return;
  const t = ensureBgTransform(floor);
  const wrap = $("fpb-canvas-wrap");
  const w = wrap?.clientWidth || 400;
  const h = wrap?.clientHeight || 400;
  const clientX = ev.touches ? ev.touches[0]?.clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0]?.clientY : ev.clientY;
  const dxPct = ((clientX - bgPan.startX) / w) * 100;
  const dyPct = ((clientY - bgPan.startY) / h) * 100;
  t.offsetX = Math.max(-80, Math.min(80, bgPan.origX + dxPct));
  t.offsetY = Math.max(-80, Math.min(80, bgPan.origY + dyPct));
  syncBackground();
}

function onBgTouchStart(ev) {
  if (ev.touches.length === 2) {
    const floor = activeFloor();
    if (!floor?.backgroundImage) return;
    const t = ensureBgTransform(floor);
    const [a, b] = ev.touches;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinch = { startDist: dist, startScale: t.scale };
    bgPan = null;
    drag = null;
    ev.preventDefault();
  }
}

function onBgTouchMove(ev) {
  if (pinch && ev.touches.length === 2) {
    const floor = activeFloor();
    if (!floor) return;
    const t = ensureBgTransform(floor);
    const [a, b] = ev.touches;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = dist / (pinch.startDist || 1);
    t.scale = Math.max(0.5, Math.min(2.5, pinch.startScale * ratio));
    syncBackground();
    ev.preventDefault();
  }
}

function onBgTouchEnd(ev) {
  if (ev.touches.length < 2) {
    if (pinch) {
      pinch = null;
      if (state) persistLocal(state);
    }
  }
}

function bindDropzone() {
  const zone = $("fpb-dropzone");
  const library = $("fpb-file-library");
  if (!zone) return;

  const setDrag = (on) => zone.classList.toggle("is-dragover", on);

  zone.addEventListener("click", () => library?.click());
  zone.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      library?.click();
    }
  });

  ["dragenter", "dragover"].forEach((type) => {
    zone.addEventListener(type, (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setDrag(true);
    });
  });
  ["dragleave", "dragend"].forEach((type) => {
    zone.addEventListener(type, (ev) => {
      ev.preventDefault();
      setDrag(false);
    });
  });
  zone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDrag(false);
    const file = ev.dataTransfer?.files?.[0];
    applyImageFile(file, true);
  });

  ["dragover", "drop"].forEach((type) => {
    document.addEventListener(type, (ev) => {
      if (ev.target === zone || zone.contains(/** @type {Node} */ (ev.target))) return;
      ev.preventDefault();
    });
  });
}

function bindRoomEditor() {
  const svg = $("fpb-overlay");
  if (!svg) return;
  svg.style.pointerEvents = "auto";
  svg.addEventListener("pointerdown", onOverlayPointerDown);
  window.addEventListener("pointermove", onOverlayPointerMove);
  window.addEventListener("pointerup", onOverlayPointerUp);
  window.addEventListener("pointercancel", onOverlayPointerUp);

  const wrap = $("fpb-canvas-wrap");
  wrap?.addEventListener("touchstart", onBgTouchStart, { passive: false });
  wrap?.addEventListener("touchmove", onBgTouchMove, { passive: false });
  wrap?.addEventListener("touchend", onBgTouchEnd);
  wrap?.addEventListener("touchcancel", onBgTouchEnd);

  // 背景画像上のドラッグでもパン
  const bg = $("fpb-bg");
  bg?.addEventListener("pointerdown", (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    startBgPan(ev);
    try {
      bg.setPointerCapture?.(ev.pointerId);
    } catch {
      /* ignore */
    }
  });
}

function bindRenameSheet() {
  const sheet = $("fpb-rename-sheet");
  sheet?.querySelectorAll("[data-close-sheet]").forEach((el) => {
    el.addEventListener("click", closeRenameSheet);
  });
  $("fpb-rename-ok")?.addEventListener("click", () => {
    applyRename($("fpb-rename-input")?.value);
  });
  $("fpb-rename-input")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      applyRename($("fpb-rename-input")?.value);
    }
  });
  $("fpb-rename-presets")?.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("[data-preset]");
    if (!btn) return;
    const preset = btn.getAttribute("data-preset");
    const input = $("fpb-rename-input");
    if (input) input.value = preset || "";
    applyRename(preset);
  });
}

function bindUi() {
  $("fpb-preset-tsukuba")?.addEventListener("click", () =>
    loadPreset("tsukuba_model_house")
  );
  $("fpb-preset-hiraya")?.addEventListener("click", () =>
    loadPreset("hiraya_demo")
  );
  $("fpb-file-camera")?.addEventListener("change", onFileChange);
  $("fpb-file-library")?.addEventListener("change", onFileChange);
  $("fpb-file")?.addEventListener("change", onFileChange);
  bindDropzone();
  bindRoomEditor();
  bindRenameSheet();
  $("fpb-clear-bg")?.addEventListener("click", clearBackground);
  $("fpb-detect")?.addEventListener("click", () => runAutoDetect());
  $("fpb-add-room")?.addEventListener("click", addRoom);
  $("fpb-save")?.addEventListener("click", saveAll);
  $("fpb-send-security")?.addEventListener("click", sendToSecurity);

  document.querySelectorAll("#fpb-floor-tabs .fpb-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!state || btn.disabled) return;
      state.activeFloor = btn.getAttribute("data-floor") || "1f";
      selectedRoomId = null;
      refresh2d();
    });
  });

  const wall = $("fpb-wall-h");
  const opacity = $("fpb-opacity");
  wall?.addEventListener("input", () => {
    if (!state) return;
    state.render.wallHeight = Number(wall.value);
    $("fpb-wall-h-val").textContent = `${wall.value}m`;
    rebuild3d();
  });
  opacity?.addEventListener("input", () => {
    if (!state) return;
    state.render.roomOpacity = Number(opacity.value);
    $("fpb-opacity-val").textContent = `${Math.round(Number(opacity.value) * 100)}%`;
    rebuild3d();
  });

  const bgZoom = $("fpb-bg-zoom");
  const bgOpac = $("fpb-bg-opacity");
  bgZoom?.addEventListener("input", () => {
    const floor = activeFloor();
    if (!floor) return;
    const t = ensureBgTransform(floor);
    t.scale = Number(bgZoom.value);
    syncBackground();
  });
  bgZoom?.addEventListener("change", () => {
    if (state) persistLocal(state);
  });
  bgOpac?.addEventListener("input", () => {
    const floor = activeFloor();
    if (!floor) return;
    const t = ensureBgTransform(floor);
    t.opacity = Number(bgOpac.value);
    syncBackground();
  });
  bgOpac?.addEventListener("change", () => {
    if (state) persistLocal(state);
  });
}

async function boot() {
  bindUi();
  init3d();

  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      state = JSON.parse(cached);
      if (state?.render) {
        const g = String(state.render.glowColor || "");
        const a = String(state.render.glowColorAlt || "");
        if (/^#(00ff88|39ff14|00ff00)$/i.test(g)) state.render.glowColor = "#059669";
        if (/^#(00d4ff|00e5ff|00ffff)$/i.test(a)) state.render.glowColorAlt = "#0284c7";
      }
      for (const f of state.floors || []) ensureBgTransform(f);
      refresh2d();
      setStatus(`復元: ${state.name}`);
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch("/api/floorplan-builder/v1/active");
    const data = await res.json();
    if (data.ok && data.config) {
      state = data.config;
      for (const f of state.floors || []) ensureBgTransform(f);
      persistLocal(state);
      refresh2d();
      setStatus(`サーバー設定: ${state.name}`);
      return;
    }
  } catch {
    /* fall through */
  }

  await loadPreset("tsukuba_model_house");
}

boot();
