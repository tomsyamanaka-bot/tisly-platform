/**
 * TV ローカル設定（AsyncStorage 相当 — メモリ + 永続化フック用）
 * TODO: サーバー TV ペアリング API と同期
 */

export interface TvSettings {
  serverUrl: string;
  pairingCode: string;
  siteId: string;
  displayMode: "dashboard" | "security" | "cameras";
  cameraMode: "placeholder" | "rtsp" | "webrtc";
  soundOn: boolean;
  autoRecoverOn: boolean;
}

const STORAGE_KEY = "tisly.tv.settings";

const defaults: TvSettings = {
  serverUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://tisly.jp",
  pairingCode: "",
  siteId: "default",
  displayMode: "dashboard",
  cameraMode: "placeholder",
  soundOn: true,
  autoRecoverOn: true,
};

let cache: TvSettings = { ...defaults };

/** 起動時に呼ぶ — 将来 AsyncStorage 読み込みに差し替え */
export async function loadTvSettings(): Promise<TvSettings> {
  try {
    if (typeof globalThis !== "undefined") {
      const g = globalThis as { __TISLY_TV_SETTINGS__?: string };
      if (g.__TISLY_TV_SETTINGS__) {
        cache = { ...defaults, ...JSON.parse(g.__TISLY_TV_SETTINGS__) };
      }
    }
  } catch {
    cache = { ...defaults };
  }
  return { ...cache };
}

export function getTvSettings(): TvSettings {
  return { ...cache };
}

export async function saveTvSettings(partial: Partial<TvSettings>): Promise<TvSettings> {
  cache = { ...cache, ...partial };
  try {
    const g = globalThis as { __TISLY_TV_SETTINGS__?: string };
    g.__TISLY_TV_SETTINGS__ = JSON.stringify(cache);
  } catch {
    /* ignore */
  }
  return { ...cache };
}

export function getWsUrlFromSettings(settings: TvSettings): string {
  const base = settings.serverUrl.replace(/\/$/, "");
  if (base.startsWith("https://")) return base.replace("https://", "wss://") + "/ws";
  if (base.startsWith("http://")) return base.replace("http://", "ws://") + "/ws";
  return `wss://${base}/ws`;
}
