/**
 * Guard Viewer ワンタップ起動
 * スマホはアプリ、未導入はストア
 * PC は EZCloud を案内する
 * 内部カメラ API は呼ばない
 */

export const GUARD_VIEWER_SCHEME_V1 = "guardviewer://";
export const GUARD_VIEWER_APP_STORE_V1 =
  "https://apps.apple.com/jp/app/guard-viewer/id1112445831";
export const GUARD_VIEWER_PLAY_STORE_V1 =
  "https://play.google.com/store/apps/details?id=com.mcu.uview";
export const GUARD_VIEWER_EZCLOUD_V1 = "https://en.ezcloud.uniview.com/";
export const GUARD_VIEWER_HINT_V1 = "📲 Guard Viewerアプリで確認";
/* 未導入判定は 1.5 秒でストアへ戻す */
export const GUARD_VIEWER_FALLBACK_MS_V1 = 1500;
export const GUARD_VIEWER_FALLBACK_MAX_MS_V1 = 2000;

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

function openEzcloudTabV1() {
  try {
    window.open(
      GUARD_VIEWER_EZCLOUD_V1,
      "_blank",
      "noopener,noreferrer"
    );
  } catch {
    window.location.href = GUARD_VIEWER_EZCLOUD_V1;
  }
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
 * スキーム起動。遷移しなければストアへ
 * API フェッチは一切行わない
 */
function launchMobileSchemeV1(platform) {
  const start = Date.now();
  window.location.href = GUARD_VIEWER_SCHEME_V1;
  window.setTimeout(() => {
    /* 1.5秒以内に画面遷移しなければストア */
    if (Date.now() - start >= GUARD_VIEWER_FALLBACK_MAX_MS_V1) {
      return;
    }
    const storeUrl = storeUrlForGuardViewerV1(platform);
    try {
      window.open(storeUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = storeUrl;
    }
  }, GUARD_VIEWER_FALLBACK_MS_V1);
}

/** アプリ起動。未導入時はストアへ案内する */
export function openGuardViewerAppV1() {
  const platform = currentPlatformV1();
  if (platform === "desktop") {
    openEzcloudTabV1();
    showDesktopGuideModalV1();
    return { platform, opened: "ezcloud" };
  }
  launchMobileSchemeV1(platform);
  return { platform, opened: "scheme" };
}

export function renderGuardViewerCtaInnerHtmlV1(label) {
  const text = label || "防犯カメラを見る";
  return `${text}<span class="gv-cta-hint">${GUARD_VIEWER_HINT_V1}</span>`;
}

/** クリック委譲。二重バインドしない */
export function bindGuardViewerLaunchersV1() {
  if (typeof window === "undefined") return;
  if (window.__TISLY_GV_LAUNCH_BOUND) return;
  window.__TISLY_GV_LAUNCH_BOUND = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-gv-launch]");
    if (!btn) return;
    e.preventDefault();
    openGuardViewerAppV1();
  });
}
