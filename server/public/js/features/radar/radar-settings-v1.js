/**
 * TiSLY ミリ波レーダー設定コーナー
 * HLK-LD2410C × 3 — Web Bluetooth / Capacitor BLE
 */

import {
  RadarBleScanner,
  Ld2410Session,
  detectBleCapability,
  gateToDistanceM,
} from "./radar-ble-client-v1.js";

const CHANNELS = [
  { id: "ch-a", label: "左 (CH-A)", angle: "45°" },
  { id: "ch-b", label: "正面 (CH-B)", angle: "0°" },
  { id: "ch-c", label: "右 (CH-C)", angle: "45°" },
];

const MAX_DIST_M = 6;

const state = {
  scanner: new RadarBleScanner(),
  slots: { "ch-a": null, "ch-b": null, "ch-c": null },
  sessions: { "ch-a": null, "ch-b": null, "ch-c": null },
  selectedDeviceId: null,
};

function $(id) {
  return document.getElementById(id);
}

function showToast(msg) {
  const el = $("rd-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("is-visible"), 3200);
}

function formatGateLabel(gate) {
  const g = Number(gate);
  const dist = gateToDistanceM(g);
  return `Gate ${g} · ${dist.toFixed(1)}m`;
}

function bindSliders(channelId) {
  const gate = $(`rd-gate-${channelId}`);
  const motion = $(`rd-motion-${channelId}`);
  const staticEl = $(`rd-static-${channelId}`);
  const none = $(`rd-none-${channelId}`);

  gate?.addEventListener("input", () => {
    $(`rd-gate-val-${channelId}`).textContent = formatGateLabel(gate.value);
    updateGaugeMarker(channelId);
  });
  motion?.addEventListener("input", () => {
    $(`rd-motion-val-${channelId}`).textContent = `${motion.value}%`;
  });
  staticEl?.addEventListener("input", () => {
    $(`rd-static-val-${channelId}`).textContent = `${staticEl.value}%`;
  });
  none?.addEventListener("input", () => {
    $(`rd-none-val-${channelId}`).textContent = `${none.value}秒`;
  });
}

function updateGaugeMarker(channelId) {
  const gate = Number($(`rd-gate-${channelId}`)?.value || 8);
  const maxM = gateToDistanceM(gate) || MAX_DIST_M;
  const marker = $(`rd-gauge-marker-${channelId}`);
  if (marker) {
    const pct = Math.min(100, (maxM / MAX_DIST_M) * 100);
    marker.style.left = `${pct}%`;
  }
}

function updateLiveGauge(channelId, distanceM, hasTarget) {
  const live = $(`rd-live-${channelId}`);
  const fill = $(`rd-gauge-fill-${channelId}`);
  if (!live || !fill) return;

  if (!hasTarget || !Number.isFinite(distanceM)) {
    live.innerHTML = "— <span>m</span>";
    fill.style.width = "0%";
    return;
  }

  live.innerHTML = `${distanceM.toFixed(2)} <span>m</span>`;
  const pct = Math.min(100, (distanceM / MAX_DIST_M) * 100);
  fill.style.width = `${pct}%`;
}

function setChannelConnected(channelId, connected, deviceName = "") {
  const card = $(`rd-card-${channelId}`);
  const badge = $(`rd-status-${channelId}`);
  const saveBtn = $(`rd-save-${channelId}`);
  const slotEl = $(`rd-slot-${channelId}`);

  if (card) card.classList.toggle("is-connected", connected);
  if (badge) {
    badge.textContent = connected ? "接続中" : "未接続";
    badge.className = connected
      ? "rd-badge rd-badge-on"
      : "rd-badge rd-badge-off";
  }
  if (saveBtn) saveBtn.disabled = !connected;
  if (slotEl) slotEl.classList.toggle("is-assigned", connected);
  $(`rd-slot-name-${channelId}`).textContent =
    connected ? deviceName || "接続済み" : "未割当";
}

function renderDeviceList() {
  const list = $("rd-device-list");
  if (!list) return;
  list.innerHTML = "";

  const devices = [...state.scanner.discovered.values()];
  if (devices.length === 0) {
    list.innerHTML =
      '<li class="rd-hint" style="padding:8px">スキャンでデバイスを追加してください</li>';
    return;
  }

  for (const dev of devices) {
    const li = document.createElement("li");
    li.className = "rd-device-item";
    li.dataset.deviceId = dev.id;

    const rssiText =
      dev.rssi != null ? `${dev.rssi} dBm` : "RSSI —";

    li.innerHTML = `
      <div>
        <div class="rd-device-name">${escapeHtml(dev.name)}</div>
        <div class="rd-device-meta">${escapeHtml(dev.id.slice(0, 12))}…</div>
      </div>
      <div class="rd-rssi">${rssiText}</div>
      <div class="rd-slot-actions" style="grid-column:1/-1;margin-top:6px">
        <button type="button" class="rd-slot-btn" data-assign="ch-a" data-device="${dev.id}">→ CH-A</button>
        <button type="button" class="rd-slot-btn" data-assign="ch-b" data-device="${dev.id}">→ CH-B</button>
        <button type="button" class="rd-slot-btn" data-assign="ch-c" data-device="${dev.id}">→ CH-C</button>
      </div>
    `;
    list.appendChild(li);
  }

  list.querySelectorAll("[data-assign]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = btn.dataset.assign;
      const deviceId = btn.dataset.device;
      assignDeviceToSlot(slot, deviceId);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function assignDeviceToSlot(slotId, deviceId) {
  const entry = state.scanner.discovered.get(deviceId);
  if (!entry) {
    showToast("デバイスが見つかりません");
    return;
  }

  for (const [sid, did] of Object.entries(state.slots)) {
    if (did === deviceId && sid !== slotId) {
      await disconnectChannel(sid);
    }
  }

  if (state.slots[slotId]) {
    await disconnectChannel(slotId);
  }

  try {
    showToast(`${entry.name} を接続中…`);
    const session = new Ld2410Session(entry.device, entry.transport);
    session.onTargetReport = (report) => {
      updateLiveGauge(slotId, report.distanceM, report.hasTarget);
    };
    await session.connect();

    state.sessions[slotId] = session;
    state.slots[slotId] = deviceId;
    setChannelConnected(slotId, true, entry.name);

    try {
      const params = await session.readParams();
      if (params) applyParamsToUi(slotId, params);
    } catch {
      /* 読み取り失敗は無視 — 手動調整可能 */
    }

    showToast(`${CHANNELS.find((c) => c.id === slotId)?.label || slotId} に接続しました`);
  } catch (err) {
    showToast(`接続失敗: ${err.message || err}`);
    setChannelConnected(slotId, false);
  }
}

function applyParamsToUi(channelId, params) {
  const gate = Math.min(8, Math.max(0, params.motionMaxGate || params.staticMaxGate || 8));
  const gateEl = $(`rd-gate-${channelId}`);
  if (gateEl) {
    gateEl.value = String(gate);
    $(`rd-gate-val-${channelId}`).textContent = formatGateLabel(gate);
    updateGaugeMarker(channelId);
  }

  const motionEl = $(`rd-motion-${channelId}`);
  if (motionEl) {
    motionEl.value = String(params.motionSensitivity ?? 50);
    $(`rd-motion-val-${channelId}`).textContent = `${motionEl.value}%`;
  }

  const staticEl = $(`rd-static-${channelId}`);
  if (staticEl) {
    staticEl.value = String(params.staticSensitivity ?? 50);
    $(`rd-static-val-${channelId}`).textContent = `${staticEl.value}%`;
  }

  const noneEl = $(`rd-none-${channelId}`);
  if (noneEl && params.noneDuration != null) {
    noneEl.value = String(Math.min(120, params.noneDuration));
    $(`rd-none-val-${channelId}`).textContent = `${noneEl.value}秒`;
  }
}

async function disconnectChannel(channelId) {
  const session = state.sessions[channelId];
  if (session) {
    try {
      await session.disconnect();
    } catch {
      /* ignore */
    }
  }
  state.sessions[channelId] = null;
  state.slots[channelId] = null;
  setChannelConnected(channelId, false);
  updateLiveGauge(channelId, 0, false);
}

async function saveChannelSettings(channelId) {
  const session = state.sessions[channelId];
  if (!session) {
    showToast("未接続です");
    return;
  }

  const maxGate = Number($(`rd-gate-${channelId}`)?.value || 8);
  const motionSens = Number($(`rd-motion-${channelId}`)?.value || 50);
  const staticSens = Number($(`rd-static-${channelId}`)?.value || 50);
  const noneDuration = Number($(`rd-none-${channelId}`)?.value || 5);

  const saveBtn = $(`rd-save-${channelId}`);
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "書き込み中…";
  }

  try {
    const ok = await session.saveSettings({
      maxGate,
      motionSens,
      staticSens,
      noneDuration,
    });
    if (ok) {
      showToast("Flash に保存しました");
    } else {
      showToast("保存に失敗した可能性があります");
    }
  } catch (err) {
    showToast(`保存失敗: ${err.message || err}`);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "設定をモジュールに保存";
    }
  }
}

function showBleAlert(cap) {
  const el = $("rd-ble-alert");
  if (!el) return;

  if (cap.supported) {
    el.classList.add("is-hidden");
    return;
  }

  el.classList.remove("is-hidden");
  el.classList.add("is-info");
  el.innerHTML = `
    <strong>⚠️ Bluetooth 非対応ブラウザ</strong><br>
    ${escapeHtml(cap.reason || "Web Bluetooth が利用できません。")}
    <br><small>iOS Safari では TiSLY ネイティブアプリ（Capacitor BLE）をご利用ください。</small>
  `;

  const scanBtn = $("rd-scan-btn");
  if (scanBtn) scanBtn.disabled = true;
}

function initBleUi() {
  const cap = detectBleCapability();
  showBleAlert(cap);

  state.scanner.onDeviceFound = () => renderDeviceList();

  $("rd-scan-btn")?.addEventListener("click", async () => {
    try {
      await state.scanner.scanOnce();
      renderDeviceList();
      showToast("デバイスを発見しました");
    } catch (err) {
      if (err.name === "NotFoundError") {
        showToast("デバイスが選択されませんでした");
      } else {
        showToast(`スキャン失敗: ${err.message || err}`);
      }
    }
  });

  $("rd-load-auth-btn")?.addEventListener("click", async () => {
    try {
      const list = await state.scanner.loadAuthorizedDevices();
      renderDeviceList();
      showToast(`${list.length} 件の許可済みデバイスを表示`);
    } catch (err) {
      showToast(`読み込み失敗: ${err.message || err}`);
    }
  });

  if (cap.supported && navigator.bluetooth?.requestLEScan) {
    state.scanner.startPassiveScan().then((ok) => {
      if (ok) showToast("パッシブスキャン開始（RSSI 更新）");
    });
  }
}

function initChannelCards() {
  for (const ch of CHANNELS) {
    bindSliders(ch.id);
    updateGaugeMarker(ch.id);

    $(`rd-save-${ch.id}`)?.addEventListener("click", () => {
      saveChannelSettings(ch.id);
    });

    const actionsEl = $(`rd-slot-actions-${ch.id}`);
    if (actionsEl) {
      const disconnectBtn = document.createElement("button");
      disconnectBtn.type = "button";
      disconnectBtn.className = "rd-slot-btn";
      disconnectBtn.textContent = "切断";
      disconnectBtn.addEventListener("click", () => disconnectChannel(ch.id));
      actionsEl.appendChild(disconnectBtn);
    }
  }
}

function init() {
  initBleUi();
  initChannelCards();
  renderDeviceList();
}

init();
