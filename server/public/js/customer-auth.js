/** Shared customer session helpers — Phase 2081–2120 */

import { DEFAULT_FETCH_TIMEOUT_MS, fetchJson } from "./tisly-fetch-v1.js";

const ADMIN_TOKEN_KEY = "tisly_admin_token";
const SESSION_TOKEN_KEY = "tisly_token";
const CUSTOMER_CODE_KEY = "tisly_customer_code";
const CUSTOMER_ENTRY = "/customer";

export function customerCodeFromPath() {
  const stored =
    sessionStorage.getItem(CUSTOMER_CODE_KEY) ||
    localStorage.getItem(CUSTOMER_CODE_KEY);
  if (stored) return stored.toUpperCase();
  const m = location.pathname.match(/\/customer\/([^/]+)/i);
  return m ? m[1].toUpperCase() : "";
}

export function getCustomerToken() {
  return (
    localStorage.getItem(ADMIN_TOKEN_KEY) ||
    sessionStorage.getItem(SESSION_TOKEN_KEY) ||
    ""
  );
}

export function setCustomerToken(token, customerCode) {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    if (customerCode) {
      const code = customerCode.toUpperCase();
      sessionStorage.setItem(CUSTOMER_CODE_KEY, code);
      localStorage.setItem(CUSTOMER_CODE_KEY, code);
    }
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

export function clearCustomerToken() {
  setCustomerToken("");
  sessionStorage.removeItem(CUSTOMER_CODE_KEY);
  localStorage.removeItem(CUSTOMER_CODE_KEY);
}

export async function fetchCustomerSession() {
  const token = getCustomerToken();
  if (!token) return null;
  try {
    return await fetchJson(
      "/api/pwa/hub",
      {
        headers: { Authorization: `Bearer ${token}` },
        label: "ログイン確認",
      },
      DEFAULT_FETCH_TIMEOUT_MS
    );
  } catch {
    return null;
  }
}

export function redirectToPortalLogin(_customerCode, returnPath) {
  const ret = returnPath || location.pathname + location.search;
  const q = new URLSearchParams({ login: "required" });
  if (
    ret &&
    ret !== CUSTOMER_ENTRY &&
    !ret.startsWith(`${CUSTOMER_ENTRY}?`)
  ) {
    q.set("return", ret);
  }
  location.replace(`${CUSTOMER_ENTRY}?${q}`);
}

export async function requireCustomerLogin(customerCode) {
  const code = (customerCode || customerCodeFromPath()).toUpperCase();
  if (!getCustomerToken()) {
    redirectToPortalLogin(code);
    return null;
  }
  const session = await fetchCustomerSession();
  if (!session) {
    clearCustomerToken();
    redirectToPortalLogin(code);
    return null;
  }
  if (
    code &&
    session.customerCode &&
    session.customerCode.toUpperCase() !== code
  ) {
    redirectToPortalLogin(code);
    return null;
  }
  return session;
}

export async function requireInstallAccess(customerCode) {
  const session = await requireCustomerLogin(customerCode);
  if (!session) return null;
  const allowed = ["installer", "owner", "admin", "super_admin"];
  if (!allowed.includes(session.role)) {
    alert("施工 PWA は installer / owner / admin のみ利用できます");
    redirectToPortalLogin(customerCode || session.customerCode);
    return null;
  }
  return session;
}
