import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const OFFLINE_QUEUE_KEY = "tisly_survey_offline_queue_v501";

const PHOTO_TYPES = [
  "outside",
  "inside",
  "drawing",
  "aerial",
  "electrical",
  "network",
  "panel",
  "camera",
  "sensor",
  "route",
  "other",
];

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
  updateOfflineBadge();
}

function updateOfflineBadge() {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  const el = document.getElementById("survey-offline-badge");
  if (el) el.textContent = q.length ? `未同期 ${q.length} 件` : "";
}

async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  if (!q.length) return;
  const byProject = new Map();
  for (const item of q) {
    const pid = item.projectId || activeProjectId;
    if (!pid) continue;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(item);
  }
  const remain = [];
  for (const [projectId, items] of byProject) {
    const syncItems = items.map((item) => {
      if (item.type === "patch_project") {
        return { type: "gps", gpsLat: item.body?.gpsLat, gpsLng: item.body?.gpsLng };
      }
      return item;
    });
    try {
      await api("/api/survey/sync", {
        method: "POST",
        body: JSON.stringify({ projectId, items: syncItems }),
      });
    } catch {
      remain.push(...items);
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remain));
  updateOfflineBadge();
}

let activeProjectId = localStorage.getItem("tisly_survey_active_project") || "";
let lastPhotos = [];

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
  "survey-aerial": "aerial",
  "survey-exterior": "outside",
  "survey-interior": "inside",
  "survey-sketch-photo": "drawing",
  "survey-panel": "panel",
  "survey-network": "network",
  "survey-electrical": "electrical",
  "survey-camera": "camera",
  "survey-sensor": "sensor",
  "survey-route": "route",
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
      queueOffline({ type: "gps", projectId: pid, gpsLat: body.gpsLat, gpsLng: body.gpsLng });
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
    const payload = { type: "photo", projectId: pid, photoType, imageBase64: b64, fileName: file.name };
    if (!navigator.onLine) {
      queueOffline(payload);
      continue;
    }
    try {
      await api(`/api/survey/projects/${pid}/photos`, {
        method: "POST",
        body: JSON.stringify({ photoType, imageBase64: b64, fileName: file.name }),
      });
    } catch {
      queueOffline(payload);
    }
  }
  await refreshPhotoList();
  alert(`${photoType} 写真を保存しました`);
}

async function uploadDrawing(file) {
  const pid = await ensureProject();
  const b64 = await fileToBase64(file);
  const ext = (file.name || "").toLowerCase();
  let mimeType = file.type;
  if (ext.endsWith(".pdf")) mimeType = "application/pdf";
  const payload = {
    type: "drawing",
    projectId: pid,
    imageBase64: b64,
    fileName: file.name,
    mimeType,
  };
  if (!navigator.onLine) {
    queueOffline(payload);
    alert("図面をオフラインキューに保存しました");
    return;
  }
  await api("/api/survey/drawing", {
    method: "POST",
    body: JSON.stringify({ projectId: pid, imageBase64: b64, fileName: file.name, mimeType }),
  });
}

