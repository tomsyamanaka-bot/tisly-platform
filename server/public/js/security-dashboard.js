import { apiPost } from "./api.js";

const TOKEN_KEY = "tisly_token";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const MODE_LABELS = {
  armed: "警戒ON",
  disarmed: "警戒OFF",
  pending_arm: "警戒ON待機中",
  pending_disarm: "警戒OFF待機中",
};

function renderState(data) {
  const badge = document.getElementById("security-mode-badge");
  const reason = document.getElementById("security-reason");
  const meta = document.getElementById("security-meta");
  const lastLog = document.getElementById("last-log");
  if (!badge) return;
  const s = data.state;
  badge.className = `mode-badge ${s.mode}`;
  badge.textContent = MODE_LABELS[s.mode] || s.mode;
  if (reason) reason.textContent = s.reason || "—";
  if (meta) {
    meta.textContent = `最終変更: ${new Date(s.lastChangedAt).toLocaleString("ja-JP")} · ${s.source} · ${s.lastChangedBy}`;
  }
  if (lastLog && data.lastLog) {
    lastLog.textContent = JSON.stringify(data.lastLog, null, 2);
  }
}

async function loadLogs() {
  const list = document.getElementById("event-log-list");
  if (!list) return;
  const data = await apiGet("/api/security/automation/logs?limit=10");
  list.innerHTML = (data.logs || [])
    .map(
      (e) =>
        `<li><strong>${e.eventType}</strong> — ${e.message}<small>${new Date(e.createdAt).toLocaleString("ja-JP")} · ${e.beforeMode} → ${e.afterMode}</small></li>`
    )
    .join("");
}

function renderLockProvider(data) {
  const el = document.getElementById("lock-provider-info");
  if (!el || !data.lock) return;
  const l = data.lock;
  const caps = l.capabilities || {};
  const capBadge = (label, on) =>
    `<span class="${on ? "on" : ""}">${label}: ${on ? "対応" : "—"}</span>`;
  el.innerHTML = `
    <div><strong>Provider</strong><br>${data.lockProvider ?? l.provider}</div>
    <div><strong>ロック状態</strong><br>${l.lockState ?? "—"}</div>
    <div><strong>バッテリー</strong><br>${l.battery != null ? l.battery + "%" : "—"}</div>
    <div><strong>モード</strong><br>${l.mode ?? "—"}</div>
    <div><strong>最後の施錠者</strong><br>${l.lastLocker ?? "—"}</div>
    <div><strong>最後の解錠者</strong><br>${l.lastUnlocker ?? "—"}</div>
    <div class="lock-cap-badges" style="grid-column:1/-1">
      ${capBadge("Face", caps.faceRecognition)}
      ${capBadge("Fingerprint", caps.fingerprint)}
      ${capBadge("NFC", caps.nfc)}
      ${capBadge("Remote Unlock", caps.remoteUnlock)}
    </div>`;
}

async function refresh() {
  const data = await apiGet("/api/security/state");
  renderState(data);
  renderLockProvider(data);
  await loadLogs();
}

document.getElementById("btn-arm")?.addEventListener("click", async () => {
  await apiPost("/api/security/state/arm", { reason: "Manual arm from /security" });
  await refresh();
});

document.getElementById("btn-disarm")?.addEventListener("click", async () => {
  await apiPost("/api/security/state/disarm", { reason: "Manual disarm from /security" });
  await refresh();
});

refresh().catch((e) => {
  const badge = document.getElementById("security-mode-badge");
  if (badge) badge.textContent = `エラー: ${e.message}（ログインが必要です）`;
});
