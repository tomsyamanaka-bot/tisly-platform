import { apiGet, apiPost } from "./api.js";

let step = 1;
const maxStep = 4;
let selectedTemplate = "kodate";
let createdSiteId = "";

function renderDots() {
  const dots = document.getElementById("step-dots");
  dots.innerHTML = Array.from({ length: maxStep }, (_, i) =>
    `<span class="${i + 1 === step ? "active" : ""}"></span>`
  ).join("");
}

function showStep(n) {
  step = n;
  document.querySelectorAll(".step").forEach((s) => {
    s.classList.toggle("active", Number(s.dataset.step) === step);
  });
  renderDots();
}

document.getElementById("btn-prev")?.addEventListener("click", () => showStep(Math.max(1, step - 1)));
document.getElementById("btn-next")?.addEventListener("click", () => showStep(Math.min(maxStep, step + 1)));

async function loadTemplates() {
  const data = await apiGet("/api/sites/templates");
  const grid = document.getElementById("templates");
  grid.innerHTML = data.templates
    .map(
      (t) =>
        `<button type="button" data-tid="${t.id}" class="${t.id === selectedTemplate ? "selected" : ""}">${t.label}</button>`
    )
    .join("");
  grid.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedTemplate = btn.dataset.tid;
      grid.querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

async function loadSitesSelect() {
  const data = await apiGet("/api/sites");
  const sel = document.getElementById("provision-site");
  sel.innerHTML = data.sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  if (createdSiteId) sel.value = createdSiteId;
}

document.getElementById("btn-create-site")?.addEventListener("click", async () => {
  const name = document.getElementById("site-name").value || "新規現場";
  const res = await apiPost("/api/sites/create", { name, templateId: selectedTemplate });
  createdSiteId = res.site.id;
  document.getElementById("site-result").textContent =
    `作成完了: ${res.site.name}（ゾーン ${res.zones.length} / 機器 ${res.devices.length}）`;
  await loadSitesSelect();
  showStep(2);
});

document.getElementById("btn-provision")?.addEventListener("click", async () => {
  const siteId = document.getElementById("provision-site").value;
  const res = await apiPost("/api/provisioning/devices", {
    siteId,
    deviceType: "gateway",
    platform: "esp-idf",
    label: "新規ゲートウェイ",
  });
  document.getElementById("qr-preview").src = res.qrDataUrl;
  document.getElementById("provision-result").textContent = JSON.stringify(
    { deviceId: res.deviceId, secret: res.secret, siteId: res.siteId },
    null,
    2
  );
});

document.getElementById("btn-scan-apply")?.addEventListener("click", () => {
  try {
    const data = JSON.parse(document.getElementById("qr-scan-input").value);
    localStorage.setItem("tisly.provisionedDevice", JSON.stringify(data));
    document.getElementById("provision-result").textContent = "適用済み: " + data.deviceId;
  } catch {
    document.getElementById("provision-result").textContent = "JSON 形式で入力してください";
  }
});

document.getElementById("btn-save-rule")?.addEventListener("click", async () => {
  await apiPost("/api/notification-rules", {
    name: document.getElementById("rule-name").value || "窓・夜間",
    sensorType: document.getElementById("rule-sensor").value,
    timeWindow: document.getElementById("rule-time").value,
    severity: document.getElementById("rule-severity").value,
    siteId: createdSiteId || undefined,
    channels: ["push", "discord"],
  });
  document.getElementById("notify-result").textContent = "通知ルールを保存しました";
});

document.getElementById("btn-push-register")?.addEventListener("click", async () => {
  const { registerWebPush } = await import("./push.js");
  await registerWebPush("admin-default");
  document.getElementById("notify-result").textContent = "Push 登録を試行しました";
});

document.getElementById("btn-tv-pair-start")?.addEventListener("click", async () => {
  const tvDeviceId = document.getElementById("tv-device-id").value || "TV-SETUP-001";
  const res = await apiPost("/api/tv/pairing/start", { tvDeviceId });
  document.getElementById("tv-pair-code").textContent = res.pairingCode;
});

document.getElementById("btn-tv-pair-confirm")?.addEventListener("click", async () => {
  const code = document.getElementById("tv-pair-confirm").value;
  const tvDeviceId = document.getElementById("tv-device-id").value || "TV-SETUP-001";
  const res = await apiPost("/api/tv/pairing/confirm", {
    pairingCode: code,
    tvDeviceId,
    siteId: createdSiteId || "default",
  });
  document.getElementById("tv-result").textContent = res.ok ? "TV ペアリング完了" : JSON.stringify(res);
});

const params = new URLSearchParams(location.search);
if (params.get("device")) {
  showStep(2);
}

renderDots();
loadTemplates().catch(console.error);
loadSitesSelect().catch(console.error);

if (!localStorage.getItem("tisly.setupComplete")) {
  localStorage.setItem("tisly.setupWizardShown", "true");
}
