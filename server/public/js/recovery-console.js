import { apiGet, apiPost } from "./api.js";

const RECOVERY_CONFIRM_ACTIONS = {
  restart_device: "デバイスを再起動要求します。現場の通信が一時停止する可能性があります。",
  restart_mqtt: "MQTT ブローカー再起動を記録します。全デバイスの接続に影響します。",
  restart_node_red: "Node-RED 再起動を記録します。ingest が一時停止します。",
  escalate: "エスカレーションを実行します。上位担当者へ通知されます。",
};

async function loadConsole() {
  const data = await apiGet("/api/recovery/console");
  document.getElementById("recovery-overview").innerHTML = `
    <p>アクティブインシデント: ${data.overview?.activeIncidents ?? 0}</p>
    <p>SLA 違反: ${data.overview?.slaBreaches ?? 0}</p>`;
  document.getElementById("anomalies-body").innerHTML = (data.anomalies ?? [])
    .map(
      (a) =>
        `<tr><td>${a.device_id}</td><td>${a.site_id ?? "—"}</td><td>${a.status}</td><td>${a.opened_at}</td></tr>`
    )
    .join("") || "<tr><td colspan='4'>なし</td></tr>";
  document.getElementById("runs-body").innerHTML = (data.recentRuns ?? [])
    .map(
      (r) =>
        `<tr><td>${r.id.slice(0, 8)}…</td><td>${r.device_id}</td><td>${r.status}</td><td>${r.started_at}</td></tr>`
    )
    .join("") || "<tr><td colspan='4'>なし</td></tr>";
}

async function loadTimeline() {
  const data = await apiGet("/api/recovery/timeline?limit=30");
  document.getElementById("timeline-list").innerHTML = (data.entries ?? [])
    .map((e) => `<li><strong>${e.phase}</strong> ${e.title} <small>${e.createdAt}</small></li>`)
    .join("");
}

document.querySelectorAll("[data-action]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const action = btn.dataset.action;
    const deviceId = document.getElementById("action-device").value;
    const message = RECOVERY_CONFIRM_ACTIONS[action] ?? "この操作を実行します。";
    const label = btn.textContent?.trim() ?? action;
    const ok = window.confirm(
      `【確認】${label}\n\n${message}\n\n本当に実行しますか？`
    );
    if (!ok) {
      document.getElementById("action-result").textContent = "キャンセルしました";
      return;
    }
    const body = { action, reason: "recovery_console" };
    if (action === "restart_device" || action === "escalate") {
      if (!deviceId) {
        document.getElementById("action-result").textContent = "device_id を入力してください";
        return;
      }
      body.deviceId = deviceId;
    }
    const res = await apiPost("/api/recovery/actions", body);
    document.getElementById("action-result").textContent = JSON.stringify(res, null, 2);
    await loadConsole();
    await loadTimeline();
  });
});

loadConsole().catch(console.error);
loadTimeline().catch(console.error);
