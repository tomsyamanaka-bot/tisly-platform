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
  try {
    // 縦横比維持で最大1500pxまで縮小
    // （細部を残しつつ送信負荷を抑える）
    const probe = await createImageBitmap(file);
    const maxEdge = Math.max(probe.width, probe.height);
    const scale = maxEdge > ANALYZE_MAX_EDGE ? ANALYZE_MAX_EDGE / maxEdge : 1;
    const rw = Math.max(1, Math.round(probe.width * scale));
    const rh = Math.max(1, Math.round(probe.height * scale));
    probe.close?.();
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
    console.warn("[sketch-auto-draw] bitmap decode failed", err);
    return null;
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
  // コントラスト伸長（薄い線を拾う）
  const span = Math.max(1, max - min);
  for (let i = 0; i < gray.length; i += 1) {
    let v = ((gray[i] - min) / span) * 255;
    v = (v - 28) * 1.45;
    gray[i] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }
  return { gray, w, h };
}

/**
 * 簡易エッジ走査で水平・垂直セグメントを拾う
 * 閾値は薄線でも拾えるよう多段緩和
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} darkThreshold
 * @param {number} edgeDelta
 * @param {number} minSeg
 * @param {number} gapAllow
 * @param {boolean} requireDark
 */
function extractAxisSegments(
  gray,
  w,
  h,
  darkThreshold,
  edgeDelta,
  minSeg,
  gapAllow,
  requireDark
) {
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = Math.abs(gray[i + 1] - gray[i - 1]);
      const gy = Math.abs(gray[i + w] - gray[i - w]);
      const isEdge = gx > edgeDelta || gy > edgeDelta;
      const isDark = gray[i] < darkThreshold;
      if (requireDark ? isDark && isEdge : isEdge || isDark) {
        edge[i] = 1;
      }
    }
  }

  /** @type {Array<{x1:number,y1:number,x2:number,y2:number}>} */
  const segs = [];

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
        Math.abs(k.x1 - s.x1) < 5 &&
        Math.abs(k.y1 - s.y1) < 5 &&
        Math.abs(k.x2 - s.x2) < 5 &&
        Math.abs(k.y2 - s.y2) < 5
    );
    if (!tooClose) kept.push(s);
  }
  return kept.slice(0, 96).map((s, i) => {
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
 * 多段閾値で線検出（薄線・影対策）
 * @param {Uint8Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} canvasW
 * @param {number} canvasH
 */
function detectPathsMultiPass(gray, w, h, canvasW, canvasH) {
  const passes = [
    { dark: 140, edge: 18, minSeg: 14, gap: 2, requireDark: true },
    { dark: 165, edge: 12, minSeg: 10, gap: 3, requireDark: true },
    { dark: 180, edge: 10, minSeg: 8, gap: 4, requireDark: false },
  ];
  let best = [];
  for (const p of passes) {
    const segs = extractAxisSegments(
      gray,
      w,
      h,
      p.dark,
      p.edge,
      p.minSeg,
      p.gap,
      p.requireDark
    );
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
  try {
    if (typeof createImageBitmap !== "function") {
      throw new Error("no bitmap");
    }
    const bitmap = await createImageBitmap(file);
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
      bitmap.close?.();
      throw new Error("no ctx");
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    // JPEG MIME を明示（受信ミスマッチ防止）
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.92
      );
    });
    return new File([blob], "sketch.jpg", { type: "image/jpeg" });
  } catch {
    return new File([file], "sketch.jpg", { type: fallbackType });
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

    const paths = detectPathsMultiPass(
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
