/**
 * TiSLY 3D Floorplan Builder PWA
 * 方眼紙スキャン + AI解析 + 部屋枠編集 + アイソメ俯瞰 + Security 連携
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  DEVICE_PALETTE_ITEMS_V1,
  normalizeDeviceKind,
} from "../shared/tisly-device-pin-icons-v1.js";
import {
  createNeonPinMesh3d,
  deviceToWorldPosV1,
  pctToWorldV1,
  worldToDevicePosV1,
} from "../shared/tisly-neon-pin-mesh-v1.js";

const LS_KEY = "tisly_floorplan_config";
const LS_ACTIVE = "tisly_floorplan_active_id";

const DEVICE_LABELS = {
  camera: "カメラ",
  door: "ドアセンサー",
  lock: "鍵",
  panel: "電源/ブレーカー",
  mmwave: "ミリ波",
};

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
/** @type {Map<string, THREE.Group>} */
const pinMeshes = new Map();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundHit = new THREE.Vector3();

/** @type {string | null} */
let selectedRoomId = null;
/** @type {string | null} */
let selectedDeviceId = null;
/** @type {string | null} */
let renameRoomId = null;
/** @type {string | null} */
let placeKind = null;

/** 部屋ドラッグ状態 */
let drag = null;
/** 3Dピン ドラッグ状態 */
let pin3dDrag = null;
/** 背景パン状態 */
let bgPan = null;
/** ピンチズーム状態 */
let pinch = null;
/** 3Dポインタ追跡 */
let pointer3d = {
  down: false,
  moved: false,
  x: 0,
  y: 0,
  id: null,
  hitDeviceId: null,
};

let rebuild3dTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  const el = $("fpb-status");
  if (el) el.textContent = msg;
}

function floorHasContent(floor) {
  if (!floor || floor.enabled === false) return false;
  return (
    (floor.rooms || []).length > 0 ||
    (floor.devices || []).length > 0 ||
    (floor.openings || []).length > 0 ||
    !!floor.backgroundImage
  );
}

function ensureDevices(floor) {
  if (!floor) return [];
  if (!Array.isArray(floor.devices)) floor.devices = [];
  return floor.devices;
}

function activeFloor() {
  if (!state) return null;
  const cur = state.floors.find((f) => f.id === state.activeFloor);
  if (cur && floorHasContent(cur)) return cur;
  const first = state.floors.find((f) => floorHasContent(f));
  if (first) {
    state.activeFloor = first.id;
    return first;
  }
  return state.floors.find((f) => f.enabled) || state.floors[0];
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
  ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
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
  /* 2D固定デバイスピンは廃止 — 3Dメッシュのみ */
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
  const tabs = $("fpb-floor-tabs");
  if (!tabs) return;
  const labels = { "1f": "1階", "2f": "2階", outdoor: "外周・敷地" };
  const visible = (state.floors || []).filter((f) => floorHasContent(f));
  if (
    visible.length &&
    !visible.some((f) => f.id === state.activeFloor)
  ) {
    state.activeFloor = visible[0].id;
  }
  tabs.innerHTML = visible
    .map((f) => {
      const on = f.id === state.activeFloor ? " is-on" : "";
      return `<button type="button" class="fpb-tab${on}" data-floor="${f.id}">${
        labels[f.id] || f.label || f.id
      }</button>`;
    })
    .join("");
  tabs.querySelectorAll(".fpb-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!state) return;
      state.activeFloor = btn.getAttribute("data-floor") || "1f";
      selectedRoomId = null;
      selectedDeviceId = null;
      refresh2d();
    });
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
  renderer.domElement.className = "fpb-3d-canvas";
  renderer.domElement.style.touchAction = "none";

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
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.35);
  rim.position.set(0, 12, -14);
  scene.add(rim);

  const grid = new THREE.GridHelper(24, 24, 0x7dd3fc, 0xcbd5e1);
  grid.position.y = 0;
  scene.add(grid);

  buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  bind3dPinInteraction();
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
  return pctToWorldV1(v);
}

