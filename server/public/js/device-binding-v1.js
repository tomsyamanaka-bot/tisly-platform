const TOKEN_KEY = "tisly_token";

const state = {
  properties: [],
  deviceIds: [],
  selectedProperty: null,
  stream: null,
  html5Scanner: null,
  scanLocked: false,
  frameRequest: 0,
  activeConfiguration: null,
  statusTimer: 0,
};

function authHeaders(json = false) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setPageStatus(message, isError = false) {
  const element = document.getElementById("page-status");
  element.textContent = message;
  element.style.color = isError ? "#b91c1c" : "#475569";
}

function setScannerStatus(message, isError = false) {
  const element = document.getElementById("scanner-status");
  element.textContent = message;
  element.style.color = isError ? "#b91c1c" : "#334155";
}

function renderProperties() {
  const list = document.getElementById("property-list");
  if (!state.properties.length) {
    list.innerHTML = `
      <article class="property-card">
        <h3>登録できる物件がありません</h3>
        <p class="property-address">
          Customer Masterで物件を登録してください。
        </p>
      </article>`;
    return;
  }

  list.innerHTML = state.properties
    .map((property) => {
      const online = property.connectionStatus === "online";
      const devices = (property.devices || [])
        .map(
          (device) =>
            `<button
              class="device-config-link"
              data-config-device="${escapeHtml(device.deviceId)}"
            >
              ● ${escapeHtml(device.deviceId)} のポート設定
            </button>`
        )
        .join("");
      return `
        <article
          class="property-card${online ? " is-online" : ""}"
          data-property-id="${escapeHtml(property.propertyId)}"
        >
          <div class="property-top">
            <h3>${escapeHtml(property.propertyName)}</h3>
            <span class="status-badge">
              ${escapeHtml(property.statusLabel)}
            </span>
          </div>
          <p class="property-address">
            ${escapeHtml(property.address || "住所未登録")}
          </p>
          ${devices ? `<div class="device-list">${devices}</div>` : ""}
          <button
            class="scan-button"
            data-scan-property="${escapeHtml(property.propertyId)}"
          >
            📷 QRを読む
          </button>
        </article>`;
    })
    .join("");

  list.querySelectorAll("[data-scan-property]").forEach((button) => {
    button.addEventListener("click", () => {
      const property = state.properties.find(
        (item) => item.propertyId === button.dataset.scanProperty
      );
      if (property) void openScanner(property);
    });
  });
  list.querySelectorAll("[data-config-device]").forEach((button) => {
    button.addEventListener("click", () => {
      void openPortConfiguration(button.dataset.configDevice);
    });
  });
}

function renderKnownDevices() {
  const list = document.getElementById("known-device-list");
  list.innerHTML = state.deviceIds
    .map(
      (deviceId) => `
        <button
          class="known-device-chip"
          data-device-id="${escapeHtml(deviceId)}"
        >
          ${escapeHtml(deviceId)}
        </button>`
    )
    .join("");
  list.querySelectorAll("[data-device-id]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("label-device-id").value =
        button.dataset.deviceId;
      void generateLabel();
    });
  });
}

