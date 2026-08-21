/**
 * TiSLY Security — ビルダー連携 3D アイソメトリック俯瞰
 * Three.js 部屋ブロック＋3Dネオンピン（CSS2Dピン廃止）＋発報発光
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
 *  alertRoomIds: Set<string>,
 *  alertSensorIds: Set<string>,
 * }} */
const state = {
  site: null,
  floorId: "1f",
  floorplan: null,
  showCameras: true,
  showSensors: true,
  showZones: true,
  showLabels: true,
  alertRoomIds: new Set(),
  alertSensorIds: new Set(),
};

/** @type {Map<string, { mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, edge: THREE.LineSegments }>} */
const roomMeshes = new Map();
/** @type {Map<string, THREE.Group>} */
const sensorPins = new Map();

function disposeObject(obj) {
  obj.traverse((o) => {
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

function clearGroup(group) {
  if (!group) return;
  while (group.children.length) {
    const c = group.children.pop();
    disposeObject(c);
    group.remove(c);
  }
  roomMeshes.clear();
  sensorPins.clear();
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
    wallHeight: r.wallHeight ?? 2.7,
    roomOpacity: r.roomOpacity ?? 0.52,
    cameraElevationDeg: r.cameraElevationDeg ?? 45,
  };
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
    roomMeshes.clear();
    sensorPins.clear();
  }

  const w = mountEl.clientWidth || 360;
  const h = mountEl.clientHeight || 360;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf1f5f9, 32, 78);
  scene.background = new THREE.Color(0xf8fafc);

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  camera.position.set(16, 16, 16);
  camera.lookAt(0, 0.8, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0xf8fafc, 1);
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
  controls.target.set(0, 0.9, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 9;
  controls.maxDistance = 42;
  controls.enablePan = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  scene.add(new THREE.AmbientLight(0xffffff, 0.88));
  const key = new THREE.DirectionalLight(0xffffff, 0.78);
  key.position.set(10, 18, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbae6fd, 0.42);
  fill.position.set(-12, 10, -8);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe0f2fe, 0.35);
  rim.position.set(0, 14, -16);
  scene.add(rim);

  const grid = new THREE.GridHelper(24, 24, 0x93c5fd, 0xe2e8f0);
  grid.position.y = 0;
  scene.add(grid);

  buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  if (!window.__TISLY_SF_ISO3D_RESIZE) {
    window.__TISLY_SF_ISO3D_RESIZE = true;
    window.addEventListener("resize", onResize);
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
  alertPulse = (alertPulse + dt * 2.4) % (Math.PI * 2);
  const pulse = 0.55 + Math.sin(alertPulse) * 0.45;
  for (const [, entry] of roomMeshes) {
    if (!entry.mat.userData?.alerting) continue;
    entry.mat.emissiveIntensity = 0.35 + pulse * 0.85;
    entry.mat.opacity = 0.45 + pulse * 0.35;
    if (entry.edge?.material) {
      entry.edge.material.opacity = 0.55 + pulse * 0.45;
    }
  }
  for (const [, pin] of sensorPins) {
    pulseNeonPinMesh3d(pin, pulse);
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
  if (labelRenderer && scene && camera) labelRenderer.render(scene, camera);
}

function makeFloorGradientTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#f1f5f9");
  g.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(148,163,184,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i++) {
    const p = (i / 16) * 256;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
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

function rebuild() {
  if (!ensureScene() || !buildingGroup) return;
  clearGroup(buildingGroup);

  const floorId = state.floorId || "1f";
  const opts = renderOpts();
  const wallH = opts.wallHeight;
  const opacity = Math.min(Math.max(opts.roomOpacity, 0.28), 0.82);
  const rooms = roomsForFloor(floorId);
  const sensors = sensorsForFloor(floorId);

  const slabMat = new THREE.MeshStandardMaterial({
    map: makeFloorGradientTexture(),
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.78,
    emissive: 0xe2e8f0,
    emissiveIntensity: 0.08,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.14, 22), slabMat);
  slab.position.y = 0.05;
  slab.userData = { kind: "slab" };
  buildingGroup.add(slab);

  for (const r of rooms) {
    if (!state.showZones) continue;
    const alerting = !!r.alertVisible;
    const ww = Math.max(r.w * 0.2, 0.45);
    const dd = Math.max(r.h * 0.2, 0.45);
    const mat = new THREE.MeshStandardMaterial({
      color: alerting ? 0xf87171 : 0xbfdbfe,
      emissive: alerting ? 0xef4444 : 0x0284c7,
      emissiveIntensity: alerting ? 0.7 : 0.07,
      transparent: true,
      opacity: alerting ? 0.72 : opacity,
      metalness: 0.12,
      roughness: alerting ? 0.28 : 0.48,
      depthWrite: false,
    });
    mat.userData = { alerting };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(ww, wallH * 0.58, dd),
      mat
    );
    mesh.position.set(
      pctToWorldV1(r.x + r.w / 2),
      wallH * 0.29 + 0.12,
      pctToWorldV1(r.y + r.h / 2)
    );
    mesh.userData = { roomId: r.id, kind: "room", alerting };
    buildingGroup.add(mesh);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: alerting ? 0xf87171 : 0x1e3a8a,
        transparent: true,
        opacity: alerting ? 0.95 : 0.55,
      })
    );
    edge.position.copy(mesh.position);
    buildingGroup.add(edge);
    roomMeshes.set(r.id, { mesh, mat, edge });

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
      buildingGroup.add(labelObj);
    }
  }

  /* 外壁フレーム（walls）は描画しない — 部屋ブロックのみ */
  /* HTML/CSS2D センサーピンは完全撤去 — 3Dメッシュのみ */

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
    buildingGroup.add(pin);
    sensorPins.set(s.id, pin);
  }

  const elev = (opts.cameraElevationDeg * Math.PI) / 180;
  const dist = 20;
  if (camera && controls) {
    camera.position.set(
      dist * Math.cos(elev) * 0.92,
      dist * Math.sin(elev),
      dist * Math.cos(elev) * 0.92
    );
    controls.target.set(0, 0.9, 0);
    controls.update();
  }

  syncHud(floorId);
  syncOrbitDataFocus(floorId);
}

function syncHud(floorId) {
  const hud = document.getElementById("sf-iso3d-floor-label");
  if (!hud) return;
  const labels = { "1f": "1F", "2f": "2F", outdoor: "外周・敷地" };
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
  applyFloorplan: applyFloorplanConfigToIso3d,
  mount: mountSecurityIso3d,
  rebuild,
};
