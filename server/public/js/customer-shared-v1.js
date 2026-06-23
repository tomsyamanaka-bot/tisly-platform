/**
 * お客様 UI 描画ロジック — DOM 操作を集約（React Native 移植時は差し替え）
 */

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHomeStatus(data) {
  return `
    <section class="cv-hero">
      <p class="cv-hero-property">${escapeHtml(data.propertyName)}</p>
      <div class="cv-status-row">
        <span class="cv-status-big">${escapeHtml(data.systemStatusEmoji)} ${escapeHtml(data.systemStatusLabel)}</span>
      </div>
      <p class="cv-last-checked">${escapeHtml(data.lastCheckedLabel)}：${escapeHtml(data.lastCheckedAt)}</p>
    </section>
  `;
}

export function renderHomeCards(cards) {
  return `
    <section class="cv-card-grid">
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
      <h2>写真</h2>
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

export function renderMaintenance(items) {
  if (!items?.length) return "";
  return `
    <section class="cv-card" id="maintenance">
      <h2>点検・保守情報</h2>
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

export function renderContact(contact) {
  const c = contact || {};
  return `
    <section class="cv-card cv-contact" id="contact">
      <h2>トムズへ連絡</h2>
      <dl>
        <dt>会社名</dt><dd>${escapeHtml(c.companyName || "株式会社TOMS")}</dd>
        ${c.phone ? `<dt>TEL</dt><dd><a class="cv-tel" href="tel:${escapeHtml(c.phone.replace(/-/g, ""))}">${escapeHtml(c.phone)}</a></dd>` : ""}
        ${c.staffName ? `<dt>担当</dt><dd>${escapeHtml(c.staffName)}</dd>` : ""}
      </dl>
      ${c.phone ? `<a class="cv-btn" href="tel:${escapeHtml(c.phone.replace(/-/g, ""))}">📞 トムズへ連絡</a>` : ""}
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

export function renderMonitoringFloors(floors, highlightId) {
  return (floors || [])
    .map(
      (floor) => `
      <section class="cv-card cv-floor" id="floor-${escapeHtml(floor.floorId)}" data-floor-id="${escapeHtml(floor.floorId)}">
        <h2>${escapeHtml(floor.floorName)}</h2>
        <ul class="cv-sensor-list">
          ${floor.sensors
            .map((s) => {
              const blink = s.sensorId === highlightId ? " cv-sensor-blink" : "";
              const statusClass =
                s.status === "警報"
                  ? "cv-sensor-alert"
                  : s.status === "注意"
                    ? "cv-sensor-warn"
                    : "cv-sensor-ok";
              return `<li class="cv-sensor${blink}" data-sensor-id="${escapeHtml(s.sensorId)}">
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

export function renderMonitoringLogs(logs, title) {
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

export function bindCustomerNavLinks() {
  document.querySelectorAll("[data-customer-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      if (typeof window.__setCustomerReturnUrl === "function") {
        window.__setCustomerReturnUrl(location.pathname + location.search);
      }
    });
  });
}

export function scrollToFloorAndBlink(floorId, sensorId) {
  const floor = document.getElementById(`floor-${floorId}`);
  if (floor) {
    floor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (sensorId) {
    const sensor = document.querySelector(`[data-sensor-id="${sensorId}"]`);
    sensor?.classList.add("cv-sensor-blink");
  }
}
