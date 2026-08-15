/**
 * ガス事業者向け
 * 建物グループ · ボンベ残量 · Life Care
 * 3秒ポーリングでは DOM を作り直さず
 * 数値・バッジのテキストだけを更新する
 * （開いた詳細カードは絶対に閉じない）
 */

import { createAccordionStateV1 } from "./gas-monitor-accordion-state-v1.js?v=2452";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let refreshInFlight = false;
let selectedPropertyId = "";
let selectedPropertyName = "";
let latestDashboard = null;

// 建物カードの開閉状態（openPropertyIds）
const accordion = createAccordionStateV1("operator");

/** 断片HTMLから要素を1つ作る（画面外生成） */
function elFromHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html).trim();
  return tpl.content.firstElementChild;
}

function removeAllChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

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

/** CSS の display を打ち消さない表示切替 */
function setDisplayNone(el, hidden) {
  if (!el) return;
  const next = hidden ? "none" : "";
  if (el.style.display !== next) el.style.display = next;
}

/**
 * キー付き子要素を追加・並び替え・削除で同期
 * 既存要素は再生成しないので状態が残る
 */
function syncKeyedChildren(options) {
  const {
    parent,
    items,
    selector,
    datasetKey,
    keyOf,
    create,
    patch,
  } = options;
  if (!parent) return;
  const existing = new Map();
  parent.querySelectorAll(selector).forEach((el) => {
    const key = el.dataset[datasetKey];
    if (key) existing.set(key, el);
  });
  // 同一キーが複数来ても取り違えない
  const seen = new Map();
  items.forEach((item, index) => {
    const base = keyOf(item, index);
    const dup = seen.get(base) || 0;
    seen.set(base, dup + 1);
    const key = dup ? `${base}#${dup}` : base;
    let el = existing.get(key);
    if (el) existing.delete(key);
    else el = create(item, index);
    if (!el) return;
    if (el.dataset[datasetKey] !== key) {
      el.dataset[datasetKey] = key;
    }
    patch(el, item);
    const current = parent.children[index];
    if (current !== el) parent.insertBefore(el, current || null);
  });
  existing.forEach((el) => el.remove());
}

/** 一覧の表示モードが変わる時だけ作り直す */
function ensureListMode(root, mode) {
  if (root.dataset.gmMode === mode) return false;
  removeAllChildren(root);
  root.dataset.gmMode = mode;
  return true;
}

function setPlaceholder(root, mode, html) {
  if (!ensureListMode(root, mode)) return;
  const el = elFromHtml(html);
  if (el) root.appendChild(el);
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

function cylinderRowHtml(c) {
  return `
    <div class="gm-cyl-row" data-cyl-index="${escapeHtml(c.index)}">
      <div class="gm-cyl-label">
        <span data-gm-role="cyl-state">${escapeHtml(
          cylinderStateText(c)
        )}</span>
        <span class="meter-value-text" data-gm-role="cyl-value">${escapeHtml(
          cylinderValueText(c)
        )}</span>
      </div>
      <div class="${cylinderBarClass(
        c
      )}" data-gm-role="cyl-bar" aria-hidden="true">
        <span style="width:${cylinderBarWidth(c)}"></span>
      </div>
    </div>`;
}

/** ボンベ残量は数値・バー幅のみ差分更新 */
function patchCylinderRow(rowEl, c) {
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
}

function syncCylinders(el, cylinders) {
  syncKeyedChildren({
    parent: el,
    items: cylinders || [],
    selector: ".gm-cyl-row[data-cyl-index]",
    datasetKey: "cylIndex",
    keyOf: (c) => String(c.index),
    create: (c) => elFromHtml(cylinderRowHtml(c)),
    patch: patchCylinderRow,
  });
}

function lifeCareBadgeClass(p) {
  const level = p.lifeCareAlertLevel || "none";
  let cls = "gm-lifecare-badge status-badge";
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
    return {
      cls: "gm-badge gm-badge-emergency status-badge",
      text: "緊急遮断",
    };
  }
  if (p.lifeCareAlertLevel === "critical") {
    return {
      cls: "gm-badge gm-badge-emergency status-badge",
      text: "見守り警報",
    };
  }
  if (p.lifeCareAlertLevel === "warn") {
    return {
      cls: "gm-badge gm-badge-delivery status-badge",
      text: "見守り注意",
    };
  }
  if (p.needsDelivery) {
    return {
      cls: "gm-badge gm-badge-delivery status-badge",
      text: "要配送",
    };
  }
  return { cls: "gm-badge gm-badge-ok status-badge", text: "正常" };
}

