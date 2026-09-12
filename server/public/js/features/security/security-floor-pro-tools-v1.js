/**
 * 社内向け Security 施工・保守 Pro ツール UI
 * /app/security-v1 専用（operator のみ）
 */

import {
  resolveHomeSiteId,
  resolveOtaSiteSlugV1,
  showSecurityRemoteToastV1,
} from "./security-floor-remote-config-v1.js";
import {
  getSelectedSiteId,
  onPropertyScopeChange,
} from "../../shared/property-scope-v1.js";

const HOME_API = "/api/home/v1";

let currentHomeSiteId = "HOME-JP-ITABASHI-LIVE";
let diPollTimer = null;

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

function setHomeSite(securitySiteId, opts = {}) {
  currentHomeSiteId = resolveHomeSiteId(securitySiteId);
  const label = $("sf-pro-site-label");
  if (label) {
    const names = {
      "HOME-JP-ITABASHI-LIVE": "板橋自宅",
      "HOME-JP-TOYOSHIMA": "豊島邸",
    };
    label.textContent = names[currentHomeSiteId] || "選択中の物件";
  }
  if (opts.silent) return;
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

function renderDiChannels(channels) {
  const root = $("sf-pro-di-list");
  if (!root) return;
  if (!channels?.length) {
    root.innerHTML = '<p class="sf-pro-hint">DI端子情報がありません</p>';
    return;
  }
  root.innerHTML = channels
    .map(
      (c) => `<div class="sf-pro-di-row ${c.state === "detecting" ? "is-on" : ""}">
      <div class="sf-pro-di-state">
        <span class="sf-pro-di-emoji" aria-hidden="true">${c.stateEmoji || "⚪"}</span>
        <div>
          <strong class="sf-pro-di-label">${escapeHtml(c.label)}</strong>
          <span class="sf-pro-di-sub">${escapeHtml(c.stateLabel || "OFF")}</span>
        </div>
      </div>
      <button type="button" class="sf-pro-di-trigger" data-pro-di="${escapeHtml(
        c.id
      )}" data-pro-building="${escapeHtml(c.building || "")}">
        ⚡ 擬似発報
      </button>
    </div>`
    )
    .join("");
}

async function loadDiStatus() {
  const data = await fetchJson(
    `${HOME_API}/hardware/di-status?siteId=${encodeURIComponent(currentHomeSiteId)}`
  );
  renderDiChannels(data.channels);
}

function startDiPolling() {
  stopDiPolling();
  loadDiStatus().catch(() => {});
  diPollTimer = setInterval(() => {
    loadDiStatus().catch(() => {});
    loadKittingPanel().catch(() => {});
  }, 2500);
}

function stopDiPolling() {
  if (diPollTimer) {
    clearInterval(diPollTimer);
    diPollTimer = null;
  }
}

async function runDiTrigger(diId, building) {
  const body = {
    siteId: currentHomeSiteId,
    diId,
    actor: "operator-pro",
  };
  if (building) body.building = building;
  const data = await fetchJson(`${HOME_API}/hardware/test-di-trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  toast(data.message || "DI擬似発報を実行しました");
  await loadDiStatus().catch(() => {});
}

async function loadFieldPhotos() {
  const data = await fetchJson(
    `${HOME_API}/field-photos?siteId=${encodeURIComponent(currentHomeSiteId)}`
  );
  renderFieldPhotos(data.photos);
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

async function refreshProToolsPanels() {
  await Promise.all([
    loadTestOutputs(),
    loadFieldPhotos(),
    loadDiStatus(),
    loadShellyFailsafe().catch(() => {}),
    loadHeartbeatWatch().catch(() => {}),
    loadOtaPanel().catch(() => {}),
    loadKittingPanel().catch(() => {}),
  ]);
  startDiPolling();
}

function readCurrentSiteId() {
  // ヘッダーで選択中の現場IDを
  // 配信のたびに動的に読む
  const selectId = $("sf-site-select")?.value || "";
  const scopeId = getSelectedSiteId() || "";
  const globalId =
    window.__TISLY_SELECTED_SITE_ID || window.__TISLY_SF_SITE_ID || "";
  return String(
    selectId || scopeId || globalId || currentHomeSiteId || ""
  ).trim();
}

function otaSiteSlug(rawId) {
  return resolveOtaSiteSlugV1(rawId || readCurrentSiteId());
}

function otaChannel() {
  return $("sf-ota-staging")?.checked ? "staging" : "production";
}

async function loadOtaPanel() {
  const liveId = readCurrentSiteId();
  if (liveId) setHomeSite(liveId, { silent: true });
  const slug = otaSiteSlug(liveId);
  const channel = otaChannel();
  const res = await fetch(
    `/api/firmware/${encodeURIComponent(slug)}/version?channel=${encodeURIComponent(
      channel
    )}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  const run = data.runningVersion || "1.0.0";
  const srv = data.version || "1.0.0";
  if ($("sf-ota-running")) {
    $("sf-ota-running").textContent = `v${run}`;
  }
  if ($("sf-ota-server")) {
    $("sf-ota-server").textContent = `v${srv}`;
  }
  const status = $("sf-ota-status");
  if (status) {
    if (data.has_ota_update || data.pending) {
      status.textContent =
        "次回ハートビート時に実機が自動更新されます";
    } else if (run === srv) {
      status.textContent = "現場は最新バージョンで稼働中";
    } else {
      status.textContent = "配信予約なし";
    }
  }
  renderKittingFromPayload(data);
}

function kittingTone(rgb, shippable) {
  if (shippable || rgb === "SHIPPABLE") return "green";
  if (rgb === "CONFIGURED") return "blue";
  if (rgb === "FAULT" || rgb === "UNCONFIGURED") return "red";
  return "wait";
}

function renderKittingFromPayload(data) {
  const kit = data?.kitting || {};
  const shippable = !!kit.shippable;
  const rgb = kit.rgbStatus || "UNCONFIGURED";
  const tone = kittingTone(rgb, shippable);
  const emoji =
    tone === "green" ? "🟢" : tone === "blue" ? "🔵" : tone === "red" ? "🔴" : "⚪";
  const label = kit.label
    ? `${emoji} ${kit.label}`
    : `${emoji} 検査待ち`;
  const labelEl = $("sf-kitting-label");
  const subEl = $("sf-kitting-sub");
  const dot = $("sf-kitting-dot");
  const checksEl = $("sf-kitting-checks");
  if (labelEl) labelEl.textContent = label;
  if (subEl) {
    subEl.textContent = `shippable: ${shippable ? "true" : "false"}`;
  }
  if (dot) {
    dot.classList.remove("is-green", "is-blue", "is-red", "is-wait");
    dot.classList.add(`is-${tone}`);
  }
  const device = Array.isArray(kit.devices) ? kit.devices[0] : null;
  const checks = device?.selfTest || kit.checks;
  if (checksEl) {
    if (checks) {
      checksEl.textContent = [
        `config ${checks.config ? "OK" : "NG"}`,
        `LAN ${checks.lan ? "OK" : "NG"}`,
        `HB ${checks.heartbeat ? "OK" : "NG"}`,
        `OTA ${checks.ota ? "OK" : "NG"}`,
      ].join(" / ");
    } else if (kit.reportedAt) {
      checksEl.textContent = "最終報告 " + String(kit.reportedAt);
    } else {
      checksEl.textContent = "config / LAN / HB / OTA 未受信";
    }
  }
}

async function loadKittingPanel() {
  const slug = otaSiteSlug(readCurrentSiteId());
  const res = await fetch(
    `/api/firmware/${encodeURIComponent(slug)}/version`,
    { cache: "no-store" }
  );
  const data = await res.json();
  renderKittingFromPayload(data);
}

async function deployOtaFirmware() {
  const allSites = !!$("sf-ota-all-sites")?.checked;
  const liveId = readCurrentSiteId();
  if (liveId) setHomeSite(liveId, { silent: true });
  // 単独配信は選択中現場だけ予約し
  // 板橋など固定現場へ飛ばさない
  const slug = allSites ? "all" : otaSiteSlug(liveId);
  const channel = otaChannel();
  const data = await fetchJson(`/api/firmware/${encodeURIComponent(slug)}/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      allSites,
      siteId: allSites ? "all" : liveId,
      currentSiteId: liveId,
    }),
  });
  toast(
    data.message ||
      "次回ハートビート時に実機が自動更新されます"
  );
  await loadOtaPanel();
}

function isToyoshimaHomeSite(siteId) {
  const id = String(siteId || "");
  return id.includes("TOYOSHIMA") || id.includes("TOSHIMA");
}

async function loadHeartbeatWatch() {
  const panel = $("sf-pro-heartbeat-watch");
  if (panel) {
    panel.hidden = !isToyoshimaHomeSite(currentHomeSiteId);
  }
  if (!isToyoshimaHomeSite(currentHomeSiteId)) return;
  const data = await fetchJson(
    `${HOME_API}/toyoshima/config?siteId=${encodeURIComponent(
      currentHomeSiteId
    )}`
  );
  const enabled = data.config?.heartbeatWatchEnabled !== false;
  const input = $("sf-pro-hb-watch");
  const label = $("sf-pro-hb-watch-label");
  const caption = $("sf-pro-hb-watch-caption");
  if (input) input.checked = enabled;
  const text = enabled ? "監視中（有効）" : "一時停止（無効）";
  if (label) label.textContent = text;
  if (caption) caption.textContent = text;
}

async function saveHeartbeatWatch(enabled) {
  const data = await fetchJson(`${HOME_API}/toyoshima/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: currentHomeSiteId,
      heartbeatWatchEnabled: !!enabled,
      actor: "operator-pro",
    }),
  });
  toast(data.message || "ハートビート監視設定を保存しました");
  await loadHeartbeatWatch();
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
  toast(data.message || "Shelly電源制御を実行しました");
}

function formatFailsafeLastAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function loadShellyFailsafe() {
  const data = await fetchJson(
    `${HOME_API}/hardware/shelly-failsafe?siteId=${encodeURIComponent(
      currentHomeSiteId
    )}`
  );
  const f = data.failsafe || {};
  const auto = $("sf-pro-shelly-auto");
  const autoLabel = $("sf-pro-shelly-auto-label");
  if (auto) auto.checked = !!f.autoRebootEnabled;
  if (autoLabel) autoLabel.textContent = f.autoRebootEnabled ? "ON" : "OFF";
  const host = $("sf-pro-shelly-host");
  if (host) host.value = f.shellyHost || "";
  const cloud = $("sf-pro-shelly-cloud");
  if (cloud) cloud.value = f.shellyCloudId || "";
  const auth = $("sf-pro-shelly-auth");
  if (auth) auth.value = "";
  const mask = $("sf-pro-shelly-auth-mask");
  if (mask) {
    mask.textContent = f.shellyAuthKeyMasked
      ? `登録済み: ${f.shellyAuthKeyMasked}`
      : "認証キー未設定";
  }
  const cool = $("sf-pro-shelly-cooldown");
  if (cool) cool.value = String(f.cooldownMinutes ?? 20);
  const last = $("sf-pro-shelly-last");
  if (last) {
    last.textContent = `最終自動再投入: ${formatFailsafeLastAt(
      f.lastAutoRebootAt
    )}`;
  }
  const script = $("sf-pro-shelly-script");
  if (script) {
    const rp =
      currentHomeSiteId.includes("TOYOSHIMA") ||
      currentHomeSiteId.includes("TOSHIMA")
        ? "http://192.168.1.50/"
        : "http://192.168.1.50/";
    script.href = `${HOME_API}/hardware/shelly-watchdog-script?siteId=${encodeURIComponent(
      currentHomeSiteId
    )}&rpTargetUrl=${encodeURIComponent(rp)}`;
  }
}

