const TOKEN_KEY = "tisly_token";
const projectId = window.location.pathname.split("/deployment/checklist/")[1]?.replace(/\/$/, "") || "";

function token() {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(path, { ...opts, headers });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

async function ensureLogin() {
  if (token()) return;
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  if (res.ok) {
    const data = await res.json();
    sessionStorage.setItem(TOKEN_KEY, data.token);
  }
}

async function load() {
  if (!projectId) {
    document.getElementById("project-meta").textContent = "projectId が URL にありません";
    return;
  }
  await ensureLogin();
  const { ok, body } = await api(`/api/deployment/checklist/${projectId}`);
  if (!ok) {
    document.getElementById("project-meta").textContent = body.error || "読込失敗";
    return;
  }
  document.getElementById("project-meta").textContent = `${body.projectTitle} (${body.customerCode}) — ${body.completedCount}/${body.totalCount}`;
  const banner = document.getElementById("banner");
  if (body.allComplete) {
    banner.className = "ready";
    banner.textContent = "全項目完了 — 初回導入OK";
  } else {
    banner.className = "pending";
    banner.textContent = `残り ${body.totalCount - body.completedCount} 項目`;
  }
  const ul = document.getElementById("checklist-items");
  ul.innerHTML = "";
  for (const item of body.items || []) {
    const li = document.createElement("li");
    if (item.completed) li.classList.add("done");
    const info = document.createElement("div");
    info.innerHTML = `<strong>${item.label}</strong><small>${item.description}</small>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.completed ? "完了済" : "完了";
    btn.disabled = item.completed;
    btn.addEventListener("click", async () => {
      await api(`/api/deployment/checklist/${projectId}/item/${item.itemId}/complete`, {
        method: "POST",
        body: "{}",
      });
      load();
    });
    li.append(info, btn);
    ul.appendChild(li);
  }
}

load();
