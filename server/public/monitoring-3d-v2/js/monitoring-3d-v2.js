/**
 * TiSLY Monitoring 3D Dashboard V3 — Three.js · LiDAR · Customer連動
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
// TODO: bundle Three.js + loaders locally instead of CDN importmap

const params = new URLSearchParams(location.search);
const siteId = params.get("siteId") || "DEMO-HOME-001";
const isTvMode = params.get("mode") === "tv";
const TV_ALERT_MS = 30000;

const $ = (sel) => document.querySelector(sel);

let sceneData = null;
let layerFilter = "all";
let mapAssetDisplayMode = "all_floors";
let sensorEditMode = false;
let autoOrbit = true;
let selectedSensorId = null;
let activeAlert = null;
let tvCountdownTimer = null;
let demoPlaying = false;
let activeRightTab = "status";
/** @type {Array<object>} */
let siteAttachmentRecords = [];
/** @type {object|null} */
let reportPhotoSlotsData = null;
/** @type {Map<string, THREE.Sprite>} */
const photoPinSprites = new Map();

/** @type {THREE.WebGLRenderer|null} */
let renderer = null;
/** @type {THREE.PerspectiveCamera|null} */
let camera = null;
/** @type {OrbitControls|null} */
let controls = null;
/** @type {THREE.Scene|null} */
let scene = null;

const layerGroups = {
  perimeter: new THREE.Group(),
  "1f": new THREE.Group(),
  "2f": new THREE.Group(),
};

/** @type {Map<string, THREE.Object3D[]>} */
const mapAssetMeshes = new Map();

/** @type {Map<string, THREE.Object3D>} */
const loadedMeshRoots = new Map();

/** @type {Map<string, { mesh: THREE.Mesh, sensor: object, ring?: THREE.Mesh, sprite?: THREE.Sprite }>} */
const sensorMeshes = new Map();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const defaultCameraPos = new THREE.Vector3(14, 12, 18);
const defaultTarget = new THREE.Vector3(0, 2, 0);

if (isTvMode) document.body.classList.add("mon3dv3-tv");

function apiGet(path) {
  return fetch(path).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
}

function formatTime(d = new Date()) {
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function tickClock() {
  const el = $("#mon3dv3-clock");
  if (el) el.textContent = formatTime();
}

function statusColor(status) {
  if (status === "alert") return 0xdc2626;
  if (status === "warning") return 0xfb923c;
  return 0x34d399;
}

function initThree(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050b18);
  scene.fog = new THREE.FogExp2(0x050b18, 0.035);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.copy(defaultCameraPos);

  controls = new OrbitControls(camera, canvas);
  controls.target.copy(defaultTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 6;
  controls.maxDistance = 40;

  const ambient = new THREE.AmbientLight(0x334155, 0.9);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0x22d3ee, 1.1);
  dir.position.set(10, 20, 8);
  dir.castShadow = true;
  scene.add(dir);

  const rim = new THREE.PointLight(0x2563eb, 0.6, 40);
  rim.position.set(-8, 6, -6);
  scene.add(rim);

  Object.values(layerGroups).forEach((g) => scene.add(g));

  const grid = new THREE.GridHelper(28, 28, 0x1e3a5f, 0x0f172a);
  grid.position.y = 0.01;
  layerGroups.perimeter.add(grid);

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("pointerdown", onPointerDown);
}

function resizeCanvas() {
  const wrap = $(".mon3dv3-viewport-wrap");
  const canvas = $("#mon3dv3-canvas");
  if (!wrap || !canvas || !renderer || !camera) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function buildFromMapAsset(mapAsset) {
  const sourceColors = {
    polycam: 0x22c55e,
    roomplan: 0xa855f7,
    scaniverse: 0x0ea5e9,
    manual: 0xfbbf24,
    mock: 0x64748b,
    procedural: 0x2563eb,
  };

  mapAsset.assets.forEach((asset) => {
    const group = layerGroups[asset.floorLevel];
    if (!group) return;

    if (asset.isRegistered) {
      buildRegisteredMapAssetPlaceholder(asset, group, sourceColors);
      return;
    }

    let geo;
    if (asset.type === "pointcloud") {
      const pts = new THREE.BufferGeometry();
      const positions = [];
      for (let i = 0; i < 120; i++) {
        positions.push(
          (Math.random() - 0.5) * asset.scale.x,
          Math.random() * asset.scale.y + asset.position.y,
          (Math.random() - 0.5) * asset.scale.z
        );
      }
      pts.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: 0x22d3ee, size: 0.08, transparent: true, opacity: 0.5 });
      const cloud = new THREE.Points(pts, mat);
      cloud.position.set(asset.position.x, asset.position.y, asset.position.z);
      cloud.userData.mapAssetId = asset.assetId;
      group.add(cloud);
      return;
    }

    if (asset.floorLevel === "perimeter" && asset.assetId === "perimeter-fence") {
      geo = new THREE.BoxGeometry(asset.scale.x, asset.scale.y, asset.scale.z);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1e3a5f,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(asset.position.x, asset.position.y, asset.position.z);
      group.add(mesh);
      return;
    }

    geo = new THREE.BoxGeometry(asset.scale.x, asset.scale.y, asset.scale.z);
    const opacity = asset.floorLevel === "2f" ? 0.55 : 0.72;
    const mat = new THREE.MeshStandardMaterial({
      color: asset.floorLevel === "1f" ? 0x2563eb : asset.floorLevel === "2f" ? 0x7c3aed : 0x0ea5e9,
      transparent: true,
      opacity,
      metalness: 0.2,
      roughness: 0.65,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(asset.position.x, asset.position.y, asset.position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.mapAssetId = asset.assetId;
    group.add(mesh);

    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35 })
    );
    line.position.copy(mesh.position);
    group.add(line);
  });
}

