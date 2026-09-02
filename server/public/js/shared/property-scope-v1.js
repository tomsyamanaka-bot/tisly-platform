/**
 * 物件スコープ共通ステート v1
 *
 * 社内は全件切替、顧客は1件固定。
 * selectedPropertyId を全カードへ配信する。
 */

const STORAGE_KEY = "tisly_selected_property_scope_v1";
const EVENT_NAME = "tisly-property-scope-change";

/** @type {{
 *  selectedSiteId: string,
 *  selectedPropertyId: string,
 *  displayName: string,
 *  locked: boolean,
 *  source: string
 * }} */
const scope = {
  selectedSiteId: "",
  selectedPropertyId: "",
  displayName: "",
  locked: false,
  source: "",
};

function readStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStored() {
  if (scope.locked) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedSiteId: scope.selectedSiteId,
        selectedPropertyId: scope.selectedPropertyId,
        displayName: scope.displayName,
      })
    );
  } catch {
    /* ignore */
  }
}

function publishGlobals() {
  window.__TISLY_SF_SITE_ID = scope.selectedSiteId;
  window.__TISLY_SELECTED_PROPERTY_ID = scope.selectedPropertyId;
  window.__TISLY_SELECTED_SITE_ID = scope.selectedSiteId;
  window.__TISLY_PROPERTY_SCOPE_LOCKED = scope.locked;
}

/**
 * 現在の物件スコープを返す
 * @returns {typeof scope}
 */
export function getPropertyScope() {
  return { ...scope };
}

/** @returns {string} */
export function getSelectedPropertyId() {
  return scope.selectedPropertyId || "";
}

/** @returns {string} */
export function getSelectedSiteId() {
  return scope.selectedSiteId || "";
}

/**
 * 物件スコープを更新し全モジュールへ通知
 * @param {{
 *  siteId?: string,
 *  propertyId?: string|null,
 *  displayName?: string,
 *  locked?: boolean,
 *  source?: string,
 *  persist?: boolean
 * }} next
 */
export function setPropertyScope(next = {}) {
  const siteId = String(next.siteId ?? scope.selectedSiteId ?? "").trim();
  const propertyId = String(
    next.propertyId ?? scope.selectedPropertyId ?? siteId
  ).trim();
  const displayName = String(
    next.displayName ?? scope.displayName ?? ""
  ).trim();
  const locked = next.locked === true;
  const source = String(next.source ?? "manual");

  if (scope.locked && !locked && source !== "tenant-unlock") {
    return getPropertyScope();
  }

  const changed =
    siteId !== scope.selectedSiteId ||
    propertyId !== scope.selectedPropertyId ||
    displayName !== scope.displayName ||
    locked !== scope.locked;

  scope.selectedSiteId = siteId;
  scope.selectedPropertyId = propertyId;
  scope.displayName = displayName;
  scope.locked = locked;
  scope.source = source;

  publishGlobals();
  if (next.persist !== false && !locked) writeStored();

  if (changed) {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: getPropertyScope(),
      })
    );
  }
  return getPropertyScope();
}

/**
 * 社内向け：保存済み選択を復元
 * @param {string[]} allowedSiteIds
 * @param {string} fallbackSiteId
 */
export function restoreOperatorPropertyScope(
  allowedSiteIds,
  fallbackSiteId
) {
  const allow = new Set(allowedSiteIds || []);
  const stored = readStored();
  if (stored?.selectedSiteId && allow.has(stored.selectedSiteId)) {
    return setPropertyScope({
      siteId: stored.selectedSiteId,
      propertyId: stored.selectedPropertyId || stored.selectedSiteId,
      displayName: stored.displayName || "",
      locked: false,
      source: "restore",
      persist: false,
    });
  }
  return setPropertyScope({
    siteId: fallbackSiteId,
    propertyId: fallbackSiteId,
    displayName: "",
    locked: false,
    source: "default",
    persist: false,
  });
}

/**
 * スコープ変更を購読
 * @param {(detail: ReturnType<typeof getPropertyScope>) => void} handler
 */
export function onPropertyScopeChange(handler) {
  const fn = (e) => handler(e.detail || getPropertyScope());
  window.addEventListener(EVENT_NAME, fn);
  return () => window.removeEventListener(EVENT_NAME, fn);
}

export { EVENT_NAME as PROPERTY_SCOPE_EVENT_V1 };