function roomCardClass(p) {
  let cls = "gm-prop-card gm-room-card";
  if (p.emergencyShutoff) cls += " is-emergency";
  else if (p.lifeCareAlertLevel === "critical") {
    cls += " is-lifecare-critical";
  } else if (p.lifeCareAlertLevel === "warn") {
    cls += " is-lifecare-warn";
  } else if (p.needsDelivery) cls += " is-delivery";
  if (selectedPropertyId === p.propertyId) cls += " is-selected";
  return cls;
}

function roomAddrText(p) {
  return `${p.displayName} · ${p.countryCode}/${p.currency}`;
}

function roomPulseText(p) {
  const pulse = Number(p.meterPulseTotal).toLocaleString("ja-JP");
  const today = Number(p.todayUsageM3).toFixed(2);
  return `積算パルス: ${pulse} · 今日 ${today} m³`;
}

function roomMeterText(p) {
  if (p.currentMeterValue == null) return "";
  return ` · 現在のメーター指針値 ${meterText(
    p.currentMeterValue
  )} m³`;
}

function roomMmWaveText(p) {
  const detected = p.mmWaveDetected ? "反応あり" : "反応なし";
  const zone = p.mmWaveZone || "unknown";
  const dwell = Number(p.mmWaveDwellMinutes || 0);
  return `ミリ波: ${detected} · ${zone} · 滞留 ${dwell}分`;
}

function lastSeenText(lastSeenAt) {
  if (!lastSeenAt) return "通信待ち";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000)
  );
  if (seconds < 60) return `${seconds}秒前`;
  return `${Math.floor(seconds / 60)}分前`;
}

function roomOnlineText(p) {
  const mark = p.deviceOnline ? "🟢 実機オンライン" : "⚪ 実機オフライン";
  return `${mark}（最終通信: ${lastSeenText(p.lastSeenAt)}）`;
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
        <div class="gm-property-actions">
          <span class="${badge.cls}" data-gm-role="room-badge">${
            badge.text
          }</span>
          <button
            class="gm-delete-property-button"
            type="button"
            data-delete-property
            data-property-id="${escapeHtml(p.propertyId)}"
            data-property-name="${escapeHtml(p.displayName)}"
          >🗑️ 物件を削除</button>
        </div>
      </div>
      <div class="gm-lifecare-row">
        <span class="${lifeCareBadgeClass(
          p
        )}" data-gm-role="lifecare-badge">${escapeHtml(
          lifeCareBadgeText(p)
        )}</span>
      </div>
      <p class="gm-pulse">
        <span class="pulse-count-text" data-gm-role="pulse">${escapeHtml(
          roomPulseText(p)
        )}</span>
        <span class="meter-value-text" data-gm-role="meter">${escapeHtml(
          roomMeterText(p)
        )}</span>
      </p>
      <p class="gm-device-online" data-gm-role="device-online">${escapeHtml(
        roomOnlineText(p)
      )}</p>
      <p class="gm-pulse" data-gm-role="switch"${
        p.autoSwitchDetected ? "" : " hidden"
      }>⚠ 自動切替を検知</p>
      <p class="gm-mmwave" data-gm-role="mmwave"${
        hasMmWave ? "" : " hidden"
      }>${hasMmWave ? escapeHtml(roomMmWaveText(p)) : ""}</p>
      <div class="gm-cyl" data-gm-role="cyl">${(p.cylinders || [])
        .map(cylinderRowHtml)
        .join("")}</div>
      <button
        class="gm-select-property-button"
        type="button"
        data-select-property
        data-property-id="${escapeHtml(p.propertyId)}"
        data-property-name="${escapeHtml(p.displayName)}"
      >この物件のポート設定を見る</button>
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
  setText(el.querySelector('[data-gm-role="meter"]'), roomMeterText(p));
  setText(
    el.querySelector('[data-gm-role="device-online"]'),
    roomOnlineText(p)
  );
  setHidden(
    el.querySelector('[data-gm-role="switch"]'),
    !p.autoSwitchDetected
  );
  const mmWaveEl = el.querySelector('[data-gm-role="mmwave"]');
  const hasMmWave = p.mmWaveDetected != null;
  setHidden(mmWaveEl, !hasMmWave);
  if (hasMmWave) setText(mmWaveEl, roomMmWaveText(p));
  syncCylinders(el.querySelector('[data-gm-role="cyl"]'), p.cylinders);
  const selectButton = el.querySelector("[data-select-property]");
  if (selectButton) {
    selectButton.dataset.propertyId = p.propertyId;
    selectButton.dataset.propertyName = p.displayName;
  }
}