function buildRegisteredMapAssetPlaceholder(asset, group, sourceColors) {
  const color = sourceColors[asset.source] ?? sourceColors[asset.sourceType] ?? 0x22d3ee;
  const geo = new THREE.BoxGeometry(asset.scale.x, asset.scale.y, asset.scale.z);
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: asset.isPlaceholder ? 0.42 : 0.72,
    wireframe: Boolean(asset.isPlaceholder),
    metalness: 0.15,
    roughness: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(asset.position.x, asset.position.y, asset.position.z);
  if (asset.rotation) mesh.rotation.set(asset.rotation.x, asset.rotation.y, asset.rotation.z);
  mesh.userData.mapAssetId = asset.assetId;
  mesh.userData.isRegisteredScan = true;
  mesh.userData.isPlaceholderMesh = true;
  group.add(mesh);

  const objects = [mesh];

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 48;
  const ctx = labelCanvas.getContext("2d");
  ctx.fillStyle = "rgba(5,11,24,0.9)";
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 16px sans-serif";
  const label = asset.label || `${asset.sourceType || asset.source} scan`;
  ctx.fillText(label.slice(0, 28), 8, 30);
  const tex = new THREE.CanvasTexture(labelCanvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(4, 0.75, 1);
  sprite.position.set(asset.position.x, asset.position.y + asset.scale.y * 0.55 + 0.5, asset.position.z);
  sprite.userData.mapAssetId = asset.assetId;
  sprite.userData.isPlaceholderMesh = true;
  group.add(sprite);
  objects.push(sprite);

  mapAssetMeshes.set(asset.assetId, objects);
}

function hidePlaceholderForAsset(assetId) {
  const objects = mapAssetMeshes.get(assetId);
  if (!objects) return;
  objects.forEach((obj) => {
    obj.visible = false;
  });
}

function showPlaceholderForAsset(assetId) {
  const objects = mapAssetMeshes.get(assetId);
  if (!objects) return;
  objects.forEach((obj) => {
    obj.visible = true;
  });
}

function showMapAssetLoadStatus(message, isError = false) {
  const el = $("#mon3dv3-mapasset-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

function applyTransformToObject(obj, asset) {
  obj.position.set(asset.position.x, asset.position.y, asset.position.z);
  if (asset.rotation) {
    obj.rotation.set(
      THREE.MathUtils.degToRad(asset.rotation.x),
      THREE.MathUtils.degToRad(asset.rotation.y),
      THREE.MathUtils.degToRad(asset.rotation.z)
    );
  }
  obj.scale.set(asset.scale.x, asset.scale.y, asset.scale.z);
}

function applyOpacityToObject(obj, opacity = 1) {
  obj.traverse((child) => {
    if (child.isMesh || child.isPoints) {
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          m.transparent = opacity < 1;
          m.opacity = opacity;
        });
      }
    }
  });
}

function ensureObjMaterials(obj) {
  obj.traverse((child) => {
    if (child.isMesh && !child.material) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.1,
        roughness: 0.8,
      });
    }
  });
}

function clearLoadedMeshes() {
  loadedMeshRoots.forEach((root) => {
    root.parent?.remove(root);
  });
  loadedMeshRoots.clear();
}

function resolveAssetsToLoad(mapAsset, mode) {
  const registered = mapAsset.assets.filter((a) => a.isRegistered);
  if (mode === "active_only") {
    const activeId = mapAsset.activeAsset?.assetId;
    if (!activeId) return [];
    return registered.filter((a) => a.assetId === activeId);
  }
  if (mode === "all_floors") {
    return registered.filter((a) => a.visibleInDashboard !== false);
  }
  const floorMap = { perimeter_only: "perimeter", "1f_only": "1f", "2f_only": "2f" };
  const floor = floorMap[mode];
  if (floor) {
    return registered.filter((a) => a.floorLevel === floor && a.visibleInDashboard !== false);
  }
  return registered;
}

function onMeshLoaded(asset, root, group) {
  root.userData.mapAssetId = asset.assetId;
  root.userData.isLoadedMesh = true;
  applyTransformToObject(root, asset);
  applyOpacityToObject(root, asset.opacity ?? 1);
  group.add(root);
  loadedMeshRoots.set(asset.assetId, root);
  hidePlaceholderForAsset(asset.assetId);
  const ft = asset.fileType || "mesh";
  showMapAssetLoadStatus(`${asset.label || asset.assetId} — ${ft.toUpperCase()} mesh 表示中`);
}

function onMeshLoadFailed(asset, err) {
  console.warn("Mesh load failed", asset.assetId, err);
  showPlaceholderForAsset(asset.assetId);
  showMapAssetLoadStatus(
    `${asset.label || asset.assetId} — 読み込み失敗。placeholder を表示しています。`,
    true
  );
}

