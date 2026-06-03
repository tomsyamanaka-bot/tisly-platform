import { apiGet, apiPost, getAdminToken, setAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/admin\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";

document.getElementById("admin-title").textContent = `顧客管理 — ${customerCode}`;

document.getElementById("admin-btn-login")?.addEventListener("click", async () => {
  const username = document.getElementById("admin-user").value.trim();
  const password = document.getElementById("admin-pass").value;
  let res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerCode, username, password }),
  });
  if (!res.ok) {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  }
  const data = await res.json();
  if (!res.ok) {
    alert(data.error ?? "ログイン失敗");
    return;
  }
  setAdminToken(data.token);
  loadAdmin();
});

document.getElementById("admin-save")?.addEventListener("click", async () => {
  const msg = document.getElementById("admin-save-msg");
  msg.textContent = "";
  try {
    const res = await fetch(`/api/customers/${customerCode}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: JSON.stringify({
        plan: document.getElementById("admin-plan").value,
        status: document.getElementById("admin-status").value,
        branding: {
          companyName: document.getElementById("admin-company-name").value,
          companyColor: document.getElementById("admin-company-color").value,
          logoUrl: document.getElementById("admin-logo-url").value,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error ?? "保存失敗";
      return;
    }
    msg.textContent = "保存しました";
    loadAdmin();
  } catch (e) {
    msg.textContent = String(e);
  }
});

async function loadAdmin() {
  document.getElementById("admin-login").hidden = true;
  document.getElementById("admin-content").hidden = false;

  const info = await apiGet(`/api/customers/by-code/${customerCode}`);
  const devices = await apiGet(`/api/customers/${customerCode}/devices`);
  const users = await apiGet(`/api/customers/${customerCode}/users`).catch(() => ({ users: [] }));
  const audit = await apiGet(`/api/customers/${customerCode}/audit`).catch(() => ({ auditLogs: [] }));
  const tvs = await apiGet(`/api/customers/${customerCode}/tv-devices`).catch(() => ({ tvDevices: [] }));

  const c = info.customer;
  document.getElementById("admin-customer-info").innerHTML = `
    <h2>${c.customer_name}</h2>
    <p>コード: ${c.customer_code} · プラン: ${c.plan} · ${c.status}</p>
    <p><strong>有効機能:</strong> ${(info.planFeatures ?? []).join(", ")}</p>
    <p class="hint">${users.contractNote ?? "契約メモ placeholder"}</p>
    <p><a href="${info.urls.customer}">ポータル</a> · <a href="${info.urls.tv}">TV</a></p>
  `;
  document.getElementById("admin-plan").value = c.plan;
  document.getElementById("admin-status").value = c.status;

  const bill = info.billing;
  document.getElementById("admin-billing-info").innerHTML = bill
    ? `<ul class="simple-list">
        <li>プラン: <strong>${bill.plan}</strong></li>
        <li>契約状態: ${bill.contract_status ?? "active"}</li>
        <li>サブスク: ${bill.subscription_status ?? "none"}</li>
        <li>次回請求: ${bill.next_billing_date ?? "—"}</li>
        <li>Stripe Customer: ${bill.stripe_customer_id ?? "—"}</li>
        <li>Stripe Subscription: ${bill.stripe_subscription_id ?? "—"}</li>
        <li>直近請求: ${bill.last_invoice_status ?? "—"}</li>
      </ul>`
    : "<p>請求情報なし</p>";

  const b = info.branding;
  if (b) {
    document.getElementById("admin-company-name").value = b.company_name ?? "";
    document.getElementById("admin-company-color").value = b.company_color ?? "#1a7f37";
    document.getElementById("admin-logo-url").value = b.logo_url ?? "";
  }

  document.getElementById("admin-sites").innerHTML = (info.sites ?? [])
    .map((s) => `<li>${s.site_name} — ${s.address ?? ""}</li>`)
    .join("");

  document.getElementById("admin-users").innerHTML = (users.users ?? [])
    .map(
      (u) =>
        `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.status}</td><td>${u.last_login_at ?? "—"}</td></tr>`
    )
    .join("");

  document.getElementById("admin-devices").innerHTML = devices.devices
    .map(
      (d) =>
        `<tr><td>${d.deviceType}</td><td>${d.label ?? d.deviceId}</td>
         <td>${d.online ? "オンライン" : "オフライン"}</td></tr>`
    )
    .join("");

  document.getElementById("admin-tv-list").textContent = JSON.stringify(tvs.tvDevices ?? [], null, 2);

  document.getElementById("admin-audit").innerHTML = (audit.auditLogs ?? [])
    .map((a) => `<li>${a.created_at} ${a.action} — ${a.actor_label ?? ""}</li>`)
    .join("") || "<li>ログなし</li>";
}

if (getAdminToken()) loadAdmin().catch(() => setAdminToken(""));
