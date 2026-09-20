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

/* 認証3点のコピーと詳細パネル。
 * 平文PWは社内画面のみ扱う。 */
async function copyText(text) {
  const value = String(text ?? "");
  if (!value) throw new Error("コピーする値がありません");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    /* 下のフォールバックへ */
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

function loginCredentialOf(account) {
  const users = account?.users || [];
  const cred = account?.loginCredential || {};
  const username =
    cred.username ||
    users.find((u) => String(u.username || "").endsWith(".admin"))?.username ||
    users.find((u) => String(u.username || "").endsWith(".owner"))?.username ||
    users[0]?.username ||
    "";
  return {
    customerCode: account?.customerCode || "",
    username,
    password: cred.password || "",
    passwordKnown: cred.passwordKnown !== false && Boolean(cred.password),
    portalUrl: cred.portalUrl || "https://tisly.jp/customer",
    users,
  };
}

function formatLoginBundle(cred) {
  const pw = cred.passwordKnown && cred.password
    ? cred.password
    : "（平文未保存・再発行で記録）";
  return [
    "【TiSLY 顧客入口】",
    `入口: ${cred.portalUrl}`,
    `顧客コード: ${cred.customerCode}`,
    `ログインID: ${cred.username}`,
    `パスワード: ${pw}`,
  ].join("\n");
}

function renderAuthDetailPanel(account) {
  const cred = loginCredentialOf(account);
  const userOptions = (cred.users.length ? cred.users : [{ username: cred.username, role: "" }])
    .map((u) => {
      const selected = u.username === cred.username ? " selected" : "";
      const role = u.role ? ` (${escapeHtml(u.role)})` : "";
      return `<option value="${escapeHtml(u.username)}"${selected}>${escapeHtml(u.username)}${role}</option>`;
    })
    .join("");
  const pwKnown = cred.passwordKnown;
  const pwMasked = "••••••••";
  return `
    <div class="cm-auth-panel" hidden>
      <h3 class="cm-auth-title">認証情報（社内専用）</h3>
      <p class="cm-muted">入口は https://tisly.jp/customer 固定です</p>
      <div class="cm-auth-row">
        <div class="cm-auth-meta">
          <span class="cm-auth-label">顧客コード（Tenant ID）</span>
          <code class="cm-auth-value" data-cm-auth-field="code">${escapeHtml(cred.customerCode)}</code>
        </div>
        <button type="button" class="cm-icon-btn" data-cm-copy="code" title="顧客コードをコピー">📋</button>
      </div>
      <div class="cm-auth-row">
        <div class="cm-auth-meta">
          <span class="cm-auth-label">ログインID（ユーザー名）</span>
          <select class="cm-auth-select" data-cm-auth-field="username">${userOptions}</select>
        </div>
        <button type="button" class="cm-icon-btn" data-cm-copy="username" title="ログインIDをコピー">📋</button>
      </div>
      <div class="cm-auth-row">
        <div class="cm-auth-meta">
          <span class="cm-auth-label">パスワード</span>
          <code class="cm-auth-value" data-cm-auth-field="password" data-cm-pw-visible="0">${
            pwKnown ? pwMasked : "平文未保存（編集から再発行）"
          }</code>
        </div>
        <button type="button" class="cm-icon-btn" data-cm-reveal-pw ${pwKnown ? "" : "disabled"} title="パスワード表示切替">👁️</button>
        <button type="button" class="cm-icon-btn" data-cm-copy="password" ${pwKnown ? "" : "disabled"} title="パスワードをコピー">📋</button>
      </div>
      <button type="button" class="cm-btn primary cm-auth-bundle" data-cm-copy="bundle">🔑 3点一括コピー</button>
    </div>`;
}

function bindAuthDetail(card, account) {
  const toggle = card.querySelector(".cm-detail-btn");
  const panel = card.querySelector(".cm-auth-panel");
  if (!toggle || !panel) return;
  const credState = loginCredentialOf(account);

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.classList.toggle("is-on", open);
  });

  const userSelect = panel.querySelector("[data-cm-auth-field='username']");
  userSelect?.addEventListener("change", () => {
    credState.username = String(userSelect.value || credState.username);
  });

  panel.querySelector("[data-cm-reveal-pw]")?.addEventListener("click", (e) => {
    if (!credState.passwordKnown) return;
    const el = panel.querySelector("[data-cm-auth-field='password']");
    if (!el) return;
    const show = el.getAttribute("data-cm-pw-visible") !== "1";
    el.setAttribute("data-cm-pw-visible", show ? "1" : "0");
    el.textContent = show ? credState.password : "••••••••";
    e.currentTarget.setAttribute("aria-pressed", show ? "true" : "false");
  });

  panel.querySelectorAll("[data-cm-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kind = btn.getAttribute("data-cm-copy");
      const username = String(userSelect?.value || credState.username);
      const bundleCred = { ...credState, username };
      let text = "";
      if (kind === "code") text = bundleCred.customerCode;
      else if (kind === "username") text = username;
      else if (kind === "password") text = bundleCred.password;
      else text = formatLoginBundle(bundleCred);
      try {
        await copyText(text);
        toast(kind === "bundle" ? "認証3点をコピーしました" : "コピーしました");
      } catch (err) {
        toast(err.message || "コピーに失敗しました");
      }
    });
  });
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
      <label>クラウド共有 URL（cloudStreamUrl）<input name="cloudStreamUrl" placeholder="https://… Guard Viewer / EZCloud" /></label>
      <label>アプリ起動 URL<input name="nvrAppOpenUrl" placeholder="任意 · ストア / ディープリンク" /></label>
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
          cloudStreamUrl: fd.get("cloudStreamUrl") || null,
          shareUrl: fd.get("cloudStreamUrl") || null,
          nvrAppOpenUrl: fd.get("nvrAppOpenUrl") || null,
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
      <label>クラウド共有 URL（cloudStreamUrl）<input name="cloudStreamUrl" value="${escapeHtml(b.cloudStreamUrl || b.shareUrl || "")}" placeholder="https://… Guard Viewer / EZCloud" /></label>
      <label>アプリ起動 URL<input name="nvrAppOpenUrl" value="${escapeHtml(b.nvrAppOpenUrl || "")}" placeholder="任意 · ストア / ディープリンク" /></label>
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
          cloudStreamUrl: fd.get("cloudStreamUrl") || null,
          shareUrl: fd.get("cloudStreamUrl") || null,
          nvrAppOpenUrl: fd.get("nvrAppOpenUrl") || null,
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
            <button type="button" class="cm-btn cm-detail-btn" aria-expanded="false">📄 詳細（認証情報）</button>
          </div>
          ${renderAuthDetailPanel(a)}
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
  listEl.querySelectorAll(".cm-card").forEach((card) => {
    const code = card.dataset.code;
    const acc = accountsCache.find((x) => x.customerCode === code);
    if (acc) bindAuthDetail(card, acc);
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