function loadGltfAsset(asset, group) {
  const loader = new GLTFLoader();
  loader.load(
    asset.fileUrl,
    (gltf) => onMeshLoaded(asset, gltf.scene, group),
    undefined,
    (err) => onMeshLoadFailed(asset, err)
  );
}

function loadObjAsset(asset, group) {
  const loader = new OBJLoader();
  loader.load(
    asset.fileUrl,
    (obj) => {
      ensureObjMaterials(obj);
      onMeshLoaded(asset, obj, group);
    },
    undefined,
    (err) => onMeshLoadFailed(asset, err)
  );
}

function loadPlyAsset(asset, group) {
  const loader = new PLYLoader();
  loader.load(
    asset.fileUrl,
    (geometry) => {
      let root;
      if (geometry.index) {
        root = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0x22d3ee, flatShading: true })
        );
      } else {
        root = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({ color: 0x22d3ee, size: 0.05 })
        );
      }
      onMeshLoaded(asset, root, group);
    },
    undefined,
    (err) => onMeshLoadFailed(asset, err)
  );
}

function loadSingleMapAsset(asset) {
  if (!asset.fileUrl) return;

  const ft = asset.fileType;
  if (ft === "usdz") {
    showMapAssetLoadStatus(`${asset.label || asset.title} — USDZはプレビュー準備中。GLB変換を推奨します。`);
    return;
  }

  if (ft !== "glb" && ft !== "gltf" && ft !== "obj" && ft !== "ply") {
    if (["json", "image", "unknown"].includes(ft)) return;
    showMapAssetLoadStatus(`${asset.label}（${ft}）— 未対応形式`, true);
    return;
  }

  const group = layerGroups[asset.floorLevel] || layerGroups["1f"];
  if (!group) return;

  showMapAssetLoadStatus(`${asset.label || asset.assetId} — 3D mesh 読み込み中…`);

  if (ft === "glb" || ft === "gltf") loadGltfAsset(asset, group);
  else if (ft === "obj") loadObjAsset(asset, group);
  else if (ft === "ply") loadPlyAsset(asset, group);
}

function loadMapAssets(mapAsset, mode = mapAssetDisplayMode) {
  clearLoadedMeshes();
  const toLoad = resolveAssetsToLoad(mapAsset, mode);
  if (!toLoad.length) {
    showMapAssetLoadStatus(mapAsset.integrationNote || "表示対象 mapAsset なし");
    return;
  }
  toLoad.forEach((asset) => {
    if (asset.isPlaceholder || !asset.fileUrl) {
      showPlaceholderForAsset(asset.assetId);
      return;
    }
    loadSingleMapAsset(asset);
  });
}

function setMapAssetDisplayMode(mode) {
  mapAssetDisplayMode = mode;
  $$("#mon3dv3-mapasset-mode-btns button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mapMode === mode);
  });
  if (sceneData?.mapAsset) loadMapAssets(sceneData.mapAsset, mode);
}

