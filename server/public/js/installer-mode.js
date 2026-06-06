import { apiGet, getAdminToken } from "./api.js";
import { loadConnectionBadges } from "./connection-badges.js";
import { loadInstallerI18n, setInstallerLocale, applyInstallerI18n, t, getLocale } from "./installer-i18n.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
const OFFLINE_KEY = `tisly_installer_queue_${customerCode}`;
const DRY_RUN_KEY = `tisly_installer_dry_run_${customerCode}`;
const LAST_SYNC_KEY = `tisly_installer_last_sync_${customerCode}`;
const CONFLICT_KEY = `tisly_installer_conflicts_${customerCode}`;
const SYNC_UI_KEY = `tisly_installer_sync_ui_${customerCode}`;
const IDB_NAME = "tisly_installer_offline_v1";
let lastSyncReport = null;
let fieldLiveStatus = null;
let dashboardData = null;

const NEXT_STEP_LABELS = {
  register_device: "設備を登録",
  map_placement: "マップに配置",
  connectivity_test: "通信テスト",
  mqtt_live_test: "Live MQTT (ACK)",
  checklist_complete: "チェックリスト完了",
  install_photos: "施工写真",
  completion_report: "完了レポート",
};

document.getElementById("install-code").textContent = customerCode;
loadConnectionBadges("tisly-installer-badges").catch(() => {});
setInterval(() => loadConnectionBadges("tisly-installer-badges").catch(() => {}), 30000);
document.getElementById("link-map").href = `/customer/${customerCode}/map`;
document.getElementById("link-portal").href = `/customer/${customerCode}`;
document.getElementById("link-home")?.setAttribute("href", `/customer/${customerCode}/install/home`);
document.getElementById("link-install-guide")?.setAttribute("href", `/customer/${customerCode}/install/guide`);
document.getElementById("link-map-full").href = `/customer/${customerCode}/map`;
document.getElementById("link-labels-csv").href = `/api/customer/${customerCode}/devices/labels.csv`;

let sites = [];
let devices = [];
let selectedSiteId = null;
let selectedFloorId = null;
let qrScanner = null;
let installSessionId = null;

function isDryRun() {
  return localStorage.getItem(DRY_RUN_KEY) === "1";
}

function updateDryRunUi() {
  const on = isDryRun();
  document.getElementById("dry-run-banner").hidden = !on;
  document.getElementById("dry-run-toggle").checked = on;
}

function installHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isDryRun()) headers["X-TiSLY-Dry-Run"] = "1";
  return headers;
}

async function installPost(path, body) {
  const payload = { ...(body ?? {}) };
  if (isDryRun()) payload.dryRun = true;
  const res = await fetch(path, {
    method: "POST",
    headers: installHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("認証が必要です — ログインしてください");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function installGet(path) {
  const url = isDryRun() && !path.includes("?") ? `${path}?dryRun=1` : path;
  const res = await fetch(url, { headers: installHeaders() });
  if (res.status === 401) throw new Error("認証が必要です — ログインしてください");
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function setStatus(msg) {
  document.getElementById("install-status").textContent = msg;
}

function openOfflineIdb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function touchIdbPlaceholder() {
  const db = await openOfflineIdb();
  if (!db) return;
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ at: new Date().toISOString() }, "last_touch");
}

function getQueueLength() {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch {
    return 0;
  }
}

function updateOfflineStatusBar() {
  const online = navigator.onLine;
  const dot = document.getElementById("offline-online-dot");
  const state = document.getElementById("offline-state-text");
  if (dot) {
    dot.classList.toggle("online", online);
    dot.classList.toggle("offline", !online);
  }
  if (state) state.textContent = online ? "オンライン" : "オフライン中";
  const qc = document.getElementById("offline-queue-count");
  if (qc) qc.textContent = `未同期: ${getQueueLength()}`;
  const ls = document.getElementById("offline-last-sync");
  const last = localStorage.getItem(LAST_SYNC_KEY);
  if (ls) ls.textContent = `最終同期: ${last ? new Date(last).toLocaleString("ja-JP") : "—"}`;
  const hint = document.getElementById("offline-hint");
  if (hint) {
    hint.textContent =
      getQueueLength() > 0
        ? t("offline.queue", `オフラインキュー: ${getQueueLength()} 件`)
        : t("offline.empty", "オフラインキュー: 空");
  }
}

function notifyServiceWorkerQueue() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "QUEUE_UPDATED" });
  }
}

