/**
 * 図面エディタ v1 — PDF 用 SVG レンダリング
 * pdf-base-template から呼び出し
 */
import { escapeHtml } from "../../business/pdf/pdf-base-template.js";
import type {
  DrawingEditorPdfPayloadV1,
  DrawingEditorRouteV1,
  DrawingEditorSymbolPlotV1,
} from "./drawing-editor-payload-v1.js";

const ROUTE_COLORS: Record<string, string> = {
  lan: "#2563eb",
  power100v: "#dc2626",
  power24v: "#ca8a04",
  generic: "#0f172a",
};

function pxX(x: number, w: number): number {
  return Math.round(x * w * 100) / 100;
}

function pxY(y: number, h: number): number {
  return Math.round(y * h * 100) / 100;
}

function renderRoutePath(route: DrawingEditorRouteV1, w: number, h: number): string {
  if (!route.points?.length) return "";
  const color = route.color || ROUTE_COLORS[route.lineType] || ROUTE_COLORS.generic;
  const d = route.points
    .map((pt, i) => `${i ? "L" : "M"}${pxX(pt.x, w)} ${pxY(pt.y, h)}`)
    .join(" ");
  return `<path d="${d}" fill="none" stroke="${escapeHtml(color)}" stroke-width="${route.width || 3}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function renderSymbolPlot(sym: DrawingEditorSymbolPlotV1, w: number, h: number): string {
  const cx = pxX(sym.x, w);
  const cy = pxY(sym.y, h);
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="14">${escapeHtml(sym.icon)}</text>`;
}

/**
 * 図面ペイロードから SVG 文字列を生成
 * （背景 + 通線 + 記号）
 */
export function buildDrawingEditorSvgMarkupV1(payload: DrawingEditorPdfPayloadV1): string {
  const w = Math.max(1, payload.canvasWidth);
  const h = Math.max(1, payload.canvasHeight);
  const bg = payload.backgroundImageUrl?.trim();
  const bgLayer = bg
    ? `<image href="${escapeHtml(bg)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
    : `<rect width="${w}" height="${h}" fill="#f8fafc"/>`;
  const routes = (payload.routes ?? [])
    .map((r) => renderRoutePath(r, w, h))
    .join("");
  const symbols = (payload.symbols ?? [])
    .map((s) => renderSymbolPlot(s, w, h))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="auto" class="de-v1-pdf-svg">
${bgLayer}
${routes}
${symbols}
</svg>`;
}

/**
 * 仕様書・完了報告書の図面枠用 HTML ブロック
 */
export function renderDigitalDrawingBlockHtmlV1(
  prefix: string,
  title: string,
  payload: DrawingEditorPdfPayloadV1
): string {
  const svg = buildDrawingEditorSvgMarkupV1(payload);
  const legend = (payload.symbols ?? [])
    .slice(0, 6)
    .map((s) => `${s.icon} ${escapeHtml(s.label)}`)
    .join(" · ");
  return `<div class="${prefix}-drawing-block ${prefix}-drawing-block-digital">
  <h3 class="${prefix}-drawing-title">${escapeHtml(title?.trim() || "現調図面")}</h3>
  <div class="${prefix}-drawing-svg-wrap">${svg}</div>
  ${legend ? `<p class="${prefix}-drawing-legend">${legend}</p>` : ""}
</div>`;
}
