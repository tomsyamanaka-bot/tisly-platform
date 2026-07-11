/**
 * 手書き間取り線検出 v1（サーバ）
 * sharp で縮小解析し、0本時は外枠フォールバック
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import type { SurveyDrawingPath } from "./survey-drawing-v1-types.js";

export const SURVEY_SKETCH_LINE_DETECT_V1_SCHEMA = 1 as const;

/** 解析用最大辺 */
const ANALYZE_MAX = 512;
/** 暗い画素閾値（薄線緩和） */
const DARK_THRESHOLD = 115;
/** エッジ差分閾値（緩和） */
const EDGE_DELTA = 26;
/** 最小セグメント長 */
const MIN_SEG = 24;

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

/** 外枠4辺を正常系フォールバックとして返す */
export function buildFallbackOuterFramePathsV1(
  canvasW: number,
  canvasH: number
): SurveyDrawingPath[] {
  const m = Math.round(Math.min(canvasW, canvasH) * 0.08);
  const x0 = m;
  const y0 = m;
  const x1 = Math.max(m + 10, canvasW - m);
  const y1 = Math.max(m + 10, canvasH - m);
  const sides: Array<[SurveyDrawingPath["points"][0], SurveyDrawingPath["points"][0]]> = [
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

function extractAxisSegments(
  gray: Buffer,
  w: number,
  h: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = Math.abs(gray[i + 1]! - gray[i - 1]!);
      const gy = Math.abs(gray[i + w]! - gray[i - w]!);
      const dark = gray[i]! < DARK_THRESHOLD ? 1 : 0;
      if (dark && (gx > EDGE_DELTA || gy > EDGE_DELTA)) {
        edge[i] = 1;
      }
    }
  }

  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let y = 2; y < h - 2; y += 2) {
    let run = 0;
    let startX = 0;
    for (let x = 2; x < w - 2; x += 1) {
      if (edge[y * w + x]) {
        if (run === 0) startX = x;
        run += 1;
      } else if (run >= MIN_SEG) {
        segs.push({ x1: startX, y1: y, x2: x - 1, y2: y });
        run = 0;
      } else {
        run = 0;
      }
    }
    if (run >= MIN_SEG) {
      segs.push({ x1: startX, y1: y, x2: w - 3, y2: y });
    }
  }

  for (let x = 2; x < w - 2; x += 2) {
    let run = 0;
    let startY = 0;
    for (let y = 2; y < h - 2; y += 1) {
      if (edge[y * w + x]) {
        if (run === 0) startY = y;
        run += 1;
      } else if (run >= MIN_SEG) {
        segs.push({ x1: x, y1: startY, x2: x, y2: y - 1 });
        run = 0;
      } else {
        run = 0;
      }
    }
    if (run >= MIN_SEG) {
      segs.push({ x1: x, y1: startY, x2: x, y2: h - 3 });
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
        Math.abs(k.x1 - s.x1) < 6 &&
        Math.abs(k.y1 - s.y1) < 6 &&
        Math.abs(k.x2 - s.x2) < 6 &&
        Math.abs(k.y2 - s.y2) < 6
    );
    if (!tooClose) kept.push(s);
  }
  return kept.slice(0, 48).map((s) => {
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
      lengthPx: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
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

/**
 * 画像パスから間取り線を検出
 * 線0本でも外枠を返し例外で落とさない
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
    const { data, info } = await sharp(full)
      .resize(ANALYZE_MAX, ANALYZE_MAX, { fit: "inside" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const segs = extractAxisSegments(data, info.width, info.height);
    if (!segs.length) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "sketch_not_found",
        fileName ?? path.basename(input.imagePath)
      );
    }

    const paths = segmentsToPaths(
      segs,
      info.width,
      info.height,
      canvasW,
      canvasH
    );
    if (!paths.length) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "sketch_not_found",
        fileName ?? path.basename(input.imagePath)
      );
    }

    return okResult(paths, false, null, fileName ?? path.basename(input.imagePath));
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
 * クライアントが生 File を送った場合用
 */
export async function detectSketchLinesFromBase64V1(input: {
  imageBase64: string;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
}): Promise<SurveySketchLineDetectResultV1> {
  const canvasW = input.canvasWidth ?? 800;
  const canvasH = input.canvasHeight ?? 600;
  const fileName = input.fileName ?? null;

  try {
    const buf = Buffer.from(
      String(input.imageBase64).replace(/^data:[^;]+;base64,/, ""),
      "base64"
    );
    if (buf.length < 32) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "empty_blob",
        fileName
      );
    }

    const { data, info } = await sharp(buf)
      .resize(ANALYZE_MAX, ANALYZE_MAX, { fit: "inside" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const segs = extractAxisSegments(data, info.width, info.height);
    if (!segs.length) {
      return okResult(
        buildFallbackOuterFramePathsV1(canvasW, canvasH),
        true,
        "sketch_not_found",
        fileName
      );
    }

    const paths = segmentsToPaths(
      segs,
      info.width,
      info.height,
      canvasW,
      canvasH
    );
    if (!paths.length) {
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
