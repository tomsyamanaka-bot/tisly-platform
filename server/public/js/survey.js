import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const OFFLINE_QUEUE_KEY = "tisly_survey_offline_queue";

function apiHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...apiHeaders(), ...opts.headers } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function queueOffline(item) {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  q.push({ ...item, at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
}

async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  if (!q.length) return;
  const remain = [];
  for (const item of q) {
    try {
      if (item.type === "patch_project") {
        await api(`/api/survey/projects/${item.projectId}`, {
          method: "PATCH",
          body: JSON.stringify(item.body),
        });
      }
    } catch {
      remain.push(item);
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remain));
}

let activeProjectId = localStorage.getItem("tisly_survey_active_project") || "";

async function guardSurveyAccess() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const res = await fetch("/api/pwa/access/survey", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) {
    document.body.innerHTML =
      '<main style="padding:2rem;text-align:center"><h1>アクセス不可</h1><p>現調 PWA は surveyor または管理者ロールが必要です。</p><a href="/app">App Hub</a></main>';
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

const PHOTO_INPUT_MAP = {
  "survey-aerial": "outside",
  "survey-exterior": "outside",
  "survey-interior": "inside",
  "survey-sketch": "drawing",
  "survey-panel": "panel",
  "survey-network": "network",
};

async function ensureProject() {
  if (activeProjectId) {
    try {
      await api(`/api/survey/projects/${activeProjectId}`);
      return activeProjectId;
    } catch {
      activeProjectId = "";
    }
  }
  const code = document.getElementById("survey-customer")?.value || "TOMS001";
  const siteName = document.getElementById("survey-case-name")?.value || "現調案件";
  const address = document.getElementById("survey-address")?.value || "";
  const created = await api("/api/survey/projects", {
    method: "POST",
    body: JSON.stringify({ customerCode: code, siteName, address, status: "active" }),
  });
  activeProjectId = created.projectId;
  localStorage.setItem("tisly_survey_active_project", activeProjectId);
  document.getElementById("survey-project-id").textContent = activeProjectId;
  return activeProjectId;
}

async function saveGps() {
  if (!navigator.geolocation) {
    alert("GPS 非対応");
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const pid = await ensureProject();
    const body = { gpsLat: pos.coords.latitude, gpsLng: pos.coords.longitude };
    try {
      await api(`/api/survey/projects/${pid}`, { method: "PATCH", body: JSON.stringify(body) });
      document.getElementById("survey-gps").textContent = `${body.gpsLat.toFixed(5)}, ${body.gpsLng.toFixed(5)}`;
    } catch {
      queueOffline({ type: "patch_project", projectId: pid, body });
      document.getElementById("survey-gps").textContent = "オフライン保存待ち";
    }
  });
}

async function uploadPhoto(inputId, photoType) {
  const input = document.getElementById(inputId);
  if (!input?.files?.length) return;
  const pid = await ensureProject();
  for (const file of input.files) {
    const b64 = await fileToBase64(file);
    await api(`/api/survey/projects/${pid}/photos`, {
      method: "POST",
      body: JSON.stringify({ photoType, imageBase64: b64, fileName: file.name }),
    });
  }
  alert(`${photoType} 写真を保存しました`);
}

async function uploadDrawing(file) {
  const pid = await ensureProject();
  const b64 = await fileToBase64(file);
  const ext = (file.name || "").toLowerCase();
  let mimeType = file.type;
  if (ext.endsWith(".pdf")) mimeType = "application/pdf";
  await api("/api/survey/drawing", {
    method: "POST",
    body: JSON.stringify({ projectId: pid, imageBase64: b64, fileName: file.name, mimeType }),
  });
}

async function saveChecklist() {
  const pid = await ensureProject();
  const checklist = {};
  document.querySelectorAll("[data-check-key]").forEach((el) => {
    const key = el.dataset.checkKey;
    checklist[key] = {
      label: el.dataset.checkLabel,
      checked: el.type === "checkbox" ? el.checked : false,
      note: el.dataset.checkNote === "1" ? el.value : "",
    };
  });
  await api(`/api/survey/projects/${pid}/checklist`, {
    method: "PUT",
    body: JSON.stringify({ checklist }),
  });
}

async function loadChecklist() {
  if (!activeProjectId) return;
  try {
    const data = await api(`/api/survey/projects/${activeProjectId}/checklist`);
    const c = data.checklist || {};
    document.querySelectorAll("[data-check-key]").forEach((el) => {
      const key = el.dataset.checkKey;
      const item = c[key];
      if (!item) return;
      if (el.type === "checkbox") el.checked = !!item.checked;
      else if (el.dataset.checkNote === "1") el.value = item.note || "";
    });
  } catch {
    /* */
  }
}

async function runAiEstimate() {
  const pid = await ensureProject();
  const data = await api(`/api/survey/projects/${pid}/ai-estimate`, { method: "POST" });
  const el = document.getElementById("survey-ai-result");
  const r = data.recommended || {};
  el.innerHTML = `
    <p><strong>推奨構成:</strong> ${r.configuration ?? "—"}</p>
    <p>ESP: ${r.espCount ?? "—"} / センサー: ${r.sensorCount ?? "—"} / カメラ: ${r.cameraCount ?? "—"}</p>
    <p>想定原価: ¥${(r.estimatedCostJpy ?? 0).toLocaleString()} / 想定売価: ¥${(r.estimatedSellJpy ?? 0).toLocaleString()}</p>
    <p>難易度: ${r.difficulty ?? "—"} <span class="placeholder-tag">AI placeholder</span></p>`;
}

document.getElementById("btn-survey-save-case")?.addEventListener("click", async () => {
  try {
    await ensureProject();
    const pid = activeProjectId;
    await api(`/api/survey/projects/${pid}`, {
      method: "PATCH",
      body: JSON.stringify({
        siteName: document.getElementById("survey-case-name")?.value,
        address: document.getElementById("survey-address")?.value,
        customerCode: document.getElementById("survey-customer")?.value,
      }),
    });
    alert("案件をサーバーに保存しました");
  } catch {
    alert("ログインが必要です（App Hub から surveyor でログイン）");
  }
});

document.getElementById("btn-survey-gps")?.addEventListener("click", () => saveGps());
document.getElementById("btn-survey-checklist")?.addEventListener("click", () => saveChecklist().then(() => alert("チェックリスト保存")));
document.getElementById("btn-survey-ai")?.addEventListener("click", () => runAiEstimate().catch((e) => alert(e.message)));

for (const [inputId, photoType] of Object.entries(PHOTO_INPUT_MAP)) {
  document.getElementById(inputId)?.addEventListener("change", async (ev) => {
    try {
      await uploadPhoto(inputId, photoType);
    } catch {
      alert("写真アップロードにはログインと案件保存が必要です");
    }
    ev.target.value = "";
  });
}

document.getElementById("survey-sketch")?.addEventListener("change", async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  try {
    await uploadDrawing(f);
    alert("図面を保存しました");
  } catch {
    alert("図面保存に失敗しました");
  }
  ev.target.value = "";
});

renderPwaTopbar("survey", "現調");
guardSurveyAccess().then(() => {
  if (activeProjectId) {
    document.getElementById("survey-project-id").textContent = activeProjectId;
    loadChecklist();
  }
  flushOfflineQueue();
});
window.addEventListener("online", flushOfflineQueue);
