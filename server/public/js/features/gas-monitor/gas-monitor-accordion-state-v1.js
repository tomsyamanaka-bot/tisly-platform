/**
 * ガス見守り アコーディオン状態保持 v1
 * details 依存をやめてクラス（is-expanded）と
 * インラインスタイル（display）で開閉を管理する
 * ユーザーのタップ以外では絶対に閉じない
 */

const STORAGE_KEY_PREFIX = "tisly_gas_open_accordion_v1:";
const EXPANDED_CLASS = "is-expanded";
const CARD_SELECTOR = "[data-accordion-id]";
const TOGGLE_SELECTOR = "[data-accordion-toggle]";

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

/** 開いた時に戻す display 値（既定 block） */
function openDisplayOf(body) {
  return body.dataset.accordionDisplay || "block";
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

  /** カード1枚へ開閉状態を反映（DOMは作り直さない） */
  function applyCard(card) {
    if (!card) return;
    const id = card.dataset.accordionId;
    const open = Boolean(id) && openPropertyIds.has(id);
    if (card.classList.contains(EXPANDED_CLASS) !== open) {
      card.classList.toggle(EXPANDED_CLASS, open);
    }
    const body = card.querySelector("[data-accordion-body]");
    if (body) {
      const next = open ? openDisplayOf(body) : "none";
      if (body.style.display !== next) body.style.display = next;
    }
    const toggle = card.querySelector(TOGGLE_SELECTOR);
    if (toggle) {
      const expanded = open ? "true" : "false";
      if (toggle.getAttribute("aria-expanded") !== expanded) {
        toggle.setAttribute("aria-expanded", expanded);
      }
    }
  }

  function toggleCard(card) {
    const id = card?.dataset.accordionId;
    if (!id) return;
    if (openPropertyIds.has(id)) openPropertyIds.delete(id);
    else openPropertyIds.add(id);
    // 手動操作後は初期展開を再適用しない
    defaultAppliedIds.add(id);
    persist();
    applyCard(card);
  }

  return {
    openPropertyIds,

    /** ユーザー操作（タップ／キー）だけで開閉する */
    track(root) {
      if (!root || trackedRoots.has(root)) return;
      trackedRoots.add(root);
      root.addEventListener("click", (event) => {
        const toggle = event.target?.closest?.(TOGGLE_SELECTOR);
        if (!toggle || !root.contains(toggle)) return;
        event.preventDefault();
        toggleCard(toggle.closest(CARD_SELECTOR));
      });
      root.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const toggle = event.target?.closest?.(TOGGLE_SELECTOR);
        if (!toggle || !root.contains(toggle)) return;
        event.preventDefault();
        toggleCard(toggle.closest(CARD_SELECTOR));
      });
    },

    /** 初回生成時に開くか判定 */
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

    applyCard,

    /** カード追加・並び替え後の状態確認用 */
    restore(root) {
      if (!root) return;
      root.querySelectorAll(CARD_SELECTOR).forEach(applyCard);
    },
  };
}
