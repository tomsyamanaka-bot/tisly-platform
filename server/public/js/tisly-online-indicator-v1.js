/**
 * TiSLY 接続状態インジケータ v1
 * 📡 オンライン / ⚠️ オフライン作業中
 * 実務ナビ上部に追記表示
 */

import {
  bindOfflineSyncAutoFlushV1,
  getOfflineQueueCountV1,
  isOnlineV1,
} from "./tisly-offline-core-v1.js";

export const ONLINE_INDICATOR_VERSION = "online-indicator-v1";

const INDICATOR_ID = "tisly-conn-indicator";
const STYLE_ID = "tisly-online-indicator-css";

function ensureCss() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "/css/tisly-online-indicator-v1.css";
  document.head.appendChild(link);
}

function labelFor(online, pending) {
  if (!online) {
    return pending > 0
      ? `⚠️ オフライン作業中 · 未同期 ${pending} 件`
      : "⚠️ オフライン作業中";
  }
  if (pending > 0) {
    return `📡 オンライン · 同期中… 残り ${pending} 件`;
  }
  return "📡 オンライン";
}

/**
 * 接続インジケータを DOM へ追記（既存要素は再利用）
 * @param {{ mountAfter?: HTMLElement|null }} opts
 */
export function mountOnlineIndicatorV1(opts = {}) {
  ensureCss();
  let el = document.getElementById(INDICATOR_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = INDICATOR_ID;
    el.className = "tisly-conn-indicator";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    const after = opts.mountAfter || document.getElementById("tisly-practical-topbar-root");
    if (after?.parentNode) {
      after.insertAdjacentElement("afterend", el);
    } else {
      document.body.prepend(el);
    }
  }

  document.body.classList.add("has-tisly-conn-indicator");

  async function refresh() {
    const online = isOnlineV1();
    const pending = await getOfflineQueueCountV1();
    el.classList.toggle("is-online", online);
    el.classList.toggle("is-offline", !online);
    el.classList.toggle("has-pending", pending > 0);
    el.textContent = labelFor(online, pending);
    el.title = online
      ? "サーバーと接続中"
      : "電波なし — 入力は端末に保存され、復帰後に同期します";
  }

  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
  window.addEventListener("tisly-offline-queue-changed", refresh);

  const unbind = bindOfflineSyncAutoFlushV1({
    onFlushed: () => {
      refresh();
    },
    onStatus: () => refresh(),
  });

  void refresh();

  return {
    refresh,
    destroy() {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tisly-offline-queue-changed", refresh);
      unbind?.();
    },
  };
}

/** シェル用テキスト更新（既存 topbar 互換） */
export async function updateShellOnlineTextV1() {
  const text = document.getElementById("tisly-online-text");
  const sync = document.getElementById("tisly-sync-status");
  const online = isOnlineV1();
  const pending = await getOfflineQueueCountV1();
  if (text) {
    text.textContent = online ? "📡 オンライン" : "⚠️ オフライン作業中";
  }
  if (sync) {
    sync.textContent = pending
      ? `同期: 未送信 ${pending} 件`
      : online
        ? "同期: 待機"
        : "同期: オフライン";
  }
}