function rebuild3d() {
  if (!buildingGroup || !state) return;
  while (buildingGroup.children.length) {
    const c = buildingGroup.children.pop();
    c.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
    });
    buildingGroup.remove(c);
  }
  pinMeshes.clear();

  const floor = activeFloor();
  if (!floor) return;

  const wallH = state.render?.wallHeight ?? 2.7;
  const opacity = state.render?.roomOpacity ?? 0.55;
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
  slab.userData = { kind: "slab" };
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
    mesh.userData = { kind: "room", roomId: r.id };
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

  /* 緑外壁フレーム（walls）は描画しない */

  for (const d of ensureDevices(floor)) {
    enrichDeviceWorld(d, wallH);
    const kind = normalizeDeviceKind(d.kind);
    const pin = createNeonPinMesh3d(THREE, {
      id: d.id,
      kind,
      label: d.label || DEVICE_LABELS[kind] || kind,
      selected: d.id === selectedDeviceId,
      scale: 1.08,
    });
    const pos = deviceToWorldPosV1(d, wallH);
    pin.position.set(pos.x, pos.y, pos.z);
    buildingGroup.add(pin);
    pinMeshes.set(d.id, pin);
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

function enrichDeviceWorld(d, wallH) {
  const wh = wallH ?? state?.render?.wallHeight ?? 2.7;
  if (!Number.isFinite(d.z)) d.z = wh * 0.72;
  const w = deviceToWorldPosV1(d, wh);
  d.worldX = w.x;
  d.worldY = w.y;
  d.worldZ = w.z;
  return d;
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
  const devices = cfg.floors.flatMap((f) =>
    (f.devices || []).map((d) => {
      const wallH = cfg.render?.wallHeight ?? 2.7;
      enrichDeviceWorld(d, wallH);
      return {
        id: d.id,
        floorId: f.id,
        kind: d.kind,
        label: d.label,
        x: d.x,
        y: d.y,
        z: d.z,
        worldX: d.worldX,
        worldY: d.worldY,
        worldZ: d.worldZ,
      };
    })
  );
  cfg.security = { siteId: cfg.id, rooms, openings, devices };
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
    /* 緑外壁バウンディングは生成しない（部屋ブロックのみ） */
    floor.walls = [];
    ensureDevices(floor);
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

function findDevice(deviceId) {
  const floor = activeFloor();
  return ensureDevices(floor).find((d) => d.id === deviceId) || null;
}

function addDeviceAt(kind, x, y, z) {
  const floor = activeFloor();
  if (!floor) return null;
  const k = normalizeDeviceKind(kind);
  const wallH = state?.render?.wallHeight ?? 2.7;
  const id = `dev-${k}-${Date.now().toString(36)}`;
  const device = enrichDeviceWorld(
    {
      id,
      kind: k,
      label: DEVICE_LABELS[k] || k,
      x: Math.min(96, Math.max(4, Number(x) || 50)),
      y: Math.min(96, Math.max(4, Number(y) || 50)),
      z: Number.isFinite(z) ? Number(z) : wallH * 0.72,
    },
    wallH
  );
  ensureDevices(floor).push(device);
  selectedDeviceId = id;
  selectedRoomId = null;
  placeKind = null;
  syncPaletteActive();
  refresh2d();
  persistLocal(state);
  setStatus(`${device.label} を3D配置しました`);
  return device;
}

function deleteDevice(deviceId) {
  const floor = activeFloor();
  if (!floor) return;
  floor.devices = ensureDevices(floor).filter((d) => d.id !== deviceId);
  if (selectedDeviceId === deviceId) selectedDeviceId = null;
  refresh2d();
  persistLocal(state);
  setStatus("デバイスを削除しました");
}

function renderDevicePalette() {
  const el = $("fpb-device-palette");
  if (!el) return;
  el.innerHTML = DEVICE_PALETTE_ITEMS_V1.map(
    (it) =>
      `<button type="button" class="fpb-palette-item${
        placeKind === it.kind ? " is-active" : ""
      }" data-kind="${it.kind}" title="${it.label}">
        <span class="fpb-palette-icon" aria-hidden="true">${it.hint}</span>
        <span class="fpb-palette-label">${it.label}</span>
      </button>`
  ).join("");
}

function syncPaletteActive() {
  const el = $("fpb-device-palette");
  if (!el) return;
  el.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.classList.toggle(
      "is-active",
      btn.getAttribute("data-kind") === placeKind
    );
  });
  const hint = $("fpb-place-hint");
  if (hint) {
    hint.textContent = placeKind
      ? `「${DEVICE_LABELS[placeKind] || placeKind}」を選中 — 3D部屋をタップして配置`
      : "種類を選んでから3D部屋をタップ";
  }
  $("fpb-preview-shell")?.classList.toggle("is-placing", !!placeKind);
}

function bindDevicePalette() {
  renderDevicePalette();
  const palette = $("fpb-device-palette");
  if (!palette) return;

  palette.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("[data-kind]");
    if (!btn || !state) return;
    const kind = btn.getAttribute("data-kind");
    placeKind = placeKind === kind ? null : kind;
    selectedDeviceId = null;
    syncPaletteActive();
    scheduleRebuild3d();
    if (placeKind) {
      setStatus(
        `${DEVICE_LABELS[placeKind] || placeKind} 配置モード — 3D図面をタップ`
      );
    } else {
      setStatus("配置モード解除");
    }
  });
}

