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

export const SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v34";
/** タッチ配置時に指で隠れないよう上へずらす（画面px） */
const PLOT_TOUCH_OFFSET_Y = 32;
/** 写真解析の上限（AI完了まで待機） */
const PHOTO_IMPORT_TIMEOUT_MS = 60000;
/** onChange直後の強制解放（AI解析待ち） */
const PHOTO_IMPORT_FORCE_RELEASE_MS = 60000;
/** 写真取込中フラグ（画面ロック用） */
let photoImportBusy = false;
/** 強制解放タイマーID（0=未セット） */
let photoImportForceTimerId = 0;
export const SURVEY_DRAWING_TEMP_BANNER =
  "一時図面として作成中。現調から開くと案件に紐づきます。";
/** 画像拡張子（MIME空のHEIC等向け） */
const DRAWING_IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

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
import {
  navigateBackOne,
  suppressPopstateBackGuard,
} from "./tisly-navigation-stack-v1.js";
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
import {
  buildFallbackOuterFramePaths,
  detectSketchLinesFromBlobV1,
  isSketchNotFoundError,
  prepareSketchUploadFileV1,
} from "./features/drawing/survey-sketch-auto-draw-v1.js";

function $(id) {
  return document.getElementById(id);
}

/** 背面写真層を必ず確保する
 * 旧HTMLのdrawing-bgにも対応 */
