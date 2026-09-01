/**
 * 社内 Customer Master v1
 * 顧客アカウント・モジュール・デバイス管理
 */

const listEl = document.getElementById("cm-list");
const formPanel = document.getElementById("cm-form-panel");
const searchInput = document.getElementById("cm-search");

let modulesCache = [];
let accountsCache = [];

function authHeaders(json = false) {
  const token =
    localStorage.getItem("tisly_admin_token") ||
    sessionStorage.getItem("tisly_token") ||
    "";
  const h = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "cm-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders(), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "読込に失敗しました");
  return data;
}

async function apiSend(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "保存に失敗しました");
  return data;
}

function renderPortalToggles(toggles = {}, namePrefix = "portalToggle") {
  return modulesCache
    .map((m) => {
      const defaultOn = m.defaultOn ?? false;
      const on =
        toggles[m.id] !== undefined ? Boolean(toggles[m.id]) : defaultOn;
      return `<label class="cm-toggle-row">
        <input type="checkbox" name="${namePrefix}" value="${escapeHtml(m.id)}" ${on ? "checked" : ""} />
        <span>
          <strong>${escapeHtml(m.label || m.id)}</strong>
          <small>${escapeHtml(m.description || "")}</small>
        </span>
      </label>`;
    })
    .join("");
}

function collectPortalToggles(form) {
  const toggles = {};
  modulesCache.forEach((m) => {
    toggles[m.id] = Boolean(
      form.querySelector(`input[name="portalToggle"][value="${m.id}"]`)?.checked
    );
  });
  return toggles;
}

function formatPortalToggleSummary(toggles = {}) {
  return modulesCache
    .filter((m) => toggles[m.id])
    .map((m) => m.label || m.id)
    .join(" · ");
}

function showNewForm() {
  formPanel.hidden = false;
  formPanel.innerHTML = `
    <h2>新規顧客登録</h2>
    <form id="cm-new-form" class="cm-form">
      <label>顧客名<input name="customerName" required placeholder="例: 豊島邸" /></label>
      <label>顧客コード<input name="customerCode" required placeholder="例: TOYOSHIMA001" pattern="[A-Za-z0-9]{3,16}" /></label>
      <label>ログインID<input name="username" required placeholder="例: toyoshima001.owner" /></label>
      <label>初期パスワード<input name="password" type="password" required minlength="8" /></label>
      <fieldset>
        <legend>顧客画面（/customer）カード表示</legend>
        <p class="cm-muted">TOMS のみ変更可。保存後すぐ /customer に反映されます。</p>
        <div class="cm-toggle-list">${renderPortalToggles({})}</div>
      </fieldset>
      <label>RP2350 母屋 ID<input name="rp2350MainId" placeholder="rp2350-xxx-main-01" /></label>
      <label>RP2350 はなれ ID<input name="rp2350DetachedId" placeholder="任意" /></label>
      <label>NVR ラベル<input name="nvrLabel" placeholder="H.View NVR" /></label>
      <label>RTSP ベース<input name="nvrRtspBase" placeholder="rtsp://192.168.x.x:554" /></label>
      <div class="cm-actions">
        <button type="submit" class="cm-btn primary">登録</button>
        <button type="button" class="cm-btn" id="cm-cancel-new">キャンセル</button>
      </div>
    </form>`;
  document.getElementById("cm-cancel-new")?.addEventListener("click", () => {
    formPanel.hidden = true;
  });
  document.getElementById("cm-new-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await apiSend("POST", "/api/customer-portal/v1/admin/accounts", {
        customerCode: fd.get("customerCode"),
        customerName: fd.get("customerName"),
        username: fd.get("username"),
        password: fd.get("password"),
        portalCardToggles: collectPortalToggles(e.target),
        bindings: {
          rp2350MainId: fd.get("rp2350MainId") || null,
          rp2350DetachedId: fd.get("rp2350DetachedId") || null,
          nvrLabel: fd.get("nvrLabel") || null,
          nvrRtspBase: fd.get("nvrRtspBase") || null,
        },
      });
      toast("登録しました");
      formPanel.hidden = true;
      await loadAccounts();
    } catch (err) {
      toast(err.message);
    }
  });
}

