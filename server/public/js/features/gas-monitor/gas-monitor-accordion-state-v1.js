/**
 * ガス見守り アコーディオン状態保持 v1
 * 3秒ポーリングの再描画が走っても
 * 開いた詳細カードを閉じないための共通処理
 */

const STORAGE_KEY_PREFIX = "tisly_gas_open_accordion_v1:";

function readStoredIds(scopeKey) {
  try {
    const raw = window.sessionStorage.getItem(
      STORAGE_KEY_PREFIX + scopeKey
    );
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string");
  } catch {
    // 保存領域が使えなくても表示は継続
    return [];
  }
}

function writeStoredIds(scopeKey, ids) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY_PREFIX + scopeKey,
      JSON.stringify([...ids])
    );
  } catch {
    // 保存できなくても表示は継続
  }
}

/**
 * 開いている物件IDを Set で保持する
 * scopeKey: operator / customer
 */
export function createAccordionStateV1(scopeKey) {
  // 開いている物件（建物）IDの集合
  const openPropertyIds = new Set(readStoredIds(scopeKey));
  // 初期展開を一度だけ適用するための記録
  const defaultAppliedIds = new Set(openPropertyIds);
  const trackedRoots = new WeakSet();

  function persist() {
    writeStoredIds(scopeKey, openPropertyIds);
  }

  return {
    openPropertyIds,

    /** details の開閉を Set へ反映する */
    track(root) {
      if (!root || trackedRoots.has(root)) return;
      trackedRoots.add(root);
      // toggle はバブリングしないので capture で拾う
      root.addEventListener(
        "toggle",
        (event) => {
          const el = event.target;
          if (!el || el.tagName !== "DETAILS") return;
          const id = el.dataset.accordionId;
          if (!id) return;
          if (el.open) openPropertyIds.add(id);
          else openPropertyIds.delete(id);
          defaultAppliedIds.add(id);
          persist();
        },
        true
      );
    },

    /** 描画時に open 属性を付けるか判定 */
    shouldOpen(id, defaultOpen) {
      if (!id) return Boolean(defaultOpen);
      if (openPropertyIds.has(id)) return true;
      // 一度閉じたカードへ初期展開を再適用しない
      if (defaultAppliedIds.has(id)) return false;
      defaultAppliedIds.add(id);
      if (!defaultOpen) return false;
      openPropertyIds.add(id);
      persist();
      return true;
    },

    /** 再描画後に開閉状態を復元する */
    restore(root) {
      if (!root) return;
      const list = root.querySelectorAll(
        "details[data-accordion-id]"
      );
      list.forEach((el) => {
        const id = el.dataset.accordionId;
        if (!id) return;
        const open = openPropertyIds.has(id);
        if (el.open !== open) el.open = open;
      });
    },
  };
}
