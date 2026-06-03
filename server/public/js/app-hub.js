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
  const wf = document.getElementById("hub-workflow-grid");
  if (wf && data.workflows?.length) {
    wf.hidden = false;
    wf.innerHTML = data.workflows
      .map(
        (w) =>
          `<a class="hub-workflow-card" href="${w.href}">
            <div class="label">${w.label}${w.count != null ? ` (${w.count})` : ""}</div>
            <div class="desc">${w.description}</div>
          </a>`
      )
      .join("");
  }
  const ops = data.operations;
  if (ops) {
    let opsEl = document.getElementById("hub-ops-panel");
    if (!opsEl) {
      opsEl = document.createElement("section");
      opsEl.id = "hub-ops-panel";
      opsEl.className = "hub-ops-panel";
      document.getElementById("hub-apps-panel")?.appendChild(opsEl);
    }
    opsEl.innerHTML = `
      <h3 class="hub-workflows-title">今日のオペレーション</h3>
      <div class="hub-workflow-grid">
        <div class="hub-workflow-card">今日の現調 <strong>${ops.todaySurveys}</strong></div>
        <div class="hub-workflow-card">今日の工事 <strong>${ops.todayConstruction}</strong></div>
        <div class="hub-workflow-card">未請求 <strong>${ops.uninvoiced}</strong></div>
        <div class="hub-workflow-card">未入金 <strong>${ops.unpaid}</strong></div>
        <div class="hub-workflow-card">保守期限 <strong>${ops.maintenanceDue}</strong></div>
        <div class="hub-workflow-card">ESP異常 <strong>${ops.espAnomaly}</strong></div>
        <div class="hub-workflow-card">Shelly異常 <strong>${ops.shellyAnomaly}</strong></div>
      </div>`;
  }
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