async function loadProperties() {
  try {
    const response = await fetch("/api/device/properties", {
      headers: authHeaders(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "ログインし直してください"
          : body.error || `HTTP ${response.status}`
      );
    }
    state.properties = body.properties || [];
    state.deviceIds = body.deviceIds || [];
    renderProperties();
    renderKnownDevices();
    setPageStatus(
      `${state.properties.length}件の物件から選べます`
    );
  } catch (error) {
    setPageStatus(error.message || String(error), true);
  }
}

function resetReaderDom() {
  const reader = document.getElementById("qr-reader");
  reader.classList.remove("is-success");
  reader.innerHTML = `
    <video id="qr-video" playsinline muted></video>
    <div class="scan-frame" aria-hidden="true"></div>`;
}

async function stopScanner() {
  state.scanLocked = true;
  if (state.frameRequest) {
    cancelAnimationFrame(state.frameRequest);
    state.frameRequest = 0;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  if (state.html5Scanner) {
    try {
      await state.html5Scanner.stop();
    } catch {
      // 停止済みなら何もしない。
    }
    try {
      await state.html5Scanner.clear();
    } catch {
      // 読取領域は次回に再生成する。
    }
    state.html5Scanner = null;
  }
}

async function closeScanner() {
  await stopScanner();
  document.getElementById("scanner-sheet").hidden = true;
  state.selectedProperty = null;
  resetReaderDom();
}

function showManualEntry(message) {
  document.getElementById("manual-entry").hidden = false;
  setScannerStatus(message, true);
  document.getElementById("manual-device-id").focus();
}

function cameraErrorMessage(error) {
  if (
    error?.name === "NotAllowedError" ||
    error?.name === "PermissionDeniedError"
  ) {
    return "カメラを許可してください。下のID入力も使えます。";
  }
  if (error?.name === "NotFoundError") {
    return "背面カメラが見つかりません。IDを入力してください。";
  }
  return "カメラを起動できません。IDを入力してください。";
}

async function startBarcodeDetector() {
  const video = document.getElementById("qr-video");
  state.stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = state.stream;
  await video.play();

  const detector = new window.BarcodeDetector({
    formats: ["qr_code"],
  });
  setScannerStatus("QRコードを白い枠の中に入れてください");

  const detect = async () => {
    if (state.scanLocked || !video.srcObject) return;
    try {
      const codes = await detector.detect(video);
      if (codes[0]?.rawValue) {
        await handleDecoded(codes[0].rawValue);
        return;
      }
    } catch {
      // 次のフレームで再試行する。
    }
    state.frameRequest = requestAnimationFrame(detect);
  };
  state.frameRequest = requestAnimationFrame(detect);
}

async function startHtml5Scanner() {
  resetReaderDom();
  document.getElementById("qr-reader").innerHTML = "";
  state.html5Scanner = new window.Html5Qrcode("qr-reader");
  await state.html5Scanner.start(
    { facingMode: "environment" },
    {
      fps: 12,
      qrbox: { width: 230, height: 230 },
      aspectRatio: 1,
    },
    (decodedText) => {
      void handleDecoded(decodedText);
    },
    () => {}
  );
  setScannerStatus("QRコードを四角の中に入れてください");
}

async function openScanner(property) {
  state.selectedProperty = property;
  state.scanLocked = false;
  document.getElementById("manual-entry").hidden = true;
  document.getElementById("manual-device-id").value = "";
  document.getElementById("scanner-property-name").textContent =
    property.propertyName;
  document.getElementById("scanner-sheet").hidden = false;
  resetReaderDom();
  setScannerStatus("カメラを準備しています…");

  try {
    if (
      "BarcodeDetector" in window &&
      navigator.mediaDevices?.getUserMedia
    ) {
      await startBarcodeDetector();
      return;
    }
    if (window.Html5Qrcode) {
      await startHtml5Scanner();
      return;
    }
    showManualEntry(
      "QR読取機能を準備できません。IDを入力してください。"
    );
  } catch (error) {
    await stopScanner();
    state.scanLocked = false;
    showManualEntry(cameraErrorMessage(error));
  }
}

function playSuccessFeedback() {
  navigator.vibrate?.([70, 35, 110]);
  try {
    const AudioContext =
      window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + 0.16
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  } catch {
    // 音が使えない端末では振動と緑枠を使う。
  }
}

async function bindDevice(rawValue) {
  if (!state.selectedProperty) return;
  const response = await fetch("/api/device/bind", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      property_id: state.selectedProperty.propertyId,
      qrText: rawValue,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.error ||
        (response.status === 409
          ? "この機器は別の物件に登録済みです"
          : `登録できませんでした（${response.status}）`)
    );
  }
  return body;
}

async function handleDecoded(rawValue) {
  if (state.scanLocked) return;
  state.scanLocked = true;
  setScannerStatus("読み取りました。登録しています…");
  try {
    const body = await bindDevice(rawValue);
    await stopScanner();
    document.getElementById("qr-reader").classList.add("is-success");
    setScannerStatus(
      `${body.binding.deviceId} を登録しました`
    );
    playSuccessFeedback();

    const flash = document.getElementById("success-flash");
    flash.hidden = false;
    await loadProperties();
    window.setTimeout(() => {
      flash.hidden = true;
      void closeScanner().then(() => {
        void openPortConfiguration(body.binding.deviceId);
      });
    }, 700);
  } catch (error) {
    state.scanLocked = false;
    setScannerStatus(error.message || String(error), true);
    document.getElementById("manual-entry").hidden = false;
  }
}

async function generateLabel() {
  const input = document.getElementById("label-device-id");
  const button = document.getElementById("btn-generate-label");
  button.disabled = true;
  try {
    const response = await fetch("/api/device/qr", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ device_id: input.value }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    input.value = body.deviceId;
    document.getElementById("label-qr-image").src = body.qrDataUrl;
    document.getElementById("label-device-id-text").textContent =
      body.deviceId;
    document.getElementById("print-label").hidden = false;
    document.getElementById("btn-print-label").hidden = false;
    setPageStatus("QRシールを作成しました");
  } catch (error) {
    setPageStatus(error.message || String(error), true);
  } finally {
    button.disabled = false;
  }
}

function pulseSettingValue(port) {
  return `${port.pulseWeight}|${port.pulseUnit}`;
}

function portCardHtml(port) {
  const id = `${port.portType}${port.portNumber}`;
  const enabled = port.enabled ? "checked" : "";
  const disabled = port.enabled ? "" : "disabled";
  const isInput = port.portType === "DI";
  return `
    <article
      class="port-card${port.enabled ? " is-enabled" : ""}"
      data-port-card
      data-port-type="${port.portType}"
      data-port-number="${port.portNumber}"
    >
      <div class="port-card-top">
        <div class="port-identity">
          <strong>${id}</strong>
          ${
            isInput
              ? `<span
                  id="live-${id}"
                  class="live-indicator"
                >⚪ 待機中（OFF）</span>`
              : `<span
                  id="live-${id}"
                  class="live-indicator"
                >⚪ 出力OFF</span>`
          }
        </div>
        <label class="toggle-label">
          <input
            type="checkbox"
            data-field="enabled"
            ${enabled}
          />
          <span class="toggle-track" aria-hidden="true"></span>
          <b>${port.enabled ? "使用中" : "未使用"}</b>
        </label>
      </div>

      <div class="port-fields">
        <label class="wide-field">
          <span>ポート名称 <em>使用中は必須</em></span>
          <input
            data-field="label"
            value="${escapeHtml(port.label)}"
            placeholder="${
              isInput
                ? "例：101号室 ガスメーター"
                : "例：共用部 換気ファン"
            }"
            maxlength="100"
            ${disabled}
          />
          <small class="field-error">
            ※名称を入力してください
          </small>
        </label>

        <label>
          <span>動作モード</span>
          <select data-field="operationMode" ${disabled}>
            <option
              value="pulse"
              ${port.operationMode === "pulse" ? "selected" : ""}
            >パルス積算</option>
            <option
              value="state_monitor"
              ${port.operationMode === "state_monitor" ? "selected" : ""}
            >状態・遮断監視</option>
          </select>
        </label>

        <label>
          <span>接点極性</span>
          <select data-field="contactPolarity" ${disabled}>
            <option
              value="a"
              ${port.contactPolarity === "a" ? "selected" : ""}
            >a接点（ノーマルオープン）</option>
            <option
              value="b"
              ${port.contactPolarity === "b" ? "selected" : ""}
            >b接点（ノーマルクローズ）</option>
          </select>
        </label>

        <label>
          <span>パルス重み・単位</span>
          <select data-field="pulseSetting" ${disabled}>
            ${[
              ["0.001|m³/P", "0.001 m³/P"],
              ["0.01|m³/P", "0.01 m³/P"],
              ["0.1|m³/P", "0.1 m³/P"],
              ["1|m³/P", "1 m³/P"],
              ["1|L/P", "1 L/P"],
              ["1|kWh/P", "1 kWh/P"],
              ["1|P", "1 パルス"],
            ]
              .map(
                ([value, label]) => `
                  <option
                    value="${value}"
                    ${pulseSettingValue(port) === value ? "selected" : ""}
                  >${label}</option>`
              )
              .join("")}
          </select>
        </label>

        <label>
          <span>初期メーター指針値</span>
          <div class="number-with-unit">
            <input
              type="number"
              min="0"
              step="0.001"
              inputmode="decimal"
              data-field="initialMeterValue"
              value="${port.initialMeterValue}"
              ${disabled}
            />
            <b>m³</b>
          </div>
        </label>
      </div>

      ${
        isInput
          ? ""
          : `<div class="relay-test-row">
              <button
                class="relay-test-button"
                data-relay-test
                data-relay-on="true"
                ${disabled}
              >
                テスト動作 ON
              </button>
              <button
                class="relay-test-button is-off"
                data-relay-test
                data-relay-on="false"
                ${disabled}
              >
                テスト動作 OFF
              </button>
            </div>`
      }
    </article>`;
}

function setCardEnabled(card, enabled) {
  card.classList.toggle("is-enabled", enabled);
  card.querySelectorAll(
    "[data-field]:not([data-field='enabled']), [data-relay-test]"
  ).forEach((element) => {
    element.disabled = !enabled;
  });
  card.querySelector(".toggle-label b").textContent =
    enabled ? "使用中" : "未使用";
}

function renderPorts(configuration) {
  document.getElementById("di-port-list").innerHTML =
    configuration.ports
      .filter((port) => port.portType === "DI")
      .map(portCardHtml)
      .join("");
  document.getElementById("ro-port-list").innerHTML =
    configuration.ports
      .filter((port) => port.portType === "RO")
      .map(portCardHtml)
      .join("");

  document.querySelectorAll("[data-port-card]").forEach((card) => {
    const toggle = card.querySelector("[data-field='enabled']");
    toggle.addEventListener("change", () => {
      setCardEnabled(card, toggle.checked);
      validateConfiguration();
    });
    card.querySelectorAll("input, select").forEach((field) => {
      field.addEventListener("input", validateConfiguration);
      field.addEventListener("change", validateConfiguration);
    });
    card.querySelectorAll("[data-relay-test]").forEach((button) => {
      button.addEventListener("click", () => {
        void testRelay(
          Number(card.dataset.portNumber),
          button.dataset.relayOn === "true",
          button
        );
      });
    });
  });
}

function rs485RowHtml(item = {}) {
  return `
    <div class="rs485-row" data-rs485-row>
      <label>
        <span>Modbusアドレス</span>
        <input
          type="number"
          min="1"
          max="32"
          inputmode="numeric"
          data-rs485-address
          value="${escapeHtml(item.modbusAddress ?? "")}"
          placeholder="1〜32"
        />
      </label>
      <label class="rs485-name">
        <span>機器名称</span>
        <input
          data-rs485-name
          value="${escapeHtml(item.equipmentName ?? "")}"
          placeholder="例：CO₂濃度計"
          maxlength="100"
        />
      </label>
      <button class="remove-rs485" data-remove-rs485>
        削除
      </button>
    </div>`;
}

function bindRs485Rows() {
  document.querySelectorAll("[data-rs485-row]").forEach((row) => {
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", validateConfiguration);
    });
    row.querySelector("[data-remove-rs485]").addEventListener(
      "click",
      () => {
        row.remove();
        validateConfiguration();
      }
    );
  });
}

