/**
 * TiSLY 3D Floorplan Builder PWA
 * 方眼紙スキャン + アイソメ俯瞰 + Security 連携
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const LS_KEY = "tisly_floorplan_config";
const LS_ACTIVE = "tisly_floorplan_active_id";

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
  ctx.strokeStyle = "rgba(0, 212, 255, 0.35)";
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
  ctx.strokeStyle = "rgba(0, 255, 136, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

function drawOverlay() {
  const svg = $("fpb-overlay");
  const floor = activeFloor();
  if (!svg || !floor) return;
  const rooms = (floor.rooms || [])
    .map((r) => {
      const tx = r.x + r.w / 2;
      const ty = r.y + r.h / 2;
      return `<rect class="fpb-room" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="1.2"></rect>
        <text class="fpb-room-label" x="${tx}" y="${ty}">${escapeXml(r.label)}</text>`;
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
  if (floor.backgroundImage) {
    img.src = floor.backgroundImage;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
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

function refresh2d() {
  syncTabs();
  syncBackground();
  drawGrid();
  drawOverlay();
  rebuild3d();
}

function init3d() {
  const mount = $("fpb-preview");
  if (!mount || renderer) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05080f, 0.035);

  const w = mount.clientWidth || 320;
  const h = mount.clientHeight || 360;
  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  // 斜め上 45° アイソメ風
  camera.position.set(18, 18, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 8;
  controls.maxDistance = 48;

  const ambient = new THREE.AmbientLight(0x88aacc, 0.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0x00ff88, 0.85);
  key.position.set(8, 16, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x00d4ff, 0.45);
  fill.position.set(-10, 10, -8);
  scene.add(fill);

  const grid = new THREE.GridHelper(24, 24, 0x00d4ff, 0x14304a);
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
  const glow = new THREE.Color(state.render?.glowColor || "#00ff88");
  const glowAlt = new THREE.Color(state.render?.glowColorAlt || "#00d4ff");

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x0c1a2e,
    emissive: glowAlt,
    emissiveIntensity: 0.08,
    metalness: 0.35,
    roughness: 0.55,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.15, 22), slabMat);
  slab.position.y = 0.05;
  buildingGroup.add(slab);

  const roomMat = new THREE.MeshStandardMaterial({
    color: 0x102438,
    emissive: glow,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity,
    metalness: 0.2,
    roughness: 0.4,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a3048,
    emissive: glowAlt,
    emissiveIntensity: 0.35,
    metalness: 0.45,
    roughness: 0.3,
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
        color: glow,
        transparent: true,
        opacity: 0.9,
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
  }

  for (const o of floor.openings || []) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x00d4ff,
        emissive: 0x00d4ff,
        emissiveIntensity: 0.9,
      })
    );
    marker.position.set(pctToWorld(o.x), wallH * 0.4, pctToWorld(o.y));
    buildingGroup.add(marker);
  }

  // カメラ仰角 45°
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

function onFileChange(ev) {
  const file = ev.target?.files?.[0];
  if (!file || !state) return;
  const reader = new FileReader();
  reader.onload = () => {
    const floor = activeFloor();
    if (!floor) return;
    floor.backgroundImage = String(reader.result || "");
    refresh2d();
    setStatus("方眼紙写真を取り込みました（グリッド重ね表示中）");
  };
  reader.readAsDataURL(file);
}

function clearBackground() {
  const floor = activeFloor();
  if (!floor) return;
  floor.backgroundImage = null;
  refresh2d();
  setStatus("背景をクリアしました");
}

function bindUi() {
  $("fpb-preset-tsukuba")?.addEventListener("click", () =>
    loadPreset("tsukuba_model_house")
  );
  $("fpb-preset-hiraya")?.addEventListener("click", () =>
    loadPreset("hiraya_demo")
  );
  $("fpb-file")?.addEventListener("change", onFileChange);
  $("fpb-clear-bg")?.addEventListener("click", clearBackground);
  $("fpb-save")?.addEventListener("click", saveAll);
  $("fpb-send-security")?.addEventListener("click", sendToSecurity);

  document.querySelectorAll("#fpb-floor-tabs .fpb-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!state || btn.disabled) return;
      state.activeFloor = btn.getAttribute("data-floor") || "1f";
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
}

async function boot() {
  bindUi();
  init3d();

  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      state = JSON.parse(cached);
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
