/** 現調図面 v1 — 方眼紙写真 + 線・記号・メモ（タッチ/ペン対応） */

const TOKEN_KEY = "tisly_token";

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
  const res = await fetch(path, {
    method,
    headers: apiHeaders(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
}

function uid() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function setStatus(msg) {
  const el = $("drawing-status");
  if (el) el.textContent = msg;
}

let sketchId = params().get("sketchId") || "";
let projectId = params().get("projectId") || "";
let sketch = null;
let tool = "pen";
let strokeColor = "#dc2626";
let strokeWidth = 3;
let viewport = { scale: 1, offsetX: 0, offsetY: 0 };
let layers = { version: 1, strokes: [], symbols: [], textMemos: [], viewport };
let symbolPalette = [];
let pendingSymbol = null;
let currentStroke = null;
let panStart = null;
let pinchStart = null;
let stageSize = { w: 800, h: 600 };
let saveTimer = null;
let dirty = false;

function applyViewportTransform() {
  const stage = $("drawing-stage");
  if (!stage) return;
  stage.style.transform = `translate(calc(-50% + ${viewport.offsetX}px), calc(-50% + ${viewport.offsetY}px)) scale(${viewport.scale})`;
}

function imageCoords(clientX, clientY) {
  const stage = $("drawing-stage");
  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left) / viewport.scale;
  const y = (clientY - rect.top) / viewport.scale;
  return { x, y };
}

function renderStrokes() {
  const svg = $("drawing-svg");
  if (!svg) return;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${stageSize.w} ${stageSize.h}`);
  svg.setAttribute("width", String(stageSize.w));
  svg.setAttribute("height", String(stageSize.h));
  for (const s of layers.strokes) {
    if (!s.points?.length) continue;
    if (s.tool === "line" && s.points.length >= 2) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", s.points[0].x);
      line.setAttribute("y1", s.points[0].y);
      line.setAttribute("x2", s.points[s.points.length - 1].x);
      line.setAttribute("y2", s.points[s.points.length - 1].y);
      line.setAttribute("stroke", s.color);
      line.setAttribute("stroke-width", s.width);
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = s.points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", s.width);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
    }
  }
}

function renderOverlay() {
  const mount = $("drawing-overlay");
  if (!mount) return;
  mount.innerHTML = "";
  for (const sym of layers.symbols) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "drawing-symbol";
    el.style.left = `${sym.x}px`;
    el.style.top = `${sym.y}px`;
    el.style.color = sym.color || "#2563eb";
    el.title = sym.label;
    el.textContent = sym.icon || "📍";
    el.addEventListener("click", () => {
      const memo = prompt("記号メモ（任意）", sym.memo || "");
      if (memo != null) {
        sym.memo = memo;
        markDirty();
        renderOverlay();
      }
    });
    mount.appendChild(el);
  }
  for (const m of layers.textMemos) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "drawing-memo";
    el.style.left = `${m.x}px`;
    el.style.top = `${m.y}px`;
    el.style.fontSize = `${m.fontSize || 14}px`;
    el.style.color = m.color || "#0f172a";
    el.textContent = m.text;
    el.addEventListener("click", () => {
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
  renderStrokes();
  renderOverlay();
  applyViewportTransform();
}

function markDirty() {
  dirty = true;
  setStatus("未保存の変更があります");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSketch().catch(() => {}), 2000);
}

async function saveSketch() {
  if (!sketchId) return;
  viewport = { ...viewport, ...layers.viewport };
  layers.viewport = { scale: viewport.scale, offsetX: viewport.offsetX, offsetY: viewport.offsetY };
  const data = await api("PATCH", `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}`, {
    layers,
    title: sketch?.title,
  });
  sketch = data.sketch;
  dirty = false;
  setStatus(`保存済み ${new Date().toLocaleTimeString("ja-JP")}`);
}

function setTool(next) {
  tool = next;
  pendingSymbol = null;
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === next);
  });
  $("symbol-palette")?.classList.toggle("hidden", next !== "symbol");
}

function onPointerDown(ev) {
  if (ev.pointerType === "touch" && ev.isPrimary === false) return;
  const wrap = $("drawing-stage-wrap");
  wrap?.setPointerCapture?.(ev.pointerId);
  const pt = imageCoords(ev.clientX, ev.clientY);

  if (tool === "pan") {
    panStart = { x: ev.clientX - viewport.offsetX, y: ev.clientY - viewport.offsetY };
    return;
  }
  if (tool === "symbol" && pendingSymbol) {
    layers.symbols.push({
      id: uid(),
      symbolType: pendingSymbol.symbolType,
      label: pendingSymbol.label,
      icon: pendingSymbol.icon,
      color: pendingSymbol.color,
      x: pt.x,
      y: pt.y,
      rotation: 0,
      memo: "",
    });
    markDirty();
    renderOverlay();
    return;
  }
  if (tool === "text") {
    const text = prompt("テキストメモ");
    if (text?.trim()) {
      layers.textMemos.push({
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
  if (tool === "pen" || tool === "line") {
    currentStroke = {
      id: uid(),
      tool: tool === "line" ? "line" : "pen",
      color: strokeColor,
      width: strokeWidth,
      points: [pt],
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
  if (currentStroke.tool === "line") {
    currentStroke.points = [currentStroke.points[0], pt];
  } else {
    currentStroke.points.push(pt);
  }
  const temp = [...layers.strokes, currentStroke];
  const prev = layers.strokes;
  layers.strokes = temp;
  renderStrokes();
  layers.strokes = prev;
}

function onPointerUp() {
  panStart = null;
  if (currentStroke) {
    if (currentStroke.points.length >= (currentStroke.tool === "line" ? 2 : 1)) {
      layers.strokes.push(currentStroke);
      markDirty();
    }
    currentStroke = null;
    renderStrokes();
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
    img.classList.remove("hidden");
    ph?.classList.add("hidden");
    renderAll();
  };
  img.src = url;
  if (img.complete) img.onload?.();
}

async function loadSketch() {
  if (!sketchId && projectId) {
    const created = await api("POST", `/api/survey/v1/projects/${encodeURIComponent(projectId)}/drawing-sketches`, {
      title: "現調図面",
    });
    sketch = created.sketch;
    sketchId = sketch.id;
    history.replaceState(null, "", `?sketchId=${encodeURIComponent(sketchId)}&projectId=${encodeURIComponent(projectId)}`);
  } else if (sketchId) {
    const data = await api("GET", `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}`);
    sketch = data.sketch;
    projectId = sketch.projectId;
  } else {
    throw new Error("projectId または sketchId が必要です");
  }
  layers = sketch.layers || layers;
  viewport = { scale: 1, offsetX: 0, offsetY: 0, ...layers.viewport };
  $("drawing-title").textContent = sketch.title || "現調図面";
  if (sketch.backgroundImageUrl) setupBgImage(sketch.backgroundImageUrl);
  else renderAll();
}

async function loadSymbols() {
  const data = await api("GET", "/api/survey/v1/drawing-sketches/symbols");
  symbolPalette = data.symbols || [];
  const mount = $("symbol-palette");
  if (!mount) return;
  mount.innerHTML = symbolPalette
    .map(
      (s) =>
        `<button type="button" data-symbol="${s.symbolType}" title="${s.label}">${s.icon} ${s.label}</button>`
    )
    .join("");
  mount.querySelectorAll("[data-symbol]").forEach((btn) => {
    btn.addEventListener("click", () => {
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
  const data = await api(
    "POST",
    `/api/survey/v1/drawing-sketches/${encodeURIComponent(sketchId)}/background`,
    { imageBase64, fileName: file.name, mimeType: file.type }
  );
  sketch = data.sketch;
  setupBgImage(sketch.backgroundImageUrl);
  setStatus("背景写真を取り込みました");
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
  wrap?.addEventListener("touchmove", (ev) => {
    if (ev.touches.length === 2) {
      ev.preventDefault();
      const dx = ev.touches[0].clientX - ev.touches[1].clientX;
      const dy = ev.touches[0].clientY - ev.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist > 0) zoomBy(dist / lastDist);
      lastDist = dist;
    }
  }, { passive: false });

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
  $("btn-back")?.addEventListener("click", () => {
    if (dirty && !confirm("未保存の変更があります。戻りますか？")) return;
    if (projectId) location.href = `/survey-v1?projectId=${encodeURIComponent(projectId)}`;
    else history.back();
  });

  $("btn-import-photo")?.addEventListener("click", () => $("file-bg")?.click());
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

  window.addEventListener("beforeunload", (ev) => {
    if (dirty) ev.preventDefault();
  });
}

async function main() {
  if (!sessionStorage.getItem(TOKEN_KEY)) {
    location.href = `/survey-v1?projectId=${encodeURIComponent(projectId)}`;
    return;
  }
  wireEvents();
  await loadSymbols();
  await loadSketch();
  setStatus("描画できます（指・タッチペン対応）");
}

main().catch((e) => setStatus(`エラー: ${e.message}`));
