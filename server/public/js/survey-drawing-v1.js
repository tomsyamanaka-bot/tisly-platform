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

export const SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v17";
/** タッチ配置時に指で隠れないよう上へずらす（画面px） */
const PLOT_TOUCH_OFFSET_Y = 32;
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
import { initPracticalNav } from "./tisly-practical-nav.js";
import {
  initDrawingEditorFoundationV1,
  editorStateToLayerV1,
  editorV1LayerToPayload,
  applyDrawingEditorPayloadClientV1,
} from "./features/drawing/drawing-editor-v1.js";
import {
  initDrawingFieldInnovationsV1,
  materialItemsToPreviewCandidates,
  updateMaterialBarVisibility,
} from "./features/drawing/drawing-field-innovations-v1.js";

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

/**
 * business 案件 ID が渡された場合は
 * 現調 projectId へ解決する
 */
async function resolveSurveyProjectIdIfNeeded() {
  if (!projectId || isTempDrawingId(projectId)) return;
  try {
    await api("GET", `/api/survey/v1/projects/${encodeURIComponent(projectId)}`);
    return;
  } catch {
    /* 現調 ID でない — business から逆引き */
  }
  try {
    const data = await api(
      "GET",
      `/api/project-mgmt/v1/projects/${encodeURIComponent(projectId)}`
    );
    const surveyId = data?.project?.surveyProjectId;
    if (surveyId && surveyId !== projectId) {
      projectId = surveyId;
    }
  } catch {
    /* 解決不能 — 以降の API でエラー表示 */
  }
}
let estimateDraftId = null;
let estimateDraftStatus = null;
let estimatePreviewSummary = null;
/** AI材料解析の候補（見積候補作成へ引き渡し） */
let aiMaterialCandidates = [];
/** @type {ReturnType<typeof initDrawingFieldInnovationsV1>|null} */
let fieldInnovations = null;
let sketch = null;
let tool = "pen";
let strokeColor = "#dc2626";
let strokeWidth = 3;
/** 消しゴムの線幅（手袋操作向けに太め） */
const ERASER_WIDTH = 14;
let lineType = "generic";
let viewport = { scale: 1, offsetX: 0, offsetY: 0 };
let layers = emptyLayers();
let symbolPalette = [];
let lineTypePalette = [];
let pendingSymbol = null;
let currentStroke = null;
let panStart = null;
/** @type {{ lastMid: {x:number,y:number}, lastDist: number }|null} */
let touchGesture = null;
let plotPreviewEl = null;
let toolStripCollapsed = false;
/** 写真ピッカー表示中 — 親ツール誤クローズ防止 */
let photoPickerOpen = false;
/** file input 起動時刻（キャンセル検知用） */
let photoPickerFileOpenedAt = 0;
let stageSize = { w: 800, h: 600 };
let saveTimer = null;
let dirty = false;
let selectedSymbolId = null;
let dragSymbol = null;
/** @type {ReturnType<typeof initDrawingEditorFoundationV1>|null} */
let drawingEditorState = null;
/** 描画Undo用 — paths のスナップショット */
let undoStack = [];
const UNDO_MAX = 40;

function applyViewportTransform() {
  const stage = $("drawing-stage");
  if (!stage) return;
  stage.style.transform = `translate(calc(-50% + ${viewport.offsetX}px), calc(-50% + ${viewport.offsetY}px)) scale(${viewport.scale})`;
}

function setGestureActive(active) {
  const stage = $("drawing-stage");
  if (stage) {
    if (active) stage.dataset.gestureActive = "1";
    else delete stage.dataset.gestureActive;
  }
}

function isGestureActive() {
  return !!touchGesture || $("drawing-stage")?.dataset.gestureActive === "1";
}

function touchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

/**
 * 指定点を中心にズーム（scale / translate 補正）
 * @param {number} factor
 * @param {number} clientX
 * @param {number} clientY
 */
function zoomAt(factor, clientX, clientY) {
  const wrap = $("drawing-stage-wrap");
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const mx = clientX - rect.left - rect.width / 2;
  const my = clientY - rect.top - rect.height / 2;
  const prevScale = viewport.scale;
  const nextScale = Math.min(6, Math.max(0.25, prevScale * factor));
  if (nextScale === prevScale) return;
  const ratio = nextScale / prevScale;
  viewport.offsetX = mx - (mx - viewport.offsetX) * ratio;
  viewport.offsetY = my - (my - viewport.offsetY) * ratio;
  viewport.scale = nextScale;
  applyViewportTransform();
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
  if (!stage) return { x: 0, y: 0 };
  // getBoundingClientRect は CSS transform
  // （scale / translate）適用後の表示矩形を返す
  const rect = stage.getBoundingClientRect();
  const w = stageSize.w || stage.clientWidth || rect.width || 1;
  const h = stageSize.h || stage.clientHeight || rect.height || 1;
  const rw = Math.max(rect.width, 1);
  const rh = Math.max(rect.height, 1);
  const x = ((clientX - rect.left) / rw) * w;
  const y = ((clientY - rect.top) / rh) * h;
  return {
    x: Math.min(w, Math.max(0, x)),
    y: Math.min(h, Math.max(0, y)),
  };
}

