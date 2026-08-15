/**
 * ガス事業者向け
 * 建物グループ · ボンベ残量 · Life Care
 * 3秒ポーリングは差分更新のみ
 * （開いた詳細カードは閉じない）
 */

import { createAccordionStateV1 } from "./gas-monitor-accordion-state-v1.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let refreshInFlight = false;

// 建物カードの開閉状態（openPropertyIds）
const accordion = createAccordionStateV1("operator");

// innerHTML の再設定を最小化するキャッシュ
const htmlCache = new WeakMap();

function setText(el, text) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
}

function setClassName(el, cls) {
  if (!el) return;
  if (el.className !== cls) el.className = cls;
}

function setHidden(el, hidden) {
  if (!el) return;
  if (el.hidden !== hidden) el.hidden = hidden;
}

function setHtmlCached(el, html) {
  if (!el) return;
  if (htmlCache.get(el) === html) return;
  el.innerHTML = html;
  htmlCache.set(el, html);
}

function collectByKey(root, selector, datasetKey) {
  const map = new Map();
  root.querySelectorAll(selector).forEach((el) => {
    const key = el.dataset[datasetKey];
    if (key) map.set(key, el);
  });
  return map;
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
  setText(
    document.getElementById("gm-sum-total"),
    String(d.totalProperties)
  );
  setText(
    document.getElementById("gm-sum-delivery"),
    String(d.deliveryAlertCount)
  );
  setText(
    document.getElementById("gm-sum-emergency"),
    String(d.emergencyCount)
  );
  setText(
    document.getElementById("gm-sum-lifecare"),
    String(d.lifeCareAlertCount || 0)
  );
}