function createSensorMarker(sensor) {
  const group = layerGroups[sensor.floorLevel];
  if (!group) return;

  const geo = new THREE.SphereGeometry(0.28, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: statusColor(sensor.status),
    emissive: statusColor(sensor.status),
    emissiveIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(sensor.position.x, sensor.position.y, sensor.position.z);
  mesh.userData.sensorId = sensor.sensorId;

  const ringGeo = new THREE.RingGeometry(0.35, 0.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xdc2626,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(sensor.position.x, sensor.position.y + 0.05, sensor.position.z);
  ring.visible = false;
  group.add(ring);

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 128;
  labelCanvas.height = 32;
  const ctx = labelCanvas.getContext("2d");
  ctx.fillStyle = "rgba(5,11,24,0.85)";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(sensor.label, 8, 21);
  const tex = new THREE.CanvasTexture(labelCanvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.set(sensor.position.x, sensor.position.y + 0.9, sensor.position.z);
  group.add(sprite);

  group.add(mesh);
  sensorMeshes.set(sensor.sensorId, { mesh, sensor, ring, sprite });
}

const PHOTO_ATTACHMENT_TYPES = new Set([
  "survey_photo",
  "before_photo",
  "after_photo",
  "wiring_photo",
  "device_photo",
]);

function resolvePhotoPinColor(attachments) {
  const photos = attachments.filter((a) => PHOTO_ATTACHMENT_TYPES.has(a.type));
  if (!photos.length) return null;
  if (photos.some((a) => a.customerVisible)) return 0x2563eb;
  if (photos.some((a) => a.reportVisible)) return 0x34d399;
  return 0x64748b;
}

function createPhotoPinSprite(sensorId, colorHex) {
  const entry = sensorMeshes.get(sensorId);
  if (!entry) return;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `#${colorHex.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("📷", size / 2, size / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(0.55, 0.55, 1);
  sprite.position.set(entry.mesh.position.x, entry.mesh.position.y + 1.35, entry.mesh.position.z);
  sprite.userData.photoPinSensorId = sensorId;

  const group = layerGroups[entry.sensor.floorLevel];
  if (group) group.add(sprite);
  photoPinSprites.set(sensorId, sprite);
}

function buildPhotoPinsFromAttachments(records) {
  photoPinSprites.forEach((sprite) => sprite.parent?.remove(sprite));
  photoPinSprites.clear();

  records.forEach((record) => {
    const color = resolvePhotoPinColor(record.attachments ?? []);
    if (color != null) createPhotoPinSprite(record.deviceId, color);
  });
}

function switchRightTab(tabId, opts = {}) {
  activeRightTab = tabId;
  $$(".mon3dv3-tab").forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".mon3dv3-tab-panel").forEach((panel) => {
    const show = panel.dataset.panel === tabId;
    panel.classList.toggle("active", show);
    panel.hidden = !show;
  });
  if (tabId === "logs" && selectedSensorId && !opts.skipLogReload) {
    loadDeviceLogs(selectedSensorId);
  }
}

const ATTACHMENT_GROUP_LABELS = {
  survey_photo: "現調写真",
  before_photo: "施工前写真",
  after_photo: "施工後写真",
  wiring_photo: "配線写真",
  device_photo: "設備写真",
  spec_pdf: "仕様書 PDF",
  completion_report_pdf: "完了報告 PDF",
  estimate_pdf: "見積 PDF",
  invoice_pdf: "請求 PDF",
  manual_pdf: "取扱説明",
  customer_knowledge: "Customer 説明",
  site_drawing: "図面",
};

function isPdfAttachment(type) {
  return type.includes("_pdf") || type === "site_drawing";
}

function renderAttachmentsPanel(deviceAttachment, reportCandidates) {
  const listEl = $("#mon3dv3-attachments-list");
  const deviceEl = $("#mon3dv3-materials-device");
  if (!listEl) return;

  if (!deviceAttachment?.attachments?.length) {
    if (deviceEl) deviceEl.textContent = selectedSensorId ? "この設備の資料はまだ登録されていません" : "センサーを選択してください";
    listEl.innerHTML = `<p class="mon3dv3-muted">資料なし</p>`;
    return;
  }

  if (deviceEl) {
    deviceEl.textContent = `${deviceAttachment.deviceName} · ${deviceAttachment.areaName} · ${deviceAttachment.floorLevel}`;
  }

  const grouped = {};
  deviceAttachment.attachments.forEach((att) => {
    if (!grouped[att.type]) grouped[att.type] = [];
    grouped[att.type].push(att);
  });

  listEl.innerHTML = Object.entries(grouped)
    .map(([type, items]) => {
      const label = ATTACHMENT_GROUP_LABELS[type] || type;
      const cards = items
        .map((att) => {
          const thumb = isPdfAttachment(type)
            ? `<div class="mon3dv3-attachment-thumb is-pdf" aria-hidden="true">📄</div>`
            : `<img class="mon3dv3-attachment-thumb" src="${att.previewUrl || att.openUrl}" alt="" />`;
          const photoBtn = !isPdfAttachment(type)
            ? `<a class="mon3dv3-btn secondary" href="${att.openUrl}" target="_blank" rel="noopener">写真を見る</a>`
            : "";
          const pdfBtn = isPdfAttachment(type)
            ? `<a class="mon3dv3-btn secondary" href="${att.openUrl}" target="_blank" rel="noopener">PDFを見る</a>`
            : "";
          const customerBtn =
            type === "customer_knowledge"
              ? `<a class="mon3dv3-btn" href="${att.openUrl}" target="_blank" rel="noopener">Customer説明を見る</a>`
              : "";
          const reportBtn =
            att.reportVisible && PHOTO_ATTACHMENT_TYPES.has(type)
              ? `<button type="button" class="mon3dv3-btn" data-report-add="${att.attachmentId}">完了報告に使う</button>`
              : "";
          return `<div class="mon3dv3-attachment-card">${thumb}<div class="mon3dv3-attachment-meta"><strong>${att.safeLabel}</strong><div class="mon3dv3-attachment-actions">${photoBtn}${pdfBtn}${customerBtn}${reportBtn}</div></div></div>`;
        })
        .join("");
      return `<div class="mon3dv3-attachment-group"><h3>${label}</h3>${cards}</div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-report-add]").forEach((btn) => {
    btn.addEventListener("click", () => addReportPhotoSlot(selectedSensorId, btn.dataset.reportAdd));
  });

  const statusEl = $("#mon3dv3-report-slots-status");
  if (statusEl && reportCandidates?.length) {
    statusEl.textContent = `reportVisible 写真 ${reportCandidates.length} 件 — 最大6枚まで完了報告候補に追加可能`;
  }
}

function renderCustomerLinksPanel(links, ids) {
  const box = $("#mon3dv3-customer-links");
  if (!box || !sceneData) return;

  const ref = sceneData.customerRef;
  const linkItems = [];
  if (links?.customerExplanationUrl) {
    linkItems.push({ label: "お客様向け説明を見る", url: links.customerExplanationUrl });
  }
  if (links?.projectUrl) linkItems.push({ label: "案件ページで見る", url: links.projectUrl });
  if (links?.siteMapUrl) linkItems.push({ label: "Site Mapで見る", url: links.siteMapUrl });
  if (links?.relatedMaterialsUrl) linkItems.push({ label: "関連資料を見る", url: links.relatedMaterialsUrl });

  ids.forEach((id) => {
    const kind = id.startsWith("PLC-") ? "plc" : "card";
    linkItems.push({
      label: `Knowledge: ${id}`,
      url: `/knowledge-customer-detail-v1?id=${encodeURIComponent(id)}&kind=${kind}&ref=${encodeURIComponent(ref)}`,
    });
  });

  if (!linkItems.length) {
    box.innerHTML = `<p class="mon3dv3-muted">Customer リンクなし</p>`;
    return;
  }

  box.innerHTML = linkItems
    .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
    .join("");
}

