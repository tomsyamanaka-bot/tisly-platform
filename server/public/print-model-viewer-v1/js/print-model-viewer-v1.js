/**
 * TiSLY Print Model Viewer V1 — Three.js STL + slice dashboard
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const params = new URLSearchParams(location.search);
const $ = (sel) => document.querySelector(sel);

/** @type {THREE.WebGLRenderer|null} */
let renderer = null;
/** @type {THREE.PerspectiveCamera|null} */
let camera = null;
/** @type {OrbitControls|null} */
let controls = null;
/** @type {THREE.Scene|null} */
let scene = null;
/** @type {THREE.Mesh|null} */
let currentMesh = null;
/** @type {string|null} */
let selectedId = params.get("id");
/** @type {Array<object>} */
let models = [];

function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtNum(v, unit = "") {
  if (v == null || v === "") return "—";
  return `${v}${unit}`;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function initScene() {
  const wrap = $("#pmv-canvas-wrap");
  if (!wrap) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.position.set(80, 60, 100);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  wrap.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(80, 120, 60);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x38bdf8, 0.35);
  fill.position.set(-60, 40, -40);
  scene.add(fill);

  const grid = new THREE.GridHelper(200, 20, 0x334155, 0x1e293b);
  grid.position.y = 0;
  scene.add(grid);

  const resize = () => {
    if (!renderer || !camera || !wrap) return;
    const w = wrap.clientWidth || 1;
    const h = wrap.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener("resize", resize);
  resize();

  const tick = () => {
    requestAnimationFrame(tick);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  };
  tick();
}

function clearMesh() {
  if (!scene || !currentMesh) return;
  scene.remove(currentMesh);
  currentMesh.geometry?.dispose?.();
  if (Array.isArray(currentMesh.material)) {
    currentMesh.material.forEach((m) => m.dispose?.());
  } else {
    currentMesh.material?.dispose?.();
  }
  currentMesh = null;
}

function fitCameraToObject(object) {
  if (!camera || !controls) return;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const dist = maxDim * 2.2;
  camera.near = Math.max(0.01, maxDim / 200);
  camera.far = Math.max(1000, maxDim * 50);
  camera.updateProjectionMatrix();
  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.55, center.z + dist * 0.7);
  controls.target.copy(center);
  controls.update();
}

async function loadStl(url) {
  const empty = $("#pmv-viewer-empty");
  const loading = $("#pmv-viewer-loading");
  if (empty) empty.hidden = true;
  if (loading) loading.hidden = false;
  clearMesh();

  try {
    const geometry = await new Promise((resolve, reject) => {
      const loader = new STLLoader();
      loader.load(url, resolve, undefined, reject);
    });
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.15,
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Center on bed plane
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    mesh.position.sub(center);
    mesh.position.y += (box.max.y - box.min.y) / 2;

    scene.add(mesh);
    currentMesh = mesh;
    fitCameraToObject(mesh);
  } catch (err) {
    console.error(err);
    if (empty) {
      empty.hidden = false;
      empty.textContent = "STL の読み込みに失敗しました";
    }
  } finally {
    if (loading) loading.hidden = true;
  }
}