/** タッチ配置用 — 画面上方へオフセットしてから座標変換 */
function imageCoordsForPlot(clientX, clientY, pointerType) {
  const offsetY = pointerType === "touch" ? PLOT_TOUCH_OFFSET_Y : 0;
  return imageCoords(clientX, clientY - offsetY);
}

function ensurePlotPreview() {
  if (plotPreviewEl) return plotPreviewEl;
  const wrap = $("drawing-stage-wrap");
  if (!wrap) return null;
  plotPreviewEl = document.createElement("div");
  plotPreviewEl.id = "drawing-plot-preview";
  plotPreviewEl.className = "drawing-plot-preview hidden";
  plotPreviewEl.setAttribute("aria-hidden", "true");
  wrap.appendChild(plotPreviewEl);
  return plotPreviewEl;
}

function hidePlotPreview() {
  plotPreviewEl?.classList.add("hidden");
}

/**
 * 記号配置直後に
 * 選択メニューを自動で閉じる
 */
function closeSymbolMenusAfterPlot(label) {
  pendingSymbol = null;
  hidePlotPreview();
  $("symbol-palette")?.classList.add("hidden");
  $("symbol-palette")
    ?.querySelectorAll("[data-symbol]")
    .forEach((b) => b.classList.remove("active"));
  $("line-type-palette")?.classList.add("hidden");
  drawingEditorState?.palette?.clearAfterPlot?.();
  setTool("pen");
  setStatus(label ? `${label} を配置しました` : "記号を配置しました");
}

function updatePlotPreview(clientX, clientY) {
  if (tool !== "symbol" || !pendingSymbol) {
    hidePlotPreview();
    return;
  }
  const el = ensurePlotPreview();
  if (!el) return;
  const wrap = $("drawing-stage-wrap");
  const rect = wrap?.getBoundingClientRect();
  if (!rect) return;
  el.textContent = pendingSymbol.icon || "📍";
  el.style.left = `${clientX - rect.left}px`;
  el.style.top = `${clientY - rect.top - PLOT_TOUCH_OFFSET_Y}px`;
  el.classList.remove("hidden");
}

function applyToolStripCollapsed(collapsed) {
  toolStripCollapsed = collapsed;
  const strip = document.querySelector(".drawing-tool-strip");
  const btn = $("btn-toggle-tools");
  strip?.classList.toggle("collapsed", collapsed);
  btn?.classList.toggle("active", !collapsed);
  btn?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  try {
    localStorage.setItem("tisly_drawing_tools_collapsed_v1", collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function initToolStripCollapse() {
  let collapsed = window.matchMedia("(max-width: 767px)").matches;
  try {
    const saved = localStorage.getItem("tisly_drawing_tools_collapsed_v1");
    if (saved === "1") collapsed = true;
    if (saved === "0") collapsed = false;
  } catch {
    /* ignore */
  }
  applyToolStripCollapsed(collapsed);
}

function pathColor(p) {
  if (p.lineType && p.lineType !== "generic") return LINE_TYPE_COLORS[p.lineType] || p.color;
  return p.color;
}

/**
 * 1本のストロークを SVG 要素へ変換
 * @param {object} p
 */
function appendPathToSvg(parent, p) {
  if (!p.points?.length) return;
  const color = pathColor(p);
  const dash = LINE_TYPE_DASH[p.lineType] || undefined;
  const width = p.width || strokeWidth;
  if ((p.tool === "line" || p.tool === "route") && p.points.length >= 2) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p.points[0].x);
    line.setAttribute("y1", p.points[0].y);
    line.setAttribute("x2", p.points[p.points.length - 1].x);
    line.setAttribute("y2", p.points[p.points.length - 1].y);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", width);
    line.setAttribute("stroke-linecap", "round");
    if (dash) line.setAttribute("stroke-dasharray", dash);
    parent.appendChild(line);
    return;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = p.points.map((pt, i) => `${i ? "L" : "M"}${pt.x} ${pt.y}`).join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", width);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (dash) path.setAttribute("stroke-dasharray", dash);
  parent.appendChild(path);
}

const DRAW_MASK_ID = "drawing-draw-mask-v1";
const DRAW_DEFS_ID = "drawing-defs-v1";

/**
 * 手書きレイヤー用マスクを確保
 * （白=表示・黒=消去＝destination-out 相当）
 * @param {SVGSVGElement} svg
 * @param {number} w
 * @param {number} h
 */
function ensureDrawMask(svg, w, h) {
  let defs = svg.querySelector(`#${DRAW_DEFS_ID}`);
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.setAttribute("id", DRAW_DEFS_ID);
    svg.insertBefore(defs, svg.firstChild);
  }
  let mask = defs.querySelector(`#${DRAW_MASK_ID}`);
  if (!mask) {
    mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
    mask.setAttribute("id", DRAW_MASK_ID);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("maskContentUnits", "userSpaceOnUse");
    defs.appendChild(mask);
  }
  mask.setAttribute("x", "0");
  mask.setAttribute("y", "0");
  mask.setAttribute("width", String(w));
  mask.setAttribute("height", String(h));
  mask.innerHTML = "";
  const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  base.setAttribute("x", "0");
  base.setAttribute("y", "0");
  base.setAttribute("width", String(w));
  base.setAttribute("height", String(h));
  base.setAttribute("fill", "white");
  mask.appendChild(base);
  return mask;
}

/**
 * 消しゴム — マスク内に黒ストローク
 * （手書き線だけを透明化、方眼紙は無傷）
 * @param {SVGElement} parent
 * @param {object} p
 */
function appendEraserMaskStroke(parent, p) {
  if (!p.points?.length) return;
  const width = p.width || ERASER_WIDTH;
  if (p.points.length >= 2 && (p.tool === "line" || p.tool === "route")) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p.points[0].x);
    line.setAttribute("y1", p.points[0].y);
    line.setAttribute("x2", p.points[p.points.length - 1].x);
    line.setAttribute("y2", p.points[p.points.length - 1].y);
    line.setAttribute("stroke", "#000000");
    line.setAttribute("stroke-width", width);
    line.setAttribute("stroke-linecap", "round");
    parent.appendChild(line);
    return;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = p.points.map((pt, i) => `${i ? "L" : "M"}${pt.x} ${pt.y}`).join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#000000");
  path.setAttribute("stroke-width", width);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  parent.appendChild(path);
}

