/**
 * TiSLY Monitoring mapAsset Manager V3.3
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
// TODO: bundle Three.js + loaders locally instead of CDN importmap

const params = new URLSearchParams(location.search);
const siteId = params.get("siteId") || "DEMO-HOME-001";

const $ = (sel) => document.querySelector(sel);

let listData = null;
let selectedAssetId = null;
let floorFilter = "all";
const selectedAssetIds = new Set();
let previewRenderer = null;
let previewScene = null;
let previewCamera = null;
let previewControls = null;
let previewAnimId = null;

function api(path, opts = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || String(r.status));
    return body;
  });
}

function showMsg(el, text, isError = false) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function showToast(text, isError = false) {
  const toast = $("#mma-toast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderGuide(guide) {
  const box = $("#mma-upload-guide");
  if (!box || !guide) return;
  box.innerHTML = `
    <p><strong>対象:</strong> ${guide.audience}</p>
    <p><strong>Polycam:</strong> ${guide.polycam}</p>
    <p><strong>RoomPlan:</strong> ${guide.roomplan}</p>
    <p><strong>Scaniverse:</strong> ${guide.scaniverse}</p>
    <p><strong>フロア分割:</strong> ${guide.floorSplit}</p>
    <p><strong>位置合わせ:</strong> ${guide.calibration}</p>
    <p><strong>アップロード:</strong> ${guide.uploadApi ?? "POST /api/monitoring/v1/map-assets/upload"}</p>
    <p><strong>サイズ上限:</strong> ${guide.maxSize3d ?? "3D 100MB · 画像 10MB · JSON 5MB"}</p>
    <p><strong>未対応表示:</strong> ${guide.unsupportedPreview ?? "USDZ は GLB 変換推奨"}</p>
    <p><strong>OBJ/PLY:</strong> ${guide.objPlySupport ?? "V3.3 OBJ/PLY 表示対応"}</p>
    <p><strong>複数フロア:</strong> ${guide.multiFloorDisplay ?? "全フロア合成表示"}</p>
    <p><strong>USDZ:</strong> ${guide.usdzConversion ?? "GLB 変換推奨"}</p>
    <p><strong>将来保存:</strong> ${guide.futureStorage}</p>
  `;
}

function fileTypeBadge(fileType) {
  if (fileType === "obj") return `<span class="mma-filetype-badge mma-badge-supported">OBJ対応</span>`;
  if (fileType === "ply") return `<span class="mma-filetype-badge mma-badge-supported">PLY対応</span>`;
  if (fileType === "usdz") {
    return `<span class="mma-filetype-badge mma-badge-usdz">USDZ · GLB変換推奨</span>`;
  }
  return `<span class="mma-filetype-badge">${fileType}</span>`;
}

function renderFloorTabs(data) {
  const tabs = $("#mma-floor-tabs");
  if (!tabs) return;
  const floors = ["all", "perimeter", "1f", "2f", "roof"];
  const labels = { all: "すべて", perimeter: "外周", "1f": "1F", "2f": "2F", roof: "屋根" };
  tabs.innerHTML = floors
    .map(
      (f) =>
        `<button type="button" class="mma-floor-tab${floorFilter === f ? " active" : ""}" data-floor="${f}">${labels[f]}</button>`
    )
    .join("");
  tabs.querySelectorAll(".mma-floor-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      floorFilter = btn.dataset.floor;
      renderFloorTabs(data);
      renderAssets(data);
    });
  });
}

function filteredAssets(data) {
  if (floorFilter === "all") return data.assets;
  return data.assets.filter((a) => a.floorLevel === floorFilter);
}

function fillTransformForm(asset) {
  const t = asset.transform;
  $("#mma-t-x").value = t.position.x;
  $("#mma-t-y").value = t.position.y;
  $("#mma-t-z").value = t.position.z;
  $("#mma-t-rx").value = t.rotation.x;
  $("#mma-t-ry").value = t.rotation.y;
  $("#mma-t-rz").value = t.rotation.z;
  $("#mma-t-sx").value = t.scale.x;
  $("#mma-t-sy").value = t.scale.y;
  $("#mma-t-sz").value = t.scale.z;
  $("#mma-t-ho").value = t.heightOffset ?? 0;
  $("#mma-cal-title").textContent = `${asset.title} (${asset.assetId})`;
  $("#mma-calibration-panel").hidden = false;
  const preview = $("#mma-btn-preview-3d");
  if (preview) preview.href = `/monitoring-3d-v2?siteId=${encodeURIComponent(siteId)}`;
}

function stopPreview3d() {
  if (previewAnimId) cancelAnimationFrame(previewAnimId);
  previewAnimId = null;
  previewRenderer?.dispose();
  previewRenderer = null;
  previewScene = null;
  previewCamera = null;
  previewControls = null;
}

function showAssetPreview(asset) {
  const panel = $("#mma-preview-panel");
  const imgWrap = $("#mma-preview-image-wrap");
  const canvasWrap = $("#mma-preview-3d-wrap");
  const placeholder = $("#mma-preview-placeholder");
  const msg = $("#mma-preview-msg");
  if (!panel) return;

  panel.hidden = false;
  $("#mma-preview-title").textContent = `${asset.title} · ${asset.fileType} · ${formatFileSize(asset.fileSize)}`;
  imgWrap.hidden = true;
  canvasWrap.hidden = true;
  placeholder.hidden = true;
  stopPreview3d();

  if (!asset.fileUrl) {
    placeholder.hidden = false;
    if (msg) msg.textContent = "fileUrl 未接続 — placeholder";
    return;
  }

  if (asset.fileType === "image" || /\.(jpg|jpeg|png)$/i.test(asset.fileName || "")) {
    imgWrap.hidden = false;
    const img = $("#mma-preview-image");
    img.src = asset.fileUrl;
    if (msg) msg.textContent = "画像プレビュー";
    return;
  }

  if (asset.fileType === "glb" || asset.fileType === "gltf") {
    canvasWrap.hidden = false;
    initMeshPreview(asset, msg, "gltf");
    return;
  }

  if (asset.fileType === "obj") {
    canvasWrap.hidden = false;
    initMeshPreview(asset, msg, "obj");
    return;
  }

  if (asset.fileType === "ply") {
    canvasWrap.hidden = false;
    initMeshPreview(asset, msg, "ply");
    return;
  }

  if (asset.fileType === "usdz") {
    placeholder.hidden = false;
    if (msg) msg.textContent = "USDZ — 3D プレビュー準備中。GLB 変換を推奨します。";
    return;
  }

  placeholder.hidden = false;
  if (msg) msg.textContent = `${asset.fileType} — 3D プレビュー未対応`;
}

function initMeshPreview(asset, msgEl, kind) {
  const canvas = $("#mma-preview-canvas");
  if (!canvas) return;

  previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  previewRenderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 200, false);

  previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(0x0f172a);
  previewCamera = new THREE.PerspectiveCamera(45, (canvas.clientWidth || 320) / (canvas.clientHeight || 200), 0.1, 200);
  previewCamera.position.set(3, 2.5, 4);

  previewControls = new OrbitControls(previewCamera, canvas);
  previewControls.enableDamping = true;

  previewScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0x22d3ee, 1);
  dir.position.set(4, 6, 3);
  previewScene.add(dir);

  const onLoaded = (obj) => {
    previewScene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    obj.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    previewCamera.position.set(maxDim * 1.2, maxDim, maxDim * 1.4);
    previewControls.target.set(0, 0, 0);
    const labels = { gltf: "GLB/GLTF", obj: "OBJ", ply: "PLY" };
    if (msgEl) msgEl.textContent = `${labels[kind] ?? kind} プレビュー`;
    animatePreview();
  };

  const onFail = () => canvasWrapFallback(canvas, msgEl);

  if (msgEl) msgEl.textContent = "3D 読み込み中…";

  if (kind === "gltf") {
    new GLTFLoader().load(asset.fileUrl, (gltf) => onLoaded(gltf.scene), undefined, onFail);
  } else if (kind === "obj") {
    new OBJLoader().load(
      asset.fileUrl,
      (obj) => {
        obj.traverse((c) => {
          if (c.isMesh && !c.material) {
            c.material = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
          }
        });
        onLoaded(obj);
      },
      undefined,
      onFail
    );
  } else if (kind === "ply") {
    new PLYLoader().load(
      asset.fileUrl,
      (geo) => {
        const obj = geo.index
          ? new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x22d3ee }))
          : new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x22d3ee, size: 0.05 }));
        onLoaded(obj);
      },
      undefined,
      onFail
    );
  }
}

function initGltfPreview(asset, msgEl) {
  initMeshPreview(asset, msgEl, "gltf");
}

function canvasWrapFallback(canvas, msgEl) {
  const parent = canvas?.parentElement;
  if (parent) parent.hidden = true;
  const placeholder = $("#mma-preview-placeholder");
  if (placeholder) placeholder.hidden = false;
  if (msgEl) msgEl.textContent = "読み込み失敗 — placeholder";
}

function animatePreview() {
  function loop() {
    previewAnimId = requestAnimationFrame(loop);
    previewControls?.update();
    if (previewRenderer && previewScene && previewCamera) {
      previewRenderer.render(previewScene, previewCamera);
    }
  }
  loop();
}

function renderAssets(data) {
  const list = $("#mma-asset-list");
  if (!list) return;

  const assets = filteredAssets(data);
  if (!assets.length) {
    list.innerHTML = `<p class="mma-muted">登録なし — fallback: ${data.fallbackAsset?.title ?? "—"}</p>`;
    return;
  }

  list.innerHTML = assets
    .map((a) => {
      const isActive = data.activeAsset?.assetId === a.assetId;
      const isVisible = a.visibleInDashboard !== false;
      const previewSrc = a.fileType === "image" && a.fileUrl ? a.fileUrl : a.previewUrl || "/icons/icon-128.png";
      return `<article class="mma-asset-card${isActive ? " is-active" : ""}${!isVisible ? " is-hidden-asset" : ""}" data-id="${a.assetId}">
        <header>
          <div class="mma-card-row">
            <input type="checkbox" class="mma-card-select" data-id="${a.assetId}" ${selectedAssetIds.has(a.assetId) ? "checked" : ""} aria-label="選択" />
            <img class="mma-preview" src="${previewSrc}" alt="" width="64" height="64" />
            <div>
              <h3>${escapeHtml(a.title)}</h3>
              <p class="mma-meta">
                ${fileTypeBadge(a.fileType)}
                ${a.sourceType} · ${a.floorLevel} · ${a.mapType}
              </p>
              <p class="mma-meta">${formatFileSize(a.fileSize)}${a.fileUrl ? " · 実ファイルあり" : " · placeholder"}${!isVisible ? " · 非表示" : ""}</p>
            </div>
          </div>
          <span class="mma-badge${isActive ? " active" : ""}">${isActive ? "ACTIVE" : a.status}</span>
        </header>
        <p class="mma-meta">${escapeHtml(a.notes || "")}</p>
        <div class="mma-actions">
          <button type="button" class="mma-btn secondary mma-set-active" data-id="${a.assetId}">active</button>
          <button type="button" class="mma-btn secondary mma-toggle-visible" data-id="${a.assetId}">${isVisible ? "非表示" : "表示ON"}</button>
          <button type="button" class="mma-btn secondary mma-preview" data-id="${a.assetId}">プレビュー</button>
          <button type="button" class="mma-btn secondary mma-edit-transform" data-id="${a.assetId}">transform</button>
          <button type="button" class="mma-btn danger mma-delete" data-id="${a.assetId}">削除</button>
        </div>
      </article>`;
    })
    .join("");

  list.querySelectorAll(".mma-card-select").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedAssetIds.add(cb.dataset.id);
      else selectedAssetIds.delete(cb.dataset.id);
    });
  });
  list.querySelectorAll(".mma-set-active").forEach((btn) => {
    btn.addEventListener("click", () => setActive(btn.dataset.id));
  });
  list.querySelectorAll(".mma-toggle-visible").forEach((btn) => {
    btn.addEventListener("click", () => toggleVisible(btn.dataset.id));
  });
  list.querySelectorAll(".mma-preview").forEach((btn) => {
    btn.addEventListener("click", () => {
      const asset = data.assets.find((a) => a.assetId === btn.dataset.id);
      if (asset) showAssetPreview(asset);
    });
  });
  list.querySelectorAll(".mma-edit-transform").forEach((btn) => {
    btn.addEventListener("click", () => {
      const asset = data.assets.find((a) => a.assetId === btn.dataset.id);
      if (asset) {
        selectedAssetId = asset.assetId;
        fillTransformForm(asset);
      }
    });
  });
  list.querySelectorAll(".mma-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteAsset(btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadList() {
  listData = await api(`/api/monitoring/v1/map-assets?siteId=${encodeURIComponent(siteId)}`);
  renderFloorTabs(listData);
  renderAssets(listData);
  renderGuide(listData.uploadGuide);
}

async function toggleVisible(assetId) {
  const asset = listData.assets.find((a) => a.assetId === assetId);
  const next = asset?.visibleInDashboard === false;
  await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(assetId)}?siteId=${encodeURIComponent(siteId)}`, {
    method: "PATCH",
    body: JSON.stringify({ visibleInDashboard: next }),
  });
  showToast(next ? "3D Dashboard 表示 ON" : "3D Dashboard 表示 OFF");
  await loadList();
}

async function deleteAsset(assetId) {
  if (!confirm(`mapAsset ${assetId} を削除しますか？`)) return;
  try {
    await api(
      `/api/monitoring/v1/map-assets/${encodeURIComponent(assetId)}?siteId=${encodeURIComponent(siteId)}&deleteFile=true`,
      { method: "DELETE" }
    );
    selectedAssetIds.delete(assetId);
    showToast("削除しました");
    await loadList();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function resetAllTransforms() {
  if (!confirm("全 mapAsset の transform をリセットしますか？")) return;
  try {
    const res = await api(`/api/monitoring/v1/map-assets/reset-transforms?siteId=${encodeURIComponent(siteId)}`, {
      method: "POST",
      body: JSON.stringify({ siteId }),
    });
    showToast(`transform 一括リセット (${res.resetCount ?? 0}件)`);
    await loadList();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function setActive(assetId) {
  await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(assetId)}?siteId=${encodeURIComponent(siteId)}`, {
    method: "PATCH",
    body: JSON.stringify({ setActive: true }),
  });
  showToast("active に切り替えました");
  await loadList();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function setUploadProgress(visible, pct = 0, text = "") {
  const box = $("#mma-upload-progress");
  const bar = $("#mma-upload-progress-bar");
  const label = $("#mma-upload-progress-text");
  if (box) box.hidden = !visible;
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = text;
}

async function uploadScanFile(form) {
  const msg = $("#mma-upload-msg");
  const fileInput = $("#mma-scan-file");
  const file = fileInput?.files?.[0];
  if (!file) {
    showMsg(msg, "ファイルを選択してください", true);
    return;
  }

  const btn = $("#mma-btn-upload");
  if (btn) btn.disabled = true;
  setUploadProgress(true, 10, "ファイル読込中…");

  try {
    const fileBase64 = await readFileAsBase64(file);
    setUploadProgress(true, 45, "アップロード中…");

    const fd = new FormData(form);
    const res = await api("/api/monitoring/v1/map-assets/upload", {
      method: "POST",
      body: JSON.stringify({
        siteId,
        title: fd.get("title"),
        sourceType: fd.get("sourceType"),
        floorLevel: fd.get("floorLevel"),
        mapType: fd.get("mapType"),
        notes: fd.get("notes"),
        setActive: fd.get("setActive") === "on",
        fileName: file.name,
        fileBase64,
        mimeType: file.type || undefined,
      }),
    });

    setUploadProgress(true, 100, "完了");
    showMsg(msg, `アップロード成功 — ${res.asset?.assetId ?? ""}`);
    showToast(`登録完了: ${res.asset?.title ?? file.name}`);
    form.reset();
    await loadList();
    if (res.asset) showAssetPreview(res.asset);
  } catch (err) {
    showMsg(msg, err.message, true);
    showToast(err.message, true);
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => setUploadProgress(false), 800);
  }
}

async function saveTransform() {
  if (!selectedAssetId) return;
  const msg = $("#mma-cal-msg");
  try {
    await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(selectedAssetId)}?siteId=${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        transform: {
          position: {
            x: Number($("#mma-t-x").value),
            y: Number($("#mma-t-y").value),
            z: Number($("#mma-t-z").value),
          },
          rotation: {
            x: Number($("#mma-t-rx").value),
            y: Number($("#mma-t-ry").value),
            z: Number($("#mma-t-rz").value),
          },
          scale: {
            x: Number($("#mma-t-sx").value),
            y: Number($("#mma-t-sy").value),
            z: Number($("#mma-t-sz").value),
          },
          heightOffset: Number($("#mma-t-ho").value),
        },
      }),
    });
    showMsg(msg, "transform を保存しました — 3D Dashboard で確認してください");
    showToast("transform 保存完了");
    await loadList();
  } catch (e) {
    showMsg(msg, e.message, true);
  }
}

async function resetTransform() {
  if (!selectedAssetId) return;
  const msg = $("#mma-cal-msg");
  try {
    await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(selectedAssetId)}?siteId=${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ resetTransform: true }),
    });
    showMsg(msg, "transform をリセットしました");
    await loadList();
    const asset = listData.assets.find((a) => a.assetId === selectedAssetId);
    if (asset) fillTransformForm(asset);
  } catch (e) {
    showMsg(msg, e.message, true);
  }
}

function bindUi() {
  $("#mma-site-label").textContent = `siteId: ${siteId}`;
  $("#mma-link-3d").href = `/monitoring-3d-v2?siteId=${encodeURIComponent(siteId)}`;
  $("#mma-btn-reload")?.addEventListener("click", () => loadList().catch(console.error));

  $("#mma-upload-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await uploadScanFile(e.target);
  });

  $("#mma-btn-save-transform")?.addEventListener("click", saveTransform);
  $("#mma-btn-reset-transform")?.addEventListener("click", resetTransform);
  $("#mma-btn-reset-all-transforms")?.addEventListener("click", resetAllTransforms);
}

bindUi();
loadList().catch((err) => {
  console.error(err);
  showMsg($("#mma-upload-msg"), "読み込み失敗", true);
});
