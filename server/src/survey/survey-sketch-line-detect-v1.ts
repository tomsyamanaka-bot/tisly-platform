/**
 * 手書き間取り線検出 v1（サーバ）
 * コントラスト強調後に多段閾値で線を拾う
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import type { SurveyDrawingPath } from "./survey-drawing-v1-types.js";

export const SURVEY_SKETCH_LINE_DETECT_V1_SCHEMA = 1 as const;

/** 解析用最大辺（細部保持） */
const ANALYZE_MAX = 768;
/** フォールバック許可の最小検出本数 */
const FALLBACK_MIN_PATHS = 2;

export interface SurveySketchLineDetectResultV1 {
  schemaVersion: typeof SURVEY_SKETCH_LINE_DETECT_V1_SCHEMA;
  ok: true;
  usedFallback: boolean;
  reason: string | null;
  fileName: string | null;
  paths: SurveyDrawingPath[];
}

function surveyImageFullPath(imagePath: string): string {
  const base =
    process.env.TISLY_UPLOADS_DIR || path.join(process.cwd(), "uploads");
  return path.join(base, "survey", imagePath);
}

/** 外枠4辺を最終手段フォールバックとして返す */
export function buildFallbackOuterFramePathsV1(
  canvasW: number,
  canvasH: number
): SurveyDrawingPath[] {
  const m = Math.round(Math.min(canvasW, canvasH) * 0.08);
  const x0 = m;
  const y0 = m;
  const x1 = Math.max(m + 10, canvasW - m);
  const y1 = Math.max(m + 10, canvasH - m);
  const sides: Array<
    [SurveyDrawingPath["points"][0], SurveyDrawingPath["points"][0]]
  > = [
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
    ],
    [
      { x: x1, y: y0 },
      { x: x1, y: y1 },
    ],
    [
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    [
      { x: x0, y: y1 },
      { x: x0, y: y0 },
    ],
  ];
  return sides.map((pts) => ({
    id: uuid(),
    tool: "line" as const,
    lineType: "generic" as const,
    color: "#0f172a",
    width: 3,
    points: pts,
    lengthPx: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
  }));
}

/**
 * 水平・垂直セグメント抽出
 * gapAllow で薄い線の途切れを橋渡し
 */
function extractAxisSegments(
  gray: Buffer | Uint8Array,
  w: number,
  h: number,
  darkThreshold: number,
  edgeDelta: number,
  minSeg: number,
  gapAllow: number,
  requireDark: boolean
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = Math.abs(gray[i + 1]! - gray[i - 1]!);
      const gy = Math.abs(gray[i + w]! - gray[i - w]!);
      const isEdge = gx > edgeDelta || gy > edgeDelta;
      const isDark = gray[i]! < darkThreshold;
      if (requireDark ? isDark && isEdge : isEdge || isDark) {
        edge[i] = 1;
      }
    }
  }

  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  // 水平線（1行おきではなく全行）
  for (let y = 1; y < h - 1; y += 1) {
    let run = 0;
    let gap = 0;
    let startX = 0;
    for (let x = 1; x < w - 1; x += 1) {
      if (edge[y * w + x]) {
        if (run === 0) startX = x;
        run += 1 + gap;
        gap = 0;
      } else if (run > 0 && gap < gapAllow) {
        gap += 1;
      } else if (run >= minSeg) {
        segs.push({ x1: startX, y1: y, x2: x - 1 - gap, y2: y });
        run = 0;
        gap = 0;
      } else {
        run = 0;
        gap = 0;
      }
    }
    if (run >= minSeg) {
      segs.push({ x1: startX, y1: y, x2: w - 2, y2: y });
    }
  }

  // 垂直線
  for (let x = 1; x < w - 1; x += 1) {
    let run = 0;
    let gap = 0;
    let startY = 0;
    for (let y = 1; y < h - 1; y += 1) {
      if (edge[y * w + x]) {
        if (run === 0) startY = y;
        run += 1 + gap;
        gap = 0;
      } else if (run > 0 && gap < gapAllow) {
        gap += 1;
      } else if (run >= minSeg) {
        segs.push({ x1: x, y1: startY, x2: x, y2: y - 1 - gap });
        run = 0;
        gap = 0;
      } else {
        run = 0;
        gap = 0;
      }
    }
    if (run >= minSeg) {
      segs.push({ x1: x, y1: startY, x2: x, y2: h - 2 });
    }
  }

  return segs;
}

function segmentsToPaths(
  segs: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  srcW: number,
  srcH: number,
  canvasW: number,
  canvasH: number
): SurveyDrawingPath[] {
  const sx = canvasW / Math.max(1, srcW);
  const sy = canvasH / Math.max(1, srcH);
  const kept: typeof segs = [];
  for (const s of segs) {
    const tooClose = kept.some(
      (k) =>
        Math.abs(k.x1 - s.x1) < 5 &&
        Math.abs(k.y1 - s.y1) < 5 &&
        Math.abs(k.x2 - s.x2) < 5 &&
        Math.abs(k.y2 - s.y2) < 5
    );
    if (!tooClose) kept.push(s);
  }
  return kept.slice(0, 96).map((s) => {
    const points = [
      { x: Math.round(s.x1 * sx), y: Math.round(s.y1 * sy) },
      { x: Math.round(s.x2 * sx), y: Math.round(s.y2 * sy) },
    ];
    return {
      id: uuid(),
      tool: "line" as const,
      lineType: "generic" as const,
      color: "#0f172a",
      width: 3,
      points,
      lengthPx: Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y
      ),
    };
  });
}

