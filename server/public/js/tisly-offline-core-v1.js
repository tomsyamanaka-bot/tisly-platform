/**
 * TiSLY オフライン完全対応コア v1
 * IndexedDB 同期キュー + スナップショット
 * 既存 localStorage 系と併存（追記のみ）
 */

export const OFFLINE_CORE_VERSION = "offline-core-v1";
export const OFFLINE_CORE_DB = "tisly_offline_core_v1";
export const OFFLINE_CORE_DB_VER = 1;
export const OFFLINE_QUEUE_STORE = "sync_queue";
export const OFFLINE_SNAPSHOT_STORE = "snapshots";

/** ネットワーク接続可否 */
export function isOnlineV1() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB_unavailable"));
      return;
    }
    const req = indexedDB.open(OFFLINE_CORE_DB, OFFLINE_CORE_DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      // 既存ストアは触らず不足分のみ追加
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        const store = db.createObjectStore(OFFLINE_QUEUE_STORE, {
          keyPath: "id",
        });
        store.createIndex("enqueuedAt", "enqueuedAt", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
      }
      if (!db.objectStoreNames.contains(OFFLINE_SNAPSHOT_STORE)) {
        db.createObjectStore(OFFLINE_SNAPSHOT_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_open_failed"));
  });
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_request_failed"));
  });
}

