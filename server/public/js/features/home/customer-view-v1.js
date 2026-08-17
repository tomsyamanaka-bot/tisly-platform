/**
 * TiSLY HOME — 社内「顧客を見る」 v2
 * TiSLY HOME 契約物件のみ（独立データ）
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
    <div class="cv-stat"><strong>${view.totalSites}</strong><span>HOME物件</span></div>
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

  const contactParts = [
    site.contactName,
    site.contactPhone
      ? `<a href="tel:${escapeHtml(site.contactPhone)}">${escapeHtml(site.contactPhone)}</a>`
      : "",
    site.contactEmail,
  ].filter(Boolean);

  const controlLogs = (site.controlLogs ?? [])
    .map(
      (l) =>
        `<li>${escapeHtml(l.occurredAt)} · ${escapeHtml(l.deviceKind)} ${escapeHtml(l.action)}</li>`
    )
    .join("");

  return `
    <article class="cv-site" data-site-id="${escapeHtml(site.siteId)}">
      <div class="cv-site-head">
        <p class="cv-site-name">${escapeHtml(site.displayName)}</p>
        <button type="button" class="cv-edit-btn" data-edit-site="${escapeHtml(site.siteId)}" aria-label="編集">編集</button>
      </div>
      <div class="cv-badge-row">
        ${badge(site.statusLabel, alertTone)}
        ${badge(site.monthlyFeeLabel, "mute")}
        ${badge(site.billingStatus, site.planStatus === "active" ? "ok" : "warn")}
        ${badge(site.registrationSourceLabel, "mute")}
      </div>
      <dl class="cv-dl">
        <div><dt>住所</dt><dd>${escapeHtml(site.addressLabel || "—")}</dd></div>
        <div><dt>プラン</dt><dd>${escapeHtml(site.planLabel)}</dd></div>
        <div><dt>連絡先</dt><dd>${contactParts.length ? contactParts.join(" · ") : "—"}</dd></div>
        ${
          site.linkedDeviceId
            ? `<div><dt>デバイス</dt><dd>${escapeHtml(site.linkedDeviceId)}</dd></div>`
            : ""
        }
      </dl>
      ${
        site.recentAlerts?.length
          ? `<p class="cv-alert">⚠ ${site.recentAlerts.map(escapeHtml).join(" · ")}</p>`
          : ""
      }
      ${
        controlLogs
          ? `<ul class="cv-log">${controlLogs}</ul>`
          : ""
      }
      <p class="cv-site-actions">
        <a class="cv-link" href="/home-v1?siteId=${encodeURIComponent(site.siteId)}">TiSLY HOME で開く ›</a>
      </p>
    </article>
  `;
}

let viewCache = null;

function renderList(filter = "") {
  const root = document.getElementById("cv-list");
  if (!root || !viewCache) return;
  const q = filter.trim().toLowerCase();
  const sites = viewCache.sites.filter((s) => {
    if (!q) return true;
    const hay = `${s.displayName} ${s.addressLabel} ${s.contactName} ${s.contactPhone} ${s.planLabel}`.toLowerCase();
    return hay.includes(q);
  });
  root.innerHTML = sites.length
    ? `<div class="cv-site-grid">${sites.map(renderSite).join("")}</div>`
    : '<p class="cv-empty">TiSLY HOME 契約物件がありません。「＋ 新規登録」から追加してください。</p>';
}

function openModal(mode, site) {
  const modal = document.getElementById("cv-modal");
  const form = document.getElementById("cv-form");
  const title = document.getElementById("cv-modal-title");
  if (!modal || !form || !title) return;

  form.dataset.mode = mode;
  form.dataset.siteId = site?.siteId ?? "";

  title.textContent = mode === "edit" ? "物件を編集" : "新規物件を登録";

  form.displayName.value = site?.displayName ?? "";
  form.addressLabel.value = site?.addressLabel ?? "";
  form.planCode.value = site?.planCode ?? "home_basic";
  form.contactName.value = site?.contactName ?? "";
  form.contactPhone.value = site?.contactPhone ?? "";
  form.contactEmail.value = site?.contactEmail ?? "";

  modal.hidden = false;
}

function closeModal() {
  const modal = document.getElementById("cv-modal");
  if (modal) modal.hidden = true;
}

async function submitForm(event) {
  event.preventDefault();
  const form = event.target;
  const mode = form.dataset.mode || "create";
  const siteId = form.dataset.siteId || "";
  const payload = {
    displayName: form.displayName.value.trim(),
    addressLabel: form.addressLabel.value.trim(),
    planCode: form.planCode.value,
    contactName: form.contactName.value.trim(),
    contactPhone: form.contactPhone.value.trim(),
    contactEmail: form.contactEmail.value.trim(),
  };

  const submitBtn = form.querySelector('[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const url =
      mode === "edit" && siteId
        ? `/api/home/v1/customer-mgmt/sites/${encodeURIComponent(siteId)}`
        : "/api/home/v1/customer-mgmt/sites";
    const res = await fetch(url, {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "保存に失敗しました");
    viewCache = data.view;
    renderStats(viewCache);
    renderList(document.getElementById("cv-search")?.value ?? "");
    closeModal();
  } catch (err) {
    alert(err.message || "保存に失敗しました");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
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

  document.getElementById("cv-add-btn")?.addEventListener("click", () => {
    openModal("create");
  });

  document.getElementById("cv-list")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-edit-site]");
    if (!btn || !viewCache) return;
    const site = viewCache.sites.find((s) => s.siteId === btn.dataset.editSite);
    if (site) openModal("edit", site);
  });

  document.getElementById("cv-form")?.addEventListener("submit", submitForm);

  document.getElementById("cv-modal")?.addEventListener("click", (event) => {
    if (
      event.target.matches("[data-modal-close]") ||
      event.target === event.currentTarget
    ) {
      closeModal();
    }
  });

  load().catch((err) => {
    console.error(err);
    const root = document.getElementById("cv-list");
    if (root) root.innerHTML = '<p class="cv-empty">読み込めませんでした</p>';
  });
});
