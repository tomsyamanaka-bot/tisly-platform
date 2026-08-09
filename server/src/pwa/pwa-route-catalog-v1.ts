/** Canonical PWA route catalog — used by route-health and docs/routes/ROUTE_MAP.md */

export type PwaRouteCheckKind = "page" | "api";

export interface PwaRouteEntryV1 {
  path: string;
  label: string;
  group: string;
  kind: PwaRouteCheckKind;
  /** Legacy alias that redirects here */
  legacy?: string[];
}

export const PWA_ROUTE_CATALOG_V1: PwaRouteEntryV1[] = [
  { path: "/app", label: "App Hub", group: "core", kind: "page" },
  { path: "/schedule-v1", label: "日程調整", group: "practical", kind: "page" },
  { path: "/schedule-v1/day", label: "日程詳細", group: "practical", kind: "page" },
  { path: "/survey-v1", label: "現調 v1", group: "practical", kind: "page", legacy: ["/survey"] },
  { path: "/survey-drawing-v1", label: "現調図面", group: "practical", kind: "page", legacy: ["/drawing-editor"] },
  { path: "/estimate-v1", label: "見積・請求", group: "practical", kind: "page", legacy: ["/estimate", "/invoice"] },
  { path: "/projects-v1", label: "現場・書類", group: "practical", kind: "page", legacy: ["/projects"] },
  { path: "/field-check-v1", label: "持ち物チェック", group: "practical", kind: "page", legacy: ["/materials", "/materials-v1"] },
  { path: "/field-checklist-v1", label: "現場チェックリスト", group: "practical", kind: "page" },
  { path: "/purchase-v1", label: "発注", group: "practical", kind: "page" },
  { path: "/project-dashboard-v1", label: "案件ダッシュボード", group: "practical", kind: "page" },
  { path: "/project-mgmt-v1", label: "案件管理", group: "practical", kind: "page" },
  { path: "/documents-v1", label: "Document Center", group: "practical", kind: "page" },
  { path: "/settings-v1", label: "設定", group: "practical", kind: "page" },
  { path: "/master-v1", label: "見積マスター", group: "practical", kind: "page" },
  { path: "/google-calendar-settings-v1", label: "Googleカレンダー", group: "practical", kind: "page" },
  { path: "/storage-settings-v1", label: "ストレージ設定", group: "practical", kind: "page" },
  { path: "/monitoring-3d-v2", label: "Monitoring 3D V3", group: "monitoring", kind: "page" },
  { path: "/monitoring-map-assets-v1", label: "mapAsset Manager", group: "monitoring", kind: "page" },
  { path: "/tisly-monitoring-3d-v1", label: "Monitoring 3D V1", group: "monitoring", kind: "page" },
  { path: "/print-model-viewer", label: "3Dプリント ビューワー", group: "practical", kind: "page" },
  { path: "/print-model-viewer-v1", label: "3Dプリント ビューワー (v1)", group: "practical", kind: "page" },
  { path: "/route-map", label: "Route Map (dev)", group: "diagnostics", kind: "page" },
  { path: "/route-health", label: "Route Health", group: "diagnostics", kind: "page" },
  { path: "/business", label: "TOMS業務", group: "business", kind: "page" },
  { path: "/knowledge-search-v1", label: "ナレッジ検索", group: "knowledge", kind: "page" },
  { path: "/knowledge-v1", label: "Knowledge v1", group: "knowledge", kind: "page" },
  { path: "/knowledge-register-v1", label: "ナレッジ登録", group: "knowledge", kind: "page" },
  { path: "/remote-v1", label: "Remote v1", group: "iot", kind: "page" },
  { path: "/knowledge-field-v1", label: "現場ナレッジ", group: "knowledge", kind: "page" },
  { path: "/knowledge-module-v1", label: "ナレッジモジュール", group: "knowledge", kind: "page" },
  // TiSLY Eco-Water（追記）
  { path: "/eco-water-v1", label: "Eco-Water 排水中和", group: "iot", kind: "page" },
  { path: "/app/eco-water", label: "Eco-Water (App)", group: "iot", kind: "page" },
  { path: "/customer/eco-water", label: "Eco-Water (Customer)", group: "iot", kind: "page" },
  { path: "/api/health", label: "Health API", group: "api", kind: "api" },
  { path: "/api/survey/v1/projects", label: "Survey API", group: "api", kind: "api" },
  { path: "/api/estimate/v1/projects", label: "Estimate API", group: "api", kind: "api" },
  { path: "/api/projects/v1/projects", label: "Projects API", group: "api", kind: "api" },
];

export const PWA_LEGACY_REDIRECTS_V1: Array<{ from: string; to: string; note: string }> = [
  { from: "/estimate", to: "/estimate-v1", note: "見積 PWA" },
  { from: "/invoice", to: "/estimate-v1?tab=invoice", note: "請求タブ" },
  { from: "/drawing-editor", to: "/survey-drawing-v1", note: "現調図面" },
  { from: "/survey", to: "/survey-v1", note: "現調 v1" },
  { from: "/projects", to: "/projects-v1", note: "現場 PWA" },
  { from: "/materials", to: "/field-check-v1", note: "持ち物（materials-v1 ページ未実装）" },
  { from: "/materials-v1", to: "/field-check-v1", note: "持ち物 alias" },
  { from: "/purchase", to: "/field-check-v1?tab=orders", note: "発注タブ" },
  { from: "/customer-portal", to: "/customer", note: "旧顧客ポータル入口" },
];