function loadOfflineQueue() {
  updateOfflineStatusBar();
  touchIdbPlaceholder().catch(() => {});
  notifyServiceWorkerQueue();
}

function saveConflictResults(results) {
  if (!results?.length) return;
  const conflicts = results.filter((r) =>
    ["conflict", "rejected", "skipped"].includes(r.status)
  );
  if (!conflicts.length) return;
  localStorage.setItem(CONFLICT_KEY, JSON.stringify(conflicts));
  renderConflictPanel(conflicts);
}

function renderConflictPanel(items) {
  const panel = document.getElementById("offline-conflict-panel");
  const list = document.getElementById("offline-conflict-list");
  if (!panel || !list) return;
  panel.hidden = !items.length;
  list.innerHTML = items
    .map(
      (r) =>
        `<li class="${r.status}"><label><input type="checkbox" data-id="${r.id}" /> [${r.status}] ${r.action}: ${r.message}</label></li>`
    )
    .join("");
}

function queueOffline(action, body) {
  const raw = localStorage.getItem(OFFLINE_KEY);
  const q = raw ? JSON.parse(raw) : [];
  const id = `q-${Date.now()}`;
  q.push({ action, body, at: new Date().toISOString(), id });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  const ui = q.map((item) => ({ id: item.id, action: item.action, status: "pending", message: "queued offline" }));
  persistSyncUiState(ui);
  loadOfflineQueue();
}

function mapQueueToSyncEntries(queue) {
  const actionMap = {
    qrClaim: "qr_claim",
    nfcClaim: "nfc_claim",
    mapPlacement: "map_placement",
    checklist: "checklist_complete",
    photo: "photo_upload",
    test: "test_result",
    wizard: "test_result",
    createSite: "test_result",
    mqttTest: "mqtt_test_result",
  };
  return queue.map((item) => {
    const body = { ...(item.body ?? {}) };
    if (item.action === "photo" && body.imageBase64) {
      body.customerCode = customerCode;
    }
    return {
      id: item.id,
      action: actionMap[item.action] ?? "test_result",
      clientAt: item.at,
      body,
    };
  });
}

function persistSyncUiState(entries) {
  localStorage.setItem(SYNC_UI_KEY, JSON.stringify(entries));
  renderSyncStatusList(entries);
}

function renderSyncStatusList(entries) {
  const list = document.getElementById("offline-sync-list");
  if (!list) return;
  if (!entries?.length) {
    list.hidden = true;
    list.innerHTML = "";
    return;
  }
  list.hidden = false;
  list.innerHTML = entries
    .map((e) => `<li class="sync-${e.status}"><span>${e.action}</span> <em>${e.status}</em> — ${e.message ?? ""}</li>`)
    .join("");
}

function buildQueueSyncUiFromReport(report, queue) {
  const statusMap = {
    applied: "synced",
    skipped: "pending",
    rejected: "failed",
    conflict: "conflict",
    warning: "failed",
    merged: "synced",
  };
  const byId = new Map((report.results ?? []).map((r) => [r.id, r]));
  return queue.map((item) => {
    const r = byId.get(item.id);
    const status = r ? statusMap[r.status] ?? r.status : "pending";
    return {
      id: item.id,
      action: item.action,
      status,
      message: r?.message ?? "pending",
    };
  });
}

