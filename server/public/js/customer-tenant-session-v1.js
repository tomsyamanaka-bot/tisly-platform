/**
 * お客様テナントセッション v1
 *
 * /customer 固定 URL 用。
 * ログイン情報を localStorage / sessionStorage に
 * 保持し、Security 画面の出し分けに使う。
 */

const TOKEN_KEY = "tisly_token";
const ADMIN_TOKEN_KEY = "tisly_admin_token";
const CUSTOMER_CODE_KEY = "tisly_customer_code";
const USERNAME_KEY = "tisly_customer_username";
const TENANT_PROFILE_KEY = "tisly_tenant_profile_v1";

const CUSTOMER_ENTRY = "/customer";

/** ローカルフォールバック（API 未到達時） */
const LOCAL_TENANT_MAP = {
  TOMS001: {
    customerCode: "TOMS001",
    displayName: "板橋自宅",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    homeSiteId: "HOME-JP-ITABASHI-LIVE",
    useToshimaDashboard: false,
  },
  HOME001: {
    customerCode: "HOME001",
    displayName: "板橋自宅",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    homeSiteId: "HOME-JP-ITABASHI-LIVE",
    useToshimaDashboard: false,
  },
  TOSHIMA001: {
    customerCode: "TOSHIMA001",
    displayName: "豊島邸（Toshima Residence）",
    securitySiteId: "SEC-JP-TOSHIMA-001",
    homeSiteId: "HOME-JP-TOSHIMA",
    useToshimaDashboard: true,
  },
};

export function getCustomerToken() {
  return (
    localStorage.getItem(ADMIN_TOKEN_KEY) ||
    sessionStorage.getItem(TOKEN_KEY) ||
    ""
  );
}

export function getCustomerCode() {
  return (
    sessionStorage.getItem(CUSTOMER_CODE_KEY) ||
    localStorage.getItem(CUSTOMER_CODE_KEY) ||
    ""
  ).toUpperCase();
}

export function getCustomerUsername() {
  return sessionStorage.getItem(USERNAME_KEY) || "";
}

export function setCustomerSession(token, customerCode, username) {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  const code = String(customerCode || "").trim().toUpperCase();
  if (code) {
    sessionStorage.setItem(CUSTOMER_CODE_KEY, code);
    localStorage.setItem(CUSTOMER_CODE_KEY, code);
  }
  if (username) {
    sessionStorage.setItem(USERNAME_KEY, username);
  }
}

export function clearCustomerSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(CUSTOMER_CODE_KEY);
  localStorage.removeItem(CUSTOMER_CODE_KEY);
  sessionStorage.removeItem(USERNAME_KEY);
  sessionStorage.removeItem(TENANT_PROFILE_KEY);
}

export function saveTenantProfile(profile) {
  if (!profile) return;
  try {
    sessionStorage.setItem(TENANT_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function loadTenantProfile() {
  try {
    const raw = sessionStorage.getItem(TENANT_PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const code = getCustomerCode();
  return LOCAL_TENANT_MAP[code] ?? null;
}

export function resolveSecuritySiteId() {
  const profile = loadTenantProfile();
  if (profile?.securitySiteId) return profile.securitySiteId;
  const code = getCustomerCode();
  return LOCAL_TENANT_MAP[code]?.securitySiteId ?? null;
}

export function isLoggedIn() {
  return Boolean(getCustomerToken() && getCustomerCode());
}

export async function loginCustomer(credentials) {
  const customerCode = String(credentials.customerCode || "")
    .trim()
    .toUpperCase();
  const username = String(credentials.username || "").trim();
  const password = String(credentials.password || "");

  const res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerCode, username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    throw new Error(data?.error || "ログインに失敗しました");
  }
  setCustomerSession(data.token, data.user?.customerCode || customerCode, username);
  await refreshTenantProfile();
  return data;
}

export async function refreshTenantProfile() {
  const token = getCustomerToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/customer-portal/v1/tenant-profile", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.profile) {
      saveTenantProfile(data.profile);
      return data.profile;
    }
  } catch {
    /* fallback below */
  }
  const code = getCustomerCode();
  const local = LOCAL_TENANT_MAP[code] ?? null;
  if (local) saveTenantProfile(local);
  return local;
}

export async function fetchSessionHome() {
  const token = getCustomerToken();
  if (!token) return null;
  const res = await fetch("/api/customer-portal/v1/session-home", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearCustomerSession();
    throw new Error(data?.error || "セッションが無効です");
  }
  if (data?.tenantProfile) saveTenantProfile(data.tenantProfile);
  return data;
}

export function requireCustomerSession() {
  if (!isLoggedIn()) {
    if (location.pathname !== CUSTOMER_ENTRY) {
      sessionStorage.setItem(
        "tisly_customer_return_url_v1",
        location.pathname
      );
    }
    location.replace(CUSTOMER_ENTRY);
    return false;
  }
  return true;
}

export { CUSTOMER_ENTRY, LOCAL_TENANT_MAP };