const PATH_ROOT_ID = "drawing-paths-root-v1";

/** 線描画専用グループ（エディタ SVG レイヤーを壊さない） */
function ensurePathsRoot(svg) {
  let root = svg.querySelector(`#${PATH_ROOT_ID}`);
  if (!root) {
    root = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.setAttribute("id", PATH_ROOT_ID);
    const routeLayer = svg.querySelector("#de-v1-route-layer");
    if (routeLayer) svg.insertBefore(root, routeLayer);
    else svg.appendChild(root);
  }
  return root;
}

function renderPaths() {
  const svg = $("drawing-svg");
  if (!svg) return;
  svg.setAttribute("viewBox", `0 0 ${stageSize.w} ${stageSize.h}`);
  svg.setAttribute("width", String(stageSize.w));
  svg.setAttribute("height", String(stageSize.h));

  const root = ensurePathsRoot(svg);
  root.innerHTML = "";

  const eraserPaths = layers.paths.filter((p) => p.tool === "eraser");
  const drawPaths = layers.paths.filter((p) => p.tool !== "eraser");

  if (eraserPaths.length) {
    const mask = ensureDrawMask(svg, stageSize.w, stageSize.h);
    for (const p of eraserPaths) appendEraserMaskStroke(mask, p);
  }

  const drawGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  drawGroup.setAttribute("class", "drawing-draw-layer");
  if (eraserPaths.length) {
    drawGroup.setAttribute("mask", `url(#${DRAW_MASK_ID})`);
  }
  for (const p of drawPaths) appendPathToSvg(drawGroup, p);
  root.appendChild(drawGroup);

  drawingEditorState?.canvas?.renderAll?.();
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
    if (m.voicePin) el.classList.add("voice-pin");
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

/** 線描画の直前状態を Undo 履歴へ積む */
function pushUndoSnapshot() {
  undoStack.push(JSON.stringify(layers.paths));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  updateUndoButton();
}

/** Undo ボタンの有効/無効を反映 */
function updateUndoButton() {
  const btn = $("btn-undo");
  if (!btn) return;
  btn.disabled = undoStack.length === 0;
}

/** 一つ前の描画状態へ戻す */
function undoLastStroke() {
  if (!undoStack.length) return;
  layers.paths = JSON.parse(undoStack.pop());
  updateUndoButton();
  markDirty();
  renderPaths();
  setStatus("元に戻しました");
}

function togglePhotoPicker(show) {
  const picker = $("drawing-photo-picker");
  if (!picker) return;
  photoPickerOpen = !!show;
  picker.classList.toggle("hidden", !show);
  picker.setAttribute("aria-hidden", show ? "false" : "true");
}

/** ピッカー内タップは子ボタンへ届け
   親トグルへの伝播だけ遮断 */
function wirePhotoPickerShell() {
  const picker = $("drawing-photo-picker");
  if (!picker) return;
  const stopBubble = (ev) => {
    ev.stopPropagation();
  };
  picker.addEventListener("pointerdown", stopBubble);
  picker.addEventListener("touchstart", stopBubble, { passive: false });
  picker.addEventListener("click", stopBubble);
}

/** 写真読み込み失敗を
   ステータスとモーダルで通知 */
function notifySurveyPhotoLoadError(fileName, detail) {
  const label = fileName || "写真";
  setStatus(`写真を読み込めません（${label}）`);
  const hint = detail || "別の写真でもう一度お試しください。";
  alert(`写真を読み込めません（${label}）\n${hint}`);
}

/** 写真選択後に背景へ取り込み
   メニューを閉じる */
async function handleSurveyFileSelected(ev) {
  const input = ev.target;
  const file = input?.files?.[0];
  photoPickerOpen = false;
  togglePhotoPicker(false);
  if (!file) return;
  try {
    if (!isLikelyImageFile(file)) {
      throw new Error("画像ファイルではありません");
    }
    setStatus("写真を読み込んでいます…");
    await importBackground(file);
  } catch (e) {
    console.error("[survey-drawing] photo import failed", e, file?.name);
    notifySurveyPhotoLoadError(file.name, e?.message);
  } finally {
    if (input) input.value = "";
  }
}

function wireSurveyFileInput() {
  const onCancel = () => {
    photoPickerOpen = false;
    togglePhotoPicker(false);
  };
  for (const id of ["survey-camera-input", "survey-album-input"]) {
    const input = $(id);
    input?.addEventListener("change", handleSurveyFileSelected);
    input?.addEventListener("cancel", onCancel);
  }
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

function hasBackgroundPhoto() {
  const img = $("drawing-bg");
  return !!(sketch?.backgroundImageUrl || (img && !img.classList.contains("hidden") && img.src));
}

function syncMaterialBarUi() {
  updateMaterialBarVisibility({ hasPhoto: hasBackgroundPhoto(), $ });
}

function photoRefsFromSketch() {
  if (!sketch?.backgroundImageUrl) return [];
  return [{ url: sketch.backgroundImageUrl, path: sketch.backgroundImagePath || null }];
}

/**
 * メニューボタンと専用 input を
 * 同一イベント内で直接 click 連動
 * @param {string} btnId
 * @param {string} inputId
 */
function bindPhotoTriggerButton(btnId, inputId) {
  const btn = $(btnId);
  const input = $(inputId);
  if (!btn || !input) return;
  const open = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    // iOS: 非同期を挟まず
    // 同一コールバック内で click
    try {
      input.value = "";
      photoPickerFileOpenedAt = Date.now();
      input.click();
    } catch (e) {
      setStatus(`写真選択を開けません: ${e?.message || e}`);
    }
  };
  btn.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length > 1) return;
      open(ev);
    },
    { passive: false }
  );
  btn.addEventListener("click", (ev) => {
    if (ev.pointerType === "touch") return;
    open(ev);
  });
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
      projectId,
    });
    sketch = data.sketch;
    projectId = sketch.projectId || projectId;
    layers = migrateLayers(sketch.layers, stageSize.w, stageSize.h);
    dirty = false;
    isLocalOnlyMode = false;
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

