/**
 * Gemini 生成壁 SVG の正規化・安全描画
 * DOMParser で挿入し、ペン／記号レイヤーの下に置く
 */

/**
 * API / layers から aiWallSvg を正規化
 * 文字列・オブジェクト両対応
 * @param {unknown} raw
 * @returns {{ markup: string, viewBox: string|null, width: number|null, height: number|null, provider: string|null, updatedAt: string|null }|null}
 */
export function normalizeAiWallSvgClientV1(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const markup = raw.trim();
    if (!markup || !/^<svg\b/i.test(markup)) return null;
    return {
      markup,
      viewBox: extractViewBoxFromMarkupV1(markup),
      width: null,
      height: null,
      provider: null,
      updatedAt: null,
    };
  }
  if (typeof raw !== "object") return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const markup =
    typeof obj.markup === "string"
      ? obj.markup.trim()
      : typeof obj.aiWallSvg === "string"
        ? String(obj.aiWallSvg).trim()
        : "";
  if (!markup || !/^<svg\b/i.test(markup)) return null;
  const viewBox =
    typeof obj.viewBox === "string" && obj.viewBox
      ? obj.viewBox
      : extractViewBoxFromMarkupV1(markup);
  return {
    markup,
    viewBox,
    width: obj.width != null ? Number(obj.width) || null : null,
    height: obj.height != null ? Number(obj.height) || null : null,
    provider: obj.provider != null ? String(obj.provider) : null,
    updatedAt: obj.updatedAt != null ? String(obj.updatedAt) : null,
  };
}

/**
 * markup から viewBox を抜く
 * @param {string} markup
 */
export function extractViewBoxFromMarkupV1(markup) {
  const m = String(markup || "").match(
    /\bviewBox\s*=\s*("([^"]*)"|'([^']*)')/i
  );
  return m?.[2] || m?.[3] || null;
}

/**
 * 最背面 AI SVG レイヤー要素を確保
 * 写真層の直後・drawing-svg の直前
 */
export function ensureAiWallSvgLayerV1() {
  let layer = document.getElementById("survey-ai-wall-svg-layer");
  if (layer) return layer;

  const stage = document.getElementById("drawing-stage");
  if (!stage) return null;

  layer = document.createElement("div");
  layer.id = "survey-ai-wall-svg-layer";
  layer.className = "survey-ai-wall-svg-layer hidden";
  layer.setAttribute("aria-hidden", "true");

  const svg = document.getElementById("drawing-svg");
  const photo = document.getElementById("survey-bg-photo-layer");
  if (svg && svg.parentElement === stage) {
    stage.insertBefore(layer, svg);
  } else if (photo && photo.parentElement === stage) {
    stage.insertBefore(layer, photo.nextSibling);
  } else {
    stage.prepend(layer);
  }
  return layer;
}

/**
 * 危険ノードを除去しつつ SVG をマウント
 * @param {HTMLElement} host
 * @param {string} markup
 * @param {{ viewBox?: string|null, canvasW?: number, canvasH?: number }} opts
 */
export function mountSafeAiWallSvgV1(host, markup, opts = {}) {
  if (!host) return false;
  host.innerHTML = "";

  const parsed = new DOMParser().parseFromString(
    String(markup || ""),
    "image/svg+xml"
  );
  const parseErr = parsed.querySelector("parsererror");
  if (parseErr) {
    host.classList.add("hidden");
    return false;
  }

  const svg = parsed.documentElement;
  if (!svg || String(svg.tagName).toLowerCase() !== "svg") {
    host.classList.add("hidden");
    return false;
  }

  // script / 外部参照 / イベントを除去
  svg
    .querySelectorAll("script, foreignObject, iframe, object, embed, image, use, a")
    .forEach((n) => n.remove());
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "href" || name === "xlink:href") {
        el.removeAttribute(attr.name);
      }
    }
  }

  if (!svg.getAttribute("xmlns")) {
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const viewBox =
    opts.viewBox ||
    svg.getAttribute("viewBox") ||
    (opts.canvasW && opts.canvasH
      ? `0 0 ${opts.canvasW} ${opts.canvasH}`
      : null);
  if (viewBox) svg.setAttribute("viewBox", viewBox);

  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("survey-ai-wall-svg");
  svg.setAttribute("pointer-events", "none");

  // ドキュメントへ採用（importNode）
  host.appendChild(document.importNode(svg, true));
  host.classList.remove("hidden");
  host.setAttribute("aria-hidden", "false");
  return true;
}

/**
 * layers.aiWallSvg を最背面へ描画
 * @param {unknown} aiWallSvg
 * @param {{ canvasW?: number, canvasH?: number }} opts
 */
export function renderAiWallSvgLayerV1(aiWallSvg, opts = {}) {
  const host = ensureAiWallSvgLayerV1();
  if (!host) return false;

  const normalized = normalizeAiWallSvgClientV1(aiWallSvg);
  if (!normalized?.markup) {
    host.innerHTML = "";
    host.classList.add("hidden");
    host.setAttribute("aria-hidden", "true");
    document
      .getElementById("drawing-stage")
      ?.classList.remove("has-ai-wall-svg");
    return false;
  }

  const ok = mountSafeAiWallSvgV1(host, normalized.markup, {
    viewBox: normalized.viewBox,
    canvasW: opts.canvasW,
    canvasH: opts.canvasH,
  });
  document
    .getElementById("drawing-stage")
    ?.classList.toggle("has-ai-wall-svg", ok);
  return ok;
}
