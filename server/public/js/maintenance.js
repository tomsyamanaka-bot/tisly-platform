import { renderPwaTopbar } from "./tisly-pwa-shell.js";
import {
  getCustomerToken,
  requireCustomerLogin,
  customerCodeFromPath,
} from "./customer-auth.js";

const MEMO_KEY = "tisly_maint_memo";
const OFFLINE_CASES_KEY = "tisly_maint_offline_cases";

const pathCustomerMatch = location.pathname.match(/\/customer\/([^/]+)\/maintenance/i);
const lockedCustomerCode = pathCustomerMatch ? pathCustomerMatch[1].toUpperCase() : null;

function apiHeaders() {
  const token = getCustomerToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function apiGet(path) {
  const res = await fetch(path, { headers: apiHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function customerCode() {
  return document.getElementById("maint-customer")?.value || "TOMS001";
}

async function loadSites() {
  const code = customerCode();
  const sel = document.getElementById("maint-site");
  try {
    const data = await apiGet(`/api/customer/${code}/sites`);
    const sites = data.sites ?? [];
    sel.innerHTML =
      sites.map((s) => `<option value="${s.id}">${s.name ?? s.id}</option>`).join("") ||
      '<option value="">サイトなし</option>';
  } catch {
    sel.innerHTML = '<option value="">要ログイン</option>';
  }
}

async function loadDevices() {
  const code = customerCode();
  const list = document.getElementById("maint-devices");
  list.innerHTML = "<li>読込中…</li>";
  try {
    const data = await apiGet(`/api/customer/${code}/devices`);
    const devices = data.devices ?? data ?? [];
    list.innerHTML = (Array.isArray(devices) ? devices : [])
      .slice(0, 12)
      .map(
        (d) =>
          `<li>${d.label ?? d.deviceId} — <strong>${d.deviceStatus ?? d.status ?? "—"}</strong></li>`
      )
      .join("") || "<li>デバイスなし</li>";
  } catch {
    list.innerHTML = "<li>ログインが必要です（App Hub から maintenance）</li>";
  }
}

async function loadHeartbeat() {
  const code = customerCode();
  const el = document.getElementById("maint-heartbeat");
  try {
    const data = await apiGet(`/api/customer/${code}/devices/timeline`);
    const events = data.events ?? data.timeline ?? [];
    el.textContent = `直近イベント: ${Array.isArray(events) ? events.length : 0} 件`;
  } catch {
    el.textContent = "Heartbeat: 要ログイン";
  }
}

async function loadNotifications() {
  const code = customerCode();
  const list = document.getElementById("maint-notifications");
  try {
    const data = await apiGet(`/api/customer/${code}/events?limit=8`);
    const items = data.events ?? data.items ?? [];
    list.innerHTML = (Array.isArray(items) ? items : [])
      .slice(0, 8)
      .map((n) => `<li>${n.action ?? n.type ?? "通知"} — ${n.at ?? n.createdAt ?? ""}</li>`)
      .join("") || "<li>履歴なし</li>";
  } catch {
    list.innerHTML = "<li>要ログイン（App Hub）</li>";
  }
}

async function loadRecovery() {
  const code = customerCode();
  const list = document.getElementById("maint-recovery");
  try {
    const data = await apiGet(`/api/maintenance/recovery-history/${code}?limit=20`);
    const entries = data.entries ?? [];
    list.innerHTML =
      entries
        .map(
          (e) =>
            `<li>${e.success ? "✓" : "✗"} ${e.deviceId} — ${e.status} (${e.startedAt}) ${e.actor ? "by " + e.actor : ""}</li>`
        )
        .join("") || "<li>Recovery 履歴なし</li>";
  } catch {
    list.innerHTML = "<li>Recovery API 要 maintenance ログイン</li>";
  }
}

async function loadShelly() {
  const code = customerCode();
  const list = document.getElementById("maint-shelly-list");
  try {
    const data = await apiGet(`/api/maintenance/shelly/${code}`);
    const devices = data.devices ?? [];
    if (!devices.length) {
      list.innerHTML = "<li>Shelly デバイスなし（device_type に Shelly を含む機器）</li>";
      return;
    }
    list.innerHTML = devices
      .map(
        (d) =>
          `<li>${d.label ?? d.deviceId} — <span class="status-${d.status}">${d.status}</span>
            <button type="button" class="btn-shelly-reboot" data-device-id="${d.deviceId}">再起動</button></li>`
      )
      .join("");
    list.querySelectorAll(".btn-shelly-reboot").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const deviceId = btn.getAttribute("data-device-id");
        try {
          const r = await apiPost(`/api/maintenance/shelly/${code}/${deviceId}/reboot`, {});
          alert(r.note || "再起動要求を送信しました");
          loadShelly();
          loadRecovery();
        } catch {
          alert("再起動に失敗しました");
        }
      });
    });
  } catch {
    list.innerHTML = "<li>Shelly API 要 maintenance ログイン</li>";
  }
}

