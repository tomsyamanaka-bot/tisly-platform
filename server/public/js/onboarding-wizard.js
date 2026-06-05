import { getAdminToken } from "./api.js";

const form = document.getElementById("wizard-form");
const errorEl = document.getElementById("error");
const resultEl = document.getElementById("result");
let currentStep = 1;

function showStep(n) {
  currentStep = n;
  for (let i = 1; i <= 4; i++) {
    const fs = document.getElementById(`step-${i}`);
    if (fs) fs.hidden = i !== n;
    const badge = document.querySelector(`.step-badge[data-step="${i}"]`);
    if (badge) {
      badge.classList.toggle("active", i === n);
      badge.classList.toggle("done", i < n);
    }
  }
  if (n === 4) updateSummary();
}

function collectDevices() {
  const devices = [];
  for (let i = 0; i < 2; i++) {
    const name = form[`devName${i}`]?.value?.trim();
    const location = form[`devLoc${i}`]?.value?.trim();
    const kind = form[`devKind${i}`]?.value;
    if (name && location) devices.push({ name, location, kind });
  }
  return devices;
}

function updateSummary() {
  const devices = collectDevices();
  const preview = document.getElementById("summary-preview");
  preview.textContent = JSON.stringify(
    {
      customerName: form.customerName.value,
      customerCode: form.customerCode.value || "(自動採番)",
      siteName: form.siteName.value,
      plan: form.plan.value,
      siteType: form.siteType.value,
      devices,
    },
    null,
    2
  );
}

document.querySelectorAll(".next-btn").forEach((btn) => {
  btn.addEventListener("click", () => showStep(Number(btn.dataset.next)));
});
document.querySelectorAll(".prev-btn").forEach((btn) => {
  btn.addEventListener("click", () => showStep(Number(btn.dataset.prev)));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  resultEl.style.display = "none";

  const token = getAdminToken();
  if (!token) {
    errorEl.textContent = "管理者ログインが必要です。ダッシュボードからログインしてください。";
    return;
  }

  const devices = collectDevices();
  if (!devices.length) {
    errorEl.textContent = "設備を1台以上登録してください。";
    showStep(3);
    return;
  }

  const body = {
    customerName: form.customerName.value.trim(),
    customerCode: form.customerCode.value.trim() || undefined,
    siteName: form.siteName.value.trim(),
    plan: form.plan.value,
    address: form.address.value.trim() || undefined,
    siteType: form.siteType.value,
    devices,
  };

  const res = await fetch("/api/customer-onboarding/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error || res.statusText;
    return;
  }

  resultEl.style.display = "block";
  resultEl.innerHTML = `
    <h3>導入完了 — ${data.customer.customerCode}</h3>
    <p>初期パスワード: <strong>${data.customer.initialPassword}</strong></p>
    <p>ログイン: <code>${data.customer.loginUsername}</code></p>
    <ul>
      <li><a href="${data.deployUrl}">導入管理</a></li>
      <li><a href="${data.installUrl}">施工 PWA</a></li>
      <li><a href="${data.checklistUrl}">導入チェックリスト</a></li>
    </ul>
    <p>QRリンク:</p>
    <ul>${data.qrLinks.map((q) => `<li><a href="${q.url}">${q.deviceId}</a></li>`).join("")}</ul>
  `;
});

showStep(1);
