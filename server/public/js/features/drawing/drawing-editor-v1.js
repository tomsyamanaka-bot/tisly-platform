/**
 * 図面エディタ v1 — ブートストラップ
 * survey-drawing-v1 から呼び出す実務連携基盤
 */
import { createDrawingEditorCanvasV1 } from "./drawing-editor-canvas-v1.js";
import { createDrawingSymbolPaletteV1 } from "./drawing-symbol-palette-v1.js";

export const DRAWING_EDITOR_V1_VERSION = "drawing-editor-v1";

/**
 * PDF 連携用 JSON を組み立て
 * （サーバー型 drawing-editor-payload-v1 と同形）
 */
export function buildDrawingEditorPdfPayloadClientV1(state) {
  const bg = state.canvas.getBackgroundUrl();
  const size = state.canvas.getCanvasSize();
  return {
    schemaVersion: 1,
    backgroundImageUrl: bg,
    canvasWidth: size.width,
    canvasHeight: size.height,
    symbols: state.canvas.getPlots(),
    routes: state.canvas.getRoutes(),
    exportedAt: new Date().toISOString(),
  };
}

/**
 * 保存済みペイロードをキャンバスへ復元
 * @param {ReturnType<typeof initDrawingEditorFoundationV1>} editorState
 * @param {object|null|undefined} payload
 */
export function applyDrawingEditorPayloadClientV1(editorState, payload) {
  if (!editorState?.canvas || !payload) return;
  if (payload.backgroundImageUrl) {
    editorState.canvas.setBackgroundUrl(payload.backgroundImageUrl);
  }
  if (Array.isArray(payload.symbols)) {
    editorState.canvas.setPlots(payload.symbols);
  }
  if (Array.isArray(payload.routes)) {
    editorState.canvas.setRoutes(payload.routes);
  }
  editorState.lastPayload = buildDrawingEditorPdfPayloadClientV1(editorState);
}

/**
 * layers.editorV1 からペイロードを抽出
 * @param {object|null|undefined} editorV1
 */
export function editorV1LayerToPayload(editorV1) {
  if (!editorV1) return null;
  return {
    schemaVersion: 1,
    backgroundImageUrl: editorV1.backgroundImageUrl || "",
    canvasWidth: editorV1.canvasWidth || 800,
    canvasHeight: editorV1.canvasHeight || 600,
    symbols: editorV1.symbols || [],
    routes: editorV1.routes || [],
    exportedAt: editorV1.exportedAt || new Date().toISOString(),
  };
}

/**
 * エディタ状態を layers.editorV1 保存形式へ
 * @param {ReturnType<typeof initDrawingEditorFoundationV1>} editorState
 */
export function editorStateToLayerV1(editorState) {
  return buildDrawingEditorPdfPayloadClientV1(editorState);
}

/**
 * @param {object} [opts]
 * @param {HTMLElement|null} [opts.stageWrapEl]
 * @param {HTMLElement|null} [opts.stageEl]
 * @param {HTMLElement|null} [opts.bgEl]
 * @param {SVGSVGElement|null} [opts.svgEl]
 * @param {HTMLElement|null} [opts.dockEl]
 * @param {(msg: string) => void} [opts.onStatus]
 * @param {object|null} [opts.initialPayload]
 * @param {(payload: object) => void} [opts.onPayloadChange]
 */
export function initDrawingEditorFoundationV1(opts = {}) {
  const stageEl =
    opts.stageEl ||
    opts.stageWrapEl?.querySelector("#drawing-stage") ||
    document.getElementById("drawing-stage");
  // img廃止 — 背面divのCSS背景層を参照
  const bgEl =
    opts.bgEl ||
    document.getElementById("survey-bg-photo-layer") ||
    document.getElementById("drawing-bg");
  const svgEl = opts.svgEl || document.getElementById("drawing-svg");
  const dockEl = opts.skipSymbolDock
    ? null
    : opts.dockEl || document.getElementById("drawing-symbol-dock-v1");

  if (!stageEl) {
    return null;
  }

  const canvas = createDrawingEditorCanvasV1({ stageEl, bgEl, svgEl });

  /** @type {{ canvas: ReturnType<typeof createDrawingEditorCanvasV1>, palette: ReturnType<typeof createDrawingSymbolPaletteV1>|null, lastPayload: object|null, _bgObserver?: MutationObserver }} */
  const state = { canvas, palette: null, lastPayload: null };

  function notifyChange() {
    state.lastPayload = buildDrawingEditorPdfPayloadClientV1(state);
    opts.onPayloadChange?.(state.lastPayload);
  }

  const existingBg = bgEl?.dataset?.bgUrl || "";
  if (existingBg && !bgEl.classList.contains("hidden")) {
    canvas.setBackgroundUrl(existingBg);
  }

  if (dockEl) {
    state.palette = createDrawingSymbolPaletteV1({
      dockEl,
      canvas,
      onStatus: opts.onStatus,
      onPlotsChange: () => notifyChange(),
      onRouteModeChange: (enabled) => {
        if (enabled) {
          opts.onStatus?.("通線モード — 始点と終点をドラッグ");
        }
      },
    });
  }

  canvas.setOnRoutesChange(() => notifyChange());

  if (bgEl) {
    // data-bg-url の変化のみ監視（ループ防止）
    const obs = new MutationObserver(() => {
      const url = bgEl.dataset?.bgUrl || "";
      if (!url || bgEl.classList.contains("hidden")) return;
      if (url === canvas.getBackgroundUrl()) return;
      canvas.setBackgroundUrl(url);
      notifyChange();
    });
    obs.observe(bgEl, {
      attributes: true,
      attributeFilter: ["data-bg-url", "class"],
    });
    state._bgObserver = obs;
  }

  if (opts.initialPayload) {
    applyDrawingEditorPayloadClientV1(state, opts.initialPayload);
  } else {
    notifyChange();
  }

  return state;
}

export { createDrawingEditorCanvasV1, createDrawingSymbolPaletteV1 };
