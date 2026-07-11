/**
 * 手書き間取り → デジタル線の自動作図 v1
 * 表示用CSS背景とは分離し、解析専用の縮小デコードのみ使う
 */

/** 解析用最大辺（GPU保護） */
const ANALYZE_MAX_EDGE = 512;
/** 暗い画素の閾値 */
const DARK_THRESHOLD = 110;
/** エッジ差分の閾値（緩和済み） */
const EDGE_DELTA = 28;
/** 線として認める最小長さ(px) */
const MIN_SEGMENT_LEN = 28;

/**
 * 解析専用に縮小ビットマップを取得
 * 表示経路には絶対に載せない
 * @param {Blob} file
 */
async function decodeForAnalyze(file) {
  if (!(file instanceof Blob) || file.size <= 0) {
    return null;
  }
  if (typeof createImageBitmap !== "function") {
    return null;
  }
  try {
    // 縮小オプション必須（フル解像度禁止）
    const bitmap = await createImageBitmap(file, {
      resizeWidth: ANALYZE_MAX_EDGE,
      resizeQuality: "medium",
    });
    if (!bitmap?.width || !bitmap?.height) {
      bitmap?.close?.();
      return null;
    }
    return bitmap;
  } catch (err) {
    console.warn("[sketch-auto-draw] bitmap decode failed", err);
    return null;
  }
}

/**
 * ビットマップからグレースケール配列を抽出
 * @param {ImageBitmap} bitmap
 */
function bitmapToGray(bitmap) {
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return { gray, w, h };
}

/**
 * 簡易エッジ走査で水平・垂直セグメントを拾う
 * 閾値は薄線でも拾えるよう緩和
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 */
function extractAxisSegments(gray, w, h) {
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = Math.abs(gray[i + 1] - gray[i - 1]);
      const gy = Math.abs(gray[i + w] - gray[i - w]);
      const dark = gray[i] < DARK_THRESHOLD ? 1 : 0;
      if (dark && (gx > EDGE_DELTA || gy > EDGE_DELTA)) {
        edge[i] = 1;
      }
    }
  }

  /** @type {Array<{x1:number,y1:number,x2:number,y2:number}>} */
  const segs = [];

  // 水平線スキャン
  for (let y = 2; y < h - 2; y += 2) {
    let run = 0;
    let startX = 0;
    for (let x = 2; x < w - 2; x += 1) {
      if (edge[y * w + x]) {
        if (run === 0) startX = x;
        run += 1;
      } else if (run >= MIN_SEGMENT_LEN) {
        segs.push({ x1: startX, y1: y, x2: x - 1, y2: y });
        run = 0;
      } else {
        run = 0;
      }
    }
    if (run >= MIN_SEGMENT_LEN) {
      segs.push({ x1: startX, y1: y, x2: w - 3, y2: y });
    }
  }

  // 垂直線スキャン
  for (let x = 2; x < w - 2; x += 2) {
    let run = 0;
    let startY = 0;
    for (let y = 2; y < h - 2; y += 1) {
      if (edge[y * w + x]) {
        if (run === 0) startY = y;
        run += 1;
      } else if (run >= MIN_SEGMENT_LEN) {
        segs.push({ x1: x, y1: startY, x2: x, y2: y - 1 });
        run = 0;
      } else {
        run = 0;
      }
    }
    if (run >= MIN_SEGMENT_LEN) {
      segs.push({ x1: x, y1: startY, x2: x, y2: h - 3 });
    }
  }

  return segs;
}

/**
 * 線が0本のときの外枠フォールバック
 * エラーで落とさず正常系として返す
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function buildFallbackOuterFramePaths(canvasW, canvasH) {
  const m = Math.round(Math.min(canvasW, canvasH) * 0.08);
  const x0 = m;
  const y0 = m;
  const x1 = Math.max(m + 10, canvasW - m);
  const y1 = Math.max(m + 10, canvasH - m);
  const corners = [
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
  return corners.map((points, i) => ({
    id: `auto-frame-${i}-${Date.now()}`,
    tool: "line",
    lineType: "generic",
    color: "#0f172a",
    width: 3,
    points,
    lengthPx: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
    autoDrawn: true,
    fallbackFrame: true,
  }));
}

/**
 * セグメントをキャンバス座標の path 配列へ変換
 * @param {Array<{x1:number,y1:number,x2:number,y2:number}>} segs
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} canvasW
 * @param {number} canvasH
 */