function addDrawingNote({ text, x, y, color, voicePin = false }) {
  layers.notes.push({
    id: uid(),
    text,
    x,
    y,
    fontSize: 14,
    color: color || strokeColor,
    voicePin,
  });
  markDirty();
  renderOverlay();
}

function setTool(next) {
  tool = next;
  pendingSymbol = null;
  if (next !== "symbol") hidePlotPreview();
  if (next !== "select") selectedSymbolId = null;
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === next);
  });
  $("symbol-palette")?.classList.toggle("hidden", next !== "symbol");
  $("line-type-palette")?.classList.toggle("hidden", next !== "route");
  updateSymbolInspector();
  if (next !== "select") renderOverlay();
  if (next === "voice-pin") {
    setStatus("🎤 音声ピン — 図面上をタップして話してください");
  }
}

function onPointerDown(ev) {
  if (drawingEditorState?.canvas?.isRouteMode?.()) return;
  if (isGestureActive()) return;
  if (ev.target.closest?.(".drawing-symbol, .drawing-memo")) return;
  if (ev.pointerType === "touch" && ev.isPrimary === false) return;
  ev.preventDefault();
  ev.stopPropagation();
  const wrap = $("drawing-stage-wrap");
  wrap?.setPointerCapture?.(ev.pointerId);
  const pt = imageCoordsForPlot(ev.clientX, ev.clientY, ev.pointerType);

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
    const placed = pendingSymbol;
    layers.symbols.push({
      id: uid(),
      symbolType: placed.symbolType,
      label: placed.label,
      icon: placed.icon,
      svg: placed.svg,
      color: placed.color,
      x: pt.x,
      y: pt.y,
      rotation: 0,
      scale: 1,
      memo: "",
    });
    markDirty();
    renderOverlay();
    fieldInnovations?.checkKnowledgeOnSymbol({
      label: placed.label,
      symbolType: placed.symbolType,
    });
    closeSymbolMenusAfterPlot(placed.label);
    return;
  }
  if (tool === "text") {
    const text = prompt("テキストメモ");
    if (text?.trim()) {
      addDrawingNote({
        text: text.trim(),
        x: pt.x,
        y: pt.y,
        color: strokeColor,
      });
    }
    return;
  }
  if (tool === "voice-pin") {
    fieldInnovations?.captureVoicePinAt({
      x: pt.x,
      y: pt.y,
      color: strokeColor,
    });
    return;
  }
  if (tool === "pen" || tool === "line" || tool === "route" || tool === "eraser") {
    const lt = tool === "route" ? lineType : "generic";
    const color = lt !== "generic" ? LINE_TYPE_COLORS[lt] : strokeColor;
    const isEraser = tool === "eraser";
    currentStroke = {
      id: uid(),
      tool: isEraser
        ? "eraser"
        : tool === "pen"
          ? "pen"
          : tool === "route"
            ? "route"
            : "line",
      lineType: lt,
      color: isEraser ? "transparent" : color,
      width: isEraser ? ERASER_WIDTH : strokeWidth,
      points: [pt],
      lengthPx: 0,
    };
  }
}

