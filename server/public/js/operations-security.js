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

async function apiPost(path, body = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString("ja-JP");
}

async function loadLockEvents() {
  const data = await apiGet("/api/security/lock/events?limit=30");
  const body = document.getElementById("lock-events-body");
  if (!body) return;
  body.innerHTML = (data.events || [])
    .map(
      (e) =>
        `<tr><td>${fmtTime(e.createdAt)}</td><td>${e.provider}</td><td>${e.eventType}</td><td>${e.userName ?? "—"}</td><td>${e.success ? "OK" : "NG"}</td></tr>`
    )
    .join("");
}

async function loadFaceEvents() {
  const data = await apiGet("/api/security/lock/face-events?limit=20");
  const body = document.getElementById("face-events-body");
  if (!body) return;
  body.innerHTML = (data.events || [])
    .map(
      (e) =>
        `<tr><td>${fmtTime(e.createdAt)}</td><td>${e.userName ?? "—"}</td><td>${e.provider}</td><td>${e.success ? "OK" : "NG"}</td></tr>`
    )
    .join("");
}

async function loadPresenceUsers() {
  const data = await apiGet("/api/security/presence/users");
  const body = document.getElementById("presence-users-body");
  if (!body) return;
  body.innerHTML = (data.users || [])
    .map(
      (u) =>
        `<tr><td>${u.name}</td><td>${u.role}</td><td>${(u.deviceIds || []).length}</td><td>${u.notificationEnabled ? "ON" : "OFF"}</td></tr>`
    )
    .join("");
}

async function loadChildArrivals() {
  const data = await apiGet("/api/security/family/child-arrivals?limit=20");
  const list = document.getElementById("child-arrivals-list");
  if (!list) return;
  const items = data.arrivals || [];
  list.innerHTML = items.length
    ? items
        .map(
          (a) =>
            `<li><strong>${a.userName}</strong> — ${a.message}<small>${fmtTime(a.createdAt)} · ${a.method}</small></li>`
        )
        .join("")
    : "<li class='hint'>まだ通知はありません</li>";
}

async function refreshAll() {
  await Promise.all([loadLockEvents(), loadFaceEvents(), loadPresenceUsers(), loadChildArrivals()]);
}

document.querySelectorAll("[data-mock]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const scenario = btn.getAttribute("data-mock");
    const msg = document.getElementById("mock-result");
    try {
      const r = await apiPost(`/api/security/lock/mock/${scenario}`, {});
      if (msg) {
        msg.textContent = `生成: ${r.event?.eventType} — ${r.event?.userName} — 警戒=${r.state?.mode}`;
      }
      await refreshAll();
    } catch (e) {
      if (msg) msg.textContent = String(e);
    }
  });
});

refreshAll().catch((e) => {
  const msg = document.getElementById("mock-result");
  if (msg) msg.textContent = `ログインが必要です: ${e.message}`;
});
