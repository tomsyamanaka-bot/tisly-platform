/**
 * 社内向け Security 施工・保守 Pro ツール UI
 * /app/security-v1 専用（operator のみ）
 */

import { resolveHomeSiteId, showSecurityRemoteToastV1 } from "./security-floor-remote-config-v1.js";

const HOME_API = "/api/home/v1";

let currentHomeSiteId = "HOME-JP-ITABASHI-LIVE";

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg) {
  if (typeof showSecurityRemoteToastV1 === "function") {
    showSecurityRemoteToastV1(msg);
  }
}

function setHomeSite(securitySiteId) {
  currentHomeSiteId = resolveHomeSiteId(securitySiteId);
  const label = $("sf-pro-site-label");
  if (label) {
    const names = {
      "HOME-JP-ITABASHI-LIVE": "板橋自宅",
      "HOME-JP-TOYOSHIMA": "豊島邸",
    };
    label.textContent = names[currentHomeSiteId] || "選択中の物件";
  }
  refreshProToolsPanels().catch(() => {});
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!data?.ok && data?.error) throw new Error(data.error);
  return data;
}

function renderTestPulseOutputs(outputs) {
  const root = $("sf-pro-test-grid");
  if (!root) return;
  if (!outputs?.length) {
    root.innerHTML = '<p class="sf-pro-hint">出力回路がありません</p>';
    return;
  }
  root.innerHTML = outputs
    .map(
      (o) => `<button type="button" class="sf-pro-pulse-btn" data-pro-output="${escapeHtml(
        o.id
      )}" data-pro-building="${escapeHtml(o.building || "")}">
        <span class="sf-pro-pulse-label">${escapeHtml(o.label)}</span>
        <span class="sf-pro-pulse-sub">1秒テストON</span>
      </button>`
    )
    .join("");
}

async function loadTestOutputs() {
  const data = await fetchJson(
    `${HOME_API}/hardware/test-outputs?siteId=${encodeURIComponent(currentHomeSiteId)}`
  );
  renderTestPulseOutputs(data.outputs);
}

function renderFieldPhotos(photos) {
  const root = $("sf-pro-photo-grid");
  if (!root) return;
  if (!photos?.length) {
    root.innerHTML = '<p class="sf-pro-hint">まだ写真がありません</p>';
    return;
  }
  root.innerHTML = photos
    .map(
      (p) => `<figure class="sf-pro-photo-card">
      <button type="button" class="sf-pro-photo-thumb" data-pro-photo-preview="${escapeHtml(
        p.url
      )}" aria-label="${escapeHtml(p.title)}">
        <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.title)}" loading="lazy" />
      </button>
      <figcaption>
        <strong>${escapeHtml(p.title)}</strong>
        <span>${escapeHtml(p.categoryLabel || "")}</span>
        <span class="sf-pro-qnap ${p.qnapSyncStatus === "synced" ? "is-synced" : ""}">
          QNAP: ${p.qnapSyncStatus === "synced" ? "同期済" : "待機"}
        </span>
      </figcaption>
      <button type="button" class="sf-pro-photo-del" data-pro-photo-del="${escapeHtml(
        p.id
      )}">削除</button>
    </figure>`
    )
    .join("");
}

async function loadFieldPhotos() {
  const data = await fetchJson(
    `${HOME_API}/field-photos?siteId=${encodeURIComponent(currentHomeSiteId)}`
  );
  renderFieldPhotos(data.photos);
}

async function refreshProToolsPanels() {
  await Promise.all([loadTestOutputs(), loadFieldPhotos()]);
}

async function runTestPulse(outputId, building) {
  const body = {
    siteId: currentHomeSiteId,
    outputId,
    durationMs: 1000,
    actor: "operator-pro",
  };
  if (building) body.building = building;
  const data = await fetchJson(`${HOME_API}/hardware/test-pulse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  toast(data.message || "テスト出力を送信しました");
}

async function runSoftReboot() {
  const data = await fetchJson(`${HOME_API}/hardware/soft-reboot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: currentHomeSiteId,
      actor: "operator-pro",
    }),
  });
  toast(data.message || "ソフト再起動を要求しました");
}

