import { getAdminToken } from "./api.js";
import { installerCustomerCode, isStandalonePwa } from "./installer-pwa.js";

const customerCode = installerCustomerCode;
const OFFLINE_KEY = `tisly_installer_queue_${customerCode}`;
const LAST_SYNC_KEY = `tisly_installer_last_sync_${customerCode}`;
const CHECKLIST_CACHE_KEY = `tisly_field_checklist_${customerCode}`;
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

function enqueueFieldChecklistUpdate(itemId, status) {
  const q = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
  q.push({
    id: `fc-${itemId}-${Date.now()}`,
    action: "field_checklist_update",
    clientAt: new Date().toISOString(),
    body: { itemId, status },
  });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  updateOfflineBar();
}

function statusClass(status) {
  if (status === "done") return "status-done";
  if (status === "needs_review") return "status-review";
  return "status-pending";
}

function renderFieldChecklist(items) {
  const list = document.getElementById("field-checklist-list");
  if (!list) return;
  list.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = `checklist-item ${statusClass(item.status)}`;
    li.innerHTML = `
      <span class="check-label">${item.label}</span>
      <span class="check-status">${item.statusLabel}</span>
      <span class="check-detail">${item.detail}</span>
      <div class="check-actions">
        <button type="button" data-id="${item.id}" data-status="done" class="btn btn-sm">済</button>
        <button type="button" data-id="${item.id}" data-status="needs_review" class="btn btn-sm secondary">要確認</button>
        <button type="button" data-id="${item.id}" data-status="pending" class="btn btn-sm secondary">未</button>
      </div>`;
    list.appendChild(li);
  }
  list.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => updateChecklistItem(btn.dataset.id, btn.dataset.status));
  });
}

async function updateChecklistItem(itemId, status) {
  if (!navigator.onLine) {
    enqueueFieldChecklistUpdate(itemId, status);
    const cached = JSON.parse(localStorage.getItem(CHECKLIST_CACHE_KEY) || "{}");
    if (cached.items) {
      const item = cached.items.find((i) => i.id === itemId);
      if (item) {
        item.status = status;
        item.statusLabel = status === "done" ? "済" : status === "needs_review" ? "要確認" : "未";
        localStorage.setItem(CHECKLIST_CACHE_KEY, JSON.stringify(cached));
        renderFieldChecklist(cached.items);
      }
    }
    return;
  }
  const res = await fetch(
    `/api/customer/${customerCode}/install/field-checklist/${itemId}`,
    {
      method: "PUT",
      headers: { ...installHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }
  );
  if (!res.ok) {
    enqueueFieldChecklistUpdate(itemId, status);
    alert("オフラインキューに保存しました");
    return;
  }
  await loadHomeData();
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
  await loadHomeData();
}

async function loadSecurityInstallSummary() {
  try {
    const [stateRes, presenceRes, rulesRes] = await Promise.all([
      fetch("/api/security/state", { headers: installHeaders() }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch("/api/security/presence/devices", { headers: installHeaders() }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch("/api/security/automation/rules", { headers: installHeaders() }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);
    if (stateRes?.state) {
      const modeLabels = {
        armed: "警戒ON",
        disarmed: "警戒OFF",
        pending_arm: "警戒ON待機",
        pending_disarm: "警戒OFF待機",
      };
      const el = document.getElementById("tile-security-mode");
      if (el) el.textContent = modeLabels[stateRes.state.mode] || stateRes.state.mode;
    }
    const settings = rulesRes?.settings;
    if (settings) {
      const arm = document.getElementById("install-auto-arm");
      const dis = document.getElementById("install-auto-disarm");
      if (arm) arm.textContent = settings.autoArmEnabled ? "ON" : "OFF";
      if (dis) dis.textContent = settings.autoDisarmEnabled ? "ON" : "OFF";
    }
    if (presenceRes?.summary) {
      const pc = document.getElementById("install-presence-count");
      if (pc) {
        pc.textContent = `${presenceRes.summary.enabled} 台（home ${presenceRes.summary.home} / away ${presenceRes.summary.away}）`;
      }
    }
  } catch {
    /* optional panel */
  }
}

async function loadHomeData() {
  if (!getAdminToken()) {
    location.href = base;
    return;
  }
  const [dash, cards] = await Promise.all([
    fetch(`/api/customer/${customerCode}/install/dashboard`, { headers: installHeaders() }).then(
      (r) => (r.ok ? r.json() : null)
    ),
    fetch(`/api/customer/${customerCode}/install/home-cards`, { headers: installHeaders() }).then(
      (r) => (r.ok ? r.json() : null)
    ),
  ]);

  if (cards) {
    document.getElementById("tile-today-value").textContent = cards.todayWork ?? "—";
    document.getElementById("tile-incomplete-value").textContent = String(cards.incompleteCount ?? 0);
    document.getElementById("tile-photo-value").textContent = String(cards.photoShortage ?? 0);
    document.getElementById("tile-mqtt-unconfirmed-value").textContent = String(
      cards.mqttUnconfirmed ?? 0
    );
    document.getElementById("tile-shelly-unconfirmed-value").textContent = String(
      cards.shellyUnconfirmed ?? 0
    );
    if (cards.fieldChecklist?.items) {
      localStorage.setItem(CHECKLIST_CACHE_KEY, JSON.stringify(cards.fieldChecklist));
      renderFieldChecklist(cards.fieldChecklist.items);
    }
  } else if (dash) {
    document.getElementById("tile-today-value").textContent =
      dash.registered != null ? `${dash.registered} 台登録` : "—";
    document.getElementById("tile-incomplete-value").textContent = String(
      (dash.incompleteOnly ?? []).length
    );
  }
  await loadSecurityInstallSummary();
}

document.getElementById("home-customer-code").textContent = customerCode;
document.getElementById("link-full-install").href = `${base}/install`;
document.getElementById("link-portal").href = base;
document.getElementById("card-today").href = `${base}/install#site`;
document.getElementById("card-photo").href = `${base}/install#photos`;
document.getElementById("card-verify").href = `${base}/install#mqtt`;
document.getElementById("card-qr").href = `${base}/install#qr`;
document.getElementById("card-device").href = `${base}/install/device-onboard`;
document.getElementById("card-report").href = `${base}/install#done`;

document.getElementById("btn-offline-flush")?.addEventListener("click", () => {
  flushQueue().catch((e) => alert(String(e)));
});

window.addEventListener("online", () => {
  updateOfflineBar();
  flushQueue().catch(() => {});
});
window.addEventListener("offline", updateOfflineBar);

updateOfflineBar();
if (!isStandalonePwa()) {
  document.getElementById("pwa-install-bar")?.removeAttribute("hidden");
}

const cached = JSON.parse(localStorage.getItem(CHECKLIST_CACHE_KEY) || "null");
if (cached?.items) renderFieldChecklist(cached.items);

loadHomeData().catch(() => {});
