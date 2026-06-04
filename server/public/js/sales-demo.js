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

export async function apiPut(path, body = {}) {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function fmtYen(n) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

function selectedCustomer() {
  return document.getElementById("demo-customer-select")?.value ?? "TOMS001";
}

function setLog(msg) {
  const el = document.getElementById("action-log");
  if (el) el.textContent = msg;
}

export async function loadSalesDashboard() {
  const status = await apiGet("/api/demo-kit/status");
  const kpi = status.kpi ?? {};
  document.getElementById("kpi-revenue").textContent = fmtYen(kpi.revenue ?? 0);
  document.getElementById("kpi-gross").textContent = fmtYen(kpi.grossProfit ?? 0);
  document.getElementById("kpi-projects").textContent = String(kpi.projectCount ?? 0);
  document.getElementById("kpi-maintenance").textContent = String(kpi.maintenanceCases ?? 0);
  document.getElementById("kpi-unpaid").textContent = fmtYen(kpi.unpaid ?? 0);
  document.getElementById("kpi-anomaly").textContent = String(kpi.anomalyCount ?? 0);
  document.getElementById("kpi-dispatch").textContent = fmtYen(kpi.dispatchReductionEstimate ?? 0);

  const custList = document.getElementById("demo-customers");
  if (custList) {
    custList.innerHTML = (status.customers ?? [])
      .map(
        (c) =>
          `<li><strong>${c.code}</strong> — ${c.name}（現場 ${c.siteCount} / 機器 ${c.deviceCount} / 写真 ${c.photoCount}）</li>`
      )
      .join("");
  }

  const badge = document.getElementById("timeline-badge");
  if (badge) {
    badge.textContent = status.timelineSeeded ? "過去30日の履歴：表示できます" : "過去30日の履歴：未準備（初期化してください）";
  }

  const sched = status.resetSchedule ?? {};
  const modeEl = document.getElementById("reset-schedule-mode");
  const enEl = document.getElementById("reset-schedule-enabled");
  if (modeEl) modeEl.value = sched.mode ?? "manual";
  if (enEl) enEl.checked = !!sched.enabled;
  const schedInfo = document.getElementById("reset-schedule-info");
  if (schedInfo) {
    schedInfo.textContent = sched.enabled
      ? `自動リセット（準備中）: ${sched.description} / 次回 ${sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleString("ja-JP") : "—"}`
      : `手動リセットのみ（${sched.description ?? ""}）`;
  }
}

export async function resetDemo() {
  const btn = document.getElementById("btn-reset");
  btn.disabled = true;
  btn.textContent = "初期化中…";
  try {
    await apiPost("/api/demo-kit/reset");
    await loadSalesDashboard();
    setLog("デモを初期状態に戻しました");
  } catch (e) {
    setLog(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "デモを初期化";
  }
}

export async function triggerNotification(kind) {
  const code = selectedCustomer();
  const data = await apiPost(`/api/demo-kit/notifications/${kind}`, { customerCode: code });
  const tier = data.proRemote?.tier;
  setLog(
    `${data.title ?? kind} を送信しました。監視画面では ${tier ? tier.toUpperCase() + " 付近" : "該当エリア"} をご確認ください。`
  );
  await loadSalesDashboard();
  return data;
}

export async function runShellyReboot() {
  const data = await apiPost("/api/demo-kit/shelly-reboot", { customerCode: selectedCustomer() });
  setLog(`照明の再起動デモ完了（${data.deviceId}）`);
  await loadSalesDashboard();
}

export async function runAiEstimateDemo() {
  const data = await apiPost("/api/demo-kit/ai-estimate", { customerCode: selectedCustomer() });
  setLog(`現調の写真から見積案を作成しました（見積番号: ${data.estimateId ?? "—"}）`);
}

export async function saveResetSchedule() {
  const mode = document.getElementById("reset-schedule-mode")?.value ?? "manual";
  const enabled = !!document.getElementById("reset-schedule-enabled")?.checked;
  await apiPut("/api/demo-kit/reset-schedule", { mode, enabled });
  await loadSalesDashboard();
  setLog(enabled ? "自動リセットの予定を保存しました（実際の実行は mock）" : "手動リセットのみに設定しました");
}

export function wireSalesDemo() {
  document.getElementById("btn-reset")?.addEventListener("click", () => resetDemo());
  document.getElementById("btn-save-schedule")?.addEventListener("click", () => saveResetSchedule().catch((e) => setLog(e.message)));

  document.querySelectorAll("[data-demo-action]").forEach((el) => {
    el.addEventListener("click", async () => {
      const action = el.dataset.demoAction;
      el.disabled = true;
      try {
        if (action === "intrusion") {
          const d = await triggerNotification("intrusion");
          const tier = d.proRemote?.tier ?? "perimeter";
          window.location.href = `/sales/floor-preview?customer=${selectedCustomer()}&scrollTo=${tier}`;
          return;
        }
        if (action === "esp_fault") await triggerNotification("esp_fault");
        else if (action === "shelly_fault") await triggerNotification("shelly_fault");
        else if (action === "shelly_reboot") await runShellyReboot();
        else if (action === "notify_generic") await triggerNotification("maintenance_due");
        else if (action === "ai_estimate") await runAiEstimateDemo();
        else if (action === "survey_estimate") {
          await runAiEstimateDemo();
          window.open("/business/projects", "_blank");
        }
      } catch (e) {
        setLog(e.message);
      } finally {
        el.disabled = false;
      }
    });
  });

  document.getElementById("btn-kpi-csv")?.addEventListener("click", () => {
    window.location.href = "/api/demo-kit/kpi/csv";
  });

  document.querySelectorAll("[data-estimate-type]").forEach((el) => {
    el.addEventListener("click", () => {
      const type = el.dataset.estimateType;
      window.open(`/api/demo-kit/estimate-html/${type}`, "_blank", "noopener");
    });
  });

  loadSalesDashboard().catch((e) => setLog(e.message));
}
