/**
 * TiSLY Security — クリーン＆テック ライト 3D
 * アイソメトリック俯瞰 · 階層スタック · DI発報発光
 * ホワイト基調＋シャープなスレート輪郭
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { normalizeDeviceKind } from "../shared/tisly-device-pin-icons-v1.js";
import {
  createNeonPinMesh3d,
  deviceToWorldPosV1,
  pctToWorldV1,
  pulseNeonPinMesh3d,
} from "../shared/tisly-neon-pin-mesh-v1.js";

const LS_KEY = "tisly_floorplan_config";
const FLAG = "tisly_floorplan_for_security";

/** 階層スタックの基準ギャップ（展開時・立体分離） */
const STACK_GAP = 6.8;
/** 外周スラブ上に 1F 屋内を浮かせるマージン */
const INDOOR_LIFT = 1.15;
/** フォーカス階をカメラ中央へ寄せる基準 Y */
const FOCUS_CENTER_Y = 2.6;
/** 非選択階の不透明度 */
const NON_FOCUS_OPACITY = 0.35;
/** 非選択階の追加 Y 分離（選択階を際立たせる） */
const NON_FOCUS_Y_SEP = 0.32;
const CAM_FOV = 48;
const CAM_DIST_MIN = 30;
const BG = 0xf8fafc;
const GRID_MAJOR = 0x94a3b8;
const GRID_LINE = 0xcbd5e1;
/** 部屋・スラブ境界のシャープなアウトライン */
const EDGE_SLATE = 0x475569;
const EDGE_ASH = 0x334155;
const ROOM_FILL = 0xffffff;
const ROOM_FILL_OUTDOOR = 0xf1f5f9;
const SLAB_TINT = 0xf8fafc;
/** アイソメ俯瞰の仰角帯（水平面から） */
const CAM_ELEV_MIN = 45;
const CAM_ELEV_MAX = 55;
const CAM_ELEV_DEFAULT = 52;

/** @type {import('three').Scene | null} */
let scene = null;
/** @type {import('three').PerspectiveCamera | null} */
let camera = null;
/** @type {import('three').WebGLRenderer | null} */
let renderer = null;
/** @type {CSS2DRenderer | null} */
let labelRenderer = null;
/** @type {OrbitControls | null} */
let controls = null;
/** @type {import('three').Group | null} */
let buildingGroup = null;
/** @type {HTMLElement | null} */
let mountEl = null;
let animId = 0;
let clock = new THREE.Clock();
let alertPulse = 0;

/** @type {THREE.SpotLight | null} */
let spotLight = null;
/** @type {THREE.PointLight | null} */
let alertPoint = null;

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

/** @type {{
 *  site: any,
 *  floorId: string,
 *  floorplan: any | null,
 *  showCameras: boolean,
 *  showSensors: boolean,
 *  showZones: boolean,
 *  showLabels: boolean,
 *  stackExpand: number,
 *  alertRoomIds: Set<string>,
 *  alertSensorIds: Set<string>,
 *  alertTier: 'none' | 'perimeter' | 'critical',
 * }} */
const state = {
  site: null,
  floorId: "1f",
  floorplan: null,
  showCameras: true,
  showSensors: true,
  showZones: true,
  showLabels: true,
  stackExpand: 0.88,
  alertRoomIds: new Set(),
  alertSensorIds: new Set(),
  alertTier: "none",
};

/** 初回のみカメラをアイソメ位置へスナップ */
let cameraBootstrapped = false;
/** フォーカス階への滑らかな視点移動 */
const focusAnim = {
  active: false,
  targetY: 2,
  camBaseY: 14,
};
/** 階層 Y スライドアニメ */
const layerAnim = {
  active: false,
  /** @type {Map<string, number>} */
  targets: new Map(),
};

/** @type {Map<string, {
 *  mesh: THREE.Mesh,
 *  mat: THREE.MeshStandardMaterial,
 *  edge: THREE.LineSegments,
 *  tier: string,
 * }>} */
const roomMeshes = new Map();
/** @type {Map<string, THREE.Group>} */
const sensorPins = new Map();
/** @type {THREE.Mesh[]} */
const perimeterGlowMeshes = [];
/** @type {THREE.Object3D[]} */
const floorShells = [];

function disposeObject(obj) {
  obj.traverse((o) => {
    /* CSS2D の DOM を必ず剥がす（孤児ラベル多重描画防止） */
    if (o.isCSS2DObject && o.element) {
      try {
        o.element.remove();
      } catch {
        /* ignore */
      }
    }
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) {
        o.material.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    }
  });
}

/**
 * シーン内メッシュ／CSS2D／HTML オーバーレイを完全クリアしてから再描画する
 */
function clearGroup(group) {
  if (!group) return;
  const kids = group.children.slice();
  for (const c of kids) {
    group.remove(c);
    disposeObject(c);
  }
  roomMeshes.clear();
  sensorPins.clear();
  perimeterGlowMeshes.length = 0;
  floorShells.length = 0;
  /* CSS2DRenderer 配下の孤児 DOM を強制全消去 */
  if (labelRenderer?.domElement) {
    labelRenderer.domElement.innerHTML = "";
  }
  /* 万一マウント直下に残った旧ピン／ラベル HTML も除去 */
  if (mountEl) {
    mountEl
      .querySelectorAll(
        ".sf-iso3d-room-label, .sf-iso3d-pin, .tisly-neon-pin, .sf-iso3d-alert-tip"
      )
      .forEach((el) => {
        if (!labelRenderer?.domElement?.contains(el)) el.remove();
      });
  }
}

