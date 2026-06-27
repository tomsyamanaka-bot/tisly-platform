/**
 * 図面エディタ v1 — 手袋対応記号パレット
 * 記号選択 → ステージタップでプロット
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
 */
export function createDrawingSymbolPaletteV1(opts) {
  const { dockEl, canvas, onStatus, onPlotsChange } = opts;
  if (!dockEl) throw new Error("dockEl が必要です");

  dockEl.classList.add("drawing-symbol-dock-v1");
  dockEl.setAttribute("role", "toolbar");
  dockEl.setAttribute("aria-label", "記号プロット");

  /** @type {SymbolMeta|null} */
  let activeSymbol = null;

  const hint = document.createElement("p");
  hint.className = "drawing-symbol-dock-v1__hint";
  hint.textContent = "記号を選んでから、図面をタップして配置";
  dockEl.appendChild(hint);

  const btnWrap = document.createElement("div");
  btnWrap.className = "drawing-symbol-dock-v1__row";
  dockEl.appendChild(btnWrap);

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
    canvas.stageEl.classList.toggle("is-plot-ready", !!activeSymbol);
  }

  for (const meta of DRAWING_SYMBOL_CATALOG_V1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drawing-symbol-dock-v1__btn";
    btn.dataset.symbolType = meta.symbolType;
    btn.setAttribute("aria-label", meta.label);
    btn.innerHTML = `${meta.icon}<span>${meta.label}</span>`;
    btn.addEventListener("click", () => {
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
    if (!activeSymbol) return;
    if (ev.target?.closest?.(".drawing-symbol-dock-v1")) return;

    ev.preventDefault();
    ev.stopPropagation();
    const pt = canvas.clientToNormalized(ev.clientX, ev.clientY);
    const plot = canvas.addPlot({
      id: uid(),
      symbolType: activeSymbol.symbolType,
      icon: activeSymbol.icon,
      label: activeSymbol.label,
      x: pt.x,
      y: pt.y,
    });
    onPlotsChange?.(canvas.getPlots());
    setStatus(`${activeSymbol.label} を配置 (${Math.round(pt.x * 100)}%, ${Math.round(pt.y * 100)}%)`);
  }

  canvas.stageEl.addEventListener("pointerdown", handleStagePointer);

  refreshActiveUi();

  return {
    getActiveSymbol: () => activeSymbol,
    setActiveSymbol: (meta) => {
      activeSymbol = meta;
      refreshActiveUi();
    },
    destroy: () => {
      canvas.stageEl.removeEventListener("pointerdown", handleStagePointer);
    },
  };
}
