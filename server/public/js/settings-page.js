import { apiGet, apiPut, apiPost } from "./api.js";

let settings = {};

function field(label, id, value, type = "text") {
  if (type === "checkbox") {
    return `<div class="toggle"><label><input type="checkbox" id="${id}" ${value ? "checked" : ""} /> ${label}</label></div>`;
  }
  return `<label>${label}<input type="${type}" id="${id}" value="${value ?? ""}" /></label>`;
}

function renderForms() {
  const p = settings.pwa ?? {};
  document.querySelector(".form-pwa").innerHTML =
    field("有効", "pwa-enabled", p.enabled, "checkbox") +
    field("アプリ名", "pwa-name", p.name) +
    field("テーマカラー", "pwa-theme", p.themeColor);

  const pu = settings.push ?? {};
  document.querySelector(".form-push").innerHTML =
    field("有効", "push-enabled", pu.enabled, "checkbox");

  const d = settings.discord ?? {};
  document.querySelector(".form-discord").innerHTML =
    field("有効", "discord-enabled", d.enabled, "checkbox") +
    field("Webhook URL", "discord-webhook", d.webhookUrl) +
    `<label>イベント種別（カンマ区切り）<input id="discord-events" value="${(d.eventTypes ?? []).join(", ")}" /></label>`;

  const e = settings.email ?? {};
  document.querySelector(".form-email").innerHTML =
    field("有効", "email-enabled", e.enabled, "checkbox") +
    field("SMTP Host", "email-host", e.smtpHost) +
    field("SMTP Port", "email-port", e.smtpPort, "number") +
    field("SMTP User", "email-user", e.smtpUser) +
    field("From", "email-from", e.fromAddress) +
    field("管理者メール", "email-admin", e.adminEmail);

  const t = settings.tv ?? {};
  document.querySelector(".form-tv").innerHTML =
    field("有効", "tv-enabled", t.enabled, "checkbox") +
    field("キオスクモード", "tv-kiosk", t.kioskMode, "checkbox") +
    field("警報全画面秒", "tv-alarm-sec", t.alarmFullscreenSec, "number");

  const h = settings.heartbeat ?? {};
  document.querySelector(".form-heartbeat").innerHTML =
    field("Warning 秒", "hb-warn", h.warnSec, "number") +
    field("Alarm 秒", "hb-alarm", h.alarmSec, "number");

  const r = settings.retention ?? { days: 90 };
  document.querySelector(".form-retention").innerHTML = `
    <label>保持日数
      <select id="retention-days">
        <option value="30" ${r.days === 30 ? "selected" : ""}>30日</option>
        <option value="90" ${r.days === 90 ? "selected" : ""}>90日</option>
        <option value="365" ${r.days === 365 ? "selected" : ""}>365日</option>
      </select>
    </label>`;

  const b = settings.backup ?? { schedules: ["daily", "weekly", "monthly"] };
  const sched = b.schedules ?? [];
  document.querySelector(".form-backup").innerHTML =
    field("日次", "backup-daily", sched.includes("daily"), "checkbox") +
    field("週次", "backup-weekly", sched.includes("weekly"), "checkbox") +
    field("月次", "backup-monthly", sched.includes("monthly"), "checkbox");

  const q = settings.qnap ?? { mode: "mock" };
  document.querySelector(".form-qnap").innerHTML = `
    <label>QNAP_MODE
      <select id="qnap-mode">
        <option value="mock" ${q.mode === "mock" ? "selected" : ""}>mock（ローカル）</option>
        <option value="real" ${q.mode === "real" ? "selected" : ""}>real（SMB）</option>
      </select>
    </label>
    <p style="font-size:0.85rem;color:var(--tisly-muted)">本番は .env の QNAP_MODE と資格情報を設定</p>`;
}

function collect(key) {
  const g = (id) => document.getElementById(id);
  const chk = (id) => g(id)?.checked ?? false;
  switch (key) {
    case "pwa":
      return { enabled: chk("pwa-enabled"), name: g("pwa-name").value, themeColor: g("pwa-theme").value };
    case "push":
      return { ...settings.push, enabled: chk("push-enabled") };
    case "discord":
      return {
        enabled: chk("discord-enabled"),
        webhookUrl: g("discord-webhook").value,
        eventTypes: g("discord-events").value.split(",").map((s) => s.trim()).filter(Boolean),
      };
    case "email":
      return {
        enabled: chk("email-enabled"),
        smtpHost: g("email-host").value,
        smtpPort: Number(g("email-port").value),
        smtpUser: g("email-user").value,
        fromAddress: g("email-from").value,
        adminEmail: g("email-admin").value,
      };
    case "tv":
      return {
        enabled: chk("tv-enabled"),
        kioskMode: chk("tv-kiosk"),
        alarmFullscreenSec: Number(g("tv-alarm-sec").value),
      };
    case "heartbeat":
      return { warnSec: Number(g("hb-warn").value), alarmSec: Number(g("hb-alarm").value) };
    case "retention":
      return { days: Number(g("retention-days").value), options: [30, 90, 365] };
    case "backup": {
      const s = [];
      if (chk("backup-daily")) s.push("daily");
      if (chk("backup-weekly")) s.push("weekly");
      if (chk("backup-monthly")) s.push("monthly");
      return { schedules: s, enabled: s.length > 0 };
    }
    case "qnap":
      return { mode: g("qnap-mode").value };
    default:
      return {};
  }
}

async function loadAudit() {
  const data = await apiGet("/api/provisioning/audit?limit=20");
  const el = document.getElementById("audit-list");
  if (!el) return;
  el.innerHTML = (data.entries ?? [])
    .map((e) => `<li>${e.createdAt} — <strong>${e.actorLabel}</strong> ${e.action} (${e.entityType ?? ""} ${e.entityId ?? ""})</li>`)
    .join("") || "<li>監査ログなし</li>";
}

async function load() {
  const data = await apiGet("/api/settings/platform");
  settings = data.settings;
  renderForms();
  await loadAudit();
}

document.querySelectorAll("[data-save]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const key = btn.dataset.save;
    const body = collect(key);
    await apiPut(`/api/settings/platform/${key}`, body);
    settings[key] = body;
    const msg = document.getElementById("settings-msg");
    msg.className = "msg ok";
    msg.textContent = `${key} を保存しました`;
  });
});

document.querySelectorAll("[data-test]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const ch = btn.dataset.test;
    const r = await apiPost(`/api/notifications/test/${ch}`);
    const msg = document.getElementById("settings-msg");
    msg.className = r.success ? "msg ok" : "msg err";
    msg.textContent = r.success ? "テスト送信成功" : r.error;
  });
});

load().catch(console.error);