async function loadReportPhotoSlots() {
  try {
    reportPhotoSlotsData = await apiGet(
      `/api/monitoring/v1/report-photo-slots?siteId=${encodeURIComponent(siteId)}`
    );
    renderReportPhotoSlotsList();
  } catch {
    reportPhotoSlotsData = { slots: [], maxSlots: 6 };
  }
}

function renderReportPhotoSlotsList() {
  const ul = $("#mon3dv3-report-slots-list");
  const status = $("#mon3dv3-report-slots-status");
  if (!ul) return;
  const slots = reportPhotoSlotsData?.slots ?? [];
  if (status) {
    status.textContent = `完了報告候補 ${slots.length} / ${reportPhotoSlotsData?.maxSlots ?? 6} 枚 — 1ページ2枚×3段`;
  }
  if (!slots.length) {
    ul.innerHTML = `<li class="mon3dv3-muted">まだ追加されていません</li>`;
    return;
  }
  ul.innerHTML = slots
    .map(
      (s) =>
        `<li><img src="${s.previewUrl}" alt="" /><span>${s.safeLabel}</span><span class="mon3dv3-muted">${s.deviceName}</span></li>`
    )
    .join("");
}

async function addReportPhotoSlot(deviceId, attachmentId) {
  const msg = $("#mon3dv3-report-slots-status");
  try {
    const res = await fetch("/api/monitoring/v1/report-photo-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, deviceId, attachmentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || String(res.status));
    reportPhotoSlotsData = data;
    renderReportPhotoSlotsList();
    if (msg) msg.textContent = `「${data.slot?.safeLabel}」を完了報告候補に追加しました`;
  } catch (err) {
    if (msg) msg.textContent = err.message || "追加失敗";
  }
}

async function loadDeviceLogs(sensorId) {
  const ul = $("#mon3dv3-device-logs");
  if (!ul) return;
  ul.innerHTML = `<li class="mon3dv3-muted">読み込み中…</li>`;
  try {
    const data = await apiGet(`/api/monitoring/v1/logs?siteId=${encodeURIComponent(siteId)}&limit=30`);
    const sensor = sceneData?.sensors.find((s) => s.sensorId === sensorId);
    const label = sensor?.label ?? sensorId;
    const filtered = (data.logs ?? []).filter(
      (log) =>
        log.deviceId === sensorId ||
        log.place?.includes(label) ||
        log.content?.includes(label)
    );
    const rows = filtered.length ? filtered.slice(0, 12) : (data.logs ?? []).slice(0, 8);
    ul.innerHTML = rows
      .map((log) => {
        const cls =
          log.level === "侵入警報" ? "level-alert" : log.level === "警報" ? "level-warning" : "";
        return `<li class="${cls}"><strong>${log.level}</strong> · ${log.place || log.content}<br /><span class="mon3dv3-muted">${log.timeLabel || log.createdAt || ""}</span></li>`;
      })
      .join("");
  } catch {
    ul.innerHTML = `<li class="mon3dv3-muted">ログ取得に失敗しました</li>`;
  }
}

function applyLayerFilter(filter) {
  layerFilter = filter;
  $$(".mon3dv3-layer-btns button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layer === filter);
  });

  Object.entries(layerGroups).forEach(([key, group]) => {
    if (filter === "all") {
      group.visible = true;
    } else {
      group.visible = key === filter;
    }
  });
}

function updateSensorStatuses(statusMap) {
  statusMap.forEach((status, sensorId) => {
    const entry = sensorMeshes.get(sensorId);
    if (!entry) return;
    entry.sensor.status = status;
    const color = statusColor(status);
    entry.mesh.material.color.setHex(color);
    entry.mesh.material.emissive.setHex(color);
    entry.mesh.material.emissiveIntensity = status === "alert" ? 0.9 : 0.35;

    const listItem = document.querySelector(`.mon3dv3-sensor-item[data-sensor-id="${sensorId}"]`);
    if (listItem) {
      listItem.className = `mon3dv3-sensor-item status-${status}${selectedSensorId === sensorId ? " is-selected" : ""}`;
    }
  });
}

function renderSensorList() {
  const ul = $("#mon3dv3-sensor-list");
  if (!ul || !sceneData) return;
  ul.innerHTML = sceneData.sensors
    .map(
      (s) => `<li class="mon3dv3-sensor-item status-${s.status}${selectedSensorId === s.sensorId ? " is-selected" : ""}" data-sensor-id="${s.sensorId}">
        <span><span class="mon3dv3-status-dot"></span>${s.label}</span>
        <span class="mon3dv3-muted">${s.floorLevel === "perimeter" ? "外周" : s.floorLevel.toUpperCase()}</span>
      </li>`
    )
    .join("");

  ul.querySelectorAll(".mon3dv3-sensor-item").forEach((li) => {
    li.addEventListener("click", () => selectSensor(li.dataset.sensorId));
  });
}

