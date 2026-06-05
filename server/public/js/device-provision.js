import { apiPost } from "./api.js";

const form = document.getElementById("provision-form");
const errorEl = document.getElementById("error");
const resultEl = document.getElementById("result");
const params = new URLSearchParams(window.location.search);

if (params.get("customer")) document.getElementById("customerCode").value = params.get("customer");
if (params.get("site")) document.getElementById("siteId").value = params.get("site");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  resultEl.innerHTML = "";
  const body = Object.fromEntries(new FormData(form).entries());
  if (!body.deviceId) delete body.deviceId;
  try {
    const res = await apiPost("/api/deployment-kit/devices/provision", body);
    resultEl.innerHTML = `
      <p><strong>登録完了</strong> — ${res.deviceId}</p>
      <p>資産ID: <code>${res.assetId}</code></p>
      <img id="qr-preview" src="${res.qrDataUrl}" alt="QR" />
      <p><a href="/asset/${res.assetId}" target="_blank">設備詳細を開く</a></p>`;
  } catch (err) {
    errorEl.textContent = String(err.message ?? err);
  }
});
