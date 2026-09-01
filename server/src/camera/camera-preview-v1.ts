/**
 * H.View カメラ WebRTC プレビュー v1
 *
 * RTSP サブストリーム定義と
 * モック / WebRTC セッション情報を返す。
 */

import {
  getCustomerTenantBindingsV1,
} from "../shared/customer/customer-tenant-bindings-v1.js";
import { resolveCustomerTenantProfileV1 } from "../shared/customer/customer-tenant-profile-v1.js";

export type CameraPreviewStatusV1 = "normal" | "recording" | "doorbell";

export interface CameraPreviewTileV1 {
  id: string;
  label: string;
  location: string;
  channel: number;
  status: CameraPreviewStatusV1;
  statusLabel: string;
  rtspSubstreamUrl: string;
  webrtcMode: "mock" | "webrtc";
  posterHue: number;
}

export interface CameraPreviewSessionV1 {
  cameraId: string;
  label: string;
  status: CameraPreviewStatusV1;
  statusLabel: string;
  webrtcMode: "mock" | "webrtc";
  /** モック再生用シグナル URL（将来: WHEP 等） */
  streamUrl: string;
  rtspSubstreamUrl: string;
  nvrLabel: string;
  fullscreenSupported: boolean;
}

/** 顧客別カメラ定義（追記のみ） */
const CAMERA_PRESETS_BY_CODE_V1: Record<
  string,
  Array<Omit<CameraPreviewTileV1, "rtspSubstreamUrl" | "webrtcMode">>
> = {
  TOMS001: [
    {
      id: "cam-entrance",
      label: "玄関カメラ",
      location: "玄関",
      channel: 1,
      status: "normal",
      statusLabel: "正常",
      posterHue: 210,
    },
    {
      id: "cam-katte",
      label: "勝手口カメラ",
      location: "勝手口",
      channel: 2,
      status: "recording",
      statusLabel: "録画中",
      posterHue: 220,
    },
    {
      id: "cam-park",
      label: "駐車場カメラ",
      location: "駐車場",
      channel: 3,
      status: "normal",
      statusLabel: "正常",
      posterHue: 200,
    },
  ],
  TOYOSHIMA001: [
    {
      id: "cam-main-gate",
      label: "母屋 玄関カメラ",
      location: "母屋・玄関",
      channel: 1,
      status: "normal",
      statusLabel: "正常",
      posterHue: 225,
    },
    {
      id: "cam-det-road",
      label: "はなれ 道路側",
      location: "はなれ・道路側",
      channel: 2,
      status: "recording",
      statusLabel: "録画中",
      posterHue: 215,
    },
    {
      id: "cam-det-path",
      label: "はなれ 通路側",
      location: "はなれ・通路側",
      channel: 3,
      status: "doorbell",
      statusLabel: "呼出検知",
      posterHue: 235,
    },
  ],
};

function resolvePresetCode(customerCode: string): string {
  const code = String(customerCode || "").trim().toUpperCase();
  if (code === "TOSHIMA001") return "TOYOSHIMA001";
  if (code === "HOME001") return "TOMS001";
  return code;
}

function buildRtspUrl(base: string | null | undefined, channel: number): string {
  const b = String(base || "rtsp://192.168.1.50:554").replace(/\/$/, "");
  return `${b}/unicast/c${channel}/s1/live`;
}

function enrichTile(
  preset: Omit<CameraPreviewTileV1, "rtspSubstreamUrl" | "webrtcMode">,
  rtspBase: string | null | undefined
): CameraPreviewTileV1 {
  return {
    ...preset,
    rtspSubstreamUrl: buildRtspUrl(rtspBase, preset.channel),
    webrtcMode: "mock",
  };
}

export function listCameraPreviewsForCustomerV1(
  customerCode: string
): CameraPreviewTileV1[] {
  const code = resolvePresetCode(customerCode);
  const bindings = getCustomerTenantBindingsV1(code);
  const presets = CAMERA_PRESETS_BY_CODE_V1[code] ?? [
    {
      id: "cam-1",
      label: "カメラ 1",
      location: "設置場所",
      channel: 1,
      status: "normal" as const,
      statusLabel: "正常",
      posterHue: 210,
    },
  ];
  return presets.map((p) => enrichTile(p, bindings.nvrRtspBase));
}

export function buildCameraPreviewSessionV1(input: {
  customerCode: string;
  cameraId: string;
}): CameraPreviewSessionV1 | null {
  const code = resolvePresetCode(input.customerCode);
  const tiles = listCameraPreviewsForCustomerV1(code);
  const tile = tiles.find((t) => t.id === input.cameraId);
  if (!tile) return null;
  const bindings = getCustomerTenantBindingsV1(code);
  const profile = resolveCustomerTenantProfileV1(code);
  const nvrLabel =
    bindings.nvrLabel ??
    profile?.displayName ??
    code;

  return {
    cameraId: tile.id,
    label: tile.label,
    status: tile.status,
    statusLabel: tile.statusLabel,
    webrtcMode: "mock",
    streamUrl: `/api/camera-preview/v1/mock-stream-auth/${encodeURIComponent(tile.id)}`,
    rtspSubstreamUrl: tile.rtspSubstreamUrl,
    nvrLabel,
    fullscreenSupported: true,
  };
}

/** モック MJPEG 風 SVG（低遅延プレビュー代替） */
export function buildMockCameraStreamSvgV1(input: {
  label: string;
  status: CameraPreviewStatusV1;
  hue?: number;
}): string {
  const hue = input.hue ?? 215;
  const badge =
    input.status === "recording"
      ? "● REC"
      : input.status === "doorbell"
        ? "🔔 呼出"
        : "正常";
  const badgeColor =
    input.status === "doorbell"
      ? "#dc2626"
      : input.status === "recording"
        ? "#ea580c"
        : "#15803d";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},35%,18%)"/>
      <stop offset="100%" stop-color="hsl(${hue},45%,8%)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <text x="320" y="170" fill="#e2e8f0" font-size="22" text-anchor="middle" font-family="system-ui,sans-serif">${escapeXml(input.label)}</text>
  <text x="320" y="200" fill="#94a3b8" font-size="14" text-anchor="middle" font-family="system-ui,sans-serif">H.View RTSP サブストリーム · WebRTC 中継待ち</text>
  <rect x="16" y="16" rx="8" width="88" height="28" fill="${badgeColor}"/>
  <text x="60" y="35" fill="#fff" font-size="13" text-anchor="middle" font-family="system-ui,sans-serif">${badge}</text>
  <text x="620" y="344" fill="#64748b" font-size="11" text-anchor="end" font-family="monospace">TiSLY mock preview</text>
</svg>`;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function findCameraPresetHueV1(
  customerCode: string,
  cameraId: string
): number {
  const tile = listCameraPreviewsForCustomerV1(customerCode).find(
    (t) => t.id === cameraId
  );
  return tile?.posterHue ?? 215;
}

export function findCameraPresetStatusV1(
  customerCode: string,
  cameraId: string
): CameraPreviewStatusV1 {
  const tile = listCameraPreviewsForCustomerV1(customerCode).find(
    (t) => t.id === cameraId
  );
  return tile?.status ?? "normal";
}
