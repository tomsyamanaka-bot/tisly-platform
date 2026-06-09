/**
 * Phase 2041–2080 — PWA アイコン本番確認（manifest / apple-touch / キャッシュバスト）
 */
export interface PwaIconAssetCheck {
    id: string;
    label: string;
    url: string;
    ok: boolean;
    detail?: string;
}
export interface PwaIconCheckReport {
    phase: "2041-2080";
    iconVersion: string;
    ready: boolean;
    checks: PwaIconAssetCheck[];
    manifestIconsVersioned: boolean;
    manifestNoOldIconUrls: boolean;
    appleTouchIconExists: boolean;
    appHubHasAppleTouchIcon: boolean;
    safariReinstallSteps: string[];
    curlVerifyBlock: string[];
}
export declare const SAFARI_PWA_REINSTALL_STEPS: readonly ["既存の TiSLY ホーム画面アイコンを長押し →「削除」", "Safari で https://tisly.jp/app を開く", "共有ボタン →「ホーム画面に追加」", "追加画面のプレビューが六角シールド（TiSLY ロゴ）になっていることを確認", "まだ緑十字アイコンなら: 設定 → Safari →「履歴とWebサイトデータを消去」→ 上記を再実行"];
export declare function buildVpsPwaIconUpdateBlock(): string[];
/** @deprecated buildVpsPwaIconUpdateBlock() を使用 */
export declare const VPS_PWA_ICON_UPDATE_BLOCK: string[];
export declare function buildPwaIconCheck(): PwaIconCheckReport;
