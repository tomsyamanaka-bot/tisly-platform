/**
 * お客様ポータル PWA キャッシュ版 — React Native 流用前提（DOM 非依存）
 */

/** HTML script クエリ・検出用 */
export const CUSTOMER_JS_VERSION_V1 = "customer-v1-phase27";

/** service-worker.js 内トークン */
export const CUSTOMER_SW_TOKEN_V1 = "v2407-phase28";

export const CUSTOMER_SW_FULL_VERSION_V1 = `tisly-pwa-${CUSTOMER_SW_TOKEN_V1}`;

/** 古いアセット検出時のバナー文言 */
export const CUSTOMER_UPDATE_BANNER_LABEL_V1 = "更新してください";

/** localStorage キー — 直近確認した JS 版 */
export const CUSTOMER_JS_VERSION_STORAGE_KEY_V1 = "tisly_customer_js_version_v1";
