/** Google Calendar OAuth 設定ガイド・org_internal 向け UI */

export const GOOGLE_OAUTH_ORG_INTERNAL_USER_MESSAGE =
  "Google連携の許可設定が未完了です。Google Cloud Consoleで外部ユーザー許可、またはテストユーザー追加をしてください。";

export const GOOGLE_OAUTH_SETUP_GUIDE_ITEMS = [
  "Google Cloud Console の OAuth consent screen を確認",
  "User Type が Internal なら External に変更",
  "Publishing status が Testing の場合は Test users に toms.yamanaka@gmail.com を追加",
  "Scope に https://www.googleapis.com/auth/calendar が入っていること",
  "Redirect URI は必ず https://tisly.jp/auth/google/callback",
  "旧URI /api/google-calendar/oauth/callback は使わない",
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isGoogleOAuthOrgInternalError(error, errorDescription) {
  const code = String(error ?? "").toLowerCase();
  const desc = String(errorDescription ?? "").toLowerCase();
  return code === "org_internal" || desc.includes("org_internal");
}

export function oauthSetupGuideHtml() {
  const items = GOOGLE_OAUTH_SETUP_GUIDE_ITEMS.map(
    (line) => `<li>${escapeHtml(line)}</li>`
  ).join("");
  return `<ul class="oauth-setup-guide-list">${items}</ul>`;
}

export function mountOAuthSetupGuideCard(containerId = "oauth-setup-guide-card") {
  const card = document.getElementById(containerId);
  if (!card) return;
  const listHost = card.querySelector(".oauth-setup-guide-body");
  if (listHost) listHost.innerHTML = oauthSetupGuideHtml();
}

export function formatOAuthTechnicalError(params) {
  const lines = [
    params.genericError ? `message: ${params.genericError}` : null,
    params.oauthError ? `error: ${params.oauthError}` : null,
    params.oauthErrorDesc ? `error_description: ${params.oauthErrorDesc}` : null,
    params.callback ? `callback: ${params.callback}` : null,
    params.redirectUri ? `redirect_uri: ${params.redirectUri}` : null,
    params.clientId ? `client_id: ${params.clientId}` : null,
    params.accessSaved != null ? `access_token_saved: ${params.accessSaved}` : null,
    params.refreshSaved != null ? `refresh_token_saved: ${params.refreshSaved}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderOAuthErrorBanner({
  panelId = "oauth-error-banner",
  summaryId = "oauth-error-summary",
  detailId = "oauth-error-detail",
  toggleId = "btn-oauth-error-detail",
  userMessage,
  technicalText,
  showGuide = false,
  guideCardId = "oauth-setup-guide-card",
}) {
  const panel = document.getElementById(panelId);
  const summaryEl = document.getElementById(summaryId);
  const detailEl = document.getElementById(detailId);
  const toggleBtn = document.getElementById(toggleId);
  const guideCard = document.getElementById(guideCardId);
  if (!panel || !summaryEl) return;

  if (!userMessage && !technicalText) {
    panel.classList.add("hidden");
    summaryEl.textContent = "";
    if (detailEl) {
      detailEl.textContent = "";
      detailEl.classList.add("hidden");
    }
    if (toggleBtn) toggleBtn.classList.add("hidden");
    if (guideCard && !showGuide) guideCard.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  summaryEl.textContent = userMessage || "Google連携でエラーが発生しました。";
  if (guideCard) guideCard.classList.toggle("hidden", !showGuide);

  if (detailEl && toggleBtn && technicalText) {
    detailEl.textContent = technicalText;
    detailEl.classList.add("hidden");
    toggleBtn.classList.remove("hidden");
    toggleBtn.textContent = "詳細を見る";
    if (!toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = "1";
      toggleBtn.addEventListener("click", () => {
        const open = detailEl.classList.toggle("hidden");
        toggleBtn.textContent = open ? "詳細を見る" : "詳細を閉じる";
      });
    }
  } else if (toggleBtn) {
    toggleBtn.classList.add("hidden");
    if (detailEl) detailEl.classList.add("hidden");
  }
}

export function renderOAuthCallbackFromParams(params, options = {}) {
  const oauthError = params.get("oauth_error");
  const oauthErrorDesc = params.get("oauth_error_description");
  const genericError = params.get("error");
  const orgInternal = isGoogleOAuthOrgInternalError(oauthError, oauthErrorDesc);

  const technicalText = formatOAuthTechnicalError({
    genericError: genericError ? decodeURIComponent(genericError) : null,
    oauthError,
    oauthErrorDesc,
    callback: params.get("oauth_callback"),
    redirectUri: params.get("oauth_redirect_uri"),
    clientId: params.get("oauth_client_id"),
    accessSaved: params.get("oauth_access_token_saved"),
    refreshSaved: params.get("oauth_refresh_token_saved"),
  });

  const userMessage = orgInternal
    ? GOOGLE_OAUTH_ORG_INTERNAL_USER_MESSAGE
    : genericError
      ? decodeURIComponent(genericError)
      : oauthErrorDesc || oauthError || null;

  renderOAuthErrorBanner({
    ...options,
    userMessage,
    technicalText: technicalText || null,
    showGuide: orgInternal || options.forceGuide === true,
  });

  const debugPanel = document.getElementById("oauth-debug-panel");
  const debugLog = document.getElementById("oauth-debug-log");
  if (debugPanel && debugLog && technicalText) {
    debugPanel.classList.remove("hidden");
    debugLog.textContent = technicalText;
  }

  return { orgInternal, userMessage, technicalText };
}

export function formatSyncResultLines(result) {
  return [
    "同期成功",
    `取得 ${result.fetched ?? result.pulled ?? 0}件`,
    `作成 ${result.created ?? 0}件`,
    `更新 ${result.updated ?? 0}件`,
    `失敗 ${result.failed ?? 0}件`,
  ];
}

export function formatConnectionTestLines(data) {
  if (!data.ok) {
    return [`接続失敗`, data.error || "Calendar API に接続できませんでした"];
  }
  const names = data.calendarNames?.length
    ? data.calendarNames.join(" / ")
    : "（カレンダーなし）";
  return [`接続成功`, `取得可能なカレンダー: ${names}`];
}