function okResult(
  paths: SurveyDrawingPath[],
  usedFallback: boolean,
  reason: string | null,
  fileName: string | null
): SurveySketchLineDetectResultV1 {
  return {
    schemaVersion: SURVEY_SKETCH_LINE_DETECT_V1_SCHEMA,
    ok: true,
    usedFallback,
    reason,
    fileName,
    paths,
  };
}

/** sharp 前処理: 正規化 + コントラスト強調 */
async function loadGrayForDetect(
  input: Buffer | string
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(ANALYZE_MAX, ANALYZE_MAX, { fit: "inside", withoutEnlargement: false })
    .grayscale()
    .normalize()
    .linear(1.45, -28)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * 多段閾値で線を検出
 * 薄線・影付きでも拾えるよう段階的に緩和
 */
function detectPathsMultiPass(
  data: Buffer,
  width: number,
  height: number,
  canvasW: number,
  canvasH: number
): SurveyDrawingPath[] {
  const passes: Array<{
    dark: number;
    edge: number;
    minSeg: number;
    gap: number;
    requireDark: boolean;
  }> = [
    // 標準: 濃い線優先
    { dark: 140, edge: 18, minSeg: 14, gap: 2, requireDark: true },
    // 緩和: 薄い鉛筆線向け
    { dark: 165, edge: 12, minSeg: 10, gap: 3, requireDark: true },
    // 最終: エッジ優先（影下でも拾う）
    { dark: 180, edge: 10, minSeg: 8, gap: 4, requireDark: false },
  ];

  let best: SurveyDrawingPath[] = [];
  for (const p of passes) {
    const segs = extractAxisSegments(
      data,
      width,
      height,
      p.dark,
      p.edge,
      p.minSeg,
      p.gap,
      p.requireDark
    );
    const paths = segmentsToPaths(segs, width, height, canvasW, canvasH);
    if (paths.length > best.length) best = paths;
    // 十分な本数が取れたら打ち切り
    if (best.length >= FALLBACK_MIN_PATHS + 2) break;
  }
  return best;
}

function shouldUseFallback(paths: SurveyDrawingPath[]): boolean {
  // 2本未満のみ外枠へ（厳格）
  return paths.length < FALLBACK_MIN_PATHS;
}

/**
 * 生 Buffer から間取り線を検出
 * multipart 受信後の本命経路
 */
export async function detectSketchLinesFromBufferV1(input: {
  buffer: Buffer;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
}): Promise<SurveySketchLineDetectResultV1> {
  const canvasW = input.canvasWidth ?? 800;
  const canvasH = input.canvasHeight ?? 600;
  const fileName = input.fileName ?? null;

  try {
    if (!input.buffer || input.buffer.length < 32) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "empty_blob",
        fileName
      );
    }

    const gray = await loadGrayForDetect(input.buffer);
    const paths = detectPathsMultiPass(
      gray.data,
      gray.width,
      gray.height,
      canvasW,
      canvasH
    );

    if (shouldUseFallback(paths)) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "sketch_not_found",
        fileName
      );
    }

    return okResult(paths, false, null, fileName);
  } catch {
    return okResult(
      buildFallbackOuterFramePathsV1(canvasW, canvasH),
      true,
      "exception",
      fileName
    );
  }
}

/**
 * 画像パスから間取り線を検出
 * 線がほぼ無いときだけ外枠へ落とす
 */
export async function detectSketchLinesFromImagePathV1(input: {
  imagePath?: string | null;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
  /** テスト用：強制フォールバック */
  forceFallback?: boolean;
}): Promise<SurveySketchLineDetectResultV1> {
  const canvasW = input.canvasWidth ?? 800;
  const canvasH = input.canvasHeight ?? 600;
  const fileName = input.fileName ?? null;

  if (input.forceFallback || !input.imagePath) {
    return okResult(
      buildFallbackOuterFramePathsV1(canvasW, canvasH),
      true,
      input.imagePath ? "forced" : "sketch_not_found",
      fileName
    );
  }

  const full = surveyImageFullPath(input.imagePath);
  if (!fs.existsSync(full)) {
    return okResult(
      buildFallbackOuterFramePathsV1(canvasW, canvasH),
      true,
      "sketch_not_found",
      fileName ?? path.basename(input.imagePath)
    );
  }

  try {
    const gray = await loadGrayForDetect(full);
    const paths = detectPathsMultiPass(
      gray.data,
      gray.width,
      gray.height,
      canvasW,
      canvasH
    );

    if (shouldUseFallback(paths)) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "sketch_not_found",
        fileName ?? path.basename(input.imagePath)
      );
    }

    return okResult(
      paths,
      false,
      null,
      fileName ?? path.basename(input.imagePath)
    );
  } catch {
    return okResult(
      buildFallbackOuterFramePathsV1(canvasW, canvasH),
      true,
      "exception",
      fileName ?? path.basename(input.imagePath)
    );
  }
}

/**
 * Base64 画像バッファから線検出
 * JSON 経路互換（FormData 優先）
 */
export async function detectSketchLinesFromBase64V1(input: {
  imageBase64: string;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
}): Promise<SurveySketchLineDetectResultV1> {
  const buf = Buffer.from(
    String(input.imageBase64).replace(/^data:[^;]+;base64,/, ""),
    "base64"
  );
  return detectSketchLinesFromBufferV1({
    buffer: buf,
    fileName: input.fileName,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
  });
}