function renderDashboard(model) {
  if (!model) {
    setText("#pmv-model-name", "スライス概要");
    setText("#pmv-model-meta", "モデル未選択");
    setText("#pmv-stat-time", "—");
    setText("#pmv-stat-layers", "—");
    setText("#pmv-stat-layer-h", "—");
    setText("#pmv-stat-nozzle", "—");
    setText("#pmv-stat-bed", "—");
    setText("#pmv-stat-nozzle-size", "—");
    setText("#pmv-stat-infill", "—");
    setText("#pmv-stat-filament", "—");
    setText("#pmv-stat-stl-size", "—");
    $("#pmv-extra-dl").innerHTML = "";
    $("#pmv-link-stl").hidden = true;
    $("#pmv-link-gcode").hidden = true;
    return;
  }

  const slice = model.slice || {};
  setText("#pmv-model-name", model.name || model.id);
  setText(
    "#pmv-model-meta",
    `${model.source || "—"} · 更新 ${new Date(model.updatedAt).toLocaleString("ja-JP")}`
  );
  setText("#pmv-stat-time", slice.printTimeLabel || "—");
  setText("#pmv-stat-layers", fmtNum(slice.layerCount, " 層"));
  setText("#pmv-stat-layer-h", slice.layerHeightMm != null ? `${slice.layerHeightMm} mm` : "—");
  setText("#pmv-stat-nozzle", slice.nozzleTempC != null ? `${slice.nozzleTempC}℃` : "—");
  setText("#pmv-stat-bed", slice.bedTempC != null ? `${slice.bedTempC}℃` : "—");
  setText(
    "#pmv-stat-nozzle-size",
    slice.nozzleSizeMm != null ? `${slice.nozzleSizeMm} mm` : "—"
  );
  setText(
    "#pmv-stat-infill",
    slice.infillPercent != null ? `${slice.infillPercent}%` : "—"
  );
  setText(
    "#pmv-stat-filament",
    slice.filamentUsedM != null ? `${slice.filamentUsedM} m` : "—"
  );
  setText("#pmv-stat-stl-size", fmtBytes(model.stlSizeBytes));

  const extra = [];
  if (slice.machineName) extra.push(["機種", slice.machineName]);
  if (slice.material) extra.push(["材料", slice.material]);
  if (model.notes) extra.push(["メモ", model.notes]);
  if (model.gcodeSizeBytes) extra.push(["G-code", fmtBytes(model.gcodeSizeBytes)]);
  $("#pmv-extra-dl").innerHTML = extra
    .map(
      ([k, v]) =>
        `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`
    )
    .join("");

  const stlLink = $("#pmv-link-stl");
  stlLink.hidden = !model.stlUrl;
  stlLink.href = model.stlUrl || "#";
  stlLink.download = model.stlFileName || "model.stl";

  const gcodeLink = $("#pmv-link-gcode");
  gcodeLink.hidden = !model.gcodeUrl;
  gcodeLink.href = model.gcodeUrl || "#";
  gcodeLink.download = model.gcodeFileName || "model.gcode";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList() {
  const list = $("#pmv-model-list");
  const status = $("#pmv-list-status");
  if (!models.length) {
    status.textContent = "まだアップロードがありません";
    list.innerHTML = "";
    return;
  }
  status.textContent = `${models.length} 件`;
  list.innerHTML = models
    .map((m) => {
      const active = m.id === selectedId ? "active" : "";
      const time = m.slice?.printTimeLabel || "時間未設定";
      return `<li>
        <button type="button" class="pmv-model-item ${active}" data-id="${escapeHtml(m.id)}">
          <strong>${escapeHtml(m.name)}</strong>
          <span>${escapeHtml(time)} · ${escapeHtml(fmtBytes(m.stlSizeBytes))}</span>
        </button>
      </li>`;
    })
    .join("");

  list.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectModel(btn.getAttribute("data-id"));
    });
  });
}

async function selectModel(id) {
  selectedId = id;
  const model = models.find((m) => m.id === id) || null;
  renderList();
  renderDashboard(model);
  if (model?.stlUrl) {
    const url = new URL(location.href);
    url.searchParams.set("id", id);
    history.replaceState(null, "", url);
    await loadStl(model.stlUrl);
  } else {
    clearMesh();
    const empty = $("#pmv-viewer-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = "モデルを選択してください";
    }
  }
}

async function loadModels() {
  const status = $("#pmv-list-status");
  status.textContent = "読み込み中…";
  const res = await fetch("/api/print-models/v1/models");
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  models = data.models || [];
  renderList();
  if (selectedId && models.some((m) => m.id === selectedId)) {
    await selectModel(selectedId);
  } else if (models[0]) {
    await selectModel(models[0].id);
  } else {
    renderDashboard(null);
  }
}

function bindUi() {
  $("#pmv-btn-reload")?.addEventListener("click", () => {
    loadModels().catch((e) => {
      $("#pmv-list-status").textContent = `読込失敗: ${e.message}`;
    });
  });
  $("#pmv-btn-reset-camera")?.addEventListener("click", () => {
    if (currentMesh) fitCameraToObject(currentMesh);
  });
  $("#pmv-auto-rotate")?.addEventListener("change", (e) => {
    if (controls) controls.autoRotate = Boolean(e.target.checked);
  });
}

initScene();
bindUi();
loadModels().catch((e) => {
  $("#pmv-list-status").textContent = `読込失敗: ${e.message}`;
});