function loadLocalFloorplan() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function wantsBuilderMap() {
  try {
    const q = new URLSearchParams(location.search || "");
    if (q.get("fromBuilder") === "1") return true;
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function resolveFloorLayer(floorId) {
  const fp = state.floorplan;
  if (fp?.floors?.length) {
    const layer = fp.floors.find((f) => f.id === floorId);
    if (
      layer &&
      layer.enabled !== false &&
      ((layer.rooms || []).length > 0 ||
        (layer.devices || []).length > 0 ||
        (layer.openings || []).length > 0)
    ) {
      return layer;
    }
  }
  return null;
}

function roomsForFloor(floorId) {
  const siteRooms = (state.site?.rooms || []).filter(
    (r) => r.floorId === floorId
  );
  const layer = resolveFloorLayer(floorId);
  const useBuilder = wantsBuilderMap() && (layer?.rooms || []).length > 0;
  const source = useBuilder
    ? layer.rooms
    : siteRooms.length
      ? siteRooms
      : layer?.rooms || [];
  return source.map((r) => {
    const siteMatch =
      siteRooms.find((sr) => sr.id === r.id) ||
      siteRooms.find((sr) => sr.label === r.label);
    const alertVisible =
      state.alertRoomIds.has(r.id) ||
      (siteMatch &&
        (state.alertRoomIds.has(siteMatch.id) || siteMatch.alertVisible)) ||
      !!r.alertVisible;
    return {
      id: r.id,
      label: r.label,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      alertVisible,
      floorId,
    };
  });
}

function sensorsForFloor(floorId) {
  const layer = resolveFloorLayer(floorId);
  const fromDevices = (layer?.devices || []).map((d) => ({
    id: d.id,
    floorId,
    kind: normalizeDeviceKind(d.kind),
    label: d.label,
    x: d.x,
    y: d.y,
    z: d.z,
    worldX: d.worldX,
    worldY: d.worldY,
    worldZ: d.worldZ,
    alertVisible: state.alertSensorIds.has(d.id),
  }));
  const fromOpenings = (layer?.openings || []).map((o) => ({
    id: o.id,
    floorId,
    kind: normalizeDeviceKind(o.kind === "window" ? "window" : "door"),
    label: o.label,
    x: o.x,
    y: o.y,
    alertVisible: state.alertSensorIds.has(o.id),
  }));
  if (wantsBuilderMap() && (fromDevices.length || fromOpenings.length)) {
    return fromDevices.length ? fromDevices : fromOpenings;
  }
  const siteSensors = (state.site?.sensors || []).filter(
    (s) => s.floorId === floorId
  );
  if (siteSensors.length) {
    return siteSensors.map((s) => ({
      ...s,
      kind: normalizeDeviceKind(s.kind),
      alertVisible: s.alertVisible || state.alertSensorIds.has(s.id),
    }));
  }
  if (fromDevices.length) return fromDevices;
  return fromOpenings;
}

function clampElevDeg(deg) {
  const n = Number(deg);
  const raw = Number.isFinite(n) ? n : CAM_ELEV_DEFAULT;
  return Math.min(CAM_ELEV_MAX, Math.max(CAM_ELEV_MIN, raw));
}

function renderOpts() {
  const r = state.floorplan?.render || {};
  return {
    wallHeight: r.wallHeight ?? 2.55,
    roomOpacity: r.roomOpacity ?? 0.88,
    cameraElevationDeg: clampElevDeg(r.cameraElevationDeg ?? CAM_ELEV_DEFAULT),
  };
}

/** 有効フロアを下→上（外周→上層）で並べる */
function orderedFloorIds() {
  const floors = (state.site?.floors || []).filter((f) => f.enabled !== false);
  const rank = (id) => {
    if (id === "outdoor") return 0;
    if (id === "1f") return 1;
    if (id === "2f") return 2;
    if (id === "3f") return 3;
    if (id === "roof") return 4;
    return 5;
  };
  const ids = floors.map((f) => f.id).sort((a, b) => rank(a) - rank(b));
  if (!ids.length) return ["outdoor", "1f", "2f"];
  return ids;
}

function floorHasContent(floorId) {
  return (
    roomsForFloor(floorId).length > 0 || sensorsForFloor(floorId).length > 0
  );
}

function drawFloorIds(focusId, expand) {
  let floorIds = orderedFloorIds().filter(
    (id) => floorHasContent(id) || id === focusId
  );
  if (!floorIds.length) floorIds = [focusId || "1f"];
  return expand < 0.08 ? [focusId || floorIds[0]] : floorIds;
}

/**
 * 敷地・外周を Y=0、屋内階をその上にマージン付きで積む基準高さ
 */
function structuralLayerBase(floorId, drawIds, wallH, expand) {
  const gap = STACK_GAP * expand;
  if (floorId === "outdoor") return 0;
  const hasOutdoor = drawIds.includes("outdoor");
  if (hasOutdoor) {
    const indoorIds = drawIds.filter((id) => id !== "outdoor");
    const indoorIdx = indoorIds.indexOf(floorId);
    return wallH * 0.52 + INDOOR_LIFT + indoorIdx * gap;
  }
  const idx = drawIds.indexOf(floorId);
  return Math.max(0, idx) * gap;
}

/**
 * フォーカス階を中央へ、非選択階は半透明＋Y オフセットで分離
 */
function computeLayerLayout(drawIds, focusId, wallH, expand) {
  const gap = STACK_GAP * expand;
  const focusBase = structuralLayerBase(focusId, drawIds, wallH, expand);
  const panY = FOCUS_CENTER_Y - focusBase;
  const focusIdx = Math.max(0, drawIds.indexOf(focusId));
  const positions = {};
  for (let i = 0; i < drawIds.length; i++) {
    const fid = drawIds[i];
    const base = structuralLayerBase(fid, drawIds, wallH, expand) + panY;
    const rel = i - focusIdx;
    const sep =
      fid === focusId ? 0 : rel * gap * NON_FOCUS_Y_SEP;
    positions[fid] = base + sep;
  }
  return {
    positions,
    focusY: positions[focusId] ?? FOCUS_CENTER_Y,
  };
}

function cameraDistanceForLayout(positions, wallH, expand) {
  const ys = Object.values(positions);
  const spanY =
    (Math.max(...ys) - Math.min(...ys)) + wallH + INDOOR_LIFT + 4;
  const siteSpan = 26;
  const fit = Math.sqrt(siteSpan * siteSpan + spanY * spanY) * 0.78;
  return Math.max(CAM_DIST_MIN, fit + expand * 4);
}

function findLayerGroup(floorId) {
  if (!buildingGroup) return null;
  for (const c of buildingGroup.children) {
    if (c.userData?.floorId === floorId) return c;
  }
  return null;
}

function setLayerMaterialOpacity(obj, opacity, alerting) {
  if (!obj || alerting) return;
  if (obj.material) {
    if (obj.material.opacity != null) {
      obj.material.transparent = true;
      obj.material.opacity = opacity;
    }
    if (Array.isArray(obj.material)) {
      for (const m of obj.material) {
        if (m && m.opacity != null) {
          m.transparent = true;
          m.opacity = opacity;
        }
      }
    }
  }
}

function applyLayerFocusVisual(floorId, isFocus) {
  const layer = findLayerGroup(floorId);
  if (!layer) return;
  const roomDefault = renderOpts().roomOpacity;
  layer.traverse((o) => {
    if (o.isCSS2DObject && o.element) {
      o.element.style.opacity = isFocus ? "1" : String(NON_FOCUS_OPACITY);
      return;
    }
    const alerting = o.userData?.alerting;
    if (!o.material) return;
    let target;
    if (isFocus) {
      target =
        o.userData?.baseOpacity ??
        (o.userData?.kind === "slab" ? 1 : roomDefault);
      if (alerting) target = Math.max(target, 0.92);
    } else if (alerting) {
      return;
    } else {
      target = NON_FOCUS_OPACITY;
    }
    setLayerMaterialOpacity(o, target, false);
    if (o.material && !Array.isArray(o.material) && o.material.opacity != null) {
      o.material.opacity = target;
    }
    if (Array.isArray(o.material)) {
      for (const m of o.material) {
        if (m) {
          m.transparent = true;
          m.opacity = target;
        }
      }
    }
  });
}

function applyAllLayerFocusVisual(drawIds, focusId) {
  for (const fid of drawIds) {
    applyLayerFocusVisual(fid, fid === focusId);
  }
}

function setLayerTargets(positions) {
  layerAnim.targets.clear();
  for (const [fid, y] of Object.entries(positions)) {
    layerAnim.targets.set(fid, y);
  }
  layerAnim.active = layerAnim.targets.size > 0;
}

function configureCameraForFocus(
  positions,
  focusY,
  wallH,
  expand,
  elevDeg,
  boot = false
) {
  if (!camera || !controls) return;
  const elev = (elevDeg * Math.PI) / 180;
  const dist = cameraDistanceForLayout(positions, wallH, expand);
  const horiz = dist * Math.cos(elev);
  const camY = dist * Math.sin(elev) + focusY * 0.38;
  const desiredTargetY = focusY + 1.05;
  controls.minPolarAngle = Math.PI / 2 - (CAM_ELEV_MAX * Math.PI) / 180;
  controls.maxPolarAngle = Math.PI / 2 - (CAM_ELEV_MIN * Math.PI) / 180;
  controls.minDistance = 12;
  controls.maxDistance = 68;
  if (boot) {
    const k = Math.SQRT1_2;
    camera.position.set(horiz * k, camY, horiz * k);
    controls.target.set(0, desiredTargetY, 0);
    cameraBootstrapped = true;
    focusAnim.active = false;
  } else {
    focusAnim.targetY = desiredTargetY;
    focusAnim.camBaseY = camY;
    focusAnim.active = true;
  }
  controls.update();
}

function syncFloorTabs(floorId) {
  document.querySelectorAll("#sf-floor-tabs [data-floor]").forEach((btn) => {
    btn.classList.toggle(
      "is-on",
      btn.getAttribute("data-floor") === floorId
    );
  });
}

function inferAlertTier() {
  const outdoorAlert =
    roomsForFloor("outdoor").some((r) => r.alertVisible) ||
    sensorsForFloor("outdoor").some((s) => s.alertVisible) ||
    (state.site?.sensors || []).some(
      (s) => s.floorId === "outdoor" && (s.alertVisible || state.alertSensorIds.has(s.id))
    );
  const indoorAlert = (state.site?.rooms || []).some(
    (r) =>
      r.floorId !== "outdoor" &&
      (r.alertVisible || state.alertRoomIds.has(r.id))
  ) ||
    (state.site?.sensors || []).some(
      (s) =>
        s.floorId !== "outdoor" &&
        (s.alertVisible || state.alertSensorIds.has(s.id))
    );
  if (indoorAlert) return "critical";
  if (outdoorAlert) return "perimeter";
  if (state.alertRoomIds.size || state.alertSensorIds.size) {
    const focus = state.floorId;
    return focus === "outdoor" ? "perimeter" : "critical";
  }
  return "none";
}

function onCanvasPointerUp(ev) {
  if (!renderer || !camera || !buildingGroup) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  pointerNdc.set(x, y);
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(buildingGroup.children, true);
  for (const hit of hits) {
    let obj = hit.object;
    while (obj && obj.userData?.kind !== "devicePin") obj = obj.parent;
    if (!obj?.userData?.deviceId) continue;
    const camId = obj.userData.linkedCameraId;
    const detail = {
      sensorId: obj.userData.sensorId || obj.userData.deviceId,
      cameraId: camId || null,
      kind: obj.userData.pinKind,
      label: obj.userData.label,
    };
    window.dispatchEvent(
      new CustomEvent("tisly-security-pin-select", { detail })
    );
    if (camId) {
      window.dispatchEvent(
        new CustomEvent("tisly-security-camera-select", {
          detail: { cameraId: camId },
        })
      );
    }
    break;
  }
}

function makeCyberGridTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#F1F5F9";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(100, 116, 139, 0.42)";
  ctx.lineWidth = 1;
  const step = 32;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(51, 65, 85, 0.55)";
  ctx.lineWidth = 1.75;
  for (let i = 0; i <= 512; i += step * 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

function ensureScene() {
  mountEl = document.getElementById("sf-iso3d-mount");
  if (!mountEl) return false;

  const live =
    renderer &&
    mountEl.contains(renderer.domElement) &&
    labelRenderer &&
    mountEl.contains(labelRenderer.domElement);
  if (live) return true;

  if (renderer) {
    try {
      renderer.dispose();
    } catch {
      /* ignore */
    }
    renderer = null;
    labelRenderer = null;
    controls = null;
    scene = null;
    camera = null;
    buildingGroup = null;
    spotLight = null;
    alertPoint = null;
    roomMeshes.clear();
    sensorPins.clear();
  }

  const w = mountEl.clientWidth || 360;
  const h = mountEl.clientHeight || 360;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 48, 110);
  scene.background = new THREE.Color(BG);

  camera = new THREE.PerspectiveCamera(CAM_FOV, w / h, 0.1, 220);
  /* 上空斜め ~52° の仮置き（rebuild で正式配置） */
  {
    const elev0 = (CAM_ELEV_DEFAULT * Math.PI) / 180;
    const d0 = CAM_DIST_MIN;
    const h0 = d0 * Math.cos(elev0) * Math.SQRT1_2;
    camera.position.set(h0, d0 * Math.sin(elev0), h0);
  }
  camera.lookAt(0, 2.2, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(BG, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "sf-iso3d-canvas";
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.addEventListener("pointerup", onCanvasPointerUp);

  /* 部屋名ラベルのみ CSS2D（ピンは WebGL メッシュ） */
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  labelRenderer.domElement.className = "sf-iso3d-labels";
  mountEl.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2.0, 0);
  /* 仰角 45–55° 帯にロック（水平潰れ防止） */
  controls.minPolarAngle = Math.PI / 2 - (CAM_ELEV_MAX * Math.PI) / 180;
  controls.maxPolarAngle = Math.PI / 2 - (CAM_ELEV_MIN * Math.PI) / 180;
  controls.minDistance = 12;
  controls.maxDistance = 68;
  controls.enablePan = true;
  /* ホイールは階層ドラムへ。ズームはピンチ（2本指） */
  controls.enableZoom = false;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  cameraBootstrapped = false;

  /* 明るいスタジオ照明（上面ハイライト＋側面陰影） */
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.48));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(14, 26, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x94a3b8, 0.38);
  fill.position.set(-16, 10, -12);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe2e8f0, 0.28);
  rim.position.set(4, 8, -18);
  scene.add(rim);

  spotLight = new THREE.SpotLight(0xffffff, 0.55, 55, Math.PI / 5, 0.45, 1);
  spotLight.position.set(6, 24, 8);
  spotLight.target.position.set(0, 0, 0);
  scene.add(spotLight);
  scene.add(spotLight.target);

  alertPoint = new THREE.PointLight(0xef4444, 0, 18, 2);
  alertPoint.position.set(0, 4, 0);
  scene.add(alertPoint);

  const grid = new THREE.GridHelper(28, 28, GRID_MAJOR, GRID_LINE);
  grid.position.y = -0.02;
  scene.add(grid);

  buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  if (!window.__TISLY_SF_ISO3D_RESIZE) {
    window.__TISLY_SF_ISO3D_RESIZE = true;
    window.addEventListener("resize", onResize);
  }
  if (!window.__TISLY_SF_STACK_BOUND) {
    window.__TISLY_SF_STACK_BOUND = true;
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.id !== "sf-iso3d-stack") return;
      state.stackExpand = Number(t.value) / 100;
      rebuild();
    });
  }
  if (!animId) animate();
  return true;
}

