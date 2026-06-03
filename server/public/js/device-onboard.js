import { apiGet, apiPost, getAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
const statusEl = document.getElementById("onboard-status");
let currentStep = 1;
let lastQr = null;

document.getElementById("onboard-code").textContent = customerCode;
document.getElementById("link-install").href = `/customer/${customerCode}/install`;
document.getElementById("link-portal").href = `/customer/${customerCode}`;

function setStep(n) {
  currentStep = n;
  document.querySelectorAll(".wizard-steps li").forEach((li) => {
    const s = Number(li.dataset.step);
    li.classList.toggle("active", s === n);
    li.classList.toggle("done", s < n);
  });
  for (let i = 1; i <= 6; i++) {
    const panel = document.getElementById(`step-${i}`);
    if (panel) panel.hidden = i !== n;
  }
}

async function init() {
  if (!getAdminToken()) {
    location.href = `/customer/${customerCode}`;
    return;
  }
  const state = await apiGet(`/api/customer/${customerCode}/devices/onboard/state`);
  statusEl.textContent = state.demoMode ? "Demo Mode 有効" : "本番モード";
}

document.getElementById("btn-step1")?.addEventListener("click", async () => {
  const deviceId = document.getElementById("device-id").value.trim();
  const deviceType = document.getElementById("device-type").value;
  const serialNumber = document.getElementById("serial-number").value.trim() || deviceId;
  await apiPost(`/api/customer/${customerCode}/devices/onboard/create`, {
    deviceId,
    deviceType,
    serialNumber,
  });
  document.getElementById("link-firmware-dl").href =
    `/api/customer/${customerCode}/devices/${encodeURIComponent(deviceId)}/onboard/firmware`;
  document.getElementById("link-report").href =
    `/api/customer/${customerCode}/devices/${encodeURIComponent(deviceId)}/provisioning-report?format=pdf`;
  document.getElementById("link-map").href = `/customer/${customerCode}/map`;
  setStep(2);
});

document.getElementById("btn-step2")?.addEventListener("click", async () => {
  const deviceId = document.getElementById("device-id").value.trim();
  const deviceType = document.getElementById("device-type").value;
  const serialNumber = document.getElementById("serial-number").value.trim() || deviceId;
  const res = await apiPost(`/api/customer/${customerCode}/devices/onboard/qr`, {
    deviceId,
    deviceType,
    serialNumber,
  });
  lastQr = JSON.parse(res.qrPayload);
  document.getElementById("qr-payload").textContent = res.qrPayload;
  document.getElementById("claim-json").value = res.qrPayload;
  setStep(3);
});

document.getElementById("btn-step3")?.addEventListener("click", async () => {
  const raw = document.getElementById("claim-json").value.trim();
  const body = raw ? JSON.parse(raw) : lastQr;
  await apiPost(`/api/customer/${customerCode}/devices/onboard/claim`, {
    device_id: body.device_id,
    device_type: body.device_type,
    serial_number: body.serial_number,
    provisioning_token: body.provisioning_token,
  });
  setStep(4);
  const deviceId = body.device_id;
  const fw = await apiGet(
    `/api/customer/${customerCode}/devices/${encodeURIComponent(deviceId)}/onboard/firmware`
  );
  document.getElementById("firmware-json").textContent = JSON.stringify(fw.firmware, null, 2);
});

document.getElementById("btn-step4")?.addEventListener("click", () => setStep(5));

document.getElementById("btn-send-hb")?.addEventListener("click", async () => {
  const deviceId = document.getElementById("device-id").value.trim();
  await apiPost(`/api/customer/${customerCode}/heartbeat`, { deviceId, platform: "wizard-test" });
  statusEl.textContent = "Heartbeat 送信済み";
});

document.getElementById("btn-step5")?.addEventListener("click", async () => {
  const deviceId = document.getElementById("device-id").value.trim();
  const check = await apiPost(
    `/api/customer/${customerCode}/devices/${encodeURIComponent(deviceId)}/onboard/heartbeat-check`,
    {}
  );
  document.getElementById("heartbeat-status").textContent = check.ok
    ? `OK — ${check.deviceStatus}`
    : `未確認 — ${check.deviceStatus ?? "待機"}`;
  if (check.ok) {
    await apiPost(`/api/customer/${customerCode}/devices/onboard/complete`, { deviceId });
    setStep(6);
  }
});

init().catch((e) => {
  statusEl.textContent = String(e);
});
