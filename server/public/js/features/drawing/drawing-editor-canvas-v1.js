/**
 * 蝗ｳ髱｢繧ｨ繝・ぅ繧ｿ v1 窶・謇区嶌縺榊・逵溯レ譎ｯ + SVG 險伜捷繝ｬ繧､繝､
 * 豁｣隕丞喧蠎ｧ讓呻ｼ・縲・・峨〒繝励Ο繝・ヨ繧剃ｿ晄戟
 */

/** 譁ｹ逵ｼ邏咎｢ｨ繝繝溘・閭梧勹・・ata URL SVG・・*/
export const DRAWING_EDITOR_DUMMY_BG_V1 =
  "data:image/svg+xml," +
  encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f8fafc"/>
  <defs>
    <pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#cbd5e1" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <text x="600" y="400" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#64748b">謇区嶌縺肴婿逵ｼ邏呻ｼ医ム繝溘・・・/text>
</svg>`);

/**
 * @param {object} opts
 * @param {HTMLElement} opts.stageEl
 * @param {HTMLImageElement|null} opts.bgEl
 * @param {SVGSVGElement|null} opts.svgEl
 */
export function createDrawingEditorCanvasV1(opts) {
  const { stageEl, bgEl, svgEl } = opts;
  if (!stageEl) throw new Error("stageEl 縺悟ｿ・ｦ√〒縺・);

  stageEl.classList.add("drawing-editor-v1-stage");

  /** @type {HTMLImageElement} */
  let bgImage = bgEl;
  if (!bgImage) {
    bgImage = document.createElement("img");
    bgImage.className = "drawing-editor-v1-bg";
    bgImage.alt = "謇区嶌縺肴婿逵ｼ邏・;
    stageEl.prepend(bgImage);
  } else {
    bgImage.classList.add("drawing-editor-v1-bg");
  }

  /** @type {SVGSVGElement} */
  let svg = svgEl;
  if (!svg || svg.tagName?.toLowerCase() !== "svg") {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "drawing-editor-v1-svg");
    stageEl.appendChild(svg);
  } else {
    svg.classList.add("drawing-editor-v1-svg");
  }

  let symbolLayer = svg.querySelector("#de-v1-symbol-layer");
  if (!symbolLayer) {
    symbolLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    symbolLayer.setAttribute("id", "de-v1-symbol-layer");
    svg.appendChild(symbolLayer);
  }

  /** @type {Array<{id:string,symbolType:string,icon:string,label:string,x:number,y:number}>} */
  let plots = [];

  function syncSvgViewBox() {
    const w = stageEl.clientWidth || 800;
    const h = stageEl.clientHeight || 600;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    return { w, h };
  }

  function setBackgroundUrl(url) {
    const src = (url || "").trim() || DRAWING_EDITOR_DUMMY_BG_V1;
    bgImage.src = src;
    bgImage.classList.remove("hidden");
    return src;
  }

  function getBackgroundUrl() {
    return bgImage.src || DRAWING_EDITOR_DUMMY_BG_V1;
  }

  function renderPlots() {
    symbolLayer.replaceChildren();
    const { w, h } = syncSvgViewBox();
    for (const plot of plots) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "de-v1-symbol");
      g.setAttribute("data-plot-id", plot.id);
      const cx = plot.x * w;
      const cy = plot.y * h;
      g.setAttribute("transform", `translate(${cx}, ${cy})`);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.textContent = plot.icon;
      g.appendChild(text);
      symbolLayer.appendChild(g);
    }
  }

  /**
   * 繧ｹ繝・・繧ｸ荳翫・繧ｿ繝・・蠎ｧ讓吶ｒ
   * 豁｣隕丞喧 0縲・ 縺ｫ螟画鋤
   */
  function clientToNormalized(clientX, clientY) {
    const rect = stageEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0.5, y: 0.5 };
    }
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  function addPlot(plot) {
    plots = [...plots, plot];
    renderPlots();
    return plot;
  }

  function getPlots() {
    return plots.slice();
  }

  function setPlots(next) {
    plots = Array.isArray(next) ? next.slice() : [];
    renderPlots();
  }

  function getCanvasSize() {
    const { w, h } = syncSvgViewBox();
    return { width: w, height: h };
  }

  // 蛻晄悄繝繝溘・閭梧勹
  setBackgroundUrl("");
  renderPlots();

  return {
    stageEl,
    bgImage,
    svg,
    setBackgroundUrl,
    getBackgroundUrl,
    clientToNormalized,
    addPlot,
    getPlots,
    setPlots,
    renderPlots,
    getCanvasSize,
    syncSvgViewBox,
  };
}
