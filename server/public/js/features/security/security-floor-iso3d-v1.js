/**
 * TiSLY Security — プレミアム・サイバーダーク 3D
 * アイソメトリック俯瞰 · 階層スタック · DI発報発光
 * 外壁フレーム＋エッジグローで立体感を出す
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

/** 階層スタックの基準ギャップ（展開時） */
const STACK_GAP = 4.2;
const BG = 0x0b101b;
const GRID_CYAN = 0x1e3a5f;
const GRID_LINE = 0x243447;

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
  stackExpand: 0.72,
  alertRoomIds: new Set(),
  alertSensorIds: new Set(),
  alertTier: "none",
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

function renderOpts() {
  const r = state.floorplan?.render || {};
  return {
    wallHeight: r.wallHeight ?? 2.55,
    roomOpacity: r.roomOpacity ?? 0.88,
    cameraElevationDeg: r.cameraElevationDeg ?? 48,
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
  ctx.fillStyle = "#0d1524";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
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
  ctx.strokeStyle = "rgba(34, 211, 238, 0.35)";
  ctx.lineWidth = 1.5;
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
  scene.fog = new THREE.Fog(BG, 28, 72);
  scene.background = new THREE.Color(BG);

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  camera.position.set(18, 18, 18);
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
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 10;
  controls.maxDistance = 48;
  controls.enablePan = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  /* 青系アンビエント＋スポットで立体感 */
  scene.add(new THREE.AmbientLight(0x1e3a8a, 0.55));
  scene.add(new THREE.HemisphereLight(0x38bdf8, 0x0b101b, 0.42));
  const key = new THREE.DirectionalLight(0x93c5fd, 0.85);
  key.position.set(12, 22, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x0ea5e9, 0.35);
  fill.position.set(-14, 12, -10);
  scene.add(fill);

  spotLight = new THREE.SpotLight(0x38bdf8, 1.1, 55, Math.PI / 5, 0.45, 1);
  spotLight.position.set(6, 24, 8);
  spotLight.target.position.set(0, 0, 0);
  scene.add(spotLight);
  scene.add(spotLight.target);

  alertPoint = new THREE.PointLight(0xef4444, 0, 18, 2);
  alertPoint.position.set(0, 4, 0);
  scene.add(alertPoint);

  const grid = new THREE.GridHelper(28, 28, GRID_CYAN, GRID_LINE);
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
  if (controls) controls.update();
  alertPulse = (alertPulse + dt * 2.6) % (Math.PI * 2);
  const pulse = 0.55 + Math.sin(alertPulse) * 0.45;

  for (const [, entry] of roomMeshes) {
    if (!entry.mat.userData?.alerting) continue;
    const tier = entry.tier || "critical";
    if (tier === "perimeter") {
      entry.mat.emissiveIntensity = 0.45 + pulse * 0.95;
      if (entry.edge?.material) {
        entry.edge.material.opacity = 0.55 + pulse * 0.45;
      }
    } else {
      entry.mat.emissiveIntensity = 0.55 + pulse * 1.15;
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
        color: 0x7f1d1d,
        emissive: 0xff0040,
        emissiveIntensity: 0.85,
        metalness: 0.35,
        roughness: 0.28,
        transparent: true,
        opacity: 0.92,
      }),
      edge: 0xff1a1a,
    };
  }
  if (tier === "perimeter") {
    return {
      tier,
      mat: new THREE.MeshStandardMaterial({
        color: 0x78350f,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.7,
        metalness: 0.28,
        roughness: 0.32,
        transparent: true,
        opacity: 0.9,
      }),
      edge: 0xfb923c,
    };
  }
  return {
    tier: "none",
    mat: new THREE.MeshStandardMaterial({
      color: isOutdoor ? 0x0f2744 : 0x152238,
      emissive: isOutdoor ? 0x0ea5e9 : 0x1d4ed8,
      emissiveIntensity: isOutdoor ? 0.22 : 0.14,
      metalness: 0.42,
      roughness: 0.38,
      transparent: true,
      opacity: Math.min(Math.max(renderOpts().roomOpacity, 0.72), 0.94),
    }),
    edge: isOutdoor ? 0x38bdf8 : 0x60a5fa,
  };
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
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.42,
    emissive: floorId === "outdoor" ? 0x0ea5e9 : 0x1e3a8a,
    emissiveIntensity: isFocus ? 0.18 : 0.08,
  });
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(slabSize, 0.18, slabSize),
    slabMat
  );
  slab.position.y = 0.09;
  slab.receiveShadow = true;
  slab.castShadow = true;
  slab.userData = { kind: "slab", floorId };
  layer.add(slab);

  /* フロア外枠ワイヤー（発光エッジ） */
  const shellGeo = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(slabSize + 0.15, wallH * 0.62, slabSize + 0.15)
  );
  const shellColor =
    state.alertTier === "critical" && isFocus
      ? 0xff1744
      : state.alertTier === "perimeter" && floorId === "outdoor"
        ? 0xf59e0b
        : 0x38bdf8;
  const shell = new THREE.LineSegments(
    shellGeo,
    new THREE.LineBasicMaterial({
      color: shellColor,
      transparent: true,
      opacity: isFocus ? 0.85 : 0.35,
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(ww, wallH * 0.58, dd),
      mat
    );
    mesh.position.set(
      pctToWorldV1(r.x + r.w / 2),
      wallH * 0.29 + 0.18,
      pctToWorldV1(r.y + r.h / 2)
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { roomId: r.id, kind: "room", alerting, floorId };
    layer.add(mesh);

    /* 外壁フレーム風エッジ */
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: alerting ? 0.98 : 0.55,
        linewidth: 1,
      })
    );
    edge.position.copy(mesh.position);
    layer.add(edge);
    roomMeshes.set(`${floorId}:${r.id}`, { mesh, mat, edge, tier });

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
      scale: 1.05,
    });
    const pos = pinWorldFromSensor(s, wallH);
    pin.position.set(pos.x, pos.y, pos.z);
    layer.add(pin);
    sensorPins.set(s.id, pin);
  }

  if (!isFocus) {
    layer.traverse((o) => {
      if (o.material && o.material.opacity != null && !o.userData?.alerting) {
        o.material.transparent = true;
        o.material.opacity = Math.min(o.material.opacity, 0.42);
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

  let floorIds = orderedFloorIds().filter(
    (id) => floorHasContent(id) || id === focusId
  );
  if (!floorIds.length) floorIds = [focusId];

  /* 展開=0 ならフォーカス階のみ、展開時は全階スタック */
  const drawIds =
    expand < 0.08
      ? [focusId]
      : floorIds;

  drawIds.forEach((fid, i) => {
    const yBase = i * STACK_GAP * expand;
    addFloorLayer(fid, yBase, wallH, fid === focusId);
  });

  const elev = (opts.cameraElevationDeg * Math.PI) / 180;
  const dist = 18 + expand * 6;
  const midY = ((drawIds.length - 1) * STACK_GAP * expand) / 2;
  if (camera && controls) {
    camera.position.set(
      dist * Math.cos(elev) * 0.95,
      dist * Math.sin(elev) + midY * 0.35,
      dist * Math.cos(elev) * 0.95
    );
    controls.target.set(0, midY + 0.9, 0);
    controls.update();
  }
  if (spotLight) {
    spotLight.target.position.set(0, midY, 0);
  }
  if (alertPoint) {
    alertPoint.position.set(0, midY + 3.5, 0);
  }

  syncHud(focusId);
  syncOrbitDataFocus(focusId);
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
    badge.textContent = "⚠️ DI1 外周センサー検知";
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
  state.floorId = floorId;
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
  applyFloorplan: applyFloorplanConfigToIso3d,
  mount: mountSecurityIso3d,
  rebuild,
};
