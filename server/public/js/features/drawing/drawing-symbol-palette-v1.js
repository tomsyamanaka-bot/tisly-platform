/**
 * 図面エディタ v1 — 手袋対応記号パレット
 * 記号選択 · 通線モード切替
 */
import { createDrawingEditorCanvasV1 } from "./drawing-editor-canvas-v1.js";

/** @typedef {{ symbolType: string, icon: string, label: string }} SymbolMeta */

/** @type {SymbolMeta[]} */
export const DRAWING_SYMBOL_CATALOG_V1 = [
  { symbolType: "outlet", icon: "🔌", label: "コンセント" },
  { symbolType: "light", icon: "💡", label: "照明" },
  { symbolType: "switch", icon: "🔘", label: "スイッチ" },
];

function uid() {
  return crypto.randomUUID?.() || `plot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.dockEl
 * @param {import('./drawing-editor-canvas-v1.js').ReturnType<typeof createDrawingEditorCanvasV1>} opts.canvas
 * @param {(msg: string) => void} [opts.onStatus]
 * @param {(plots: unknown[]) => void} [opts.onPlotsChange]
 * @param {(enabled: boolean) => void} [opts.onRouteModeChange]
 */
export function createDrawingSymbolPaletteV1(opts) {
  const { dockEl, canvas, onStatus, onPlotsChange, onRouteModeChange } = opts;
  if (!dockEl) throw new Error("dockEl が必要です");

  dockEl.classList.add("drawing-symbol-dock-v1");
  dockEl.setAttribute("role", "toolbar");
  dockEl.setAttribute("aria-label", "記号プロット");

  /** @type {SymbolMeta|null} */
  let activeSymbol = null;

  const hint = document.createElement("p");
  hint.className = "drawing-symbol-dock-v1__hint";
  hint.textContent = "記号を選んでタップ配置 / 通線でケーブル描画";
  dockEl.appendChild(hint);

  const btnWrap = document.createElement("div");
  btnWrap.className = "drawing-symbol-dock-v1__row";
  dockEl.appendChild(btnWrap);

  /** @type {HTMLButtonElement|null} */
  let routeBtn = null;

  /** @type {HTMLButtonElement[]} */
  const buttons = [];

  function setStatus(msg) {
    onStatus?.(msg);
  }

  function refreshActiveUi() {
    for (const btn of buttons) {
      const type = btn.dataset.symbolType;
      btn.classList.toggle("is-active", !!activeSymbol && activeSymbol.symbolType === type);
    }
    const routeOn = canvas.isRouteMode();
    routeBtn?.classList.toggle("is-active", routeOn);
    canvas.stageEl.classList.toggle("is-plot-ready", !!activeSymbol && !routeOn);
    canvas.stageEl.classList.toggle("is-route-ready", routeOn);
  }

  routeBtn = document.createElement("button");
  routeBtn.type = "button";
  routeBtn.className = "drawing-symbol-dock-v1__btn drawing-symbol-dock-v1__btn-route";
  routeBtn.innerHTML = `〰️<span>通線</span>`;
  routeBtn.setAttribute("aria-label", "通線ルート描画");
  routeBtn.addEventListener("click", () => {
    const next = !canvas.isRouteMode();
    if (next) activeSymbol = null;
    canvas.setRouteMode(next);
    onRouteModeChange?.(next);
    setStatus(next ? "通線モード — ドラッグでケーブルルート" : "通線モードを解除");
    refreshActiveUi();
  });
  btnWrap.appendChild(routeBtn);

  for (const meta of DRAWING_SYMBOL_CATALOG_V1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drawing-symbol-dock-v1__btn";
    btn.dataset.symbolType = meta.symbolType;
    btn.setAttribute("aria-label", meta.label);
    btn.innerHTML = `${meta.icon}<span>${meta.label}</span>`;
    btn.addEventListener("click", () => {
      canvas.setRouteMode(false);
      if (activeSymbol?.symbolType === meta.symbolType) {
        activeSymbol = null;
        setStatus("記号選択を解除しました");
      } else {
        activeSymbol = meta;
        setStatus(`${meta.label} — 図面をタップして配置`);
      }
      refreshActiveUi();
    });
    btnWrap.appendChild(btn);
    buttons.push(btn);
  }

  function handleStagePointer(ev) {
    if (canvas.isRouteMode()) return;
    if (!activeSymbol) return;
    if (canvas.stageEl.dataset.gestureActive === "1") return;
    if (ev.pointerType === "touch" && ev.isPrimary === false) return;
    if (ev.target?.closest?.(".drawing-symbol-dock-v1")) return;

    ev.preventDefault();
    ev.stopPropagation();
    const pt = canvas.clientToNormalized(ev.clientX, ev.clientY, ev.pointerType);
    const placed = activeSymbol;
    canvas.addPlot({
      id: uid(),
      symbolType: placed.symbolType,
      icon: placed.icon,
      label: placed.label,
      x: pt.x,
      y: pt.y,
    });
    onPlotsChange?.(canvas.getPlots());
    activeSymbol = null;
    refreshActiveUi();
    setStatus(`${placed.label} を配置しました`);
  }

  canvas.stageEl.addEventListener("pointerdown", handleStagePointer);

  refreshActiveUi();

  return {
    getActiveSymbol: () => activeSymbol,
    setActiveSymbol: (meta) => {
      activeSymbol = meta;
      refreshActiveUi();
    },
    clearAfterPlot: () => {
      activeSymbol = null;
      canvas.setRouteMode(false);
      refreshActiveUi();
    },
    destroy: () => {
      canvas.stageEl.removeEventListener("pointerdown", handleStagePointer);
    },
  };
}