const BUILDING_BADGES = [
  {
    key: "emergency",
    cls: "gm-badge gm-badge-emergency status-badge",
    label: "警報",
    pick: (b) => Number(b.emergencyCount || 0),
  },
  {
    key: "lifecare",
    cls: "gm-badge gm-badge-lifecare status-badge",
    label: "見守り",
    pick: (b) => Number(b.lifeCareAlertCount || 0),
  },
  {
    key: "delivery",
    cls: "gm-badge gm-badge-delivery status-badge",
    label: "要配送",
    pick: (b) => Number(b.deliveryAlertCount || 0),
  },
];

function isBuildingNormal(b) {
  return BUILDING_BADGES.every((def) => def.pick(b) <= 0);
}

function buildingBadgesHtml(b) {
  const parts = BUILDING_BADGES.map((def) => {
    const count = def.pick(b);
    const hide = count > 0 ? "" : ' style="display:none"';
    return `<span class="${def.cls}" data-gm-badge="${def.key}"${hide}>${def.label} ${count}</span>`;
  });
  const normal = isBuildingNormal(b);
  parts.push(
    `<span class="gm-badge gm-badge-ok status-badge" data-gm-badge="ok"${
      normal ? "" : ' style="display:none"'
    }>正常</span>`
  );
  return parts.join("");
}

/** バッジは差し替えず表示・件数のみ更新 */
function patchBuildingBadges(root, b) {
  if (!root) return;
  BUILDING_BADGES.forEach((def) => {
    const el = root.querySelector(`[data-gm-badge="${def.key}"]`);
    const count = def.pick(b);
    setDisplayNone(el, count <= 0);
    if (count > 0) setText(el, `${def.label} ${count}`);
  });
  setDisplayNone(
    root.querySelector('[data-gm-badge="ok"]'),
    !isBuildingNormal(b)
  );
}