async function refreshPhotoList() {
  if (!activeProjectId) return;
  try {
    const data = await api(`/api/survey/projects/${activeProjectId}/photos`);
    lastPhotos = data.photos || [];
    const list = document.getElementById("survey-photo-list");
    if (!list) return;
    list.innerHTML = lastPhotos
      .map(
        (p) => `<li data-photo-id="${p.id}">
          <img src="${p.url}" alt="" width="48" height="48" />
          <select class="photo-classify" data-photo-id="${p.id}">
            ${PHOTO_TYPES.map((t) => `<option value="${t}" ${t === p.photoType ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </li>`
      )
      .join("");
    list.querySelectorAll(".photo-classify").forEach((sel) => {
      sel.addEventListener("change", async () => {
        try {
          await api(`/api/survey/photos/${sel.dataset.photoId}`, {
            method: "PATCH",
            body: JSON.stringify({ photoType: sel.value }),
          });
        } catch {
          alert("分類の保存に失敗しました");
        }
      });
    });
  } catch {
    /* */
  }
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
  const payload = { type: "checklist", projectId: pid, checklist };
  if (!navigator.onLine) {
    queueOffline(payload);
    return;
  }
  await api(`/api/survey/projects/${pid}/checklist`, {
    method: "PUT",
    body: JSON.stringify({ checklist }),
  });
}

async function saveMemo() {
  const pid = await ensureProject();
  const notes = document.getElementById("survey-memo")?.value || "";
  const payload = { type: "memo", projectId: pid, notes };
  if (!navigator.onLine) {
    queueOffline(payload);
    alert("メモをオフラインキューに保存");
    return;
  }
  await api("/api/survey/sync", {
    method: "POST",
    body: JSON.stringify({ projectId: pid, items: [{ type: "memo", notes }] }),
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

async function runAiIntake() {
  const pid = await ensureProject();
  const notes = document.getElementById("survey-memo")?.value;
  const data = await api(`/api/survey/projects/${pid}/ai/intake`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
  const el = document.getElementById("survey-ai-result");
  el.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre><span class="placeholder-tag">AI intake placeholder</span>`;
}

async function runAiEstimate() {
  const pid = await ensureProject();
  const data = await api(`/api/survey/projects/${pid}/ai-estimate`, { method: "POST" });
  const el = document.getElementById("survey-ai-result");
  const r = data.recommended || {};
  el.innerHTML = `
    <p><strong>現調候補</strong> <span class="placeholder-tag">v2 placeholder</span></p>
    <p>ESP: ${r.espCount ?? "—"}</p>
    <p>センサー: ${(r.sensors || []).map((s) => `${s.type}×${s.qty}`).join(", ") || "—"}</p>
    <p>カメラ: ${(r.cameras || []).map((c) => `${c.type}×${c.qty}`).join(", ") || "—"}</p>
    <p>ライト/Shelly: ${(r.lights || []).length + (r.shelly || []).length} 候補</p>
    <p>作業日数: ${r.estimatedWorkDays ?? "—"} / 難易度: ${r.difficultyScore ?? "—"}/10</p>
    <p>概算原価: ¥${(r.estimatedCostJpy ?? 0).toLocaleString()} / 概算売価: ¥${(r.estimatedSellJpy ?? 0).toLocaleString()}</p>
    <p>注意: ${(r.cautions || []).join(" · ") || "—"}</p>`;
}

async function generateFloorMap() {
  const pid = await ensureProject();
  const data = await api(`/api/survey/projects/${pid}/generate-floor-map`, { method: "POST" });
  const code = document.getElementById("survey-customer")?.value || "TOMS001";
  alert(`PRO Map 生成: ${data.tiers?.join(" / ")} — 屋上は作成しません`);
  window.open(`/customer/${code}/pro-remote`, "_blank");
}

document.getElementById("btn-survey-create-toms")?.addEventListener("click", async () => {
  const pid = activeProjectId || (await ensureProject());
  if (!pid) {
    alert("先に案件を保存してください");
    return;
  }
  const token = sessionStorage.getItem("tisly_token");
  if (!token) {
    alert("TOMS案件作成には App Hub から manager でログインしてください");
    return;
  }
  const res = await fetch(`/api/business/from-survey/${pid}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body.error || "TOMS案件の作成に失敗しました");
    return;
  }
  const bizId = body.project?.id;
  if (bizId) location.href = `/business/projects/${bizId}`;
  else alert("案件は作成されましたが ID を取得できませんでした");
});

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
document.getElementById("btn-survey-checklist")?.addEventListener("click", () =>
  saveChecklist().then(() => alert("チェックリスト保存"))
);
document.getElementById("btn-survey-memo")?.addEventListener("click", () => saveMemo().catch((e) => alert(e.message)));
document.getElementById("btn-survey-ai")?.addEventListener("click", () => runAiEstimate().catch((e) => alert(e.message)));
document.getElementById("btn-survey-ai-intake")?.addEventListener("click", () => runAiIntake().catch((e) => alert(e.message)));
document.getElementById("btn-survey-floor-map")?.addEventListener("click", () => generateFloorMap().catch((e) => alert(e.message)));
document.getElementById("btn-survey-sync")?.addEventListener("click", () => flushOfflineQueue().then(() => alert("同期完了")));
document.getElementById("btn-survey-report")?.addEventListener("click", async () => {
  const pid = await ensureProject();
  window.open(`/survey/${pid}/report`, "_blank");
});

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
    refreshPhotoList();
  }
  updateOfflineBadge();
  flushOfflineQueue();
});
window.addEventListener("online", flushOfflineQueue);
