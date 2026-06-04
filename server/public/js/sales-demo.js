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

export async function loadSalesDashboard(reason) {
  const status = await apiGet("/api/demo-kit/status");
  const { setLiveBadge, setShellyEnvBadge, flashAnomalyHighlight } = await import("./sales-realtime.js");
  if (status.liveBadge) setLiveBadge(status.liveBadge);
  if (status.shellyEnvBadge) setShellyEnvBadge(status.shellyEnvBadge);
  if (reason && ["intrusion", "esp_fault", "shelly_fault", "notification"].includes(reason)) {
    flashAnomalyHighlight(reason);
  }

  try {
    const shelly = await apiGet("/api/demo-kit/shelly/lab-status");
    const el = document.getElementById("shelly-connection-status");
    if (el) {
      el.textContent = shelly.message ?? "—";
      el.className = shelly.online ? "shelly-ok" : "shelly-fail";
    }
  } catch {
    /* */
  }
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

  const mode = status.deviceMode ?? "mock";
  const modeLabel = document.getElementById("device-mode-label");
  if (modeLabel) modeLabel.textContent = `現在: ${mode.toUpperCase()}`;
  document.querySelectorAll(".device-mode-btn").forEach((btn) => {
    btn.classList.toggle("primary", btn.dataset.deviceMode === mode);
  });

  const movie = status.demoMovie ?? {};
  const movieEl = document.getElementById("movie-status");
  if (movieEl) {
    movieEl.textContent = movie.running
      ? `再生中 — ${movie.currentScene ?? ""} (${movie.step + 1}/${movie.totalSteps})`
      : "停止中";
  }

  const sched = status.resetSchedule ?? {};
  const modeEl = document.getElementById("reset-schedule-mode");
  const enEl = document.getElementById("reset-schedule-enabled");
  if (modeEl) modeEl.value = sched.mode ?? "manual";
  if (enEl) enEl.checked = !!sched.enabled;
  const schedInfo = document.getElementById("reset-schedule-info");
  if (schedInfo) {
    const cronNote = sched.cronActive ? "cron 有効" : sched.envEnabled ? "env cron 有効" : "手動";
    schedInfo.textContent = sched.enabled || sched.envEnabled
      ? `自動リセット（${cronNote}）: ${sched.description} / cron ${sched.cronExpr ?? "—"} / 次回 ${sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleString("ja-JP") : "—"}`
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

export async function pushToTv() {
  const code = selectedCustomer();
  const title = document.getElementById("tv-push-title")?.value?.trim() || "営業デモ通知";
  const message = document.getElementById("tv-push-message")?.value?.trim() || "Google TV に表示します";
  const data = await apiPost("/api/demo-kit/tv/push", {
    customerCode: code,
    title,
    message,
    severity: "alarm",
  });
  setLog(`TV (${data.tvUrl}) に送信しました`);
}

export async function openSalesPdfCheck() {
  const data = await apiGet("/api/demo-kit/sales-pdf/archive");
  const lines = (data.entries ?? [])
    .map((e) => {
      const pdf = e.pdfUrl ? `PDF: ${e.pdfUrl}` : "PDF: HTML fallback（TISLY_PDF_PUPPETEER=true で生成）";
      const qnap = e.qnapMockPath ? `QNAP mock: ${e.qnapMockPath}` : "";
      return `${e.type}: ${e.htmlUrl} · ${pdf} ${qnap}`;
    })
    .join("\n");
  setLog(`PDF確認 — render=${data.renderMode} · QNAP=${data.qnapMockRoot}`);
  window.open((data.entries?.[0]?.htmlUrl) ?? "/api/demo-kit/estimate-html/house", "_blank", "noopener");
  if (lines) console.info("[sales-pdf]", lines);
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
  setLog(enabled ? "自動リセットの予定を保存しました（node-cron）" : "手動リセットのみに設定しました");
}

export async function setDeviceMode(mode) {
  await apiPut("/api/demo-kit/device-mode", { deviceMode: mode });
  await loadSalesDashboard();
  setLog(`接続モードを ${mode} に切り替えました`);
}

function drawRoiChart(chart) {
  const canvas = document.getElementById("roi-chart");
  if (!canvas || !chart?.length) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...chart.map((c) => c.value), 1);
  const barW = w / chart.length - 20;
  chart.forEach((c, i) => {
    const barH = (c.value / max) * (h - 40);
    const x = 20 + i * (barW + 10);
    ctx.fillStyle = i === 1 ? "#1a7f37" : "#94a3b8";
    ctx.fillRect(x, h - 30 - barH, barW, barH);
    ctx.fillStyle = "#24292f";
    ctx.font = "11px system-ui";
    ctx.fillText(c.label.slice(0, 8), x, h - 8);
  });
}

export async function calcRoi() {
  const body = {
    siteCount: Number(document.getElementById("roi-sites")?.value ?? 1),
    dispatchCountPerYear: Number(document.getElementById("roi-dispatch")?.value ?? 0),
    laborCostPerDispatch: Number(document.getElementById("roi-labor")?.value ?? 0),
    vehicleCostPerDispatch: Number(document.getElementById("roi-vehicle")?.value ?? 0),
  };
  const data = await apiPost("/api/demo-kit/roi-simulator", body);
  const el = document.getElementById("roi-result");
  if (el) {
    el.textContent = `年間削減見込み: ${fmtYen(data.annualReductionJpy)}（月 ${fmtYen(data.monthlyReductionJpy)}）`;
  }
  drawRoiChart(data.chart);
}

export async function launchPackage(type) {
  const data = await apiPost(`/api/demo-kit/demo-packages/${type}/launch`, {});
  setLog(`${data.package?.label ?? type} デモを開始しました`);
  await loadSalesDashboard();
  if (data.package?.customerCode) {
    const sel = document.getElementById("demo-customer-select");
    if (sel) sel.value = data.package.customerCode;
  }
}

export function wireSalesDemo() {
  document.querySelectorAll(".device-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setDeviceMode(btn.dataset.deviceMode).catch((e) => setLog(e.message)));
  });
  document.querySelectorAll("[data-demo-package]").forEach((btn) => {
    btn.addEventListener("click", () => launchPackage(btn.dataset.demoPackage).catch((e) => setLog(e.message)));
  });
  document.getElementById("btn-roi-calc")?.addEventListener("click", () => calcRoi().catch((e) => setLog(e.message)));
  document.getElementById("btn-movie-start")?.addEventListener("click", async () => {
    await apiPost("/api/demo-kit/demo-movie/start", { customerCode: selectedCustomer(), intervalMs: 8000 });
    await loadSalesDashboard();
    setLog("デモムービーを開始しました");
  });
  document.getElementById("btn-movie-stop")?.addEventListener("click", async () => {
    await apiPost("/api/demo-kit/demo-movie/stop", {});
    await loadSalesDashboard();
    setLog("デモムービーを停止しました");
  });

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

  document.getElementById("btn-pdf-check")?.addEventListener("click", () =>
    openSalesPdfCheck().catch((e) => setLog(e.message))
  );
  document.getElementById("btn-tv-push")?.addEventListener("click", () =>
    pushToTv().catch((e) => setLog(e.message))
  );

  loadSalesDashboard().catch((e) => setLog(e.message));

  import("./sales-realtime.js").then(({ wireSalesRealtime }) => {
    wireSalesRealtime((kind) => loadSalesDashboard(kind).catch(() => {}));
  });
  import("./sales-i18n.js").then(async (i18n) => {
    await i18n.loadSalesI18n();
    i18n.applySalesI18n();
    i18n.wireSalesI18nToggle();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  }
}
