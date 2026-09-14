/**
 * Guard Viewer 安全起動
 * iOS は iframe、Android は intent
 * カスタムスキームを location に書かない
 */

export const GUARD_VIEWER_SCHEME_V1 = "guardviewer://";
export const GUARD_VIEWER_APP_STORE_V1 =
  "https://apps.apple.com/jp/app/guard-viewer/id1112445831";
export const GUARD_VIEWER_PLAY_STORE_V1 =
  "https://play.google.com/store/apps/details?id=com.mcu.uview";
export const GUARD_VIEWER_EZCLOUD_V1 = "https://en.ezcloud.uniview.com/";
export const GUARD_VIEWER_HINT_V1 = "📲 Guard Viewerアプリで確認";
export const GUARD_VIEWER_STORE_HELP_V1 =
  "📲 アプリが起動しない場合はこちら（App Store / Google Play）";
/* iframe は 1 秒後に必ず破棄する */
export const GUARD_VIEWER_FALLBACK_MS_V1 = 1000;
export const GUARD_VIEWER_FALLBACK_MAX_MS_V1 = 2000;

export function buildAndroidIntentUrlV1() {
  const fallback = encodeURIComponent(GUARD_VIEWER_PLAY_STORE_V1);
  return `intent://#Intent;scheme=guardviewer;package=com.mcu.uview;S.browser_fallback_url=${fallback};end`;
}

export const GUARD_VIEWER_INTENT_V1 = buildAndroidIntentUrlV1();

/**
 * UA から iOS / Android / PC を判定する
 */
export function detectGuardViewerPlatformV1(
  userAgent,
  maxTouchPoints
) {
  const ua = String(userAgent || "");
  const touch = Number(maxTouchPoints || 0);
  const ios =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && touch > 1);
  if (ios) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function storeUrlForGuardViewerV1(platform) {
  if (platform === "ios") return GUARD_VIEWER_APP_STORE_V1;
  if (platform === "android") return GUARD_VIEWER_PLAY_STORE_V1;
  return GUARD_VIEWER_EZCLOUD_V1;
}

function currentPlatformV1() {
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent : "";
  const touch =
    typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0;
  return detectGuardViewerPlatformV1(ua, touch);
}

function openHttpsUrlV1(url) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = url;
  }
}

function openEzcloudTabV1() {
  openHttpsUrlV1(GUARD_VIEWER_EZCLOUD_V1);
}

/**
 * PC 向け案内モーダル
 * 別タブが塞がれても操作できる
 */
function showDesktopGuideModalV1() {
  if (typeof document === "undefined") return;
  document.getElementById("gv-guide-modal")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "gv-guide-modal";
  wrap.className = "gv-modal";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Guard Viewer 案内");
  wrap.innerHTML = `
    <div class="gv-modal-card">
      <p class="gv-modal-title">📷 防犯カメラ</p>
      <p class="gv-modal-body">
        パソコンでは EZCloud を別タブで開きます。
        スマートフォンでは Guard Viewer アプリで
        高画質のライブ映像を確認できます。
      </p>
      <div class="gv-modal-actions">
        <button type="button" class="gv-modal-btn" data-gv-ezcloud>
          EZCloud を開く
        </button>
        <button type="button" class="gv-modal-btn gv-modal-btn-ghost" data-gv-close>
          閉じる
        </button>
      </div>
    </div>`;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-gv-close]")) {
      wrap.remove();
    }
    if (e.target.closest("[data-gv-ezcloud]")) {
      openEzcloudTabV1();
    }
  });
  document.body.appendChild(wrap);
}

/**
 * iOS は非表示 iframe でキックする
 * location.href だと無効アドレス警告が出る
 */
function launchIosViaHiddenIframeV1() {
  if (typeof document === "undefined") return;
  document.getElementById("gv-scheme-iframe")?.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "gv-scheme-iframe";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.cssText = "display:none;width:0;height:0;border:0;";
  iframe.src = GUARD_VIEWER_SCHEME_V1;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    iframe.remove();
  }, GUARD_VIEWER_FALLBACK_MS_V1);
}

/**
 * Android は intent で起動する
 * 未導入時は Play Store へ戻す
 */
function launchAndroidIntentV1() {
  window.location.href = GUARD_VIEWER_INTENT_V1;
}

export function openStoreForCurrentPlatformV1() {
  const platform = currentPlatformV1();
  if (platform === "desktop") {
    openEzcloudTabV1();
    openHttpsUrlV1(GUARD_VIEWER_APP_STORE_V1);
    return;
  }
  openHttpsUrlV1(storeUrlForGuardViewerV1(platform));
}

/** アプリ起動。未導入時はストア案内リンクを使う */
export function openGuardViewerAppV1() {
  const platform = currentPlatformV1();
  if (platform === "desktop") {
    openEzcloudTabV1();
    showDesktopGuideModalV1();
    return { platform, opened: "ezcloud" };
  }
  if (platform === "android") {
    launchAndroidIntentV1();
    return { platform, opened: "intent" };
  }
  launchIosViaHiddenIframeV1();
  return { platform, opened: "iframe" };
}

export function renderGuardViewerCtaInnerHtmlV1(label) {
  const text = label || "防犯カメラを見る";
  return `${text}<span class="gv-cta-hint">${GUARD_VIEWER_HINT_V1}</span>`;
}

export function renderGuardViewerStoreHelpHtmlV1() {
  return `<p class="gv-store-help">
    <a
      href="${GUARD_VIEWER_APP_STORE_V1}"
      target="_blank"
      rel="noopener noreferrer"
      data-gv-store
    >${GUARD_VIEWER_STORE_HELP_V1}</a>
  </p>`;
}

/** クリック委譲。二重バインドしない */
export function bindGuardViewerLaunchersV1() {
  if (typeof window === "undefined") return;
  if (window.__TISLY_GV_LAUNCH_BOUND) return;
  window.__TISLY_GV_LAUNCH_BOUND = true;
  document.addEventListener("click", (e) => {
    const storeLink = e.target.closest?.("[data-gv-store]");
    if (storeLink) {
      e.preventDefault();
      e.stopPropagation();
      openStoreForCurrentPlatformV1();
      return;
    }
    const btn = e.target.closest?.("[data-gv-launch]");
    if (!btn) return;
    e.preventDefault();
    openGuardViewerAppV1();
  });
}