function onPointerMove(ev) {
  if (tool === "symbol" && pendingSymbol && !isGestureActive()) {
    updatePlotPreview(ev.clientX, ev.clientY);
  } else {
    hidePlotPreview();
  }
  if (tool === "pan" && panStart) {
    viewport.offsetX = ev.clientX - panStart.x;
    viewport.offsetY = ev.clientY - panStart.y;
    applyViewportTransform();
    return;
  }
  if (!currentStroke || isGestureActive()) return;
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
  hidePlotPreview();
  if (currentStroke) {
    const minPts =
      currentStroke.tool === "pen" || currentStroke.tool === "eraser" ? 1 : 2;
    if (currentStroke.points.length >= minPts) {
      pushUndoSnapshot();
      currentStroke.lengthPx = pathLength(currentStroke.points);
      layers.paths.push(currentStroke);
      markDirty();
    }
    currentStroke = null;
    renderPaths();
  }
}

function zoomBy(factor, clientX, clientY) {
  const wrap = $("drawing-stage-wrap");
  const rect = wrap?.getBoundingClientRect();
  const cx = clientX ?? (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
  const cy = clientY ?? (rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
  zoomAt(factor, cx, cy);
  markDirty();
}

function onTouchStart(ev) {
  if (ev.touches.length === 2) {
    touchGesture = {
      lastMid: touchMidpoint(ev.touches),
      lastDist: touchDistance(ev.touches),
    };
    currentStroke = null;
    panStart = null;
    hidePlotPreview();
    setGestureActive(true);
  }
}

function onTouchMove(ev) {
  if (!touchGesture || ev.touches.length !== 2) return;
  ev.preventDefault();
  const mid = touchMidpoint(ev.touches);
  const dist = touchDistance(ev.touches);
  viewport.offsetX += mid.x - touchGesture.lastMid.x;
  viewport.offsetY += mid.y - touchGesture.lastMid.y;
  if (touchGesture.lastDist > 0) {
    zoomAt(dist / touchGesture.lastDist, mid.x, mid.y);
  }
  touchGesture.lastMid = mid;
  touchGesture.lastDist = dist;
  markDirty();
}

function onTouchEnd(ev) {
  if (ev.touches.length < 2) {
    touchGesture = null;
    setGestureActive(false);
  }
}

/** 背景画像 blob URL — 差し替え時に解放 */
let bgObjectUrl = null;

/** HTTP背景URLへキャッシュバスター付与 */
function withDrawingBgCacheBust(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const u = new URL(url, location.origin);
    if (!u.searchParams.has("v")) {
      u.searchParams.set("v", SURVEY_DRAWING_UI_VERSION);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** 旧 blob URL を解放してメモリを返却 */
function releaseBgObjectUrl() {
  if (bgObjectUrl) {
    URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = null;
  }
}

/** 背景写真取り込み後に
   ステージ寸法とCSSを同期 */
function applyPhotoBackgroundLayout(img) {
  const stage = $("drawing-stage");
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 600;
  stageSize = { w, h };
  layers.canvasWidth = w;
  layers.canvasHeight = h;
  stage?.classList.remove("drawing-grid-paper");
  stage?.classList.add("has-photo-bg");
  if (stage) {
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
  }
  img.classList.remove("hidden");
  $("drawing-bg-placeholder")?.classList.add("hidden");
}

/** 背景 img の onload を待つ
   blob URL フォールバック付き */
function setupBgImage(url) {
  const img = $("drawing-bg");
  const ph = $("drawing-bg-placeholder");
  if (!img) return Promise.reject(new Error("bg element missing"));

  releaseBgObjectUrl();
  const src = withDrawingBgCacheBust(url);
  if (src.startsWith("blob:")) bgObjectUrl = src;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      applyPhotoBackgroundLayout(img);
      const done = () => {
        renderAll();
        markDirty();
        syncMaterialBarUi();
        drawingEditorState?.canvas?.setBackgroundUrl?.(img.src);
        resolve({ width: stageSize.w, height: stageSize.h });
      };
      if (img.decode) {
        img.decode().then(done).catch(done);
      } else {
        done();
      }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      ph?.classList.remove("hidden");
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const tryBlobFallback = async () => {
      if (!src.startsWith("data:")) {
        fail(new Error("背景画像の読み込みに失敗しました"));
        return;
      }
      try {
        const blob = await fetch(src).then((r) => r.blob());
        const blobUrl = URL.createObjectURL(blob);
        bgObjectUrl = blobUrl;
        settled = false;
        img.onload = finish;
        img.onerror = () => fail(new Error("背景画像の読み込みに失敗しました"));
        img.src = blobUrl;
        if (img.complete && img.naturalWidth) finish();
      } catch {
        fail(new Error("背景画像の読み込みに失敗しました"));
      }
    };

    img.onload = finish;
    img.onerror = () => {
      tryBlobFallback().catch(() => fail(new Error("背景画像の読み込みに失敗しました")));
    };
    img.src = src;
    if (img.complete && img.naturalWidth) finish();
  });
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
      const msg = String(e?.message || e || "");
      if (loadSketchFromLocal()) {
        sketch = { id: sketchId, projectId, title: "現調図面（端末内）", layers };
        isLocalOnlyMode = true;
        isTempMode = true;
        showTempBanner();
        applyGridPaper();
        updateDrawingPdfBar();
        return;
      }
      if (/sketch not found|not found/i.test(msg)) {
        sketch = {
          id: sketchId,
          projectId,
          title: "現調図面",
          layers: emptyLayers(),
        };
        layers = migrateLayers(sketch.layers);
        setStatus("図面が見つかりません。新規モードで続行します");
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

  layers = migrateLayers(
    sketch?.layers,
    sketch?.layers?.canvasWidth,
    sketch?.layers?.canvasHeight
  );
  viewport = { scale: 1, offsetX: 0, offsetY: 0, ...layers.viewport };
  $("drawing-title").textContent = sketch?.title || "現調図面";
  if (sketch.backgroundImageUrl) {
    setupBgImage(sketch.backgroundImageUrl);
    syncMaterialBarUi();
  } else {
    stageSize = { w: layers.canvasWidth || 800, h: layers.canvasHeight || 600 };
    applyGridPaper();
  }
  loadSketchFromLocal();
  if (layers.aiMaterialCandidates?.length) {
    aiMaterialCandidates = layers.aiMaterialCandidates;
  }
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
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      mount.querySelectorAll("[data-symbol]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sym = symbolPalette.find((x) => x.symbolType === btn.dataset.symbol);
      pendingSymbol = sym;
      setStatus(`${sym?.label} — 図面上をタップして配置`);
      fieldInnovations?.checkKnowledgeOnSymbol({
        label: sym?.label,
        symbolType: sym?.symbolType,
      });
    });
  });
}