async function flushOfflineQueue() {
  const raw = localStorage.getItem(OFFLINE_KEY);
  const q = raw ? JSON.parse(raw) : [];
  if (!q.length) {
    setStatus(t("sync.empty", "同期するキューがありません"));
    return;
  }
  if (!navigator.onLine) {
    setStatus(t("sync.offline", "オフライン — 復帰後に同期してください"));
    return;
  }
  const entries = mapQueueToSyncEntries(q);
  const report = await installPost(`/api/customer/${customerCode}/install/sync`, { entries });
  lastSyncReport = report;
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  persistSyncUiState(buildQueueSyncUiFromReport(report, q));
  const errEl = document.getElementById("offline-sync-errors");
  if (report.results) saveConflictResults(report.results);
  if (report.rejected > 0 || report.warnings > 0) {
    const msg = `適用 ${report.applied} / 拒否 ${report.rejected} / 警告 ${report.warnings}`;
    setStatus(t("sync.partial", `同期: ${msg}`));
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = (report.results ?? [])
        .filter((r) => r.status !== "applied")
        .map((r) => `${r.status}: ${r.message}`)
        .join(" · ");
    }
  } else {
    localStorage.removeItem(OFFLINE_KEY);
    localStorage.removeItem(CONFLICT_KEY);
    document.getElementById("offline-conflict-panel")?.setAttribute("hidden", "");
    if (errEl) errEl.hidden = true;
    setStatus(t("sync.done", `同期完了: ${report.applied} 件適用`));
  }
  loadOfflineQueue();
  await loadDevices();
  await loadDashboard();
}

document.querySelectorAll("#installer-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#installer-tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".installer-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.panel}`)?.classList.add("active");
  });
});

function fillSelect(sel, items, valueKey, labelFn) {
  sel.innerHTML = "";
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    sel.appendChild(opt);
  }
}

function renderNextSteps(d) {
  const ul = document.getElementById("next-steps-list");
  if (!ul) return;
  const steps = d?.nextSteps ?? [];
  ul.innerHTML = steps
    .map((s) => `<li><button type="button" class="btn secondary btn-sm btn-next-step" data-step="${s}">${NEXT_STEP_LABELS[s] ?? s}</button></li>`)
    .join("");
  ul.querySelectorAll(".btn-next-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const map = {
        register_device: "device",
        map_placement: "map",
        connectivity_test: "comm",
        mqtt_live_test: "mqtt",
        checklist_complete: "done",
        install_photos: "photos",
        completion_report: "done",
      };
      const panel = map[btn.dataset.step] ?? "dash";
      document.querySelector(`#installer-tabs button[data-panel="${panel}"]`)?.click();
    });
  });
}

function renderIncompleteDevices(d) {
  const list = document.getElementById("incomplete-devices-list");
  const only = document.getElementById("show-incomplete-only")?.checked;
  if (!list) return;
  const items = d?.incompleteOnly ?? [];
  list.hidden = !only || !items.length;
  if (!only) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = items.map((i) => `<li class="status-warn">${i.deviceId} — ${i.reason}</li>`).join("");
}

async function loadFieldLiveStatus() {
  try {
    fieldLiveStatus = await apiGet(`/api/customer/${customerCode}/install/field-live-status`);
    const banner = document.getElementById("field-mode-banner");
    if (banner && fieldLiveStatus) {
      const live = fieldLiveStatus.field_live_mode ? "LIVE" : "MOCK";
      banner.textContent = `Field: ${live} · MQTT ACK: ${fieldLiveStatus.mqtt_ack_required ? "required" : "off"} · Cert: ${fieldLiveStatus.cert_provisioning_mode} · Storage: ${fieldLiveStatus.storage_provider}`;
      banner.classList.toggle("mode-live", fieldLiveStatus.field_live_mode);
      banner.classList.toggle("mode-mock", !fieldLiveStatus.field_live_mode);
    }
  } catch {
    /* */
  }
}

async function loadDashboard() {
  try {
    const d = await apiGet(`/api/customer/${customerCode}/install/dashboard`);
    dashboardData = d;
    document.getElementById("dash-registered").textContent = String(d.registered ?? "—");
    document.getElementById("dash-unplaced").textContent = String(d.unplaced ?? "—");
    document.getElementById("dash-untested").textContent = String(d.untested ?? "—");
    document.getElementById("dash-comm-ok").textContent = String(d.commOk ?? "—");
    document.getElementById("dash-comm-ng").textContent = String(d.commNg ?? "—");
    document.getElementById("dash-completion").textContent = String(d.completionRate ?? "—");
    renderNextSteps(d);
    renderIncompleteDevices(d);
  } catch {
    /* */
  }
}

