import {
  bindCustomerNavLinks,
  escapeHtml,
  renderHomeCards,
  renderHomeStatus,
  renderNotifications,
} from "./customer-shared-v1.js";
import { navigateCustomer, setCustomerReturnUrl } from "./customer-nav-v1.js";
import { initCustomerCacheGuard } from "./customer-cache-v1.js";
import {
  clearCustomerSession,
  fetchSessionHome,
  getCustomerCode,
  isLoggedIn,
  loginCustomer,
} from "./customer-tenant-session-v1.js";
import {
  openCustomerCameraPreview,
  isCameraNavHref,
} from "./camera-webrtc-viewer-v1.js";

const main = document.getElementById("main-content");

initCustomerCacheGuard().catch(() => {});

function renderLogin(errorMsg = "") {
  const params = new URLSearchParams(location.search);
  const needLogin = params.get("login") === "required";
  document.getElementById("page-title").textContent = "TiSLY お客様ページ";
  document.getElementById("page-subtitle").textContent = needLogin
    ? "ログインしてください"
    : "顧客コードでログイン";

  main.innerHTML = `
    <section class="cv-login-card">
      <form id="cv-login-form" class="cv-login-form" autocomplete="on">
        ${
          needLogin
            ? '<p class="cv-login-hint">ログインが必要です</p>'
            : ""
        }
        ${
          errorMsg
            ? `<p class="cv-login-error" role="alert">${escapeHtml(errorMsg)}</p>`
            : ""
        }
        <label class="cv-login-field">
          <span>顧客コード</span>
          <input
            name="customerCode"
            autocomplete="organization"
            inputmode="text"
            required
            placeholder="例: TOMS001"
          />
        </label>
        <label class="cv-login-field">
          <span>ユーザー名</span>
          <input
            name="username"
            autocomplete="username"
            required
            placeholder="例: toms001.owner"
          />
        </label>
        <label class="cv-login-field">
          <span>パスワード</span>
          <input
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>
        <button type="submit" class="cv-login-btn">ログイン</button>
      </form>
    </section>`;

  const form = document.getElementById("cv-login-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector(".cv-login-btn");
    if (btn) btn.disabled = true;
    try {
      await loginCustomer({
        customerCode: String(fd.get("customerCode") || ""),
        username: String(fd.get("username") || ""),
        password: String(fd.get("password") || ""),
      });
      const returnUrl = params.get("return");
      if (returnUrl && returnUrl.startsWith("/customer")) {
        location.replace(returnUrl);
        return;
      }
      location.replace("/customer");
    } catch (err) {
      renderLogin(err?.message || "ログインに失敗しました");
    }
  });
}

function renderHome(data) {
  document.getElementById("page-title").textContent = data.title;
  document.getElementById("page-subtitle").textContent =
    getCustomerCode() || "";

  main.innerHTML = `
    ${renderHomeStatus(data)}
    ${renderNotifications(data.notifications)}
    ${renderHomeCards(data.cards)}
    <p class="cv-logout-row">
      <button type="button" id="cv-logout-btn" class="cv-logout-btn">ログアウト</button>
    </p>
  `;

  bindCustomerNavLinks();
  document.querySelectorAll(".cv-big-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      const href = el.getAttribute("href") || "";
      if (isCameraNavHref(href)) {
        e.preventDefault();
        openCustomerCameraPreview().catch((err) => {
          navigateCustomer(href);
        });
        return;
      }
      e.preventDefault();
      navigateCustomer(href);
    });
  });
  document.getElementById("cv-logout-btn")?.addEventListener("click", () => {
    clearCustomerSession();
    location.replace("/customer?login=required");
  });
}

async function loadLandingWithoutAuth() {
  const params = new URLSearchParams(location.search);
  const projectShare = params.get("project");
  if (projectShare) {
    const res = await fetch(
      `/api/customer-portal/v1/home-by-share/${encodeURIComponent(projectShare)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.home) {
      renderHome(data.home);
      return;
    }
  }

  const res = await fetch("/api/customer-portal/v1/landing", {
    cache: "no-store",
  });
  const landing = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
    return;
  }
  renderHome(landing.home);
}

async function load() {
  if (!isLoggedIn()) {
    renderLogin();
    return;
  }

  try {
    const session = await fetchSessionHome();
    if (session?.home) {
      renderHome(session.home);
      return;
    }
  } catch {
    clearCustomerSession();
    renderLogin("セッションが無効です。再度ログインしてください。");
    return;
  }

  await loadLandingWithoutAuth();
}

setCustomerReturnUrl("/customer");
load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});
