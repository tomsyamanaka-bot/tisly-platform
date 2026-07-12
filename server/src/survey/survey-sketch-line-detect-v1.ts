/**
 * 手書き間取り線検出 v1（サーバ）
 * 複雑な2値化・モルフォロジーは使わず
 * Cannyエッジ検出で全線を強制抽出する
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import type { SurveyDrawingPath } from "./survey-drawing-v1-types.js";

export const SURVEY_SKETCH_LINE_DETECT_V1_SCHEMA = 1 as const;

/** 解析用最大辺 */
const ANALYZE_MAX = 1500;
/** 0本だけ外枠へ落とす */
const FALLBACK_MIN_PATHS = 1;
/** Canny 下側しきい値（広く拾う） */
const CANNY_T1 = 30;
/** Canny 上側しきい値 */
const CANNY_T2 = 100;
/** 線分長さしきい値（ほぼ全て拾う） */
const MIN_SEG_LEN = 1;
/** 返却パス本数上限 */
const MAX_RETURN_PATHS = 800;

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
 * 軽い3x3ガウシアンぼかし
 * ノイズだけ抑え、細い線は残す
 */
function gaussianBlur3(
  gray: Buffer | Uint8Array,
  w: number,
  h: number
): Float32Array {
  // 1 2 1 / 2 4 2 / 1 2 1
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const kw = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
          sum += gray[yy * w + xx]! * kw;
          weight += kw;
        }
      }
      out[y * w + x] = sum / Math.max(1, weight);
    }
  }
  return out;
}

/**
 * Cannyエッジ検出
 * threshold1/2 を広く取り薄い線も強制検知
 */
function cannyEdgeDetect(
  gray: Buffer | Uint8Array,
  w: number,
  h: number,
  t1: number,
  t2: number
): Uint8Array {
  const blur = gaussianBlur3(gray, w, h);
  const mag = new Float32Array(w * h);
  // 0=0°, 1=45°, 2=90°, 3=135°
  const dir = new Uint8Array(w * h);

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const gx =
        -blur[(y - 1) * w + (x - 1)]! +
        blur[(y - 1) * w + (x + 1)]! +
        -2 * blur[y * w + (x - 1)]! +
        2 * blur[y * w + (x + 1)]! +
        -blur[(y + 1) * w + (x - 1)]! +
        blur[(y + 1) * w + (x + 1)]!;
      const gy =
        -blur[(y - 1) * w + (x - 1)]! -
        2 * blur[(y - 1) * w + x]! -
        blur[(y - 1) * w + (x + 1)]! +
        blur[(y + 1) * w + (x - 1)]! +
        2 * blur[(y + 1) * w + x]! +
        blur[(y + 1) * w + (x + 1)]!;
      const m = Math.hypot(gx, gy);
      mag[y * w + x] = m;
      // 勾配方向を4象限に量子化
      const ang = (Math.atan2(gy, gx) * 180) / Math.PI;
      const a = ang < 0 ? ang + 180 : ang;
      if ((a >= 0 && a < 22.5) || (a >= 157.5 && a <= 180)) {
        dir[y * w + x] = 0;
      } else if (a >= 22.5 && a < 67.5) {
        dir[y * w + x] = 1;
      } else if (a >= 67.5 && a < 112.5) {
        dir[y * w + x] = 2;
      } else {
        dir[y * w + x] = 3;
      }
    }
  }

  // 非最大値抑制
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const m = mag[i]!;
      if (m <= 0) continue;
      let n1 = 0;
      let n2 = 0;
      const d = dir[i]!;
      if (d === 0) {
        n1 = mag[y * w + (x - 1)]!;
        n2 = mag[y * w + (x + 1)]!;
      } else if (d === 1) {
        n1 = mag[(y - 1) * w + (x + 1)]!;
        n2 = mag[(y + 1) * w + (x - 1)]!;
      } else if (d === 2) {
        n1 = mag[(y - 1) * w + x]!;
        n2 = mag[(y + 1) * w + x]!;
      } else {
        n1 = mag[(y - 1) * w + (x - 1)]!;
        n2 = mag[(y + 1) * w + (x + 1)]!;
      }
      if (m >= n1 && m >= n2) nms[i] = m;
    }
  }

  // ヒステリシス: 強=2 / 弱=1 / 無=0
  const mark = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const v = nms[i]!;
      if (v >= t2) {
        mark[i] = 2;
        qx[qt] = x;
        qy[qt] = y;
        qt += 1;
      } else if (v >= t1) {
        mark[i] = 1;
      }
    }
  }

  // 強エッジから弱エッジを接続
  while (qh < qt) {
    const cx = qx[qh]!;
    const cy = qy[qh]!;
    qh += 1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const ni = ny * w + nx;
        if (mark[ni] === 1) {
          mark[ni] = 2;
          qx[qt] = nx;
          qy[qt] = ny;
          qt += 1;
        }
      }
    }
  }

  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = mark[i] === 2 ? 1 : 0;
  }
  return out;
}