const DRAWING_IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
/** 背景JPEG化 — 最大幅と画質 */
const DRAWING_BG_MAX_WIDTH = 2048;
const DRAWING_BG_JPEG_QUALITY = 0.85;
const DRAWING_IMAGE_DECODE_TIMEOUT_MS = 45000;

/** 選択ファイルが画像か判定
   HEIC 等の MIME 空も拡張子で許可 */
function isLikelyImageFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "");
  if (type.startsWith("image/")) return true;
  if ((type === "" || type === "application/octet-stream") && DRAWING_IMAGE_EXT_RE.test(name)) {
    return true;
  }
  return false;
}

/** FileReader で DataURL へ変換
   例外は try-catch で包む */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        if (!result.startsWith("data:")) {
          reject(new Error("DataURL 変換に失敗しました"));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
      reader.onabort = () => reject(new Error("FileReader aborted"));
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
}

/** Image 要素でデコード完了を待つ
   タイムアウトと onerror を監視 */
function loadImageFromDataUrl(dataUrl, timeoutMs = DRAWING_IMAGE_DECODE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    let settled = false;
    const done = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      done(() => reject(new Error("image decode timeout")));
    }, timeoutMs);
    el.onload = () => done(() => resolve(el));
    el.onerror = () => done(() => reject(new Error("image decode failed")));
    el.src = dataUrl;
  });
}

/** HEIC / HEIF 形式か判定 */
function isHeicLike(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || /\.heic$|\.heif$/.test(name);
}

/** FileReader → Image でデコード
   createImageBitmap は HEIC で不安定 */
async function decodeImageSource(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImageFromDataUrl(dataUrl);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    cleanup: () => {},
  };
}

/** canvas を JPEG DataURL へ */
function canvasToJpegDataUrl(canvas, quality = DRAWING_BG_JPEG_QUALITY) {
  let out;
  try {
    out = canvas.toDataURL("image/jpeg", quality);
  } catch (err) {
    console.error("[survey-drawing] canvas.toDataURL failed", err);
    throw err;
  }
  if (!out || out.length < 32) throw new Error("compression failed");
  return out;
}

/** 現場写真を JPEG に正規化
   高解像度は縮小してメモリ節約 */
async function prepareDrawingBackgroundFromFile(file) {
  if (!file || !(file instanceof Blob)) throw new Error("file missing");
  if (!isLikelyImageFile(file)) throw new Error("not an image");

  try {
    const decoded = await decodeImageSource(file);
    try {
      let width = decoded.width;
      let height = decoded.height;
      if (!width || !height) throw new Error("invalid image dimensions");
      if (width > DRAWING_BG_MAX_WIDTH) {
        height = Math.round((height * DRAWING_BG_MAX_WIDTH) / width);
        width = DRAWING_BG_MAX_WIDTH;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(decoded.source, 0, 0, width, height);
      return {
        dataUrl: canvasToJpegDataUrl(canvas, DRAWING_BG_JPEG_QUALITY),
        width,
        height,
        mimeType: "image/jpeg",
      };
    } finally {
      decoded.cleanup();
    }
  } catch (compressErr) {
    console.warn("[survey-drawing] compress failed", compressErr, file.name);
    if (isHeicLike(file)) {
      throw new Error("HEIC形式は変換できません。JPEGで保存した写真を選んでください");
    }
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);
    return {
      dataUrl,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      mimeType: file.type || "image/jpeg",
    };
  }
}

