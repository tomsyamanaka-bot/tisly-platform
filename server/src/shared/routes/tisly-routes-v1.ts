/**
 * TiSLY URL契約 v1 — React Native / Expo 流用前提の単一ソース
 * DOM・Express 双方から参照する。
 */

export type TislyRouteZoneV1 = "internal" | "customer" | "diagnostics";

export interface TislyRouteEntryV1 {
  path: string;
  label: string;
  zone: TislyRouteZoneV1;
  /** 下部ナビに含まれるか（社内PWAのみ） */
  bottomNav?: boolean;
}

/** 社内 PWA — 正式 URL */
export const TISLY_INTERNAL_ROUTES_V1: TislyRouteEntryV1[] = [
  { path: "/app", label: "App Hub", zone: "internal" },
  { path: "/schedule-v1", label: "日程調整", zone: "internal", bottomNav: true },
  { path: "/survey-v1", label: "現調", zone: "internal", bottomNav: true },
  { path: "/survey-drawing-v1", label: "現調図面", zone: "internal" },
  { path: "/estimate-v1", label: "見積", zone: "internal", bottomNav: true },
  { path: "/estimate-v1?tab=invoice", label: "請求", zone: "internal", bottomNav: true },
  { path: "/projects-v1", label: "案件一覧", zone: "internal", bottomNav: true },
  { path: "/field-checklist-v1", label: "現場チェック", zone: "internal", bottomNav: true },
  { path: "/field-check-v1", label: "材料チェック", zone: "internal", bottomNav: true },
  { path: "/field-check-v1?tab=orders", label: "発注タブ", zone: "internal", bottomNav: true },
  { path: "/project-dashboard-v1", label: "案件ダッシュボード", zone: "internal" },
  { path: "/project-mgmt-detail-v1", label: "案件詳細", zone: "internal" },
  { path: "/document-center-v1", label: "書類センター", zone: "internal" },
  { path: "/customer-admin-v1", label: "Customer Master管理", zone: "internal" },
  { path: "/customer-view-v1", label: "顧客を見る", zone: "internal" },
  { path: "/eco-water-v1", label: "Eco-Water 排水中和", zone: "internal" },
  { path: "/app/eco-water", label: "Eco-Water (App)", zone: "internal" },
  { path: "/gas-monitor-v1", label: "ガス見守り・ボンベ", zone: "internal" },
  { path: "/app/gas-monitor", label: "ガス見守り (App)", zone: "internal" },
  {
    path: "/demand-security-v1",
    label: "電気デマンド・防犯",
    zone: "internal",
  },
  {
    path: "/app/demand-security",
    label: "電気デマンド (App)",
    zone: "internal",
  },
  {
    path: "/home-v1",
    label: "TiSLY HOME 住設統合",
    zone: "internal",
  },
  {
    path: "/app/home",
    label: "TiSLY HOME (App)",
    zone: "internal",
  },
  {
    path: "/device-binding-v1",
    label: "RP2350 QR物件登録",
    zone: "internal",
  },
  {
    path: "/app/device-binding",
    label: "RP2350 QR物件登録 (App)",
    zone: "internal",
  },
  {
    path: "/price-cost-master-v1",
    label: "価格・原価マスター",
    zone: "internal",
  },
  {
    path: "/security-v1",
    label: "TiSLY Security",
    zone: "internal",
  },
  {
    path: "/app/security-v1",
    label: "TiSLY Security (App)",
    zone: "internal",
  },
  {
    path: "/builder",
    label: "3D Floorplan Builder",
    zone: "internal",
  },
  {
    path: "/floorplan-builder",
    label: "3D Floorplan Builder (alias)",
    zone: "internal",
  },
  {
    path: "/app/builder",
    label: "3D Floorplan Builder (App)",
    zone: "internal",
  },
  {
    path: "/app/price-cost-master",
    label: "価格・原価マスター (App)",
    zone: "internal",
  },
  { path: "/route-health", label: "Route Health", zone: "diagnostics" },
];