function renderRs485(items) {
  document.getElementById("rs485-list").innerHTML =
    items.map(rs485RowHtml).join("");
  bindRs485Rows();
}

function collectPorts() {
  return [...document.querySelectorAll("[data-port-card]")].map(
    (card) => {
      const pulseSetting = card
        .querySelector("[data-field='pulseSetting']")
        .value.split("|");
      return {
        portType: card.dataset.portType,
        portNumber: Number(card.dataset.portNumber),
        enabled: card.querySelector("[data-field='enabled']").checked,
        label: card.querySelector("[data-field='label']").value.trim(),
        operationMode: card.querySelector(
          "[data-field='operationMode']"
        ).value,
        contactPolarity: card.querySelector(
          "[data-field='contactPolarity']"
        ).value,
        pulseWeight: Number(pulseSetting[0]),
        pulseUnit: pulseSetting[1],
        initialMeterValue: Number(
          card.querySelector(
            "[data-field='initialMeterValue']"
          ).value
        ),
      };
    }
  );
}

function collectRs485() {
  return [...document.querySelectorAll("[data-rs485-row]")]
    .map((row) => ({
      modbusAddress: Number(
        row.querySelector("[data-rs485-address]").value
      ),
      equipmentName: row
        .querySelector("[data-rs485-name]")
        .value.trim(),
    }))
    .filter(
      (item) => item.modbusAddress || item.equipmentName
    );
}

