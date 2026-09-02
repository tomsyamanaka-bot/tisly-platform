/**
 * 警報スナップショット v1
 *
 * センサー発報時に該当カメラの
 * 静止画モックを生成しタイムラインへ紐付ける。
 * ※ camera-preview を import しない
 *   （循環参照回避のため自己完結）
 */

export interface SecurityAlarmSnapshotV1 {
  id: string;
  at: string;
  cameraId: string;
  cameraLabel: string;
  areaLabel: string;
  /** data URL (SVG) または API パス */
  imageUrl: string;
  thumbUrl: string;
}

/** 発報種別 → カメラ対応（現場日本語） */
const EVENT_CAMERA_MAP_V1: Record<
  string,
  {
    cameraId: string;
    cameraLabel: string;
    areaLabel: string;
    hue: number;
  }
> = {
  main_beam: {
    cameraId: "cam-main-gate",
    cameraLabel: "母屋 玄関カメラ",
    areaLabel: "母屋・玄関",
    hue: 210,
  },
  detached_road: {
    cameraId: "cam-det-road",
    cameraLabel: "はなれ 道路側カメラ",
    areaLabel: "はなれ・道路側",
    hue: 195,
  },
  detached_path: {
    cameraId: "cam-det-path",
    cameraLabel: "はなれ 通路側カメラ",
    areaLabel: "はなれ・通路側",
    hue: 175,
  },
};

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 警報時刻入りスナップショット SVG */
function buildAlarmSnapshotSvgV1(input: {
  label: string;
  areaLabel: string;
  atLabel: string;
  hue?: number;
}): string {
  const hue = input.hue ?? 210;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},40%,16%)"/>
      <stop offset="100%" stop-color="hsl(${hue},50%,6%)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <rect x="0" y="0" width="640" height="36" fill="rgba(185,28,28,0.92)"/>
  <text x="16" y="24" fill="#fff" font-size="14" font-family="system-ui,sans-serif" font-weight="700">警報スナップショット</text>
  <text x="620" y="24" fill="#fecaca" font-size="12" text-anchor="end" font-family="system-ui,sans-serif">${escapeXml(input.atLabel)}</text>
  <text x="320" y="170" fill="#f8fafc" font-size="22" text-anchor="middle" font-family="system-ui,sans-serif">${escapeXml(input.label)}</text>
  <text x="320" y="205" fill="#94a3b8" font-size="15" text-anchor="middle" font-family="system-ui,sans-serif">${escapeXml(input.areaLabel)}</text>
  <text x="320" y="320" fill="#64748b" font-size="12" text-anchor="middle" font-family="system-ui,sans-serif">自動キャプチャ（モック）</text>
</svg>`;
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 発報イベント用スナップショットを生成
 */
export function captureSecurityAlarmSnapshotV1(input: {
  eventKind: string;
  at?: string;
  customerCode?: string;
}): SecurityAlarmSnapshotV1 | null {
  const map = EVENT_CAMERA_MAP_V1[input.eventKind];
  if (!map) return null;
  const at = input.at || new Date().toISOString();
  const atLabel = new Date(at).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const svg = buildAlarmSnapshotSvgV1({
    label: map.cameraLabel,
    areaLabel: map.areaLabel,
    atLabel,
    hue: map.hue,
  });
  const imageUrl = toDataUrl(svg);
  return {
    id: `snap-${Date.now()}-${map.cameraId}`,
    at,
    cameraId: map.cameraId,
    cameraLabel: map.cameraLabel,
    areaLabel: map.areaLabel,
    imageUrl,
    thumbUrl: imageUrl,
  };
}

/** プレビュー用カメラ一覧（自己完結） */
export function listSecuritySnapshotCamerasV1(
  _customerCode?: string
): Array<{ id: string; label: string; location: string }> {
  return Object.values(EVENT_CAMERA_MAP_V1).map((c) => ({
    id: c.cameraId,
    label: c.cameraLabel,
    location: c.areaLabel,
  }));
}
