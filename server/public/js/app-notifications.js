import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
let searchDebounce;

async function pwaFetch(path, opts = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function renderNotifications(rows) {
  const list = document.getElementById("notif-list");
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = '<p class="hint">通知はありません</p>';
    return;
  }
  list.innerHTML = rows
    .map((n) => {
      const unread = !n.read_at;
      const statusCls = n.status === "sent" ? "status-ok" : "status-ng";
      const readLabel = n.read_at ? "既読" : "未読";
      return `<article class="notif-item${unread ? " unread" : ""}">
        <div class="notif-item-head">
          <span class="notif-time">${n.created_at}</span>
          <span class="notif-badge ${statusCls}">${readLabel}</span>
        </div>
        <div class="notif-title">${n.title || "（無題）"}</div>
        <div class="notif-meta">${n.channel} · ${n.event_type}</div>
        <div class="notif-actions">
          ${unread ? `<button type="button" class="btn btn-secondary btn-read" data-id="${n.id}">既読</button>` : ""}
          ${n.status === "failed" ? `<button type="button" class="btn btn-secondary btn-resend" data-id="${n.id}">再送</button>` : ""}
        </div>
      </article>`;
    })
    .join("");

  list.querySelectorAll(".btn-read").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await pwaFetch(`/api/notifications/${btn.dataset.id}/read`, { method: "PATCH" });
      loadNotifications();
    });
  });
  list.querySelectorAll(".btn-resend").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await pwaFetch(`/api/notifications/${btn.dataset.id}/resend`, { method: "POST" });
      loadNotifications();
    });
  });
}

async function loadNotifications() {
  const errEl = document.getElementById("notif-error");
  if (errEl) errEl.textContent = "";
  const unread = document.getElementById("filter-unread")?.checked;
  const readOnly = document.getElementById("filter-read")?.checked;
  const eventType = document.getElementById("filter-event")?.value;
  const q = document.getElementById("filter-search")?.value.trim();
  let query = `/api/notifications?limit=200`;
  if (unread) query += "&unread=true";
  if (readOnly) query += "&read=true";
  if (eventType) query += `&eventType=${encodeURIComponent(eventType)}`;
  if (q) query += `&q=${encodeURIComponent(q)}`;
  try {
    const data = await pwaFetch(query);
    renderNotifications(data.notifications ?? []);
  } catch (e) {
    if (errEl) errEl.textContent = e.message || String(e);
    const list = document.getElementById("notif-list");
    if (list) list.innerHTML = "";
  }
}

async function ensureHubRole() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    const errEl = document.getElementById("notif-error");
    if (errEl) errEl.textContent = "App Hub で owner / admin としてログインしてください";
    return false;
  }
  try {
    const res = await fetch("/api/pwa/hub", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!["owner", "admin", "super_admin"].includes(data.role)) {
      const errEl = document.getElementById("notif-error");
      if (errEl) errEl.textContent = `この画面は owner / admin 向けです（現在: ${data.role}）`;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

document.getElementById("filter-unread")?.addEventListener("change", loadNotifications);
document.getElementById("filter-read")?.addEventListener("change", loadNotifications);
document.getElementById("filter-event")?.addEventListener("change", loadNotifications);
document.getElementById("btn-refresh")?.addEventListener("click", loadNotifications);
document.getElementById("filter-search")?.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadNotifications, 300);
});
document.getElementById("btn-read-all")?.addEventListener("click", async () => {
  await pwaFetch("/api/notifications/read-all", { method: "POST" });
  loadNotifications();
});

renderPwaTopbar("notifications", "通知センター");
void ensureHubRole().then((ok) => {
  if (ok) loadNotifications();
});
