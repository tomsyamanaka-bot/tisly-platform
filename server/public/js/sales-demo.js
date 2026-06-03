export async function apiPost(path, body = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function fmtYen(n) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

export async function loadSalesDashboard() {
  const status = await apiGet("/api/demo-kit/status");
  const kpi = status.kpi ?? {};
  document.getElementById("kpi-revenue").textContent = fmtYen(kpi.revenue ?? 0);
  document.getElementById("kpi-gross").textContent = fmtYen(kpi.grossProfit ?? 0);
  document.getElementById("kpi-maintenance").textContent = String(kpi.maintenanceCases ?? 0);
  document.getElementById("kpi-unpaid").textContent = fmtYen(kpi.unpaid ?? 0);
  document.getElementById("kpi-contracts").textContent = String(kpi.maintenanceContracts ?? kpi.projectCount ?? 0);

  const custList = document.getElementById("demo-customers");
  custList.innerHTML = (status.customers ?? [])
    .map(
      (c) =>
        `<li><strong>${c.code}</strong> — ${c.name}（現場 ${c.siteCount} / 機器 ${c.deviceCount} / 写真 ${c.photoCount}）</li>`
    )
    .join("");

  document.getElementById("timeline-badge").textContent = status.timelineSeeded
    ? "30日履歴: 生成済み"
    : "30日履歴: 未生成";
}

export async function resetDemo() {
  const btn = document.getElementById("btn-reset");
  btn.disabled = true;
  btn.textContent = "リセット中…";
  try {
    await apiPost("/api/demo-kit/reset");
    await loadSalesDashboard();
    document.getElementById("action-log").textContent = "デモ状態へリセット完了";
  } catch (e) {
    document.getElementById("action-log").textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "デモを初期化";
  }
}

export async function triggerNotification(kind) {
  const code = document.getElementById("demo-customer-select")?.value ?? "TOMS001";
  const data = await apiPost(`/api/demo-kit/notifications/${kind}`, { customerCode: code });
  document.getElementById("action-log").textContent =
    `${data.title ?? kind} → PRO ${data.proRemote?.tier ?? "-"} / WebPush ${data.webPush?.success ? "OK" : "mock"}`;
  await loadSalesDashboard();
}

export async function runAiEstimateDemo() {
  const code = document.getElementById("demo-customer-select")?.value ?? "TOMS001";
  const data = await apiPost("/api/demo-kit/ai-estimate", { customerCode: code });
  document.getElementById("action-log").textContent =
    `AI見積: ${data.steps?.map((s) => s.step).join(" → ")} / 見積 ${data.estimateId ?? "—"}`;
}

export function wireSalesDemo() {
  document.getElementById("btn-reset")?.addEventListener("click", () => resetDemo());
  document.querySelectorAll("[data-notify]").forEach((el) => {
    el.addEventListener("click", () => triggerNotification(el.dataset.notify));
  });
  document.getElementById("btn-ai-estimate")?.addEventListener("click", () => runAiEstimateDemo());
  loadSalesDashboard().catch((e) => {
    document.getElementById("action-log").textContent = e.message;
  });
}
