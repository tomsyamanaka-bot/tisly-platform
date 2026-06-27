/**
 * ?????? v1 ? ????? + SVG ??????
 * ??? 0?1 ??????
 */

/** ??????data URL SVG? */
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
  <text x="600" y="400" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#64748b">???????????</text>
</svg>`);

const ROUTE_COLORS = {
  lan: "#2563eb",
  power100v: "#dc2626",
  power24v: "#ca8a04",
  generic: "#0f172a",
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.stageEl
 * @param {HTMLImageElement|null} opts.bgEl
 * @param {SVGSVGElement|null} opts.svgEl
 */
export function createDrawingEditorCanvasV1(opts) {
  const { stageEl, bgEl, svgEl } = opts;
  if (!stageEl) throw new Error("stageEl ?????");

  stageEl.classList.add("drawing-editor-v1-stage");

  /** @type {HTMLImageElement} */
  let bgImage = bgEl;
  if (!bgImage) {
    bgImage = document.createElement("img");
    bgImage.className = "drawing-editor-v1-bg";
    bgImage.alt = "????";
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

  let routeLayer = svg.querySelector("#de-v1-route-layer");
  if (!routeLayer) {
    routeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    routeLayer.setAttribute("id", "de-v1-route-layer");
    svg.appendChild(routeLayer);
  }

  let symbolLayer = svg.querySelector("#de-v1-symbol-layer");
  if (!symbolLayer) {
    symbolLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    symbolLayer.setAttribute("id", "de-v1-symbol-layer");
    svg.appendChild(symbolLayer);
  }

  /** @type {Array<{id:string,symbolType:string,icon:string,label:string,x:number,y:number}>} */
  let plots = [];
  /** @type {Array<{id:string,lineType:string,color:string,width:number,points:Array<{x:number,y:number}>}>} */
  let routes = [];
  /** @type {boolean} */
  let routeMode = false;
  /** @type {{points:Array<{x:number,y:number}>}|null} */
  let currentRoute = null;
  /** @type {((routes: unknown[]) => void)|null} */
  let onRoutesChange = null;

  function syncSvgViewBox() {
    const w = stageEl.clientWidth || 800;
    const h = stageEl.clientHeight || 600;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    return { w, h };
  }

  /** blob URL ? ???????? */
  let bgObjectUrl = null;

  function releaseBgImageMemory() {
    if (bgObjectUrl) {
      URL.revokeObjectURL(bgObjectUrl);
      bgObjectUrl = null;
    }
  }

  function withBgCacheBust(url) {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
    try {
      const u = new URL(url, location.origin);
      if (!u.searchParams.has("v")) {
        u.searchParams.set("v", "drawing-editor-v1");
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  function setBackgroundUrl(url) {
    releaseBgImageMemory();
    const src = withBgCacheBust((url || "").trim() || DRAWING_EDITOR_DUMMY_BG_V1);
    if (src.startsWith("blob:")) bgObjectUrl = src;
    bgImage.src = src;
    bgImage.classList.remove("hidden");
    bgImage.decode?.().catch(() => {});
    return src;
  }

  function getBackgroundUrl() {
    return bgImage.src || DRAWING_EDITOR_DUMMY_BG_V1;
  }

  function renderRoutes() {
    routeLayer.replaceChildren();
    const { w, h } = syncSvgViewBox();
    for (const route of routes) {
      if (!route.points?.length) continue;
      const color = route.color || ROUTE_COLORS[route.lineType] || ROUTE_COLORS.generic;
      const d = route.points
        .map((pt, i) => {
          const px = pt.x * w;
          const py = pt.y * h;
          return `${i ? "L" : "M"}${px} ${py}`;
        })
        .join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", String(route.width || 3));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("class", "de-v1-route");
      routeLayer.appendChild(path);
    }
    if (currentRoute?.points?.length) {
      const color = ROUTE_COLORS.generic;
      const d = currentRoute.points
        .map((pt, i) => {
          const px = pt.x * w;
          const py = pt.y * h;
          return `${i ? "L" : "M"}${px} ${py}`;
        })
        .join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "3");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-dasharray", "6 4");
      path.setAttribute("class", "de-v1-route de-v1-route-preview");
      routeLayer.appendChild(path);
    }
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

  function renderAll() {
    renderRoutes();
    renderPlots();
  }

  /**
   * ???????? ? ??? 0?1
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

  function uid() {
    return crypto.randomUUID?.() || `de-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  function getRoutes() {
    return routes.slice();
  }

  function setRoutes(next) {
    routes = Array.isArray(next) ? next.slice() : [];
    renderRoutes();
  }

  function addRoute(route) {
    routes = [...routes, route];
    renderRoutes();
    onRoutesChange?.(routes);
    return route;
  }

  function setRouteMode(enabled) {
    routeMode = !!enabled;
    stageEl.classList.toggle("is-route-mode", routeMode);
    if (!routeMode) {
      currentRoute = null;
      renderRoutes();
    }
  }

  function isRouteMode() {
    return routeMode;
  }

  function onRoutePointerDown(ev) {
    if (!routeMode) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pt = clientToNormalized(ev.clientX, ev.clientY);
    currentRoute = { points: [pt] };
    stageEl.setPointerCapture?.(ev.pointerId);
    renderRoutes();
  }

  function onRoutePointerMove(ev) {
    if (!routeMode || !currentRoute) return;
    ev.preventDefault();
    const pt = clientToNormalized(ev.clientX, ev.clientY);
    const start = currentRoute.points[0];
    currentRoute.points = [start, pt];
    renderRoutes();
  }

  function onRoutePointerUp(ev) {
    if (!routeMode || !currentRoute) return;
    ev.preventDefault();
    const pts = currentRoute.points;
    if (pts.length >= 2) {
      addRoute({
        id: uid(),
        lineType: "generic",
        color: ROUTE_COLORS.generic,
        width: 3,
        points: pts.map((p) => ({ x: p.x, y: p.y })),
      });
    }
    currentRoute = null;
    stageEl.releasePointerCapture?.(ev.pointerId);
    renderRoutes();
  }

  function bindRouteDrawing() {
    stageEl.addEventListener("pointerdown", onRoutePointerDown);
    stageEl.addEventListener("pointermove", onRoutePointerMove);
    stageEl.addEventListener("pointerup", onRoutePointerUp);
    stageEl.addEventListener("pointercancel", onRoutePointerUp);
  }

  function setOnRoutesChange(fn) {
    onRoutesChange = fn;
  }

  function getCanvasSize() {
    const { w, h } = syncSvgViewBox();
    return { width: w, height: h };
  }

  bindRouteDrawing();
  setBackgroundUrl("");
  renderAll();

  return {
    stageEl,
    bgImage,
    svg,
    setBackgroundUrl,
    releaseBgImageMemory,
    getBackgroundUrl,
    clientToNormalized,
    addPlot,
    getPlots,
    setPlots,
    getRoutes,
    setRoutes,
    addRoute,
    setRouteMode,
    isRouteMode,
    setOnRoutesChange,
    renderPlots,
    renderRoutes,
    renderAll,
    getCanvasSize,
    syncSvgViewBox,
  };
}