function validateConfiguration() {
  const ports = collectPorts();
  let invalidNames = 0;
  document.querySelectorAll("[data-port-card]").forEach((card) => {
    const enabled = card.querySelector(
      "[data-field='enabled']"
    ).checked;
    const missing =
      enabled &&
      !card.querySelector("[data-field='label']").value.trim();
    card.classList.toggle("has-error", missing);
    if (missing) invalidNames += 1;
  });

  const rs485 = collectRs485();
  const addresses = rs485.map((item) => item.modbusAddress);
  const rs485Invalid = rs485.some(
    (item) =>
      !Number.isInteger(item.modbusAddress) ||
      item.modbusAddress < 1 ||
      item.modbusAddress > 32 ||
      !item.equipmentName
  );
  const duplicateAddress =
    new Set(addresses).size !== addresses.length;
  const button = document.getElementById("btn-save-config");
  const summary = document.getElementById(
    "config-validation-summary"
  );
  const disabled =
    ports.length !== 16 ||
    invalidNames > 0 ||
    rs485Invalid ||
    duplicateAddress;
  button.disabled = disabled;

  if (invalidNames > 0) {
    summary.textContent =
      `使用中の${invalidNames}ポートで名称が未入力です。`;
  } else if (rs485Invalid) {
    summary.textContent =
      "RS485のアドレスと機器名称を入力してください。";
  } else if (duplicateAddress) {
    summary.textContent = "Modbusアドレスが重複しています。";
  } else {
    summary.textContent = "入力内容を確認して保存できます。";
  }
  return !disabled;
}

