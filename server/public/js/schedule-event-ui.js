/** 日程予定の共通表示（週間・日詳細・編集モーダル） */

export function mapsSearchUrl(query) {
  if (!query?.trim()) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

export function formatEventTime(ev) {
  if (ev.allDay) return "終日";
  const parts = [ev.startTime, ev.endTime].filter(Boolean);
  return parts.length ? parts.join("〜") : "";
}

/** Google Calendar の backgroundColor を日程カードへ反映 */
export function eventCalendarColorStyle(ev) {
  const color = ev?.calendarColor?.trim();
  if (!color || !/^#[0-9a-fA-F]{3,8}$/.test(color)) return "";
  return `border-left:4px solid ${color};padding-left:0.45rem;background:linear-gradient(90deg, ${color}18 0%, transparent 55%);`;
}

export function eventCalendarBadgeHtml(ev, { compact = false } = {}) {
  const color = ev?.calendarColor?.trim();
  const label = ev?.calendarSummary?.trim();
  if (!color && !label) return "";
  const swatch = color
    ? `<span class="cal-color-swatch" style="display:inline-block;width:0.55rem;height:0.55rem;border-radius:2px;background:${escapeScheduleHtml(color)};vertical-align:middle;margin-right:0.15rem;"></span>`
    : "";
  const calCls = compact ? "event-cal-name" : "";
  const text = label
    ? `<small class="${calCls}" style="opacity:0.75;">${escapeScheduleHtml(label)}</small>`
    : "";
  return compact
    ? `<div class="event-cal-line">${swatch}${text}</div>`
    : `${swatch}${text} `;
}

export function renderWeekEventItemHtml(ev, { dayDate, catIcon, previewLen = 48 } = {}) {
  const time = formatEventTime(ev);
  const colorStyle = eventCalendarColorStyle(ev);
  const liStyle = colorStyle ? ` style="${colorStyle}"` : "";
  const calBadge = eventCalendarBadgeHtml(ev, { compact: true });
  const desc = renderEventDescriptionHtml(ev.description, `${dayDate}-${ev.id}`, previewLen, {
    compact: true,
  });
  const icon = catIcon?.[ev.category] || "📌";
  return `<li class="schedule-event-item"${liStyle}>
    <span class="schedule-event-icon" aria-hidden="true">${icon}</span>
    <div class="schedule-event-body">
      ${time ? `<div class="event-time-line">${escapeScheduleHtml(time)}</div>` : ""}
      <div class="event-title-line">${escapeScheduleHtml(ev.title)}</div>
      ${calBadge}
      ${desc}
    </div>
  </li>`;
}

export function escapeScheduleHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEventDescriptionHtml(description, eventKey, previewLen = 72, { compact = false } = {}) {
  if (!description?.trim()) return "";
  const text = description.trim();
  const oneLine = text.replace(/\s+/g, " ").trim();
  const maxLen = compact ? Math.min(previewLen, 48) : previewLen;
  const preview = compact ? oneLine.slice(0, maxLen) : linesPreview(text, maxLen);
  const truncated = preview.length < oneLine.length;
  const label = truncated ? "メモ" : "説明";
  const cls = compact ? "event-desc-snippet event-desc-compact" : "event-desc-snippet";
  const prefix = compact ? "" : "<br>";
  return `${prefix}<button type="button" class="${cls}" data-desc-key="${escapeScheduleHtml(eventKey)}" data-desc-full="${escapeScheduleHtml(text)}" data-preview-len="${maxLen}" aria-expanded="false">${label}: ${escapeScheduleHtml(preview)}${truncated ? "…" : ""}</button>`;
}

function linesPreview(text, previewLen) {
  const lines = text.split(/\n/).filter(Boolean);
  return lines.slice(0, 2).join(" ").slice(0, previewLen);
}

export function renderEventLocationHtml(location) {
  if (!location?.trim()) return "";
  const url = mapsSearchUrl(location);
  return `<br><small>📍 ${escapeScheduleHtml(location)}</small>
    <a class="btn-sub btn-small event-map-btn" href="${escapeScheduleHtml(url)}" target="_blank" rel="noopener" style="margin-left:0.25rem;">地図</a>`;
}

export function renderScheduleEventLine(ev, { eventKey, catIcon, catLabel, previewLen = 72 } = {}) {
  const time = formatEventTime(ev);
  const timeHtml = time ? `<span class="event-time" style="opacity:0.8;"> ${escapeScheduleHtml(time)}</span>` : "";
  const loc = renderEventLocationHtml(ev.location);
  const desc = renderEventDescriptionHtml(ev.description, eventKey ?? ev.id, previewLen);
  const icon = catIcon?.[ev.category] || "📌";
  const label = catLabel?.[ev.category] || "";
  const calBadge = eventCalendarBadgeHtml(ev);
  const colorStyle = eventCalendarColorStyle(ev);
  const styleAttr = colorStyle ? ` style="${colorStyle}"` : "";
  return `<p class="schedule-event-line"${styleAttr}>${calBadge}${icon} <strong>${escapeScheduleHtml(label)}</strong>${timeHtml}
    — ${escapeScheduleHtml(ev.title)}${loc}${desc}</p>`;
}

export function bindEventDescSnippets(root) {
  root?.querySelectorAll(".event-desc-snippet").forEach((btn) => {
    if (btn.dataset.descBound === "1") return;
    btn.dataset.descBound = "1";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const full = btn.dataset.descFull || "";
      const expanded = btn.getAttribute("aria-expanded") === "true";
      const previewLen = Number(btn.dataset.previewLen) || 72;
      if (expanded) {
        const oneLine = full.replace(/\s+/g, " ").trim();
        const preview = btn.classList.contains("event-desc-compact")
          ? oneLine.slice(0, previewLen)
          : linesPreview(full, previewLen);
        const truncated = preview.length < oneLine.length;
        btn.innerHTML = `${truncated ? "メモ" : "説明"}: ${escapeScheduleHtml(preview)}${truncated ? "…" : ""}`;
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      btn.innerHTML = `説明: ${escapeScheduleHtml(full).replace(/\n/g, "<br>")}`;
      btn.setAttribute("aria-expanded", "true");
    });
  });
}

export function integrationBadgeClass(label) {
  if (label === "本番連携済み" || label === "同期成功") return "integration-badge live";
  if (label === "仮連携中") return "integration-badge mock";
  if (label === "設定済み・未ログイン" || label === "Googleログイン済み") {
    return "integration-badge pending";
  }
  if (label === "同期失敗") return "integration-badge error";
  return "integration-badge unset";
}

export function renderIntegrationBadges(calendarLabel, mapsLabel, mapsHint) {
  const cal = calendarLabel
    ? `<span class="${integrationBadgeClass(calendarLabel)}" title="Google Calendar">📅 ${escapeScheduleHtml(calendarLabel)}</span>`
    : "";
  const maps = mapsLabel
    ? `<span class="${integrationBadgeClass(mapsLabel)}" title="${escapeScheduleHtml(mapsHint || "")}">🗺 ${escapeScheduleHtml(mapsLabel)}</span>`
    : "";
  return `<div class="integration-badges">${cal}${maps}</div>`;
}

export function renderTravelBlocksHtml(travelBlocks, mapsIntegration) {
  if (!travelBlocks?.length) return "";
  const hint = mapsIntegration?.hint
    ? `<p class="section-hint travel-maps-hint">${escapeScheduleHtml(mapsIntegration.hint)}</p>`
    : "";
  const rows = travelBlocks
    .map((block) => {
      const dur =
        block.durationMin != null
          ? `<strong>${block.durationMin}分</strong>${block.durationSource === "api" ? "（API）" : block.durationSource === "mock" ? "（目安）" : ""}`
          : "—";
      return `<div class="travel-block">
        <div class="travel-block-label">${escapeScheduleHtml(block.label)}</div>
        <div class="travel-block-meta">移動 ${dur}</div>
        <a class="btn-sub btn-small" href="${escapeScheduleHtml(block.mapsUrl)}" target="_blank" rel="noopener">📍ナビ開始</a>
      </div>`;
    })
    .join("");
  return `<p class="section-label">🚗 移動時間</p>${hint}<div class="travel-blocks">${rows}</div>`;
}