function showEditForm(account) {
  formPanel.hidden = false;
  const b = account.bindings || {};
  formPanel.innerHTML = `
    <h2>編集 — ${escapeHtml(account.customerName)}</h2>
    <form id="cm-edit-form" class="cm-form">
      <label>顧客名<input name="customerName" value="${escapeHtml(account.customerName)}" /></label>
      <label>契約プラン<input name="plan" value="${escapeHtml(account.plan)}" /></label>
      <fieldset>
        <legend>顧客画面（/customer）カード表示</legend>
        <p class="cm-muted">TiSLY Security 既定 ON · TiSLY HOME 既定 OFF</p>
        <div class="cm-toggle-list">${renderPortalToggles(account.portalCardToggles || {})}</div>
      </fieldset>
      <label>RP2350 母屋 ID<input name="rp2350MainId" value="${escapeHtml(b.rp2350MainId || "")}" /></label>
      <label>RP2350 はなれ ID<input name="rp2350DetachedId" value="${escapeHtml(b.rp2350DetachedId || "")}" /></label>
      <label>NVR ホスト<input name="nvrHost" value="${escapeHtml(b.nvrHost || "")}" /></label>
      <label>NVR ラベル<input name="nvrLabel" value="${escapeHtml(b.nvrLabel || "")}" /></label>
      <label>RTSP ベース<input name="nvrRtspBase" value="${escapeHtml(b.nvrRtspBase || "")}" /></label>
      <hr />
      <label>PW再発行 — ユーザー<input name="pwUser" value="${escapeHtml(account.users?.[0]?.username || "")}" /></label>
      <label>新パスワード<input name="pwNew" type="password" minlength="8" placeholder="8文字以上" /></label>
      <div class="cm-actions">
        <button type="submit" class="cm-btn primary">保存</button>
        <button type="button" class="cm-btn" id="cm-cancel-edit">キャンセル</button>
      </div>
    </form>`;
  document.getElementById("cm-cancel-edit")?.addEventListener("click", () => {
    formPanel.hidden = true;
  });
  document.getElementById("cm-edit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const code = account.customerCode;
    try {
      await apiSend("PATCH", `/api/customer-portal/v1/admin/accounts/${encodeURIComponent(code)}`, {
        customerName: fd.get("customerName"),
        plan: fd.get("plan"),
        portalCardToggles: collectPortalToggles(e.target),
        bindings: {
          rp2350MainId: fd.get("rp2350MainId") || null,
          rp2350DetachedId: fd.get("rp2350DetachedId") || null,
          nvrHost: fd.get("nvrHost") || null,
          nvrLabel: fd.get("nvrLabel") || null,
          nvrRtspBase: fd.get("nvrRtspBase") || null,
        },
      });
      const pw = String(fd.get("pwNew") || "");
      if (pw.length >= 8) {
        await apiSend(
          "POST",
          `/api/customer-portal/v1/admin/accounts/${encodeURIComponent(code)}/password`,
          { username: fd.get("pwUser"), password: pw }
        );
      }
      toast("保存しました");
      formPanel.hidden = true;
      await loadAccounts(searchInput?.value);
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderList(accounts) {
  if (!accounts.length) {
    listEl.innerHTML = `<p class="cm-muted">該当する顧客がありません</p>`;
    return;
  }
  listEl.innerHTML = accounts
    .map((a) => {
      const users = (a.users || [])
        .map((u) => `${escapeHtml(u.username)} (${escapeHtml(u.role)})`)
        .join(" · ");
      const mods = formatPortalToggleSummary(a.portalCardToggles || {});
      const b = a.bindings || {};
      return `
        <article class="cm-card" data-code="${escapeHtml(a.customerCode)}">
          <div class="cm-card-head">
            <div>
              <div class="cm-code">${escapeHtml(a.customerCode)}</div>
              <strong>${escapeHtml(a.customerName)}</strong>
            </div>
            <span class="cm-badge">${escapeHtml(a.status)} · ${escapeHtml(a.plan)}</span>
          </div>
          <p class="cm-users">👤 ${users || "—"}</p>
          <p class="cm-bindings">📡 RP2350: ${escapeHtml(b.rp2350MainId || "—")} / NVR: ${escapeHtml(b.nvrLabel || "—")}</p>
          <p class="cm-bindings">📷 RTSP: ${escapeHtml(b.nvrRtspBase || "—")} · デバイス ${a.deviceCount ?? 0} 件</p>
          <p class="cm-muted">表示カード: ${escapeHtml(mods || "—")}</p>
          <div class="cm-actions">
            <button type="button" class="cm-btn primary cm-edit-btn">編集</button>
            <a class="cm-btn" href="https://tisly.jp/customer" target="_blank" rel="noopener">顧客入口</a>
          </div>
        </article>`;
    })
    .join("");

  listEl.querySelectorAll(".cm-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.closest(".cm-card")?.dataset.code;
      const acc = accountsCache.find((x) => x.customerCode === code);
      if (acc) showEditForm(acc);
    });
  });
}

async function loadAccounts(query = "") {
  const q = String(query || "").trim();
  const url = q
    ? `/api/customer-portal/v1/admin/accounts?customerCode=${encodeURIComponent(q)}`
    : "/api/customer-portal/v1/admin/accounts";
  const data = await apiGet(url);
  accountsCache = data.accounts || [];
  renderList(accountsCache);
}

async function init() {
  const token =
    localStorage.getItem("tisly_admin_token") ||
    sessionStorage.getItem("tisly_token");
  if (!token) {
    listEl.innerHTML = `<p class="cm-muted">App Hub からログインしてください。<a href="/app">/app</a></p>`;
    return;
  }
  try {
    const mod = await apiGet("/api/customer-portal/v1/admin/accounts/modules");
    modulesCache = mod.modules || [];
    await loadAccounts();
  } catch (err) {
    listEl.innerHTML = `<p class="cm-muted">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById("cm-btn-search")?.addEventListener("click", () => {
  loadAccounts(searchInput?.value).catch((e) => toast(e.message));
});
document.getElementById("cm-btn-new")?.addEventListener("click", showNewForm);
searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    loadAccounts(searchInput.value).catch((err) => toast(err.message));
  }
});

init();