function flyToSensor(sensorId, duration = 1200) {
  const entry = sensorMeshes.get(sensorId);
  if (!entry || !camera || !controls) return;

  const target = entry.mesh.position.clone();
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(target.x + 5, target.y + 4, target.z + 6);
  const endTarget = target.clone();
  const t0 = performance.now();

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function animateFly() {
    const p = Math.min(1, (performance.now() - t0) / duration);
    const e = ease(p);
    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTarget, endTarget, e);
    controls.update();
    if (p < 1) requestAnimationFrame(animateFly);
  }
  animateFly();
}

function showRippleScreen(sensorId) {
  const entry = sensorMeshes.get(sensorId);
  const layer = $("#mon3dv3-ripple-layer");
  if (!entry || !layer || !camera || !renderer) return;

  const vec = entry.mesh.position.clone().project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((vec.x + 1) / 2) * rect.width;
  const y = ((-vec.y + 1) / 2) * rect.height;

  layer.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const div = document.createElement("div");
    div.className = "mon3dv3-ripple";
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    layer.appendChild(div);
  }
}

function setRingPulse(sensorId, on) {
  const entry = sensorMeshes.get(sensorId);
  if (!entry?.ring) return;
  entry.ring.visible = on;
  if (on) {
    entry.ring.material.opacity = 0.85;
    entry.ring.scale.set(1, 1, 1);
  }
}

function animateRings(time) {
  sensorMeshes.forEach(({ ring }) => {
    if (!ring?.visible) return;
    const s = 1 + Math.sin(time * 0.004) * 0.35;
    ring.scale.set(s, s, s);
    ring.material.opacity = 0.4 + Math.sin(time * 0.006) * 0.35;
  });
}

function showAlertCard(alert) {
  activeAlert = alert;
  const card = $("#mon3dv3-alert-card");
  const banner = $("#mon3dv3-alert-banner");
  if (!card) return;

  $("#mon3dv3-alert-level").textContent = alert.alertLevel === "alert" ? "侵入警報" : "警報";
  $("#mon3dv3-alert-headline").textContent = alert.headline;
  $("#mon3dv3-alert-content").textContent = alert.content;
  card.hidden = false;

  if (banner) {
    banner.hidden = false;
    $("#mon3dv3-banner-text").textContent = alert.headline;
    $("#mon3dv3-banner-time").textContent = formatTime();
  }

  showRippleScreen(alert.sensorId);
  setRingPulse(alert.sensorId, true);
  flyToSensor(alert.sensorId);
  selectSensor(alert.sensorId, { skipFly: true });

  const entry = sensorMeshes.get(alert.sensorId);
  if (entry) {
    entry.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.1);
  }

  if (isTvMode) startTvOverlay(alert);
}

function clearAlert() {
  activeAlert = null;
  $("#mon3dv3-alert-card").hidden = true;
  $("#mon3dv3-alert-banner").hidden = true;
  $("#mon3dv3-ripple-layer").innerHTML = "";
  sensorMeshes.forEach(({ ring, mesh }) => {
    if (ring) ring.visible = false;
    mesh.scale.setScalar(1);
  });
  updateSensorStatuses(new Map(sceneData.sensors.map((s) => [s.sensorId, "normal"])));
  stopTvOverlay();
  demoPlaying = false;
}

function startTvOverlay(alert) {
  const overlay = $("#mon3dv3-tv-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  $("#mon3dv3-tv-headline").textContent = alert.headline;
  $("#mon3dv3-tv-place").textContent = alert.content;

  let remaining = Math.ceil(TV_ALERT_MS / 1000);
  $("#mon3dv3-tv-countdown").textContent = String(remaining);

  if (tvCountdownTimer) clearInterval(tvCountdownTimer);
  tvCountdownTimer = setInterval(() => {
    remaining -= 1;
    $("#mon3dv3-tv-countdown").textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      stopTvOverlay();
      clearAlert();
    }
  }, 1000);

  setTimeout(() => {
    if (activeAlert?.sensorId === alert.sensorId) clearAlert();
  }, TV_ALERT_MS);
}

function stopTvOverlay() {
  const overlay = $("#mon3dv3-tv-overlay");
  if (overlay) overlay.hidden = true;
  if (tvCountdownTimer) {
    clearInterval(tvCountdownTimer);
    tvCountdownTimer = null;
  }
}

async function selectSensor(sensorId, opts = {}) {
  selectedSensorId = sensorId;
  renderSensorList();

  const entry = sensorMeshes.get(sensorId);
  if (entry && !opts.skipFly && !demoPlaying) flyToSensor(sensorId, 800);

  if (opts.openMaterialsTab) switchRightTab("materials", { skipLogReload: true });

  try {
    const data = await apiGet(
      `/api/monitoring/v1/3d-sensor/${encodeURIComponent(sensorId)}?siteId=${encodeURIComponent(siteId)}`
    );
    showCameraPanel(data.camera);
    renderCustomerLinksPanel(data.customerLinks || data.knowledgeLinks, data.relatedKnowledgeIds ?? []);
    renderAttachmentsPanel(data.deviceAttachment, data.reportPhotoCandidates ?? []);
  } catch {
    const sensor = sceneData?.sensors.find((s) => s.sensorId === sensorId);
    const cam = sceneData?.cameras.find((c) => c.cameraId === sensor?.cameraId);
    showCameraPanel(cam ?? null);
    renderCustomerLinksPanel(sceneData?.customerLinks, sensor?.relatedKnowledgeIds ?? []);
    renderAttachmentsPanel(null, []);
  }
}