function setPointerFromEvent(ev) {
  const canvas = renderer?.domElement;
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
  const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
  if (cx == null || cy == null) return false;
  pointerNdc.x = ((cx - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((cy - rect.top) / rect.height) * 2 + 1;
  return true;
}

function raycastPinOrGround() {
  if (!camera || !buildingGroup) return { pinId: null, ground: null };
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(buildingGroup.children, true);
  for (const hit of hits) {
    let obj = hit.object;
    while (obj && obj.userData?.kind !== "devicePin") obj = obj.parent;
    if (obj?.userData?.deviceId) {
      return { pinId: obj.userData.deviceId, ground: hit.point.clone() };
    }
  }
  if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
    return { pinId: null, ground: groundHit.clone() };
  }
  return { pinId: null, ground: null };
}

function bind3dPinInteraction() {
  const canvas = renderer?.domElement;
  if (!canvas || canvas.dataset.pinBound === "1") return;
  canvas.dataset.pinBound = "1";

  canvas.addEventListener("pointerdown", (ev) => {
    if (!state || !camera) return;
    if (ev.button != null && ev.button !== 0) return;
    if (!setPointerFromEvent(ev)) return;
    const hit = raycastPinOrGround();
    pointer3d = {
      down: true,
      moved: false,
      x: ev.clientX,
      y: ev.clientY,
      id: ev.pointerId,
      hitDeviceId: hit.pinId,
    };

    if (hit.pinId) {
      selectedDeviceId = hit.pinId;
      selectedRoomId = null;
      placeKind = null;
      syncPaletteActive();
      const device = findDevice(hit.pinId);
      pin3dDrag = {
        id: hit.pinId,
        startX: device?.x,
        startY: device?.y,
        startZ: device?.z,
        moved: false,
      };
      if (controls) controls.enabled = false;
      try {
        canvas.setPointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      scheduleRebuild3d();
      ev.preventDefault();
      return;
    }

    if (placeKind && hit.ground) {
      if (controls) controls.enabled = false;
      pointer3d.placeAt = hit.ground;
      try {
        canvas.setPointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      ev.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!pointer3d.down) return;
    const dx = ev.clientX - pointer3d.x;
    const dy = ev.clientY - pointer3d.y;
    if (Math.hypot(dx, dy) > 6) pointer3d.moved = true;

    if (pin3dDrag) {
      if (!setPointerFromEvent(ev)) return;
      const hit = raycastPinOrGround();
      if (!hit.ground) return;
      const device = findDevice(pin3dDrag.id);
      if (!device) return;
      const next = worldToDevicePosV1({
        x: hit.ground.x,
        y: device.z ?? state.render?.wallHeight * 0.72 ?? 1.9,
        z: hit.ground.z,
      });
      device.x = next.x;
      device.y = next.y;
      enrichDeviceWorld(device);
      pin3dDrag.moved = true;
      const mesh = pinMeshes.get(device.id);
      if (mesh) {
        const pos = deviceToWorldPosV1(device);
        mesh.position.set(pos.x, pos.y, pos.z);
      } else {
        scheduleRebuild3d();
      }
      ev.preventDefault();
    }
  });

  const endPointer = (ev) => {
    if (!pointer3d.down) return;
    const dragInfo = pin3dDrag;
    const tapEmpty =
      !!placeKind && !pointer3d.moved && !pointer3d.hitDeviceId;
    const tapPin = pointer3d.hitDeviceId && !pointer3d.moved;

    pin3dDrag = null;
    pointer3d.down = false;
    pointer3d.placeAt = null;
    if (controls) controls.enabled = true;

    if (tapEmpty && placeKind) {
      setPointerFromEvent(ev);
      const hit = raycastPinOrGround();
      const g = hit.ground;
      if (g) {
        const pos = worldToDevicePosV1({
          x: g.x,
          y: (state.render?.wallHeight ?? 2.7) * 0.72,
          z: g.z,
        });
        addDeviceAt(placeKind, pos.x, pos.y, pos.z);
      }
      return;
    }

    if (dragInfo) {
      if (tapPin && dragInfo.id && !dragInfo.moved) {
        if (selectedDeviceId === dragInfo.id) {
          if (confirm("このセンサー/デバイスを削除しますか？")) {
            deleteDevice(dragInfo.id);
            return;
          }
        }
      }
      if (state) persistLocal(state);
      refreshSecurityBridge(state);
      refresh2d();
    }
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
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
  bindDevicePalette();
  bindRenameSheet();
  $("fpb-clear-bg")?.addEventListener("click", clearBackground);
  $("fpb-detect")?.addEventListener("click", () => runAutoDetect());
  $("fpb-add-room")?.addEventListener("click", addRoom);
  $("fpb-save")?.addEventListener("click", saveAll);
  $("fpb-send-security")?.addEventListener("click", sendToSecurity);

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
        if (/^#(00ff88|39ff14|00ff00|059669)$/i.test(g)) state.render.glowColor = "#2563EB";
        if (/^#(00d4ff|00e5ff|00ffff)$/i.test(a)) state.render.glowColorAlt = "#0284c7";
      }
      for (const f of state.floors || []) {
        ensureBgTransform(f);
        ensureDevices(f);
      }
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
