/**
 * /customer ダッシュボードの Web Push 購読。
 * 登録処理は社内バーと同じ registerTislyWebPushV1 を使う。
 */

import {
  readTislyPushPropertyContextV1,
  registerTislyWebPushV1,
  sendTislySecurityTestPushV1,
} from "./tisly-pwa-push-bar-v1.js?v=2545";

export function renderCustomerPushSubscribeHtml() {
  return `
    <section class="cv-card cv-push-card" id="cv-push-card" aria-label="プッシュ通知">
      <h2 class="cv-section-title">プッシュ通知</h2>
      <p id="cv-push-permission" class="cv-push-permission">通知の状態: 未登録</p>
      <p id="cv-push-diag" class="cv-push-diag" role="status">permission: — / standalone: — / appleAPNs: —</p>
      <div class="cv-push-actions">
        <button type="button" class="cv-login-btn" id="cv-push-register">
          🔔 Push通知を登録・購読する
        </button>
        <button type="button" class="cv-logout-btn" id="cv-push-test">
          通知テストを送る
        </button>
      </div>
    </section>`;
}

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(/** @type {{ standalone?: boolean }} */ (navigator).standalone)
  );
}

function permissionWord(perm, subscribed) {
  if (perm === "denied") return "ブロック中";
  if (perm === "granted" && subscribed) return "許可済み";
  return "未登録";
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg?.pushManager) return null;
  return reg.pushManager.getSubscription();
}

export async function refreshCustomerPushSubscribeUi() {
  const perm =
    typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const standalone = isStandalonePwa() ? "yes" : "no";
  let subscribed = false;
  let apple = false;
  try {
    const sub = await currentSubscription();
    subscribed = Boolean(sub?.endpoint);
    apple = Boolean(sub?.endpoint && /apple/i.test(sub.endpoint));
  } catch {
    subscribed = false;
  }
  const word = permissionWord(perm, subscribed);
  const label = document.getElementById("cv-push-permission");
  if (label) {
    label.textContent = `通知の状態: ${word}`;
    label.dataset.state = word;
  }
  const ctx = readTislyPushPropertyContextV1();
  const site = ctx.propertyId || ctx.siteId;
  const diag = document.getElementById("cv-push-diag");
  if (diag) {
    diag.textContent =
      `permission: ${perm} / standalone: ${standalone} / appleAPNs: ${
        apple ? "yes" : "no"
      }` + (site ? ` / site: ${site}` : "");
  }
  return word;
}

function setHint(text) {
  const el = document.getElementById("cv-push-permission");
  if (el && text) el.textContent = text;
}

export function bindCustomerPushSubscribe() {
  const root = document.getElementById("cv-push-card");
  if (!root || root.dataset.bound === "1") {
    void refreshCustomerPushSubscribeUi();
    return;
  }
  root.dataset.bound = "1";

  document.getElementById("cv-push-register")?.addEventListener("click", async () => {
    const btn = document.getElementById("cv-push-register");
    if (btn) btn.disabled = true;
    try {
      await registerTislyWebPushV1({
        userId: "home-security",
        forceResubscribe: true,
      });
      await refreshCustomerPushSubscribeUi();
    } catch (err) {
      await refreshCustomerPushSubscribeUi();
      const word = document.getElementById("cv-push-permission")?.dataset.state;
      if (word !== "ブロック中") {
        setHint(err?.message || String(err));
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById("cv-push-test")?.addEventListener("click", async () => {
    const btn = document.getElementById("cv-push-test");
    if (btn) btn.disabled = true;
    try {
      const data = await sendTislySecurityTestPushV1();
      const sent = data.push?.sent ?? (data.pushSent ? 1 : undefined);
      setHint(
        data.pushSent === false
          ? "通知テスト（Push未送信）"
          : typeof sent === "number"
            ? `通知テストを送りました（${sent}）`
            : "通知テストを送りました"
      );
    } catch (err) {
      setHint(err?.message || String(err));
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  void refreshCustomerPushSubscribeUi();
}
