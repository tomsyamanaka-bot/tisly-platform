/**
 * 板橋自宅の GPIO44 ミリ波カード。
 * 他の現場では出さない。保存は滞留秒だけ。
 */

const SITE_ID = "HOME-JP-ITABASHI-LIVE";
const PRESETS = [3, 5, 10, 15, 30];

let timer = 0;
let visibleNow = false;
let dwellSec = 5;

function text(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function paintDwell(sec) {
  dwellSec = sec;
  document.querySelectorAll("[data-mmwave-sec]").forEach((btn) => {
    const n = Number(btn.getAttribute("data-mmwave-sec"));
    btn.classList.toggle("is-on", n === sec);
    btn.setAttribute("aria-pressed", n === sec ? "true" : "false");
  });
}

async function loadStatus() {
  const res = await fetch(
    `/api/home/v1/itabashi/mmwave?siteId=${encodeURIComponent(SITE_ID)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return;
  const body = await res.json();
  text("sf-mmwave-phase", body.phaseLabel || "🟢 クリア（待機中）");
  const sec = Number(body.dwellSec);
  if (Number.isFinite(sec)) paintDwell(sec);
}

async function saveDwell(sec) {
  const res = await fetch("/api/home/v1/itabashi/mmwave/dwell", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ siteId: SITE_ID, dwellSec: sec }),
  });
  if (!res.ok) return;
  const body = await res.json();
  paintDwell(Number(body.dwellSec) || sec);
  text("sf-mmwave-phase", body.phaseLabel || "🟢 クリア（待機中）");
}

function bindOnce() {
  const root = document.getElementById("sf-mmwave-gpio44");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-mmwave-sec]");
    if (!btn) return;
    const sec = Number(btn.getAttribute("data-mmwave-sec"));
    if (!PRESETS.includes(sec)) return;
    paintDwell(sec);
    saveDwell(sec).catch(() => {});
  });
}

export function syncMmwaveGpio44Card(visible) {
  const root = document.getElementById("sf-mmwave-gpio44");
  if (!root) return;
  bindOnce();
  visibleNow = Boolean(visible);
  root.hidden = !visibleNow;
  if (!visibleNow) {
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
    return;
  }
  loadStatus().catch(() => {});
  if (!timer) {
    timer = setInterval(() => {
      if (!visibleNow) return;
      loadStatus().catch(() => {});
    }, 2000);
  }
}
