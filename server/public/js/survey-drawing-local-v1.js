/** Phase9 — 図面エディタ TEMP ID / localStorage fallback */

export const SURVEY_DRAWING_LOCAL_PREFIX = "tisly:survey-drawing:";

export function drawingLocalStorageKey(projectId, sketchId) {
  return `${SURVEY_DRAWING_LOCAL_PREFIX}${projectId}:${sketchId}`;
}

/**
 * 未保存・一時・仮 ID かどうか
 * （サーバ PATCH / auto-draw 永続化をスキップする）
 */
export function isTempDrawingId(id) {
  if (id == null) return true;
  const s = String(id).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  return (
    s.startsWith("TEMP-") ||
    lower === "tmp" ||
    lower === "temp" ||
    lower === "new" ||
    lower === "undefined" ||
    lower === "null" ||
    lower.startsWith("ephemeral") ||
    lower.startsWith("temp-")
  );
}

export function resolveDrawingIds(raw = {}) {
  const ts = Date.now();
  const hadProject = Boolean(raw.projectId);
  const hadSketch = Boolean(raw.sketchId);
  const hadSite = Boolean(raw.siteId);
  const hadCustomer = Boolean(raw.customerId);

  const projectId = raw.projectId || `TEMP-PROJECT-${ts}`;
  const sketchId = raw.sketchId || `TEMP-SKETCH-${ts}`;
  const siteId = raw.siteId || "TEMP-SITE";
  const customerId = raw.customerId || "TEMP-CUSTOMER";

  const isTempMode = !hadProject || !hadSketch || isTempDrawingId(projectId) || isTempDrawingId(sketchId);

  return {
    projectId,
    sketchId,
    siteId,
    customerId,
    isTempMode,
    isLocalOnly: isTempMode && (!hadProject || !hadSketch),
  };
}

export function buildLocalDrawingPayload({
  projectId,
  sketchId,
  siteId,
  customerId,
  layers,
  photoRefs = [],
}) {
  return {
    projectId,
    sketchId,
    siteId,
    customerId,
    lines: layers?.paths ?? [],
    symbols: layers?.symbols ?? [],
    memos: layers?.notes ?? [],
    photoRefs,
    layers,
    updatedAt: new Date().toISOString(),
  };
}

export function saveDrawingToLocalStorage(projectId, sketchId, payload) {
  const key = drawingLocalStorageKey(projectId, sketchId);
  localStorage.setItem(key, JSON.stringify(payload));
  return key;
}

export function loadDrawingFromLocalStorage(projectId, sketchId) {
  try {
    const raw = localStorage.getItem(drawingLocalStorageKey(projectId, sketchId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
