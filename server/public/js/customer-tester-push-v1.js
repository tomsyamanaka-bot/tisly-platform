/**
 * テスター向け実プッシュ購読
 *
 * /customer ログイン後に板橋自宅の
 * 防犯 Web Push を同じ経路へ登録する。
 */

import {
  registerTislyWebPushV1,
  sendTislySecurityTestPushV1,
} from "./tisly-pwa-push-bar-v1.js";

const TESTER_CODE = "TESTER001";
const ITABASHI_HOME_ID = "HOME-JP-ITABASHI-LIVE";

export function isTesterCustomerCode(code) {
  return String(code || "").trim().toUpperCase() === TESTER_CODE;
}

function setPushHint(text, ok) {
  const el = document.getElementById("cv-tester-push-status");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok === true ? "#166534" : ok === false ? "#b91c1c" : "";
}

/**
 * テスターホームへ通知バーを描画する。
 * 既存カード HTML は改変せず末尾へ差し込む。
 */
export function renderTesterPushBarHtml() {
  return `
    <section class="cv-tester-push" aria-label="実機通知">
      <h2 class="cv-section-title">実機の通知</h2>
      <p id="cv-tester-push-status" class="cv-tester-push-status">
        板橋自宅のセンサー発報をこの端末へ届けます
      </p>
      <div class="cv-tester-push-actions">
        <button type="button" class="cv-login-btn" id="cv-tester-push-on">
          通知を有効にする
        </button>
        <button type="button" class="cv-logout-btn" id="cv-tester-push-test">
          テスト通知を送る
        </button>
      </div>
    </section>`;
}

export function bindTesterPushBar(customerCode) {
  if (!isTesterCustomerCode(customerCode)) return;
  const onBtn = document.getElementById("cv-tester-push-on");
  const testBtn = document.getElementById("cv-tester-push-test");
  onBtn?.addEventListener("click", async () => {
    if (onBtn) onBtn.disabled = true;
    try {
      await registerTislyWebPushV1({ userId: "home-security" });
      setPushHint("通知を有効にしました。センサー発報で届きます。", true);
    } catch (err) {
      setPushHint(err?.message || String(err), false);
    } finally {
      if (onBtn) onBtn.disabled = false;
    }
  });
  testBtn?.addEventListener("click", async () => {
    if (testBtn) testBtn.disabled = true;
    try {
      const data = await sendTislySecurityTestPushV1(ITABASHI_HOME_ID);
      const sent = data.push?.sent;
      const attempted = data.push?.attempted;
      setPushHint(
        typeof sent === "number"
          ? `テスト通知を送信しました（${sent}/${attempted ?? sent}）`
          : "テスト通知を送信しました",
        true
      );
    } catch (err) {
      setPushHint(err?.message || String(err), false);
    } finally {
      if (testBtn) testBtn.disabled = false;
    }
  });
}

/**
 * 見積・事業内容・3Dプリンター表記のカードを除外。
 * サーバ側制限の二重ガード。
 */
export function filterTesterHomeCards(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const hide = /見積|事業内容|3Dプリン|プリント|原価|ナレッジ/i;
  const allowed = new Set([
    "home_security",
    "tisly_home",
    "camera",
    "alerts",
    "notifications",
  ]);
  return list.filter((c) => {
    const id = String(c?.id || "");
    const label = String(c?.label || "");
    if (hide.test(label) || hide.test(id)) return false;
    return allowed.has(id);
  });
}
