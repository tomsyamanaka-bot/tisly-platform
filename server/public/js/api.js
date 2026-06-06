const API_BASE = "";

const TOKEN_KEY = "tisly_admin_token";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setAdminToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem("tisly_token", token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem("tisly_token");
  }
}

function authHeaders(extra = {}) {
  const token = getAdminToken();
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (res.status === 401) throw new Error("認証が必要です — ログインしてください");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 401) throw new Error("認証が必要です — ログインしてください");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 401) throw new Error("認証が必要です — ログインしてください");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPatch(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 401) throw new Error("認証が必要です — ログインしてください");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiLogin(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  setAdminToken(data.token);
  return data;
}

export async function apiLogout() {
  try {
    await apiPost("/api/auth/logout");
  } catch {
    /* ignore */
  }
  setAdminToken("");
}
