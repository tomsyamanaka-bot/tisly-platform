/**
 * TV ローカル設定（AsyncStorage 相当 — メモリ + 永続化フック用）
 */

export type SignageMode = "security" | "facility" | "factory" | "hotel";
export type UiMode = "simple" | "professional";
export type OperatorMode = "soc" | "noc";

export interface TvSettings {
  serverUrl: string;
  pairingCode: string;
  siteId: string;
  displayMode: "dashboard" | "security" | "cameras";
  cameraMode: "placeholder" | "rtsp" | "webrtc";
  soundOn: boolean;
  autoRecoverOn: boolean;
  /** Phase 61–80: サーバー側デモイベントを積極表示 */
  demoMode: boolean;
  /** TV サイネージテーマ */
  signageMode: SignageMode;
  cameraGrid: 4 | 8;
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
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === "true",
  signageMode: "security",
  cameraGrid: 4,
};

let cache: TvSettings = { ...defaults };

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

export const SIGNAGE_LABELS: Record<SignageMode, string> = {
  security: "Security — セキュリティ監視",
  facility: "Facility — 施設管理",
  factory: "Factory — 工場ライン",
  hotel: "Hotel — 民泊・ホテル",
};
