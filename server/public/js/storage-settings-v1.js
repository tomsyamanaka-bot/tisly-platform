import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";
import {
  formatClientErrorMessage,
  DOCUMENT_NAS_HOST,
  DOCUMENT_NAS_DEFAULT_PORT,
  getStoredDocumentNasHost,
  setStoredDocumentNasHost,
  getStoredDocumentNasPort,
  setStoredDocumentNasPort,
  resolveLocalWebDavWithPortFallback,
  buildDocumentNasWebDavUrl,
} from "./qnap-client-direct-v1.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4500);
}

function formatJaDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

async function api(path, opts = {}) {
  const token =
    localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
  const res = await fetch(`/api/storage/v1/settings${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 502) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  data.__httpStatus = res.status;
  return data;
}

function showResult(el, ok, message) {
  if (!el) return;
  el.classList.remove("hidden", "ok", "err");
  el.classList.add(ok ? "ok" : "err");
  el.textContent = `${ok ? "✅" : "❌"} ${message}`;
}

function showPingLogs(logs) {
  const el = $("ping-logs");
  if (!el) return;
  if (!logs?.length) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden", "ok", "err");
  el.textContent = logs.join("\n");
}

function setPingIndicator(state, text) {
  const el = $("ping-indicator");
  const textEl = $("ping-indicator-text");
  if (!el || !textEl) return;
  el.classList.remove("ok", "err", "running");
  if (state === "ok" || state === "err" || state === "running") {
    el.classList.add(state);
  }
  textEl.textContent = text || "未実行";
}

function saveRouteLabelJa(route) {
  if (route === "vps") return "VPSプロキシ経由";
  if (route === "local_wifi") return "ローカルWi-Fi（保存はVPSプロキシ）";
  return "自動→VPSプロキシ";
}

function applyPingResultToUi(result, { routeLabel } = {}) {
  const ok = Boolean(result?.ok);
  const ms = result?.latencyMs;
  const errMsg = result?.errorCode
    ? `${result.errorCode}: ${result.errorReason || result.message || ""}`
    : result?.message || "接続失敗";
  const label = routeLabel ? `（${routeLabel}）` : "";
  if (ok) {
    const msText = ms != null ? `${ms} ms` : "OK";
    setPingIndicator("ok", `成功 ${msText}${label}`);
    showResult(
      $("connection-result"),
      true,
      `Ping成功 ${ms != null ? `(${ms}ms)` : ""}${label}`.trim()
    );
    toast(`接続OK ${ms != null ? `(${ms}ms)` : ""}${label}`.trim());
  } else {
    setPingIndicator("err", errMsg.slice(0, 48));
    showResult($("connection-result"), false, errMsg);
    toast(errMsg);
  }
  renderDiagFields(result || {});
  if (result?.logs) showPingLogs(result.logs);
  if (result?.steps) renderConnectionSteps(result.steps);
}

function renderEnvStatus(env) {
  if (!env) return;
  const readyEl = $("qnap-env-ready");
  if (readyEl) {
    readyEl.textContent = env.ready ? "✅ 設定済み" : "⚠️ 不足あり";
    readyEl.className = env.ready ? "status-ok" : "status-warn";
  }
  if ($("qnap-env-url")) $("qnap-env-url").textContent = env.urlPreview || "未設定";
  if ($("qnap-env-basedir")) {
    $("qnap-env-basedir").textContent = env.baseDirPreview
      ? `${env.baseDirPreview}${env.baseDirIsDefault ? "（デフォルト）" : ""}`
      : "未設定";
  }
  if ($("qnap-env-user")) {
    $("qnap-env-user").textContent = env.userConfigured ? "設定済み（非表示）" : "未設定";
  }
  const missingEl = $("qnap-env-missing");
  if (missingEl) {
    const missing = env.missingKeys?.length ? env.missingKeys.join(", ") : "なし";
    missingEl.textContent = missing;
    missingEl.className = env.missingKeys?.length ? "status-warn" : "status-ok";
  }
  if ($("qnap-env-guide")) $("qnap-env-guide").textContent = env.setupGuide || "—";
}

function renderSummary(summary) {
  $("status-local").textContent = "✅";
  $("status-local").className = "status-ok";

  const qnapEl = $("status-qnap");
  qnapEl.textContent = summary.qnapLabel;
  if (summary.qnapLabel === "接続成功") qnapEl.className = "status-ok";
  else if (summary.qnapLabel === "接続失敗") qnapEl.className = "status-err";
  else if (summary.qnapLabel === "未確認") qnapEl.className = "status-warn";
  else qnapEl.className = "status-muted";

  if ($("status-save-route")) {
    $("status-save-route").textContent = summary.saveRouteLabel || summary.saveRoute || "—";
  }
  $("status-last-check").textContent = formatJaDateTime(summary.lastCheckedAt);
}

function renderConnectionSteps(steps) {
  const el = $("connection-steps");
  if (!el || !steps?.length) {
    el?.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden", "ok", "err");
  const allOk = steps.every((s) => s.ok);
  el.classList.add(allOk ? "ok" : "err");
  el.innerHTML = steps
    .map((s) => `<div>${s.ok ? "✅" : "❌"} ${s.step}. ${s.label} — ${s.message}</div>`)
    .join("");
}

function renderDiagFields(result) {
  if ($("qnap-latency")) {
    $("qnap-latency").textContent =
      result?.latencyMs != null ? `${result.latencyMs} ms` : "—";
  }
  const codeEl = $("qnap-error-code");
  if (codeEl) {
    if (result?.errorCode) {
      codeEl.textContent = result.errorCode;
      codeEl.className = "status-err";
    } else if (result?.ok) {
      codeEl.textContent = "なし";
      codeEl.className = "status-ok";
    } else {
      codeEl.textContent = "—";
      codeEl.className = "status-muted";
    }
  }
  if ($("qnap-save-route-status") && result?.saveRoute) {
    $("qnap-save-route-status").textContent = saveRouteLabelJa(result.saveRoute);
  }
  if (result && (result.ok === true || result.ok === false) && result.latencyMs != null) {
    setPingIndicator(
      result.ok ? "ok" : "err",
      result.ok
        ? `成功 ${result.latencyMs} ms`
        : (result.errorCode || result.message || "失敗").toString().slice(0, 48)
    );
  } else if (result?.ok === true) {
    setPingIndicator("ok", "成功");
  } else if (result?.ok === false) {
    setPingIndicator("err", (result.errorCode || result.message || "失敗").toString().slice(0, 48));
  }
}

function renderQnapTestStatus(status) {
  if (!status) return;
  renderEnvStatus(status.qnapEnv);
  const modeEl = $("qnap-mode");
  if (modeEl) {
    modeEl.textContent = status.qnapMode === "webdav" ? "WebDAV（本番）" : "Mock";
    modeEl.className = status.qnapMode === "webdav" ? "status-ok" : "status-warn";
  }
  const connEl = $("qnap-conn-status");
  if (connEl) {
    if (status.qnapConfigured) {
      connEl.textContent = "✅ 接続成功（実保存有効）";
      connEl.className = "status-ok";
    } else if (status.qnapMode === "webdav") {
      connEl.textContent = "❌ 接続未確認または失敗";
      connEl.className = "status-err";
    } else if (status.qnapEnv?.ready) {
      connEl.textContent = "未確認";
      connEl.className = "status-warn";
    } else {
      connEl.textContent = "Mock（.env 未設定）";
      connEl.className = "status-muted";
    }
  }
  if ($("qnap-last-test")) {
    $("qnap-last-test").textContent = formatJaDateTime(status.qnapLastTestAt);
  }
  const errEl = $("qnap-last-error");
  if (errEl) {
    const last = status.lastConnectionTest;
    const errText =
      (last &&
        !last.ok &&
        (last.errorCode ? `${last.errorCode}: ${last.errorReason || last.message}` : last.message)) ||
      status.qnapLastError ||
      "—";
    errEl.textContent = errText;
    errEl.className = errText !== "—" ? "status-err" : "status-muted";
  }
  renderDiagFields(status.lastConnectionTest);
  if ($("qnap-test-filename") && status.testFileName) {
    $("qnap-test-filename").textContent = status.testFileName;
  }
  const delEl = $("qnap-delete-result");
  if (delEl && status.lastTestPdfDelete) {
    delEl.textContent = status.lastTestPdfDelete.ok
      ? `✅ ${status.lastTestPdfDelete.message}`
      : `❌ ${status.lastTestPdfDelete.message}`;
    delEl.className = status.lastTestPdfDelete.ok ? "status-ok" : "status-err";
  }
  renderConnectionSteps(status.lastConnectionTest?.steps);
  if (status.lastConnectionTest?.logs) showPingLogs(status.lastConnectionTest.logs);
  if (status.summary?.saveRouteLabel && $("qnap-save-route-status")) {
    $("qnap-save-route-status").textContent = status.summary.saveRouteLabel;
  }
}

function fillForm(settings) {
  $("local-enabled").checked = settings.localStorageEnabled !== false;
  $("qnap-enabled").checked = Boolean(settings.qnapBackupEnabled);
  if ($("qnap-save-route")) {
    $("qnap-save-route").value = settings.saveRoute || "auto";
  }
  const host =
    (settings.qnap?.host || "").trim() || getStoredDocumentNasHost() || DOCUMENT_NAS_HOST;
  $("qnap-host").value = host;
  setStoredDocumentNasHost(host);
  $("qnap-port").value = settings.qnap?.port ?? DOCUMENT_NAS_DEFAULT_PORT;
  setStoredDocumentNasPort($("qnap-port").value);
  $("qnap-share").value = settings.qnap?.shareName ?? "TiSLY";
  $("qnap-user").value = settings.qnap?.username ?? "";
  $("qnap-pass").value = "";
  $("qnap-pass").placeholder = settings.qnap?.hasPassword
    ? "変更時のみ入力（保存済み）"
    : "パスワード";
}

function collectForm() {
  const host =
    $("qnap-host").value.trim() || getStoredDocumentNasHost() || DOCUMENT_NAS_HOST;
  const port =
    Number($("qnap-port").value) || getStoredDocumentNasPort() || DOCUMENT_NAS_DEFAULT_PORT;
  setStoredDocumentNasHost(host);
  setStoredDocumentNasPort(port);
  return {
    localStorageEnabled: $("local-enabled").checked,
    qnapBackupEnabled: $("qnap-enabled").checked,
    saveRoute: $("qnap-save-route")?.value || "auto",
    qnap: {
      host,
      port,
      shareName: $("qnap-share").value.trim() || "TiSLY",
      username: $("qnap-user").value.trim(),
      password: $("qnap-pass").value,
    },
  };
}

async function loadQnapStatus() {
  try {
    const status = await api("/qnap/status");
    renderQnapTestStatus(status);
    return status;
  } catch {
    return null;
  }
}

async function load() {
  const data = await api("");
  fillForm(data.settings);
  renderSummary(data.summary);
  renderEnvStatus(data.qnapEnv);
  if (data.settings.lastConnectionTest) {
    const t = data.settings.lastConnectionTest;
    const msg = t.errorCode ? `${t.errorCode}: ${t.errorReason || t.message}` : t.message;
    showResult($("connection-result"), t.ok, msg);
    renderConnectionSteps(t.steps);
    renderDiagFields(t);
    if (t.logs) showPingLogs(t.logs);
  }
  if (data.settings.lastTestPdfSend) {
    showResult($("pdf-result"), data.settings.lastTestPdfSend.ok, data.settings.lastTestPdfSend.message);
  }
  await loadQnapStatus();
}

function renderIntegrity(report) {
  $("integrity-doc-count").textContent = String(report.documentCount ?? "—");
  $("integrity-issue-count").textContent = String(report.issueCount ?? "—");
  const statusEl = $("integrity-status");
  const warnEl = $("integrity-warning");
  if ((report.issueCount ?? 0) > 0) {
    statusEl.textContent = "⚠️ 差分あり";
    statusEl.className = "status-err";
    warnEl.classList.remove("hidden");
    warnEl.textContent = report.message || "整合性に問題があります";
  } else {
    statusEl.textContent = report.qnapMode === "webdav" ? "✅ 整合" : "Mock（未設定）";
    statusEl.className = report.qnapMode === "webdav" ? "status-ok" : "status-muted";
    warnEl.classList.add("hidden");
  }
  const specEl = $("integrity-spec-photos");
  if (specEl && report.specPhotos) {
    const sp = report.specPhotos;
    specEl.textContent = sp.mismatchCount > 0 ? `⚠️ ${sp.message}` : `✅ ${sp.message}`;
    specEl.className = sp.mismatchCount > 0 ? "status-err" : "status-ok";
  }
}

async function loadIntegrity() {
  const data = await api("/qnap/integrity");
  renderIntegrity(data);
}

function buildLocalWebDavUrlFromForm() {
  const host =
    $("qnap-host").value.trim() || getStoredDocumentNasHost() || DOCUMENT_NAS_HOST;
  const port =
    Number($("qnap-port").value) || getStoredDocumentNasPort() || DOCUMENT_NAS_DEFAULT_PORT;
  const share = $("qnap-share").value.trim() || "TiSLY";
  setStoredDocumentNasHost(host);
  setStoredDocumentNasPort(port);
  return buildDocumentNasWebDavUrl(host, port, share);
}

/** 設定保存 → ルートに応じた Ping（1タップ診断） */
async function runConnectPingFlow() {
  const btn = $("btn-connect-ping");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-running");
  }
  setPingIndicator("running", "診断中…");
  try {
    const saved = await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
    fillForm(saved.settings);
    renderSummary(saved.summary);
    renderEnvStatus(saved.qnapEnv);

    const route = saved.settings?.saveRoute || $("qnap-save-route")?.value || "auto";
    const routeLabel = saveRouteLabelJa(route);

    if (route === "local_wifi") {
      const cfg = await api("/qnap/client-direct-config");
      const host =
        $("qnap-host").value.trim() ||
        cfg.host ||
        getStoredDocumentNasHost() ||
        DOCUMENT_NAS_HOST;
      const configuredPort =
        Number($("qnap-port").value) ||
        Number(cfg.port) ||
        getStoredDocumentNasPort() ||
        DOCUMENT_NAS_DEFAULT_PORT;
      const share = $("qnap-share").value.trim() || cfg.shareName || "TiSLY";
      if (!cfg.username || !cfg.password) {
        const msg = cfg.reason || "ローカル直接用の接続情報が不足しています";
        setPingIndicator("err", msg.slice(0, 48));
        showResult($("connection-result"), false, msg);
        toast(msg);
        return;
      }
      const resolved = await resolveLocalWebDavWithPortFallback({
        host,
        configuredPort,
        shareName: share,
        username: cfg.username,
        password: cfg.password,
      });
      if (resolved.ok && resolved.port) {
        $("qnap-port").value = String(resolved.port);
        setStoredDocumentNasPort(resolved.port);
      }
      const tried = (resolved.attempts || []).map((a) => a.port).join(",");
      applyPingResultToUi(
        {
          ok: resolved.ok,
          latencyMs: resolved.ping?.latencyMs,
          errorCode: resolved.ping?.errorCode,
          message: resolved.ok
            ? `${resolved.ping.message}（ポート ${resolved.port}）`
            : `${formatClientErrorMessage(resolved.ping?.errorCode, resolved.ping?.message)}（試行: ${tried}）`,
          saveRoute: "local_wifi",
        },
        { routeLabel }
      );
    } else {
      const data = await api("/qnap/ping", { method: "POST", body: "{}" });
      applyPingResultToUi(data, { routeLabel });
      if (data.summary) renderSummary(data.summary);
    }
    await loadQnapStatus();
  } catch (e) {
    const body = e.body || {};
    const msg =
      body.errorCode
        ? `${body.errorCode}: ${body.errorReason || body.message || e.message}`
        : body.message || e.message || "Ping失敗";
    setPingIndicator("err", msg.slice(0, 48));
    showResult($("connection-result"), false, msg);
    if (body.logs) showPingLogs(body.logs);
    toast(msg);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-running");
    }
  }
}

async function init() {
  initPracticalNav({ appId: "settings_v1", appName: "ストレージ", theme: "hub" });

  const session = await requireCustomerLogin(customerCodeFromPath());
  if (!session) return;

  const allowed = ["owner", "admin", "super_admin"];
  if (!allowed.includes(session.role)) {
    toast("管理者権限が必要です");
    setTimeout(() => {
      location.href = "/app";
    }, 1500);
    return;
  }

  $("btn-toggle-advanced")?.addEventListener("click", () => {
    const panel = $("advanced-qnap-actions");
    const toggle = $("btn-toggle-advanced");
    if (!panel || !toggle) return;
    const open = panel.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "詳細テスト・再同期を隠す" : "詳細テスト・再同期を表示";
  });

  $("btn-connect-ping")?.addEventListener("click", () => {
    runConnectPingFlow();
  });

  $("btn-save")?.addEventListener("click", async () => {
    try {
      const data = await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      fillForm(data.settings);
      renderSummary(data.summary);
      renderEnvStatus(data.qnapEnv);
      await loadQnapStatus();
      toast(`保存しました（${saveRouteLabelJa(data.settings?.saveRoute || "auto")}）`);
    } catch (e) {
      toast(e.message || "保存に失敗しました");
    }
  });

  $("btn-test-connection")?.addEventListener("click", async () => {
    $("btn-test-connection").disabled = true;
    setPingIndicator("running", "詳細テスト中…");
    try {
      const data = await api("/qnap/test-connection", { method: "POST", body: "{}" });
      const r = data.result || {};
      const msg = r.errorCode
        ? `${r.errorCode}: ${r.errorReason || r.message}`
        : r.message;
      showResult($("connection-result"), r.ok, msg);
      renderConnectionSteps(r.steps);
      renderDiagFields(r);
      if (r.logs) showPingLogs(r.logs);
      renderSummary(data.summary);
      renderEnvStatus(data.qnapEnv);
      await loadQnapStatus();
      toast(r.ok ? `接続成功${r.latencyMs != null ? ` (${r.latencyMs}ms)` : ""}` : msg);
    } catch (e) {
      const body = e.body || {};
      const msg = body.errorCode
        ? `${body.errorCode}: ${body.errorReason || e.message}`
        : e.message || "接続テスト失敗";
      showResult($("connection-result"), false, msg);
      setPingIndicator("err", msg.slice(0, 48));
      toast(msg);
    } finally {
      $("btn-test-connection").disabled = false;
    }
  });

  $("btn-ping")?.addEventListener("click", async () => {
    $("btn-ping").disabled = true;
    setPingIndicator("running", "VPS Ping中…");
    try {
      const data = await api("/qnap/ping", { method: "POST", body: "{}" });
      applyPingResultToUi(data, { routeLabel: saveRouteLabelJa(data.saveRoute || "vps") });
      if (data.summary) renderSummary(data.summary);
    } catch (e) {
      const body = e.body || {};
      const msg = body.message || e.message || "Ping失敗";
      showResult($("connection-result"), false, msg);
      setPingIndicator("err", msg.slice(0, 48));
      if (body.logs) showPingLogs(body.logs);
      toast(msg);
    } finally {
      $("btn-ping").disabled = false;
    }
  });

  $("btn-local-ping")?.addEventListener("click", async () => {
    $("btn-local-ping").disabled = true;
    setPingIndicator("running", "ローカル診断中…");
    try {
      await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      const cfg = await api("/qnap/client-direct-config");
      const host =
        $("qnap-host").value.trim() ||
        cfg.host ||
        getStoredDocumentNasHost() ||
        DOCUMENT_NAS_HOST;
      const configuredPort =
        Number($("qnap-port").value) ||
        Number(cfg.port) ||
        getStoredDocumentNasPort() ||
        DOCUMENT_NAS_DEFAULT_PORT;
      const share = $("qnap-share").value.trim() || cfg.shareName || "TiSLY";
      if (!cfg.username || !cfg.password) {
        const msg = cfg.reason || "ローカル直接用の接続情報が不足しています";
        showResult($("connection-result"), false, msg);
        setPingIndicator("err", msg.slice(0, 48));
        toast(msg);
        return;
      }
      const resolved = await resolveLocalWebDavWithPortFallback({
        host,
        configuredPort,
        shareName: share,
        username: cfg.username,
        password: cfg.password,
      });
      if (resolved.ok && resolved.port) {
        $("qnap-port").value = String(resolved.port);
        setStoredDocumentNasPort(resolved.port);
      }
      const tried = (resolved.attempts || []).map((a) => a.port).join(",");
      applyPingResultToUi(
        {
          ok: resolved.ok,
          latencyMs: resolved.ping?.latencyMs,
          errorCode: resolved.ping?.errorCode,
          message: resolved.ok
            ? `${resolved.ping.message}（ポート ${resolved.port}）`
            : `${formatClientErrorMessage(resolved.ping?.errorCode, resolved.ping?.message)}（試行: ${tried}）`,
          saveRoute: "local_wifi",
        },
        { routeLabel: "ローカルWi-Fi経由" }
      );
    } catch (e) {
      toast(e.message || "ローカル診断に失敗しました");
      setPingIndicator("err", (e.message || "失敗").slice(0, 48));
    } finally {
      $("btn-local-ping").disabled = false;
    }
  });

  $("btn-test-pdf")?.addEventListener("click", async () => {
    $("btn-test-pdf").disabled = true;
    try {
      await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      const data = await api("/qnap/test-pdf", { method: "POST", body: "{}" });
      showResult($("pdf-result"), data.result.ok, data.result.message);
      renderSummary(data.summary);
      await loadQnapStatus();
    } catch (e) {
      showResult($("pdf-result"), false, e.message || "テスト送信失敗");
    } finally {
      $("btn-test-pdf").disabled = false;
    }
  });

  $("btn-test-delete")?.addEventListener("click", async () => {
    $("btn-test-delete").disabled = true;
    try {
      await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      const data = await api("/qnap/test-delete", { method: "POST", body: "{}" });
      showResult($("pdf-result"), data.result.ok, data.result.message);
      await loadQnapStatus();
      toast(data.result.ok ? "テストファイルを削除しました" : data.result.message);
    } catch (e) {
      toast(e.message || "削除に失敗しました");
    } finally {
      $("btn-test-delete").disabled = false;
    }
  });

  $("btn-retry-failed")?.addEventListener("click", async () => {
    if (!confirm("QNAP保存失敗分を再同期しますか？")) return;
    $("btn-retry-failed").disabled = true;
    try {
      const data = await api("/qnap/retry-failed", { method: "POST", body: "{}" });
      toast(`再同期: 成功 ${data.result?.synced?.length ?? 0} / 失敗 ${data.result?.failed?.length ?? 0}`);
      await loadQnapStatus();
    } catch (e) {
      toast(e.message || "再同期に失敗しました");
    } finally {
      $("btn-retry-failed").disabled = false;
    }
  });

  $("btn-resync-pending")?.addEventListener("click", async () => {
    $("btn-resync-pending").disabled = true;
    try {
      const data = await api("/qnap/resync/pending", { method: "POST", body: "{}" });
      toast(`未保存同期: 成功 ${data.result?.synced?.length ?? 0} / 失敗 ${data.result?.failed?.length ?? 0}`);
      await loadIntegrity();
    } catch (e) {
      toast(e.message || "同期に失敗しました");
    } finally {
      $("btn-resync-pending").disabled = false;
    }
  });

  $("btn-resync-failed")?.addEventListener("click", async () => {
    $("btn-resync-failed").disabled = true;
    try {
      const data = await api("/qnap/resync/failed", { method: "POST", body: "{}" });
      toast(`失敗再同期: 成功 ${data.result?.synced?.length ?? 0} / 失敗 ${data.result?.failed?.length ?? 0}`);
      await loadIntegrity();
    } catch (e) {
      toast(e.message || "再同期に失敗しました");
    } finally {
      $("btn-resync-failed").disabled = false;
    }
  });

  $("btn-integrity-check")?.addEventListener("click", async () => {
    try {
      await loadIntegrity();
      toast("整合チェック完了");
    } catch (e) {
      toast(e.message || "整合チェックに失敗しました");
    }
  });

  $("btn-integrity-resync")?.addEventListener("click", async () => {
    if (!confirm("整合チェック後、未保存・失敗分を再同期しますか？")) return;
    $("btn-integrity-resync").disabled = true;
    try {
      const data = await api("/qnap/integrity/resync", {
        method: "POST",
        body: JSON.stringify({ mode: "all" }),
      });
      renderIntegrity(data.integrityAfter ?? data);
      toast(
        `再同期: 書類成功 ${data.documents?.synced?.length ?? 0} / 失敗 ${data.documents?.failed?.length ?? 0}`
      );
    } catch (e) {
      toast(e.message || "再同期に失敗しました");
    } finally {
      $("btn-integrity-resync").disabled = false;
    }
  });

  $("btn-integrity-pending")?.addEventListener("click", async () => {
    try {
      const data = await api("/qnap/integrity/resync", {
        method: "POST",
        body: JSON.stringify({ mode: "pending" }),
      });
      renderIntegrity(data.integrityAfter ?? data);
      toast(`未保存同期: ${data.documents?.synced?.length ?? 0} 件`);
    } catch (e) {
      toast(e.message || "同期に失敗しました");
    }
  });

  $("btn-integrity-failed")?.addEventListener("click", async () => {
    try {
      const data = await api("/qnap/integrity/resync", {
        method: "POST",
        body: JSON.stringify({ mode: "failed" }),
      });
      renderIntegrity(data.integrityAfter ?? data);
      toast(`失敗再同期: ${data.documents?.synced?.length ?? 0} 件`);
    } catch (e) {
      toast(e.message || "再同期に失敗しました");
    }
  });

  try {
    await load();
    await loadIntegrity();
  } catch (e) {
    toast(e.message || "読み込みに失敗しました");
  }
}

init().catch(console.error);