async function runShellyColdReboot() {
  const data = await fetchJson(`${HOME_API}/hardware/shelly-cold-reboot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: currentHomeSiteId,
      actor: "operator-pro",
    }),
  });
  toast(data.message || "Shelly コールドリブートを実行しました");
}

async function uploadFieldPhoto(file, category, title) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const imageBase64 = btoa(binary);
  await fetchJson(`${HOME_API}/field-photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: currentHomeSiteId,
      category,
      title,
      fileName: file.name,
      imageBase64,
      actor: "operator-pro",
    }),
  });
  toast("現場写真を登録しました");
  await loadFieldPhotos();
}

async function syncFieldPhotosQnap() {
  const data = await fetchJson(`${HOME_API}/field-photos/qnap-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: currentHomeSiteId }),
  });
  toast(data.message || "QNAP 同期を開始しました");
  await loadFieldPhotos();
}

function openPhotoPreview(url) {
  const dlg = $("sf-pro-photo-lightbox");
  const img = $("sf-pro-photo-lightbox-img");
  if (!dlg || !img) return;
  img.src = url;
  dlg.showModal?.();
}

function bindProToolsUi() {
  if (window.__TISLY_SF_PRO_BOUND) return;
  window.__TISLY_SF_PRO_BOUND = true;

  $("sf-pro-test-grid")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-pro-output]");
    if (!btn) return;
    btn.disabled = true;
    try {
      await runTestPulse(
        btn.getAttribute("data-pro-output"),
        btn.getAttribute("data-pro-building") || undefined
      );
    } catch (err) {
      toast(err.message || "テスト出力に失敗");
    } finally {
      btn.disabled = false;
    }
  });

  $("sf-pro-soft-reboot")?.addEventListener("click", async () => {
    try {
      await runSoftReboot();
    } catch (err) {
      toast(err.message || "再起動に失敗");
    }
  });

  $("sf-pro-shelly-cold")?.addEventListener("click", async () => {
    try {
      await runShellyColdReboot();
    } catch (err) {
      toast(err.message || "Shelly リブートに失敗");
    }
  });

  $("sf-pro-photo-upload")?.addEventListener("click", () => {
    $("sf-pro-photo-file")?.click();
  });

  $("sf-pro-photo-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const category = $("sf-pro-photo-category")?.value || "wiring";
    const title = $("sf-pro-photo-title")?.value?.trim() || file.name;
    try {
      await uploadFieldPhoto(file, category, title);
      e.target.value = "";
      if ($("sf-pro-photo-title")) $("sf-pro-photo-title").value = "";
    } catch (err) {
      toast(err.message || "写真アップロードに失敗");
    }
  });

  $("sf-pro-photo-grid")?.addEventListener("click", async (e) => {
    const preview = e.target.closest("[data-pro-photo-preview]");
    if (preview) {
      openPhotoPreview(preview.getAttribute("data-pro-photo-preview"));
      return;
    }
    const del = e.target.closest("[data-pro-photo-del]");
    if (!del) return;
    const photoId = del.getAttribute("data-pro-photo-del");
    try {
      await fetchJson(
        `${HOME_API}/field-photos/${encodeURIComponent(photoId)}?siteId=${encodeURIComponent(
          currentHomeSiteId
        )}`,
        { method: "DELETE" }
      );
      toast("写真を削除しました");
      await loadFieldPhotos();
    } catch (err) {
      toast(err.message || "削除に失敗");
    }
  });

  $("sf-pro-qnap-sync")?.addEventListener("click", async () => {
    try {
      await syncFieldPhotosQnap();
    } catch (err) {
      toast(err.message || "QNAP 同期に失敗");
    }
  });

  document.addEventListener("tisly:property-scope-changed", (ev) => {
    const siteId =
      ev.detail?.siteId || $("sf-site-select")?.value || "SEC-JP-ITABASHI-LIVE";
    setHomeSite(siteId);
  });

  const initialSite = $("sf-site-select")?.value || "SEC-JP-ITABASHI-LIVE";
  setHomeSite(initialSite);
}

bindProToolsUi();

export { setHomeSite as refreshSecurityProToolsSiteV1 };
