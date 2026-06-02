import { apiGet, apiPost } from "./api.js";

let currentPeriod = "today";

async function loadOverview() {
  const data = await apiGet("/api/analytics/overview");
  const risk = data.risk;
  document.getElementById("kpi-grid").innerHTML = `
    <div class="stat"><span class="label">平均 Risk (24h)</span><span class="value ${risk.avg24h >= 70 ? "risk-high" : ""}">${risk.avg24h}</span></div>
    <div class="stat"><span class="label">高リスク件数</span><span class="value">${risk.highRiskCount24h}</span></div>
    <div class="stat"><span class="label">本日イベント</span><span class="value">${data.trends.today.totalEvents}</span></div>
    <div class="stat"><span class="label">本日異常</span><span class="value">${data.trends.today.anomalyCount}</span></div>
  `;
  document.getElementById("risk-summary").textContent =
    `スコア 0–100。窓開≈10、深夜侵入≈70、非常停止≈90、複数同時≈95`;
  const bullets = data.summary.today.bullets
    .map((b) => `<li><strong>[${b.priority}]</strong> ${b.text}</li>`)
    .join("");
  document.getElementById("ai-bullets").innerHTML = bullets;
  document.getElementById("nl-report").innerHTML = data.naturalLanguage.today.paragraphs
    .map((p) => `<p>${p}</p>`)
    .join("");
}

async function loadTrend(period) {
  const t = await apiGet(`/api/analytics/trends/${period}`);
  document.getElementById("trend-types").innerHTML = t.byType
    .map((r) => `<tr><td>${r.label}</td><td>${r.count}</td></tr>`)
    .join("");
}

async function loadRecovery() {
  const r = await apiGet("/api/recovery/overview");
  document.getElementById("recovery-rules").innerHTML = `<p>${r.rules.length} ルール定義（ESP / RP2350 / PLC / TV / Server / Node-RED / MQTT）</p>`;
  document.getElementById("recovery-runs").innerHTML = (r.recentRuns || [])
    .map(
      (run) =>
        `<tr><td>${run.deviceId}</td><td>${run.ruleId}</td><td>${run.status}</td></tr>`
    )
    .join("");
  document.getElementById("incident-timeline").innerHTML = (r.timeline || [])
    .map(
      (e) =>
        `<div class="timeline-item"><strong>${e.phase}</strong> ${e.title}<br><small>${e.createdAt}</small></div>`
    )
    .join("");
  const s = r.sla;
  document.getElementById("sla-metrics").innerHTML = `
    <div class="stat"><span class="label">稼働率</span><span class="value">${s.uptimePercent}%</span></div>
    <div class="stat"><span class="label">復旧率</span><span class="value">${s.recoveryRatePercent}%</span></div>
    <div class="stat"><span class="label">MTTR (分)</span><span class="value">${r.mttr}</span></div>
  `;
}

async function loadQnap() {
  const q = await apiGet("/api/qnap/status");
  document.getElementById("qnap-status").textContent = q.status.message;
}

document.querySelectorAll(".ops-nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ops-nav button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".ops-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.panel}`)?.classList.add("active");
  });
});

document.querySelectorAll("[data-period]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("[data-period]").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentPeriod = chip.dataset.period;
    void loadTrend(currentPeriod);
  });
});

document.getElementById("btn-archive")?.addEventListener("click", async () => {
  const r = await apiPost("/api/qnap/archive", { format: "json", days: 1 });
  alert(`アーカイブ: ${r.filePath}`);
});

document.getElementById("btn-backup-daily")?.addEventListener("click", async () => {
  const r = await apiPost("/api/qnap/backup/daily", {});
  alert(`日次バックアップ完了\nJSON: ${r.jsonPath}`);
});

void loadOverview();
void loadTrend(currentPeriod);
void loadRecovery();
void loadQnap();