async function loadPhotos() {
  const data = await installGet(`/api/customer/${customerCode}/install/photos`);
  const list = document.getElementById("photo-list");
  if (!list) return;
  list.innerHTML = (data.photos ?? [])
    .map(
      (p) =>
        `<li>${p.deviceId ?? "site"} — <a href="${p.url}" target="_blank">${p.photoPath}</a>
         <button type="button" data-photo-id="${p.id}" class="btn secondary btn-sm btn-photo-del">削除</button></li>`
    )
    .join("");
  list.querySelectorAll(".btn-photo-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/customer/${customerCode}/install/photos/${btn.dataset.photoId}`, {
        method: "DELETE",
        headers: installHeaders(),
      });
      await loadPhotos();
    });
  });
}

function syncDeviceSelects() {
  const opts = devices.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
  for (const id of ["test-device-select", "mqtt-device-select", "check-device-select", "photo-device-select"]) {
    const sel = document.getElementById(id);
    if (sel) fillSelect(sel, opts, "id", (o) => o.label);
  }
  const list = document.getElementById("device-placement-list");
  if (list) {
    list.innerHTML = devices
      .map(
        (d) =>
          `<li>${d.label || d.deviceId} — ${d.mapPosition ? "配置済" : "未配置"} / ${d.commissioningStatus ?? "draft"} / cert:${d.certStatus ?? "none"}</li>`
      )
      .join("");
  }
  const tbody = document.getElementById("install-devices");
  if (tbody) {
    tbody.innerHTML = devices
      .map(
        (d) =>
          `<div class="checklist-item">${d.deviceId} <small>${d.deviceType}</small> ${d.online ? "🟢" : "🟠"}</div>`
      )
      .join("");
  }
}

async function loadSites() {
  const data = await apiGet(`/api/customer/${customerCode}/sites/builder`);
  sites = data.sites ?? [];
  const siteSel = document.getElementById("site-select");
  siteSel.innerHTML = "";
  for (const s of sites) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    siteSel.appendChild(opt);
  }
  selectedSiteId = sites[0]?.id ?? null;
  refreshFloors();
}

function refreshFloors() {
  const site = sites.find((s) => s.id === selectedSiteId);
  const floorSel = document.getElementById("floor-select");
  floorSel.innerHTML = "";
  for (const f of site?.floors ?? []) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    floorSel.appendChild(opt);
  }
  selectedFloorId = floorSel.value || null;
}

async function loadDevices() {
  const data = await apiGet(`/api/customer/${customerCode}/install`);
  devices = (data.devices ?? []).map((d) => ({
    ...d,
    commissioningStatus: d.commissioningStatus ?? d.commissioning_status,
    certStatus: d.certStatus ?? d.cert_status,
  }));
  syncDeviceSelects();
}

async function loadTemplates() {
  const data = await apiGet(`/api/customer/${customerCode}/device-templates`);
  const sel = document.getElementById("device-type-select");
  sel.innerHTML = (data.templates ?? [])
    .map((t) => `<option value="${t.deviceType}">${t.name}</option>`)
    .join("");
}

function setupNfcUi() {
  const hasNdef = typeof window.NDEFReader !== "undefined";
  document.getElementById("nfc-web-section").hidden = !hasNdef;
  document.getElementById("nfc-manual-section").hidden = hasNdef ? false : false;
}

async function readNfcTag() {
  const status = document.getElementById("nfc-read-status");
  try {
    const reader = new window.NDEFReader();
    status.textContent = "タグを端末に近づけてください…";
    await reader.scan();
    reader.addEventListener(
      "reading",
      (ev) => {
        const uid = ev.serialNumber ?? "";
        document.getElementById("nfc-uid").value = uid;
        status.textContent = `読取: ${uid}`;
      },
      { once: true }
    );
  } catch (e) {
    status.textContent = `NFC失敗: ${e} — UID手入力を使用`;
  }
}

function onQrDecoded(text) {
  document.getElementById("qr-payload").value = text;
  try {
    const p = JSON.parse(text);
    if (p.device_id) document.getElementById("qr-device-id").value = p.device_id;
    if (p.device_type) document.getElementById("qr-device-type").value = p.device_type;
    if (p.serial_number) document.getElementById("qr-serial").value = p.serial_number;
  } catch {
    /* manual */
  }
  setStatus("QR読取完了 — Claim を実行できます");
}

