/**
 * 手書き間取り線検出 v1（サーバ）
 * 適応的2値化 + モルフォロジーで
 * 方眼紙・照明ムラを吸収して線を拾う
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import type { SurveyDrawingPath } from "./survey-drawing-v1-types.js";

export const SURVEY_SKETCH_LINE_DETECT_V1_SCHEMA = 1 as const;

/** 解析用最大辺（細い手書き線を潰さない） */
const ANALYZE_MAX = 1500;
/** フォールバック許可の最小検出本数 */
const FALLBACK_MIN_PATHS = 2;
/** 適応的2値化のブロックサイズ（奇数） */
const ADAPTIVE_BLOCK = 31;
/** 適応的2値化の減算定数 C */
const ADAPTIVE_C = 7;
/** 輪郭（線分）面積しきい値を極限まで下げる */
const MIN_SEG_LEN = 4;
/** 方眼除去用オープニング半径 */
const OPEN_RADIUS = 1;
/** 途切れ橋渡し用クロージング半径 */
const CLOSE_RADIUS = 2;

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

/** 積分画像（適応的2値化用） */
function buildIntegralImage(
  gray: Buffer | Uint8Array,
  w: number,
  h: number
): Float64Array {
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= w; x += 1) {
      rowSum += gray[(y - 1) * w + (x - 1)]!;
      integ[y * (w + 1) + x] =
        integ[(y - 1) * (w + 1) + x]! + rowSum;
    }
  }
  return integ;
}

function integralRectSum(
  integ: Float64Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const ww = w + 1;
  return (
    integ[y1 * ww + x1]! -
    integ[y0 * ww + x1]! -
    integ[y1 * ww + x0]! +
    integ[y0 * ww + x0]!
  );
}

/**
 * 適応的2値化（Mean Adaptive Threshold）
 * 照明ムラを吸収し、インク=1 / 背景=0
 */
function adaptiveThresholdMean(
  gray: Buffer | Uint8Array,
  w: number,
  h: number,
  blockSize: number,
  C: number
): Uint8Array {
  const odd = blockSize % 2 === 0 ? blockSize + 1 : blockSize;
  const r = Math.max(1, (odd - 1) >> 1);
  const integ = buildIntegralImage(gray, w, h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const mean = integralRectSum(integ, w, x0, y0, x1, y1) / Math.max(1, area);
      // 局所平均より暗い画素をインクとする
      out[y * w + x] = gray[y * w + x]! < mean - C ? 1 : 0;
    }
  }
  return out;
}

/** バイナリ画像の収縮（細い方眼を消す） */
function erodeBinary(
  src: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  if (radius <= 0) return src.slice();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let keep = 1;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          keep = 0;
          break;
        }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || !src[yy * w + xx]) {
            keep = 0;
            break;
          }
        }
      }
      out[y * w + x] = keep;
    }
  }
  return out;
}

/** バイナリ画像の膨張（途切れ線をつなぐ） */
function dilateBinary(
  src: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  if (radius <= 0) return src.slice();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!src[y * w + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** オープニング = 収縮→膨張（細いマス目除去） */
function morphOpen(
  src: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  return dilateBinary(erodeBinary(src, w, h, radius), w, h, radius);
}

/** クロージング = 膨張→収縮（途切れ橋渡し） */
function morphClose(
  src: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  return erodeBinary(dilateBinary(src, w, h, radius), w, h, radius);
}

/**
 * 微小連結成分を除去（ノイズ掃除）
 * 面積しきい値は極限まで低く保つ
 */
function removeSmallComponents(
  src: Uint8Array,
  w: number,
  h: number,
  minArea: number
): Uint8Array {
  const seen = new Uint8Array(w * h);
  const out = src.slice();
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = y * w + x;
      if (!src[start] || seen[start]) continue;
      let qh = 0;
      let qt = 0;
      qx[qt] = x;
      qy[qt] = y;
      qt += 1;
      seen[start] = 1;
      const cells: number[] = [];
      while (qh < qt) {
        const cx = qx[qh]!;
        const cy = qy[qh]!;
        qh += 1;
        cells.push(cy * w + cx);
        const n4: Array<[number, number]> = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of n4) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!src[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx[qt] = nx;
          qy[qt] = ny;
          qt += 1;
        }
      }
      if (cells.length < minArea) {
        for (const i of cells) out[i] = 0;
      }
    }
  }
  return out;
}

/**
 * インクマスクから水平・垂直セグメント抽出
 * minSeg を極限まで下げて途切れ壁も拾う
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

/**
 * 周期的な短いマス目線を間引き
 * （方眼ピッチに近い短線を弾く）
 */
function filterGridLikeSegments(
  segs: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  w: number,
  h: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  if (segs.length < 12) return segs;
  const short = segs.filter((s) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return len < Math.min(w, h) * 0.08;
  });
  // 短線が大半なら方眼ノイズとみなし長めだけ残す
  if (short.length > segs.length * 0.65) {
    const minKeep = Math.max(MIN_SEG_LEN + 2, Math.round(Math.min(w, h) * 0.035));
    return segs.filter(
      (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= minKeep
    );
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
  return kept.slice(0, 160).map((s) => {
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
 * 適応的2値化パイプラインで線検出
 * 方眼・影を抑え、手書き壁を残す
 */
function detectPathsAdaptivePipeline(
  data: Buffer,
  width: number,
  height: number,
  canvasW: number,
  canvasH: number
): SurveyDrawingPath[] {
  const passes: Array<{
    block: number;
    C: number;
    openR: number;
    closeR: number;
    minSeg: number;
    gap: number;
    minArea: number;
  }> = [
    // 標準: 方眼除去強め
    {
      block: ADAPTIVE_BLOCK,
      C: ADAPTIVE_C,
      openR: OPEN_RADIUS,
      closeR: CLOSE_RADIUS,
      minSeg: MIN_SEG_LEN + 2,
      gap: 3,
      minArea: 6,
    },
    // 緩和: 薄い鉛筆・途切れ壁向け
    {
      block: 25,
      C: 5,
      openR: 0,
      closeR: 2,
      minSeg: MIN_SEG_LEN,
      gap: 4,
      minArea: 3,
    },
    // 最終: 極限まで拾う
    {
      block: 21,
      C: 3,
      openR: 0,
      closeR: 1,
      minSeg: MIN_SEG_LEN,
      gap: 5,
      minArea: 2,
    },
  ];

  let best: SurveyDrawingPath[] = [];
  for (const p of passes) {
    let mask = adaptiveThresholdMean(data, width, height, p.block, p.C);
    if (p.openR > 0) {
      mask = morphOpen(mask, width, height, p.openR);
    }
    if (p.closeR > 0) {
      mask = morphClose(mask, width, height, p.closeR);
    }
    mask = removeSmallComponents(mask, width, height, p.minArea);
    let segs = extractAxisSegmentsFromMask(
      mask,
      width,
      height,
      p.minSeg,
      p.gap
    );
    segs = filterGridLikeSegments(segs, width, height);
    const paths = segmentsToPaths(segs, width, height, canvasW, canvasH);
    if (paths.length > best.length) best = paths;
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
    const paths = detectPathsAdaptivePipeline(
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
    const paths = detectPathsAdaptivePipeline(
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
