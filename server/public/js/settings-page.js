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
    default:
      return {};
  }
}

async function load() {
  const data = await apiGet("/api/settings/platform");
  settings = data.settings;
  renderForms();
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