async function saveShellyFailsafe() {
  const body = {
    siteId: currentHomeSiteId,
    autoRebootEnabled: !!$("sf-pro-shelly-auto")?.checked,
    shellyHost: $("sf-pro-shelly-host")?.value || "",
    shellyCloudId: $("sf-pro-shelly-cloud")?.value || "",
    cooldownMinutes: Number($("sf-pro-shelly-cooldown")?.value) || 20,
    actor: "operator-pro",
  };
  const auth = ($("sf-pro-shelly-auth")?.value || "").trim();
  if (auth) body.shellyAuthKey = auth;
  const data = await fetchJson(`${HOME_API}/hardware/shelly-failsafe`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  toast(data.message || "電源フェイルセーフ設定を保存しました");
  await loadShellyFailsafe();
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

  $("sf-pro-di-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-pro-di]");
    if (!btn) return;
    btn.disabled = true;
    try {
      await runDiTrigger(
        btn.getAttribute("data-pro-di"),
        btn.getAttribute("data-pro-building") || undefined
      );
    } catch (err) {
      toast(err.message || "DI擬似発報に失敗");
    } finally {
      btn.disabled = false;
    }
  });

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
      toast(err.message || "Shelly電源制御に失敗");
    }
  });

  $("sf-pro-shelly-manual")?.addEventListener("click", async () => {
    try {
      await runShellyColdReboot();
    } catch (err) {
      toast(err.message || "Shelly電源制御に失敗");
    }
  });

  $("sf-pro-shelly-auto")?.addEventListener("change", () => {
    const on = !!$("sf-pro-shelly-auto")?.checked;
    const lab = $("sf-pro-shelly-auto-label");
    if (lab) lab.textContent = on ? "ON" : "OFF";
  });

  $("sf-pro-hb-watch")?.addEventListener("change", async () => {
    const on = !!$("sf-pro-hb-watch")?.checked;
    const lab = $("sf-pro-hb-watch-label");
    const caption = $("sf-pro-hb-watch-caption");
    const text = on ? "監視中（有効）" : "一時停止（無効）";
    if (lab) lab.textContent = text;
    if (caption) caption.textContent = text;
    try {
      await saveHeartbeatWatch(on);
    } catch (err) {
      toast(err.message || "監視設定の保存に失敗");
      await loadHeartbeatWatch().catch(() => {});
    }
  });

  $("sf-pro-shelly-save")?.addEventListener("click", async () => {
    try {
      await saveShellyFailsafe();
    } catch (err) {
      toast(err.message || "設定保存に失敗");
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

  $("sf-ota-deploy")?.addEventListener("click", async () => {
    const btn = $("sf-ota-deploy");
    if (btn) btn.disabled = true;
    try {
      await deployOtaFirmware();
    } catch (err) {
      toast(err.message || "OTA配信に失敗");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("sf-ota-refresh")?.addEventListener("click", async () => {
    try {
      await loadOtaPanel();
      toast("バージョンを再読込しました");
    } catch (err) {
      toast(err.message || "OTA状態の取得に失敗");
    }
  });

  $("sf-ota-all-sites")?.addEventListener("change", () => {
    const on = !!$("sf-ota-all-sites")?.checked;
    const lab = $("sf-ota-all-sites-label");
    if (lab) lab.textContent = on ? "ON" : "OFF";
  });

  $("sf-ota-staging")?.addEventListener("change", () => {
    const on = !!$("sf-ota-staging")?.checked;
    const lab = $("sf-ota-staging-label");
    if (lab) lab.textContent = on ? "ステージング" : "本番";
    loadOtaPanel().catch(() => {});
  });

  $("sf-site-select")?.addEventListener("change", (ev) => {
    setHomeSite(ev.target?.value || readCurrentSiteId());
  });

  onPropertyScopeChange((detail) => {
    const siteId =
      detail?.selectedSiteId ||
      $("sf-site-select")?.value ||
      "SEC-JP-ITABASHI-LIVE";
    setHomeSite(siteId);
  });

  const initialSite =
    getSelectedSiteId() ||
    $("sf-site-select")?.value ||
    window.__TISLY_SF_SITE_ID ||
    "SEC-JP-ITABASHI-LIVE";
  setHomeSite(initialSite);
}

bindProToolsUi();

export { setHomeSite as refreshSecurityProToolsSiteV1 };
