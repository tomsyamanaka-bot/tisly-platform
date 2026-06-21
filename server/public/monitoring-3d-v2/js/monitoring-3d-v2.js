/**
 * TiSLY Monitoring 3D Dashboard V3 — Three.js · LiDAR · Customer連動
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const params = new URLSearchParams(location.search);
const siteId = params.get("siteId") || "DEMO-HOME-001";
const isTvMode = params.get("mode") === "tv";
const TV_ALERT_MS = 30000;

const $ = (sel) => document.querySelector(sel);

let sceneData = null;
let layerFilter = "all";
let autoOrbit = true;
let selectedSensorId = null;
let activeAlert = null;
let tvCountdownTimer = null;
let demoPlaying = false;

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

/** @type {Map<string, { mesh: THREE.Mesh, sensor: object, ripples: THREE.Mesh[] }>} */
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
  mapAsset.assets.forEach((asset) => {
    const group = layerGroups[asset.floorLevel];
    if (!group) return;

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

  try {
    const data = await apiGet(
      `/api/monitoring/v1/3d-sensor/${encodeURIComponent(sensorId)}?siteId=${encodeURIComponent(siteId)}`
    );
    showCameraPanel(data.camera);
    showKnowledgeLinks(data.relatedKnowledgeIds, data.knowledgeLinks);
  } catch {
    const sensor = sceneData?.sensors.find((s) => s.sensorId === sensorId);
    const cam = sceneData?.cameras.find((c) => c.cameraId === sensor?.cameraId);
    showCameraPanel(cam ?? null);
    showKnowledgeLinks(sensor?.relatedKnowledgeIds ?? [], []);
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

function showKnowledgeLinks(ids, apiLinks) {
  const box = $("#mon3dv3-knowledge-links");
  if (!box || !sceneData) return;

  const links = [];
  if (apiLinks && typeof apiLinks === "object" && !Array.isArray(apiLinks)) {
    if (apiLinks.equipmentUrl) links.push({ label: "設備説明（Customer）", url: apiLinks.equipmentUrl });
    if (apiLinks.materialsUrl) links.push({ label: "関連資料 PDF", url: apiLinks.materialsUrl });
    if (apiLinks.projectUrl) links.push({ label: "案件ページ", url: apiLinks.projectUrl });
  }
  ids.forEach((id) => {
    links.push({
      label: `Knowledge: ${id}`,
      url: `/knowledge-customer-detail-v1?id=${encodeURIComponent(id)}&kind=card`,
    });
  });
  links.push({
    label: "案件ページを見る",
    url: sceneData.customerLinks.projectPageUrl,
  });
  links.push({
    label: "Site Map（Customer）",
    url: sceneData.customerLinks.siteMapUrl,
  });

  box.innerHTML = links
    .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
    .join("");
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
  $("#mon3dv3-site-sub").textContent = `${sceneData.siteId} · Three.js V3 · LiDAR準備`;
  $("#mon3dv3-mapasset-status").textContent = `${sceneData.mapAsset.integrationStatusLabel} — ${sceneData.mapAsset.integrationNote}`;

  buildFromMapAsset(sceneData.mapAsset);
  sceneData.sensors.forEach(createSensorMarker);
  renderSensorList();
  applyLayerFilter("all");
  bindUi();
  animate(0);
}

boot();
