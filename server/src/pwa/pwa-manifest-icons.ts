/** Phase 2001 / 2041 — 全 PWA 共通アイコンキャッシュバスト（変更時はここだけ更新） */
export const APP_ICON_VERSION = "2002";

/** @deprecated APP_ICON_VERSION を使用 */
export const PWA_ICON_VERSION = APP_ICON_VERSION;

export function pwaIconSrc(path: string): string {
  return path.includes("?v=") ? path : `${path}?v=${APP_ICON_VERSION}`;
}

export const PWA_APPLE_TOUCH_ICON = "/apple-touch-icon.png";

export const PWA_MANIFEST_ICONS = [
  { src: pwaIconSrc("/icons/icon-64.png"), sizes: "64x64", type: "image/png", purpose: "any" },
  { src: pwaIconSrc("/icons/icon-128.png"), sizes: "128x128", type: "image/png", purpose: "any" },
  {
    src: pwaIconSrc("/icons/icon-180.png"),
    sizes: "180x180",
    type: "image/png",
    purpose: "any",
  },
  {
    src: pwaIconSrc("/icons/icon-192.png"),
    sizes: "192x192",
    type: "image/png",
    purpose: "any maskable",
  },
  { src: pwaIconSrc("/icons/icon-256.png"), sizes: "256x256", type: "image/png", purpose: "any" },
  { src: pwaIconSrc("/icons/icon-384.png"), sizes: "384x384", type: "image/png", purpose: "any" },
  {
    src: pwaIconSrc("/icons/icon-512.png"),
    sizes: "512x512",
    type: "image/png",
    purpose: "any maskable",
  },
] as const;