function buildingCardClass(b) {
  let cls = "gm-building-card";
  if (b.emergencyCount > 0) cls += " is-emergency";
  else if (b.lifeCareAlertCount > 0) cls += " is-lifecare";
  else if (b.deliveryAlertCount > 0) cls += " is-delivery";
  if (accordion.openPropertyIds.has(b.buildingId)) {
    cls += " is-expanded";
  }
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

function buildingCardHtml(b, openDefault) {
  // 保持中の開閉状態を優先し初期展開は一度だけ
  const open = accordion.shouldOpen(
    b.buildingId,
    openDefault || b.hasPriorityAlert
  );
  const id = escapeHtml(b.buildingId);
  return `
    <article class="${buildingCardClass(
      b
    )}" data-building-id="${id}" data-accordion-id="${id}">
      <div
        class="gm-building-summary"
        data-accordion-toggle
        role="button"
        tabindex="0"
        aria-expanded="${open ? "true" : "false"}"
      >
        <div class="gm-building-summary-main">
          <h2 class="gm-building-name" data-gm-role="building-name">${escapeHtml(
            b.buildingName
          )}</h2>
          <p class="gm-building-meta" data-gm-role="building-meta">${escapeHtml(
            buildingMetaText(b)
          )}</p>
        </div>
        <div class="gm-building-badges" data-gm-role="building-badges">${buildingBadgesHtml(
          b
        )}</div>
        <span class="gm-building-chevron" aria-hidden="true">▼</span>
      </div>
      <div
        class="gm-building-rooms"
        data-gm-role="rooms"
        data-accordion-body
        data-accordion-display="grid"
        style="display:${open ? "grid" : "none"}"
      >
        ${(b.rooms || []).map(roomCardHtml).join("")}
      </div>
    </article>`;
}

/** 建物カードは開閉状態を触らず中身のみ更新 */
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
  patchBuildingBadges(
    el.querySelector('[data-gm-role="building-badges"]'),
    b
  );
  syncKeyedChildren({
    parent: el.querySelector('[data-gm-role="rooms"]'),
    items: b.rooms || [],
    selector: "article[data-property-id]",
    datasetKey: "propertyId",
    keyOf: (room) => String(room.propertyId),
    create: (room) => elFromHtml(roomCardHtml(room)),
    patch: patchRoomCard,
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
    setPlaceholder(root, "empty", EMPTY_LIST_HTML);
    return;
  }
  ensureListMode(root, "flat");
  syncKeyedChildren({
    parent: root,
    items: rows,
    selector: "article[data-property-id]",
    datasetKey: "propertyId",
    keyOf: (row) => String(row.propertyId),
    create: (row) => elFromHtml(roomCardHtml(row)),
    patch: patchRoomCard,
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
  ensureListMode(root, "buildings");
  syncKeyedChildren({
    parent: root,
    items: buildings,
    selector: "article[data-building-id]",
    datasetKey: "buildingId",
    keyOf: (b) => String(b.buildingId),
    create: (b, index) => {
      const el = elFromHtml(
        buildingCardHtml(b, index === 0 && b.hasPriorityAlert)
      );
      accordion.applyCard(el);
      return el;
    },
    patch: patchBuildingCard,
  });
  // 念のため開閉状態を復元
  accordion.restore(root);
}

function portKey(port) {
  return `${port.portType}${port.portNumber}`;
}

function portMeterText(port) {
  if (port.operationMode !== "pulse") return "状態・遮断監視";
  return `現在のメーター指針値 ${meterText(
    port.currentMeterValue ?? port.initialMeterValue
  )} m³`;
}

function mappedPortHtml(port) {
  return `
    <div class="gm-mapped-port" data-port-key="${escapeHtml(
      portKey(port)
    )}">
      <b data-gm-role="port-name">${escapeHtml(portKey(port))}</b>
      <span data-gm-role="port-label">${escapeHtml(port.label)}</span>
      <small class="meter-value-text" data-gm-role="port-meter">${escapeHtml(
        portMeterText(port)
      )}</small>
    </div>`;
}

function patchMappedPort(el, port) {
  setText(el.querySelector('[data-gm-role="port-name"]'), portKey(port));
  setText(el.querySelector('[data-gm-role="port-label"]'), port.label);
  setText(
    el.querySelector('[data-gm-role="port-meter"]'),
    portMeterText(port)
  );
}

function mappedDeviceHtml(device) {
  const pulsePort = (device.ports || []).find(
    (port) =>
      port.portType === "DI" && port.operationMode === "pulse"
  );
  return `
    <article class="gm-mapped-device" data-device-id="${escapeHtml(
      device.deviceId
    )}">
      <div class="gm-mapped-device-head">
        <strong data-gm-role="device-id">${escapeHtml(
          device.deviceId
        )}</strong>
        <span data-gm-role="device-property">${escapeHtml(
          device.propertyId
        )}</span>
      </div>
      <div class="gm-mapped-port-grid" data-gm-role="ports">${(
        device.ports || []
      )
        .map(mappedPortHtml)
        .join("")}</div>
      <button
        class="gm-test-pulse-button"
        type="button"
        data-test-pulse
        data-device-id="${escapeHtml(device.deviceId)}"
        data-port="${pulsePort ? `DI${pulsePort.portNumber}` : ""}"
        ${pulsePort ? "" : "hidden"}
      >テストパルス+1送信</button>
      <button
        class="gm-firmware-download-button"
        type="button"
        data-download-firmware
        data-device-id="${escapeHtml(device.deviceId)}"
      >📥 RP2350設定ファイルをダウンロード</button>
      <small class="gm-test-pulse-result" data-gm-role="test-result"></small>
    </article>`;
}

function patchMappedDevice(el, device) {
  setText(
    el.querySelector('[data-gm-role="device-id"]'),
    device.deviceId
  );
  setText(
    el.querySelector('[data-gm-role="device-property"]'),
    device.propertyId
  );
  const pulsePort = (device.ports || []).find(
    (port) =>
      port.portType === "DI" && port.operationMode === "pulse"
  );
  const testButton = el.querySelector("[data-test-pulse]");
  setHidden(testButton, !pulsePort);
  if (testButton && pulsePort) {
    testButton.dataset.deviceId = device.deviceId;
    testButton.dataset.port = `DI${pulsePort.portNumber}`;
  }
  const downloadButton = el.querySelector(
    "[data-download-firmware]"
  );
  if (downloadButton) {
    downloadButton.dataset.deviceId = device.deviceId;
  }
  syncKeyedChildren({
    parent: el.querySelector('[data-gm-role="ports"]'),
    items: device.ports || [],
    selector: ".gm-mapped-port[data-port-key]",
    datasetKey: "portKey",
    keyOf: portKey,
    create: (port) => elFromHtml(mappedPortHtml(port)),
    patch: patchMappedPort,
  });
}

function operatorAuthHeaders() {
  const token =
    localStorage.getItem("tisly_admin_token") ||
    sessionStorage.getItem("tisly_token") ||
    "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 確認後に物件と実機設定を削除し、
 * 一覧・件数・現場ポートを即時同期する。
 */
async function deleteProperty(button) {
  const propertyId = String(button.dataset.propertyId || "");
  const propertyName = String(button.dataset.propertyName || "この物件");
  const confirmed = window.confirm(
    `『${propertyName}』を削除しますか？監視データも消去されます`
  );
  if (!confirmed) return;

  button.disabled = true;
  try {
    const response = await fetch("/api/device/unbind", {
      method: "DELETE",
      headers: operatorAuthHeaders(),
      body: JSON.stringify({ property_id: propertyId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "物件を削除できませんでした");
    }

    const total = document.getElementById("gm-sum-total");
    setText(total, String(Math.max(0, Number(total?.textContent || 0) - 1)));
    const room = button.closest("article[data-property-id]");
    const building = button.closest("article[data-building-id]");
    if (room) room.classList.add("is-removing");
    document
      .querySelectorAll("#gm-mapped-port-list article[data-device-id]")
      .forEach((device) => {
        const mappedProperty = device.querySelector(
          '[data-gm-role="device-property"]'
        );
        if (mappedProperty?.textContent === propertyId) {
          device.classList.add("is-removing");
        }
      });
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    room?.remove();
    if (
      building &&
      !building.querySelector("article[data-property-id]")
    ) {
      building.remove();
    }
    document
      .querySelectorAll("#gm-mapped-port-list .is-removing")
      .forEach((device) => device.remove());
    await refresh();
  } catch (error) {
    button.disabled = false;
    window.alert(error.message);
  }
}

/**
 * 現場疎通用の単発パルスを送信し、
 * 成功後に既存カードの数値だけ更新する。
 */
async function sendTestPulse(button) {
  const card = button.closest("[data-device-id]");
  const result = card?.querySelector('[data-gm-role="test-result"]');
  button.disabled = true;
  setText(result, "送信中…");
  try {
    const response = await fetch("/api/meter/telemetry", {
      method: "POST",
      headers: operatorAuthHeaders(),
      body: JSON.stringify({
        device_id: button.dataset.deviceId,
        port: button.dataset.port,
        pulse_increment: 1,
        raw_state: 1,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "送信失敗");
    setText(
      result,
      `送信済み · ${Number(body.meter_value).toFixed(2)} m³`
    );
    await refresh();
  } catch (error) {
    setText(result, `送信失敗: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

/**
 * 現在の機器設定を三ファイルのZIPへまとめ、
 * ブラウザ標準ダウンロードとして保存する。
 */
async function downloadFirmware(button) {
  const card = button.closest("[data-device-id]");
  const result = card?.querySelector('[data-gm-role="test-result"]');
  button.disabled = true;
  setText(result, "設定ZIPを作成中…");
  try {
    const deviceId = String(button.dataset.deviceId || "");
    const url =
      "/api/device/ports/firmware/" +
      "tisly-rp2350-firmware.zip?deviceId=" +
      encodeURIComponent(deviceId);
    const response = await fetch(url, {
      headers: operatorAuthHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "ダウンロード失敗");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "tisly-rp2350-firmware.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setText(result, `${deviceId} 設定ZIPを保存しました`);
  } catch (error) {
    setText(result, `保存失敗: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function renderMappedPorts(d) {
  const root = document.getElementById("gm-mapped-port-list");
  if (!root) return;
  const devices = (d.mappedDevices || []).filter(
    (device) =>
      !selectedPropertyId ||
      device.propertyId === selectedPropertyId
  );
  if (!devices.length) {
    setPlaceholder(
      root,
      "empty",
      `<p class="gm-empty">${
        selectedPropertyId
          ? "選択した物件に使用中ポートはありません"
          : "使用中の現場ポートはありません"
      }</p>`
    );
    return;
  }
  ensureListMode(root, "devices");
  syncKeyedChildren({
    parent: root,
    items: devices,
    selector: "article[data-device-id]",
    datasetKey: "deviceId",
    keyOf: (device) => String(device.deviceId),
    create: (device) => elFromHtml(mappedDeviceHtml(device)),
    patch: patchMappedDevice,
  });
}

function updateMappingSelection() {
  const label = document.getElementById("gm-mapping-selection");
  setText(
    label,
    selectedPropertyId
      ? `${selectedPropertyName || selectedPropertyId} を表示中`
      : "すべての物件"
  );
}

function selectProperty(propertyId, propertyName) {
  selectedPropertyId = propertyId;
  selectedPropertyName = propertyName;
  updateMappingSelection();
  if (latestDashboard) {
    renderList(latestDashboard);
    renderMappedPorts(latestDashboard);
  }
  document
    .getElementById("gm-mapped-port-list")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function suggestDeviceId() {
  const response = await fetch("/api/device/next-id", {
    headers: operatorAuthHeaders(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "連番取得失敗");
  const input = document.getElementById("gm-device-id");
  if (input && !input.value.trim()) input.value = body.deviceId || "";
}

function openRegisterDialog() {
  const dialog = document.getElementById("gm-register-dialog");
  const error = document.getElementById("gm-register-error");
  setText(error, "");
  if (dialog && !dialog.open) dialog.showModal();
  suggestDeviceId().catch((err) => setText(error, err.message));
  window.setTimeout(() => {
    document.getElementById("gm-property-name")?.focus();
  }, 0);
}

async function registerProperty(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = document.getElementById("gm-register-submit");
  const error = document.getElementById("gm-register-error");
  submit.disabled = true;
  setText(error, "");
  try {
    const formData = new FormData(form);
    const response = await fetch("/api/device/register", {
      method: "POST",
      headers: operatorAuthHeaders(),
      body: JSON.stringify({
        propertyName: formData.get("propertyName"),
        installLocation: formData.get("installLocation"),
        deviceId: formData.get("deviceId"),
        initialMeterValue: formData.get("initialMeterValue"),
        portMappings: [
          {
            port: "DI1",
            label: "ガスメーター",
            operationMode: "pulse",
            pulseWeight: 0.01,
          },
          {
            port: "DI2",
            label: "地震遮断",
            operationMode: "state_monitor",
          },
        ],
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "登録できませんでした");
    }
    const property = body.property;
    const total = document.getElementById("gm-sum-total");
    setText(total, String(Number(total?.textContent || 0) + 1));
    selectedPropertyId = property.propertyId;
    selectedPropertyName = property.propertyName;
    accordion.openPropertyIds.add(`BLD-ORPHAN-${property.propertyId}`);
    document.getElementById("gm-register-dialog")?.close();
    form.reset();
    document.getElementById("gm-initial-meter").value = "0.00";
    updateMappingSelection();
    await refresh();
  } catch (err) {
    setText(error, err.message);
  } finally {
    submit.disabled = false;
  }
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const d = await loadOperator();
    latestDashboard = d;
    renderSummary(d);
    renderList(d);
    renderMappedPorts(d);
    updateMappingSelection();
  } finally {
    refreshInFlight = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const back = document.getElementById("gm-back-link");
  if (back) back.href = "/app";
  accordion.track(document.getElementById("gm-prop-list"));
  document
    .getElementById("gm-open-register")
    ?.addEventListener("click", openRegisterDialog);
  document
    .getElementById("gm-close-register")
    ?.addEventListener("click", () => {
      document.getElementById("gm-register-dialog")?.close();
    });
  document
    .getElementById("gm-register-form")
    ?.addEventListener("submit", registerProperty);
  document.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select-property]");
    if (selectButton) {
      selectProperty(
        String(selectButton.dataset.propertyId || ""),
        String(selectButton.dataset.propertyName || "")
      );
    }
    const deleteButton = event.target.closest("[data-delete-property]");
    if (deleteButton) deleteProperty(deleteButton);
    const pulseButton = event.target.closest("[data-test-pulse]");
    if (pulseButton) sendTestPulse(pulseButton);
    const downloadButton = event.target.closest(
      "[data-download-firmware]"
    );
    if (downloadButton) downloadFirmware(downloadButton);
  });
  refresh().catch((err) => {
    console.error(err);
    const root = document.getElementById("gm-prop-list");
    if (root) {
      setPlaceholder(
        root,
        "error",
        `<p class="gm-empty">読み込みに失敗しました</p>`
      );
    }
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh().catch(console.error);
    }
  }, 3000);
});
