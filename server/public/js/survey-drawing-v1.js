/** 現調図面 v2 — 方眼紙写真 + 線・記号・メモ + AI清書用出力 + Phase9 TEMP/localStorage */

import {
  openSpecificationPreview,
  regenerateSpecificationPdf,
  saveSpecificationPdf,
  shareSpecificationPdf,
} from "./survey-pdf-actions-v1.js";
import {
  buildLocalDrawingPayload,
  isTempDrawingId,
  loadDrawingFromLocalStorage,
  resolveDrawingIds,
  saveDrawingToLocalStorage,
} from "./survey-drawing-local-v1.js";
import {
  bindOfflineResilienceAutoSyncV1,
  enqueueOfflineResilienceV1,
  isNetworkOnlineV1,
  updateOfflineResilienceBadgeV1,
} from "./offline-resilience-v1.js";

export const SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v5";
export const SURVEY_DRAWING_TEMP_BANNER =
  "一時図面として作成中。現調から開くと案件に紐づきます。";

const TOKEN_KEY = "tisly_token";
const SCHEMA_VERSION = 2;
const DRAWING_VERSION = 2;

const LINE_TYPE_COLORS = {
  lan: "#2563eb",
  power100v: "#dc2626",
  power24v: "#ca8a04",
  rs485: "#7c3aed",
  coax: "#64748b",
  phone: "#059669",
  generic: "#0f172a",
};

const LINE_TYPE_DASH = {
  rs485: "6 4",
  phone: "4 3",
};

import { navigatePracticalReturn, navigateTo } from "./tisly-return-nav-v1.js";
import { navigateBackOne } from "./tisly-navigation-stack-v1.js";
import {
  initDrawingEditorFoundationV1,
  editorStateToLayerV1,
  editorV1LayerToPayload,
  applyDrawingEditorPayloadClientV1,
} from "./features/drawing/drawing-editor-v1.js";

function $(id) {
  return document.getElementById(id);
}

function params() {
  return new URLSearchParams(location.search);
}

function apiHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function api(method, path, body) {
  if (!isNetworkOnlineV1()) {
    throw new Error("offline");
  }
  const res = await fetch(path, {
    method,
    headers: apiHeaders(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
}

/**
 * オフラインキュー 1 件をサーバーへ再送
 * @param {{ kind: string, payload: object }} entry
 */
async function processOfflineResilienceEntry(entry) {
  const { kind, payload } = entry;
  if (kind === "drawing_sketch_patch") {
    await api("PATCH", `/api/survey/v1/drawing-sketches/${encodeURIComponent(payload.sketchId)}`, {
      layers: payload.layers,
      title: payload.title,
    });
    return true;
  }
  if (kind === "drawing_background") {
    await api(
      "POST",
      `/api/survey/v1/drawing-sketches/${encodeURIComponent(payload.sketchId)}/background`,
      {
        imageBase64: payload.imageBase64,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
      }
    );
    return true;
  }
  if (kind === "voice_nav_log" && payload.sketchId) {
    const res = await fetch(
      `/api/survey/v1/drawing-sketches/${encodeURIComponent(payload.sketchId)}/ai-pipeline`,
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          voiceLog: payload.voiceLog,
          businessProjectId: payload.businessProjectId ?? null,
        }),
      }
    );
    return res.ok;
  }
  return false;
}

function uid() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function setStatus(msg) {
  const el = $("drawing-status");
  if (el) el.textContent = msg;
}

function emptyLayers(w = 800, h = 600) {
  return {
    schemaVersion: SCHEMA_VERSION,
    drawingVersion: DRAWING_VERSION,
    canvasWidth: w,
    canvasHeight: h,
    paths: [],
    symbols: [],
    notes: [],
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  };
}

function migrateLayers(raw, w = 800, h = 600) {
  if (!raw) return emptyLayers(w, h);
  if (raw.schemaVersion === 2) {
    return {
      ...emptyLayers(w, h),
      ...raw,
      paths: raw.paths ?? raw.strokes ?? [],
      notes: raw.notes ?? raw.textMemos ?? [],
    };
  }
  if (raw.version === 1) {
    return {
      schemaVersion: SCHEMA_VERSION,
      drawingVersion: DRAWING_VERSION,
      canvasWidth: w,
      canvasHeight: h,
      paths: (raw.strokes ?? []).map((s) => ({
        ...s,
        lineType: s.lineType || "generic",
        lengthPx: pathLength(s.points),
      })),
      symbols: (raw.symbols ?? []).map((s) => ({ ...s, scale: s.scale || 1 })),
      notes: raw.textMemos ?? [],
      viewport: raw.viewport ?? { scale: 1, offsetX: 0, offsetY: 0 },
    };
  }
  return emptyLayers(w, h);
}