function meterText(value) {
  return Number(value).toLocaleString("ja-JP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function cylinderSignature(cylinders) {
  return (cylinders || []).map((c) => c.index).join("|");
}

function cylinderStateText(c) {
  return `${c.index}本目（${c.active ? "使用中" : "待機"}）`;
}

function cylinderValueText(c) {
  const remaining = Number(c.remainingKg).toFixed(1);
  return `${remaining} / ${c.capacityKg} kg（${c.percent}%）`;
}

function cylinderBarClass(c) {
  return `gm-bar${c.percent <= 20 ? " is-low" : ""}`;
}

function cylinderBarWidth(c) {
  return `${Math.max(2, c.percent)}%`;
}

function cylinderBars(cylinders) {
  return (cylinders || [])
    .map(
      (c) => `
        <div class="gm-cyl-row">
          <div class="gm-cyl-label">
            <span data-gm-role="cyl-state">${escapeHtml(
              cylinderStateText(c)
            )}</span>
            <span data-gm-role="cyl-value">${escapeHtml(
              cylinderValueText(c)
            )}</span>
          </div>
          <div class="${cylinderBarClass(
            c
          )}" data-gm-role="cyl-bar" aria-hidden="true">
            <span style="width:${cylinderBarWidth(c)}"></span>
          </div>
        </div>`
    )
    .join("");
}

/** ボンベ残量は数値・バー幅のみ差分更新 */
function patchCylinders(el, cylinders) {
  if (!el) return;
  const rows = cylinders || [];
  const signature = cylinderSignature(rows);
  if (el.dataset.cylSignature !== signature) {
    el.innerHTML = cylinderBars(rows);
    el.dataset.cylSignature = signature;
    return;
  }
  const rowEls = el.querySelectorAll(".gm-cyl-row");
  rows.forEach((c, i) => {
    const rowEl = rowEls[i];
    if (!rowEl) return;
    setText(
      rowEl.querySelector('[data-gm-role="cyl-state"]'),
      cylinderStateText(c)
    );
    setText(
      rowEl.querySelector('[data-gm-role="cyl-value"]'),
      cylinderValueText(c)
    );
    const bar = rowEl.querySelector('[data-gm-role="cyl-bar"]');
    setClassName(bar, cylinderBarClass(c));
    const fill = bar ? bar.firstElementChild : null;
    if (fill) {
      const width = cylinderBarWidth(c);
      if (fill.style.width !== width) fill.style.width = width;
    }
  });
}

function lifeCareBadgeClass(p) {
  const level = p.lifeCareAlertLevel || "none";
  let cls = "gm-lifecare-badge";
  if (level === "warn") cls += " is-warn";
  if (level === "critical") cls += " is-critical";
  return cls;
}

function lifeCareBadgeText(p) {
  const emoji = p.lifeCareEmoji || "🟢";
  const label = p.lifeCareLabel || "正常生活反応";
  return `${emoji} ${label}`;
}

function roomBadge(p) {
  if (p.emergencyShutoff) {
    return { cls: "gm-badge gm-badge-emergency", text: "緊急遮断" };
  }
  if (p.lifeCareAlertLevel === "critical") {
    return { cls: "gm-badge gm-badge-emergency", text: "見守り警報" };
  }
  if (p.lifeCareAlertLevel === "warn") {
    return { cls: "gm-badge gm-badge-delivery", text: "見守り注意" };
  }
  if (p.needsDelivery) {
    return { cls: "gm-badge gm-badge-delivery", text: "要配送" };
  }
  return { cls: "gm-badge gm-badge-ok", text: "正常" };
}

function roomCardClass(p) {
  let cls = "gm-prop-card gm-room-card";
  if (p.emergencyShutoff) cls += " is-emergency";
  else if (p.lifeCareAlertLevel === "critical") {
    cls += " is-lifecare-critical";
  } else if (p.lifeCareAlertLevel === "warn") {
    cls += " is-lifecare-warn";
  } else if (p.needsDelivery) cls += " is-delivery";
  return cls;
}

function roomAddrText(p) {
  return `${p.displayName} · ${p.countryCode}/${p.currency}`;
}

function roomPulseText(p) {
  const pulse = Number(p.meterPulseTotal).toLocaleString("ja-JP");
  const today = Number(p.todayUsageM3).toFixed(2);
  const meter =
    p.currentMeterValue == null
      ? ""
      : ` · 現在のメーター指針値 ${meterText(p.currentMeterValue)} m³`;
  return `積算パルス: ${pulse} · 今日 ${today} m³${meter}`;
}

function roomMmWaveText(p) {
  const detected = p.mmWaveDetected ? "反応あり" : "反応なし";
  const zone = p.mmWaveZone || "unknown";
  const dwell = Number(p.mmWaveDwellMinutes || 0);
  return `ミリ波: ${detected} · ${zone} · 滞留 ${dwell}分`;
}

function roomCardHtml(p) {
  const badge = roomBadge(p);
  const hasMmWave = p.mmWaveDetected != null;
  return `
    <article class="${roomCardClass(p)}" data-property-id="${escapeHtml(
      p.propertyId
    )}">
      <div class="gm-prop-head">
        <div>
          <h3 class="gm-prop-name" data-gm-role="room-name">${escapeHtml(
            p.roomLabel || p.displayName
          )}</h3>
          <p class="gm-prop-addr" data-gm-role="room-addr">${escapeHtml(
            roomAddrText(p)
          )}</p>
        </div>
        <span class="${badge.cls}" data-gm-role="room-badge">${
          badge.text
        }</span>
      </div>
      <div class="gm-lifecare-row">
        <span class="${lifeCareBadgeClass(
          p
        )}" data-gm-role="lifecare-badge">${escapeHtml(
          lifeCareBadgeText(p)
        )}</span>
      </div>
      <p class="gm-pulse" data-gm-role="pulse">${escapeHtml(
        roomPulseText(p)
      )}</p>
      <p class="gm-pulse" data-gm-role="switch"${
        p.autoSwitchDetected ? "" : " hidden"
      }>⚠ 自動切替を検知</p>
      <p class="gm-mmwave" data-gm-role="mmwave"${
        hasMmWave ? "" : " hidden"
      }>${hasMmWave ? escapeHtml(roomMmWaveText(p)) : ""}</p>
      <div class="gm-cyl" data-gm-role="cyl" data-cyl-signature="${escapeHtml(
        cylinderSignature(p.cylinders)
      )}">${cylinderBars(p.cylinders)}</div>
    </article>`;
}

/** 部屋カードは数値・ステータスのみ差分更新 */
function patchRoomCard(el, p) {
  setClassName(el, roomCardClass(p));
  setText(
    el.querySelector('[data-gm-role="room-name"]'),
    p.roomLabel || p.displayName
  );
  setText(
    el.querySelector('[data-gm-role="room-addr"]'),
    roomAddrText(p)
  );
  const badge = roomBadge(p);
  const badgeEl = el.querySelector('[data-gm-role="room-badge"]');
  setClassName(badgeEl, badge.cls);
  setText(badgeEl, badge.text);
  const lifeCareEl = el.querySelector(
    '[data-gm-role="lifecare-badge"]'
  );
  setClassName(lifeCareEl, lifeCareBadgeClass(p));
  setText(lifeCareEl, lifeCareBadgeText(p));
  setText(el.querySelector('[data-gm-role="pulse"]'), roomPulseText(p));
  setHidden(
    el.querySelector('[data-gm-role="switch"]'),
    !p.autoSwitchDetected
  );
  const mmWaveEl = el.querySelector('[data-gm-role="mmwave"]');
  const hasMmWave = p.mmWaveDetected != null;
  setHidden(mmWaveEl, !hasMmWave);
  if (hasMmWave) setText(mmWaveEl, roomMmWaveText(p));
  patchCylinders(el.querySelector('[data-gm-role="cyl"]'), p.cylinders);
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

function buildingCardClass(b) {
  let cls = "gm-building-card";
  if (b.emergencyCount > 0) cls += " is-emergency";
  else if (b.lifeCareAlertCount > 0) cls += " is-lifecare";
  else if (b.deliveryAlertCount > 0) cls += " is-delivery";
  return cls;
}

function buildingMetaText(b) {
  return [
    b.addressLabel,
    kindLabel(b.kind),
    `${b.countryCode}/${b.currency}`,
    `総部屋数 ${b.totalRooms}`,
  ].join(" · ");
}

function roomSignature(rooms) {
  return (rooms || []).map((r) => r.propertyId).join("|");
}

function buildingCardHtml(b, openDefault) {
  // 保持中の開閉状態を優先し初期展開は一度だけ
  const open = accordion.shouldOpen(
    b.buildingId,
    openDefault || b.hasPriorityAlert
  );
  const id = escapeHtml(b.buildingId);
  return `
    <details class="${buildingCardClass(b)}" ${
      open ? "open" : ""
    } data-building-id="${id}" data-accordion-id="${id}">
      <summary class="gm-building-summary">
        <div class="gm-building-summary-main">
          <h2 class="gm-building-name" data-gm-role="building-name">${escapeHtml(
            b.buildingName
          )}</h2>
          <p class="gm-building-meta" data-gm-role="building-meta">${escapeHtml(
            buildingMetaText(b)
          )}</p>
        </div>
        <div class="gm-building-badges" data-gm-role="building-badges">${buildingBadges(
          b
        )}</div>
        <span class="gm-building-chevron" aria-hidden="true">▼</span>
      </summary>
      <div class="gm-building-rooms" data-gm-role="rooms" data-room-signature="${escapeHtml(
        roomSignature(b.rooms)
      )}">
        ${(b.rooms || []).map(roomCardHtml).join("")}
      </div>
    </details>`;
}

/** 建物カードは open 属性を触らず中身のみ更新 */
function patchBuildingCard(el, b) {
  setClassName(el, buildingCardClass(b));
  setText(
    el.querySelector('[data-gm-role="building-name"]'),
    b.buildingName
  );
  setText(
    el.querySelector('[data-gm-role="building-meta"]'),
    buildingMetaText(b)
  );
  setHtmlCached(
    el.querySelector('[data-gm-role="building-badges"]'),
    buildingBadges(b)
  );
  const roomsEl = el.querySelector('[data-gm-role="rooms"]');
  if (!roomsEl) return;
  const rooms = b.rooms || [];
  const signature = roomSignature(rooms);
  if (roomsEl.dataset.roomSignature !== signature) {
    roomsEl.innerHTML = rooms.map(roomCardHtml).join("");
    roomsEl.dataset.roomSignature = signature;
    return;
  }
  const cards = collectByKey(
    roomsEl,
    "article[data-property-id]",
    "propertyId"
  );
  rooms.forEach((room) => {
    const card = cards.get(room.propertyId);
    if (card) patchRoomCard(card, room);
  });
}

const EMPTY_LIST_HTML = `
        <div class="gm-empty">
          <p>登録されている物件はありません。</p>
          <a class="gm-register-button" href="/device-binding-v1">
            ＋ 機器を新規登録する
          </a>
        </div>`;

/** 建物グループが無い場合の旧フラット一覧 */
function renderFlatList(root, rows) {
  if (!rows.length) {
    if (root.dataset.gmSignature !== "empty") {
      root.innerHTML = EMPTY_LIST_HTML;
      root.dataset.gmSignature = "empty";
    }
    return;
  }
  const signature = `flat:${roomSignature(rows)}`;
  if (root.dataset.gmSignature !== signature) {
    root.innerHTML = rows.map(roomCardHtml).join("");
    root.dataset.gmSignature = signature;
    return;
  }
  const cards = collectByKey(
    root,
    "article[data-property-id]",
    "propertyId"
  );
  rows.forEach((row) => {
    const card = cards.get(row.propertyId);
    if (card) patchRoomCard(card, row);
  });
}

function renderList(d) {
  const root = document.getElementById("gm-prop-list");
  if (!root) return;
  const buildings = d.buildings || [];
  if (!buildings.length) {
    renderFlatList(root, d.properties || []);
    return;
  }
  const signature = `bld:${buildings
    .map((b) => b.buildingId)
    .join("|")}`;
  if (root.dataset.gmSignature !== signature) {
    root.innerHTML = buildings
      .map((b, i) => buildingCardHtml(b, i === 0 && b.hasPriorityAlert))
      .join("");
    root.dataset.gmSignature = signature;
    return;
  }
  const cards = collectByKey(
    root,
    "details[data-building-id]",
    "buildingId"
  );
  buildings.forEach((b) => {
    const card = cards.get(b.buildingId);
    if (card) patchBuildingCard(card, b);
  });
  // 念のため開閉状態を復元
  accordion.restore(root);
}

function mappedPortsHtml(devices) {
  return devices
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
                          ? `現在のメーター指針値 ${meterText(
                              port.currentMeterValue ??
                                port.initialMeterValue
                            )} m³`
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

function renderMappedPorts(d) {
  const root = document.getElementById("gm-mapped-port-list");
  if (!root) return;
  const devices = d.mappedDevices || [];
  if (!devices.length) {
    setHtmlCached(
      root,
      `<p class="gm-empty">使用中の現場ポートはありません</p>`
    );
    return;
  }
  // 変化が無ければ DOM を触らない
  setHtmlCached(root, mappedPortsHtml(devices));
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const d = await loadOperator();
    renderSummary(d);
    renderList(d);
    renderMappedPorts(d);
  } finally {
    refreshInFlight = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const back = document.getElementById("gm-back-link");
  if (back) back.href = "/app";
  accordion.track(document.getElementById("gm-prop-list"));
  refresh().catch((err) => {
    console.error(err);
    const root = document.getElementById("gm-prop-list");
    if (root) {
      root.innerHTML =
        `<p class="gm-empty">読み込みに失敗しました</p>`;
      root.dataset.gmSignature = "error";
    }
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh().catch(console.error);
    }
  }, 3000);
});