function segmentsToPaths(segs, srcW, srcH, canvasW, canvasH) {
  const sx = canvasW / Math.max(1, srcW);
  const sy = canvasH / Math.max(1, srcH);
  // 近傍重複を間引き
  const kept = [];
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
  return kept.slice(0, 48).map((s, i) => {
    const points = [
      { x: Math.round(s.x1 * sx), y: Math.round(s.y1 * sy) },
      { x: Math.round(s.x2 * sx), y: Math.round(s.y2 * sy) },
    ];
    return {
      id: `auto-wall-${i}-${Date.now()}`,
      tool: "line",
      lineType: "generic",
      color: "#0f172a",
      width: 3,
      points,
      lengthPx: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
      autoDrawn: true,
    };
  });
}

/**
 * 生 Blob/File からデジタル線を生成
 * 失敗時も外枠を返し、例外で処理を落とさない
 * @param {Blob} file
 * @param {{ canvasWidth?: number, canvasHeight?: number, fileName?: string }} opts
 */
export async function detectSketchLinesFromBlobV1(file, opts = {}) {
  const canvasW = opts.canvasWidth || 800;
  const canvasH = opts.canvasHeight || 600;
  const fileName = opts.fileName || (file && "name" in file ? file.name : "") || "photo";

  try {
    if (!(file instanceof Blob) || file.size <= 0) {
      // データ無しでも白紙外枠で着地
      return {
        ok: true,
        usedFallback: true,
        reason: "empty_blob",
        fileName,
        paths: buildFallbackOuterFramePaths(canvasW, canvasH),
      };
    }

    const bitmap = await decodeForAnalyze(file);
    if (!bitmap) {
      return {
        ok: true,
        usedFallback: true,
        reason: "decode_failed",
        fileName,
        paths: buildFallbackOuterFramePaths(canvasW, canvasH),
      };
    }

    let grayPack = null;
    try {
      grayPack = bitmapToGray(bitmap);
    } finally {
      bitmap.close?.();
    }

    if (!grayPack) {
      return {
        ok: true,
        usedFallback: true,
        reason: "gray_failed",
        fileName,
        paths: buildFallbackOuterFramePaths(canvasW, canvasH),
      };
    }

    const segs = extractAxisSegments(grayPack.gray, grayPack.w, grayPack.h);
    if (!segs.length) {
      // 線0本＝sketch not found相当だが正常系フォールバック
      return {
        ok: true,
        usedFallback: true,
        reason: "sketch_not_found",
        fileName,
        paths: buildFallbackOuterFramePaths(canvasW, canvasH),
      };
    }

    const paths = segmentsToPaths(
      segs,
      grayPack.w,
      grayPack.h,
      canvasW,
      canvasH
    );
    if (!paths.length) {
      return {
        ok: true,
        usedFallback: true,
        reason: "sketch_not_found",
        fileName,
        paths: buildFallbackOuterFramePaths(canvasW, canvasH),
      };
    }

    return {
      ok: true,
      usedFallback: false,
      reason: null,
      fileName,
      paths,
    };
  } catch (err) {
    console.warn("[sketch-auto-draw] detect failed → fallback", err, fileName);
    return {
      ok: true,
      usedFallback: true,
      reason: "exception",
      fileName,
      paths: buildFallbackOuterFramePaths(canvasW, canvasH),
    };
  }
}

/**
 * sketch not found 系メッセージか判定
 * @param {unknown} err
 */
export function isSketchNotFoundError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return /sketch not found|not found/.test(msg);
}
