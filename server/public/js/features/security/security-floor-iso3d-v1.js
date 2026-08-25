/**
 * TiSLY Security — お掃除ロボ風 3D フロアマップ
 * 白壁リブ · 部屋色塗り分け · 白カプセルバッジ
 * 単一フロア完全切替 · DI発報発光
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

/** 階層スタックの基準ギャップ（カメラ距離計算用） */
const STACK_GAP = 6.8;
/** 外周スラブ上に 1F 屋内を浮かせるマージン（レイアウト互換） */
const INDOOR_LIFT = 1.15;
/** フォーカス階をカメラ中央へ寄せる基準 Y */
const FOCUS_CENTER_Y = 2.6;
/** ドラムリール切替のスライド距離 */
const REEL_SLIDE = 10.5;
/** ドラムリール切替の所要秒 */
const REEL_DURATION = 0.4;
const CAM_FOV = 46;
const CAM_DIST_MIN = 32;
/** ピン詳細寄りの最短距離（ピンチ／ホイール） */
const CAM_ZOOM_MIN = 5;
/** 間取り全体俯瞰の最長距離（ピンチ／ホイール） */
const CAM_ZOOM_MAX = 110;
/** ダブルタップ判定（ms / px） */
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_MAX_PX = 32;
/** 清潔感のあるライトスレート背景
 * お掃除ロボ風フロアマップ */
const BG = 0xf1f5f9;
const GRID_MAJOR = 0xcbd5e1;
const GRID_LINE = 0xe2e8f0;
/** 部屋・スラブ境界のシャープなアウトライン */
const EDGE_SLATE = 0x64748b;
const EDGE_ASH = 0x475569;
const ROOM_FILL = 0x9aa3ad;
const ROOM_FILL_OUTDOOR = 0xb8d0a8;
const SLAB_TINT = 0xf8fafc;
/** 白いウォールリブ（天面／側面） */
const WALL_TOP = 0xffffff;
const WALL_SIDE = 0xeef2f7;
const WALL_THICK = 0.18;
/** 床・壁のソリッド不透明度（半透明ゴースト廃止） */
const SOLID_OPACITY = 1;
/** アイソメ俯瞰の仰角帯（水平面から） */
const CAM_ELEV_MIN = 45;
const CAM_ELEV_MAX = 55;
const CAM_ELEV_DEFAULT = 52;

/** 2本指ピンチズーム状態 */
const pinchZoom = {
  active: false,
  startDist: 0,
  startCamDist: 0,
};

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
/** ダブルタップで戻すホーム視点 */
const cameraHome = {
  saved: false,
  pos: new THREE.Vector3(),
  target: new THREE.Vector3(),
};
/** ダブルタップ検出用 */
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;
/** フォーカス階への滑らかな視点移動 */
const focusAnim = {
  active: false,
  targetY: 2,
  camBaseY: 14,
};
/** 階層 Y スライドアニメ（アイドル時の微調整） */
const layerAnim = {
  active: false,
  /** @type {Map<string, number>} */
  targets: new Map(),
};
/** ドラムリール式フロア切替（上下スライドアウト／イン） */
const reelAnim = {
  active: false,
  fromId: "",
  toId: "",
  t: 0,
  fromStartY: 0,
  fromEndY: 0,
  toStartY: 0,
  toEndY: 0,
};
/** @type {import('three').GridHelper | null} */
let groundGrid = null;

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
    /* ソリッド描画を優先（半透明ゴーストは使わない） */
    roomOpacity: SOLID_OPACITY,
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

function drawFloorIds(focusId, _expand) {
  let floorIds = orderedFloorIds().filter(
    (id) => floorHasContent(id) || id === focusId
  );
  if (!floorIds.length) floorIds = [focusId || "1f"];
  /* 切替アニメ用に全階を常時保持し、visible で単一フロア表示 */
  return floorIds;
}

/**
 * 敷地・外周を Y=0、屋内階をその上にマージン付きで積む基準高さ
 * （互換のため残置 · 単一フロア表示では FOCUS_CENTER_Y を使用）
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
 * 選択中フロアのみ中央に配置（非選択は visible=false で完全非表示）
 */
function computeLayerLayout(drawIds, focusId, _wallH, _expand) {
  const positions = {};
  for (let i = 0; i < drawIds.length; i++) {
    positions[drawIds[i]] = FOCUS_CENTER_Y;
  }
  return {
    positions,
    focusY: positions[focusId] ?? FOCUS_CENTER_Y,
  };
}