async function importBackground(file) {
  const prepared = await prepareDrawingBackgroundFromFile(file);
  const imageBase64 = prepared.dataUrl;
  await setupBgImage(imageBase64);

  if (isLocalOnlyMode || isTempDrawingId(sketchId)) {
    if (!sketch) sketch = { id: sketchId, projectId, title: "一時図面" };
    sketch.backgroundImageUrl = imageBase64;
    markDirty();
    setStatus("背景写真を取り込みました（端末内保存）");
    syncMaterialBarUi();
    return;
  }
  const bgPayload = {
    sketchId,
    imageBase64,
    fileName: file.name,
    mimeType: prepared.mimeType || "image/jpeg",
  };

  if (!isNetworkOnlineV1()) {
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
      {
        imageBase64,
        fileName: file.name,
        mimeType: prepared.mimeType || "image/jpeg",
        canvasWidth: prepared.width,
        canvasHeight: prepared.height,
      }
    );
    sketch = data.sketch;
    if (sketch.backgroundImageUrl) {
      await setupBgImage(sketch.backgroundImageUrl);
    }
    setStatus("背景写真を取り込みました");
    syncMaterialBarUi();
    await loadSpecPhotoSlotsForDrawing();
  } catch (e) {
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

async function runGridOcrAndAutoPlot() {
  if (!sketchId) {
    setStatus("保存後に AI 解析を実行してください");
    return;
  }
  if (!sketch?.backgroundImageUrl && !sketch?.backgroundImagePath) {
    setStatus("方眼紙写真を取り込んでから AI 解析してください");
    return;
  }
  setStatus("方眼紙を解析中…");
  await saveSketch().catch(() => {});

  const data = await api(
    "POST",
    `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}/grid-ocr`,
    { applyToCanvas: true, applyToSurveyNotes: true }
  );

  if (data.sketch?.layers) {
    layers = migrateLayers(
      data.sketch.layers,
      data.sketch.layers.canvasWidth,
      data.sketch.layers.canvasHeight
    );
    sketch = data.sketch;
  } else if (data.autoPlot) {
    applyAutoPlotPayloadToLayers(data.autoPlot);
  }

  syncEditorPlotsFromLayers();
  renderAll();
  markDirty();

  const symCount = data.autoPlot?.symbols?.length ?? 0;
  const memoCount = data.autoPlot?.notes?.length ?? 0;
  const counts = data.symbolCountHandoff?.symbolCounts ?? [];
  const countText = counts.map((c) => `${c.label}${c.count}`).join(" · ");
  setStatus(
    `AI解析完了 — 記号${symCount}件 · メモ${memoCount}件${countText ? ` · ${countText}` : ""}（位置は手動修正可）`
  );
}

/**
 * サーバー autoPlot を
 * layers 配列へ反映（完全同期）
 */
function applyAutoPlotPayloadToLayers(autoPlot) {
  if (!autoPlot) return;
  const existingSymIds = new Set(layers.symbols.map((s) => s.id));
  for (const s of autoPlot.symbols ?? []) {
    if (!existingSymIds.has(s.id)) {
      layers.symbols.push({ ...s, memo: s.memo || "自動プロット" });
    }
  }
  const existingNoteIds = new Set(layers.notes.map((n) => n.id));
  for (const n of autoPlot.notes ?? []) {
    if (!existingNoteIds.has(n.id)) layers.notes.push(n);
  }
  if (autoPlot.marginSummary && sketch) {
    const tag = `[OCR] ${autoPlot.marginSummary}`;
    sketch.notes = sketch.notes?.includes(tag) ? sketch.notes : `${sketch.notes || ""}\n${tag}`.trim();
  }
}

/** editorV1 記号配列を layers.symbols と同期 */
function syncEditorPlotsFromLayers() {
  if (!drawingEditorState?.canvas) return;
  const w = stageSize.w || layers.canvasWidth || 800;
  const h = stageSize.h || layers.canvasHeight || 600;
  const plots = layers.symbols.map((s) => ({
    id: s.id,
    symbolType: s.symbolType,
    icon: s.icon,
    label: s.label,
    x: w > 0 ? s.x / w : 0,
    y: h > 0 ? s.y / h : 0,
  }));
  drawingEditorState.canvas.setPlots(plots);
  layers.editorV1 = editorStateToLayerV1(drawingEditorState);
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
  const aiHint =
    aiMaterialCandidates.length > 0
      ? ` · AI材料${aiMaterialCandidates.length}件`
      : "";
  summary.textContent = estimateDraftId
    ? `${applied ? "反映済み" : "draft作成済み"} (${estimateDraftId.slice(0, 8)}…) ${priceText}${aiHint}`
    : aiMaterialCandidates.length
      ? `見積候補未作成（AI材料${aiMaterialCandidates.length}件待機）`
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
  if (aiMaterialCandidates.length) {
    const aiRows = materialItemsToPreviewCandidates(aiMaterialCandidates);
    const existing = new Set(
      (preview.materialCandidates ?? []).map((c) => `${c.label}:${c.unit}`)
    );
    for (const row of aiRows) {
      const key = `${row.label}:${row.unit}`;
      if (!existing.has(key)) {
        preview.materialCandidates = [...(preview.materialCandidates ?? []), row];
        existing.add(key);
      }
    }
  }
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
  const aiMsg = aiMaterialCandidates.length
    ? `（AI材料${aiMaterialCandidates.length}件を含む）`
    : "";
  setStatus(`見積候補 draft を保存しました${aiMsg}`);
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
      if (confirm("見積PWAで開きますか？")) {
        navigateTo(res.estimateUrl, { record: false });
      }
    }, 250);
  }
}

