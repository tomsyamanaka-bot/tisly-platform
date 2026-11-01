/**
 * 板橋自宅の Matrix LiDAR（8x8）カード。
 * 他の現場では出さない。
 */

const SITE_ID = "HOME-JP-ITABASHI-LIVE";
let timer = 0;

/** 近い＝オレンジ／ネイビー、遠い＝白。マスは無効化しない。 */
export function heatmapColorForMm(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n) || n <= 0) return "#ffffff";
  if (n <= 400) return "#ea580c";
  if (n <= 900) return "#1e3a8a";
  if (n <= 1600) return "#60a5fa";
  if (n <= 2800) return "#e2e8f0";
  return "#f8fafc";
}

function paint(snap) {
  const pill = document.getElementById("sf-matrix-lidar-pill");
  const dir = document.getElementById("sf-matrix-lidar-dir");
  const meta = document.getElementById("sf-matrix-lidar-meta");
  const grid = document.getElementById("sf-matrix-lidar-grid");
  if (!pill || !grid || !snap) return;
  const detected = snap.present === true || snap.status === "detected";
  pill.textContent = detected ? "検知中" : "クリア";
  pill.classList.toggle("is-hot", detected);
  if (dir) {
    dir.textContent = snap.directionLabel || (detected ? "その場にいます" : "人はいません");
  }
  if (meta) {
    const mm = snap.minMm ? `${snap.minMm} mm` : "—";
    meta.textContent = `いちばん近い点 ${mm}`;
  }
  const cells = Array.isArray(snap.matrix) ? snap.matrix : [];
  if (grid.childElementCount !== 64) {
    grid.replaceChildren();
    for (let i = 0; i < 64; i += 1) {
      const cell = document.createElement("span");
      cell.className = "sf-lidar-cell";
      grid.appendChild(cell);
    }
  }
  const cx = snap.centroid ? Math.round(Number(snap.centroid.x)) : -1;
  const cy = snap.centroid ? Math.round(Number(snap.centroid.y)) : -1;
  for (let i = 0; i < 64; i += 1) {
    const el = grid.children[i];
    const mm = Number(cells[i]);
    const shown = Number.isFinite(mm) ? mm : 0;
    el.style.background = heatmapColorForMm(shown);
    el.textContent = shown > 0 ? String(shown) : "";
    el.title = `${shown} mm`;
    const x = i % 8;
    const y = Math.floor(i / 8);
    el.classList.toggle("is-person", detected && x === cx && y === cy);
    const ink = shown > 0 && shown <= 900 ? "#ffffff" : "#0f172a";
    el.style.color = ink;
  }
}

async function refresh() {
  try {
    const res = await fetch(
      `/api/home/v1/itabashi/lidar?siteId=${encodeURIComponent(SITE_ID)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const body = await res.json();
    paint(body.snapshot);
  } catch {
    /* 次の周期で取り直す */
  }
}

function start() {
  if (timer) return;
  refresh();
  timer = window.setInterval(refresh, 1500);
}

function stop() {
  if (!timer) return;
  window.clearInterval(timer);
  timer = 0;
}

export function syncMatrixLidarCard(visible) {
  const card = document.getElementById("sf-matrix-lidar");
  if (!card) return;
  const show = Boolean(visible);
  card.hidden = !show;
  card.setAttribute("aria-hidden", show ? "false" : "true");
  if (show) start();
  else stop();
}