function showCameraPanel(cameraData) {
  const view = $("#mon3dv3-camera-view");
  if (!view) return;

  if (!cameraData) {
    view.classList.remove("is-alert");
    view.innerHTML = `<div class="mon3dv3-camera-placeholder"><span class="mon3dv3-live-badge">LIVE</span><p>カメラ未連携</p></div>`;
    return;
  }

  const isAlert = activeAlert?.sensorId && sceneData?.sensors.find((s) => s.sensorId === activeAlert.sensorId)?.cameraId === cameraData.cameraId;
  view.classList.toggle("is-alert", Boolean(isAlert));
  view.innerHTML = `
    <span class="mon3dv3-live-badge">LIVE</span>
    <img class="mon3dv3-camera-mock" src="${cameraData.placeholderImage}" alt="" />
    <div class="mon3dv3-camera-label">${cameraData.streamLabel} · ${cameraData.label}</div>
  `;
}

function triggerDemoScenario(scenarioId) {
  const scenario = sceneData?.demoScenarios.find((s) => s.scenarioId === scenarioId);
  if (!scenario) return;

  demoPlaying = true;
  const statusMap = new Map(sceneData.sensors.map((s) => [s.sensorId, "normal"]));
  statusMap.set(scenario.sensorId, scenario.alertLevel === "alert" ? "alert" : "warning");
  updateSensorStatuses(statusMap);

  showAlertCard({
    sensorId: scenario.sensorId,
    alertLevel: scenario.alertLevel,
    headline: scenario.headline,
    content: scenario.content,
  });

  if (!isTvMode) {
    setTimeout(() => {
      if (activeAlert && demoPlaying) clearAlert();
    }, scenario.durationMs || TV_ALERT_MS);
  }
}

function onPointerDown(event) {
  const canvas = $("#mon3dv3-canvas");
  if (!canvas || !camera) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const pinSprites = [...photoPinSprites.values()];
  const pinHits = raycaster.intersectObjects(pinSprites);
  if (pinHits[0]?.object?.userData?.photoPinSensorId) {
    selectSensor(pinHits[0].object.userData.photoPinSensorId, { openMaterialsTab: true });
    return;
  }

  const meshes = [...sensorMeshes.values()].map((e) => e.mesh);
  const hits = raycaster.intersectObjects(meshes);
  if (hits[0]?.object?.userData?.sensorId) {
    selectSensor(hits[0].object.userData.sensorId);
  }
}

function animate(time) {
  requestAnimationFrame(animate);

  if (autoOrbit && controls && !activeAlert) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
  } else if (controls) {
    controls.autoRotate = false;
  }

  sensorMeshes.forEach(({ mesh, sensor }) => {
    if (sensor.status === "alert") {
      const pulse = 1 + Math.sin(time * 0.012) * 0.18;
      mesh.scale.setScalar(pulse);
    }
  });

  animateRings(time);
  controls?.update();
  renderer?.render(scene, camera);
}

function bindUi() {
  $$(".mon3dv3-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchRightTab(btn.dataset.tab));
  });

  $$("#mon3dv3-mapasset-mode-btns button").forEach((btn) => {
    btn.addEventListener("click", () => setMapAssetDisplayMode(btn.dataset.mapMode));
  });

  $$(".mon3dv3-layer-btns button").forEach((btn) => {
    btn.addEventListener("click", () => applyLayerFilter(btn.dataset.layer));
  });

  $("#mon3dv3-auto-orbit")?.addEventListener("change", (e) => {
    autoOrbit = e.target.checked;
  });

  $("#mon3dv3-btn-reset")?.addEventListener("click", () => {
    camera?.position.copy(defaultCameraPos);
    controls?.target.copy(defaultTarget);
    controls?.update();
  });

  $("#mon3dv3-btn-clear")?.addEventListener("click", clearAlert);
  $("#mon3dv3-btn-focus")?.addEventListener("click", () => {
    if (activeAlert) flyToSensor(activeAlert.sensorId);
  });

  $("#mon3dv3-demo-intrusion")?.addEventListener("click", () => triggerDemoScenario("intrusion"));
  $("#mon3dv3-demo-fire")?.addEventListener("click", () => triggerDemoScenario("fire"));
  $("#mon3dv3-demo-equipment")?.addEventListener("click", () => triggerDemoScenario("equipment"));

  initSensorLayoutPanel();

  const tvBtn = $("#mon3dv3-btn-tv");
  if (tvBtn) {
    const u = new URL(location.href);
    if (isTvMode) {
      u.searchParams.delete("mode");
      tvBtn.textContent = "通常表示";
      tvBtn.href = u.pathname + u.search;
    } else {
      u.searchParams.set("mode", "tv");
      tvBtn.href = u.pathname + u.search;
    }
  }
}

