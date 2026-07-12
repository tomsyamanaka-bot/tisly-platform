/**
 * 手書き間取り → デジタル線の自動作図 v1
 * 複雑な2値化・モルフォロジーは使わず
 * Cannyエッジ検出で全線を強制抽出する
 */

/** 解析用最大辺 */
const ANALYZE_MAX_EDGE = 1500;
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

/**
 * 解析専用に高解像度ビットマップを取得
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
  let probe = null;
  try {
    // 縦横比維持で最大1500pxまで縮小
    probe = await createImageBitmap(file);
    const maxEdge = Math.max(probe.width, probe.height);
    const scale = maxEdge > ANALYZE_MAX_EDGE ? ANALYZE_MAX_EDGE / maxEdge : 1;
    const rw = Math.max(1, Math.round(probe.width * scale));
    const rh = Math.max(1, Math.round(probe.height * scale));
    probe.close?.();
    probe = null;
    const bitmap = await createImageBitmap(file, {
      resizeWidth: rw,
      resizeHeight: rh,
      resizeQuality: "high",
    });
    if (!bitmap?.width || !bitmap?.height) {
      bitmap?.close?.();
      return null;
    }
    return bitmap;
  } catch (err) {
    console.error(err);
    console.warn("[sketch-auto-draw] bitmap decode failed", err);
    return null;
  } finally {
    try {
      probe?.close?.();
    } catch (closeErr) {
      console.error(closeErr);
    }
  }
}

/**
 * グレースケール + コントラスト正規化
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
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const g =
      (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < gray.length; i += 1) {
    const v = ((gray[i] - min) / span) * 255;
    gray[i] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }
  return { gray, w, h };
}

/**
 * 軽い3x3ガウシアンぼかし
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 */
function gaussianBlur3(gray, w, h) {
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
          sum += gray[yy * w + xx] * kw;
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
 * しきい値を広く取り薄い線も強制検知
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} t1
 * @param {number} t2
 */
function cannyEdgeDetect(gray, w, h, t1, t2) {
  const blur = gaussianBlur3(gray, w, h);
  const mag = new Float32Array(w * h);
  const dir = new Uint8Array(w * h);

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const gx =
        -blur[(y - 1) * w + (x - 1)] +
        blur[(y - 1) * w + (x + 1)] +
        -2 * blur[y * w + (x - 1)] +
        2 * blur[y * w + (x + 1)] +
        -blur[(y + 1) * w + (x - 1)] +
        blur[(y + 1) * w + (x + 1)];
      const gy =
        -blur[(y - 1) * w + (x - 1)] -
        2 * blur[(y - 1) * w + x] -
        blur[(y - 1) * w + (x + 1)] +
        blur[(y + 1) * w + (x - 1)] +
        2 * blur[(y + 1) * w + x] +
        blur[(y + 1) * w + (x + 1)];
      const m = Math.hypot(gx, gy);
      mag[y * w + x] = m;
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

  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const m = mag[i];
      if (m <= 0) continue;
      let n1 = 0;
      let n2 = 0;
      const d = dir[i];
      if (d === 0) {
        n1 = mag[y * w + (x - 1)];
        n2 = mag[y * w + (x + 1)];
      } else if (d === 1) {
        n1 = mag[(y - 1) * w + (x + 1)];
        n2 = mag[(y + 1) * w + (x - 1)];
      } else if (d === 2) {
        n1 = mag[(y - 1) * w + x];
        n2 = mag[(y + 1) * w + x];
      } else {
        n1 = mag[(y - 1) * w + (x - 1)];
        n2 = mag[(y + 1) * w + (x + 1)];
      }
      if (m >= n1 && m >= n2) nms[i] = m;
    }
  }

  const mark = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const v = nms[i];
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

  while (qh < qt) {
    const cx = qx[qh];
    const cy = qy[qh];
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
 * @param {Uint8Array} mask
 * @param {number} w
 * @param {number} h
 * @param {number} minSeg
 * @param {number} gapAllow
 */
function extractAxisSegmentsFromMask(mask, w, h, minSeg, gapAllow) {
  /** @type {Array<{x1:number,y1:number,x2:number,y2:number}>} */
  const segs = [];

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
 * 線がほぼ0本のときの外枠フォールバック
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
    lengthPx: Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    ),
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
  const kept = [];
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
  return kept.slice(0, MAX_RETURN_PATHS).map((s, i) => {
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
      lengthPx: Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y
      ),
      autoDrawn: true,
    };
  });
}

/**
 * Cannyパイプラインで線検出
 * ノイズ混入より「0本回避」を最優先
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} canvasW
 * @param {number} canvasH
 */
function detectPathsCannyPipeline(gray, w, h, canvasW, canvasH) {
  const passes = [
    { t1: CANNY_T1, t2: CANNY_T2, gap: 3 },
    { t1: 20, t2: 80, gap: 4 },
    { t1: 10, t2: 50, gap: 6 },
  ];
  let best = [];
  for (const p of passes) {
    const mask = cannyEdgeDetect(gray, w, h, p.t1, p.t2);
    const segs = extractAxisSegmentsFromMask(mask, w, h, MIN_SEG_LEN, p.gap);
    const paths = segmentsToPaths(segs, w, h, canvasW, canvasH);
    if (paths.length > best.length) best = paths;
    if (best.length >= FALLBACK_MIN_PATHS) break;
  }
  return best;
}

/**
 * AI作図送信用に JPEG File を明示生成
 * @param {Blob} file
 */
export async function prepareSketchUploadFileV1(file) {
  const fallbackType =
    file?.type && String(file.type).startsWith("image/")
      ? file.type
      : "image/jpeg";
  let bitmap = null;
  try {
    if (typeof createImageBitmap !== "function") {
      throw new Error("no bitmap");
    }
    bitmap = await createImageBitmap(file);
    const maxEdge = 1500;
    const scale =
      Math.max(bitmap.width, bitmap.height) > maxEdge
        ? maxEdge / Math.max(bitmap.width, bitmap.height)
        : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("no ctx");
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.92
      );
    });
    return new File([blob], "sketch.jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error(err);
    console.warn("[sketch-auto-draw] prepare upload fallback", err);
    return new File([file], "sketch.jpg", { type: fallbackType });
  } finally {
    try {
      bitmap?.close?.();
    } catch (closeErr) {
      console.error(closeErr);
    }
  }
}

/**
 * 生 Blob/File からデジタル線を生成
 * 0本のときだけ外枠へ落とす
 * @param {Blob} file
 * @param {{ canvasWidth?: number, canvasHeight?: number, fileName?: string }} opts
 */
export async function detectSketchLinesFromBlobV1(file, opts = {}) {
  const canvasW = opts.canvasWidth || 800;
  const canvasH = opts.canvasHeight || 600;
  const fileName =
    opts.fileName || (file && "name" in file ? file.name : "") || "photo";

  try {
    if (!(file instanceof Blob) || file.size <= 0) {
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

    const paths = detectPathsCannyPipeline(
      grayPack.gray,
      grayPack.w,
      grayPack.h,
      canvasW,
      canvasH
    );

    if (paths.length < FALLBACK_MIN_PATHS) {
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
    console.error(err);
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
