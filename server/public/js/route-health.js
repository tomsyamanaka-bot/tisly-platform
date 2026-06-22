import { getCustomerToken } from "./customer-auth.js";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchJson } from "./tisly-fetch-v1.js";

const PAGE_ROUTES = [
  { path: "/schedule-v1", label: "日程" },
  { path: "/survey-v1", label: "現調" },
  { path: "/survey-drawing-v1", label: "現調図面" },
  { path: "/estimate-v1", label: "見積" },
  { path: "/estimate-v1?tab=invoice", label: "請求タブ" },
  { path: "/projects-v1", label: "案件" },
  { path: "/field-check-v1", label: "持ち物/現場" },
  { path: "/field-check-v1?tab=orders", label: "発注タブ" },
  { path: "/app", label: "App Hub" },
  { path: "/route-map", label: "Route Map" },
];

const LEGACY_REDIRECTS = [
  { from: "/estimate", expect: "/estimate-v1" },
  { from: "/invoice", expect: "/estimate-v1" },
  { from: "/drawing-editor", expect: "/survey-drawing-v1" },
  { from: "/survey", expect: "/survey-v1" },
  { from: "/projects", expect: "/projects-v1" },
  { from: "/materials", expect: "/field-check-v1" },
];

const BOTTOM_NAV_LINKS = [
  { label: "日程", href: "/schedule-v1" },
  { label: "現調", href: "/survey-v1" },
  { label: "見積", href: "/estimate-v1" },
  { label: "請求", href: "/estimate-v1?tab=invoice" },
  { label: "案件", href: "/projects-v1" },
  { label: "現場", href: "/field-check-v1" },
  { label: "材料", href: "/field-check-v1" },
  { label: "発注", href: "/field-check-v1?tab=orders" },
];

const JS_ASSETS = [
  { path: "/js/estimate-v1.js?v=estimate-ui-v7", label: "estimate-v1 JS" },
  { path: "/js/survey-v1.js?v=survey-ui-v4", label: "survey-v1 JS" },
  { path: "/js/survey-drawing-v1.js?v=survey-drawing-ui-v3", label: "survey-drawing-v1 JS" },
  { path: "/js/tisly-practical-nav.js", label: "bottom nav JS" },
];

const ESTIMATE_UI_VERSION = "estimate-ui-v7";
const SW_CACHE_TOKEN = "v2395";

const DATA_API_PROBES = [
  {
    path: "/api/schedule/v1/week?offset=0",
    label: "Schedule API",
    countLabel: "schedule days",
    countFn: (d) => (Array.isArray(d.days) ? d.days.length : null),
  },
  {
    path: "/api/estimate/v1/projects?customerCode=TOMS001",
    label: "Estimate projects",
    countLabel: "estimate projects",
    countFn: (d) => (Array.isArray(d.projects) ? d.projects.length : null),
  },
  {
    path: "/api/estimate/v1/invoices?customerCode=TOMS001",
    label: "Invoice API",
    countLabel: "invoices",
    countFn: (d) => (Array.isArray(d.projects) ? d.projects.length : null),
  },
  {
    path: "/api/projects/v1/projects",
    label: "Project API",
    countLabel: "projects",
    countFn: (d) => (Array.isArray(d.projects) ? d.projects.length : null),
  },
  {
    path: "/api/estimate/v1/customers/suggest?q=t",
    label: "Customer suggest",
    countLabel: "customer suggest",
    countFn: (d) => (Array.isArray(d.suggestions) ? d.suggestions.length : null),
  },
  {
    path: "/api/field-check/v1/projects",
    label: "Field check",
    countLabel: "field check projects",
    countFn: (d) => (Array.isArray(d.projects) ? d.projects.length : null),
  },
];

const VERIFY_STEPS = [
  { n: 1, label: "更新してください（下のボタン）", href: null, action: "refresh" },
  { n: 2, label: "schedule-v1 — Load failed にならない", href: "/schedule-v1" },
  { n: 3, label: "estimate-v1 — 読み込み中で止まらない", href: "/estimate-v1" },
  { n: 4, label: "invoice tab — 請求書一覧が開く", href: "/estimate-v1?tab=invoice" },
  { n: 5, label: "projects-v1 — 案件一覧", href: "/projects-v1" },
  { n: 6, label: "field-check-v1 — 材料チェック", href: "/field-check-v1" },
];

