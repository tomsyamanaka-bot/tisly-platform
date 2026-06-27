/**
 * 図面エディタ v1 — ブートストラップ
 * survey-drawing-v1 から呼び出すモック基盤
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
    exportedAt: new Date().toISOString(),
  };
}

/**
 * @param {object} [opts]
 * @param {HTMLElement|null} [opts.stageWrapEl]
 * @param {HTMLElement|null} [opts.stageEl]
 * @param {HTMLImageElement|null} [opts.bgEl]
 * @param {SVGSVGElement|null} [opts.svgEl]
 * @param {HTMLElement|null} [opts.dockEl]
 * @param {(msg: string) => void} [opts.onStatus]
 */
export function initDrawingEditorFoundationV1(opts = {}) {
  const stageEl =
    opts.stageEl ||
    opts.stageWrapEl?.querySelector("#drawing-stage") ||
    document.getElementById("drawing-stage");
  const bgEl = opts.bgEl || document.getElementById("drawing-bg");
  const svgEl = opts.svgEl || document.getElementById("drawing-svg");
  const dockEl = opts.dockEl || document.getElementById("drawing-symbol-dock-v1");

  if (!stageEl || !dockEl) {
    return null;
  }

  const canvas = createDrawingEditorCanvasV1({ stageEl, bgEl, svgEl });

  /** @type {{ canvas: ReturnType<typeof createDrawingEditorCanvasV1>, palette: ReturnType<typeof createDrawingSymbolPaletteV1>|null, lastPayload: object|null, _bgObserver?: MutationObserver }} */
  const state = { canvas, palette: null, lastPayload: null };

  // 既存 bg があれば引き継ぎ、なければダミー
  if (bgEl?.src && !bgEl.classList.contains("hidden")) {
    canvas.setBackgroundUrl(bgEl.src);
  }

  state.palette = createDrawingSymbolPaletteV1({
    dockEl,
    canvas,
    onStatus: opts.onStatus,
    onPlotsChange: () => {
      state.lastPayload = buildDrawingEditorPdfPayloadClientV1(state);
    },
  });

  // 背景画像が後から読み込まれた場合に追従
  if (bgEl) {
    const obs = new MutationObserver(() => {
      if (bgEl.src && !bgEl.classList.contains("hidden")) {
        canvas.setBackgroundUrl(bgEl.src);
        state.lastPayload = buildDrawingEditorPdfPayloadClientV1(state);
      }
    });
    obs.observe(bgEl, { attributes: true, attributeFilter: ["src", "class"] });
    state._bgObserver = obs;
  }

  state.lastPayload = buildDrawingEditorPdfPayloadClientV1(state);
  return state;
}

export { createDrawingEditorCanvasV1, createDrawingSymbolPaletteV1 };
