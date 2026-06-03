import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";

async function customerLogin(code, username, password) {
  const res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerCode: code, username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function loadHubApps() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const res = await fetch("/api/pwa/hub", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("login-panel").hidden = true;
  document.getElementById("hub-apps-panel").hidden = false;
  document.getElementById("hub-role-label").textContent = `ロール: ${data.role} · 顧客: ${data.customerCode}`;
  const grid = document.getElementById("hub-app-grid");
  grid.innerHTML = (data.apps || [])
    .map(
      (a) =>
        `<a class="hub-app-card${a.optional ? " optional" : ""}" href="${a.url}" style="border-left: 4px solid ${a.themeColor}">
          <div class="label">${a.label}</div>
          <div class="desc">${a.description}</div>
        </a>`
    )
    .join("");
}

document.getElementById("btn-hub-login")?.addEventListener("click", async () => {
  const err = document.getElementById("hub-login-error");
  err.textContent = "";
  const code = document.getElementById("hub-customer-code").value.trim().toUpperCase();
  const username = document.getElementById("hub-username").value.trim();
  const password = document.getElementById("hub-password").value;
  const { ok, body } = await customerLogin(code, username, password);
  if (!ok) {
    err.textContent = body.error || "ログインに失敗しました";
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, body.token);
  sessionStorage.setItem("tisly_customer_code", code);
  await loadHubApps();
});

if (sessionStorage.getItem(TOKEN_KEY)) {
  loadHubApps();
}

renderPwaTopbar("hub", "App Hub");