function onResize() {
  if (!mountEl || !camera || !renderer || !labelRenderer) return;
  const w = mountEl.clientWidth || 360;
  const h = mountEl.clientHeight || 360;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
}

function animate() {
  animId = requestAnimationFrame(animate);
  const dt = clock.getDelta();

  /* 階層フォーカス時の視点を滑らかに追従 */
  if (focusAnim.active && camera && controls) {
    const k = Math.min(1, dt * 5.5);
    controls.target.y += (focusAnim.targetY - controls.target.y) * k;
    const desiredCamY = focusAnim.camBaseY;
    camera.position.y += (desiredCamY - camera.position.y) * k;
    if (
      Math.abs(controls.target.y - focusAnim.targetY) < 0.02 &&
      Math.abs(camera.position.y - desiredCamY) < 0.04
    ) {
      controls.target.y = focusAnim.targetY;
      camera.position.y = desiredCamY;
      focusAnim.active = false;
    }
  }

  /* 階層 Y スライド追従 */
  if (layerAnim.active && buildingGroup) {
    let moving = false;
    for (const child of buildingGroup.children) {
      const fid = child.userData?.floorId;
      const target = layerAnim.targets.get(fid);
      if (target == null) continue;
      const dy = target - child.position.y;
      if (Math.abs(dy) > 0.025) {
        child.position.y += dy * Math.min(1, dt * 6.2);
        moving = true;
      } else {
        child.position.y = target;
      }
    }
    layerAnim.active = moving;
  }

  if (controls) controls.update();
  alertPulse = (alertPulse + dt * 2.6) % (Math.PI * 2);
  const pulse = 0.55 + Math.sin(alertPulse) * 0.45;

  for (const [, entry] of roomMeshes) {
    if (!entry.mat.userData?.alerting) continue;
    const tier = entry.tier || "critical";
    const mats = entry.mats || [entry.mat];
    if (tier === "perimeter") {
      for (const m of mats) {
        m.emissiveIntensity = 0.45 + pulse * 0.95;
      }
      if (entry.edge?.material) {
        entry.edge.material.opacity = 0.55 + pulse * 0.45;
      }
    } else {
      for (const m of mats) {
        m.emissiveIntensity = 0.55 + pulse * 1.15;
      }
      if (entry.edge?.material) {
        entry.edge.material.opacity = 0.65 + pulse * 0.35;
        entry.edge.material.color.setHex(
          pulse > 0.7 ? 0xff1a1a : 0xf87171
        );
      }
    }
  }

  for (const mesh of perimeterGlowMeshes) {
    const mat = mesh.material;
    if (!mat) continue;
    mat.opacity = 0.22 + pulse * 0.42;
    mat.emissiveIntensity = 0.4 + pulse * 0.9;
  }

  for (const [, pin] of sensorPins) {
    pulseNeonPinMesh3d(pin, pulse);
  }

  if (alertPoint) {
    if (state.alertTier === "critical") {
      alertPoint.color.setHex(0xff1744);
      alertPoint.intensity = 0.6 + pulse * 1.8;
    } else if (state.alertTier === "perimeter") {
      alertPoint.color.setHex(0xf59e0b);
      alertPoint.intensity = 0.35 + pulse * 1.1;
    } else {
      alertPoint.intensity = 0;
    }
  }

  if (renderer && scene && camera) renderer.render(scene, camera);
  if (labelRenderer && scene && camera) labelRenderer.render(scene, camera);
}