function pathLength(points) {
  if (!points || points.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return Math.round(len * 100) / 100;
}

const initialIds = resolveDrawingIds({
  projectId: params().get("projectId") || params().get("project") || "",
  sketchId: params().get("sketchId") || "",
  siteId: params().get("siteId") || "",
  customerId: params().get("customerId") || "",
});
let sketchId = initialIds.sketchId;
let projectId = initialIds.projectId;
let siteId = initialIds.siteId;
let customerId = initialIds.customerId;
let isTempMode = initialIds.isTempMode;
let isLocalOnlyMode = initialIds.isLocalOnly;
function drawingUrlQuery() {
  const q = new URLSearchParams();
  if (sketchId) q.set("sketchId", sketchId);
  if (projectId) q.set("projectId", projectId);
  if (siteId) q.set("siteId", siteId);
  if (customerId) q.set("customerId", customerId);
  return q.toString();
}

function surveyBackUrl() {
  if (!projectId) return "/survey-v1";
  const q = new URLSearchParams({ projectId });
  if (siteId) q.set("siteId", siteId);
  if (customerId) q.set("customerId", customerId);
  return `/survey-v1?${q}`;
}
let estimateDraftId = null;
let estimateDraftStatus = null;
let estimatePreviewSummary = null;
let sketch = null;
let tool = "pen";
let strokeColor = "#dc2626";
let strokeWidth = 3;
let lineType = "generic";
let viewport = { scale: 1, offsetX: 0, offsetY: 0 };
let layers = emptyLayers();
let symbolPalette = [];
let lineTypePalette = [];
let pendingSymbol = null;
let currentStroke = null;
let panStart = null;
let stageSize = { w: 800, h: 600 };
let saveTimer = null;
let dirty = false;
let selectedSymbolId = null;
let dragSymbol = null;
/** @type {ReturnType<typeof initDrawingEditorFoundationV1>|null} */
let drawingEditorState = null;

function applyViewportTransform() {
  const stage = $("drawing-stage");
  if (!stage) return;
  stage.style.transform = `translate(calc(-50% + ${viewport.offsetX}px), calc(-50% + ${viewport.offsetY}px)) scale(${viewport.scale})`;
}

function syncGridStageSize() {
  const stage = $("drawing-stage");
  const wrap = $("drawing-stage-wrap");
  const ph = $("drawing-bg-placeholder");
  if (!stage?.classList.contains("drawing-grid-paper") || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(240, Math.floor(rect.height));
  stageSize = { w, h };
  layers.canvasWidth = w;
  layers.canvasHeight = h;
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  if (ph) {
    ph.style.width = "100%";
    ph.style.height = "100%";
    ph.style.minHeight = "100%";
    ph.style.maxWidth = "none";
    ph.style.border = "none";
    ph.style.borderRadius = "0";
    ph.style.boxSizing = "border-box";
    ph.style.margin = "0";
  }
  applyViewportTransform();
  renderAll();
}

function imageCoords(clientX, clientY) {
  const stage = $("drawing-stage");
  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left) / viewport.scale;
  const y = (clientY - rect.top) / viewport.scale;
  return { x, y };
}

function pathColor(p) {
  if (p.lineType && p.lineType !== "generic") return LINE_TYPE_COLORS[p.lineType] || p.color;
  return p.color;
}

function renderPaths() {
  const svg = $("drawing-svg");
  if (!svg) return;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${stageSize.w} ${stageSize.h}`);
  svg.setAttribute("width", String(stageSize.w));
  svg.setAttribute("height", String(stageSize.h));
  for (const p of layers.paths) {
    if (!p.points?.length) continue;
    const color = pathColor(p);
    const dash = LINE_TYPE_DASH[p.lineType] || undefined;
    if ((p.tool === "line" || p.tool === "route") && p.points.length >= 2) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", p.points[0].x);
      line.setAttribute("y1", p.points[0].y);
      line.setAttribute("x2", p.points[p.points.length - 1].x);
      line.setAttribute("y2", p.points[p.points.length - 1].y);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", p.width);
      line.setAttribute("stroke-linecap", "round");
      if (dash) line.setAttribute("stroke-dasharray", dash);
      svg.appendChild(line);
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = p.points.map((pt, i) => `${i ? "L" : "M"}${pt.x} ${pt.y}`).join(" ");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", p.width);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      if (dash) path.setAttribute("stroke-dasharray", dash);
      svg.appendChild(path);
    }
  }
}

function symbolDef(sym) {
  return symbolPalette.find((s) => s.symbolType === sym.symbolType) || sym;
}

function renderSymbolSvg(sym) {
  const def = symbolDef(sym);
  const svg = def.svg || "";
  if (svg) {
    const wrap = document.createElement("span");
    wrap.className = "sym-svg";
    wrap.style.color = sym.color || def.color || "#2563eb";
    wrap.innerHTML = svg;
    return wrap;
  }
  const span = document.createElement("span");
  span.textContent = sym.icon || "📍";
  span.style.fontSize = "1.5rem";
  return span;
}

function updateSymbolInspector() {
  const panel = $("symbol-inspector");
  const label = $("symbol-inspector-label");
  if (!panel) return;
  const sym = layers.symbols.find((s) => s.id === selectedSymbolId);
  if (!sym) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  if (label) label.textContent = sym.label || sym.symbolType;
}

function selectSymbol(id) {
  selectedSymbolId = id;
  updateSymbolInspector();
  renderOverlay();
}

function renderOverlay() {
  const mount = $("drawing-overlay");
  if (!mount) return;
  mount.innerHTML = "";
  for (const sym of layers.symbols) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "drawing-symbol";
    if (sym.id === selectedSymbolId) el.classList.add("selected");
    el.style.left = `${sym.x}px`;
    el.style.top = `${sym.y}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${sym.rotation || 0}deg) scale(${sym.scale || 1})`;
    el.title = sym.label;
    el.dataset.symbolId = sym.id;
    el.appendChild(renderSymbolSvg(sym));

    el.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      if (tool === "select" || tool === "symbol") {
        selectSymbol(sym.id);
        dragSymbol = { id: sym.id, startX: ev.clientX, startY: ev.clientY, origX: sym.x, origY: sym.y };
        el.setPointerCapture?.(ev.pointerId);
      }
    });
    el.addEventListener("pointermove", (ev) => {
      if (!dragSymbol || dragSymbol.id !== sym.id) return;
      ev.stopPropagation();
      const dx = (ev.clientX - dragSymbol.startX) / viewport.scale;
      const dy = (ev.clientY - dragSymbol.startY) / viewport.scale;
      sym.x = dragSymbol.origX + dx;
      sym.y = dragSymbol.origY + dy;
      el.style.left = `${sym.x}px`;
      el.style.top = `${sym.y}px`;
    });
    el.addEventListener("pointerup", (ev) => {
      if (dragSymbol?.id === sym.id) {
        dragSymbol = null;
        markDirty();
      }
      ev.stopPropagation();
    });
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (tool === "select") {
        selectSymbol(sym.id);
        return;
      }
      const memo = prompt("記号メモ（任意）", sym.memo || "");
      if (memo != null) {
        sym.memo = memo;
        markDirty();
      }
    });
    mount.appendChild(el);
  }
  for (const m of layers.notes) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "drawing-memo";
    el.style.left = `${m.x}px`;
    el.style.top = `${m.y}px`;
    el.style.fontSize = `${m.fontSize || 14}px`;
    el.style.color = m.color || "#0f172a";
    el.textContent = m.text;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const next = prompt("メモを編集", m.text);
      if (next != null && next.trim()) {
        m.text = next.trim();
        markDirty();
        renderOverlay();
      }
    });
    mount.appendChild(el);
  }
}

function renderAll() {
  renderPaths();
  renderOverlay();
  applyViewportTransform();
}

function markDirty() {
  dirty = true;
  setStatus("未保存の変更があります");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSketch().catch(() => {}), 2000);
}

function prepareLayersForSave() {
  layers.viewport = { scale: viewport.scale, offsetX: viewport.offsetX, offsetY: viewport.offsetY };
  layers.canvasWidth = stageSize.w;
  layers.canvasHeight = stageSize.h;
  layers.paths = layers.paths.map((p) => ({
    ...p,
    lengthPx: pathLength(p.points),
  }));
  if (drawingEditorState) {
    layers.editorV1 = editorStateToLayerV1(drawingEditorState);
  }
}

function restoreDrawingEditorFromLayers() {
  if (!drawingEditorState) return;
  const payload = editorV1LayerToPayload(layers.editorV1);
  if (payload) {
    applyDrawingEditorPayloadClientV1(drawingEditorState, payload);
  } else if (sketch?.backgroundImageUrl) {
    drawingEditorState.canvas.setBackgroundUrl(sketch.backgroundImageUrl);
  }
}

function photoRefsFromSketch() {
  if (!sketch?.backgroundImageUrl) return [];
  return [{ url: sketch.backgroundImageUrl, path: sketch.backgroundImagePath || null }];
}

function saveSketchLocal() {
  prepareLayersForSave();
  const payload = buildLocalDrawingPayload({
    projectId,
    sketchId,
    siteId,
    customerId,
    layers,
    photoRefs: photoRefsFromSketch(),
  });
  saveDrawingToLocalStorage(projectId, sketchId, payload);
  dirty = false;
  setStatus(`端末内に保存しました ${new Date().toLocaleTimeString("ja-JP")}`);
  return payload;
}

async function saveSketch() {
  if (!sketchId) return;
  prepareLayersForSave();

  if (isLocalOnlyMode || isTempDrawingId(sketchId)) {
    saveSketchLocal();
    return;
  }

  const patchPayload = {
    sketchId,
    projectId,
    layers,
    title: sketch?.title,
  };

  if (!isNetworkOnlineV1()) {
    saveSketchLocal();
    enqueueOfflineResilienceV1("drawing_sketch_patch", patchPayload);
    setStatus("オフライン — 端末内保存（復帰後に自動同期）");
    return;
  }

  try {
    const data = await api("PATCH", `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}`, {
      layers,
      title: sketch?.title,
    });
    sketch = data.sketch;
    layers = migrateLayers(sketch.layers, stageSize.w, stageSize.h);
    dirty = false;
    setStatus(`サーバーに保存しました ${new Date().toLocaleTimeString("ja-JP")}`);
    saveDrawingToLocalStorage(
      projectId,
      sketchId,
      buildLocalDrawingPayload({
        projectId,
        sketchId,
        siteId,
        customerId,
        layers,
        photoRefs: photoRefsFromSketch(),
      })
    );
  } catch (e) {
    saveSketchLocal();
    enqueueOfflineResilienceV1("drawing_sketch_patch", patchPayload);
    const hint = e.message === "offline" ? "オフライン" : e.message || "失敗";
    setStatus(`端末内に保存しました（${hint} · 復帰後に再送）`);
  }
}

function setTool(next) {
  tool = next;
  pendingSymbol = null;
  if (next !== "select") selectedSymbolId = null;
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === next);
  });
  $("symbol-palette")?.classList.toggle("hidden", next !== "symbol");
  $("line-type-palette")?.classList.toggle("hidden", next !== "route");
  updateSymbolInspector();
  if (next !== "select") renderOverlay();
}

function onPointerDown(ev) {
  if (drawingEditorState?.canvas?.isRouteMode?.()) return;
  if (ev.target.closest?.(".drawing-symbol, .drawing-memo")) return;
  if (ev.pointerType === "touch" && ev.isPrimary === false) return;
  const wrap = $("drawing-stage-wrap");
  wrap?.setPointerCapture?.(ev.pointerId);
  const pt = imageCoords(ev.clientX, ev.clientY);

  if (tool === "pan") {
    panStart = { x: ev.clientX - viewport.offsetX, y: ev.clientY - viewport.offsetY };
    return;
  }
  if (tool === "select") {
    selectedSymbolId = null;
    updateSymbolInspector();
    renderOverlay();
    return;
  }
  if (tool === "symbol" && pendingSymbol) {
    layers.symbols.push({
      id: uid(),
      symbolType: pendingSymbol.symbolType,
      label: pendingSymbol.label,
      icon: pendingSymbol.icon,
      svg: pendingSymbol.svg,
      color: pendingSymbol.color,
      x: pt.x,
      y: pt.y,
      rotation: 0,
      scale: 1,
      memo: "",
    });
    markDirty();
    renderOverlay();
    return;
  }
  if (tool === "text") {
    const text = prompt("テキストメモ");
    if (text?.trim()) {
      layers.notes.push({
        id: uid(),
        text: text.trim(),
        x: pt.x,
        y: pt.y,
        fontSize: 14,
        color: strokeColor,
      });
      markDirty();
      renderOverlay();
    }
    return;
  }
  if (tool === "pen" || tool === "line" || tool === "route") {
    const lt = tool === "route" ? lineType : "generic";
    const color = lt !== "generic" ? LINE_TYPE_COLORS[lt] : strokeColor;
    currentStroke = {
      id: uid(),
      tool: tool === "pen" ? "pen" : tool === "route" ? "route" : "line",
      lineType: lt,
      color,
      width: strokeWidth,
      points: [pt],
      lengthPx: 0,
    };
  }
}

function onPointerMove(ev) {
  if (tool === "pan" && panStart) {
    viewport.offsetX = ev.clientX - panStart.x;
    viewport.offsetY = ev.clientY - panStart.y;
    applyViewportTransform();
    return;
  }
  if (!currentStroke) return;
  const pt = imageCoords(ev.clientX, ev.clientY);
  if (currentStroke.tool === "line" || currentStroke.tool === "route") {
    currentStroke.points = [currentStroke.points[0], pt];
  } else {
    currentStroke.points.push(pt);
  }
  const temp = [...layers.paths, currentStroke];
  const prev = layers.paths;
  layers.paths = temp;
  renderPaths();
  layers.paths = prev;
}

function onPointerUp() {
  panStart = null;
  if (currentStroke) {
    const minPts = currentStroke.tool === "pen" ? 1 : 2;
    if (currentStroke.points.length >= minPts) {
      currentStroke.lengthPx = pathLength(currentStroke.points);
      layers.paths.push(currentStroke);
      markDirty();
    }
    currentStroke = null;
    renderPaths();
  }
}

function zoomBy(factor) {
  viewport.scale = Math.min(6, Math.max(0.25, viewport.scale * factor));
  applyViewportTransform();
  markDirty();
}

function setupBgImage(url) {
  const img = $("drawing-bg");
  const ph = $("drawing-bg-placeholder");
  if (!img) return;
  img.onload = () => {
    stageSize = { w: img.naturalWidth || 800, h: img.naturalHeight || 600 };
    layers.canvasWidth = stageSize.w;
    layers.canvasHeight = stageSize.h;
    img.classList.remove("hidden");
    ph?.classList.add("hidden");
    renderAll();
    markDirty();
  };
  img.src = url;
  if (img.complete) img.onload?.();
}

function showTempBanner() {
  let bar = document.getElementById("drawing-temp-banner");
  if (!bar) {
    bar = document.createElement("p");
    bar.id = "drawing-temp-banner";
    bar.className = "drawing-temp-banner";
    bar.setAttribute("role", "status");
    const toolbar = $("drawing-toolbar");
    toolbar?.parentNode?.insertBefore(bar, toolbar.nextSibling);
  }
  bar.textContent = SURVEY_DRAWING_TEMP_BANNER;
  bar.classList.toggle("hidden", !isTempMode);
}

function applyGridPaper() {
  const stage = $("drawing-stage");
  const ph = $("drawing-bg-placeholder");
  stage?.classList.add("drawing-grid-paper");
  ph?.classList.remove("hidden");
  ph.textContent = "方眼紙モード — 全面を描画できます";
  syncGridStageSize();
}

function loadSketchFromLocal() {
  const saved = loadDrawingFromLocalStorage(projectId, sketchId);
  if (!saved) return false;
  layers = migrateLayers(saved.layers || saved, saved.layers?.canvasWidth, saved.layers?.canvasHeight);
  if (saved.lines?.length && !layers.paths?.length) {
    layers.paths = saved.lines;
  }
  if (saved.symbols?.length && !layers.symbols?.length) {
    layers.symbols = saved.symbols;
  }
  if (saved.memos?.length && !layers.notes?.length) {
    layers.notes = saved.memos;
  }
  return true;
}

async function loadSketch() {
  if (isLocalOnlyMode) {
    sketch = { id: sketchId, projectId, title: "一時図面", layers: emptyLayers() };
    if (!loadSketchFromLocal()) {
      layers = emptyLayers(800, 600);
    }
    viewport = { scale: 1, offsetX: 0, offsetY: 0, ...layers.viewport };
    $("drawing-title").textContent = "一時図面";
    showTempBanner();
    applyGridPaper();
    updateDrawingPdfBar();
    return;
  }

  if (!sketchId && projectId && !isTempDrawingId(projectId)) {
    const created = await api("POST", `/api/survey/v1/projects/${encodeURIComponent(projectId)}/drawing-sketches`, {
      title: "現調図面",
    });
    sketch = created.sketch;
    sketchId = sketch.id;
    isTempMode = false;
  } else if (sketchId && !isTempDrawingId(sketchId)) {
    try {
      const data = await api("GET", `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}`);
      sketch = data.sketch;
      projectId = sketch.projectId;
    } catch (e) {
      if (loadSketchFromLocal()) {
        sketch = { id: sketchId, projectId, title: "現調図面（端末内）", layers };
        isLocalOnlyMode = true;
        isTempMode = true;
        showTempBanner();
        applyGridPaper();
        updateDrawingPdfBar();
        return;
      }
      throw e;
    }
  } else {
    sketch = { id: sketchId, projectId, title: "一時図面", layers: emptyLayers() };
    loadSketchFromLocal();
    showTempBanner();
    applyGridPaper();
    updateDrawingPdfBar();
    return;
  }

  layers = migrateLayers(sketch.layers, sketch.layers?.canvasWidth, sketch.layers?.canvasHeight);
  viewport = { scale: 1, offsetX: 0, offsetY: 0, ...layers.viewport };
  $("drawing-title").textContent = sketch.title || "現調図面";
  if (sketch.backgroundImageUrl) setupBgImage(sketch.backgroundImageUrl);
  else {
    stageSize = { w: layers.canvasWidth || 800, h: layers.canvasHeight || 600 };
    applyGridPaper();
  }
  loadSketchFromLocal();
  await loadSpecPhotoSlotsForDrawing();
  updateDrawingPdfBar();
}

function toastDrawingPdf(msg) {
  setStatus(msg);
}

function updateDrawingPdfBar() {
  const bar = $("drawing-pdf-bar");
  if (!bar) return;
  if (sketch?.businessProjectId) bar.classList.remove("hidden");
  else bar.classList.add("hidden");
}

function drawingReturnPath() {
  return window.location.pathname + window.location.search;
}

function wireDrawingPdfEvents() {
  const bizId = () => sketch?.businessProjectId;
  $("btn-drawing-pdf-create")?.addEventListener("click", () => {
    if (!bizId()) return setStatus("見積送り後にPDFを作成できます");
    openSpecificationPreview(bizId(), drawingReturnPath());
  });
  $("btn-drawing-pdf-preview")?.addEventListener("click", () => {
    if (!bizId()) return;
    openSpecificationPreview(bizId(), drawingReturnPath());
  });
  $("btn-drawing-pdf-save")?.addEventListener("click", async () => {
    if (!bizId()) return;
    try {
      await saveSpecificationPdf(bizId(), "仕様書.pdf", toastDrawingPdf);
    } catch (e) {
      setStatus(e.message || "PDF保存に失敗しました");
    }
  });
  $("btn-drawing-pdf-share")?.addEventListener("click", async () => {
    if (!bizId()) return;
    try {
      await shareSpecificationPdf(bizId(), "仕様書.pdf", toastDrawingPdf);
    } catch (e) {
      if (e?.name !== "AbortError") setStatus(e.message || "共有に失敗しました");
    }
  });
  $("btn-drawing-pdf-redo")?.addEventListener("click", async () => {
    if (!bizId()) return;
    if (!confirm("仕様書PDFを再作成しますか？")) return;
    try {
      await regenerateSpecificationPdf(bizId(), toastDrawingPdf);
    } catch (e) {
      setStatus(e.message || "PDF再作成に失敗しました");
    }
  });
}

async function loadLineTypes() {
  const data = await api("GET", "/api/survey/v1/drawing-sketches/line-types");
  lineTypePalette = data.lineTypes || [];
  const mount = $("line-type-palette");
  if (!mount) return;
  mount.innerHTML = lineTypePalette
    .map(
      (lt) =>
        `<button type="button" data-line-type="${lt.id}" style="border-color:${lt.color};color:${lt.color}" title="${lt.label}">${lt.label}</button>`
    )
    .join("");
  mount.querySelectorAll("[data-line-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      lineType = btn.dataset.lineType;
      mount.querySelectorAll("[data-line-type]").forEach((b) => b.classList.toggle("active", b === btn));
      setStatus(`線種: ${btn.textContent} — 始点と終点をタップ`);
    });
  });
  const first = mount.querySelector("[data-line-type]");
  if (first) {
    lineType = first.dataset.lineType;
    first.classList.add("active");
  }
}

async function loadSymbols() {
  const data = await api("GET", "/api/survey/v1/drawing-sketches/symbols");
  symbolPalette = data.symbols || [];
  const mount = $("symbol-palette");
  if (!mount) return;
  mount.innerHTML = symbolPalette
    .map((s) => {
      const svgHtml = s.svg
        ? `<span class="sym-svg" style="color:${s.color}">${s.svg}</span>`
        : `<span>${s.icon}</span>`;
      return `<button type="button" data-symbol="${s.symbolType}" title="${s.label}">${svgHtml}<span>${s.label}</span></button>`;
    })
    .join("");
  mount.querySelectorAll("[data-symbol]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mount.querySelectorAll("[data-symbol]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sym = symbolPalette.find((x) => x.symbolType === btn.dataset.symbol);
      pendingSymbol = sym;
      setStatus(`${sym?.label} — 図面上をタップして配置`);
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function importBackground(file) {
  const imageBase64 = await fileToBase64(file);
  if (isLocalOnlyMode || isTempDrawingId(sketchId)) {
    setupBgImage(imageBase64);
    if (!sketch) sketch = { id: sketchId, projectId, title: "一時図面" };
    sketch.backgroundImageUrl = imageBase64;
    markDirty();
    setStatus("背景写真を取り込みました（端末内保存）");
    return;
  }
  const bgPayload = {
    sketchId,
    imageBase64,
    fileName: file.name,
    mimeType: file.type,
  };

  if (!isNetworkOnlineV1()) {
    setupBgImage(imageBase64);
    if (!sketch) sketch = { id: sketchId, projectId, title: "一時図面" };
    sketch.backgroundImageUrl = imageBase64;
    markDirty();
    enqueueOfflineResilienceV1("drawing_background", bgPayload);
    setStatus("オフライン — 背景を端末内保存（復帰後に自動同期）");
    return;
  }

  try {
    const data = await api(
      "POST",
      `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}/background`,
      { imageBase64, fileName: file.name, mimeType: file.type }
    );
    sketch = data.sketch;
    setupBgImage(sketch.backgroundImageUrl);
    setStatus("背景写真を取り込みました");
    await loadSpecPhotoSlotsForDrawing();
  } catch (e) {
    setupBgImage(imageBase64);
    if (!sketch) sketch = { id: sketchId, projectId, title: "一時図面" };
    sketch.backgroundImageUrl = imageBase64;
    markDirty();
    enqueueOfflineResilienceV1("drawing_background", bgPayload);
    const hint = e.message === "offline" ? "オフライン" : e.message || "失敗";
    setStatus(`端末内に保存しました（背景 · ${hint} · 復帰後に再送）`);
  }
}

async function loadSpecPhotoSlotsForDrawing() {
  const bar = $("spec-photo-link-bar");
  const sel = $("spec-photo-slot-select");
  const btn = $("btn-spec-photo-link");
  if (!bar || !sel || !sketch?.businessProjectId || !sketch?.backgroundImagePath) {
    bar?.classList.add("hidden");
    return;
  }
  try {
    const res = await fetch(
      `/api/project-automation/v1/projects/${encodeURIComponent(sketch.businessProjectId)}`,
      { headers: apiHeaders() }
    );
    const data = await res.json().catch(() => ({}));
    const slots = data.specPhotos ?? [];
    if (!slots.length) {
      bar.classList.add("hidden");
      return;
    }
    bar.classList.remove("hidden");
    sel.innerHTML = [`<option value="">— 選択 —</option>`]
      .concat(
        slots.map(
          (s) =>
            `<option value="${s.id}">${s.label}${s.shot ? "（撮影済・上書き）" : ""}</option>`
        )
      )
      .join("");
    sel.onchange = () => {
      if (btn) btn.disabled = !sel.value;
    };
  } catch {
    bar.classList.add("hidden");
  }
}

async function linkBackgroundToSpecSlot() {
  const slotId = $("spec-photo-slot-select")?.value;
  if (!slotId || !sketchId) return;
  await api("POST", `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}/link-spec-photo`, {
    specPhotoSlotId: slotId,
  });
  setStatus("仕様書写真スロットへ紐付けました");
  await loadSpecPhotoSlotsForDrawing();
}

async function exportAiJson() {
  if (!sketchId) return;
  await saveSketch().catch(() => {});
  const data = await api("GET", `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}/ai-export`);
  const payload = data.export;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `survey-drawing-ai-${sketchId.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("AI清書用JSONをダウンロードしました");
}