function initSensorLayoutPanel() {
  const select = $("#mon3dv3-layout-device");
  const link = $("#mon3dv3-link-mapassets");
  const editPanel = $(".mon3dv3-layout-panel");
  const editToggle = $("#mon3dv3-layout-edit-mode");
  if (link) link.href = `/monitoring-map-assets-v1?siteId=${encodeURIComponent(siteId)}`;
  if (!select || !sceneData) return;

  select.innerHTML = sceneData.sensors
    .map(
      (s) =>
        `<option value="${s.sensorId}">${s.label} (${s.deviceType || "sensor"})</option>`
    )
    .join("");

  function fillFromSensor(sensorId) {
    const sensor = sceneData.sensors.find((s) => s.sensorId === sensorId);
    if (!sensor) return;
    $("#mon3dv3-layout-x").value = sensor.position.x;
    $("#mon3dv3-layout-y").value = sensor.position.y;
    $("#mon3dv3-layout-z").value = sensor.position.z;
  }

  function applyPreview() {
    const sensorId = select.value;
    const entry = sensorMeshes.get(sensorId);
    if (!entry) return;
    const x = Number($("#mon3dv3-layout-x").value);
    const y = Number($("#mon3dv3-layout-y").value);
    const z = Number($("#mon3dv3-layout-z").value);
    entry.mesh.position.set(x, y, z);
    if (entry.sprite) entry.sprite.position.set(x, y + 0.9, z);
    if (entry.ring) entry.ring.position.set(x, y + 0.05, z);
  }

  select.addEventListener("change", () => fillFromSensor(select.value));
  fillFromSensor(select.value);

  editToggle?.addEventListener("change", (e) => {
    sensorEditMode = e.target.checked;
    editPanel?.classList.toggle("is-editing", sensorEditMode);
    $("#mon3dv3-layout-msg").textContent = sensorEditMode
      ? "編集モード ON — 座標を調整して保存"
      : "";
  });

  $$(".mon3dv3-nudge").forEach((btn) => {
    btn.addEventListener("click", () => {
      const axis = btn.dataset.axis;
      const delta = Number(btn.dataset.delta);
      const input = $(`#mon3dv3-layout-${axis}`);
      if (input) input.value = Number(input.value) + delta;
      applyPreview();
      $("#mon3dv3-layout-msg").textContent = "プレビュー反映（未保存）";
    });
  });

  $("#mon3dv3-layout-preview")?.addEventListener("click", () => {
    applyPreview();
    $("#mon3dv3-layout-msg").textContent = "プレビュー反映（未保存）";
  });

  $("#mon3dv3-layout-save")?.addEventListener("click", async () => {
    const sensorId = select.value;
    const sensor = sceneData.sensors.find((s) => s.sensorId === sensorId);
    const msg = $("#mon3dv3-layout-msg");
    const position = {
      x: Number($("#mon3dv3-layout-x").value),
      y: Number($("#mon3dv3-layout-y").value),
      z: Number($("#mon3dv3-layout-z").value),
    };
    try {
      await fetch("/api/monitoring/v1/device-layout-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          deviceId: sensorId,
          deviceType: sensor?.deviceType || "sensor",
          label: sensor?.label,
          floorLevel: sensor?.floorLevel,
          position,
          rotation: { x: 0, y: 0, z: 0 },
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
      if (sensor) sensor.position = position;
      applyPreview();
      if (msg) msg.textContent = "device-layout-overrides に保存しました";
    } catch {
      if (msg) msg.textContent = "保存失敗";
    }
  });
}

function $$(sel) {
  return [...document.querySelectorAll(sel)];
}

async function boot() {
  tickClock();
  setInterval(tickClock, 1000);

  const canvas = $("#mon3dv3-canvas");
  initThree(canvas);

  try {
    sceneData = await apiGet(`/api/monitoring/v1/3d-scene?siteId=${encodeURIComponent(siteId)}`);
  } catch (err) {
    $("#mon3dv3-site-sub").textContent = "データ読み込みに失敗しました";
    console.error(err);
    animate(0);
    return;
  }

  $("#mon3dv3-site-title").textContent = sceneData.siteName;
  $("#mon3dv3-site-sub").textContent = `${sceneData.siteId} · Three.js V3.4 · 資料連携`;
  mapAssetDisplayMode = sceneData.mapAssetDisplayMode || sceneData.mapAsset?.defaultDisplayMode || "all_floors";
  const activeLabel = sceneData.mapAsset.activeAsset?.title;
  const statusText = activeLabel
    ? `${sceneData.mapAsset.integrationStatusLabel} — active: ${activeLabel}`
    : `${sceneData.mapAsset.integrationStatusLabel} — ${sceneData.mapAsset.integrationNote}`;
  $("#mon3dv3-mapasset-status").textContent = statusText;

  try {
    const attData = await apiGet(`/api/monitoring/v1/device-attachments?siteId=${encodeURIComponent(siteId)}`);
    siteAttachmentRecords = attData.records ?? [];
  } catch {
    siteAttachmentRecords = [];
  }

  buildFromMapAsset(sceneData.mapAsset);
  setMapAssetDisplayMode(mapAssetDisplayMode);
  sceneData.sensors.forEach(createSensorMarker);
  buildPhotoPinsFromAttachments(siteAttachmentRecords);
  await loadReportPhotoSlots();
  renderSensorList();
  applyLayerFilter("all");
  bindUi();
  switchRightTab("status", { skipLogReload: true });
  animate(0);
}

boot();
