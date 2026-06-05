import { apiGet, apiPost } from "./api.js";

const form = document.getElementById("wizard-form");
const resultEl = document.getElementById("result");
const errorEl = document.getElementById("error");
const nextCodeEl = document.getElementById("next-code");

async function loadNextCode() {
  try {
    const { customerCode } = await apiGet("/api/deployment-kit/customers/next-code");
    nextCodeEl.textContent = customerCode;
  } catch {
    nextCodeEl.textContent = "TOMS???";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  resultEl.style.display = "none";
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  try {
    const res = await apiPost("/api/deployment-kit/customers/wizard", body);
    resultEl.style.display = "block";
    resultEl.innerHTML = `
      <p><strong>登録完了</strong></p>
      <p>顧客コード: <strong>${res.customerCode}</strong></p>
      <p>ログイン: ${res.loginUsername} / 初期PW: <code>${res.initialPassword}</code></p>
      <p><a href="${res.urls.customer}">顧客ポータル</a> ·
         <a href="/site/new?customer=${res.customerCode}">現場作成</a> ·
         <a href="/customer/${res.customerCode}/deploy">導入管理</a></p>`;
    loadNextCode();
  } catch (err) {
    errorEl.textContent = String(err.message ?? err);
  }
});

loadNextCode();