function cameraDistanceForLayout(_positions, wallH, expand) {
  const spanY = wallH + INDOOR_LIFT + 4;
  const siteSpan = 26;
  const fit = Math.sqrt(siteSpan * siteSpan + spanY * spanY) * 0.78;
  return Math.max(CAM_DIST_MIN, fit + expand * 2);
}

function findLayerGroup(floorId) {
  if (!buildingGroup) return null;
  for (const c of buildingGroup.children) {
    if (c.userData?.floorId === floorId) return c;
  }
  return null;
}

/** CSS2D ラベル／ピン DOM の表示をレイヤに同期 */
function syncLayerDomVisibility(layer, on) {
  if (!layer) return;
  layer.traverse((o) => {
    if (o.isCSS2DObject && o.element) {
      o.element.style.display = on ? "" : "none";
      o.element.style.opacity = on ? "1" : "0";
      o.element.style.visibility = on ? "visible" : "hidden";
    }
  });
}

/**
 * 選択階のみ visible、非選択は完全非表示（半透明・ゴースト廃止）
 */
function applyLayerFocusVisual(floorId, isFocus) {
  const layer = findLayerGroup(floorId);
  if (!layer) return;
  if (reelAnim.active && (floorId === reelAnim.fromId || floorId === reelAnim.toId)) {
    /* リール中は from/to を一時表示 */
    layer.visible = true;
    syncLayerDomVisibility(layer, true);
    return;
  }
  layer.visible = !!isFocus;
  syncLayerDomVisibility(layer, !!isFocus);
}

function applyAllLayerFocusVisual(drawIds, focusId) {
  for (const fid of drawIds) {
    applyLayerFocusVisual(fid, fid === focusId);
  }
  if (groundGrid) {
    /* 外周以外では地面グリッドも隠し、透け重なりを防ぐ */
    groundGrid.visible = focusId === "outdoor";
  }
}

function setLayerTargets(positions) {
  layerAnim.targets.clear();
  for (const [fid, y] of Object.entries(positions)) {
    layerAnim.targets.set(fid, y);
  }
  layerAnim.active = layerAnim.targets.size > 0;
}

/**
 * ドラムリール: 現フロアがスライドアウト → 次フロアがスライドイン → スナップ
 * @param {string} fromId
 * @param {string} toId
 * @param {string[]} drawIds
 */
function startReelTransition(fromId, toId, drawIds) {
  const fromLayer = findLayerGroup(fromId);
  const toLayer = findLayerGroup(toId);
  if (!fromLayer || !toLayer || fromId === toId) {
    applyAllLayerFocusVisual(drawIds, toId);
    return;
  }

  const fromIdx = drawIds.indexOf(fromId);
  const toIdx = drawIds.indexOf(toId);
  /* ドラム index 増（下スワイプ）: 現階↓アウト、次階↑からイン */
  let dir = toIdx - fromIdx;
  if (dir === 0) dir = 1;
  /* 端折り返し（例: outdoor→2f）は最短方向 */
  if (Math.abs(dir) > drawIds.length / 2) {
    dir = dir > 0 ? -1 : 1;
  }
  const sign = dir > 0 ? 1 : -1;
  const focusY = FOCUS_CENTER_Y;

  reelAnim.active = true;
  reelAnim.fromId = fromId;
  reelAnim.toId = toId;
  reelAnim.t = 0;
  reelAnim.fromStartY = fromLayer.position.y;
  reelAnim.fromEndY = focusY - sign * REEL_SLIDE;
  reelAnim.toStartY = focusY + sign * REEL_SLIDE;
  reelAnim.toEndY = focusY;

  fromLayer.visible = true;
  toLayer.visible = true;
  syncLayerDomVisibility(fromLayer, true);
  syncLayerDomVisibility(toLayer, true);
  toLayer.position.y = reelAnim.toStartY;

  /* それ以外の階は完全非表示 */
  for (const fid of drawIds) {
    if (fid === fromId || fid === toId) continue;
    const other = findLayerGroup(fid);
    if (!other) continue;
    other.visible = false;
    syncLayerDomVisibility(other, false);
  }
  if (groundGrid) groundGrid.visible = false;
}

function easeReel(t) {
  /* cubic-bezier 近似（カチッとスナップ） */
  const u = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - u, 3);
}

