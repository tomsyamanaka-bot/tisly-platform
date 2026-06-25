// @tisly-customer-js-version customer-v1-phase27
/**
 * お客様 UI 描画ロジック — DOM 操作を集約（React Native 移植時は差し替え）
 * 文言は server/src/shared/customer/customer-labels-v1.ts と同期
 */

export const CUSTOMER_JS_VERSION = "customer-v1-phase27";

export const CUSTOMER_HOME_LABELS = {
  currentStatus: "現在の状態",
  lastChecked: "最終確認",
};

export const CUSTOMER_MONITORING_LABELS = {
  pageTitle: "見守り",
  lastDetection: "最終確認",
  alertHistory: "警報履歴",
  allClear: "現在異常はありません",
};

export const CUSTOMER_PROJECT_LABELS = {
  documents: "書類一覧",
  photos: "工事写真",
  inspectionRecords: "点検記録",
  workName: "工事名",
};

export const CUSTOMER_DOCUMENT_ACTIONS = {
  back: "戻る",
  pdf: "PDFを見る",
  pdfView: "PDFを見る",
  save: "保存",
};

export const CUSTOMER_CONTACT_LABEL = "TOMSへ連絡";

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHomeStatus(data) {
  const statusLabel = data.currentStatusLabel || CUSTOMER_HOME_LABELS.currentStatus;
  const lastLabel = data.lastCheckedLabel || CUSTOMER_HOME_LABELS.lastChecked;
  return `
    <section class="cv-hero">
      <p class="cv-hero-property">${escapeHtml(data.propertyName)}</p>
      <p class="cv-section-label">${escapeHtml(statusLabel)}</p>
      <div class="cv-status-row">
        <span class="cv-status-big">${escapeHtml(data.systemStatusEmoji)} ${escapeHtml(data.systemStatusLabel)}</span>
      </div>
      <p class="cv-last-checked">${escapeHtml(lastLabel)}：${escapeHtml(data.lastCheckedAt)}</p>
    </section>
  `;
}

export function renderHomeCards(cards) {
  return `
    <section class="cv-card-grid" aria-label="メニュー">
      ${(cards || [])
        .map(
          (c) =>
            `<a class="cv-big-card" href="${escapeHtml(c.href)}" data-customer-nav>
              <span class="cv-big-card-emoji">${escapeHtml(c.emoji)}</span>
              <span class="cv-big-card-label">${escapeHtml(c.label)}</span>
            </a>`
        )
        .join("")}
    </section>
  `;
}

export function renderNotifications(notifications) {
  if (!notifications?.length) return "";
  return `
    <section class="cv-card cv-notifications" aria-label="お知らせ">
      <h2 class="cv-section-title">お知らせ</h2>
      <ul class="cv-notif-list">
        ${notifications
          .slice(0, 8)
          .map((n) => {
            const sev = n.severity === "danger" ? "cv-notif-danger" : n.severity === "warning" ? "cv-notif-warn" : "cv-notif-info";
            const inner = `<span class="cv-notif-title">${escapeHtml(n.title)}</span><span class="cv-notif-body">${escapeHtml(n.body)}</span>`;
            return n.href
              ? `<li class="cv-notif-item ${sev}"><a href="${escapeHtml(n.href)}" data-customer-nav>${inner}</a></li>`
              : `<li class="cv-notif-item ${sev}">${inner}</li>`;
          })
          .join("")}
      </ul>
    </section>
  `;
}

