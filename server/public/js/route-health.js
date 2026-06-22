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
  { path: "/js/estimate-v1.js?v=estimate-ui-v5", label: "estimate-v1 JS" },
  { path: "/js/survey-v1.js?v=survey-ui-v3", label: "survey-v1 JS" },
  { path: "/js/survey-drawing-v1.js?v=survey-drawing-ui-v2", label: "survey-drawing-v1 JS" },
  { path: "/js/tisly-practical-nav.js", label: "bottom nav JS" },
];

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
    if (hasInvoiceTab && hasInvoiceBtn) {
      return { status: "ok", detail: "請求タブ UI 検出" };
    }
    return { status: "warn", detail: "請求タブ UI 未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkEstimateUiVersion() {
  try {
    const res = await fetch("/js/estimate-v1.js?v=estimate-ui-v5", { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    if (js.includes('ESTIMATE_UI_VERSION = "estimate-ui-v5"')) {
      return { status: "ok", detail: "estimate-ui-v5" };
    }
    return { status: "warn", detail: "バージョン定数未検出" };
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
      stale = cacheNames.some((n) => !n.includes("v2390"));
    }
  } catch {
    /* ignore */
  }
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  const active = reg?.active?.scriptURL?.split("/").pop() || "—";
  const detail = `SW ${swVersion} · active ${active} · caches ${cacheNames.length || 0}${stale ? " · 古いcacheあり" : ""}`;
  return {
    status: stale ? "warn" : "ok",
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

  const estUi = await checkEstimateUiVersion();
  rows.push({ path: "estimate-v1 UI", label: "UI version", ...estUi });

  const invTab = await checkInvoiceTabHtml();
  rows.push({ path: "invoice tab", label: "請求タブ", ...invTab });

  const sw = await checkSwCache();
  rows.push({ path: "Service Worker", label: "cache version", ...sw });

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
