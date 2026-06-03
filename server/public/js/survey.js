import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const STORAGE_KEY = "tisly_survey_draft";

async function guardSurveyAccess() {
  const token = sessionStorage.getItem("tisly_token");
  if (!token) return;
  const res = await fetch("/api/pwa/access/survey", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) {
    document.body.innerHTML =
      '<main style="padding:2rem;text-align:center"><h1>アクセス不可</h1><p>現調 PWA は surveyor または管理者ロールが必要です。</p><a href="/app">App Hub</a></main>';
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.caseName) document.getElementById("survey-case-name").value = d.caseName;
    if (d.address) document.getElementById("survey-address").value = d.address;
    if (d.memo) document.getElementById("survey-memo").value = d.memo;
  } catch {
    /* */
  }
}

document.getElementById("btn-survey-save-case")?.addEventListener("click", () => {
  const draft = {
    caseName: document.getElementById("survey-case-name")?.value ?? "",
    address: document.getElementById("survey-address")?.value ?? "",
    memo: document.getElementById("survey-memo")?.value ?? "",
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  alert("ローカルに保存しました（オフライン対応）");
});

renderPwaTopbar("survey", "現調");
loadDraft();
guardSurveyAccess();