async function startQrCamera() {
  const hint = document.getElementById("qr-scan-hint");
  document.getElementById("btn-qr-scan-stop").hidden = false;

  if ("BarcodeDetector" in window) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.srcObject = stream;
      await video.play();
      const region = document.getElementById("qr-reader");
      region.innerHTML = "";
      region.appendChild(video);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!video.srcObject) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) {
            onQrDecoded(codes[0].rawValue);
            stopQrCamera();
            return;
          }
        } catch {
          /* */
        }
        requestAnimationFrame(tick);
      };
      hint.textContent = "BarcodeDetector API でスキャン中";
      requestAnimationFrame(tick);
      qrScanner = { stop: () => stream.getTracks().forEach((t) => t.stop()) };
      return;
    } catch {
      hint.textContent = "BarcodeDetector 失敗 — html5-qrcode にフォールバック";
    }
  }

  if (typeof window.Html5Qrcode !== "undefined") {
    qrScanner = new window.Html5Qrcode("qr-reader");
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 8, qrbox: { width: 200, height: 200 } },
      (decoded) => {
        onQrDecoded(decoded);
        stopQrCamera();
      },
      () => {}
    );
    hint.textContent = "html5-qrcode でスキャン中";
    return;
  }

  hint.textContent = "カメラライブラリ不可 — JSON 手入力を使用";
  document.getElementById("btn-qr-scan-stop").hidden = true;
}

async function stopQrCamera() {
  document.getElementById("btn-qr-scan-stop").hidden = true;
  if (qrScanner?.stop) {
    try {
      if (qrScanner.stop instanceof Function) await qrScanner.stop();
      else await qrScanner.stop();
    } catch {
      /* */
    }
    try {
      await qrScanner.clear?.();
    } catch {
      /* */
    }
  }
  qrScanner = null;
  const region = document.getElementById("qr-reader");
  if (region) region.innerHTML = "";
}

document.getElementById("site-select")?.addEventListener("change", (e) => {
  selectedSiteId = e.target.value;
  refreshFloors();
});

document.getElementById("dry-run-toggle")?.addEventListener("change", (e) => {
  if (e.target.checked) localStorage.setItem(DRY_RUN_KEY, "1");
  else localStorage.removeItem(DRY_RUN_KEY);
  updateDryRunUi();
});

document.getElementById("btn-offline-sync")?.addEventListener("click", () => flushOfflineQueue().catch((err) => setStatus(String(err)));
document.getElementById("btn-offline-flush")?.addEventListener("click", () => flushOfflineQueue().catch((err) => setStatus(String(err)));
document.getElementById("btn-refresh-dashboard")?.addEventListener("click", () => loadDashboard());

document.getElementById("btn-conflict-merge")?.addEventListener("click", () => {
  const checked = [...document.querySelectorAll("#offline-conflict-list input:checked")].map((el) => el.dataset.id);
  if (!checked.length) return;
  const raw = localStorage.getItem(CONFLICT_KEY);
  const items = raw ? JSON.parse(raw) : [];
  const merged = items.map((r) =>
    checked.includes(r.id) ? { ...r, status: "merged", message: `${r.message} (manual merge)` } : r
  );
  localStorage.setItem(CONFLICT_KEY, JSON.stringify(merged));
  renderConflictPanel(merged);
  setStatus("merged としてマークしました（サーバー再同期は別途）");
});

document.getElementById("btn-conflict-skip")?.addEventListener("click", () => {
  localStorage.removeItem(CONFLICT_KEY);
  document.getElementById("offline-conflict-panel")?.setAttribute("hidden", "");
  setStatus("競合を skipped 扱いでクリア");
});

document.getElementById("locale-select")?.addEventListener("change", (e) => {
  setInstallerLocale(e.target.value);
  applyInstallerI18n();
  updateOfflineStatusBar();
});

document.getElementById("btn-photo-upload")?.addEventListener("click", async () => {
  const file = document.getElementById("photo-file")?.files?.[0];
  if (!file) return;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext !== "jpg" && ext !== "jpeg" && ext !== "png") {
    setStatus("jpg / png のみアップロードできます");
    return;
  }
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deviceId = document.getElementById("photo-device-select")?.value;
  const photoType = document.getElementById("photo-type-select")?.value ?? "install";
  if (!navigator.onLine) {
    queueOffline("photo", { deviceId, fileName: file.name, imageBase64: b64, photoType, customerCode });
    setStatus("オフライン: 写真をキューに保存");
    return;
  }
  await installPost(`/api/customer/${customerCode}/install/photos/upload`, {
    deviceId,
    imageBase64: b64,
    fileName: file.name,
    photoType,
  });
  await loadPhotos();
  setStatus("写真アップロード完了");
});

document.getElementById("btn-csr-register")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const csrPem = document.getElementById("csr-pem").value;
  const res = await installPost(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/csr`, { csrPem });
  document.getElementById("cert-result").textContent = JSON.stringify(res, null, 2);
});

document.getElementById("btn-cert-issue")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const res = await installPost(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/cert/issue`, {});
  document.getElementById("cert-result").textContent = JSON.stringify(res, null, 2);
  await loadDevices();
});

