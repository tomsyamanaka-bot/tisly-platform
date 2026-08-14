const TOKEN_KEY = "tisly_token";

const state = {
  properties: [],
  deviceIds: [],
  selectedProperty: null,
  stream: null,
  html5Scanner: null,
  scanLocked: false,
  frameRequest: 0,
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
            `<span>● ${escapeHtml(device.deviceId)}</span>`
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
      void closeScanner();
    }, 1100);
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

window.addEventListener("pagehide", () => {
  void stopScanner();
});

void loadProperties();
