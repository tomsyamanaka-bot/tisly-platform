/**
 * 消しゴム Hit Testing v1
 * 点と線分の最短距離で【最短1本だけ】を選ぶ
 * （全消去ロジックへの先祖返りを防ぐ）
 */

/** タッチ点〜パス線分の許容距離（px） */
export const ERASER_HIT_TOLERANCE_PX = 10;

/** iOS 誤座標の対角線を棄却するジャンプ上限 */
export const ERASER_MAX_JUMP_PX = 72;

/** 点と線分の最短距離 */
export function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 線分同士の最短距離（交差なら 0） */
export function distSegmentToSegment(ax, ay, bx, by, cx, cy, dx, dy) {
  const abx = bx - ax;
  const aby = by - ay;
  const cdx = dx - cx;
  const cdy = dy - cy;
  const acx = cx - ax;
  const acy = cy - ay;
  const den = abx * cdy - aby * cdx;
  if (Math.abs(den) > 1e-9) {
    const t = (acx * cdy - acy * cdx) / den;
    const u = (acx * aby - acy * abx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    distPointToSegment(ax, ay, cx, cy, dx, dy),
    distPointToSegment(bx, by, cx, cy, dx, dy),
    distPointToSegment(cx, cy, ax, ay, bx, by),
    distPointToSegment(dx, dy, ax, ay, bx, by)
  );
}

/**
 * テレポートを繋がない消しゴム線分を作る
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [maxJumpPx]
 */
export function buildEraserSegments(
  points,
  maxJumpPx = ERASER_MAX_JUMP_PX
) {
  /** @type {Array<[{x:number,y:number},{x:number,y:number}]>} */
  const segs = [];
  if (!points?.length) return segs;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (
      !a ||
      !b ||
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y)
    ) {
      continue;
    }
    const jump = Math.hypot(b.x - a.x, b.y - a.y);
    if (jump <= 0 || jump > maxJumpPx) continue;
    segs.push([a, b]);
  }
  return segs;
}

/** パス点列の AABB（パディング付き） */
export function pathPointsBBox(points, pad) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export function bboxOverlap(a, b) {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/**
 * 消しゴム当たり半径（過大にしない・最大10px）
 * @param {{ width?: number }} drawPath
 * @param {{ width?: number }} eraserStroke
 * @param {number} [penWidth]
 * @param {number} [eraserWidth]
 */
export function eraserHitThreshold(
  drawPath,
  eraserStroke,
  penWidth = 3,
  eraserWidth = 14
) {
  const raw =
    ((drawPath.width || penWidth) +
      (eraserStroke.width || eraserWidth)) /
      2 +
    2;
  return Math.min(
    ERASER_HIT_TOLERANCE_PX,
    Math.max(6, raw)
  );
}

/**
 * 消しゴムと描画パスの最短距離
 * （AABB → 点-線分。全点逆引きはしない）
 * @param {object} drawPath
 * @param {object} eraserStroke
 * @param {{ penWidth?: number, eraserWidth?: number, maxJumpPx?: number }} [opts]
 */
export function minDistPathToEraser(drawPath, eraserStroke, opts = {}) {
  const aPts = drawPath?.points;
  const bPts = eraserStroke?.points;
  if (!aPts?.length || !bPts?.length) return Infinity;
  const threshold = eraserHitThreshold(
    drawPath,
    eraserStroke,
    opts.penWidth,
    opts.eraserWidth
  );
  const eraserSegs = buildEraserSegments(
    bPts,
    opts.maxJumpPx ?? ERASER_MAX_JUMP_PX
  );
  // AABB は有効線分の点だけで作る
  const eraserPtsForBox = eraserSegs.length
    ? eraserSegs.flatMap(([a, b]) => [a, b])
    : bPts;
  const pathBox = pathPointsBBox(aPts, threshold);
  const eraserBox = pathPointsBBox(eraserPtsForBox, threshold);
  if (!bboxOverlap(pathBox, eraserBox)) return Infinity;

  let best = Infinity;
  // タップ（点のみ）: 消しゴム各点 → 描画線分
  // ※最短1本選定のため早期 return せず全探索
  for (const bp of bPts) {
    if (!bp || !Number.isFinite(bp.x) || !Number.isFinite(bp.y)) continue;
    if (aPts.length === 1) {
      best = Math.min(
        best,
        Math.hypot(bp.x - aPts[0].x, bp.y - aPts[0].y)
      );
      continue;
    }
    for (let i = 1; i < aPts.length; i++) {
      const d = distPointToSegment(
        bp.x,
        bp.y,
        aPts[i - 1].x,
        aPts[i - 1].y,
        aPts[i].x,
        aPts[i].y
      );
      if (d < best) best = d;
    }
  }
  // 連続区間のみ線分同士
  if (aPts.length >= 2 && eraserSegs.length) {
    for (const [e0, e1] of eraserSegs) {
      for (let i = 1; i < aPts.length; i++) {
        const d = distSegmentToSegment(
          aPts[i - 1].x,
          aPts[i - 1].y,
          aPts[i].x,
          aPts[i].y,
          e0.x,
          e0.y,
          e1.x,
          e1.y
        );
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/**
 * 許容距離内で最も近いパスのインデックスを1つだけ返す
 * @param {object[]} paths
 * @param {object} eraserStroke
 * @param {{ penWidth?: number, eraserWidth?: number, maxJumpPx?: number }} [opts]
 * @returns {number}
 */
export function findClosestEraserHitIndex(
  paths,
  eraserStroke,
  opts = {}
) {
  if (!paths?.length || !eraserStroke?.points?.length) return -1;
  let hitIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (!p?.points?.length) continue;
    const dist = minDistPathToEraser(p, eraserStroke, opts);
    const threshold = eraserHitThreshold(
      p,
      eraserStroke,
      opts.penWidth,
      opts.eraserWidth
    );
    // 許容内かつ最短のものだけ採用
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      hitIndex = i;
    }
  }
  return hitIndex;
}

/**
 * 触れたパスを splice で【1本だけ】物理削除
 * 全消去は絶対にしない
 * @param {object[]} paths
 * @param {object} eraserStroke
 * @param {{ penWidth?: number, eraserWidth?: number, maxJumpPx?: number }} [opts]
 * @returns {{ paths: object[], removed: number }}
 */
export function eraseClosestPathOnly(paths, eraserStroke, opts = {}) {
  const cleaned = (paths ?? []).filter(
    (p) => p && p.tool !== "eraser"
  );
  const hitIndex = findClosestEraserHitIndex(
    cleaned,
    eraserStroke,
    opts
  );
  if (hitIndex < 0) {
    return { paths: cleaned, removed: 0 };
  }
  // 確実に1本だけ削除して即終了
  cleaned.splice(hitIndex, 1);
  return { paths: cleaned, removed: 1 };
}
