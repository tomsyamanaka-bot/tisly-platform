/**
 * TiSLY HOME — 社内「顧客を見る」 v1
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badge(label, tone = "mute") {
  return `<span class="cv-badge cv-badge-${tone}">${escapeHtml(label)}</span>`;
}

function renderStats(view) {
  const el = document.getElementById("cv-stats");
  if (!el) return;
  el.innerHTML = `
    <div class="cv-stat"><strong>${view.totalCustomers}</strong><span>顧客</span></div>
    <div class="cv-stat"><strong>${view.totalHomeSites}</strong><span>HOME物件</span></div>
    <div class="cv-stat"><strong>${view.switchbot.mode === "real" ? "実機" : "モック"}</strong><span>SwitchBot</span></div>
  `;
}

function renderSite(site) {
  const alertTone =
    site.status === "security_alert"
      ? "danger"
      : site.status === "peak_warning"
        ? "warn"
        : "ok";

  const hwItems = (site.hardware?.devices ?? [])
    .map(
      (d) =>
        `<li><strong>${escapeHtml(d.label)}</strong> — ${escapeHtml(d.channelLabel)} · ID ${escapeHtml(d.deviceKey)}<br /><small>${escapeHtml(d.detail)}</small></li>`
    )
    .join("");

  const controlLogs = (site.controlLogs ?? [])
    .slice(0, 6)
    .map(
      (l) =>
        `<li>${escapeHtml(l.occurredAt)} · ${escapeHtml(l.deviceKind)} ${escapeHtml(l.action)} · ${escapeHtml(l.actor || "—")}</li>`
    )
    .join("");

  const accessLogs = (site.accessLogs ?? [])
    .slice(0, 4)
    .map(
      (l) =>
        `<li>${escapeHtml(l.occurredAt)} · ${escapeHtml(l.holderName)}（${escapeHtml(l.credentialType)}） ${escapeHtml(l.action)}</li>`
    )
    .join("");

  const notes = (site.fieldNotes ?? [])
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");

  return `
    <article class="cv-site">
      <p class="cv-site-name">${escapeHtml(site.displayName)}</p>
      <div class="cv-badge-row">
        ${badge(site.statusLabel, alertTone)}
        ${badge(site.monthlyFeeLabel, "mute")}
        ${badge(site.billingStatus, site.planStatus === "active" ? "ok" : "warn")}
      </div>
      <dl class="cv-dl" style="margin-top:8px">
        <div><dt>住所</dt><dd>${escapeHtml(site.addressLabel)}</dd></div>
        <div><dt>配線</dt><dd>${escapeHtml(site.hardware.wiringSpec)}</dd></div>
        <div><dt>給湯</dt><dd>${escapeHtml(site.hardware.hotWaterSpec)}</dd></div>
        <div><dt>プラン</dt><dd>${escapeHtml(site.planCode)} / ${escapeHtml(site.planStatus)}</dd></div>
        <div><dt>通貨</dt><dd>${escapeHtml(site.countryCode)}/${escapeHtml(site.currency)}</dd></div>
      </dl>
      ${
        site.recentAlerts?.length
          ? `<p class="cv-meta" style="margin-top:8px;color:#b91c1c">⚠ ${site.recentAlerts.map(escapeHtml).join(" · ")}</p>`
          : ""
      }
      <p style="margin:10px 0 4px;font-size:0.82rem;font-weight:600">施工・ハードウェア</p>
      <ul class="cv-hw">${hwItems || "<li>—</li>"}</ul>
      <p style="margin:10px 0 4px;font-size:0.82rem;font-weight:600">操作ログ</p>
      <ul class="cv-log">${controlLogs || "<li>ログなし</li>"}</ul>
      <p style="margin:10px 0 4px;font-size:0.82rem;font-weight:600">解錠・施錠ログ</p>
      <ul class="cv-log">${accessLogs || "<li>履歴なし</li>"}</ul>
      ${
        notes
          ? `<p style="margin:10px 0 4px;font-size:0.82rem;font-weight:600">現場メモ</p><ul class="cv-log">${notes}</ul>`
          : ""
      }
      <p style="margin-top:10px">
        <a class="cv-link" href="/home-v1?siteId=${encodeURIComponent(site.siteId)}">TiSLY HOME で開く ›</a>
      </p>
    </article>
  `;
}

function renderCustomer(c) {
  const props = (c.properties ?? [])
    .map(
      (p) =>
        `<li>${escapeHtml(p.propertyName)} — ${escapeHtml(p.address || "—")}</li>`
    )
    .join("");

  const sites = (c.homeSites ?? []).map(renderSite).join("");

  return `
    <article class="cv-card" data-search="${escapeHtml(
      `${c.customerCode} ${c.customerName} ${c.address} ${(c.homeSites ?? [])
        .map((s) => s.displayName)
        .join(" ")}`
    )}">
      <div class="cv-card-head">
        <h2>${escapeHtml(c.customerName)}</h2>
        <p class="cv-meta">
          コード ${escapeHtml(c.customerCode)} ·
          ${escapeHtml(c.contactName || "—")} ·
          <a href="tel:${escapeHtml(c.contactPhone)}">${escapeHtml(c.contactPhone || "—")}</a>
          ${c.contactEmail ? ` · ${escapeHtml(c.contactEmail)}` : ""}
        </p>
        <div class="cv-badge-row">
          ${badge(`ポータル ${c.portalPlan}`, "mute")}
          ${badge(c.portalStatus, c.portalStatus === "active" ? "ok" : "warn")}
        </div>
      </div>
      ${
        props
          ? `<div class="cv-section"><h3>設置物件（ポータル）</h3><ul class="cv-hw">${props}</ul></div>`
          : ""
      }
      <div class="cv-section">
        <h3>TiSLY HOME 物件（${(c.homeSites ?? []).length}件）</h3>
        ${sites || '<p class="cv-empty">HOME 物件は未登録です</p>'}
      </div>
    </article>
  `;
}

let viewCache = null;

function renderList(filter = "") {
  const root = document.getElementById("cv-list");
  if (!root || !viewCache) return;
  const q = filter.trim().toLowerCase();
  const customers = viewCache.customers.filter((c) => {
    if (!q) return true;
    const hay = `${c.customerCode} ${c.customerName} ${c.address} ${(c.homeSites ?? [])
      .map((s) => `${s.displayName} ${s.addressLabel}`)
      .join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
  root.innerHTML = customers.length
    ? customers.map(renderCustomer).join("")
    : '<p class="cv-empty">該当する顧客がありません</p>';
}

async function load() {
  const res = await fetch("/api/home/v1/customer-mgmt", { cache: "no-store" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込に失敗しました");
  viewCache = data.view;
  renderStats(viewCache);
  renderList();
}

document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("cv-search");
  if (search) {
    search.addEventListener("input", () => renderList(search.value));
  }
  load().catch((err) => {
    console.error(err);
    const root = document.getElementById("cv-list");
    if (root) root.innerHTML = '<p class="cv-empty">読み込めませんでした</p>';
  });
});