document.getElementById("btn-cert-status")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const res = await installGet(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/cert/status`);
  document.getElementById("cert-result").textContent = JSON.stringify(res, null, 2);
});

document.getElementById("btn-new-site")?.addEventListener("click", async () => {
  const name = prompt("現場名");
  if (!name) return;
  if (!navigator.onLine || isDryRun()) {
    queueOffline("createSite", { name });
    setStatus(isDryRun() ? "ドライラン: 現場作成ログのみ" : "オフライン: 現場作成をキューに保存");
    return;
  }
  await installPost(`/api/customer/${customerCode}/sites`, { name });
  await loadSites();
  setStatus(`現場作成: ${name}`);
});

document.getElementById("btn-session-start")?.addEventListener("click", async () => {
  const res = await installPost(`/api/customer/${customerCode}/install/session/start`, {
    siteId: selectedSiteId,
    mode: isDryRun() ? "dry_run" : "live",
  });
  installSessionId = res.id;
  setStatus(`施工セッション開始: ${res.id}`);
});

document.getElementById("floor-upload")?.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file || !selectedFloorId) return;
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  await installPost(`/api/customer/${customerCode}/floors/upload`, {
    floorId: selectedFloorId,
    fileName: file.name,
    mimeType: file.type,
    imageBase64: b64,
  });
  setStatus("図面アップロード完了");
});

document.getElementById("btn-archive-floor")?.addEventListener("click", async () => {
  if (!selectedFloorId) return;
  const res = await installPost(`/api/customer/${customerCode}/floorplans/${selectedFloorId}/archive`, {});
  setStatus(res.message ?? "アーカイブ完了");
});

document.getElementById("device-wizard")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    serial: fd.get("serial"),
    type: fd.get("type"),
    room: fd.get("room") || undefined,
    siteId: selectedSiteId || undefined,
    floor: selectedFloorId || undefined,
  };
  if (!navigator.onLine || isDryRun()) {
    queueOffline("wizard", body);
    setStatus(isDryRun() ? "ドライラン: 登録ログのみ" : "オフライン: 登録をキューに保存");
    return;
  }
  const res = await installPost(`/api/customer/${customerCode}/devices/wizard`, body);
  setStatus(`登録: ${res.deviceId}`);
  await loadDevices();
});

document.getElementById("btn-qr-create")?.addEventListener("click", async () => {
  const deviceId = document.getElementById("qr-device-id").value.trim();
  const deviceType = document.getElementById("qr-device-type").value.trim();
  const serialNumber = document.getElementById("qr-serial").value.trim();
  const res = await installPost(`/api/customer/${customerCode}/devices/qr/create`, {
    deviceId,
    deviceType,
    serialNumber,
  });
  document.getElementById("qr-payload").value = res.qrPayload;
  document.getElementById("qr-result").textContent = `expires: ${res.expiresAt}`;
});

document.getElementById("btn-qr-claim")?.addEventListener("click", async () => {
  let payload;
  try {
    payload = JSON.parse(document.getElementById("qr-payload").value);
  } catch {
    setStatus("QR JSON が不正です");
    return;
  }
  if (!navigator.onLine) {
    queueOffline("qrClaim", { ...payload, siteId: selectedSiteId, floorId: selectedFloorId });
    setStatus("オフライン: QR claim をキューに保存");
    return;
  }
  const res = await installPost(`/api/customer/${customerCode}/devices/qr/claim`, {
    device_id: payload.device_id,
    device_type: payload.device_type,
    serial_number: payload.serial_number,
    provisioning_token: payload.provisioning_token,
    siteId: selectedSiteId,
    floorId: selectedFloorId,
  });
  document.getElementById("qr-result").textContent = JSON.stringify(res, null, 2);
  if (!isDryRun()) await loadDevices();
  setStatus(res.dryRun ? "ドライラン QR Claim（DB未更新）" : "QR Claim 完了");
});

document.getElementById("btn-qr-scan-start")?.addEventListener("click", () => {
  startQrCamera().catch((e) => setStatus(`カメラ: ${e} — 手入力へ`));
});
document.getElementById("btn-qr-scan-stop")?.addEventListener("click", () => stopQrCamera());

document.getElementById("btn-nfc-read")?.addEventListener("click", () => readNfcTag());
document.getElementById("btn-nfc-claim")?.addEventListener("click", async () => {
  const nfcUid = document.getElementById("nfc-uid").value.trim();
  if (!navigator.onLine) {
    queueOffline("nfcClaim", { nfcUid, siteId: selectedSiteId, floorId: selectedFloorId });
    setStatus("オフライン: NFC claim をキュー");
    return;
  }
  const res = await installPost(`/api/customer/${customerCode}/devices/nfc/claim`, {
    nfcUid,
    siteId: selectedSiteId,
    floorId: selectedFloorId,
  });
  setStatus(res.dryRun ? "ドライラン NFC Claim" : `NFC: ${res.deviceId}`);
  if (!isDryRun()) await loadDevices();
});

document.querySelectorAll("[data-test]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.dataset.test;
    const id = document.getElementById("test-device-select").value;
    const res = await installPost(
      `/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/test/${kind}`,
      {}
    );
    document.getElementById("test-result").textContent = JSON.stringify(res, null, 2);
    if (!isDryRun()) await loadDevices();
  });
});

document.getElementById("btn-mqtt-refresh")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const res = await apiGet(`/api/customer/${customerCode}/install/mqtt/${encodeURIComponent(id)}`);
  document.getElementById("mqtt-diag").textContent = JSON.stringify(res, null, 2);
});

document.getElementById("btn-mqtt-rtt")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const res = await installPost(
    `/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/test/mqtt-rtt`,
    {}
  );
  const el = document.getElementById("mqtt-diag");
  el.textContent = JSON.stringify(res, null, 2);
  el.classList.toggle("result-ok", res.ok);
  el.classList.toggle("result-fail", !res.ok);
});

document.getElementById("btn-mqtt-live")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  if (!navigator.onLine) {
    queueOffline("mqttTest", { deviceId: id, rtt_ms: 50, mock: true });
    setStatus("オフライン: MQTT テスト結果をキューに保存");
    return;
  }
  const res = await installPost(
    `/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/test/live-mqtt`,
    {}
  );
  const el = document.getElementById("mqtt-diag");
  el.textContent = JSON.stringify(res, null, 2);
  el.classList.toggle("result-ok", res.ok);
  el.classList.toggle("result-fail", !res.ok);
});

document.getElementById("btn-firmware-config")?.addEventListener("click", async () => {
  const id = document.getElementById("mqtt-device-select").value;
  const res = await installGet(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/firmware-config`);
  document.getElementById("mqtt-diag").textContent = JSON.stringify(res, null, 2);
});

