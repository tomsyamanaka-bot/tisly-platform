/**
 * TiSLY HOME — スマートドアホン（TD-B30C 等）PWA 統合 v1
 * 来客Push · 通話DeepLink · RP2350 RO1 解錠
 */

import type { HomeIntercomV1, HomeSiteV1 } from "./home-sites-v1.js";
import { findHomeSiteV1 } from "./home-sites-v1.js";

/** ドアホン拡張フィールド（HomeIntercomV1 へ追記） */
export interface HomeDoorphoneExtrasV1 {
  /** 機種コード（TD-B30C 等） */
  modelId?: string;
  /** 表示用機種名 */
  modelLabel?: string;
  /** マイクミュート */
  micMuted?: boolean;
  /** スピーカー音量 0–100 */
  speakerVolume?: number;
  /** イベント録画中 */
  recording?: boolean;
  /** 通話応答 Deep Link */
  answerDeepLink?: string;
  /** 最終スナップショット取得時刻 */
  lastSnapshotAt?: string | null;
}

export type HomeDoorphoneViewExtrasV1 = {
  modelId: string | null;
  modelLabel: string | null;
  micMuted: boolean;
  speakerVolume: number;
  recording: boolean;
  answerDeepLink: string;
  statusBadge: "live" | "recording" | "ringing" | "idle";
  statusBadgeLabel: string;
  previewMode: "stream" | "snapshot" | "placeholder";
  lastSnapshotAt: string | null;
};

const DEFAULT_DEEP_LINK = "irisdoorphone://answer";
const DEFAULT_WEB_FALLBACK =
  "https://www.irisohyama.co.jp/products/networkcamera/";

function nowIso(): string {
  return new Date().toISOString();
}

function asExtras(ic: HomeIntercomV1): HomeDoorphoneExtrasV1 {
  return ic as HomeIntercomV1 & HomeDoorphoneExtrasV1;
}

/** ビュー用ドアホン拡張情報 */
export function buildDoorphoneViewExtrasV1(
  site: HomeSiteV1
): HomeDoorphoneViewExtrasV1 {
  const ic = site.intercom;
  const ex = asExtras(ic);
  const recording = Boolean(ex.recording);
  const ringing = ic.state === "ringing";
  const hasPreview = Boolean(ic.streamUrl || ic.snapshotUrl);

  let statusBadge: HomeDoorphoneViewExtrasV1["statusBadge"] = "idle";
  let statusBadgeLabel = "待機中";
  if (ringing) {
    statusBadge = "ringing";
    statusBadgeLabel = "呼出中";
  } else if (recording) {
    statusBadge = "recording";
    statusBadgeLabel = "録画中";
  } else if (hasPreview || ic.streamKind === "webrtc") {
    statusBadge = "live";
    statusBadgeLabel = "LIVE";
  }

  const previewMode: HomeDoorphoneViewExtrasV1["previewMode"] =
    ic.streamUrl
      ? "stream"
      : ic.snapshotUrl
        ? "snapshot"
        : "placeholder";

  return {
    modelId: ex.modelId ?? null,
    modelLabel: ex.modelLabel ?? null,
    micMuted: Boolean(ex.micMuted),
    speakerVolume:
      typeof ex.speakerVolume === "number"
        ? Math.max(0, Math.min(100, ex.speakerVolume))
        : 70,
    recording,
    answerDeepLink: ex.answerDeepLink || DEFAULT_DEEP_LINK,
    statusBadge,
    statusBadgeLabel,
    previewMode,
    lastSnapshotAt: ex.lastSnapshotAt ?? null,
  };
}

export function getDoorphoneWebFallbackV1(): string {
  return DEFAULT_WEB_FALLBACK;
}

/** モックスナップショット SVG（玄関プレビュー） */
export function buildDoorphoneSnapshotSvgV1(
  site: HomeSiteV1
): string {
  const ic = site.intercom;
  const ex = asExtras(ic);
  const title = ex.modelLabel || ic.label || "Doorphone";
  const ts = new Date().toLocaleString("ja-JP", { hour12: false });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#F8FAFC"/>
  <rect x="8" y="8" width="624" height="344" rx="12" fill="#1E3A8A" opacity="0.08"/>
  <text x="32" y="52" font-family="sans-serif" font-size="22" font-weight="700" fill="#1E3A8A">${escapeXml(title)}</text>
  <text x="32" y="82" font-size="14" fill="#64748B">${escapeXml(site.displayName)} · ${escapeXml(ts)}</text>
  <rect x="32" y="110" width="576" height="200" rx="8" fill="#E2E8F0"/>
  <text x="320" y="210" text-anchor="middle" font-size="48">📷</text>
  <text x="320" y="250" text-anchor="middle" font-size="14" fill="#475569">玄関前スナップショット（モック）</text>
</svg>`;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface HomeDoorphoneControlResultV1 {
  ok: boolean;
  message?: string;
  error?: string;
  doorphone?: HomeDoorphoneViewExtrasV1;
  snapshotUrl?: string;
}

/** ドアホン拡張操作（mic / speaker / snapshot / record） */
export function applyHomeDoorphoneControlV1(
  site: HomeSiteV1,
  action: string,
  value: unknown
): HomeDoorphoneControlResultV1 {
  const ic = site.intercom;
  const ex = asExtras(ic);

  switch (action) {
    case "toggle_mic": {
      ex.micMuted = !Boolean(ex.micMuted);
      return {
        ok: true,
        message: ex.micMuted ? "マイクをミュートしました" : "マイクをオンにしました",
        doorphone: buildDoorphoneViewExtrasV1(site),
      };
    }
    case "set_speaker": {
      const vol = Number(value);
      if (!Number.isFinite(vol)) {
        return { ok: false, error: "音量は 0–100 の数値です" };
      }
      ex.speakerVolume = Math.max(0, Math.min(100, Math.round(vol)));
      return {
        ok: true,
        message: `スピーカー音量 ${ex.speakerVolume}%`,
        doorphone: buildDoorphoneViewExtrasV1(site),
      };
    }
    case "toggle_speaker_mute": {
      const cur = ex.speakerVolume ?? 70;
      ex.speakerVolume = cur <= 0 ? 70 : 0;
      return {
        ok: true,
        message:
          ex.speakerVolume <= 0
            ? "スピーカーをミュートしました"
            : "スピーカー音量を復帰しました",
        doorphone: buildDoorphoneViewExtrasV1(site),
      };
    }
    case "snapshot": {
      ex.lastSnapshotAt = nowIso();
      const url = `/api/home/v1/doorphone/snapshot?siteId=${encodeURIComponent(site.id)}&t=${Date.now()}`;
      ic.snapshotUrl = url;
      return {
        ok: true,
        message: "スナップショットを保存しました",
        snapshotUrl: url,
        doorphone: buildDoorphoneViewExtrasV1(site),
      };
    }
    case "record_start": {
      ex.recording = true;
      return {
        ok: true,
        message: "イベント録画を開始しました",
        doorphone: buildDoorphoneViewExtrasV1(site),
      };
    }
    case "record_stop": {
      ex.recording = false;
      return {
        ok: true,
        message: "イベント録画を停止しました",
        doorphone: buildDoorphoneViewExtrasV1(site),
      };
    }
    default:
      return { ok: false, error: "未対応のドアホン操作です" };
  }
}

export function getDoorphoneSiteOrThrow(siteId: string): HomeSiteV1 {
  const site = findHomeSiteV1(siteId);
  if (!site) throw new Error("物件が見つかりません");
  return site;
}