function ensureSurveyBgPhotoLayer() {
  let layer = document.getElementById("survey-bg-photo-layer");
  if (layer) return layer;

  const stage = document.getElementById("drawing-stage");
  if (!stage) throw new Error("bg element missing");

  layer = document.createElement("div");
  layer.id = "survey-bg-photo-layer";
  layer.className = "survey-bg-photo-layer";
  layer.setAttribute("aria-hidden", "true");

  // 旧img(drawing-bg)があれば置換
  const legacy = document.getElementById("drawing-bg");
  const svg = document.getElementById("drawing-svg");
  const ph = document.getElementById("drawing-bg-placeholder");

  if (legacy && legacy.parentElement === stage) {
    stage.insertBefore(layer, legacy);
    legacy.remove();
  } else if (svg && svg.parentElement === stage) {
    // SVGの直前＝真後ろに配置
    stage.insertBefore(layer, svg);
  } else if (ph && ph.parentElement === stage) {
    stage.insertBefore(layer, ph);
  } else {
    stage.prepend(layer);
  }
  return layer;
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
  if (!el) return;
  el.textContent = msg;
  // Toast帯は常にタッチを通す（無力化）
  el.style.setProperty("pointer-events", "none", "important");
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

/** 旧マスク消しゴムパスを捨てる
 * （物理削除方式へ移行済み） */
function stripLegacyEraserPaths(paths) {
  return (paths ?? []).filter((p) => p && p.tool !== "eraser");
}

function migrateLayers(raw, w = 800, h = 600) {
  if (!raw) return emptyLayers(w, h);
  if (raw.schemaVersion === 2) {
    return {
      ...emptyLayers(w, h),
      ...raw,
      paths: stripLegacyEraserPaths(raw.paths ?? raw.strokes ?? []),
      notes: raw.notes ?? raw.textMemos ?? [],
    };
  }
  if (raw.version === 1) {
    return {
      schemaVersion: SCHEMA_VERSION,
      drawingVersion: DRAWING_VERSION,
      canvasWidth: w,
      canvasHeight: h,
      paths: stripLegacyEraserPaths(raw.strokes ?? []).map((s) => ({
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
/** iOS 誤座標で長い対角線ができないよう上限 */
const ERASER_MAX_JUMP_PX = 72;
/** タップ判定のストローク長上限 */
const ERASER_TAP_MAX_LEN = 36;
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

const PATH_ROOT_ID = "drawing-paths-root-v1";
const ERASER_PREVIEW_ID = "drawing-eraser-preview-v1";

/** 点と線分の最短距離 */
function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 線分同士の最短距離（交差なら 0） */
function distSegmentToSegment(ax, ay, bx, by, cx, cy, dx, dy) {
  const abx = bx - ax;
  const aby = by - ay;
  const cdx = dx - cx;
  const cdy = dy - cy;
  const acx = cx - ax;
  const acy = cy - ay;
  const den = abx * cdy - aby * cdx;
  if (Math.abs(den) > 1e-9) {
    const t = (acx * cdy - acy * cdx) / den;
    const u = (acx * aby - acy * abx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    distPointToSegment(ax, ay, cx, cy, dx, dy),
    distPointToSegment(bx, by, cx, cy, dx, dy),
    distPointToSegment(cx, cy, ax, ay, bx, by),
    distPointToSegment(dx, dy, ax, ay, bx, by)
  );
}

/**
 * テレポートを繋がない消しゴム線分を作る
 * （iOS の飛躍座標で全パスが消えるのを防ぐ）
 * @param {Array<{x:number,y:number}>} points
 */
function buildEraserSegments(points) {
  /** @type {Array<[{x:number,y:number},{x:number,y:number}]>} */
  const segs = [];
  if (!points?.length) return segs;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (
      !a ||
      !b ||
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y)
    ) {
      continue;
    }
    const jump = Math.hypot(b.x - a.x, b.y - a.y);
    if (jump <= 0 || jump > ERASER_MAX_JUMP_PX) continue;
    segs.push([a, b]);
  }
  return segs;
}

/** パス点列の AABB（パディング付き） */
function pathPointsBBox(points, pad) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function bboxOverlap(a, b) {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/** 消しゴム当たり半径（過大にしない） */
function eraserHitThreshold(drawPath, eraserStroke) {
  const raw =
    ((drawPath.width || strokeWidth) +
      (eraserStroke.width || ERASER_WIDTH)) /
      2 +
    2;
  return Math.min(20, Math.max(6, raw));
}

/**
 * 消しゴムと描画パスの最短距離
 * （AABB → 線分同士。全点逆引きはしない）
 * @param {object} drawPath
 * @param {object} eraserStroke
 */
function minDistPathToEraser(drawPath, eraserStroke) {
  const aPts = drawPath?.points;
  const bPts = eraserStroke?.points;
  if (!aPts?.length || !bPts?.length) return Infinity;
  const threshold = eraserHitThreshold(drawPath, eraserStroke);
  const eraserSegs = buildEraserSegments(bPts);
  const pathBox = pathPointsBBox(aPts, threshold);
  const eraserBox = pathPointsBBox(bPts, threshold);
  if (!bboxOverlap(pathBox, eraserBox)) return Infinity;

  let best = Infinity;
  // タップ（点のみ）: 消しゴム各点 → 描画線分
  for (const bp of bPts) {
    if (!bp || !Number.isFinite(bp.x) || !Number.isFinite(bp.y)) continue;
    if (aPts.length === 1) {
      best = Math.min(
        best,
        Math.hypot(bp.x - aPts[0].x, bp.y - aPts[0].y)
      );
      continue;
    }
    for (let i = 1; i < aPts.length; i++) {
      const d = distPointToSegment(
        bp.x,
        bp.y,
        aPts[i - 1].x,
        aPts[i - 1].y,
        aPts[i].x,
        aPts[i].y
      );
      if (d < best) best = d;
      if (best <= threshold) return best;
    }
  }
  // 連続区間のみ線分同士（テレポート区間は除外済み）
  if (aPts.length >= 2 && eraserSegs.length) {
    for (const [e0, e1] of eraserSegs) {
      for (let i = 1; i < aPts.length; i++) {
        const d = distSegmentToSegment(
          aPts[i - 1].x,
          aPts[i - 1].y,
          aPts[i].x,
          aPts[i].y,
          e0.x,
          e0.y,
          e1.x,
          e1.y
        );
        if (d < best) best = d;
        if (best <= threshold) return best;
      }
    }
  }
  return best;
}

/**
 * 消しゴム軌跡が描画パスに触れているか
 * （触れたパスは丸ごと物理削除する）
 * @param {object} drawPath
 * @param {object} eraserStroke
 */
function pathTouchesEraser(drawPath, eraserStroke) {
  const threshold = eraserHitThreshold(drawPath, eraserStroke);
  return minDistPathToEraser(drawPath, eraserStroke) <= threshold;
}

/** 消しゴム軌跡の長さ（テレポート除外） */
function eraserStrokeLength(eraserStroke) {
  const segs = buildEraserSegments(eraserStroke?.points);
  let len = 0;
  for (const [a, b] of segs) {
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (!segs.length && eraserStroke?.points?.length) {
    return 0;
  }
  return len;
}

/**
 * 触れたパスだけ splice 相当で物理削除
 * 全消去は絶対にしない
 * @param {object} eraserStroke
 * @returns {number} 削除本数
 */
function applyEraserPhysicalDelete(eraserStroke) {
  const cleaned = stripLegacyEraserPaths(layers.paths);
  const before = cleaned.length;
  /** @type {{ id: string, dist: number }[]} */
  const hits = [];
  for (const p of cleaned) {
    if (!p?.id) continue;
    const dist = minDistPathToEraser(p, eraserStroke);
    const threshold = eraserHitThreshold(p, eraserStroke);
    if (dist <= threshold) {
      hits.push({ id: p.id, dist });
    }
  }
  if (!hits.length) {
    layers.paths = cleaned;
    return 0;
  }
  hits.sort((a, b) => a.dist - b.dist);
  // 短いタップで大量ヒットは誤判定 → 最近傍の1本だけ
  const strokeLen = eraserStrokeLength(eraserStroke);
  const removeIds = new Set(
    strokeLen <= ERASER_TAP_MAX_LEN && hits.length > 1
      ? [hits[0].id]
      : hits.map((h) => h.id)
  );
  // 配列から該当 id のみ除去（一括クリア禁止）
  const next = [];
  for (const p of cleaned) {
    if (!removeIds.has(p.id)) next.push(p);
  }
  layers.paths = next;
  return before - next.length;
}

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
  // 旧マスク defs が残っていれば除去
  svg.querySelector("#drawing-defs-v1")?.remove();
  return root;
}

/**
 * 消しゴム操作中のプレビュー線
 * （半透明・削除確定前のガイド）
 * @param {SVGElement} parent
 * @param {object|null} eraserStroke
 */
function appendEraserPreview(parent, eraserStroke) {
  if (!eraserStroke?.points?.length) return;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = eraserStroke.points
    .map((pt, i) => `${i ? "L" : "M"}${pt.x} ${pt.y}`)
    .join(" ");
  path.setAttribute("id", ERASER_PREVIEW_ID);
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(148, 163, 184, 0.55)");
  path.setAttribute(
    "stroke-width",
    String(eraserStroke.width || ERASER_WIDTH)
  );
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("pointer-events", "none");
  parent.appendChild(path);
}

function renderPaths(previewEraserStroke = null) {
  const svg = $("drawing-svg");
  if (!svg) return;
  svg.setAttribute("viewBox", `0 0 ${stageSize.w} ${stageSize.h}`);
  svg.setAttribute("width", String(stageSize.w));
  svg.setAttribute("height", String(stageSize.h));

  const root = ensurePathsRoot(svg);
  root.innerHTML = "";

  // 描画パスのみ（消しゴムは物理削除済み）
  let drawPaths = stripLegacyEraserPaths(layers.paths);
  if (previewEraserStroke) {
    drawPaths = drawPaths.filter(
      (p) => !pathTouchesEraser(p, previewEraserStroke)
    );
  }

  const drawGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  drawGroup.setAttribute("class", "drawing-draw-layer");
  // mask は使わない — 消した場所にも再描画できる
  for (const p of drawPaths) appendPathToSvg(drawGroup, p);
  root.appendChild(drawGroup);

  if (previewEraserStroke) {
    appendEraserPreview(root, previewEraserStroke);
  }

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

/** 要素を display:none で物理撤去
   透明膜を残さない（iOS対策） */
function forceNukeTouchBlockerEl(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
  // インラインでCSSより優先して消す
  el.style.setProperty("display", "none", "important");
  el.style.setProperty("pointer-events", "none", "important");
  el.style.setProperty("visibility", "hidden", "important");
  el.style.setProperty("z-index", "-1", "important");
}

/** ピッカー／遮断幕を画面から撤去
   透明タッチブロックを残さない */
function dismissPhotoPickerChrome() {
  photoPickerOpen = false;
  document.body.classList.remove("drawing-photo-picker-open");
  // 親コンテナごと物理 display:none
  forceNukeTouchBlockerEl($("drawing-photo-picker"));
  forceNukeTouchBlockerEl($("drawing-photo-picker-backdrop"));
  // 隠しfileもキャンバスを吸わない
  for (const id of ["survey-camera-input", "survey-album-input"]) {
    const input = $(id);
    if (!input) continue;
    input.style.setProperty("pointer-events", "none", "important");
  }
  const form = $("survey-photo-pick-form");
  if (form) {
    form.style.setProperty("pointer-events", "none", "important");
  }
}

/** ピッカーと暗い遮断幕を前面表示 */
function showPhotoPickerChrome() {
  photoPickerOpen = true;
  document.body.classList.add("drawing-photo-picker-open");
  const backdrop = $("drawing-photo-picker-backdrop");
  if (backdrop) {
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    // 物理非表示を解除して前面へ復帰
    backdrop.style.removeProperty("display");
    backdrop.style.removeProperty("pointer-events");
    backdrop.style.removeProperty("visibility");
    backdrop.style.removeProperty("z-index");
    backdrop.style.display = "block";
    backdrop.style.pointerEvents = "auto";
  }
  const picker = $("drawing-photo-picker");
  if (picker) {
    picker.classList.remove("hidden");
    picker.setAttribute("aria-hidden", "false");
    picker.style.removeProperty("display");
    picker.style.removeProperty("pointer-events");
    picker.style.removeProperty("visibility");
    picker.style.removeProperty("z-index");
    picker.style.display = "flex";
    picker.style.pointerEvents = "auto";
    picker.style.visibility = "visible";
  }
  for (const id of ["survey-camera-input", "survey-album-input"]) {
    const input = $(id);
    if (!input) continue;
    input.style.removeProperty("pointer-events");
  }
  const form = $("survey-photo-pick-form");
  if (form) form.style.removeProperty("pointer-events");
}

function togglePhotoPicker(show) {
  if (show) {
    showPhotoPickerChrome();
  } else {
    dismissPhotoPickerChrome();
  }
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
  // 遮断幕タップでメニューを閉じる
  const backdrop = $("drawing-photo-picker-backdrop");
  backdrop?.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    dismissPhotoPickerChrome();
    setTool("pen");
  });
  // 起動時は必ず閉じた状態から開始
  dismissPhotoPickerChrome();
}

/** 写真読み込み失敗を
   ステータスとモーダルで通知 */
function notifySurveyPhotoLoadError(fileName, detail) {
  const label = fileName || "写真";
  setStatus(`写真を読み込めません（${label}）`);
  const hint = detail || "別の写真でもう一度お試しください。";
  // alert前に遮断幕を撤去して解放
  dismissPhotoPickerChrome();
  alert(`写真を読み込めません（${label}）\n${hint}`);
  dismissPhotoPickerChrome();
}

/** 強制解放タイマーを取り消す */
function clearPhotoImportForceTimer() {
  if (!photoImportForceTimerId) return;
  clearTimeout(photoImportForceTimerId);
  photoImportForceTimerId = 0;
}

/** onChange直後に仕込む時限爆弾
   60秒後は問答無用でUIを解放する */
function armPhotoImportForceReleaseTimer(fileLabel) {
  clearPhotoImportForceTimer();
  photoImportForceTimerId = setTimeout(() => {
    photoImportForceTimerId = 0;
    const el = $("drawing-status");
    const text = el?.textContent || "";
    const stillBusy =
      photoImportBusy || text.includes("読み込み中");
    if (!stillBusy) return;
    console.error(
      "[survey-drawing] force release timeout",
      fileLabel
    );
    // JS側の読込フラグを全滅
    photoImportBusy = false;
    document.body.classList.remove("drawing-photo-import-busy");
    forceNukeTouchBlockerEl($("drawing-photo-import-lock"));
    forceNukeTouchBlockerEl($("drawing-photo-picker-backdrop"));
    forceNukeTouchBlockerEl($("drawing-photo-picker"));
    dismissPhotoPickerChrome();
    setTool("pen");
    setStatus("処理がタイムアウトしました");
    if (el) {
      el.style.setProperty(
        "pointer-events",
        "none",
        "important"
      );
    }
    alert("処理がタイムアウトしました");
  }, PHOTO_IMPORT_FORCE_RELEASE_MS);
}

/** 取込ロック幕を前面表示
   （見た目のみ・タッチは吸わない） */
function showPhotoImportLockOverlay() {
  document.body.classList.add("drawing-photo-import-busy");
  const lock = $("drawing-photo-import-lock");
  if (!lock) return;
  lock.classList.remove("hidden");
  lock.setAttribute("aria-hidden", "false");
  lock.style.setProperty("display", "flex", "important");
  // タッチ遮断を禁止（視覚フィードバックのみ）
  lock.style.setProperty(
    "pointer-events",
    "none",
    "important"
  );
  lock.style.setProperty("visibility", "visible", "important");
  lock.style.setProperty("z-index", "10000", "important");
}

/** 読み込み中表示と画面ロックを
   成否問わず必ず解除する */
function releasePhotoImportUiLock() {
  // Stateフラグを確実に false へ
  photoImportBusy = false;
  clearPhotoImportForceTimer();
  // busyクラスを先に剥がしCSSも解放
  document.body.classList.remove("drawing-photo-import-busy");
  // 取込ロック幕を物理 display:none
  forceNukeTouchBlockerEl($("drawing-photo-import-lock"));
  // ピッカー／暗い遮断幕も全滅
  dismissPhotoPickerChrome();
  setTool("pen");
  const el = $("drawing-status");
  const text = el?.textContent || "";
  // 読み込み中表示は無条件で書き換える
  if (!text || text.includes("読み込み中")) {
    setStatus(
      "操作できます。写真を選び直すか描画を続けてください"
    );
  }
  // ステータス帯もタッチを通す
  if (el) {
    el.style.setProperty(
      "pointer-events",
      "none",
      "important"
    );
  }
}

/**
 * タイムアウト付きで Promise を待つ
 * ハング時も finally へ確実に到達させる
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {string} label
 */
function withPhotoImportTimeout(promise, ms, label) {
  let timerId = 0;
  const timeoutP = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`${label || "処理"}がタイムアウトしました`));
    }, ms);
  });
  return Promise.race([promise, timeoutP]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
}

/** 写真選択後に背景へ取り込み
   try/catch/finally で画面を必ず解放 */
async function handleSurveyFileSelected(ev) {
  // 親form送信・画面リロードを阻止
  ev.preventDefault();
  ev.stopPropagation();
  const input = ev.target;
  const file = input?.files?.[0];
  // 【一番最初】60秒強制解放タイマーを仕込む
  armPhotoImportForceReleaseTimer(file?.name || "写真");
  // iOSピッカー復帰の誤popstateを抑止
  suppressPopstateBackGuard(8000);
  // 選択直後に最前面ブロックを撤去
  dismissPhotoPickerChrome();
  if (!file) {
    // Stateリセット＋タイマー解除
    photoImportBusy = false;
    releasePhotoImportUiLock();
    return;
  }
  // 残留busyは強制クリアして続行可能にする
  if (photoImportBusy) {
    photoImportBusy = false;
    document.body.classList.remove("drawing-photo-import-busy");
    forceNukeTouchBlockerEl($("drawing-photo-import-lock"));
    dismissPhotoPickerChrome();
  }
  photoImportBusy = true;
  // 処理中は見た目だけのロック幕を出す
  showPhotoImportLockOverlay();
  setStatus(`読み込み中…（${file.name || "写真"}）`);
  try {
    if (!(file instanceof Blob) || file.size <= 0) {
      throw new Error("写真ファイルが空です");
    }
    if (!isLikelyImageFile(file)) {
      throw new Error("画像ファイルではありません");
    }
    // 背景＋AI作図（タイムアウト付き）
    await withPhotoImportTimeout(
      importBackground(file),
      PHOTO_IMPORT_TIMEOUT_MS,
      "写真解析"
    );
    // 背景適用直後も念のため再撤去
    dismissPhotoPickerChrome();
    // 背景適用後はペン描画へ戻す
    setTool("pen");
    suppressPopstateBackGuard(3000);
  } catch (err) {
    console.error(err);
    console.error(
      "[survey-drawing] photo import failed",
      err,
      file?.name,
      file?.size
    );
    // エラー時点で読込フラグを落とす
    photoImportBusy = false;
    // sketch not found は致命エラーにしない
    if (isSketchNotFoundError(err)) {
      dismissPhotoPickerChrome();
      setStatus("図面未登録のため端末内で自動作図を続行します");
      setTool("pen");
      try {
        photoImportBusy = true;
        await withPhotoImportTimeout(
          runClientAutoDrawFromFile(file),
          PHOTO_IMPORT_TIMEOUT_MS,
          "端末内自動作図"
        );
      } catch (fallbackErr) {
        console.error(fallbackErr);
        photoImportBusy = false;
        alert("解析中にエラーが発生しました。再度お試しください");
      }
    } else {
      // 実機で原因をすぐ追えるよう通知
      alert("解析中にエラーが発生しました。再度お試しください");
      notifySurveyPhotoLoadError(file.name, err?.message);
      setTool("pen");
    }
  } finally {
    // 成功・失敗・例外・タイムアウト問わず解放
    if (input) input.value = "";
    // JS側の読込Stateを確実に false
    photoImportBusy = false;
    // フラグ解除＋DOM物理 display:none
    releasePhotoImportUiLock();
    // 念のためもう一度全遮断幕を粉砕
    forceNukeTouchBlockerEl($("drawing-photo-import-lock"));
    forceNukeTouchBlockerEl($("drawing-photo-picker-backdrop"));
    forceNukeTouchBlockerEl($("drawing-photo-picker"));
  }
}

function wireSurveyFileInput() {
  const onCancel = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    suppressPopstateBackGuard(3000);
    dismissPhotoPickerChrome();
    setTool("pen");
  };
  // labelタップで開いた時刻を記録し
  // focus復帰でキャンセル判定する
  const onInputActivate = (ev) => {
    // 起動自体は止めず伝播のみ遮断
    ev?.stopPropagation?.();
    photoPickerFileOpenedAt = Date.now();
    // ピッカー表示中の誤った戻るを防ぐ
    suppressPopstateBackGuard(15000);
  };
  // ピッカーlabelの伝播だけ遮断
  // （for起動は妨げない）
  const stopLabelBubble = (ev) => {
    ev.stopPropagation();
    suppressPopstateBackGuard(15000);
    photoPickerFileOpenedAt = Date.now();
  };
  for (const id of ["btn-photo-camera", "btn-photo-album"]) {
    const label = $(id);
    label?.addEventListener("click", stopLabelBubble);
    label?.addEventListener("pointerdown", stopLabelBubble);
  }
  for (const id of ["survey-camera-input", "survey-album-input"]) {
    const input = $(id);
    input?.addEventListener("change", handleSurveyFileSelected);
    input?.addEventListener("cancel", onCancel);
    input?.addEventListener("click", onInputActivate);
  }
  // 写真formのsubmitを完全に遮断
  const photoForm = $("survey-photo-pick-form");
  photoForm?.addEventListener(
    "submit",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    },
    true
  );
  document.addEventListener(
    "submit",
    (ev) => {
      const t = ev.target;
      if (
        t?.id === "survey-photo-pick-form" ||
        t?.contains?.($("survey-camera-input")) ||
        t?.contains?.($("survey-album-input"))
      ) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    },
    true
  );
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
  const layer = document.getElementById("survey-bg-photo-layer");
  const cssBg = layer?.style?.backgroundImage || "";
  return !!(
    sketch?.backgroundImageUrl ||
    (layer && !layer.classList.contains("hidden") && cssBg && cssBg !== "none")
  );
}

