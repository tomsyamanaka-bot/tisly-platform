/**
 * Guard Viewer 直接起動
 * インストール済み端末はスキーム直結
 * ストアへ割り込むタイマーは使わない
 */

export const GUARD_VIEWER_SCHEME_V1 = "guardviewer://";
export const GUARD_VIEWER_APP_STORE_V1 =
  "https://apps.apple.com/jp/app/guard-viewer/id1026746566";
export const GUARD_VIEWER_PLAY_STORE_V1 =
  "https://play.google.com/store/apps/details?id=com.mcu.uview";
export const GUARD_VIEWER_EZCLOUD_V1 = "https://en.ezcloud.uniview.com/";
export const GUARD_VIEWER_HINT_V1 = "📲 Guard Viewerアプリで確認";
export const GUARD_VIEWER_STORE_HELP_V1 =
  "📲 アプリが起動しない場合はこちら（App Store / Google Play）";

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
 * スキームを直結キックする
 * ストア遷移のタイマーは挟まない
 */
function launchGuardViewerSchemeV1() {
  window.location.href = GUARD_VIEWER_SCHEME_V1;
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

/** アプリ直接起動。PC のみ EZCloud */
export function openGuardViewerAppV1() {
  const platform = currentPlatformV1();
  if (platform === "desktop") {
    openEzcloudTabV1();
    showDesktopGuideModalV1();
    return { platform, opened: "ezcloud" };
  }
  launchGuardViewerSchemeV1();
  return { platform, opened: "scheme" };
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

/** クリック委譲。iOS は a の href を優先する */
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
    const href = String(btn.getAttribute("href") || "");
    const platform = currentPlatformV1();
    /* Safari は a[href=guardviewer://] をそのまま使う */
    if (platform === "ios" && href.startsWith("guardviewer:")) {
      return;
    }
    e.preventDefault();
    openGuardViewerAppV1();
  });
}
