/**
 * 手書き間取り → デジタル線の自動作図 v1
 * 表示用CSS背景とは分離し、
 * 解析専用の高解像度デコードのみ使う
 */

/** 解析用最大辺（細い手書き線を潰さない） */
const ANALYZE_MAX_EDGE = 1500;
/** フォールバック許可の最小本数 */
const FALLBACK_MIN_PATHS = 2;

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
    // （細部を残しつつ送信負荷を抑える）
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
    // probe が残っていれば必ず解放
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

/** 積分画像（適応的2値化用） */
function buildIntegralImage(gray, w, h) {
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= w; x += 1) {
      rowSum += gray[(y - 1) * w + (x - 1)];
      integ[y * (w + 1) + x] = integ[(y - 1) * (w + 1) + x] + rowSum;
    }
  }
  return integ;
}

function integralRectSum(integ, w, x0, y0, x1, y1) {
  const ww = w + 1;
  return (
    integ[y1 * ww + x1] -
    integ[y0 * ww + x1] -
    integ[y1 * ww + x0] +
    integ[y0 * ww + x0]
  );
}

/**
 * 適応的2値化（照明ムラ吸収）
 * インク=1 / 背景=0
 */
function adaptiveThresholdMean(gray, w, h, blockSize, C) {
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
      const mean =
        integralRectSum(integ, w, x0, y0, x1, y1) / Math.max(1, area);
      out[y * w + x] = gray[y * w + x] < mean - C ? 1 : 0;
    }
  }
  return out;
}

function erodeBinary(src, w, h, radius) {
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

function dilateBinary(src, w, h, radius) {
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

function morphOpen(src, w, h, radius) {
  return dilateBinary(erodeBinary(src, w, h, radius), w, h, radius);
}

function morphClose(src, w, h, radius) {
  return erodeBinary(dilateBinary(src, w, h, radius), w, h, radius);
}

function removeSmallComponents(src, w, h, minArea) {
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
      const cells = [];
      while (qh < qt) {
        const cx = qx[qh];
        const cy = qy[qh];
        qh += 1;
        cells.push(cy * w + cx);
        const n4 = [
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

function filterGridLikeSegments(segs, w, h) {
  if (segs.length < 12) return segs;
  const short = segs.filter((s) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return len < Math.min(w, h) * 0.08;
  });
  if (short.length > segs.length * 0.65) {
    const minKeep = Math.max(6, Math.round(Math.min(w, h) * 0.035));
    return segs.filter(
      (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= minKeep
    );
  }
  return segs;
}

/**
 * 線がほぼ0本のときの外枠フォールバック
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
  return kept.slice(0, 160).map((s, i) => {
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
 * 適応的2値化 + モルフォロジーで線検出
 * 方眼紙・影対策の本命経路
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} canvasW
 * @param {number} canvasH
 */
function detectPathsAdaptivePipeline(gray, w, h, canvasW, canvasH) {
  const passes = [
    { block: 31, C: 7, openR: 1, closeR: 2, minSeg: 6, gap: 3, minArea: 6 },
    { block: 25, C: 5, openR: 0, closeR: 2, minSeg: 4, gap: 4, minArea: 3 },
    { block: 21, C: 3, openR: 0, closeR: 1, minSeg: 4, gap: 5, minArea: 2 },
  ];
  let best = [];
  for (const p of passes) {
    let mask = adaptiveThresholdMean(gray, w, h, p.block, p.C);
    if (p.openR > 0) mask = morphOpen(mask, w, h, p.openR);
    if (p.closeR > 0) mask = morphClose(mask, w, h, p.closeR);
    mask = removeSmallComponents(mask, w, h, p.minArea);
    let segs = extractAxisSegmentsFromMask(mask, w, h, p.minSeg, p.gap);
    segs = filterGridLikeSegments(segs, w, h);
    const paths = segmentsToPaths(segs, w, h, canvasW, canvasH);
    if (paths.length > best.length) best = paths;
    if (best.length >= FALLBACK_MIN_PATHS + 2) break;
  }
  return best;
}

/**
 * AI作図送信用に JPEG File を明示生成
 * MIME・ファイル名を必ずセットする
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
    // サーバ輪郭抽出向けに最大1500px
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
    // JPEG MIME を明示（受信ミスマッチ防止）
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
    // ビットマップは成否問わず解放
    try {
      bitmap?.close?.();
    } catch (closeErr) {
      console.error(closeErr);
    }
  }
}

/**
 * 生 Blob/File からデジタル線を生成
 * 2本未満のときだけ外枠へ落とす
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

    const paths = detectPathsAdaptivePipeline(
      grayPack.gray,
      grayPack.w,
      grayPack.h,
      canvasW,
      canvasH
    );

    // 2本未満のみ外枠（厳格）
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
