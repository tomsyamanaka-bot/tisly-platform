/**
 * 板橋自宅の Matrix LiDAR（8x8）カード。
 * 他の現場では出さない。
 */

const SITE_ID = "HOME-JP-ITABASHI-LIVE";
let timer = 0;

function colorForMm(mm) {
  if (!mm || mm < 20 || mm > 4000) return "#e2e8f0";
  if (mm <= 400) return "#ea580c";
  if (mm <= 800) return "#1e3a8a";
  if (mm <= 1200) return "#3b82f6";
  if (mm <= 2000) return "#93c5fd";
  return "#dbeafe";
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
    const mm = Number(cells[i]) || 0;
    el.style.background = colorForMm(mm);
    const x = i % 8;
    const y = Math.floor(i / 8);
    el.classList.toggle("is-person", detected && x === cx && y === cy);
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
  timer = window.setInterval(refresh, 3000);
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