function syncMaterialBarUi() {
  updateMaterialBarVisibility({ hasPhoto: hasBackgroundPhoto(), $ });
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
  // ツール切替時は描画状態を完全リセット
  // （消しゴム→ペンで描画モードが残らないように）
  currentStroke = null;
  panStart = null;
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
  // プレビュー残骸を消して通常描画へ復帰
  renderPaths();
  if (next !== "select") renderOverlay();
  if (next === "voice-pin") {
    setStatus("🎤 音声ピン — 図面上をタップして話してください");
  } else if (next === "eraser") {
    setStatus("消しゴム — 触れた線を完全削除します");
  } else if (next === "pen") {
    setStatus("ペン — 自由に書き込めます");
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
  // 消しゴムは指オフセット無し（当たり判定を正確に）
  const pt =
    tool === "eraser"
      ? imageCoords(ev.clientX, ev.clientY)
      : imageCoordsForPlot(ev.clientX, ev.clientY, ev.pointerType);

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
      // 消しゴムは透明上書きしない（確定時に物理削除）
      color: isEraser ? "#94a3b8" : color,
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
  // 消しゴムは触れた線をプレビュー削除（マスクしない）
  if (currentStroke.tool === "eraser") {
    renderPaths(currentStroke);
    return;
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
      if (currentStroke.tool === "eraser") {
        // 触れたパスを配列から完全削除（再描画可能）
        pushUndoSnapshot();
        applyEraserPhysicalDelete(currentStroke);
        markDirty();
      } else {
        pushUndoSnapshot();
        currentStroke.lengthPx = pathLength(currentStroke.points);
        layers.paths.push(currentStroke);
        markDirty();
      }
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

/** 写真背景時もラップ寸法へ同期
   naturalWidth を読まずメモリ安全 */
function syncPhotoStageSize() {
  const stage = $("drawing-stage");
  const wrap = $("drawing-stage-wrap");
  const layer = ensureSurveyBgPhotoLayer();
  if (!stage || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(240, Math.floor(rect.height));
  stageSize = { w, h };
  layers.canvasWidth = w;
  layers.canvasHeight = h;
  stage.classList.remove("drawing-grid-paper");
  stage.classList.add("has-photo-bg");
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  layer.style.width = "100%";
  layer.style.height = "100%";
  applyViewportTransform();
  renderAll();
}

/** 背面divへCSS背景のみ適用
   Image/Canvasは一切使わない */
function applyCssPhotoBackground(url) {
  // ID完全一致の背面層を必ず取得
  const layer = ensureSurveyBgPhotoLayer();
  const ph = $("drawing-bg-placeholder");
  const safeUrl = String(url || "").trim();
  if (!safeUrl) throw new Error("bg url missing");
  // url() 内の引用符をエスケープ
  const escaped = safeUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // display:none を外してblobを敷く
  layer.style.display = "";
  layer.style.backgroundImage = `url("${escaped}")`;
  layer.style.backgroundSize = "contain";
  layer.style.backgroundRepeat = "no-repeat";
  layer.style.backgroundPosition = "center";
  layer.dataset.bgUrl = safeUrl;
  layer.classList.remove("hidden");
  layer.setAttribute("aria-hidden", "false");
  ph?.classList.add("hidden");
  syncPhotoStageSize();
}

/** File を Base64 DataURL 化
   Canvas/Imageは使わずバイト読取のみ */
async function fileToBase64DataUrl(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize)
    );
  }
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

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

/** 背景を背面divのCSSへセット
   createObjectURLのみ・デコードなし */
async function setupBgImage(url) {
  const layer = ensureSurveyBgPhotoLayer();
  const ph = $("drawing-bg-placeholder");

  releaseBgObjectUrl();
  let src = withDrawingBgCacheBust(url);

  // 自前で作ったblobは解放対象に登録
  if (src.startsWith("blob:")) {
    bgObjectUrl = src;
  }

  try {
    applyCssPhotoBackground(src);
    markDirty();
    syncMaterialBarUi();
    // エディタへも同じURLをCSS背景で共有
    drawingEditorState?.canvas?.setBackgroundUrl?.(src);
    // 背景セット完了＝ピッカー完全撤去
    dismissPhotoPickerChrome();
    return { width: stageSize.w, height: stageSize.h };
  } catch (err) {
    // 失敗時も透明ブロックを残さない
    dismissPhotoPickerChrome();
    layer.classList.add("hidden");
    layer.style.backgroundImage = "";
    delete layer.dataset.bgUrl;
    ph?.classList.remove("hidden");
    throw err instanceof Error ? err : new Error(String(err));
  }
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
  const layer = document.getElementById("survey-bg-photo-layer");
  // 方眼紙へ戻すとき写真CSS背景をクリア
  if (layer) {
    layer.style.backgroundImage = "";
    delete layer.dataset.bgUrl;
    layer.classList.add("hidden");
    layer.setAttribute("aria-hidden", "true");
  }
  releaseBgObjectUrl();
  stage?.classList.remove("has-photo-bg");
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
        // サーバ未登録時は端末内モードへ切替
        isLocalOnlyMode = true;
        isTempMode = true;
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

/** 写真選択直後はCSS背景のみ適用
   Canvas/createImageBitmapは表示に使わない */
async function importBackground(file) {
  try {
    if (!file || !(file instanceof Blob)) {
      throw new Error("file missing");
    }
    if (file.size <= 0) throw new Error("file empty");
    if (!isLikelyImageFile(file)) {
      throw new Error("not an image");
    }

    // 一時URLを背面divへ直接セット（デコードなし）
    const displayUrl = URL.createObjectURL(file);
    await setupBgImage(displayUrl);

    if (!sketch) sketch = { id: sketchId, projectId, title: "一時図面" };
    sketch.backgroundImageUrl = displayUrl;
    markDirty();
    syncMaterialBarUi();

    // 生 File で端末内AI自動作図（表示と分離）
    await runClientAutoDrawFromFile(file);

    // サーバ AI 作図は FormData で必ず送る
    // （一時図面でも画像解析は実行）
    const serverDrawPromise = runServerAutoDrawLines(file, file.name).catch(
      (err) => {
        console.error(err);
        console.warn("[survey-drawing] server auto-draw", err);
        return null;
      }
    );

    // 一時図面は背景APIをスキップし作図のみ
    if (isLocalOnlyMode || isTempDrawingId(sketchId)) {
      await serverDrawPromise;
      setStatus("背景写真を取り込み・自動作図しました（端末内）");
      return;
    }

    // サーバ保存はバイト読取のみ（drawImageなし）
    let imageBase64;
    try {
      imageBase64 = await fileToBase64DataUrl(file);
    } catch (readErr) {
      console.error(readErr);
      console.warn("[survey-drawing] base64 read skipped", readErr);
      await serverDrawPromise;
      setStatus("背景写真を取り込みました（端末内表示）");
      return;
    }

    const mimeType = file.type || "image/jpeg";
    const bgPayload = {
      sketchId,
      imageBase64,
      fileName: file.name || "sketch.jpg",
      mimeType,
    };

    if (!isNetworkOnlineV1()) {
      sketch.backgroundImageUrl = displayUrl;
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
          fileName: file.name || "sketch.jpg",
          mimeType,
          canvasWidth: stageSize.w,
          canvasHeight: stageSize.h,
        }
      );
      sketch = data.sketch;
      if (sketch.backgroundImageUrl) {
        // サーバURLへ差し替え（表示は引き続きCSS）
        await setupBgImage(sketch.backgroundImageUrl);
      }
      await serverDrawPromise;
      setStatus("背景写真を取り込み・自動作図しました");
      syncMaterialBarUi();
      await loadSpecPhotoSlotsForDrawing();
    } catch (e) {
      console.error(e);
      // sketch not found でも FormData 作図は待つ
      await serverDrawPromise;
      if (isSketchNotFoundError(e)) {
        isLocalOnlyMode = true;
        isTempMode = true;
        sketch.backgroundImageUrl = displayUrl;
        markDirty();
        setStatus(
          `図面未登録のため端末内で自動作図を維持します（${file.name || "sketch.jpg"}）`
        );
        return;
      }
      sketch.backgroundImageUrl = displayUrl;
      markDirty();
      enqueueOfflineResilienceV1("drawing_background", bgPayload);
      const hint = e.message === "offline" ? "オフライン" : e.message || "失敗";
      setStatus(`端末内に保存しました（背景 · ${hint} · 復帰後に再送）`);
    }
  } catch (err) {
    console.error(err);
    // 上位の handleSurveyFileSelected へ再送出
    throw err;
  } finally {
    // 取込処理の途中失敗でも遮断幕を撤去
    dismissPhotoPickerChrome();
  }
}

/**
 * 生 File から間取り線を検出し layers へ反映
 * 2本未満のときだけ外枠へ落とす
 * @param {Blob} file
 */
async function runClientAutoDrawFromFile(file) {
  if (!file || !(file instanceof Blob)) return;
  try {
    pushUndoSnapshot();
    const result = await detectSketchLinesFromBlobV1(file, {
      canvasWidth: stageSize.w || layers.canvasWidth || 800,
      canvasHeight: stageSize.h || layers.canvasHeight || 600,
      fileName: file.name || "sketch.jpg",
    });
    applyAutoDrawnPaths(result.paths);
    const n = result.paths?.length ?? 0;
    if (result.usedFallback) {
      setStatus(
        `自動作図（外枠フォールバック）· ${n}本（${result.fileName || "sketch.jpg"}）`
      );
    } else {
      setStatus(`自動作図完了 · 間取り線 ${n} 本`);
    }
  } catch (err) {
    console.error(err);
    console.warn("[survey-drawing] client auto-draw fallback", err);
    // 例外時も外枠で着地（フリーズ回避）
    try {
      applyAutoDrawnPaths(
        buildFallbackOuterFramePaths(
          stageSize.w || 800,
          stageSize.h || 600
        )
      );
      setStatus(
        `自動作図（外枠フォールバック）を適用しました（${file?.name || "sketch.jpg"}）`
      );
    } catch (applyErr) {
      console.error(applyErr);
      alert("解析中にエラーが発生しました。再度お試しください");
    }
  } finally {
    // 端末内解析後もタッチを解放
    dismissPhotoPickerChrome();
  }
}

/**
 * サーバ auto-draw-lines API
 * FormData で file=sketch.jpg を明示送信
 * @param {Blob} file
 * @param {string} fileName
 */
async function runServerAutoDrawLines(file, fileName) {
  if (!file || !(file instanceof Blob) || file.size <= 0) return null;
  if (!isNetworkOnlineV1()) return null;

  try {
    // 一時IDでも解析用に送る
    // （サーバは sketch 無しでも検出）
    const apiSketchId =
      sketchId && !isTempDrawingId(sketchId) ? sketchId : "ephemeral-auto-draw";

    // 1500px JPEG・拡張子付きで送信
    const uploadFile = await prepareSketchUploadFileV1(file);
    const formData = new FormData();
    // 第3引数で sketch.jpg を必ず指定
    formData.append("file", uploadFile, "sketch.jpg");
    formData.append("image", uploadFile, "sketch.jpg");
    formData.append("fileName", fileName || "sketch.jpg");
    formData.append("canvasWidth", String(stageSize.w || 800));
    formData.append("canvasHeight", String(stageSize.h || 600));
    formData.append("applyToCanvas", "true");

    const token = sessionStorage.getItem(TOKEN_KEY);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    // Content-Type は付けない（boundary 自動）

    const res = await fetch(
      `/api/survey/v1/drawing-sketches/${encodeURIComponent(apiSketchId)}/auto-draw-lines`,
      { method: "POST", headers, body: formData }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || String(res.status));
    }

    if (data.sketch?.layers && data.sketchFound) {
      layers = migrateLayers(
        data.sketch.layers,
        data.sketch.layers.canvasWidth,
        data.sketch.layers.canvasHeight
      );
      sketch = data.sketch;
      renderAll();
      markDirty();
    } else if (data.lineDetect?.paths?.length) {
      const usedFb = Boolean(data.lineDetect.usedFallback);
      const paths = data.lineDetect.paths.map((p) => ({
        ...p,
        autoDrawn: true,
        fallbackFrame: usedFb,
      }));
      if (!usedFb) {
        // 実検出成功時は端末側の外枠を捨てる
        layers.paths = (layers.paths ?? []).filter(
          (p) => !p?.fallbackFrame && !p?.autoDrawn
        );
      }
      applyAutoDrawnPaths(paths);
      if (!usedFb) {
        setStatus(
          `自動作図完了 · 間取り線 ${paths.length} 本（サーバ）`
        );
      }
    }
    return data;
  } catch (err) {
    console.error(err);
    console.warn("[survey-drawing] runServerAutoDrawLines failed", err);
    throw err;
  } finally {
    // fetch失敗時も遮断幕を残さない
    dismissPhotoPickerChrome();
  }
}