async function loadChecklist() {
  const id = document.getElementById("check-device-select").value;
  if (!id) return;
  const all = await apiGet(`/api/customer/${customerCode}/install/checklist`);
  const dev = (all.devices ?? []).find((d) => d.deviceId === id);
  const box = document.getElementById("checklist-items");
  box.innerHTML = (dev?.items ?? [])
    .map(
      (i) =>
        `<div class="checklist-item ${i.completed ? "done" : ""}">${i.label} ${i.completed ? "✓" : ""}</div>`
    )
    .join("");
}

document.getElementById("check-device-select")?.addEventListener("change", loadChecklist);

function openReport(format, locale = "ja") {
  const dry = isDryRun() ? "&dryRun=1" : "";
  const loc = locale === "en" ? "&locale=en" : "&locale=ja";
  const url = `/api/customer/${customerCode}/install/completion-report?format=${format}${loc}${dry}`;
  if (format === "pdf") {
    fetch(url, { headers: installHeaders() })
      .then((res) =>
        res.blob().then((blob) => ({
          blob,
          isPdf: (res.headers.get("content-type") ?? "").includes("pdf"),
        }))
      )
      .then(({ blob, isPdf }) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `install-report.${isPdf ? "pdf" : "html"}`;
        a.click();
      })
      .catch(() => window.open(url, "_blank"));
    return;
  }
  window.open(url, "_blank");
}

