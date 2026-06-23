/** Phase9 — 現場チェックリスト デフォルト項目 / localStorage */

export const FIELD_CHECKLIST_LOCAL_PREFIX = "tisly:field-checklist:";
export const TEMP_FIELD_PROJECT_ID = "TEMP-SITE";

export const DEFAULT_FIELD_CHECKLIST_ITEMS = [
  { category: "持ち物", label: "工具一式" },
  { category: "持ち物", label: "脚立" },
  { category: "持ち物", label: "テスター" },
  { category: "持ち物", label: "LANテスター" },
  { category: "持ち物", label: "ビス/アンカー" },
  { category: "持ち物", label: "絶縁テープ" },
  { category: "持ち物", label: "圧着工具" },
  { category: "持ち物", label: "予備ケーブル" },
  { category: "持ち物", label: "PPE/保護具" },
  { category: "現場確認", label: "駐車場所" },
  { category: "現場確認", label: "電源位置" },
  { category: "現場確認", label: "分電盤位置" },
  { category: "現場確認", label: "既設配線" },
  { category: "現場確認", label: "貫通位置" },
  { category: "現場確認", label: "施工範囲" },
  { category: "現場確認", label: "写真撮影" },
  { category: "現場確認", label: "お客様確認" },
  { category: "現場確認", label: "清掃" },
];

export function fieldChecklistStorageKey(projectId) {
  return `${FIELD_CHECKLIST_LOCAL_PREFIX}${projectId || TEMP_FIELD_PROJECT_ID}`;
}

function itemId(category, label) {
  return `def-${category}-${label}`.replace(/\s+/g, "-");
}

export function buildDefaultChecklistItems(saved = []) {
  const savedMap = new Map((saved || []).map((it) => [it.id || itemId(it.category, it.label), it]));
  return DEFAULT_FIELD_CHECKLIST_ITEMS.map((def) => {
    const id = itemId(def.category, def.label);
    const prev = savedMap.get(id);
    return {
      id,
      category: def.category,
      label: def.label,
      checked: Boolean(prev?.checked),
      memo: prev?.memo || "",
      photoUrl: prev?.photoUrl || null,
    };
  });
}

export function loadFieldChecklistLocal(projectId) {
  try {
    const raw = localStorage.getItem(fieldChecklistStorageKey(projectId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return buildDefaultChecklistItems(data.items);
  } catch {
    return null;
  }
}

export function saveFieldChecklistLocal(projectId, items) {
  const payload = {
    projectId: projectId || TEMP_FIELD_PROJECT_ID,
    items: items.map((it) => ({
      id: it.id,
      category: it.category,
      label: it.label,
      checked: Boolean(it.checked),
      memo: it.memo || "",
    })),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(fieldChecklistStorageKey(projectId), JSON.stringify(payload));
  return payload;
}

export function checklistStatusFromItems(items) {
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  return {
    total,
    checked,
    unchecked: Math.max(0, total - checked),
    forced: 0,
  };
}