function pinWorldFromSensor(s, wallH) {
  if (
    Number.isFinite(s.worldX) &&
    Number.isFinite(s.worldY) &&
    Number.isFinite(s.worldZ)
  ) {
    return { x: s.worldX, y: s.worldY, z: s.worldZ };
  }
  return deviceToWorldPosV1(s, wallH);
}

function roomMaterials(alerting, floorId) {
  const isOutdoor = floorId === "outdoor";
  const tier = alerting
    ? isOutdoor || state.alertTier === "perimeter"
      ? "perimeter"
      : "critical"
    : "none";

  if (tier === "critical") {
    return {
      tier,
      mat: new THREE.MeshStandardMaterial({
        color: 0xfef2f2,
        emissive: 0xef4444,
        emissiveIntensity: 0.35,
        metalness: 0.08,
        roughness: 0.55,
        transparent: true,
        opacity: 0.94,
      }),
      edge: 0xef4444,
    };
  }
  if (tier === "perimeter") {
    return {
      tier,
      mat: new THREE.MeshStandardMaterial({
        color: 0xfff7ed,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.28,
        metalness: 0.06,
        roughness: 0.58,
        transparent: true,
        opacity: 0.92,
      }),
      edge: 0xf97316,
    };
  }
  const fill = isOutdoor ? ROOM_FILL_OUTDOOR : ROOM_FILL;
  return {
    tier: "none",
    mat: new THREE.MeshStandardMaterial({
      color: fill,
      emissive: 0xe2e8f0,
      emissiveIntensity: 0.03,
      metalness: 0.06,
      roughness: 0.68,
      transparent: true,
      opacity: Math.min(Math.max(renderOpts().roomOpacity, 0.82), 0.96),
    }),
    edge: EDGE_ASH,
  };
}