async function createMaintenanceCase() {
  const code = customerCode();
  const siteId = document.getElementById("maint-site")?.value || "";
  const siteName = document.getElementById("maint-site")?.selectedOptions?.[0]?.text || "";
  const notes = document.getElementById("maint-memo")?.value || "";
  const body = { customerCode: code, siteId: siteId || undefined, siteName, notes, status: "open" };
  try {
    const c = await apiPost("/api/maintenance/cases", body);
    alert(`保守案件を作成: ${c.caseId}`);
  } catch {
    const offline = JSON.parse(localStorage.getItem(OFFLINE_CASES_KEY) || "[]");
    offline.push({ ...body, at: new Date().toISOString() });
    localStorage.setItem(OFFLINE_CASES_KEY, JSON.stringify(offline));
    alert("オフライン: 案件をローカルキューに保存しました");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function loadSchedules() {
  const code = customerCode();
  const list = document.getElementById("maint-schedule-list");
  try {
    const data = await apiGet(`/api/maintenance/schedule?customerCode=${code}`);
    const items = data.schedules ?? [];
    const overdue = new Set((data.overdue ?? []).map((s) => s.scheduleId));
    list.innerHTML =
      items
        .map(
          (s) =>
            `<li data-schedule-id="${s.scheduleId}" class="${overdue.has(s.scheduleId) ? "overdue" : ""}">
              ${s.title} — 期限 ${s.dueDate} [${s.status}]
            </li>`
        )
        .join("") || "<li>点検予定なし</li>";
    updateNextInspection(items);
  } catch {
    list.innerHTML = "<li>要ログイン</li>";
    updateNextInspection([]);
  }
}

function updateNextInspection(schedules) {
  const pending = (schedules || [])
    .filter((s) => s.status === "pending" || s.status === "open")
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const next = pending[0];
  const dateEl = document.getElementById("maint-next-date");
  const titleEl = document.getElementById("maint-next-title");
  if (dateEl) dateEl.textContent = next?.dueDate ?? "予定なし";
  if (titleEl) titleEl.textContent = next ? next.title : "点検予定を追加してください";
}

async function loadPartsHistory() {
  const code = customerCode();
  const list = document.getElementById("maint-parts-list");
  if (!list) return;
  try {
    const reports = await apiGet(`/api/maintenance/reports/${code}`);
    const parts = [];
    for (const r of (reports.reports ?? []).slice(0, 5)) {
      if (!r.reportId) continue;
      try {
        const p = await apiGet(`/api/field-operations/maintenance/reports/${r.reportId}/parts`);
        for (const part of p.parts ?? []) {
          parts.push(`${part.partName} ×${part.quantity} (${r.completedAt?.slice(0, 10) || ""})`);
        }
      } catch {
        /* */
      }
    }
    list.innerHTML = parts.map((p) => `<li>${p}</li>`).join("") || "<li>交換部材の記録なし</li>";
  } catch {
    list.innerHTML = "<li>要ログイン</li>";
  }
}

async function loadReports() {
  const code = customerCode();
  const list = document.getElementById("maint-report-list");
  try {
    const data = await apiGet(`/api/maintenance/reports/${code}`);
    list.innerHTML =
      (data.reports ?? [])
        .map(
          (r) =>
            `<li>${r.completedAt?.slice(0, 10)} — ${r.comment || "（コメントなし）"} 写真${r.photos?.length ?? 0}枚</li>`
        )
        .join("") || "<li>報告履歴なし</li>";
  } catch {
    list.innerHTML = "<li>要ログイン</li>";
  }
}

async function addSchedule() {
  const code = customerCode();
  const title = document.getElementById("maint-schedule-title")?.value;
  const dueDate = document.getElementById("maint-schedule-due")?.value;
  if (!title || !dueDate) {
    alert("タイトルと期限を入力してください");
    return;
  }
  await apiPost("/api/maintenance/schedule", {
    customerCode: code,
    siteId: document.getElementById("maint-site")?.value,
    title,
    dueDate,
  });
  await loadSchedules();
}

async function submitReport() {
  const code = customerCode();
  const comment = document.getElementById("maint-report-comment")?.value;
  const files = [...(document.getElementById("maint-report-photos")?.files || [])];
  const photos = [];
  for (const f of files) {
    photos.push({ imageBase64: await fileToBase64(f), fileName: f.name });
  }
  const report = await apiPost("/api/maintenance/report", { customerCode: code, comment, photos });
  const partName = document.getElementById("maint-part-name")?.value?.trim();
  const qty = Number(document.getElementById("maint-part-qty")?.value || 1);
  if (partName && report.reportId) {
    await apiPost(`/api/field-operations/maintenance/reports/${report.reportId}/parts`, {
      customerCode: code,
      parts: [{ partName, quantity: qty, unit: "個" }],
    });
  }
  document.getElementById("maint-report-comment").value = "";
  document.getElementById("maint-report-photos").value = "";
  document.getElementById("maint-part-name").value = "";
  await loadReports();
  await loadSchedules();
  await loadPartsHistory();
  alert("点検完了・報告を送信しました");
}

async function flushOfflineCases() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(OFFLINE_CASES_KEY) || "[]");
  if (!q.length) return;
  const remain = [];
  for (const item of q) {
    try {
      await apiPost("/api/maintenance/cases", item);
    } catch {
      remain.push(item);
    }
  }
  localStorage.setItem(OFFLINE_CASES_KEY, JSON.stringify(remain));
}

