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
const SW_CACHE_TOKEN = "v2393";

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

async function checkEstimateUiVersion() {
  try {
    const res = await fetch(`/js/estimate-v1.js?v=${ESTIMATE_UI_VERSION}`, { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    if (js.includes(`ESTIMATE_UI_VERSION = "${ESTIMATE_UI_VERSION}"`)) {
      return { status: "ok", detail: ESTIMATE_UI_VERSION };
    }
    return { status: "warn", detail: "バージョン定数未検出" };
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

function renderRows(rows) {
  const tbody = document.getElementById("results");
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

async function checkDataApi(path, label, { countField } = {}) {
  const token =
    localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
  const started = performance.now();
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(path, { cache: "no-store", headers });
    const ms = Math.round(performance.now() - started);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      return { status: "warn", detail: `${ms}ms · 401 要ログイン · endpoint OK` };
    }
    if (!res.ok) {
      return { status: "fail", detail: `${ms}ms · HTTP ${res.status}` };
    }
    let count = "—";
    if (countField) {
      const v = data[countField];
      if (Array.isArray(v)) count = String(v.length);
      else if (v && typeof v === "object" && Array.isArray(v.projects)) count = String(v.projects.length);
      else if (v && typeof v === "object" && Array.isArray(v.days)) count = String(v.days.length);
      else if (typeof v === "number") count = String(v);
    }
    return { status: "ok", detail: `${ms}ms · 件数 ${count}` };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    return { status: "fail", detail: `${ms}ms · ${e.message || String(e)}` };
  }
}

async function runChecks() {
  document.getElementById("results").innerHTML = '<tr><td colspan="3">チェック中…</td></tr>';
  const checkedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  document.getElementById("checked-at").textContent = checkedAt;

  const rows = [];

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

  const estApi = await checkEstimateApi();
  rows.push({ path: "/api/estimate/v1", label: "estimate API", ...estApi });

  const dataApis = [
    { path: "/api/schedule/v1/week?offset=0", label: "Schedule API", countField: "days" },
    { path: "/api/estimate/v1/projects?customerCode=TOMS001", label: "Estimate API", countField: "projects" },
    { path: "/api/estimate/v1/invoices?customerCode=TOMS001", label: "Invoice API", countField: "projects" },
    { path: "/api/projects/v1/projects", label: "Project API", countField: "projects" },
    { path: "/api/estimate/v1/customers/suggest?q=t", label: "Customer API", countField: "suggestions" },
    { path: "/api/field-check/v1/projects", label: "Field API", countField: "projects" },
  ];
  for (const a of dataApis) {
    rows.push({ path: a.path, label: a.label, ...(await checkDataApi(a.path, a.label, a)) });
  }

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

  renderRows(rows);

  const staleBanner = document.getElementById("sw-stale-banner");
  const btnUpdate = document.getElementById("btn-sw-update");
  if (sw.stale && staleBanner) {
    staleBanner.classList.remove("hidden");
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
  } else {
    staleBanner?.classList.add("hidden");
  }
}

document.getElementById("btn-run")?.addEventListener("click", () => runChecks().catch(console.error));
runChecks().catch(console.error);
