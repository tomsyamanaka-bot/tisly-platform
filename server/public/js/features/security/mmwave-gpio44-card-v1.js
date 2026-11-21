/**
 * 板橋自宅の GPIO44 ミリ波カード。
 * 保存中の秒数は、ポーリングで戻さない。
 */

import { showViewportToast } from "./toast-viewport-v1.js";

const SITE_ID = "HOME-JP-ITABASHI-LIVE";
const PRESETS = [3, 5, 10, 15, 30];

let timer = 0;
let visibleNow = false;
let pendingSec = null;
let saveFlight = null;

function text(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function paintDwell(sec) {
  document.querySelectorAll("[data-mmwave-sec]").forEach((btn) => {
    const n = Number(btn.getAttribute("data-mmwave-sec"));
    btn.classList.toggle("is-on", n === sec);
    btn.setAttribute("aria-pressed", n === sec ? "true" : "false");
  });
}

function holdOf(body) {
  const raw = body?.mmwaveHoldSeconds ?? body?.dwellSec;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function elapsedSec(body) {
  const held = Math.max(0, Number(body?.heldMs) || 0);
  if (body?.phase !== "approach" && body?.phase !== "dwell") {
    return Math.floor(held / 1000);
  }
  const at = Date.parse(body?.updatedAt || "");
  const extra = Number.isFinite(at) ? Math.max(0, Date.now() - at) : 0;
  return Math.floor((held + extra) / 1000);
}

function phaseText(body) {
  const hold = holdOf(body) || 5;
  if (body?.phase === "dwell" || body?.gpioLevel === 1 && body?.phase === "dwell") {
    return "🚨 滞留警報発報中！";
  }
  if (body?.phase === "approach" || body?.gpioLevel === 1) {
    return `🟡 接近検知中（経過: ${elapsedSec(body)}秒 / 判定: ${hold}秒）`;
  }
  return "🟢 クリア（待機中）";
}

async function loadStatus() {
  const res = await fetch(
    `/api/home/v1/itabashi/mmwave?siteId=${encodeURIComponent(SITE_ID)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return;
  const body = await res.json();
  text("sf-mmwave-phase", phaseText(body));
  text("sf-mmwave-seen", body.lastEventLabel || "最終反応: 未検知");
  const sec = holdOf(body);
  if (pendingSec == null && sec != null) paintDwell(sec);
  if (pendingSec != null && sec === pendingSec) pendingSec = null;
}

async function saveDwell(sec) {
  pendingSec = sec;
  paintDwell(sec);
  const res = await fetch("/api/home/v1/itabashi/mmwave/dwell", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      siteId: SITE_ID,
      mmwaveHoldSeconds: sec,
      dwellSec: sec,
    }),
  });
  if (!res.ok) {
    showViewportToast("sf-mmwave-toast", "ts-toast", "滞留判定を保存できません", 2800);
    return;
  }
  const body = await res.json();
  const saved = holdOf(body) || sec;
  if (saved === sec) pendingSec = null;
  else pendingSec = sec;
  paintDwell(pendingSec == null ? saved : sec);
  showViewportToast(
    "sf-mmwave-toast",
    "ts-toast",
    `滞留判定を${pendingSec == null ? saved : sec}秒に保存しました`,
    2800
  );
}

async function sendTest() {
  const res = await fetch("/api/home/v1/itabashi/mmwave/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ siteId: SITE_ID }),
  });
  if (!res.ok) {
    showViewportToast("sf-mmwave-toast", "ts-toast", "模擬発報を送れません", 2800);
    return;
  }
  showViewportToast("sf-mmwave-toast", "ts-toast", "模擬発報を送信しました", 2800);
  await loadStatus();
}

function bindOnce() {
  const root = document.getElementById("sf-mmwave-gpio44");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  root.addEventListener("click", (ev) => {
    const test = ev.target.closest("[data-mmwave-test]");
    if (test) {
      sendTest().catch(() => {});
      return;
    }
    const btn = ev.target.closest("[data-mmwave-sec]");
    if (!btn) return;
    const sec = Number(btn.getAttribute("data-mmwave-sec"));
    if (!PRESETS.includes(sec)) return;
    if (saveFlight) return;
    paintDwell(sec);
    saveFlight = saveDwell(sec)
      .catch(() => {})
      .finally(() => {
        saveFlight = null;
      });
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
