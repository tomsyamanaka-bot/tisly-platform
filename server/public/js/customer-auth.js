/** Shared customer session helpers — Phase 2081–2120 */

const ADMIN_TOKEN_KEY = "tisly_admin_token";
const SESSION_TOKEN_KEY = "tisly_token";
const CUSTOMER_CODE_KEY = "tisly_customer_code";

export function customerCodeFromPath() {
  const m = location.pathname.match(/\/customer\/([^/]+)/i);
  return m ? m[1].toUpperCase() : sessionStorage.getItem(CUSTOMER_CODE_KEY) || "TOMS001";
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
    if (customerCode) sessionStorage.setItem(CUSTOMER_CODE_KEY, customerCode.toUpperCase());
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

export function clearCustomerToken() {
  setCustomerToken("");
}

export async function fetchCustomerSession() {
  const token = getCustomerToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/pwa/hub", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function redirectToPortalLogin(customerCode, returnPath) {
  const code = (customerCode || customerCodeFromPath()).toUpperCase();
  const ret = returnPath || location.pathname + location.search;
  const q = new URLSearchParams({ login: "required" });
  if (ret && ret !== `/customer/${code}`) q.set("return", ret);
  location.replace(`/customer/${code}?${q}`);
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
  if (session.customerCode && session.customerCode.toUpperCase() !== code) {
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
