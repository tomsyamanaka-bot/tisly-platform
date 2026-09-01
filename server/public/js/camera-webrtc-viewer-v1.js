/**
 * H.View カメラ WebRTC プレビュー v1
 * モック SVG ストリーム + 状態バッジ
 */

import {
  getCustomerCode,
  getCustomerToken,
} from "./customer-tenant-session-v1.js";

const STATUS_CLASS = {
  normal: "is-normal",
  recording: "is-recording",
  doorbell: "is-doorbell",
};

let activePollTimer = null;
let activeBlobUrl = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authHeaders() {
  const token = getCustomerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function cleanupStream() {
  if (activePollTimer) {
    clearInterval(activePollTimer);
    activePollTimer = null;
  }
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
}

function closeOverlay() {
  cleanupStream();
  document.getElementById("cw-camera-overlay")?.remove();
}

async function fetchStreamBlob(url) {
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error("映像の取得に失敗しました");
  return res.blob();
}

function startStreamPoll(imgEl, streamUrl) {
  cleanupStream();
  const tick = async () => {
    try {
      const blob = await fetchStreamBlob(streamUrl);
      if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = URL.createObjectURL(blob);
      imgEl.src = activeBlobUrl;
    } catch {
      /* 次回リトライ */
    }
  };
  tick();
  activePollTimer = setInterval(tick, 2000);
}

function renderPreviewView(container, camera, session) {
  const badgeClass = STATUS_CLASS[camera.status] || STATUS_CLASS.normal;
  container.innerHTML = `
    <div class="cw-back-row">
      <button type="button" class="cw-btn" id="cw-back-list">← カメラ一覧</button>
    </div>
    <div class="cw-preview-wrap" id="cw-preview-stage">
      <img id="cw-stream-img" alt="${escapeHtml(camera.label)}" />
    </div>
    <div class="cw-preview-bar">
      <span class="cw-badge ${badgeClass}">${escapeHtml(camera.statusLabel)}</span>
      <button type="button" class="cw-btn primary" id="cw-fullscreen">全画面</button>
    </div>
    <p class="cw-meta">${escapeHtml(camera.label)} · ${escapeHtml(camera.location)}</p>
    <p class="cw-meta">NVR: ${escapeHtml(session.nvrLabel || "")}</p>
  `;

  const img = container.querySelector("#cw-stream-img");
  startStreamPoll(img, session.streamUrl);

  container.querySelector("#cw-back-list")?.addEventListener("click", () => {
    cleanupStream();
    renderCameraList(container, container.__cameras || [], container.__customerCode);
  });

  container.querySelector("#cw-fullscreen")?.addEventListener("click", () => {
    const stage = document.getElementById("cw-preview-stage");
    if (!stage) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    stage.requestFullscreen?.().catch(() => {});
  });
}

function renderCameraList(container, cameras, customerCode) {
  container.__cameras = cameras;
  container.__customerCode = customerCode;
  container.innerHTML = `
    <div class="cw-grid">
      ${cameras
        .map(
          (c) => `
        <button type="button" class="cw-tile" data-camera-id="${escapeHtml(c.id)}">
          <div>
            <div class="cw-tile-label">${escapeHtml(c.label)}</div>
            <div class="cw-tile-loc">${escapeHtml(c.location)}</div>
          </div>
          <span class="cw-badge ${STATUS_CLASS[c.status] || STATUS_CLASS.normal}">${escapeHtml(c.statusLabel)}</span>
        </button>`
        )
        .join("")}
    </div>`;

  container.querySelectorAll(".cw-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      const cameraId = tile.dataset.cameraId;
      const camera = cameras.find((c) => c.id === cameraId);
      if (!camera) return;
      tile.disabled = true;
      try {
        const res = await fetch(
          `/api/camera-preview/v1/session/${encodeURIComponent(cameraId)}?customerCode=${encodeURIComponent(customerCode)}`,
          { headers: authHeaders(), cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.session) {
          throw new Error(data.error || "セッション取得に失敗");
        }
        renderPreviewView(container, camera, data.session);
      } catch (err) {
        container.insertAdjacentHTML(
          "afterbegin",
          `<p class="cw-meta" style="color:#dc2626">${escapeHtml(err.message)}</p>`
        );
      } finally {
        tile.disabled = false;
      }
    });
  });
}

/**
 * カメラプレビューモーダルを開く
 */
export async function openCustomerCameraPreview(opts = {}) {
  const token = opts.token || getCustomerToken();
  const code = (opts.customerCode || getCustomerCode() || "").toUpperCase();
  if (!token || !code) {
    throw new Error("ログインが必要です");
  }

  closeOverlay();

  const overlay = document.createElement("div");
  overlay.id = "cw-camera-overlay";
  overlay.className = "cw-overlay";
  overlay.innerHTML = `
    <div class="cw-sheet" role="dialog" aria-label="カメラプレビュー">
      <div class="cw-head">
        <h2>📷 カメラを見る</h2>
        <button type="button" class="cw-close" aria-label="閉じる">×</button>
      </div>
      <div class="cw-body" id="cw-body"><p class="cw-meta">読み込み中…</p></div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  overlay.querySelector(".cw-close")?.addEventListener("click", closeOverlay);

  const body = overlay.querySelector("#cw-body");
  try {
    const res = await fetch(
      `/api/camera-preview/v1/list?customerCode=${encodeURIComponent(code)}`,
      { headers: authHeaders(), cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "カメラ一覧の取得に失敗");
    const cameras = data.cameras || [];
    if (!cameras.length) {
      body.innerHTML = `<p class="cw-meta">カメラが登録されていません</p>`;
      return;
    }
    renderCameraList(body, cameras, code);
  } catch (err) {
    body.innerHTML = `<p class="cw-meta" style="color:#dc2626">${escapeHtml(err.message)}</p>`;
  }
}

export function isCameraNavHref(href) {
  return String(href || "").includes("view=camera");
}