const CACHE_PREFIX = "tisly_api_cache_v1:";

async function checkPage(path) {
  try {
    const res = await fetch(path, { method: "GET", redirect: "follow", cache: "no-store" });
    if (res.ok) return { status: "ok", detail: `HTTP ${res.status}` };
    return { status: "fail", detail: `HTTP ${res.status}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkRedirect(from, expectPrefix) {
  try {
    const res = await fetch(from, { method: "GET", redirect: "manual", cache: "no-store" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") || "";
      if (loc.includes(expectPrefix)) {
        return { status: "ok", detail: `→ ${loc}` };
      }
      return { status: "warn", detail: `Unexpected redirect: ${loc}` };
    }
    return { status: "fail", detail: `HTTP ${res.status} (redirect expected)` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkApi(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    if (data.status === "ok" || data.commitShort) {
      return { status: "ok", detail: data.commitShort ? `commit ${data.commitShort}` : "ok" };
    }
    return { status: "warn", detail: "Unexpected JSON" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkEstimateApi() {
  try {
    const res = await fetch("/api/estimate/v1/price-rules", { cache: "no-store" });
    if (res.status === 401) return { status: "warn", detail: "401 (要ログイン・エンドポイント存在)" };
    if (res.ok) return { status: "ok", detail: `HTTP ${res.status}` };
    return { status: "warn", detail: `HTTP ${res.status}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkEstimateUiVersion() {
  try {
    const res = await fetch(`/js/estimate-v1.js?v=${ESTIMATE_UI_VERSION}`, { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    if (js.includes(`ESTIMATE_UI_VERSION = "${ESTIMATE_UI_VERSION}"`)) {
      const dupEscape = (js.match(/function escapeHtml/g) || []).length;
      const importOk = !js.includes("Identifier 'escapeHtml' has already been declared");
      if (dupEscape > 1 || !importOk) {
        return { status: "fail", detail: "JS構文エラー（escapeHtml重複の可能性）" };
      }
      return { status: "ok", detail: ESTIMATE_UI_VERSION };
    }
    return { status: "warn", detail: "バージョン定数未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkFieldChecklistJs() {
  try {
    const res = await fetch("/js/field-checklist-ui.js?v=fc-ui-v2", { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const count = (js.match(/function escapeHtml/g) || []).length;
    if (count > 1) return { status: "fail", detail: `escapeHtml ${count}回宣言（import失敗原因）` };
    return { status: "ok", detail: "field-checklist-ui.js OK" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkInvoiceTabHtml() {
  try {
    const res = await fetch("/estimate-v1?tab=invoice", { cache: "no-store" });
    const html = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const hasInvoiceTab = html.includes('id="tab-invoices"') || html.includes("請求書一覧");
    const hasInvoiceBtn = html.includes("btn-new-standalone-invoice");
    const tabActive = html.includes("tab=invoice");
    if (hasInvoiceTab && hasInvoiceBtn && tabActive) {
      return { status: "ok", detail: "請求タブ UI 検出" };
    }
    return { status: "warn", detail: "請求タブ UI 未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkEstimateOperational() {
  try {
    const [htmlRes, jsRes] = await Promise.all([
      fetch("/estimate-v1", { cache: "no-store" }),
      fetch(`/js/estimate-v1.js?v=${ESTIMATE_UI_VERSION}`, { cache: "no-store" }),
    ]);
    const html = await htmlRes.text();
    const js = await jsRes.text();
    if (!htmlRes.ok) return { status: "fail", detail: `HTML HTTP ${htmlRes.status}` };
    const checks = [
      ["見積トップ", html.includes("view-list") && html.includes("btn-new-standalone-estimate")],
      ["新規見積ボタン", html.includes("【新規見積】")],
      ["請求タブ", html.includes("tab-invoices")],
      ["新規請求書ボタン", html.includes("btn-new-standalone-invoice")],
      ["PDF導線", html.includes("btn-pdf-quick-generate") && html.includes("btn-pdf-estimate")],
      ["localStorage fallback", js.includes("LOCAL_DRAFTS_KEY") && js.includes("createLocalDraftFromStandalone")],
      ["振込先表記", js.includes("株式会社TOMS") && js.includes("TOMS_DEFAULT_BANK_INFO") && js.includes("トムズ")],
      ["field-checklist import", js.includes("field-checklist-ui.js?v=fc-ui-v2")],
    ];
    const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
    if (!failed.length) return { status: "ok", detail: `${checks.length}項目 OK` };
    return { status: "warn", detail: `未検出: ${failed.join(", ")}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkDrawingOperational() {
  try {
    const res = await fetch("/survey-drawing-v1", { cache: "no-store" });
    const html = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const checks = [
      html.includes("drawing-stage"),
      html.includes("btn-import-photo") || html.includes("file-bg"),
      html.includes("btn-save"),
      html.includes("btn-back"),
      html.includes("drawing-svg"),
    ];
    const okCount = checks.filter(Boolean).length;
    if (okCount === checks.length) return { status: "ok", detail: "方眼紙・保存・戻る UI OK" };
    return { status: "warn", detail: `${okCount}/${checks.length} 項目検出` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkBottomNavJs() {
  try {
    const res = await fetch("/js/tisly-practical-nav.js", { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const required = [
      '/schedule-v1"',
      '/survey-v1"',
      '/estimate-v1"',
      '/estimate-v1?tab=invoice"',
      '/projects-v1"',
      '/field-check-v1"',
      '/field-check-v1?tab=orders"',
    ];
    const missing = required.filter((href) => !js.includes(href));
    if (!missing.length) return { status: "ok", detail: "8タブリンク OK" };
    return { status: "warn", detail: `不足: ${missing.join(", ")}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function readServiceWorkerVersion() {
  try {
    const res = await fetch("/service-worker.js", { cache: "no-store" });
    const text = await res.text();
    const m = text.match(/SW_VERSION\s*=\s*"([^"]+)"/);
    return m ? m[1] : "unknown";
  } catch {
    return "unavailable";
  }
}

async function checkSwCache() {
  const swVersion = await readServiceWorkerVersion();
  let cacheNames = [];
  let stale = false;
  try {
    if ("caches" in window) {
      cacheNames = await caches.keys();
      stale = cacheNames.some((n) => !n.includes(SW_CACHE_TOKEN));
    }
  } catch {
    /* ignore */
  }
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  const active = reg?.active?.scriptURL?.split("/").pop() || "—";
  const detail = `SW ${swVersion} · active ${active} · caches ${cacheNames.length || 0}${stale ? " · 古いcacheあり" : ""}`;
  return {
    status: stale ? "warn" : swVersion.includes(SW_CACHE_TOKEN) ? "ok" : "warn",
    detail,
    swVersion,
    stale,
  };
}

function statusLabel(s) {
  if (s === "ok") return '<span class="ok">✅ OK</span>';
  if (s === "warn") return '<span class="warn">⚠ 要確認</span>';
  return '<span class="fail">❌ 異常</span>';
}

function renderRows(rows, tbodyId = "results") {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = rows
    .map(
      (r) =>
        `<tr><td><code>${r.path}</code><br><small>${r.label || ""}</small></td><td>${statusLabel(r.status)}</td><td>${r.detail}</td></tr>`
    )
    .join("");
  const ok = rows.filter((r) => r.status === "ok").length;
  const warn = rows.filter((r) => r.status === "warn").length;
  const fail = rows.filter((r) => r.status === "fail").length;
  document.getElementById("sum-ok").textContent = String(ok);
  document.getElementById("sum-warn").textContent = String(warn);
  document.getElementById("sum-fail").textContent = String(fail);
}

function scanLocalCacheStats() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      let savedAt = "—";
      try {
        const payload = JSON.parse(localStorage.getItem(key) || "{}");
        savedAt = payload.savedAt || "—";
      } catch {
        /* ignore */
      }
      entries.push({ key: key.slice(CACHE_PREFIX.length), savedAt });
    }
  } catch {
    /* ignore */
  }
  return entries;
}

function authHeaders() {
  const token = getCustomerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function probeDataApi(probe) {
  const started = performance.now();
  const token = getCustomerToken();
  try {
    const res = await fetch(probe.path, {
      cache: "no-store",
      headers: authHeaders(),
    });
    const ms = Math.round(performance.now() - started);
    const data = await res.json().catch(() => ({}));
    const count = probe.countFn(data);
    const countText = count == null ? "—" : String(count);
    if (res.status === 401) {
      return {
        status: "warn",
        detail: `${ms}ms · 401 要ログイン · endpoint OK`,
        httpStatus: 401,
        count: null,
        bodyPreview: data.message || data.error || "Unauthorized",
        fallback: false,
      };
    }
    if (!res.ok) {
      return {
        status: "fail",
        detail: `${ms}ms · HTTP ${res.status} · ${data.message || data.error || ""}`.trim(),
        httpStatus: res.status,
        count: null,
        bodyPreview: JSON.stringify(data).slice(0, 120),
        fallback: false,
      };
    }
    const cacheKey = probe.path.includes("schedule")
      ? "schedule:week:0"
      : probe.path.includes("invoices")
        ? "estimate:invoices:TOMS001"
        : probe.path.includes("customers/suggest")
          ? null
          : probe.path.includes("field-check")
            ? null
            : probe.path.includes("/projects/v1")
              ? "projects:list"
              : probe.path.includes("estimate/v1/projects")
                ? "estimate:projects:TOMS001"
                : null;
    let fallback = false;
    if (cacheKey) {
      try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}${cacheKey.split(":").slice(0, 2).join(":")}`);
        fallback = Boolean(raw);
      } catch {
        fallback = false;
      }
    }
    return {
      status: "ok",
      detail: `${ms}ms · ${probe.countLabel} ${countText}${token ? "" : " · 未ログイン"}`,
      httpStatus: res.status,
      count,
      bodyPreview: `${countText}件`,
      fallback,
    };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    return {
      status: "fail",
      detail: `${ms}ms · ${e.message || String(e)}`,
      httpStatus: 0,
      count: null,
      bodyPreview: e.message || String(e),
      fallback: false,
    };
  }
}

async function checkAuthState() {
  const token = getCustomerToken();
  if (!token) {
    return { status: "warn", detail: "未ログイン — App Hub からログインしてください" };
  }
  try {
    const session = await fetchJson(
      "/api/pwa/hub",
      { headers: authHeaders(), label: "auth" },
      DEFAULT_FETCH_TIMEOUT_MS
    );
    return {
      status: "ok",
      detail: `${session.customerCode || "—"} · ${session.role || "—"} · token OK`,
    };
  } catch (e) {
    return { status: "fail", detail: `セッション無効 · ${e.message || String(e)}` };
  }
}

async function checkGoogleCalendarState() {
  const token = getCustomerToken();
  try {
    const res = await fetch("/api/google-calendar/status", {
      cache: "no-store",
      headers: token ? authHeaders() : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "warn", detail: `HTTP ${res.status}` };
    }
    const parts = [
      data.connected ? "connected" : "未接続",
      data.displayStatus || data.mode || "",
      data.lastSyncAt ? `sync ${new Date(data.lastSyncAt).toLocaleString("ja-JP")}` : "sync —",
    ].filter(Boolean);
    return {
      status: data.connected ? "ok" : "warn",
      detail: parts.join(" · "),
    };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

function renderVerifySteps() {
  const mount = document.getElementById("verify-steps-list");
  if (!mount) return;
  mount.innerHTML = VERIFY_STEPS.map((step) => {
    if (step.action === "refresh") {
      return `<li><strong>${step.n}.</strong> ${step.label}</li>`;
    }
    return `<li><strong>${step.n}.</strong> <a href="${step.href}">${step.label}</a></li>`;
  }).join("");
}

function renderCacheDiagnostics(entries) {
  const mount = document.getElementById("cache-diag-body");
  if (!mount) return;
  if (!entries.length) {
    mount.innerHTML = "<tr><td colspan='3'>localStorage キャッシュなし（初回または未使用）</td></tr>";
    return;
  }
  mount.innerHTML = entries
    .map(
      (e) =>
        `<tr><td><code>${e.key}</code></td><td>${e.savedAt !== "—" ? new Date(e.savedAt).toLocaleString("ja-JP") : "—"}</td><td>保存済み</td></tr>`
    )
    .join("");
}

async function checkPdfDiagnostics() {
  try {
    const res = await fetch("/api/health/pdf-diagnostics", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };

    const shareSupported = (() => {
      if (typeof navigator.share !== "function") return false;
      if (typeof navigator.canShare !== "function") return true;
      try {
        const file = new File([new Blob(["%PDF-"], { type: "application/pdf" })], "probe.pdf", {
          type: "application/pdf",
        });
        return navigator.canShare({ files: [file] });
      } catch {
        return false;
      }
    })();

    const typeSummary = (data.types || [])
      .map((t) => `${t.label}:${t.status === "ok" ? "OK" : "NG"}`)
      .join(" · ");
    const blobOk = data.blobGeneration === "ok" ? "Blob OK" : "Blob NG";
    const shareLabel = shareSupported ? "Web Share OK" : "download fallback";
    const detail = `${typeSummary || "—"} · ${blobOk} · ${shareLabel} · engine ${data.pdfEngine || "—"}`;

    const allOk = (data.types || []).every((t) => t.status === "ok");
    return { status: allOk ? "ok" : "warn", detail, data, shareSupported };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkSurveyPdfButtons() {
  try {
    const res = await fetch("/survey-v1", { cache: "no-store" });
    const html = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const hasButtons =
      html.includes("btn-survey-pdf-create") &&
      html.includes("btn-survey-pdf-save") &&
      html.includes("btn-survey-pdf-share") &&
      html.includes("btn-survey-pdf-preview") &&
      html.includes("btn-survey-pdf-redo");
    return hasButtons
      ? { status: "ok", detail: "仕様書PDF操作ボタンあり" }
      : { status: "warn", detail: "仕様書PDFボタン未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkDrawingPdfButtons() {
  try {
    const res = await fetch("/survey-drawing-v1", { cache: "no-store" });
    const html = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const hasButtons =
      html.includes("btn-drawing-pdf-create") &&
      html.includes("btn-drawing-pdf-save") &&
      html.includes("btn-drawing-pdf-share");
    return hasButtons
      ? { status: "ok", detail: "図面PDF操作ボタンあり" }
      : { status: "warn", detail: "図面PDFボタン未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function runChecks() {
  document.getElementById("results").innerHTML = '<tr><td colspan="3">チェック中…</td></tr>';
  const checkedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  document.getElementById("checked-at").textContent = checkedAt;
  renderVerifySteps();

  const rows = [];
  const diagRows = [];
  let lastError = null;
  let lastSuccess = checkedAt;

  for (const r of PAGE_ROUTES) {
    rows.push({ path: r.path, label: r.label, ...(await checkPage(r.path)) });
  }
  for (const r of LEGACY_REDIRECTS) {
    rows.push({
      path: `${r.from} (redirect)`,
      label: `→ ${r.expect}`,
      ...(await checkRedirect(r.from, r.expect)),
    });
  }
  for (const r of JS_ASSETS) {
    rows.push({ path: r.path, label: r.label, ...(await checkPage(r.path)) });
  }
  for (const r of BOTTOM_NAV_LINKS) {
    rows.push({
      path: `nav: ${r.href}`,
      label: r.label,
      ...(await checkPage(r.href)),
    });
  }

  const health = await checkApi("/api/health");
  rows.push({
    path: "/api/health",
    label: "Health API",
    status: health.status === "ok" ? "ok" : "fail",
    detail: health.detail,
  });

  const auth = await checkAuthState();
  rows.push({ path: "auth", label: "認証状態", ...auth });
  diagRows.push({ path: "auth", label: "認証", ...auth });

  const google = await checkGoogleCalendarState();
  rows.push({ path: "Google Calendar", label: "Google連携", ...google });
  diagRows.push({ path: "/api/google-calendar/status", label: "Google Calendar", ...google });

  for (const probe of DATA_API_PROBES) {
    const result = await probeDataApi(probe);
    rows.push({ path: probe.path, label: probe.label, ...result });
    diagRows.push({
      path: probe.path,
      label: probe.label,
      status: result.status,
      detail: `${result.detail}${result.fallback ? " · cacheあり" : ""}`,
    });
    if (result.status === "fail") lastError = result.detail;
    else if (result.status === "ok") lastSuccess = checkedAt;
  }

  const cacheEntries = scanLocalCacheStats();
  rows.push({
    path: "localStorage cache",
    label: "APIキャッシュ",
    status: cacheEntries.length ? "ok" : "warn",
    detail: `${cacheEntries.length}件`,
  });
  renderCacheDiagnostics(cacheEntries);

  const estApi = await checkEstimateApi();
  rows.push({ path: "/api/estimate/v1", label: "estimate API", ...estApi });

  const checklistJs = await checkFieldChecklistJs();
  rows.push({ path: "field-checklist-ui.js", label: "見積import依存", ...checklistJs });

  const estUi = await checkEstimateUiVersion();
  rows.push({ path: "estimate-v1 UI", label: "UI version", ...estUi });

  const invTab = await checkInvoiceTabHtml();
  rows.push({ path: "invoice tab", label: "請求タブ", ...invTab });

  const estOps = await checkEstimateOperational();
  rows.push({ path: "estimate ops", label: "見積操作チェック", ...estOps });

  const drawOps = await checkDrawingOperational();
  rows.push({ path: "drawing ops", label: "図面エディタ操作", ...drawOps });

  const navJs = await checkBottomNavJs();
  rows.push({ path: "bottom nav JS", label: "下部ナビリンク", ...navJs });

  const sw = await checkSwCache();
  rows.push({ path: "Service Worker", label: "cache version", ...sw });

  const pdfDiag = await checkPdfDiagnostics();
  rows.push({ path: "PDF診断 API", label: "4帳票生成", status: pdfDiag.status, detail: pdfDiag.detail });
  for (const t of pdfDiag.data?.types || []) {
    rows.push({
      path: `PDF: ${t.kind}`,
      label: t.label,
      status: t.status === "ok" ? "ok" : "fail",
      detail: t.detail,
    });
  }
  rows.push({
    path: "Web Share API",
    label: "iPhone共有",
    status: pdfDiag.shareSupported ? "ok" : "warn",
    detail: pdfDiag.shareSupported ? "files共有対応" : "download fallback",
  });
  rows.push({
    path: "PDFライブラリ",
    label: "pdfEngine",
    status: pdfDiag.data?.pdfEngineReady ? "ok" : "warn",
    detail: `${pdfDiag.data?.pdfEngine || "—"}${pdfDiag.data?.pdfLastError ? ` · ${pdfDiag.data.pdfLastError}` : ""}`,
  });

  const surveyPdf = await checkSurveyPdfButtons();
  rows.push({ path: "survey-v1 PDF", label: "現調PDFボタン", ...surveyPdf });

  const drawingPdf = await checkDrawingPdfButtons();
  rows.push({ path: "survey-drawing PDF", label: "図面PDFボタン", ...drawingPdf });

  rows.push({
    path: "最終成功",
    label: "probe",
    status: "ok",
    detail: lastSuccess,
  });
  rows.push({
    path: "最終エラー",
    label: "probe",
    status: lastError ? "fail" : "ok",
    detail: lastError || "なし",
  });

  renderRows(rows);
  renderRows(diagRows, "diag-results");

  try {
    sessionStorage.setItem(
      "tisly_route_health_last_probe_v1",
      JSON.stringify({ checkedAt, lastSuccess, lastError, cacheCount: cacheEntries.length })
    );
  } catch {
    /* ignore */
  }

  const staleBanner = document.getElementById("sw-stale-banner");
  const btnUpdate = document.getElementById("btn-sw-update");
  if (sw.stale && staleBanner) {
    staleBanner.classList.remove("hidden");
  } else {
    staleBanner?.classList.add("hidden");
  }
  btnUpdate?.addEventListener(
    "click",
    async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        const reg = await navigator.serviceWorker?.getRegistration?.();
        await reg?.update?.();
        location.reload();
      } catch (e) {
        alert(e.message || String(e));
      }
    },
    { once: true }
  );
}

document.getElementById("btn-run")?.addEventListener("click", () => runChecks().catch(console.error));
document.getElementById("btn-iphone-refresh")?.addEventListener("click", async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update?.();
    location.reload();
  } catch (e) {
    alert(e.message || String(e));
  }
});
runChecks().catch(console.error);
