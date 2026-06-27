/**
 * オフライン救済 v1
 * 図面 JSON · 音声ログの
 * ローカル退避と再同期キュー
 */

export const OFFLINE_RESILIENCE_QUEUE_KEY = "tisly_offline_resilience_queue_v1";
export const OFFLINE_RESILIENCE_VERSION = "offline-resilience-v1";

/** ネットワーク接続可否（navigator.onLine） */
export function isNetworkOnlineV1() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function readQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_RESILIENCE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(OFFLINE_RESILIENCE_QUEUE_KEY, JSON.stringify(items));
}

/**
 * 同期待ちエントリを追加
 * @param {"drawing_sketch_patch"|"drawing_background"|"voice_nav_log"|"ai_pipeline"} kind
 * @param {object} payload
 */
export function enqueueOfflineResilienceV1(kind, payload) {
  const q = readQueue();
  q.push({
    id: crypto.randomUUID?.() || `q-${Date.now()}`,
    kind,
    payload,
    enqueuedAt: new Date().toISOString(),
    retries: 0,
  });
  writeQueue(q);
  updateOfflineResilienceBadgeV1();
  return q.length;
}

export function getOfflineResilienceQueueSizeV1() {
  return readQueue().length;
}

export function updateOfflineResilienceBadgeV1(badgeId = "offline-resilience-badge") {
  const el = document.getElementById(badgeId);
  if (!el) return;
  const n = getOfflineResilienceQueueSizeV1();
  el.textContent = n ? `未同期 ${n} 件` : "";
  el.classList.toggle("hidden", n === 0);
}

/**
 * オンライン復帰時にキューを処理
 * @param {(entry: object) => Promise<boolean>} processor true=成功で削除
 */
export async function flushOfflineResilienceQueueV1(processor) {
  if (!isNetworkOnlineV1()) return { flushed: 0, remain: getOfflineResilienceQueueSizeV1() };

  const q = readQueue();
  if (!q.length) return { flushed: 0, remain: 0 };

  const remain = [];
  let flushed = 0;

  for (const entry of q) {
    try {
      const ok = await processor(entry);
      if (ok) {
        flushed++;
      } else {
        remain.push({ ...entry, retries: (entry.retries ?? 0) + 1 });
      }
    } catch {
      remain.push({ ...entry, retries: (entry.retries ?? 0) + 1 });
    }
  }

  writeQueue(remain);
  updateOfflineResilienceBadgeV1();
  return { flushed, remain: remain.length };
}

/**
 * fetch ラッパー
 * オフライン時は即座に拒否
 */
export async function resilientFetchV1(url, opts = {}) {
  if (!isNetworkOnlineV1()) {
    throw new Error("offline");
  }
  const res = await fetch(url, opts);
  return res;
}

/** online / offline イベントで自動フラッシュ */
export function bindOfflineResilienceAutoSyncV1(processor, opts = {}) {
  const debounceMs = opts.debounceMs ?? 800;
  let timer = null;

  const run = () => {
    if (!isNetworkOnlineV1()) return;
    void flushOfflineResilienceQueueV1(processor).then((r) => {
      if (r.flushed > 0 && typeof opts.onFlushed === "function") {
        opts.onFlushed(r);
      }
    });
  };

  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(run, debounceMs);
  };

  window.addEventListener("online", schedule);
  if (isNetworkOnlineV1()) schedule();

  return () => {
    window.removeEventListener("online", schedule);
    if (timer) window.clearTimeout(timer);
  };
}