async function loadPortStatus() {
  const deviceId = state.activeConfiguration?.deviceId;
  if (!deviceId) return;
  try {
    const response = await fetch(
      `/api/device/ports/status?deviceId=${encodeURIComponent(deviceId)}`,
      { headers: authHeaders() }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const status = body.status || {};
    for (let portNumber = 1; portNumber <= 8; portNumber += 1) {
      const input = document.getElementById(`live-DI${portNumber}`);
      const relay = document.getElementById(`live-RO${portNumber}`);
      const inputOn =
        status.inputStates?.[String(portNumber)] === "on";
      const relayOn =
        status.relayStates?.[String(portNumber)] === "on";
      input.textContent = inputOn
        ? "🟢 検知中（ON）"
        : "⚪ 待機中（OFF）";
      input.classList.toggle("is-on", inputOn);
      relay.textContent = relayOn ? "🟢 出力ON" : "⚪ 出力OFF";
      relay.classList.toggle("is-on", relayOn);
    }
    const seen = status.lastSeenAt
      ? new Date(status.lastSeenAt).toLocaleTimeString("ja-JP")
      : "実機待機中";
    document.getElementById("config-status").textContent =
      `${deviceId} · 最終通信 ${seen}`;
  } catch {
    document.getElementById("config-status").textContent =
      "実機状態を再接続しています…";
  }
}

async function openPortConfiguration(deviceId) {
  window.clearInterval(state.statusTimer);
  document.getElementById("port-config-sheet").hidden = false;
  document.getElementById("config-device-label").textContent = deviceId;
  document.getElementById("config-status").textContent =
    "設定を読み込んでいます…";
  try {
    const response = await fetch(
      `/api/device/ports/config?deviceId=${encodeURIComponent(deviceId)}`,
      { headers: authHeaders() }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    state.activeConfiguration = body.configuration;
    renderPorts(body.configuration);
    renderRs485(body.configuration.rs485Devices || []);
    document.getElementById("field-note").value =
      body.configuration.fieldNote || "";
    validateConfiguration();
    await loadPortStatus();
    state.statusTimer = window.setInterval(loadPortStatus, 1000);
  } catch (error) {
    document.getElementById("config-status").textContent =
      error.message || String(error);
  }
}

function closePortConfiguration() {
  window.clearInterval(state.statusTimer);
  state.statusTimer = 0;
  state.activeConfiguration = null;
  document.getElementById("port-config-sheet").hidden = true;
}

async function savePortConfiguration() {
  if (!validateConfiguration() || !state.activeConfiguration) return;
  const button = document.getElementById("btn-save-config");
  button.disabled = true;
  button.textContent = "保存しています…";
  try {
    const response = await fetch("/api/device/ports/save", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        deviceId: state.activeConfiguration.deviceId,
        ports: collectPorts(),
        rs485Devices: collectRs485(),
        fieldNote: document.getElementById("field-note").value,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    state.activeConfiguration = body.configuration;
    document.getElementById("config-status").textContent =
      "保存しました。監視カードへ即時反映済みです。";
    navigator.vibrate?.(80);
  } catch (error) {
    document.getElementById("config-status").textContent =
      error.message || String(error);
  } finally {
    button.textContent = "設定を保存して監視へ反映";
    validateConfiguration();
  }
}

async function testRelay(portNumber, on, button) {
  if (!state.activeConfiguration) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "送信中…";
  try {
    const response = await fetch("/api/device/ports/relay-test", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        deviceId: state.activeConfiguration.deviceId,
        portNumber,
        on,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    document.getElementById("config-status").textContent =
      `RO${portNumber} ${on ? "ON" : "OFF"} を実機へ送信しました。`;
  } catch (error) {
    document.getElementById("config-status").textContent =
      error.message || String(error);
  } finally {
    button.textContent = original;
    button.disabled = false;
  }
}

document
  .getElementById("btn-close-scanner")
  .addEventListener("click", () => void closeScanner());

document
  .getElementById("btn-bind-manual")
  .addEventListener("click", () => {
    const value = document.getElementById("manual-device-id").value;
    void handleDecoded(value);
  });

document
  .getElementById("btn-generate-label")
  .addEventListener("click", () => void generateLabel());

document
  .getElementById("btn-print-label")
  .addEventListener("click", () => window.print());

document
  .getElementById("btn-close-config")
  .addEventListener("click", closePortConfiguration);

document
  .getElementById("btn-save-config")
  .addEventListener("click", () => void savePortConfiguration());

document
  .getElementById("btn-add-rs485")
  .addEventListener("click", () => {
    document.getElementById("rs485-list").insertAdjacentHTML(
      "beforeend",
      rs485RowHtml()
    );
    bindRs485Rows();
    validateConfiguration();
  });

window.addEventListener("pagehide", () => {
  void stopScanner();
  window.clearInterval(state.statusTimer);
});

void loadProperties();