/**
 * 上面ハイライト＋側面を少し落とす6面マテリアル（立体シェーディング）
 * BoxGeometry 面順: +x -x +y -y +z -z
 */
function shadeRoomMaterials(baseMat) {
  const top = baseMat;
  const mkSide = (mul, roughness) => {
    const m = baseMat.clone();
    const c = baseMat.color.clone().multiplyScalar(mul);
    m.color.copy(c);
    m.roughness = roughness;
    m.emissiveIntensity = (baseMat.emissiveIntensity || 0) * 0.65;
    return m;
  };
  const side = mkSide(0.9, 0.78);
  const bottom = mkSide(0.78, 0.88);
  const side2 = side.clone();
  const side3 = side.clone();
  const side4 = side.clone();
  return [side, side2, top, bottom, side3, side4];
}

/**
 * 部屋ブロック＋外壁フレーム（厚み付き）を1フロア分追加
 */
function addFloorLayer(floorId, yBase, wallH, isFocus) {
  const layer = new THREE.Group();
  layer.position.y = yBase;
  layer.userData = { floorId, kind: "floorLayer" };

  const slabSize = floorId === "outdoor" ? 24 : 21.5;
  const slabMat = new THREE.MeshStandardMaterial({
    map: makeCyberGridTexture(),
    color: SLAB_TINT,
    metalness: 0.1,
    roughness: 0.82,
    emissive: 0xffffff,
    emissiveIntensity: isFocus ? 0.05 : 0.015,
  });
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(slabSize, 0.18, slabSize),
    slabMat
  );
  slab.position.y = 0.09;
  slab.receiveShadow = true;
  slab.castShadow = true;
  slab.userData = { kind: "slab", floorId, baseOpacity: 1 };
  layer.add(slab);

  /* スラブ外周のダークアウトライン（マス目との境界を明確化） */
  const slabEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(slabSize, 0.18, slabSize)),
    new THREE.LineBasicMaterial({
      color: isFocus ? EDGE_ASH : EDGE_SLATE,
      transparent: true,
      opacity: isFocus ? 0.95 : 0.55,
    })
  );
  slabEdge.position.y = 0.09;
  layer.add(slabEdge);

  /* フロア外枠ワイヤー（アッシュネイビー輪郭） */
  const shellGeo = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(slabSize + 0.15, wallH * 0.62, slabSize + 0.15)
  );
  const shellColor =
    state.alertTier === "critical" && isFocus
      ? 0xef4444
      : state.alertTier === "perimeter" && floorId === "outdoor"
        ? 0xf59e0b
        : isFocus
          ? EDGE_ASH
          : EDGE_SLATE;
  const shell = new THREE.LineSegments(
    shellGeo,
    new THREE.LineBasicMaterial({
      color: shellColor,
      transparent: true,
      opacity: isFocus ? 0.95 : 0.4,
    })
  );
  shell.position.y = wallH * 0.28;
  layer.add(shell);
  floorShells.push(shell);

  /* DI1：外周パルスグローリング */
  if (floorId === "outdoor" && state.alertTier !== "none") {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf97316,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(10.2, 11.4, 64),
      ringMat
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.22;
    layer.add(ring);
    perimeterGlowMeshes.push(ring);
  }

  const rooms = roomsForFloor(floorId);
  let firstAlertRoom = null;

  for (const r of rooms) {
    if (!state.showZones) continue;
    const alerting = !!r.alertVisible;
    const ww = Math.max(r.w * 0.2, 0.5);
    const dd = Math.max(r.h * 0.2, 0.5);
    const { mat, edge: edgeColor, tier } = roomMaterials(
      alerting,
      floorId
    );
    mat.userData = { alerting };
    const mats = shadeRoomMaterials(mat);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(ww, wallH * 0.58, dd),
      mats
    );
    mesh.position.set(
      pctToWorldV1(r.x + r.w / 2),
      wallH * 0.29 + 0.18,
      pctToWorldV1(r.y + r.h / 2)
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      roomId: r.id,
      kind: "room",
      alerting,
      floorId,
      baseOpacity: mat.opacity,
    };
    layer.add(mesh);

    /* 外壁フレーム風エッジ（シャープなダークスレート） */
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: alerting ? 0.98 : isFocus ? 0.95 : 0.7,
        linewidth: 1,
      })
    );
    edge.position.copy(mesh.position);
    layer.add(edge);
    roomMeshes.set(`${floorId}:${r.id}`, { mesh, mat, mats, edge, tier });

    if (alerting && !firstAlertRoom) firstAlertRoom = { r, mesh };

    if (state.showLabels && r.label) {
      const labelEl = document.createElement("div");
      labelEl.className =
        "sf-iso3d-room-label" + (alerting ? " is-alert" : "");
      labelEl.textContent = r.label;
      const labelObj = new CSS2DObject(labelEl);
      labelObj.position.set(
        mesh.position.x,
        mesh.position.y + wallH * 0.22,
        mesh.position.z
      );
      layer.add(labelObj);
    }
  }

  /* DI2：発報地点ピン＆ツールチップ */
  if (
    firstAlertRoom &&
    floorId !== "outdoor" &&
    (state.alertTier === "critical" || firstAlertRoom.r.alertVisible)
  ) {
    const tip = document.createElement("div");
    tip.className = "sf-iso3d-alert-tip";
    tip.innerHTML =
      "<strong>🚨 発報地点</strong>" +
      `<span>${firstAlertRoom.r.label || firstAlertRoom.r.id}</span>`;
    const tipObj = new CSS2DObject(tip);
    tipObj.position.set(
      firstAlertRoom.mesh.position.x,
      firstAlertRoom.mesh.position.y + wallH * 0.55,
      firstAlertRoom.mesh.position.z
    );
    layer.add(tipObj);

    const pinGeo = new THREE.ConeGeometry(0.28, 0.72, 5);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff0040,
      emissiveIntensity: 1.2,
      metalness: 0.4,
      roughness: 0.25,
    });
    const alertPin = new THREE.Mesh(pinGeo, pinMat);
    alertPin.position.set(
      firstAlertRoom.mesh.position.x,
      firstAlertRoom.mesh.position.y + wallH * 0.42,
      firstAlertRoom.mesh.position.z
    );
    alertPin.rotation.x = Math.PI;
    alertPin.castShadow = true;
    layer.add(alertPin);
  }

  const sensors = sensorsForFloor(floorId);
  for (const s of sensors) {
    const kind = normalizeDeviceKind(s.kind);
    const isCam = kind === "camera";
    if (isCam && !state.showCameras) continue;
    if (!isCam && !state.showSensors) continue;
    const alerting = !!s.alertVisible;
    const pin = createNeonPinMesh3d(THREE, {
      id: s.id,
      kind,
      label: s.label || s.customerLabel || s.id,
      alerting,
      linkedCameraId: s.linkedCameraId || (isCam ? s.id : null),
      scale: 1.12,
      vivid: true,
    });
    const pos = pinWorldFromSensor(s, wallH);
    pin.position.set(pos.x, pos.y, pos.z);
    layer.add(pin);
    sensorPins.set(s.id, pin);
  }

  if (!isFocus) {
    layer.traverse((o) => {
      if (o.userData?.alerting) return;
      setLayerMaterialOpacity(o, NON_FOCUS_OPACITY, false);
      if (o.isCSS2DObject && o.element) {
        o.element.style.opacity = String(NON_FOCUS_OPACITY);
      }
    });
  } else {
    layer.traverse((o) => {
      if (o.isCSS2DObject && o.element) {
        o.element.style.opacity = "1";
      }
    });
  }

  buildingGroup.add(layer);
}

