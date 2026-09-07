/**
 * H.View カメラ プレビュー v1
 * Guard Viewer / EZCloud 共有リンク埋め込み優先
 * （未設定時は案内 + アプリ起動フォールバック）
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

function resolveCloudUrl(src) {
  const cloud = String(src?.cloudStreamUrl ?? "").trim();
  if (cloud) return cloud;
  return String(src?.shareUrl ?? "").trim() || "";
}

function isHlsUrl(url) {
  return /\.m3u8(\?|#|$)/i.test(String(url || ""));
}

function openAppFallback(nvrAppOpenUrl, cloudUrl) {
  const app = String(nvrAppOpenUrl || "").trim();
  if (app) {
    window.open(app, "_blank", "noopener,noreferrer");
    return;
  }
  if (cloudUrl) {
    window.open(cloudUrl, "_blank", "noopener,noreferrer");
    return;
  }
  // 既定: Guard Viewer / EZCloud 検索（ストア導線）
  window.open(
    "https://www.google.com/search?q=Guard+Viewer+EZCloud+app",
    "_blank",
    "noopener,noreferrer"
  );
}

function bindStageControls(container, opts = {}) {
  container.querySelector("#cw-fullscreen")?.addEventListener("click", () => {
    const stage = document.getElementById("cw-preview-stage");
    if (!stage) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    stage.requestFullscreen?.().catch(() => {});
  });

  container.querySelector("#cw-reload")?.addEventListener("click", () => {
    const frame = container.querySelector("#cw-cloud-frame");
    const video = container.querySelector("#cw-hls-video");
    if (frame) {
      const src = frame.getAttribute("src") || "";
      frame.setAttribute("src", src);
      return;
    }
    if (video) {
      try {
        video.load();
        video.play?.().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof opts.onReload === "function") opts.onReload();
  });

  container
    .querySelector("#cw-open-app")
    ?.addEventListener("click", () => {
      openAppFallback(opts.nvrAppOpenUrl, opts.cloudUrl);
    });
}

function renderCloudPlayerHtml(cloudUrl, label) {
  if (isHlsUrl(cloudUrl)) {
    return `<video
      id="cw-hls-video"
      class="cw-hls-video"
      controls
      playsinline
      autoplay
      muted
      src="${escapeHtml(cloudUrl)}"
      title="${escapeHtml(label || "ライブ映像")}"
    ></video>`;
  }
  return `<iframe
    id="cw-cloud-frame"
    class="cw-cloud-frame"
    src="${escapeHtml(cloudUrl)}"
    title="${escapeHtml(label || "Guard Viewer / EZCloud ライブ")}"
    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    referrerpolicy="no-referrer-when-downgrade"
    loading="eager"
  ></iframe>`;
}

function renderEmptyCloudHint(nvrAppOpenUrl) {
  return `
    <div class="cw-empty-cloud">
      <p class="cw-empty-lead">
        💡 Guard ViewerまたはEZCloudの共有リンクを設定するとライブ映像が表示されます
      </p>
      <p class="cw-empty-sub">
        社内台帳の cloudStreamUrl に共有プレビュー URL を登録してください（ポート開放不要）
      </p>
      <button type="button" class="cw-btn primary" id="cw-open-app">
        Guard Viewer / EZCloud を開く
      </button>
    </div>`;
}

function renderPreviewView(container, camera, session) {
  const badgeClass = STATUS_CLASS[camera.status] || STATUS_CLASS.normal;
  const cloudUrl = resolveCloudUrl(session);
  const nvrAppOpenUrl = session.nvrAppOpenUrl || "";

  let stageInner = "";
  if (cloudUrl) {
    stageInner = renderCloudPlayerHtml(cloudUrl, camera.label);
  } else {
    stageInner = renderEmptyCloudHint(nvrAppOpenUrl);
  }

  container.innerHTML = `
    <div class="cw-back-row">
      <button type="button" class="cw-btn" id="cw-back-list">← カメラ一覧</button>
    </div>
    <div class="cw-preview-wrap ${cloudUrl ? "has-cloud" : "is-empty"}" id="cw-preview-stage">
      ${stageInner}
    </div>
    <div class="cw-preview-bar">
      <span class="cw-badge ${badgeClass}">${escapeHtml(camera.statusLabel)}</span>
      <div class="cw-bar-actions">
        ${
          cloudUrl
            ? `<button type="button" class="cw-btn" id="cw-reload">更新</button>`
            : ""
        }
        <button type="button" class="cw-btn primary" id="cw-fullscreen">全画面</button>
      </div>
    </div>
    <p class="cw-meta">${escapeHtml(camera.label)} · ${escapeHtml(camera.location)}</p>
    <p class="cw-meta">NVR: ${escapeHtml(session.nvrLabel || "")}${
      cloudUrl ? " · Guard Viewer / EZCloud 埋め込み" : ""
    }</p>
  `;

  cleanupStream();
  bindStageControls(container, { nvrAppOpenUrl, cloudUrl });

  container.querySelector("#cw-back-list")?.addEventListener("click", () => {
    cleanupStream();
    renderCameraList(
      container,
      container.__cameras || [],
      container.__customerCode,
      container.__cloudMeta || {}
    );
  });
}

function renderCameraList(container, cameras, customerCode, cloudMeta = {}) {
  container.__cameras = cameras;
  container.__customerCode = customerCode;
  container.__cloudMeta = cloudMeta;

  const cloudUrl = resolveCloudUrl(cloudMeta);
  const nvrAppOpenUrl = cloudMeta.nvrAppOpenUrl || "";

  const embedBlock = cloudUrl
    ? `<div class="cw-live-block">
        <div class="cw-preview-wrap has-cloud" id="cw-preview-stage">
          ${renderCloudPlayerHtml(cloudUrl, "ライブ共有")}
        </div>
        <div class="cw-preview-bar">
          <span class="cw-badge is-normal">ライブ共有</span>
          <div class="cw-bar-actions">
            <button type="button" class="cw-btn" id="cw-reload">更新</button>
            <button type="button" class="cw-btn primary" id="cw-fullscreen">全画面</button>
          </div>
        </div>
        <p class="cw-meta">Guard Viewer / EZCloud · ポート開放不要</p>
      </div>`
    : `<div class="cw-live-block">
        <div class="cw-preview-wrap is-empty" id="cw-preview-stage">
          ${renderEmptyCloudHint(nvrAppOpenUrl)}
        </div>
      </div>`;

  container.innerHTML = `
    ${embedBlock}
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

  bindStageControls(container, { nvrAppOpenUrl, cloudUrl });

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
        renderPreviewView(container, camera, {
          ...data.session,
          cloudStreamUrl:
            data.session.cloudStreamUrl || cloudMeta.cloudStreamUrl,
          shareUrl: data.session.shareUrl || cloudMeta.shareUrl,
          nvrAppOpenUrl:
            data.session.nvrAppOpenUrl || cloudMeta.nvrAppOpenUrl,
        });
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
    const cloudMeta = {
      cloudStreamUrl: data.cloudStreamUrl || "",
      shareUrl: data.shareUrl || "",
      nvrAppOpenUrl: data.nvrAppOpenUrl || "",
    };
    if (!cameras.length && !resolveCloudUrl(cloudMeta)) {
      body.innerHTML = `<p class="cw-meta">カメラが登録されていません</p>`;
      return;
    }
    renderCameraList(body, cameras, code, cloudMeta);
  } catch (err) {
    body.innerHTML = `<p class="cw-meta" style="color:#dc2626">${escapeHtml(err.message)}</p>`;
  }
}

export function isCameraNavHref(href) {
  return String(href || "").includes("view=camera");
}
