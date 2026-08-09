/**
 * Eco-Water LIVE 連携クライアント
 * ポーリング / SSE で実機ステータスを購読
 * デモモードの LocalStorage は触らない
 */

export const ECO_WATER_LIVE_MODE_LS_KEY_V1 =
  "tisly_eco_water_live_mode_v1";

export const ECO_WATER_STATUS_API_V1 = "/api/eco-water/status";
export const ECO_WATER_SSE_API_V1 = "/api/eco-water/status/stream";

/**
 * LIVE モード設定を読込
 * 既定はデモ（false）
 */
export function loadEcoWaterLiveModeV1(storage) {
  if (!storage) return false;
  try {
    return storage.getItem(ECO_WATER_LIVE_MODE_LS_KEY_V1) === "1";
  } catch {
    return false;
  }
}

/** LIVE モード設定を保存（他キーは触らない） */
export function saveEcoWaterLiveModeV1(storage, live) {
  if (!storage) return;
  try {
    storage.setItem(
      ECO_WATER_LIVE_MODE_LS_KEY_V1,
      live ? "1" : "0"
    );
  } catch {
    /* */
  }
}

/**
 * 最新ステータスを1回取得
 * @param {string} siteKey EW-TKB 等
 */
export async function fetchEcoWaterStatusV1(siteKey) {
  const q = encodeURIComponent(String(siteKey || "").trim());
  const res = await fetch(`${ECO_WATER_STATUS_API_V1}?site_id=${q}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`status API ${res.status}`);
  }
  return res.json();
}

/**
 * LIVE 購読コントローラ
 * SSE 優先、失敗時はポーリングへフォールバック
 */
export function createEcoWaterLiveClientV1(options) {
  const {
    getSiteKey,
    onStatus,
    onError,
    pollIntervalMs = 3000,
  } = options;

  /** @type {EventSource | null} */
  let es = null;
  /** @type {number | null} */
  let pollTimer = null;
  let stopped = true;

  function clearPoll() {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function closeEs() {
    if (es) {
      try {
        es.close();
      } catch {
        /* */
      }
      es = null;
    }
  }

  async function pollOnce() {
    try {
      const key = getSiteKey();
      const data = await fetchEcoWaterStatusV1(key);
      if (data?.status) onStatus(data.status, data);
    } catch (err) {
      onError?.(err);
    }
  }

  function startPolling() {
    clearPoll();
    void pollOnce();
    pollTimer = window.setInterval(() => {
      void pollOnce();
    }, pollIntervalMs);
  }

  function startSse() {
    closeEs();
    const key = getSiteKey();
    const url = `${ECO_WATER_SSE_API_V1}?site_id=${encodeURIComponent(key)}`;
    try {
      es = new EventSource(url);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.status) onStatus(data.status, data);
        } catch (err) {
          onError?.(err);
        }
      };
      es.onerror = () => {
        // SSE 断はポーリングへ切替
        closeEs();
        if (!stopped) startPolling();
      };
    } catch {
      startPolling();
    }
  }

  return {
    start() {
      stopped = false;
      if (typeof EventSource !== "undefined") {
        startSse();
      } else {
        startPolling();
      }
    },
    stop() {
      stopped = true;
      closeEs();
      clearPoll();
    },
    restart() {
      this.stop();
      this.start();
    },
    async fetchOnce() {
      return pollOnce();
    },
  };
}