export function renderPropertyList(projects) {
  if (!projects?.length) {
    return `<p class="cv-preparing">物件を準備中です</p>`;
  }
  return projects
    .map((p) => {
      const actions = (p.actions || [])
        .map(
          (a) =>
            `<a class="cv-action-btn" href="${escapeHtml(a.href)}" data-customer-nav ${
              a.id === "contact" && a.href.startsWith("tel:") ? 'data-tel-action="1"' : ""
            }>${escapeHtml(a.emoji)} ${escapeHtml(a.label)}</a>`
        )
        .join("");
      const mainHref = p.projectPageUrl || p.documentsPageUrl || "#";
      const statusLabel = p.currentStatusLabel || CUSTOMER_HOME_LABELS.currentStatus;
      const lastLabel = p.lastCheckedLabel || CUSTOMER_HOME_LABELS.lastChecked;
      const systemLabel = p.systemStatusLabel || p.statusLabel || "正常";
      const systemEmoji = p.systemStatusEmoji || "🟢";
      const lastChecked = p.lastCheckedAt || "—";
      const inspectionClass = `cv-inspection-${p.inspectionColor || "gray"}`;
      const cover = p.coverPhotoUrl
        ? `<img class="cv-property-thumb" src="${escapeHtml(p.coverPhotoUrl)}" alt="" loading="lazy" />`
        : `<div class="cv-property-thumb cv-property-thumb-empty" aria-hidden="true">🏠</div>`;
      const plan = p.contractPlan ? `<span class="cv-plan-badge">${escapeHtml(p.contractPlan)}</span>` : "";
      const addr = p.address ? `<p class="cv-property-address">${escapeHtml(p.address)}</p>` : "";
      const installed = p.installedDate
        ? `<p class="cv-meta-line">設置日：${escapeHtml(String(p.installedDate).slice(0, 10))}</p>`
        : "";
      const inspection = p.nextInspectionDate
        ? `<p class="cv-meta-line ${inspectionClass}">次回点検：${escapeHtml(String(p.nextInspectionDate).slice(0, 10))} ${escapeHtml(p.inspectionLabel || "")}</p>`
        : "";
      return `
        <article class="cv-property-card">
          <a class="cv-property-card-main" href="${escapeHtml(mainHref)}" data-customer-nav>
            <div class="cv-property-card-top">
              ${cover}
              <div class="cv-property-card-body">
                <h3 class="cv-property-name">${escapeHtml(p.propertyName)}</h3>
                ${plan}
                ${addr}
                ${installed}
                ${inspection}
              </div>
            </div>
            <p class="cv-section-label">${escapeHtml(statusLabel)}</p>
            <p class="cv-status-inline">${escapeHtml(systemEmoji)} ${escapeHtml(systemLabel)}</p>
            <p class="cv-last-checked">${escapeHtml(lastLabel)}：${escapeHtml(lastChecked)}</p>
          </a>
          <div class="cv-action-row">${actions}</div>
        </article>`;
    })
    .join("");
}

export function renderProjectDocuments(docs) {
  if (!docs?.length) {
    return `<p class="cv-preparing">書類を準備中です</p>`;
  }
  return docs
    .map(
      (d) =>
        `<a class="cv-doc-btn" href="${escapeHtml(d.openUrl)}" data-customer-nav>📄 ${escapeHtml(d.label)}</a>`
    )
    .join("");
}

