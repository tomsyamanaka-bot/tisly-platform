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
export declare const RC2_PRODUCTION_ROUTES: ProductionRouteSpec[];
/** RC2 手動確認 URL（tisly.jp 本番ベース） */
export declare function buildRc2CheckUrls(baseUrl?: string, customerCode?: string): string[];
/** テスト用に :code を実際のパスへ解決 */
export declare function resolveProductionRoutePath(spec: ProductionRouteSpec): string;
