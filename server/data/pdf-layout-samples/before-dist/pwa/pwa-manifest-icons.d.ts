/** Phase 2001 / 2041 — 全 PWA 共通アイコンキャッシュバスト（変更時はここだけ更新） */
export declare const APP_ICON_VERSION = "2001";
/** @deprecated APP_ICON_VERSION を使用 */
export declare const PWA_ICON_VERSION = "2001";
export declare function pwaIconSrc(path: string): string;
export declare const PWA_APPLE_TOUCH_ICON: string;
export declare const PWA_MANIFEST_ICONS: readonly [{
    readonly src: string;
    readonly sizes: "64x64";
    readonly type: "image/png";
    readonly purpose: "any";
}, {
    readonly src: string;
    readonly sizes: "128x128";
    readonly type: "image/png";
    readonly purpose: "any";
}, {
    readonly src: string;
    readonly sizes: "192x192";
    readonly type: "image/png";
    readonly purpose: "any maskable";
}, {
    readonly src: string;
    readonly sizes: "256x256";
    readonly type: "image/png";
    readonly purpose: "any";
}, {
    readonly src: string;
    readonly sizes: "384x384";
    readonly type: "image/png";
    readonly purpose: "any";
}, {
    readonly src: string;
    readonly sizes: "512x512";
    readonly type: "image/png";
    readonly purpose: "any maskable";
}];
