/** 日程予定の共通表示（週間・日詳細・編集モーダル） */

export function mapsSearchUrl(query) {
  if (!query?.trim()) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

export function mapsNavUrl(destination) {
  if (!destination?.trim()) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.trim())}&travelmode=driving`;
}

/** 現場リンク — 緯度経度 > 住所 > 現場名 */
export function resolveSiteMapsUrl({ lat, lng, address, siteName } = {}) {
  const latNum = lat != null ? Number(lat) : NaN;
  const lngNum = lng != null ? Number(lng) : NaN;
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}&travelmode=driving`;
  }
  const addr = address?.trim();
  if (addr) return mapsSearchUrl(addr);
  const name = siteName?.trim();
  if (name) return mapsSearchUrl(name);
  return "";
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

export function renderWeekEventItemHtml(ev, { dayDate, catIcon, previewLen = 48, practical = false } = {}) {
  const time = formatEventTime(ev);
  if (practical) {
    const liStyle = eventCalendarColorStyle(ev);
    const styleAttr = liStyle ? ` style="${liStyle.replace(/border-left:[^;]+;?/, "")}"` : "";
    return `<li class="schedule-event-item schedule-event-practical"${styleAttr}>
      <div class="schedule-event-body">
        ${time ? `<div class="event-time-line">${escapeScheduleHtml(time)}</div>` : ""}
        <div class="event-title-line">${escapeScheduleHtml(ev.title)}</div>
      </div>
    </li>`;
  }
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
  return `<br><a class="event-map-link" href="${escapeScheduleHtml(url)}" target="_blank" rel="noopener"><small>📍 ${escapeScheduleHtml(location)}</small></a>`;
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

export function renderNavIconButton(mapsUrl, { title = "ナビ開始" } = {}) {
  if (!mapsUrl) {
    return `<span class="schedule-nav-icon-btn schedule-nav-icon-disabled" title="ナビ不可" aria-hidden="true">🧭</span>`;
  }
  return `<a class="schedule-nav-icon-btn" href="${escapeScheduleHtml(mapsUrl)}" target="_blank" rel="noopener" title="${escapeScheduleHtml(title)}" aria-label="${escapeScheduleHtml(title)}">🧭</a>`;
}

export function renderTravelBlocksHtml(travelBlocks, mapsIntegration) {
  if (!travelBlocks?.length) {
    if (!mapsIntegration?.apiConfigured) {
      const hint = mapsIntegration?.hint || "Google Maps API\u672a\u8a2d\u5b9a";
      return `<p class="section-label">🚗 移動時間</p><p class="section-hint travel-maps-hint">${escapeScheduleHtml(hint)}</p>`;
    }
    return "";
  }
  const hint = !mapsIntegration?.apiConfigured
    ? `<p class="section-hint travel-maps-hint">${escapeScheduleHtml(mapsIntegration?.hint || "Google Maps API\u672a\u8a2d\u5b9a")}</p>`
    : mapsIntegration?.hint
      ? `<p class="section-hint travel-maps-hint">${escapeScheduleHtml(mapsIntegration.hint)}</p>`
      : "";
  const rows = travelBlocks
    .map((block, i) => {
      const dur =
        block.durationMin != null
          ? `<strong>${block.durationMin}分</strong>${block.durationSource === "api" ? "（API）" : block.durationSource === "mock" ? "（目安）" : ""}`
          : "—";
      const inner = `<div class="travel-block-head">
          <div class="travel-block-label">${escapeScheduleHtml(block.label)}</div>
          <div class="travel-block-meta">🚗 ${dur} 🧭</div>
        </div>`;
      const mapsUrl = block.mapsUrl?.trim();
      if (mapsUrl) {
        return `<a class="travel-block travel-block-link" data-travel-block="${i}" href="${escapeScheduleHtml(mapsUrl)}" target="_blank" rel="noopener" aria-label="Googleマップでナビ">${inner}</a>`;
      }
      return `<div class="travel-block" data-travel-block="${i}">${inner}</div>`;
    })
    .join("");
  return `<p class="section-label">🚗 移動時間</p>${hint}<div class="travel-blocks">${rows}</div>`;
}

export function bindTravelBlockLinks(root) {
  root?.querySelectorAll(".travel-block-link, .event-map-link").forEach((el) => {
    el.addEventListener("click", (ev) => ev.stopPropagation());
    el.addEventListener("touchstart", (ev) => ev.stopPropagation(), { passive: true });
  });
}
