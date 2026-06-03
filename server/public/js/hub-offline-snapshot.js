const DB_NAME = "tisly_hub_snapshot_v741";
const STORE = "snapshots";
const TOKEN_KEY = "tisly_token";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "customerCode" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSnapshot(snapshot) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(snapshot);
    tx.oncomplete = () => resolve(snapshot);
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSnapshot(customerCode) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(customerCode);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export function setHubSyncStatus(text) {
  const el = document.getElementById("tisly-sync-status");
  if (el) el.textContent = text;
}

export async function syncHubSnapshot() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    setHubSyncStatus("同期: 未ログイン");
    return null;
  }
  setHubSyncStatus("同期: 実行中…");
  try {
    const res = await fetch("/api/toms/hub/snapshot/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setHubSyncStatus(`同期: 失敗 (${res.status})`);
      return null;
    }
    const body = await res.json();
    const snap = body.snapshot;
    await saveSnapshot(snap);
    setHubSyncStatus(`同期: 完了 ${new Date().toLocaleTimeString()}`);
    return snap;
  } catch {
    setHubSyncStatus("同期: オフライン");
    return null;
  }
}

export async function renderHubFromCache(customerCode) {
  const cached = await loadSnapshot(customerCode);
  if (!cached?.operations) return false;
  const ops = cached.operations;
  const opsEl = document.getElementById("hub-ops-panel");
  if (!opsEl) return false;
  opsEl.querySelectorAll(".hub-workflow-card strong").forEach(() => {});
  const map = {
    "今日の現調": ops.todaySurveys,
    "今日の工事": ops.todayConstruction,
    "未入金": ops.unpaid,
    "異常デバイス": ops.abnormalDevices ?? ops.espAnomaly,
    "保守期限": ops.maintenanceDue,
  };
  opsEl.querySelectorAll(".hub-workflow-card").forEach((card) => {
    const label = card.textContent?.trim().split(/\s/)[0];
    for (const [k, v] of Object.entries(map)) {
      if (card.textContent?.includes(k) && v != null) {
        const strong = card.querySelector("strong");
        if (strong) strong.textContent = String(v);
      }
    }
  });
  setHubSyncStatus(`オフライン表示 · ${cached.savedAt?.slice(0, 16) ?? ""}`);
  return true;
}

export function wireHubSyncButton() {
  document.getElementById("btn-hub-sync")?.addEventListener("click", () => {
    syncHubSnapshot().then(() => window.location.reload());
  });
}

if (!navigator.onLine) {
  const code = sessionStorage.getItem("tisly_customer_code") || "TOMS001";
  renderHubFromCache(code);
}