function tickReel(dt) {
  if (!reelAnim.active || !buildingGroup) return;
  reelAnim.t += dt / REEL_DURATION;
  const k = easeReel(reelAnim.t);
  const fromLayer = findLayerGroup(reelAnim.fromId);
  const toLayer = findLayerGroup(reelAnim.toId);
  if (fromLayer) {
    fromLayer.position.y =
      reelAnim.fromStartY +
      (reelAnim.fromEndY - reelAnim.fromStartY) * k;
  }
  if (toLayer) {
    toLayer.position.y =
      reelAnim.toStartY + (reelAnim.toEndY - reelAnim.toStartY) * k;
  }
  if (reelAnim.t < 1) return;

  /* スナップ完了: 選択階のみ残す */
  reelAnim.active = false;
  if (fromLayer) {
    fromLayer.visible = false;
    fromLayer.position.y = FOCUS_CENTER_Y;
    syncLayerDomVisibility(fromLayer, false);
  }
  if (toLayer) {
    toLayer.visible = true;
    toLayer.position.y = FOCUS_CENTER_Y;
    syncLayerDomVisibility(toLayer, true);
  }
  if (groundGrid) {
    groundGrid.visible = reelAnim.toId === "outdoor";
  }
  reelAnim.fromId = "";
  reelAnim.toId = "";
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
  controls.minDistance = CAM_ZOOM_MIN;
  controls.maxDistance = CAM_ZOOM_MAX;
  if (boot) {
    const k = Math.SQRT1_2;
    camera.position.set(horiz * k, camY, horiz * k);
    controls.target.set(0, desiredTargetY, 0);
    cameraBootstrapped = true;
    focusAnim.active = false;
    saveCameraHome();
  } else {
    focusAnim.targetY = desiredTargetY;
    focusAnim.camBaseY = camY;
    focusAnim.active = true;
  }
  controls.update();
}

function saveCameraHome() {
  if (!camera || !controls) return;
  cameraHome.pos.copy(camera.position);
  cameraHome.target.copy(controls.target);
  cameraHome.saved = true;
}

/** ダブルタップで初期倍率・位置へリセット */
function resetCameraHome() {
  if (!camera || !controls || !cameraHome.saved) return;
  focusAnim.active = false;
  camera.position.copy(cameraHome.pos);
  controls.target.copy(cameraHome.target);
  controls.minDistance = CAM_ZOOM_MIN;
  controls.maxDistance = CAM_ZOOM_MAX;
  controls.update();
}

function onCanvasPointerUp(ev) {
  if (maybeHandleDoubleTap(ev)) return;
  pickDevicePin(ev);
}

/** 2点間距離（ピンチ基準） */
function pinchTouchDistance(t0, t1) {
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

/** カメラ距離を min/max 内へ適用 */
function applyCameraDollyDistance(dist) {
  if (!camera || !controls) return;
  const next = Math.min(
    CAM_ZOOM_MAX,
    Math.max(CAM_ZOOM_MIN, dist)
  );
  const dir = new THREE.Vector3()
    .subVectors(camera.position, controls.target)
    .normalize();
  if (dir.lengthSq() < 1e-8) return;
  camera.position
    .copy(controls.target)
    .addScaledVector(dir, next);
  controls.update();
}

/**
 * マウント上の2本指ピンチで距離ズーム
 * OrbitControls より capture で先に処理
 */
function bindPinchZoom(el) {
  if (!el || el.__tislyPinchZoomBound) return;
  el.__tislyPinchZoomBound = true;

  el.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 2 || !camera || !controls) return;
      pinchZoom.active = true;
      pinchZoom.startDist = pinchTouchDistance(
        e.touches[0],
        e.touches[1]
      );
      pinchZoom.startCamDist = camera.position.distanceTo(
        controls.target
      );
    },
    { passive: true }
  );

  el.addEventListener(
    "touchmove",
    (e) => {
      if (!pinchZoom.active || e.touches.length !== 2) return;
      if (!camera || !controls) return;
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      const d = pinchTouchDistance(e.touches[0], e.touches[1]);
      if (pinchZoom.startDist < 10) return;
      /* ピンチアウト=接近（拡大） */
      const ratio = pinchZoom.startDist / Math.max(10, d);
      applyCameraDollyDistance(pinchZoom.startCamDist * ratio);
    },
    { passive: false, capture: true }
  );

  const endPinch = (e) => {
    if (!e.touches || e.touches.length < 2) {
      pinchZoom.active = false;
    }
  };
  el.addEventListener("touchend", endPinch, { passive: true });
  el.addEventListener("touchcancel", endPinch, { passive: true });
}

