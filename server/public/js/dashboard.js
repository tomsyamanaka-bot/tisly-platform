import { apiGet } from "./api.js";
import { registerWebPush, testPush } from "./push.js";
import { mountSiteSelector, mountTenantSelector } from "./selectors.js";

if (!localStorage.getItem("tisly.setupComplete")) {
  const banner = document.getElementById("setup-banner");
  if (banner) banner.style.display = "block";
}
mountTenantSelector("tenant-selector").catch(console.error);
mountSiteSelector("site-selector").catch(console.error);

async function loadDashboard() {
  const data = await apiGet("/api/dashboard");
  const s = data.summary;
  document.getElementById("summary").innerHTML = `
    <div class="card stat"><div class="value">${s.siteCount ?? 0}</div><div class="label">現場数</div></div>
    <div class="card stat"><div class="value">${s.deviceCount}</div><div class="label">接続機器</div></div>
    <div class="card stat"><div class="value" style="color:var(--tisly-alarm)">${s.anomalyCount ?? 0}</div><div class="label">異常（24h）</div></div>
    <div class="card stat"><div class="value">${s.eventCountToday ?? 0}</div><div class="label">今日のイベント</div></div>
    <div class="card stat"><div class="value">${s.eventCountMonth ?? 0}</div><div class="label">今月のイベント</div></div>
    <div class="card stat"><div class="value">${s.eventCount24h}</div><div class="label">24h イベント</div></div>
    <div class="card stat"><div class="value">${s.unreadNotifications}</div><div class="label">未読通知</div></div>
    <div class="card stat"><div class="value" style="color:${s.systemStatus === 'alarm' ? 'var(--tisly-alarm)' : 'var(--tisly-green)'}">${s.systemStatus}</div><div class="label">システム${s.demoRunnerActive ? " (デモ)" : ""}</div></div>
  `;
  const tbody = document.getElementById("events-body");
  tbody.innerHTML = (data.recentEvents ?? [])
    .map(
      (e) =>
        `<tr><td>${e.created_at}</td><td>${e.site_id ?? "—"}</td><td>${e.device_id}</td><td><span class="badge ${e.severity}">${e.event_type}</span></td><td>${e.message ?? e.title ?? ""}</td></tr>`
    )
    .join("");
}

document.getElementById("btn-push-register")?.addEventListener("click", async () => {
  const el = document.getElementById("push-msg");
  try {
    await registerWebPush();
    el.className = "msg ok";
    el.textContent = "Push 登録完了";
  } catch (e) {
    el.className = "msg err";
    el.textContent = e.message;
  }
});

document.getElementById("btn-push-test")?.addEventListener("click", async () => {
  const el = document.getElementById("push-msg");
  try {
    const r = await testPush();
    el.className = r.success ? "msg ok" : "msg err";
    el.textContent = r.success ? "テスト送信成功" : r.error;
  } catch (e) {
    el.className = "msg err";
    el.textContent = e.message;
  }
});

loadDashboard().catch(console.error);
setInterval(() => loadDashboard().catch(console.error), 15_000);