function openEstimatePwaFromDrawing() {
  if (!estimateDraftId) return;
  navigateTo(`/estimate-v1?masterDraftId=${encodeURIComponent(estimateDraftId)}`, {
    record: false,
  });
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

function bindImportPhotoButton() {
  const btn = $("btn-import-photo");
  if (!btn) return;
  const toggle = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    // ピッカー内操作は親トグルを無視
    if (ev.target?.closest?.("#drawing-photo-picker")) return;
    const picker = $("drawing-photo-picker");
    const show = picker?.classList.contains("hidden");
    togglePhotoPicker(!!show);
  };
  btn.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length > 1) return;
      toggle(ev);
    },
    { passive: false }
  );
  btn.addEventListener("click", (ev) => {
    if (ev.pointerType === "touch") return;
    toggle(ev);
  });
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
      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9, ev.clientX, ev.clientY);
    },
    { passive: false }
  );

  wrap?.addEventListener("touchstart", onTouchStart, { passive: true });
  wrap?.addEventListener("touchmove", onTouchMove, { passive: false });
  wrap?.addEventListener("touchend", onTouchEnd, { passive: true });
  wrap?.addEventListener("touchcancel", onTouchEnd, { passive: true });

  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  $("btn-toggle-tools")?.addEventListener("click", () => {
    applyToolStripCollapsed(!toolStripCollapsed);
  });
  initToolStripCollapse();

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
  $("btn-grid-ocr")?.addEventListener("click", () =>
    runGridOcrAndAutoPlot().catch((e) => setStatus(e.message || "AI解析に失敗しました"))
  );
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

  bindImportPhotoButton();
  wirePhotoPickerShell();
  bindPhotoTriggerButton("btn-photo-camera", "survey-camera-input");
  bindPhotoTriggerButton("btn-photo-album", "survey-album-input");
  wireSurveyFileInput();
  $("btn-undo")?.addEventListener("click", () => undoLastStroke());

  $("btn-spec-photo-link")?.addEventListener("click", () => {
    linkBackgroundToSpecSlot().catch((e) => setStatus(e.message));
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

  // ネイティブ file ピッカー
  // キャンセル時にメニューを閉じる
  window.addEventListener("focus", () => {
    if (!photoPickerOpen || !photoPickerFileOpenedAt) return;
    if (Date.now() - photoPickerFileOpenedAt < 500) return;
    const cameraInput = $("survey-camera-input");
    const albumInput = $("survey-album-input");
    window.setTimeout(() => {
      if (!photoPickerOpen) return;
      if (cameraInput?.files?.length || albumInput?.files?.length) return;
      togglePhotoPicker(false);
    }, 250);
  });
}

async function main() {
  if (!sessionStorage.getItem(TOKEN_KEY)) {
    location.replace(surveyBackUrl());
    return;
  }
  initPracticalNav({
    appId: "survey_v1",
    appName: "現調図面",
    theme: "blue",
    onBack: () => {
      if (dirty && !confirm("未保存の変更があります。戻りますか？")) return;
      if (navigatePracticalReturn(() => {})) return;
      if (isLocalOnlyMode || isTempDrawingId(projectId)) {
        navigateTo("/survey-v1", { record: false });
        return;
      }
      if (projectId) navigateTo(surveyBackUrl(), { record: false });
      else navigateBackOne("/survey-v1");
    },
  });
  fieldInnovations = initDrawingFieldInnovationsV1({
    $,
    getLayers: () => layers,
    getHasPhoto: hasBackgroundPhoto,
    setAiMaterialCandidates: (items) => {
      aiMaterialCandidates = items ?? [];
      layers.aiMaterialCandidates = aiMaterialCandidates;
      renderEstimateBar();
    },
    addNote: addDrawingNote,
    setStatus,
  });
  wireEvents();
  await Promise.all([loadSymbols(), loadLineTypes()]);
  await resolveSurveyProjectIdIfNeeded();
  try {
    await loadSketch();
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (/sketch not found|not found/i.test(msg)) {
      sketch = sketch || {
        id: sketchId || `temp-${Date.now()}`,
        projectId,
        title: "現調図面",
        layers: emptyLayers(),
      };
      layers = migrateLayers(sketch?.layers);
      applyGridPaper();
      setStatus("図面データ未取得。オフラインモードで続行します");
    } else {
      setStatus(`読み込み警告: ${msg}`);
    }
  }
  syncMaterialBarUi();
  fieldInnovations?.checkKnowledgeOnOpen(sketch);
  await refreshEstimateDraftState();
  drawingEditorState = initDrawingEditorFoundationV1({
    onStatus: setStatus,
    initialPayload: editorV1LayerToPayload(layers.editorV1),
    onPayloadChange: () => markDirty(),
    skipSymbolDock: true,
  });
  restoreDrawingEditorFromLayers();
  updateUndoButton();
  setStatus("描画できます（音声ピン · AI材料 · 教訓アラート対応）");
}

main().catch((e) => setStatus(`エラー: ${e.message}`));