document.getElementById("btn-completion-report")?.addEventListener("click", () => openReport("html", "ja"));
document.getElementById("btn-completion-pdf")?.addEventListener("click", () => openReport("pdf", "ja"));
document.getElementById("btn-completion-report-en")?.addEventListener("click", () => openReport("html", "en"));

document.getElementById("show-incomplete-only")?.addEventListener("change", () => {
  if (dashboardData) renderIncompleteDevices(dashboardData);
});

document.getElementById("btn-label")?.addEventListener("click", async () => {
  const id = document.getElementById("check-device-select").value;
  const res = await apiGet(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/label`);
  window.open(`/api/customer/${customerCode}/devices/${encodeURIComponent(id)}/label.svg`, "_blank");
  alert(res.labelText + "\n\nQR payload length: " + (res.qrPayload?.length ?? 0));
});

function updateLabelLinks() {
  const id = document.getElementById("check-device-select")?.value;
  const enc = id ? encodeURIComponent(id) : "";
  const base = `/api/customer/${customerCode}/devices`;
  const json = document.getElementById("link-label-json");
  const qr = document.getElementById("link-qr-svg");
  const tepra = document.getElementById("link-label-tepra");
  const brother = document.getElementById("link-label-brother");
  if (json && id) json.href = `${base}/${enc}/label.json`;
  if (qr && id) qr.href = `${base}/${enc}/qr.svg`;
  if (tepra) tepra.href = `/api/customer/${customerCode}/devices/labels/tepra.csv`;
  if (brother) brother.href = `/api/customer/${customerCode}/devices/labels/brother.csv`;
}
document.getElementById("check-device-select")?.addEventListener("change", updateLabelLinks);

async function init() {
  if (!getAdminToken()) {
    location.href = `/customer/${customerCode}`;
    return;
  }
  await loadInstallerI18n();
  const locSel = document.getElementById("locale-select");
  if (locSel) locSel.value = getLocale();
  applyInstallerI18n();
  updateDryRunUi();
  setupNfcUi();
  loadOfflineQueue();
  const savedConflicts = localStorage.getItem(CONFLICT_KEY);
  if (savedConflicts) renderConflictPanel(JSON.parse(savedConflicts));
  const savedSyncUi = localStorage.getItem(SYNC_UI_KEY);
  if (savedSyncUi) renderSyncStatusList(JSON.parse(savedSyncUi));
  await Promise.all([
    loadSites(),
    loadDevices(),
    loadTemplates(),
    loadDashboard(),
    loadPhotos(),
    loadFieldLiveStatus(),
  ]);
  updateLabelLinks();
  setStatus(t("status.ready", "施工 PWA 準備完了（Phase 441–460）"));
  await loadChecklist();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").then((reg) => {
    reg.sync?.register?.("tisly-installer-sync").catch(() => {});
    reg.active?.postMessage?.({ type: "REGISTER_SYNC" });
  }).catch(() => {});
}

navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type === "FLUSH_OFFLINE_QUEUE") {
    flushOfflineQueue().catch((e) => setStatus(String(e)));
  }
});

window.addEventListener("online", () => {
  updateOfflineStatusBar();
  const q = getQueueLength();
  if (q) setStatus(t("sync.online_hint", "オンライン復帰 — 同期ボタンで送信できます"));
});
window.addEventListener("offline", () => updateOfflineStatusBar());

init().catch((e) => setStatus(String(e)));