/**
 * エッジマスクから水平・垂直セグメント抽出
 * ゴミ線でも構わず全て拾う
 */
function extractAxisSegmentsFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
  minSeg: number,
  gapAllow: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let y = 1; y < h - 1; y += 1) {
    let run = 0;
    let gap = 0;
    let startX = 0;
    for (let x = 1; x < w - 1; x += 1) {
      if (mask[y * w + x]) {
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

  for (let x = 1; x < w - 1; x += 1) {
    let run = 0;
    let gap = 0;
    let startY = 0;
    for (let y = 1; y < h - 1; y += 1) {
      if (mask[y * w + x]) {
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

function mergeCollinearNear(
  segs: Array<{ x1: number; y1: number; x2: number; y2: number }>
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const kept: typeof segs = [];
  for (const s of segs) {
    const tooClose = kept.some(
      (k) =>
        Math.abs(k.x1 - s.x1) < 4 &&
        Math.abs(k.y1 - s.y1) < 4 &&
        Math.abs(k.x2 - s.x2) < 4 &&
        Math.abs(k.y2 - s.y2) < 4
    );
    if (!tooClose) kept.push(s);
  }
  return kept;
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
  const kept = mergeCollinearNear(segs);
  return kept.slice(0, MAX_RETURN_PATHS).map((s) => {
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
        points[1]!.x - points[0]!.x,
        points[1]!.y - points[0]!.y
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

/** sharp 前処理: グレースケール + 正規化 */
async function loadGrayForDetect(
  input: Buffer | string
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(ANALYZE_MAX, ANALYZE_MAX, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Cannyパイプラインで線検出
 * ノイズ混入より「0本回避」を最優先
 */
function detectPathsCannyPipeline(
  data: Buffer,
  width: number,
  height: number,
  canvasW: number,
  canvasH: number
): SurveyDrawingPath[] {
  // 広いしきい値で薄い線も強制検知
  const passes: Array<{ t1: number; t2: number; gap: number }> = [
    { t1: CANNY_T1, t2: CANNY_T2, gap: 3 },
    { t1: 20, t2: 80, gap: 4 },
    { t1: 10, t2: 50, gap: 6 },
  ];

  let best: SurveyDrawingPath[] = [];
  for (const p of passes) {
    const mask = cannyEdgeDetect(data, width, height, p.t1, p.t2);
    const segs = extractAxisSegmentsFromMask(
      mask,
      width,
      height,
      MIN_SEG_LEN,
      p.gap
    );
    const paths = segmentsToPaths(segs, width, height, canvasW, canvasH);
    if (paths.length > best.length) best = paths;
    // 1本以上取れたら即返す（外枠回避）
    if (best.length >= FALLBACK_MIN_PATHS) break;
  }
  return best;
}

function shouldUseFallback(paths: SurveyDrawingPath[]): boolean {
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
    const paths = detectPathsCannyPipeline(
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
    const paths = detectPathsCannyPipeline(
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