async function masterApi(path, opts = {}) {
  const res = await fetch(`/api/master/v1${path}`, {
    ...opts,
    headers: { ...apiHeaders(), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
}

function customerCodeFromSession() {
  return sessionStorage.getItem("tisly_customer_code") || "TOMS001";
}

function renderEstimateBar() {
  const bar = $("drawing-estimate-bar");
  const summary = $("drawing-estimate-summary");
  if (!bar || !summary) return;
  if (!sketchId) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const applied = estimateDraftStatus === "applied";
  const priceText = estimatePreviewSummary
    ? `売価 ¥${Number(estimatePreviewSummary.totalSell || 0).toLocaleString("ja-JP")} / 粗利 ${estimatePreviewSummary.grossProfitRate || 0}%`
    : "";
  summary.textContent = estimateDraftId
    ? `${applied ? "反映済み" : "draft作成済み"} (${estimateDraftId.slice(0, 8)}…) ${priceText}`
    : "見積候補未作成";
  $("btn-est-apply").disabled = !estimateDraftId || applied;
  $("btn-est-open").disabled = !estimateDraftId;
}

async function refreshEstimateDraftState() {
  if (!sketchId) return;
  try {
    const res = await masterApi(`/estimate-drafts/by-sketch/${encodeURIComponent(sketchId)}`);
    estimateDraftId = res.draft?.id || null;
    estimateDraftStatus = res.draft?.status || null;
    estimatePreviewSummary = res.pricingSummary || null;
  } catch {
    estimateDraftId = null;
    estimateDraftStatus = null;
    estimatePreviewSummary = null;
  }
  renderEstimateBar();
}

async function createEstimateDraftFromDrawing() {
  if (!sketchId) return;
  await saveSketch();
  const preview = await masterApi(`/estimate-preview?sketchId=${encodeURIComponent(sketchId)}`);
  const res = await masterApi("/estimate-preview/apply", {
    method: "POST",
    body: JSON.stringify({ sketchId, projectId, preview }),
  });
  estimateDraftId = res.draft.id;
  estimateDraftStatus = res.draft.status;
  estimatePreviewSummary = {
    totalSell: preview.totalSell,
    grossProfitRate: preview.grossProfitRate,
  };
  renderEstimateBar();
  setStatus("見積候補 draft を保存しました");
}

async function applyEstimateDraftFromDrawing() {
  if (!estimateDraftId) return;
  const res = await masterApi(`/estimate-drafts/${encodeURIComponent(estimateDraftId)}/apply-to-estimate`, {
    method: "POST",
    body: "{}",
  });
  estimateDraftStatus = "applied";
  renderEstimateBar();
  setStatus("見積PWAへ反映しました");
  if (res.estimateUrl) {
    setTimeout(() => {
      if (confirm("見積PWAで開きますか？")) location.href = res.estimateUrl;
    }, 250);
  }
}

function openEstimatePwaFromDrawing() {
  if (!estimateDraftId) return;
  location.href = `/estimate-v1?masterDraftId=${encodeURIComponent(estimateDraftId)}`;
}

function wireEstimateEvents() {
  $("btn-est-create")?.addEventListener("click", () =>
    createEstimateDraftFromDrawing().catch((e) => setStatus(e.message))
  );
  $("btn-est-apply")?.addEventListener("click", () =>
    applyEstimateDraftFromDrawing().catch((e) => setStatus(e.message))
  );
  $("btn-est-open")?.addEventListener("click", openEstimatePwaFromDrawing);
}

function rotateSelectedSymbol(delta) {
  const sym = layers.symbols.find((s) => s.id === selectedSymbolId);
  if (!sym) return;
  sym.rotation = ((sym.rotation || 0) + delta + 360) % 360;
  markDirty();
  renderOverlay();
}

function deleteSelectedSymbol() {
  if (!selectedSymbolId) return;
  if (!confirm("選択した記号を削除しますか？")) return;
  layers.symbols = layers.symbols.filter((s) => s.id !== selectedSymbolId);
  selectedSymbolId = null;
  updateSymbolInspector();
  markDirty();
  renderOverlay();
}

function wireEvents() {
  const wrap = $("drawing-stage-wrap");
  wrap?.addEventListener("pointerdown", onPointerDown);
  wrap?.addEventListener("pointermove", onPointerMove);
  wrap?.addEventListener("pointerup", onPointerUp);
  wrap?.addEventListener("pointercancel", onPointerUp);

  wrap?.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9);
    },
    { passive: false }
  );

  let lastDist = 0;
  wrap?.addEventListener("touchstart", (ev) => {
    if (ev.touches.length === 2) {
      const dx = ev.touches[0].clientX - ev.touches[1].clientX;
      const dy = ev.touches[0].clientY - ev.touches[1].clientY;
      lastDist = Math.hypot(dx, dy);
    }
  });
  wrap?.addEventListener(
    "touchmove",
    (ev) => {
      if (ev.touches.length === 2) {
        ev.preventDefault();
        const dx = ev.touches[0].clientX - ev.touches[1].clientX;
        const dy = ev.touches[0].clientY - ev.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastDist > 0) zoomBy(dist / lastDist);
        lastDist = dist;
      }
    },
    { passive: false }
  );

  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  $("btn-zoom-in")?.addEventListener("click", () => zoomBy(1.2));
  $("btn-zoom-out")?.addEventListener("click", () => zoomBy(1 / 1.2));
  $("btn-zoom-reset")?.addEventListener("click", () => {
    viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    applyViewportTransform();
    markDirty();
  });

  $("stroke-color")?.addEventListener("input", (ev) => {
    strokeColor = ev.target.value;
  });

  $("btn-save")?.addEventListener("click", () => saveSketch().catch((e) => setStatus(e.message)));
  $("btn-ai-export")?.addEventListener("click", () => exportAiJson().catch((e) => setStatus(e.message)));
  $("btn-back")?.addEventListener("click", () => {
    if (dirty && !confirm("未保存の変更があります。戻りますか？")) return;
    if (navigatePracticalReturn(() => {})) return;
    if (isLocalOnlyMode || isTempDrawingId(projectId)) {
      navigateTo("/survey-v1", { record: false });
      return;
    }
    if (projectId) navigateTo(surveyBackUrl(), { record: false });
    else navigateBackOne("/survey-v1");
  });

  $("btn-import-photo")?.addEventListener("click", () => $("file-bg")?.click());
  $("btn-spec-photo-link")?.addEventListener("click", () => {
    linkBackgroundToSpecSlot().catch((e) => setStatus(e.message));
  });
  $("file-bg")?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      await importBackground(file);
    } catch (e) {
      setStatus(e.message);
    }
    ev.target.value = "";
  });

  $("btn-symbol-rotate-left")?.addEventListener("click", () => rotateSelectedSymbol(-15));
  $("btn-symbol-rotate-right")?.addEventListener("click", () => rotateSelectedSymbol(15));
  $("btn-symbol-delete")?.addEventListener("click", () => deleteSelectedSymbol());

  wireEstimateEvents();
  wireDrawingPdfEvents();

  window.addEventListener("resize", () => syncGridStageSize());

  window.addEventListener("beforeunload", (ev) => {
    if (dirty) ev.preventDefault();
  });

  bindOfflineResilienceAutoSyncV1(processOfflineResilienceEntry, {
    onFlushed: (r) => {
      if (r.flushed > 0) {
        setStatus(`未同期 ${r.flushed} 件をサーバーへ反映しました`);
      }
    },
  });
  updateOfflineResilienceBadgeV1("drawing-offline-badge");
}

async function main() {
  if (!sessionStorage.getItem(TOKEN_KEY)) {
    location.href = surveyBackUrl();
    return;
  }
  wireEvents();
  await Promise.all([loadSymbols(), loadLineTypes()]);
  await loadSketch();
  await refreshEstimateDraftState();
  drawingEditorState = initDrawingEditorFoundationV1({
    onStatus: setStatus,
    initialPayload: editorV1LayerToPayload(layers.editorV1),
    onPayloadChange: () => markDirty(),
  });
  restoreDrawingEditorFromLayers();
  setStatus("描画できます（指・タッチペン · 通線ルート対応）");
}

main().catch((e) => setStatus(`エラー: ${e.message}`));
