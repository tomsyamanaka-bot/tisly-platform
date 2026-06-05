/**
 * Phase 1201–1240 — tisly.jp 本番 URL 一覧（docs/production_routes.md と同期）
 */

export interface ProductionRouteSpec {
  /** Express パターン（:code はデモ顧客コードに置換） */
  path: string;
  label: string;
  workflow: string;
  htmlFile?: string;
  /** テスト用に :code を置換する顧客コード */
  demoCustomerCode?: string;
}

export const RC2_PRODUCTION_ROUTES: ProductionRouteSpec[] = [
  {
    path: "/app",
    label: "App Hub",
    workflow: "全 PWA 入口",
    htmlFile: "app-hub.html",
  },
  {
    path: "/survey",
    label: "現調 PWA",
    workflow: "現調 → AI見積",
    htmlFile: "survey.html",
  },
  {
    path: "/business",
    label: "TOMS Business",
    workflow: "AI見積 → 見積・施工管理",
    htmlFile: "business.html",
  },
  {
    path: "/sales",
    label: "営業デモ",
    workflow: "展示会・営業プレゼン",
    htmlFile: "sales.html",
  },
  {
    path: "/customer/:code",
    label: "顧客ポータル",
    workflow: "顧客向けダッシュボード",
    htmlFile: "customer-portal.html",
    demoCustomerCode: "TOMS001",
  },
  {
    path: "/customer/:code/pro-remote",
    label: "PRO Remote PWA",
    workflow: "施工 → 遠隔監視",
    htmlFile: "pro-remote.html",
    demoCustomerCode: "TOMS001",
  },
  {
    path: "/customer/:code/install/home",
    label: "施工 PWA",
    workflow: "現場設置・チェックリスト",
    htmlFile: "installer-home.html",
    demoCustomerCode: "TOMS001",
  },
  {
    path: "/tv/:code",
    label: "Google TV Web",
    workflow: "PRO Remote → TV ミラー",
    htmlFile: "tv-dashboard.html",
    demoCustomerCode: "TOMS001",
  },
  {
    path: "/deployment/checklist",
    label: "導入チェックリスト",
    workflow: "引き渡し前確認",
    htmlFile: "deployment-checklist.html",
  },
];

/** RC2 手動確認 URL（tisly.jp 本番ベース） */
export function buildRc2CheckUrls(
  baseUrl = "https://tisly.jp",
  customerCode = "TOMS001"
): string[] {
  return RC2_PRODUCTION_ROUTES.map((r) => {
    const path = r.path.replace(":code", customerCode);
    return `${baseUrl.replace(/\/$/, "")}${path}`;
  });
}

/** テスト用に :code を実際のパスへ解決 */
export function resolveProductionRoutePath(spec: ProductionRouteSpec): string {
  const code = spec.demoCustomerCode ?? "TOMS001";
  return spec.path.replace(":code", code);
}