function rebuild() {
  if (!ensureScene() || !buildingGroup) return;
  /* 再描画前に既存 CSS2D／ピン／メッシュを必ず全クリア */
  clearGroup(buildingGroup);
  if (labelRenderer?.domElement) {
    labelRenderer.domElement.innerHTML = "";
  }

  state.alertTier = inferAlertTier();
  const opts = renderOpts();
  const wallH = opts.wallHeight;
  const expand = Math.min(1, Math.max(0, state.stackExpand));
  const focusId = state.floorId || "1f";

  const drawIds = drawFloorIds(focusId, expand);

  const { positions, focusY } = computeLayerLayout(
    drawIds,
    focusId,
    wallH,
    expand
  );

  drawIds.forEach((fid) => {
    addFloorLayer(fid, positions[fid] ?? 0, wallH, fid === focusId);
  });

  const elevDeg = opts.cameraElevationDeg;
  const midY =
    drawIds.length > 1
      ? (Math.max(...Object.values(positions)) +
          Math.min(...Object.values(positions))) /
        2
      : focusY;

  configureCameraForFocus(
    positions,
    focusY,
    wallH,
    expand,
    elevDeg,
    !cameraBootstrapped
  );
  setLayerTargets(positions);

  if (spotLight) {
    spotLight.target.position.set(0, midY, 0);
  }
  if (alertPoint) {
    alertPoint.position.set(0, midY + 3.5, 0);
  }

  syncHud(focusId);
  syncOrbitDataFocus(focusId);
  syncFloorTabs(focusId);
  syncStackSlider();
  syncAlertHud();
}

