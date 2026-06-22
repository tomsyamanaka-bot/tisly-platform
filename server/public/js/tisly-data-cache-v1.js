/** localStorage cache for PWA API fallbacks — schedule / estimate / projects / field */

const CACHE_PREFIX = "tisly_api_cache_v1:";

function storageKey(ns, key) {
  return `${CACHE_PREFIX}${ns}:${key}`;
}

export function cacheSet(ns, key, data) {
  try {
    const payload = { savedAt: new Date().toISOString(), data };
    localStorage.setItem(storageKey(ns, key), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function cacheGet(ns, key, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(storageKey(ns, key));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.data) return null;
    if (maxAgeMs > 0 && payload.savedAt) {
      const age = Date.now() - new Date(payload.savedAt).getTime();
      if (age > maxAgeMs) return null;
    }
    return payload.data;
  } catch {
    return null;
  }
}

export function cacheMeta(ns, key) {
  try {
    const raw = localStorage.getItem(storageKey(ns, key));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.savedAt ? { savedAt: payload.savedAt } : null;
  } catch {
    return null;
  }
}

export function cacheRemove(ns, key) {
  try {
    localStorage.removeItem(storageKey(ns, key));
  } catch {
    /* ignore */
  }
}
