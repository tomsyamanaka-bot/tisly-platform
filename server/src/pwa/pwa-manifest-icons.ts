/** Phase 2001 — 全 PWA 共通 manifest icons + キャッシュバスト */
export const PWA_ICON_VERSION = "2001";

export function pwaIconSrc(path: string): string {
  return path.includes("?v=") ? path : `${path}?v=${PWA_ICON_VERSION}`;
}

export const PWA_APPLE_TOUCH_ICON = pwaIconSrc("/icons/icon-192.png");

export const PWA_MANIFEST_ICONS = [
  { src: pwaIconSrc("/icons/icon-64.png"), sizes: "64x64", type: "image/png", purpose: "any" },
  { src: pwaIconSrc("/icons/icon-128.png"), sizes: "128x128", type: "image/png", purpose: "any" },
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