function newId() {
  return (
    (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
    `off-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
}

/**
 * 同期待ちエントリを IndexedDB へ追記
 * @param {{ kind: string; url: string; method?: string; headers?: object; body?: unknown; meta?: object }} entry
 */
export async function enqueueOfflineSyncV1(entry) {
  const db = await openDb();
  try {
    const row = {
      id: newId(),
      kind: entry.kind || "generic",
      url: entry.url,
      method: (entry.method || "POST").toUpperCase(),
      headers: entry.headers || {},
      body: entry.body ?? null,
      meta: entry.meta || {},
      enqueuedAt: new Date().toISOString(),
      retries: 0,
    };
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
    await idbRequest(tx.objectStore(OFFLINE_QUEUE_STORE).add(row));
    notifyQueueChanged();
    requestBackgroundSync();
    return row;
  } finally {
    db.close();
  }
}

/** キュー件数 */
export async function getOfflineQueueCountV1() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
      const n = await idbRequest(tx.objectStore(OFFLINE_QUEUE_STORE).count());
      return Number(n) || 0;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/** キュー全件取得（古い順） */
export async function listOfflineSyncQueueV1() {
  const db = await openDb();
  try {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
    const rows = await idbRequest(tx.objectStore(OFFLINE_QUEUE_STORE).getAll());
    return (rows || []).sort((a, b) =>
      String(a.enqueuedAt).localeCompare(String(b.enqueuedAt))
    );
  } finally {
    db.close();
  }
}

async function removeQueueItem(id) {
  const db = await openDb();
  try {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
    await idbRequest(tx.objectStore(OFFLINE_QUEUE_STORE).delete(id));
  } finally {
    db.close();
  }
}

async function bumpRetry(entry) {
  const db = await openDb();
  try {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    await idbRequest(
      store.put({ ...entry, retries: (entry.retries || 0) + 1 })
    );
  } finally {
    db.close();
  }
}

/**
 * ページ/API スナップショット保存（閲覧用）
 * 既存キーは上書き更新のみ（他キーは保護）
 */
export async function saveOfflineSnapshotV1(key, data) {
  if (!key) return false;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(OFFLINE_SNAPSHOT_STORE, "readwrite");
      await idbRequest(
        tx.objectStore(OFFLINE_SNAPSHOT_STORE).put({
          key: String(key),
          data,
          savedAt: new Date().toISOString(),
        })
      );
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/** スナップショット読込 */
export async function loadOfflineSnapshotV1(key) {
  if (!key) return null;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(OFFLINE_SNAPSHOT_STORE, "readonly");
      const row = await idbRequest(
        tx.objectStore(OFFLINE_SNAPSHOT_STORE).get(String(key))
      );
      return row?.data ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * オンライン時にキューをバックグラウンド同期
 * @returns {{ flushed: number; remain: number; errors: string[] }}
 */
export async function flushOfflineSyncQueueV1() {
  if (!isOnlineV1()) {
    return {
      flushed: 0,
      remain: await getOfflineQueueCountV1(),
      errors: [],
    };
  }

  const queue = await listOfflineSyncQueueV1();
  let flushed = 0;
  const errors = [];

  for (const entry of queue) {
    try {
      const headers = { ...(entry.headers || {}) };
      const init = {
        method: entry.method || "POST",
        headers,
      };
      if (entry.body != null && entry.method !== "GET") {
        if (typeof entry.body === "string") {
          init.body = entry.body;
        } else {
          if (!headers["Content-Type"] && !headers["content-type"]) {
            headers["Content-Type"] = "application/json";
          }
          init.body = JSON.stringify(entry.body);
        }
      }
      const res = await fetch(entry.url, init);
      if (res.ok || res.status === 409) {
        await removeQueueItem(entry.id);
        flushed++;
      } else {
        await bumpRetry(entry);
        errors.push(`${entry.kind}:${res.status}`);
      }
    } catch (e) {
      await bumpRetry(entry);
      errors.push(`${entry.kind}:${e?.message || "network"}`);
      break;
    }
  }

  notifyQueueChanged();
  return {
    flushed,
    remain: await getOfflineQueueCountV1(),
    errors,
  };
}

function notifyQueueChanged() {
  try {
    window.dispatchEvent(
      new CustomEvent("tisly-offline-queue-changed", {
        detail: { version: OFFLINE_CORE_VERSION },
      })
    );
  } catch {
    /* ignore */
  }
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "QUEUE_UPDATED",
      source: OFFLINE_CORE_VERSION,
    });
  }
}

function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      if ("sync" in reg) {
        return reg.sync.register("tisly-offline-core-sync");
      }
      return null;
    })
    .catch(() => {});
}

/**
 * オフライン時はミューテーションをキューへ退避
 * GET は通常 fetch（失敗時は呼び出し側でスナップショット利用）
 */
export async function offlineAwareFetchV1(url, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const isMutate = method !== "GET" && method !== "HEAD";

  if (!isOnlineV1() && isMutate) {
    let body = opts.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep string */
      }
    }
    await enqueueOfflineSyncV1({
      kind: opts.offlineKind || "generic",
      url,
      method,
      headers: opts.headers || {},
      body,
      meta: opts.offlineMeta || {},
    });
    return {
      ok: true,
      status: 202,
      queued: true,
      json: async () => ({ queued: true, offline: true }),
    };
  }

  try {
    const res = await fetch(url, opts);
    return res;
  } catch (e) {
    if (isMutate) {
      let body = opts.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          /* keep */
        }
      }
      await enqueueOfflineSyncV1({
        kind: opts.offlineKind || "generic",
        url,
        method,
        headers: opts.headers || {},
        body,
        meta: { ...(opts.offlineMeta || {}), networkError: true },
      });
      return {
        ok: true,
        status: 202,
        queued: true,
        json: async () => ({ queued: true, offline: true }),
      };
    }
    throw e;
  }
}

/** online / SW メッセージで自動フラッシュ */
export function bindOfflineSyncAutoFlushV1(opts = {}) {
  const debounceMs = opts.debounceMs ?? 600;
  let timer = null;

  const run = () => {
    if (!isOnlineV1()) return;
    void flushOfflineSyncQueueV1().then((r) => {
      if (r.flushed > 0 && typeof opts.onFlushed === "function") {
        opts.onFlushed(r);
      }
      if (typeof opts.onStatus === "function") {
        opts.onStatus(r);
      }
    });
  };

  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(run, debounceMs);
  };

  window.addEventListener("online", schedule);
  window.addEventListener("tisly-offline-queue-changed", schedule);

  const onSwMessage = (ev) => {
    if (ev.data?.type === "FLUSH_OFFLINE_QUEUE") schedule();
  };
  navigator.serviceWorker?.addEventListener?.("message", onSwMessage);

  if (isOnlineV1()) schedule();

  return () => {
    window.removeEventListener("online", schedule);
    window.removeEventListener("tisly-offline-queue-changed", schedule);
    navigator.serviceWorker?.removeEventListener?.("message", onSwMessage);
    if (timer) window.clearTimeout(timer);
  };
}
