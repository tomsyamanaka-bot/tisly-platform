/** Phase17 — Service Worker / Cache 強制更新（iPhone Safari 復旧用） */

export async function refreshTislyPwaCache() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg) {
    await reg.unregister();
  }
  location.reload();
}