/**
 * 自動作図パスを layers へマージして再描画
 * 実検出時は外枠フォールバックを置き換える
 * @param {Array<object>} paths
 * @param {{ replaceFallback?: boolean }} opts
 */
function applyAutoDrawnPaths(paths, opts = {}) {
  if (!Array.isArray(paths) || !paths.length) return;
  const hasRealWalls = paths.some((p) => !p?.fallbackFrame);
  if (opts.replaceFallback !== false && hasRealWalls) {
    // 外枠だけ残っている場合は実線で置換
    layers.paths = (layers.paths ?? []).filter((p) => !p?.fallbackFrame);
  }
  const existing = new Set((layers.paths ?? []).map((p) => p.id));
  for (const p of paths) {
    if (!p?.id || existing.has(p.id)) continue;
    layers.paths.push({
      id: p.id,
      tool: p.tool || "line",
      lineType: p.lineType || "generic",
      color: p.color || "#0f172a",
      width: p.width || 3,
      points: p.points || [],
      lengthPx: p.lengthPx || pathLength(p.points || []),
      fallbackFrame: Boolean(p.fallbackFrame),
      autoDrawn: true,
    });
  }
  renderAll();
  markDirty();
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
  const pathCount = data.autoPlot?.paths?.length ?? 0;
  const counts = data.symbolCountHandoff?.symbolCounts ?? [];
  const countText = counts.map((c) => `${c.label}${c.count}`).join(" · ");
  const fallbackHint = data.autoPlot?.pathsUsedFallback ? "（外枠フォールバック）" : "";
  setStatus(
    `AI解析完了 — 線${pathCount}本 · 記号${symCount}件 · メモ${memoCount}件${countText ? ` · ${countText}` : ""}${fallbackHint}（位置は手動修正可）`
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
  // 間取り線（自動作図）も反映
  if (autoPlot.paths?.length) {
    applyAutoDrawnPaths(autoPlot.paths);
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
    if (show) suppressPopstateBackGuard(15000);
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
    runGridOcrAndAutoPlot().catch((e) => {
      // sketch not found でも外枠で着地
      if (isSketchNotFoundError(e)) {
        applyAutoDrawnPaths(
          buildFallbackOuterFramePaths(stageSize.w || 800, stageSize.h || 600)
        );
        setStatus(
          `図面未登録のため外枠フォールバックで作図しました（${sketch?.backgroundImagePath?.split("/").pop() || "sketch.jpg"}）`
        );
        return;
      }
      setStatus(e.message || "AI解析に失敗しました");
    })
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
  // labelのforでOS直起動。
  // JSの.click()連動は使わない
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

  window.addEventListener("resize", () => {
    const stage = $("drawing-stage");
    if (stage?.classList.contains("has-photo-bg")) {
      syncPhotoStageSize();
    } else {
      syncGridStageSize();
    }
  });

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
    // focus復帰時の誤popstateも抑止
    suppressPopstateBackGuard(5000);
    const cameraInput = $("survey-camera-input");
    const albumInput = $("survey-album-input");
    window.setTimeout(() => {
      if (!photoPickerOpen) return;
      if (cameraInput?.files?.length || albumInput?.files?.length) return;
      dismissPhotoPickerChrome();
      setTool("pen");
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
      isLocalOnlyMode = true;
      isTempMode = true;
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