/** お客様ポータル — 正式 URL（PWA start_url = /customer） */
export const TISLY_CUSTOMER_ROUTES_V1: TislyRouteEntryV1[] = [
  { path: "/customer", label: "お客様ポータル", zone: "customer" },
  { path: "/customer/:customerCode", label: "お客様案件一覧", zone: "customer" },
  { path: "/customer/project/:shareId", label: "お客様案件詳細", zone: "customer" },
  { path: "/customer/document/:shareId", label: "お客様資料閲覧", zone: "customer" },
  { path: "/customer/monitoring/:shareId", label: "お客様監視画面", zone: "customer" },
  { path: "/customer/eco-water", label: "Eco-Water 水質", zone: "customer" },
  {
    path: "/customer/gas-monitor",
    label: "ガス見守り",
    zone: "customer",
  },
  {
    path: "/customer/demand-security",
    label: "電気・防犯",
    zone: "customer",
  },
  {
    path: "/customer/home",
    label: "TiSLY HOME 住まい",
    zone: "customer",
  },
  {
    path: "/customer/security",
    label: "ホームセキュリティ",
    zone: "customer",
  },
];

/** 旧 URL → 新 URL（301 永久リダイレクト） */
export const TISLY_LEGACY_REDIRECTS_V1: Array<{
  from: string;
  to: string;
  note: string;
}> = [
  { from: "/estimate", to: "/estimate-v1", note: "見積 PWA" },
  { from: "/invoice", to: "/estimate-v1?tab=invoice", note: "請求タブ" },
  { from: "/drawing-editor", to: "/survey-drawing-v1", note: "現調図面" },
  { from: "/survey", to: "/survey-v1", note: "現調 v1" },
  { from: "/projects", to: "/projects-v1", note: "案件一覧" },
  { from: "/materials", to: "/field-check-v1", note: "材料チェック" },
  { from: "/materials-v1", to: "/field-check-v1", note: "材料 alias" },
  { from: "/purchase", to: "/field-check-v1?tab=orders", note: "発注タブ" },
  { from: "/customer-portal", to: "/customer", note: "旧顧客ポータル入口" },
];

export const TISLY_CUSTOMER_PWA_START_URL = "/customer";

export const TISLY_CUSTOMER_RESERVED_SEGMENTS = new Set([
  "project",
  "document",
  "monitoring",
  "new",
  "eco-water",
  "gas-monitor",
  "demand-security",
  "home",
  "security",
]);
export function isCustomerReservedSegmentV1(segment: string): boolean {
  return TISLY_CUSTOMER_RESERVED_SEGMENTS.has(String(segment ?? "").toLowerCase());
}

export function buildCustomerProjectUrlV1(shareId: string): string {
  return `/customer/project/${encodeURIComponent(shareId)}`;
}

export function buildCustomerDocumentUrlV1(
  shareId: string,
  fileIdOrOpts?: string | { fileId?: string; docType?: string }
): string {
  const base = `/customer/document/${encodeURIComponent(shareId)}`;
  const opts =
    typeof fileIdOrOpts === "string" ? { fileId: fileIdOrOpts } : fileIdOrOpts;
  const params = new URLSearchParams();
  if (opts?.docType) params.set("docType", opts.docType);
  if (opts?.fileId) params.set("fileId", opts.fileId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildCustomerMonitoringUrlV1(shareId: string): string {
  return `/customer/monitoring/${encodeURIComponent(shareId)}`;
}

export function buildCustomerHomeUrlV1(customerCode: string): string {
  return `/customer/${encodeURIComponent(customerCode)}`;
}

export function buildDocumentCenterUrlV1(projectId?: string): string {
  return projectId
    ? `/document-center-v1?projectId=${encodeURIComponent(projectId)}`
    : "/document-center-v1";
}

export const TISLY_ALL_CANONICAL_ROUTES_V1: TislyRouteEntryV1[] = [
  ...TISLY_INTERNAL_ROUTES_V1,
  ...TISLY_CUSTOMER_ROUTES_V1,
];