document.getElementById("maint-customer")?.addEventListener("change", () => {
  const code = customerCode();
  document.getElementById("link-install-history").href = `/customer/${code}/install/home`;
  loadSites();
  loadDevices();
  loadHeartbeat();
  loadNotifications();
  loadRecovery();
  loadShelly();
  loadSchedules();
  loadReports();
  loadPartsHistory();
});

document.getElementById("btn-maint-add-schedule")?.addEventListener("click", () =>
  addSchedule().catch((e) => alert(e.message))
);
document.getElementById("btn-maint-submit-report")?.addEventListener("click", () =>
  submitReport().catch((e) => alert(e.message))
);

document.getElementById("btn-maint-save-memo")?.addEventListener("click", () => {
  localStorage.setItem(MEMO_KEY, document.getElementById("maint-memo")?.value ?? "");
});

document.getElementById("btn-maint-create-case")?.addEventListener("click", () => createMaintenanceCase());

document.getElementById("maint-memo")?.value = localStorage.getItem(MEMO_KEY) ?? "";

document.getElementById("maint-mqtt").textContent =
  navigator.onLine ? "MQTT: オンライン（ゲートウェイ経由）" : "MQTT: オフライン";

async function bootMaintenance() {
  const code = lockedCustomerCode || customerCodeFromPath();
  const sel = document.getElementById("maint-customer");
  if (sel) {
    sel.value = code;
    if (lockedCustomerCode) {
      sel.disabled = true;
      document.getElementById("link-back-portal")?.removeAttribute("hidden");
      document.getElementById("link-back-portal").href = `/customer/${code}`;
    }
  }
  document.getElementById("link-install-history").href = `/customer/${code}/install/home`;

  if (lockedCustomerCode) {
    const session = await requireCustomerLogin(code);
    if (!session) return;
  }

  renderPwaTopbar("maintenance", "保守");
  loadSites();
  loadDevices();
  loadHeartbeat();
  loadNotifications();
  loadRecovery();
  loadShelly();
  loadSchedules();
  loadReports();
  loadPartsHistory();
  flushOfflineCases();
}

bootMaintenance();
window.addEventListener("online", flushOfflineCases);