function syncStackSlider() {
  const el = document.getElementById("sf-iso3d-stack");
  if (!el) return;
  const v = Math.round(state.stackExpand * 100);
  if (Number(el.value) !== v) el.value = String(v);
  const lab = document.getElementById("sf-iso3d-stack-val");
  if (lab) lab.textContent = `${v}%`;
}

function syncAlertHud() {
  const badge = document.getElementById("sf-iso3d-alert-badge");
  if (!badge) return;
  if (state.alertTier === "critical") {
    badge.hidden = false;
    badge.className = "sf-iso3d-alert-badge is-critical";
    badge.textContent = "🚨 DI2 段階侵入・発報";
  } else if (state.alertTier === "perimeter") {
    badge.hidden = false;
    badge.className = "sf-iso3d-alert-badge is-perimeter";
    badge.textContent = "⚠️ 駐車場センサー (DI1) 検知";
  } else {
    badge.hidden = true;
    badge.textContent = "";
  }
}

function syncHud(floorId) {
  const hud = document.getElementById("sf-iso3d-floor-label");
  if (!hud) return;
  const labels = {
    "1f": "1F",
    "2f": "2F",
    "3f": "3F",
    outdoor: "外周・敷地",
  };
  hud.textContent = labels[floorId] || floorId;
}

