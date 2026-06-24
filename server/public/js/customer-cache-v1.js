// @tisly-customer-js-version customer-v1-phase25
/** お客様ポータル キャッシュ検出・強制更新 — shared/customer/customer-cache-v1.ts と同期 */

export const CUSTOMER_JS_VERSION = "customer-v1-phase25";
export const CUSTOMER_SW_TOKEN = "v2405-phase25";

const BANNER_ID = "cv-update-banner";

export async function detectStaleCustomerAssets() {
  try {
    const [cacheJs, swText] = await Promise.all([
      fetch(`/js/customer-cache-v1.js?v=${CUSTOMER_JS_VERSION}`, { cache: "no-store" }).then((r) =>
        r.text()
      ),
      fetch("/service-worker.js", { cache: "no-store" }).then((r) => r.text()),
    ]);
    const jsOk = cacheJs.includes(CUSTOMER_JS_VERSION);
    const swOk = swText.includes(CUSTOMER_SW_TOKEN);
    return { stale: !jsOk || !swOk, jsOk, swOk };
  } catch {
    return { stale: false, jsOk: true, swOk: true };
  }
}

function ensureBannerStyles() {
  if (document.getElementById("cv-update-banner-style")) return;
  const style = document.createElement("style");
  style.id = "cv-update-banner-style";
  style.textContent = `
    .cv-update-banner {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center; gap: 0.75rem;
      padding: 0.75rem 1rem;
      padding-top: max(0.75rem, env(safe-area-inset-top, 0px));
      background: linear-gradient(135deg, #0369a1, #0284c7);
      color: #fff; box-shadow: 0 4px 16px rgba(3, 105, 161, 0.35);
    }
    .cv-update-banner p { margin: 0; font-size: 0.95rem; font-weight: 700; }
    .cv-update-banner button {
      border: 2px solid #fff; background: #fff; color: #0369a1;
      border-radius: 999px; padding: 0.45rem 1.1rem;
      font-size: 0.95rem; font-weight: 800; cursor: pointer;
    }
    body.cv-has-update-banner { padding-top: calc(3.25rem + env(safe-area-inset-top, 0px)); }
    body.cv-has-update-banner header { margin-top: calc(3.25rem + env(safe-area-inset-top, 0px)); }
  `;
  document.head.appendChild(style);
}

export function showCustomerUpdateBanner(onUpdate) {
  if (document.getElementById(BANNER_ID)) return;
  ensureBannerStyles();
  document.body.classList.add("cv-has-update-banner");
  const bar = document.createElement("div");
  bar.id = BANNER_ID;
  bar.className = "cv-update-banner";
  bar.setAttribute("role", "alert");
  bar.innerHTML = `
    <p>新しい画面があります</p>
    <button type="button" id="cv-update-btn">更新してください</button>
  `;
  document.body.prepend(bar);
  document.getElementById("cv-update-btn")?.addEventListener("click", () => onUpdate());
}

export async function performCustomerCacheRefresh() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg) {
    try {
      await reg.update();
    } catch {
      /* ignore */
    }
    await reg.unregister().catch(() => {});
  }
  try {
    localStorage.setItem("tisly_customer_js_version_v1", CUSTOMER_JS_VERSION);
  } catch {
    /* ignore */
  }
  location.reload();
}

export async function initCustomerCacheGuard() {
  const { stale } = await detectStaleCustomerAssets();
  if (!stale) return;
  showCustomerUpdateBanner(() => {
    performCustomerCacheRefresh();
  });
}
