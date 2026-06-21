/** TiSLY Monitoring 3D Dashboard V1 — クライアント用レイアウト（server/src と同期） */
export const MONITORING_LAYOUT_SITES_V1 = {
  "DEMO-HOME-001": {
    siteId: "DEMO-HOME-001",
    siteName: "守谷市 戸建てデモ",
    siteKind: "home",
    customerRef: "DEMO-HOME-001",
  },
  "DEMO-PLANT-001": {
    siteId: "DEMO-PLANT-001",
    siteName: "工場ライン デモ",
    siteKind: "plant",
    customerRef: "DEMO-FACTORY-001",
  },
};

export const MONITORING_DEVICE_ICONS = {
  camera: "📷",
  sensor: "📡",
  light: "💡",
  door: "🚪",
  window: "🪟",
  panel: "🎛️",
  gate: "🚧",
  emergency: "🛑",
};

export function resolveMonitoringSiteFromPath() {
  const path = window.location.pathname;
  if (path.includes("plant")) return "DEMO-PLANT-001";
  if (path.includes("home")) return "DEMO-HOME-001";
  const q = new URLSearchParams(window.location.search).get("siteId");
  return q || "DEMO-HOME-001";
}