function syncOrbitDataFocus(floorId) {
  const orbit = document.getElementById("sf-iso-orbit");
  if (orbit) orbit.setAttribute("data-focus", floorId);
  document.querySelectorAll(".sf-iso-layer").forEach((layer) => {
    const id = layer.getAttribute("data-layer");
    const on = id === floorId;
    layer.classList.toggle("is-focus", on);
    layer.classList.toggle("is-dim", !on);
  });
  window.__TISLY_SF_FLOOR = floorId;
}

async function maybeFetchActiveFloorplan() {
  if (state.floorplan) return state.floorplan;
  if (!wantsBuilderMap()) {
    state.floorplan = loadLocalFloorplan();
    return state.floorplan;
  }
  const local = loadLocalFloorplan();
  if (local?.floors) {
    state.floorplan = local;
    return local;
  }
  try {
    const res = await fetch("/api/floorplan-builder/v1/active", {
      cache: "no-store",
    });
    const data = await res.json();
    if (data?.ok && data.config) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data.config));
      } catch {
        /* ignore */
      }
      state.floorplan = data.config;
      return data.config;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * site API データ＋ビルダー間取りで 3D を更新
 */
export async function updateSecurityIso3d(site, floorId, opts = {}) {
  state.site = site || state.site;
  state.floorId = floorId || state.floorId || "1f";
  if (opts.showCameras != null) state.showCameras = !!opts.showCameras;
  if (opts.showSensors != null) state.showSensors = !!opts.showSensors;
  if (opts.showZones != null) state.showZones = !!opts.showZones;
  if (opts.showLabels != null) state.showLabels = !!opts.showLabels;
  if (opts.stackExpand != null) {
    state.stackExpand = Math.min(1, Math.max(0, Number(opts.stackExpand)));
  }

  state.alertRoomIds = new Set(
    (state.site?.rooms || []).filter((r) => r.alertVisible).map((r) => r.id)
  );
  state.alertSensorIds = new Set(
    (state.site?.sensors || []).filter((s) => s.alertVisible).map((s) => s.id)
  );

  await maybeFetchActiveFloorplan();
  if (!state.floorplan) state.floorplan = loadLocalFloorplan();

  rebuild();
}

export function setSecurityIso3dFloor(floorId) {
  if (!floorId) return;
  const prev = state.floorId;
  state.floorId = floorId;
  const expand = Math.min(1, Math.max(0, state.stackExpand));
  const drawIds = drawFloorIds(floorId, expand);
  if (
    buildingGroup?.children.length &&
    drawIds.length &&
    prev !== floorId
  ) {
    const opts = renderOpts();
    const wallH = opts.wallHeight;
    const { positions, focusY } = computeLayerLayout(
      drawIds,
      floorId,
      wallH,
      expand
    );
    setLayerTargets(positions);
    applyAllLayerFocusVisual(drawIds, floorId);
    configureCameraForFocus(
      positions,
      focusY,
      wallH,
      expand,
      opts.cameraElevationDeg,
      false
    );
    syncHud(floorId);
    syncOrbitDataFocus(floorId);
    syncFloorTabs(floorId);
    return;
  }
  rebuild();
}

export function setSecurityIso3dStack(expand01) {
  state.stackExpand = Math.min(1, Math.max(0, Number(expand01) || 0));
  rebuild();
}

export function setSecurityIso3dAlert(on, roomIds, sensorIds) {
  state.alertRoomIds = new Set(roomIds || (on ? ["my-1f-katte"] : []));
  state.alertSensorIds = new Set(
    sensorIds ||
      (on
        ? [
            "my-door-katte",
            "my-lock-katte",
            "my-gas-katte",
            "my-panel-50a",
            "my-cam-katte",
          ]
        : [])
  );
  if (state.site?.rooms) {
    for (const r of state.site.rooms) {
      r.alertVisible = state.alertRoomIds.has(r.id);
    }
  }
  if (state.site?.sensors) {
    for (const s of state.site.sensors) {
      s.alertVisible = state.alertSensorIds.has(s.id);
    }
  }
  /* フル rebuild せず見た目だけ更新できる場合も rebuild で確実同期 */
  rebuild();
}

export function setSecurityIso3dOrbitEnabled(on) {
  if (!controls) return;
  controls.enableRotate = !!on;
  controls.enablePan = !!on;
}

export function applyFloorplanConfigToIso3d(config) {
  if (!config?.floors) return;
  state.floorplan = config;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
  rebuild();
}

export function mountSecurityIso3d() {
  ensureScene();
  onResize();
  rebuild();
}

window.TislySecurityIso3d = {
  update: updateSecurityIso3d,
  setFloor: setSecurityIso3dFloor,
  setAlert: setSecurityIso3dAlert,
  setStack: setSecurityIso3dStack,
  setOrbitEnabled: setSecurityIso3dOrbitEnabled,
  applyFloorplan: applyFloorplanConfigToIso3d,
  mount: mountSecurityIso3d,
  rebuild,
};