function maybeHandleDoubleTap(ev) {
  if (ev.pointerType === "mouse" && ev.button !== 0) return false;
  const now = performance.now();
  const dx = ev.clientX - lastTapX;
  const dy = ev.clientY - lastTapY;
  const near =
    dx * dx + dy * dy <= DOUBLE_TAP_MAX_PX * DOUBLE_TAP_MAX_PX;
  if (near && now - lastTapAt <= DOUBLE_TAP_MS) {
    resetCameraHome();
    lastTapAt = 0;
    return true;
  }
  lastTapAt = now;
  lastTapX = ev.clientX;
  lastTapY = ev.clientY;
  return false;
}

function pickDevicePin(ev) {
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

function makeCyberGridTexture() {
  /* ソフトなスラブ下地（強グリッド廃止） */
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "#F8FAFC");
  g.addColorStop(1, "#F1F5F9");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
  ctx.lineWidth = 1;
  const step = 64;
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
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 1.4);
  tex.anisotropy = 4;
  return tex;
}

/**
 * 床面テクスチャ（ヘリンボーン・タイル・畳・芝）
 * @param {"wood"|"herringbone"|"tile"|"tatami"|"grass"} pattern
 * @param {number} baseHex
 */
function makeFloorTexture(pattern, baseHex) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const hex = `#${baseHex.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  if (pattern === "herringbone") {
    /* リビング向けヘリンボーン調 */
    const step = 22;
    for (let y = -step; y < 256 + step; y += step) {
      for (let x = -step; x < 256 + step; x += step) {
        const odd = ((x / step) | 0) % 2 === 0;
        ctx.strokeStyle = odd
          ? "rgba(15, 23, 42, 0.16)"
          : "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (odd) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + step, y + step);
        } else {
          ctx.moveTo(x + step, y);
          ctx.lineTo(x, y + step);
        }
        ctx.stroke();
      }
    }
  } else if (pattern === "wood") {
    ctx.strokeStyle = "rgba(15, 23, 42, 0.1)";
    ctx.lineWidth = 1.2;
    for (let y = 8; y < 256; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y + (y % 36 === 8 ? 2 : 0));
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    for (let x = 0; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  } else if (pattern === "tile") {
    ctx.strokeStyle = "rgba(15, 23, 42, 0.14)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 256; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  } else if (pattern === "tatami") {
    ctx.strokeStyle = "rgba(60, 80, 40, 0.18)";
    ctx.lineWidth = 1;
    for (let y = 0; y < 256; y += 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.strokeRect(8, 8, 240, 240);
  } else {
    ctx.fillStyle = "rgba(34, 120, 60, 0.1)";
    for (let i = 0; i < 120; i++) {
      const x = (i * 47) % 256;
      const y = (i * 91) % 256;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 2.4);
  tex.anisotropy = 4;
  return tex;
}

/**
 * 部屋ラベルから床色を決定
 * お掃除ロボ風のツートン塗り分け
 */
function roomStyleFromLabel(label, floorId) {
  const t = String(label || "");
  if (floorId === "outdoor" || /駐車|庭|外周|敷地/.test(t)) {
    return { fill: 0xa8c49a, pattern: "grass", icon: "🌳" };
  }
  if (/リビング|居間|ダイニング/.test(t)) {
    return { fill: 0x4f5e38, pattern: "herringbone", icon: "🛋️" };
  }
  if (/和/.test(t)) {
    return { fill: 0xa8b56e, pattern: "tatami", icon: "🪷" };
  }
  if (/風呂|バス|浴室/.test(t)) {
    return { fill: 0x9ec0d4, pattern: "tile", icon: "🛁" };
  }
  if (/トイレ|WC|洗面/.test(t)) {
    return { fill: 0xb0cfe0, pattern: "tile", icon: "🚽" };
  }
  if (/台所|キッチン|勝手/.test(t)) {
    return { fill: 0xc4b29a, pattern: "tile", icon: "🔥" };
  }
  if (/洋|寝室/.test(t)) {
    return { fill: 0x6e5d4f, pattern: "wood", icon: "🛏️" };
  }
  if (/廊下|ホール|土間|押入/.test(t)) {
    return { fill: 0x8b929c, pattern: "wood", icon: "🚪" };
  }
  return {
    fill: floorId === "outdoor" ? ROOM_FILL_OUTDOOR : ROOM_FILL,
    pattern: "wood",
    icon: "🏠",
  };
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
      controls?.dispose?.();
    } catch {
      /* ignore */
    }
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

  const w = mountEl.clientWidth || 280;
  const h = mountEl.clientHeight || 280;

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

  /* マウント全体で回転・ホイール・ピンチを受付 */
  controls = new OrbitControls(camera, mountEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2.0, 0);
  /* 仰角 45–55° 帯にロック（水平潰れ防止） */
  controls.minPolarAngle = Math.PI / 2 - (CAM_ELEV_MAX * Math.PI) / 180;
  controls.maxPolarAngle = Math.PI / 2 - (CAM_ELEV_MIN * Math.PI) / 180;
  controls.minDistance = CAM_ZOOM_MIN;
  controls.maxDistance = CAM_ZOOM_MAX;
  /* 1本指=回転 · ホイール=ズーム
   * 2本指ピンチは bindPinchZoom が担当 */
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 1.25;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY,
  };
  bindPinchZoom(mountEl);
  cameraBootstrapped = false;
  cameraHome.saved = false;
  lastTapAt = 0;

  /* ソフトスタジオ照明（家電アプリ風の落ち影） */
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(12, 28, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.radius = 3.5;
  key.shadow.bias = -0.00015;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8c4d4, 0.42);
  fill.position.set(-14, 12, -10);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xf1f5f9, 0.32);
  rim.position.set(2, 10, -16);
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
  groundGrid = grid;
  scene.add(grid);

  buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  if (!window.__TISLY_SF_ISO3D_RESIZE) {
    window.__TISLY_SF_ISO3D_RESIZE = true;
    window.addEventListener("resize", onResize);
  }
  if (typeof ResizeObserver !== "undefined" && !mountEl.__tislySfRo) {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(mountEl);
    mountEl.__tislySfRo = ro;
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
  const w = Math.max(1, mountEl.clientWidth || 280);
  const h = Math.max(1, mountEl.clientHeight || 280);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
}

function animate() {
  animId = requestAnimationFrame(animate);
  const dt = clock.getDelta();

  /* ドラムリール切替 */
  tickReel(dt);

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

function roomMaterials(alerting, floorId, label = "") {
  const isOutdoor = floorId === "outdoor";
  const style = roomStyleFromLabel(label, floorId);
  const tier = alerting
    ? isOutdoor || state.alertTier === "perimeter"
      ? "perimeter"
      : "critical"
    : "none";

  if (tier === "critical") {
    return {
      tier,
      style,
      mat: new THREE.MeshStandardMaterial({
        color: 0xfef2f2,
        emissive: 0xef4444,
        emissiveIntensity: 0.28,
        metalness: 0.06,
        roughness: 0.62,
        transparent: false,
        opacity: SOLID_OPACITY,
      }),
      edge: 0xef4444,
    };
  }
  if (tier === "perimeter") {
    return {
      tier,
      style,
      mat: new THREE.MeshStandardMaterial({
        color: 0xfff7ed,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.22,
        metalness: 0.05,
        roughness: 0.64,
        transparent: false,
        opacity: SOLID_OPACITY,
      }),
      edge: 0xf97316,
    };
  }
  return {
    tier: "none",
    style,
    mat: new THREE.MeshStandardMaterial({
      map: makeFloorTexture(style.pattern, style.fill),
      color: 0xffffff,
      metalness: 0.03,
      roughness: 0.86,
      transparent: false,
      opacity: SOLID_OPACITY,
    }),
    edge: EDGE_SLATE,
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
    if (baseMat.map) m.map = baseMat.map;
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

/** 白いウォールリブ用（天面白・側面ソフト陰影） */
function shadeWallMaterials() {
  const top = new THREE.MeshStandardMaterial({
    color: WALL_TOP,
    metalness: 0.02,
    roughness: 0.48,
    transparent: false,
    opacity: SOLID_OPACITY,
  });
  const side = new THREE.MeshStandardMaterial({
    color: WALL_SIDE,
    metalness: 0.04,
    roughness: 0.72,
    transparent: false,
    opacity: SOLID_OPACITY,
  });
  const bottom = side.clone();
  bottom.color = new THREE.Color(0xd8dee8);
  return [side, side.clone(), top, bottom, side.clone(), side.clone()];
}

/**
 * 部屋四辺に白い立体壁（ウォールリブ）を追加
 */
function addRoomWallRibs(layer, cx, cz, ww, dd, floorY, ribH) {
  const t = WALL_THICK;
  const halfW = ww / 2;
  const halfD = dd / 2;
  const y = floorY + ribH / 2;
  const segs = [
    { x: cx, z: cz - halfD, w: ww + t, d: t },
    { x: cx, z: cz + halfD, w: ww + t, d: t },
    { x: cx - halfW, z: cz, w: t, d: dd + t },
    { x: cx + halfW, z: cz, w: t, d: dd + t },
  ];
  for (const s of segs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(s.w, ribH, s.d),
      shadeWallMaterials()
    );
    mesh.position.set(s.x, y, s.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: "wallRib" };
    layer.add(mesh);
  }
}

/**
 * 部屋ブロック＋外壁フレーム（ウォールリブ）を1フロア分追加
 */
function addFloorLayer(floorId, yBase, wallH, isFocus) {
  const layer = new THREE.Group();
  layer.position.y = yBase;
  layer.userData = { floorId, kind: "floorLayer" };
  layer.visible = !!isFocus;

  const slabSize = floorId === "outdoor" ? 24 : 21.5;
  const slabMat = new THREE.MeshStandardMaterial({
    map: makeCyberGridTexture(),
    color: SLAB_TINT,
    metalness: 0.05,
    roughness: 0.9,
    emissive: 0xffffff,
    emissiveIntensity: 0.02,
    transparent: false,
    opacity: SOLID_OPACITY,
  });
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(slabSize, 0.16, slabSize),
    slabMat
  );
  slab.position.y = 0.08;
  slab.receiveShadow = true;
  slab.castShadow = true;
  slab.userData = { kind: "slab", floorId, baseOpacity: SOLID_OPACITY };
  layer.add(slab);

  /* スラブ外周のソフトアウトライン */
  const slabEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(slabSize, 0.16, slabSize)),
    new THREE.LineBasicMaterial({
      color: EDGE_SLATE,
      transparent: true,
      opacity: 0.45,
    })
  );
  slabEdge.position.y = 0.08;
  layer.add(slabEdge);

  /* 外壁フレーム（全体輪郭の薄いガイド） */
  const shellGeo = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(slabSize + 0.12, wallH * 0.38, slabSize + 0.12)
  );
  const shellColor =
    state.alertTier === "critical" && isFocus
      ? 0xef4444
      : state.alertTier === "perimeter" && floorId === "outdoor"
        ? 0xf59e0b
        : EDGE_ASH;
  const shell = new THREE.LineSegments(
    shellGeo,
    new THREE.LineBasicMaterial({
      color: shellColor,
      transparent: true,
      opacity: 0.35,
    })
  );
  shell.position.y = wallH * 0.18;
  layer.add(shell);
  floorShells.push(shell);

  /* DI1：外周パルスグローリング */
  if (floorId === "outdoor" && state.alertTier !== "none") {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf97316,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.45,
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
  const floorY = 0.16;
  /* 白い立体壁を十分高く · 床色を際立たせる */
  const ribH = Math.max(wallH * 0.48, 1.15);

  for (const r of rooms) {
    if (!state.showZones) continue;
    const alerting = !!r.alertVisible;
    const ww = Math.max(r.w * 0.2, 0.5);
    const dd = Math.max(r.h * 0.2, 0.5);
    const cx = pctToWorldV1(r.x + r.w / 2);
    const cz = pctToWorldV1(r.y + r.h / 2);
    const { mat, edge: edgeColor, tier, style } = roomMaterials(
      alerting,
      floorId,
      r.label
    );
    mat.userData = { alerting };
    const mats = shadeRoomMaterials(mat);
    /* 床面のみ薄く · 壁は別リブで押し出し */
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(ww * 0.97, 0.08, dd * 0.97),
      mats
    );
    mesh.position.set(cx, floorY + 0.04, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      roomId: r.id,
      kind: "room",
      alerting,
      floorId,
      baseOpacity: SOLID_OPACITY,
    };
    layer.add(mesh);

    addRoomWallRibs(layer, cx, cz, ww, dd, floorY, ribH);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: tier === "none" ? EDGE_SLATE : edgeColor,
        transparent: true,
        opacity: 0.28,
      })
    );
    edge.position.copy(mesh.position);
    layer.add(edge);
    roomMeshes.set(`${floorId}:${r.id}`, { mesh, mat, mats, edge, tier });

    if (alerting && !firstAlertRoom) firstAlertRoom = { r, mesh };

    if (state.showLabels && r.label) {
      /* 白カプセル・低め配置で床を隠さない */
      const labelEl = document.createElement("div");
      labelEl.className =
        "sf-iso3d-room-label" + (alerting ? " is-alert" : "");
      const ico = document.createElement("span");
      ico.className = "sf-iso3d-room-ico";
      ico.setAttribute("aria-hidden", "true");
      ico.textContent = style?.icon || "🏠";
      const txt = document.createElement("span");
      txt.className = "sf-iso3d-room-txt";
      txt.textContent = r.label;
      labelEl.append(ico, txt);
      if (!isFocus) {
        labelEl.style.display = "none";
        labelEl.style.visibility = "hidden";
      }
      const labelObj = new CSS2DObject(labelEl);
      labelObj.position.set(cx, floorY + 0.26, cz);
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
    if (!isFocus) {
      tip.style.display = "none";
      tip.style.visibility = "hidden";
    }
    const tipObj = new CSS2DObject(tip);
    tipObj.position.set(
      firstAlertRoom.mesh.position.x,
      firstAlertRoom.mesh.position.y + ribH * 0.9,
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
      firstAlertRoom.mesh.position.y + ribH * 0.7,
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
      scale: 0.82,
      vivid: true,
      capsule: true,
    });
    const pos = pinWorldFromSensor(s, wallH);
    pin.position.set(pos.x, Math.max(pos.y, floorY + 0.28), pos.z);
    layer.add(pin);
    sensorPins.set(s.id, pin);
  }

  syncLayerDomVisibility(layer, !!isFocus);
  buildingGroup.add(layer);
}

function rebuild() {
  if (!ensureScene() || !buildingGroup) return;
  /* 再描画前に既存 CSS2D／ピン／メッシュを必ず全クリア */
  reelAnim.active = false;
  reelAnim.fromId = "";
  reelAnim.toId = "";
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
    addFloorLayer(fid, positions[fid] ?? FOCUS_CENTER_Y, wallH, fid === focusId);
  });
  applyAllLayerFocusVisual(drawIds, focusId);

  const elevDeg = opts.cameraElevationDeg;

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
    spotLight.target.position.set(0, focusY, 0);
  }
  if (alertPoint) {
    alertPoint.position.set(0, focusY + 3.5, 0);
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
    outdoor: "外周",
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
  if (prev === floorId) {
    syncHud(floorId);
    syncOrbitDataFocus(floorId);
    syncFloorTabs(floorId);
    return;
  }
  state.floorId = floorId;
  const expand = Math.min(1, Math.max(0, state.stackExpand));
  const drawIds = drawFloorIds(floorId, expand);
  const existing = new Set(
    (buildingGroup?.children || [])
      .map((c) => c.userData?.floorId)
      .filter(Boolean)
  );
  const hasLayers =
    buildingGroup?.children.length &&
    drawIds.every((id) => existing.has(id));

  if (hasLayers) {
    const opts = renderOpts();
    const wallH = opts.wallHeight;
    const { positions, focusY } = computeLayerLayout(
      drawIds,
      floorId,
      wallH,
      expand
    );
    /* リール中は layerAnim と干渉しない */
    layerAnim.active = false;
    layerAnim.targets.clear();
    startReelTransition(prev, floorId, drawIds);
    configureCameraForFocus(
      positions,
      focusY,
      wallH,
      expand,
      opts.cameraElevationDeg,
      false
    );
    if (spotLight) spotLight.target.position.set(0, focusY, 0);
    if (alertPoint) alertPoint.position.set(0, focusY + 3.5, 0);
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
  /* パンは常時オフ · ズームは常時オン */
  controls.enablePan = false;
  controls.enableZoom = true;
}

export function resetSecurityIso3dCamera() {
  resetCameraHome();
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
  resetCamera: resetSecurityIso3dCamera,
  applyFloorplan: applyFloorplanConfigToIso3d,
  mount: mountSecurityIso3d,
  rebuild,
};