export function renderProjectPhotos(photos) {
  if (!photos?.length) return "";
  return `
    <section class="cv-card" id="photos">
      <h2>${escapeHtml(CUSTOMER_PROJECT_LABELS.photos)}</h2>
      <div class="cv-photo-grid">
        ${photos
          .map(
            (p) =>
              `<figure><img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.title)}" loading="lazy" /><figcaption>${escapeHtml(p.title)}</figcaption></figure>`
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderProjectQuickActions(actions) {
  if (!actions?.length) return "";
  return `
    <section class="cv-card cv-quick-actions" id="contact">
      <div class="cv-action-row cv-action-row-prominent">
        ${actions
          .map(
            (a) =>
              `<a class="cv-action-btn cv-action-btn-primary" href="${escapeHtml(a.href)}" data-customer-nav ${
                a.id === "contact" && a.href.startsWith("tel:") ? 'data-tel-action="1"' : ""
              }>${escapeHtml(a.emoji)} ${escapeHtml(a.label)}</a>`
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderMaintenance(items) {
  if (!items?.length) return "";
  return `
    <section class="cv-card" id="maintenance">
      <h2>${escapeHtml(CUSTOMER_PROJECT_LABELS.inspectionRecords)}</h2>
      <dl class="cv-maint-list">
        ${items
          .map(
            (m) =>
              `<dt>${escapeHtml(m.label)}</dt><dd>${escapeHtml(m.value)}</dd>`
          )
          .join("")}
      </dl>
    </section>
  `;
}

export function renderMonitoringAlert(alert) {
  if (!alert) return "";
  return `
    <section class="cv-alert-banner" id="cv-active-alert" data-floor="${escapeHtml(alert.floorId)}">
      <p class="cv-alert-title">🚨 ${escapeHtml(alert.message)}</p>
      <p class="cv-alert-sub">${escapeHtml(alert.subMessage)}</p>
      <p class="cv-alert-time">${escapeHtml(alert.timestamp)}</p>
    </section>
  `;
}

export function renderMonitoringFloors(floors, highlightKey) {
  return (floors || [])
    .map(
      (floor, floorIdx) => `
      <section class="cv-card cv-floor" id="floor-${escapeHtml(floor.floorId)}" data-floor-id="${escapeHtml(floor.floorId)}">
        <h2>${escapeHtml(floor.floorName)}</h2>
        <ul class="cv-sensor-list">
          ${floor.sensors
            .map((s, sensorIdx) => {
              const hlKey = `${floorIdx}-${sensorIdx}`;
              const blink = hlKey === highlightKey ? " cv-sensor-blink" : "";
              const statusClass =
                s.status === "警報"
                  ? "cv-sensor-alert"
                  : s.status === "注意"
                    ? "cv-sensor-warn"
                    : "cv-sensor-ok";
              return `<li class="cv-sensor${blink}" data-hl-key="${escapeHtml(hlKey)}">
                <span class="cv-sensor-name">${s.isCamera ? "📷 " : ""}${escapeHtml(s.sensorName)}</span>
                <span class="cv-sensor-status ${statusClass}">${escapeHtml(s.status)}</span>
              </li>`;
            })
            .join("")}
        </ul>
      </section>`
    )
    .join("");
}

export function renderMonitoringLogs(logs) {
  if (!logs?.length) {
    return `<p class="cv-preparing">履歴はありません</p>`;
  }
  return `
    <ul class="cv-log-list">
      ${logs
        .map(
          (l) =>
            `<li class="${l.isAlert ? "cv-log-alert" : ""}">
              <span class="cv-log-time">${escapeHtml(l.time)}</span>
              <span class="cv-log-place">${escapeHtml(l.place)}</span>
              <span class="cv-log-what">${escapeHtml(l.what)}</span>
            </li>`
        )
        .join("")}
    </ul>
  `;
}

export function renderContactActionsBar(contactActions, fallbackTelHref, fallbackLabel) {
  const actions = contactActions?.length
    ? contactActions
    : fallbackTelHref
      ? [{ id: "phone", emoji: "📞", label: fallbackLabel || CUSTOMER_CONTACT_LABEL, href: fallbackTelHref }]
      : [];
  if (!actions.length) return "";
  return `
    <div class="cv-contact-actions">
      ${actions
        .map(
          (a) =>
            `<a class="cv-btn cv-contact-action" href="${escapeHtml(a.href)}" data-customer-nav ${
              a.id === "phone" || a.href.startsWith("tel:") ? 'data-tel-action="1"' : ""
            }>${escapeHtml(a.emoji)} ${escapeHtml(a.label)}</a>`
        )
        .join("")}
    </div>
  `;
}

export function renderMonitoringContactBar(contactTelHref, contactLabel, contactActions) {
  return renderContactActionsBar(contactActions, contactTelHref, contactLabel);
}

export function bindCustomerNavLinks() {
  document.querySelectorAll("[data-customer-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      if (typeof window.__setCustomerReturnUrl === "function") {
        window.__setCustomerReturnUrl(location.pathname + location.search);
      }
    });
  });
}

export function scrollToFloorAndBlink(floorId, highlightKey) {
  const floor = document.getElementById(`floor-${floorId}`);
  if (floor) {
    floor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (highlightKey) {
    const sensor = document.querySelector(`[data-hl-key="${highlightKey}"]`);
    sensor?.classList.add("cv-sensor-blink");
  }
}

export function findHighlightKey(floors, sensorId, sensorName) {
  if (!floors?.length) return null;
  for (let fi = 0; fi < floors.length; fi += 1) {
    const idx = floors[fi].sensors.findIndex(
      (s) =>
        (sensorId && s.sensorId === sensorId) ||
        (sensorName && s.sensorName === sensorName)
    );
    if (idx >= 0) return `${fi}-${idx}`;
  }
  return null;
}
