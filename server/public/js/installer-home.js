import { getAdminToken } from "./api.js";
import { installerCustomerCode, isStandalonePwa } from "./installer-pwa.js";

const customerCode = installerCustomerCode;
const OFFLINE_KEY = `tisly_installer_queue_${customerCode}`;
const LAST_SYNC_KEY = `tisly_installer_last_sync_${customerCode}`;
const base = `/customer/${customerCode}`;

function installHeaders() {
  const h = {};
  const token = getAdminToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function getQueueLength() {
  try {
    return (JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]") || []).length;
  } catch {
    return 0;
  }
}

function updateOfflineBar() {
  const online = navigator.onLine;
  const dot = document.getElementById("offline-online-dot");
  const state = document.getElementById("offline-state-text");
  const q = getQueueLength();
  if (dot) {
    dot.classList.toggle("online", online);
    dot.classList.toggle("offline", !online);
  }
  if (state) state.textContent = online ? "オンライン" : "オフライン中";
  const qc = document.getElementById("offline-queue-count");
  if (qc) qc.textContent = `未同期: ${q}`;
  const sync = document.getElementById("offline-last-sync");
  const last = localStorage.getItem(LAST_SYNC_KEY);
  if (sync) sync.textContent = `最終同期: ${last ? new Date(last).toLocaleString("ja-JP") : "—"}`;
  const tile = document.getElementById("tile-sync-status");
  if (tile) tile.textContent = online ? (q ? `${q} 件待ち` : "同期済み") : `オフライン · ${q} 件`;
}

async function flushQueue() {
  const q = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
  if (!q.length || !navigator.onLine) return;
  const res = await fetch(`/api/customer/${customerCode}/install/sync`, {
    method: "POST",
    headers: { ...installHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ entries: q }),
  });
  if (!res.ok) throw new Error(await res.text());
  localStorage.setItem(OFFLINE_KEY, "[]");
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  updateOfflineBar();
}

async function loadHomeData() {
  if (!getAdminToken()) {
    location.href = base;
    return;
  }
  const dash = await fetch(`/api/customer/${customerCode}/install/dashboard`, {
    headers: installHeaders(),
  }).then((r) => (r.ok ? r.json() : null));
  if (dash) {
    document.getElementById("tile-today-value").textContent =
      dash.registered != null ? `${dash.registered} 台登録` : "—";
    const inc = (dash.incompleteOnly ?? []).length;
    document.getElementById("tile-incomplete-value").textContent = String(inc);
  }
}

document.getElementById("home-customer-code").textContent = customerCode;
document.getElementById("link-full-install").href = `${base}/install`;
document.getElementById("link-portal").href = base;
document.getElementById("tile-today").href = `${base}/install#site`;
document.getElementById("tile-incomplete").href = `${base}/install#dash`;
document.getElementById("tile-qr").href = `${base}/install#qr`;
document.getElementById("tile-map").href = `${base}/map`;
document.getElementById("tile-mqtt").href = `${base}/install#mqtt`;
document.getElementById("tile-report").href = `${base}/install#done`;

document.getElementById("btn-offline-flush")?.addEventListener("click", () => {
  flushQueue().catch((e) => alert(String(e)));
});

window.addEventListener("online", updateOfflineBar);
window.addEventListener("offline", updateOfflineBar);

updateOfflineBar();
if (!isStandalonePwa()) {
  document.getElementById("pwa-install-bar")?.removeAttribute("hidden");
}

loadHomeData().catch(() => {});
