/**
 * ガス事業者向け
 * 建物グループ · ボンベ残量 · Life Care
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kindLabel(kind) {
  if (kind === "detached") return "戸建て";
  if (kind === "apartment") return "アパート";
  if (kind === "shop") return "店舗";
  return kind;
}

async function loadOperator() {
  const res = await fetch("/api/gas-monitor/v1/operator", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込失敗");
  return data.dashboard;
}

function renderSummary(d) {
  document.getElementById("gm-sum-total").textContent =
    String(d.totalProperties);
  document.getElementById("gm-sum-delivery").textContent =
    String(d.deliveryAlertCount);
  document.getElementById("gm-sum-emergency").textContent =
    String(d.emergencyCount);
  const lifeEl = document.getElementById("gm-sum-lifecare");
  if (lifeEl) {
    lifeEl.textContent = String(d.lifeCareAlertCount || 0);
  }
}

function cylinderBars(cylinders) {
  return (cylinders || [])
    .map((c) => {
      const low = c.percent <= 20;
      const active = c.active ? "使用中" : "待機";
      return `
        <div class="gm-cyl-row">
          <div class="gm-cyl-label">
            <span>${c.index}本目（${active}）</span>
            <span>${c.remainingKg.toFixed(1)} / ${c.capacityKg} kg（${c.percent}%）</span>
          </div>
          <div class="gm-bar${low ? " is-low" : ""}" aria-hidden="true">
            <span style="width:${Math.max(2, c.percent)}%"></span>
          </div>
        </div>`;
    })
    .join("");
}

function lifeCareBadge(p) {
  const level = p.lifeCareAlertLevel || "none";
  const emoji = escapeHtml(p.lifeCareEmoji || "🟢");
  const label = escapeHtml(p.lifeCareLabel || "正常生活反応");
  let cls = "gm-lifecare-badge";
  if (level === "warn") cls += " is-warn";
  if (level === "critical") cls += " is-critical";
  return `<span class="${cls}">${emoji} ${label}</span>`;
}

function roomCardHtml(p) {
  let badge = `<span class="gm-badge gm-badge-ok">正常</span>`;
  let cls = "gm-prop-card gm-room-card";
  if (p.emergencyShutoff) {
    badge = `<span class="gm-badge gm-badge-emergency">緊急遮断</span>`;
    cls += " is-emergency";
  } else if (p.lifeCareAlertLevel === "critical") {
    badge = `<span class="gm-badge gm-badge-emergency">見守り警報</span>`;
    cls += " is-lifecare-critical";
  } else if (p.lifeCareAlertLevel === "warn") {
    badge = `<span class="gm-badge gm-badge-delivery">見守り注意</span>`;
    cls += " is-lifecare-warn";
  } else if (p.needsDelivery) {
    badge = `<span class="gm-badge gm-badge-delivery">要配送</span>`;
    cls += " is-delivery";
  }
  const switchNote = p.autoSwitchDetected
    ? `<p class="gm-pulse">⚠ 自動切替を検知</p>`
    : "";
  const mm =
    p.mmWaveDetected != null
      ? `<p class="gm-mmwave">
          ミリ波: ${p.mmWaveDetected ? "反応あり" : "反応なし"}
          · ${escapeHtml(p.mmWaveZone || "unknown")}
          · 滞留 ${Number(p.mmWaveDwellMinutes || 0)}分
        </p>`
      : "";
  return `
    <article class="${cls}" data-property-id="${escapeHtml(p.propertyId)}">
      <div class="gm-prop-head">
        <div>
          <h3 class="gm-prop-name">${escapeHtml(p.roomLabel || p.displayName)}</h3>
          <p class="gm-prop-addr">
            ${escapeHtml(p.displayName)}
            · ${escapeHtml(p.countryCode)}/${escapeHtml(p.currency)}
          </p>
        </div>
        ${badge}
      </div>
      <div class="gm-lifecare-row">${lifeCareBadge(p)}</div>
      <p class="gm-pulse">
        積算パルス: ${Number(p.meterPulseTotal).toLocaleString("ja-JP")}
        · 今日 ${Number(p.todayUsageM3).toFixed(2)} m³
      </p>
      ${switchNote}
      ${mm}
      <div class="gm-cyl">${cylinderBars(p.cylinders)}</div>
    </article>`;
}

function buildingBadges(b) {
  const parts = [];
  if (b.emergencyCount > 0) {
    parts.push(
      `<span class="gm-badge gm-badge-emergency">警報 ${b.emergencyCount}</span>`
    );
  }
  if (b.lifeCareAlertCount > 0) {
    parts.push(
      `<span class="gm-badge gm-badge-lifecare">見守り ${b.lifeCareAlertCount}</span>`
    );
  }
  if (b.deliveryAlertCount > 0) {
    parts.push(
      `<span class="gm-badge gm-badge-delivery">要配送 ${b.deliveryAlertCount}</span>`
    );
  }
  if (!parts.length) {
    parts.push(`<span class="gm-badge gm-badge-ok">正常</span>`);
  }
  return parts.join("");
}

function buildingCardHtml(b, openDefault) {
  const open = openDefault || b.hasPriorityAlert;
  let cls = "gm-building-card";
  if (b.emergencyCount > 0) cls += " is-emergency";
  else if (b.lifeCareAlertCount > 0) cls += " is-lifecare";
  else if (b.deliveryAlertCount > 0) cls += " is-delivery";
  return `
    <details class="${cls}" ${open ? "open" : ""} data-building-id="${escapeHtml(b.buildingId)}">
      <summary class="gm-building-summary">
        <div class="gm-building-summary-main">
          <h2 class="gm-building-name">${escapeHtml(b.buildingName)}</h2>
          <p class="gm-building-meta">
            ${escapeHtml(b.addressLabel)}
            · ${kindLabel(b.kind)}
            · ${escapeHtml(b.countryCode)}/${escapeHtml(b.currency)}
            · 総部屋数 ${b.totalRooms}
          </p>
        </div>
        <div class="gm-building-badges">${buildingBadges(b)}</div>
        <span class="gm-building-chevron" aria-hidden="true">▼</span>
      </summary>
      <div class="gm-building-rooms">
        ${(b.rooms || []).map(roomCardHtml).join("")}
      </div>
    </details>`;
}

function renderList(d) {
  const root = document.getElementById("gm-prop-list");
  const buildings = d.buildings || [];
  if (!buildings.length) {
    // フォールバック: 旧フラット一覧
    const rows = d.properties || [];
    if (!rows.length) {
      root.innerHTML = `<p class="gm-empty">登録物件がありません</p>`;
      return;
    }
    root.innerHTML = rows.map(roomCardHtml).join("");
    return;
  }
  root.innerHTML = buildings
    .map((b, i) => buildingCardHtml(b, i === 0 && b.hasPriorityAlert))
    .join("");
}

function renderMappedPorts(d) {
  const root = document.getElementById("gm-mapped-port-list");
  const devices = d.mappedDevices || [];
  if (!devices.length) {
    root.innerHTML =
      `<p class="gm-empty">使用中の現場ポートはありません</p>`;
    return;
  }
  root.innerHTML = devices
    .map(
      (device) => `
        <article class="gm-mapped-device">
          <div class="gm-mapped-device-head">
            <strong>${escapeHtml(device.deviceId)}</strong>
            <span>${escapeHtml(device.propertyId)}</span>
          </div>
          <div class="gm-mapped-port-grid">
            ${(device.ports || [])
              .map(
                (port) => `
                  <div class="gm-mapped-port">
                    <b>${port.portType}${port.portNumber}</b>
                    <span>${escapeHtml(port.label)}</span>
                    <small>
                      ${
                        port.operationMode === "pulse"
                          ? `${port.pulseWeight} ${escapeHtml(port.pulseUnit)}`
                          : "状態・遮断監視"
                      }
                    </small>
                  </div>`
              )
              .join("")}
          </div>
        </article>`
    )
    .join("");
}

async function refresh() {
  const d = await loadOperator();
  renderSummary(d);
  renderList(d);
  renderMappedPorts(d);
}

document.addEventListener("DOMContentLoaded", () => {
  const back = document.getElementById("gm-back-link");
  if (back) back.href = "/app";
  refresh().catch((err) => {
    console.error(err);
    const root = document.getElementById("gm-prop-list");
    if (root) {
      root.innerHTML =
        `<p class="gm-empty">読み込みに失敗しました</p>`;
    }
  });
});
