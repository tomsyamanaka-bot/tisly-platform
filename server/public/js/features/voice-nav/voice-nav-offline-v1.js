/**
 * 音声ナビ オフライン退避 v1
 * 対話ログを localStorage に保持し
 * オンライン復帰後に同期キューへ載せる
 */
import {
  enqueueOfflineResilienceV1,
  isNetworkOnlineV1,
} from "../../offline-resilience-v1.js";

export const VOICE_NAV_LOG_STORAGE_PREFIX = "tisly:voice-nav-log:";

/** セッション単位のログキー */
export function voiceNavLogStorageKeyV1(sessionId) {
  return `${VOICE_NAV_LOG_STORAGE_PREFIX}${sessionId}`;
}

/**
 * ログ行を端末内へ追記保存
 * @param {string} sessionId
 * @param {object} entry
 */
export function appendVoiceNavLogLocalV1(sessionId, entry) {
  const key = voiceNavLogStorageKeyV1(sessionId);
  let rows = [];
  try {
    rows = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  rows.push({
    ...entry,
    at: entry.at || new Date().toISOString(),
  });
  localStorage.setItem(key, JSON.stringify(rows));
  return rows;
}

export function readVoiceNavLogLocalV1(sessionId) {
  try {
    const raw = localStorage.getItem(voiceNavLogStorageKeyV1(sessionId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 音声ログをサーバー同期キューへ登録
 * @param {object} input
 */
export function queueVoiceNavLogSyncV1(input) {
  const payload = {
    projectId: input.projectId || null,
    sketchId: input.sketchId || null,
    sessionId: input.sessionId,
    voiceLog: input.voiceLog || [],
    businessProjectId: input.businessProjectId || null,
    savedAt: new Date().toISOString(),
  };

  appendVoiceNavLogLocalV1(input.sessionId, {
    role: "system",
    text: `[offline] ログ ${payload.voiceLog.length} 件を退避`,
  });

  enqueueOfflineResilienceV1("voice_nav_log", payload);
}

/**
 * API 送信（オフライン時はキュー）
 * @returns {Promise<{queued: boolean, result?: object}>}
 */
export async function syncVoiceNavLogToServerV1(input, fetchFn) {
  const body = {
    voiceLog: input.voiceLog,
    businessProjectId: input.businessProjectId ?? null,
  };

  if (!input.sketchId) {
    queueVoiceNavLogSyncV1(input);
    return { queued: true };
  }

  if (!isNetworkOnlineV1()) {
    queueVoiceNavLogSyncV1(input);
    return { queued: true };
  }

  try {
    const res = await fetchFn(
      `/api/survey/v1/drawing-sketches/${encodeURIComponent(input.sketchId)}/ai-pipeline`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      queueVoiceNavLogSyncV1(input);
      return { queued: true, error: data.userMessage || data.error };
    }
    return { queued: false, result: data };
  } catch {
    queueVoiceNavLogSyncV1(input);
    return { queued: true };
  }
}
