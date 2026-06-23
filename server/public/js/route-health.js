import { getCustomerToken } from "./customer-auth.js";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchJson } from "./tisly-fetch-v1.js";
import { refreshTislyPwaCache } from "./tisly-sw-refresh-v1.js";

const PAGE_ROUTES = [
  { path: "/route-health", label: "Route Health" },
  { path: "/project-dashboard-v1", label: "案件ダッシュボード" },
  { path: "/project-mgmt-detail-v1", label: "案件詳細" },
  { path: "/schedule-v1", label: "日程" },
  { path: "/survey-v1", label: "現調" },
  { path: "/survey-drawing-v1", label: "現調図面" },
  { path: "/estimate-v1", label: "見積" },
  { path: "/estimate-v1?tab=invoice", label: "請求タブ" },
  { path: "/projects-v1", label: "案件" },
  { path: "/document-center-v1", label: "書類センター" },
  { path: "/document-viewer-v1.html", label: "書類閲覧" },
  { path: "/field-check-v1", label: "材料チェック" },
  { path: "/field-checklist-v1", label: "現場チェック" },
  { path: "/field-check-v1?tab=orders", label: "発注タブ" },
  { path: "/purchase-v1", label: "発注" },
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
  { from: "/materials-v1", expect: "/field-check-v1" },
  { from: "/purchase", expect: "/field-check-v1" },
];

const BOTTOM_NAV_LINKS = [
  { label: "日程", href: "/schedule-v1" },
  { label: "現調", href: "/survey-v1" },
  { label: "見積", href: "/estimate-v1" },
  { label: "請求", href: "/estimate-v1?tab=invoice" },
  { label: "案件", href: "/projects-v1" },
  { label: "現場", href: "/field-checklist-v1" },
  { label: "材料", href: "/field-check-v1" },
  { label: "発注", href: "/field-check-v1?tab=orders" },
];

const JS_ASSETS = [
  { path: "/js/estimate-v1.js?v=estimate-ui-v8", label: "estimate-v1 JS" },
  { path: "/js/survey-v1.js?v=survey-ui-v4", label: "survey-v1 JS" },
  { path: "/js/survey-drawing-v1.js?v=survey-drawing-ui-v5", label: "survey-drawing-v1 JS" },
  { path: "/js/tisly-practical-nav.js", label: "bottom nav JS" },
];

const ESTIMATE_UI_VERSION = "estimate-ui-v8";
const SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v5";
const PHASE9_JS_VERSION = "phase9-iphone-v1";
const SW_CACHE_TOKEN = "v2401-phase21";

const CUSTOMER_FORBIDDEN_WORDS = [
  "MQTT", "WS", "QNAP", "Mock", "Gmail mock", "PDF puppeteer", "App Hub",
  "管理", "Map Editor", "施工", "保守PWA", "顧客コード", "customerCode", "shareId",
  "projectId", "API", "route-health", "PRO Remote", "dashboard", "technical",
  "見積作成", "粗利", "portal", "remote", "mock", "sync",
];

const CUSTOMER_ROUTES = [
  { path: "/customer", label: "お客様ページ" },
  { path: "/customer/TOMS001", label: "お客様物件一覧" },
];

const CUSTOMER_SHARE_ROUTES = (shareId) => [
  { path: `/customer/project/${shareId}`, label: "お客様案件詳細" },
  { path: `/customer/document/${shareId}`, label: "お客様資料閲覧" },
  { path: `/customer/monitoring/${shareId}`, label: "お客様監視画面" },
];

const IPHONE_CUSTOMER_LINKS = [
  { href: "/customer", label: "お客様ページ" },
  { href: "/customer/TOMS001", label: "物件一覧" },
];

const PROJECT_OPERATIONAL_PROBES = [
  {
    path: "/api/project-mgmt/v1/projects",
    label: "案件管理 projects",
    countLabel: "mgmt projects",
    countFn: (d) => (Array.isArray(d.projects) ? d.projects.length : null),
  },
  {
    path: "/api/survey/v1/projects?customerCode=TOMS001",
    label: "Survey API",
    countLabel: "survey projects",
    countFn: (d) => (Array.isArray(d.projects) ? d.projects.length : null),
  },
  {
    path: "/api/dashboard-v1/operational-kpi",
    label: "案件ダッシュボード KPI",
    countLabel: "kpi cards",
    countFn: (d) => (Array.isArray(d.operational?.cards) ? d.operational.cards.length : null),
  },
  {
    path: "/api/estimate/v1/projects?customerCode=TOMS001",
    label: "Completion proxy",
    countLabel: "completion reports",
    countFn: (d) =>
      Array.isArray(d.projects)
        ? d.projects.filter((p) => p.completionReportId || p.hasCompletionReport).length
        : null,
  },
];

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

const IPHONE_VERIFY_LINKS = [
  { href: "/survey-drawing-v1", label: "図面（直接起動）" },
  { href: "/field-checklist-v1?temp=1", label: "現場チェック（TEMP）" },
  { href: "/field-check-v1", label: "材料チェック" },
  { href: "/field-check-v1?tab=orders", label: "発注タブ" },
  { href: "/purchase-v1", label: "発注管理" },
];

const VERIFY_STEPS = [
  { n: 1, label: "更新してください（下のボタン）", href: null, action: "refresh" },
  { n: 2, label: "下部ナビ — 日程", href: "/schedule-v1" },
  { n: 3, label: "下部ナビ — 現調", href: "/survey-v1" },
  { n: 4, label: "下部ナビ — 見積", href: "/estimate-v1" },
  { n: 5, label: "下部ナビ — 請求", href: "/estimate-v1?tab=invoice" },
  { n: 6, label: "下部ナビ — 案件", href: "/projects-v1" },
  { n: 7, label: "下部ナビ — 現場", href: "/field-checklist-v1" },
  { n: 8, label: "下部ナビ — 材料", href: "/field-check-v1" },
  { n: 9, label: "下部ナビ — 発注", href: "/field-check-v1?tab=orders" },
  { n: 10, label: "schedule-v1 — Load failed にならない", href: "/schedule-v1" },
  { n: 11, label: "estimate-v1 — 読み込み中で止まらない", href: "/estimate-v1" },
  { n: 12, label: "invoice tab — 請求書一覧が開く", href: "/estimate-v1?tab=invoice" },
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
    const res = await fetch("/js/field-checklist-ui.js?v=fc-ui-v3", { cache: "no-store" });
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
      ["field-checklist import", js.includes("field-checklist-ui.js?v=fc-ui-v3")],
    ];
    const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
    if (!failed.length) return { status: "ok", detail: `${checks.length}項目 OK` };
    return { status: "warn", detail: `未検出: ${failed.join(", ")}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkDocumentViewerPhase17() {
  try {
    const [htmlRes, jsRes] = await Promise.all([
      fetch("/document-viewer-v1.html", { cache: "no-store" }),
      fetch("/js/document-viewer-v1.js?v=doc-viewer-phase17", { cache: "no-store" }),
    ]);
    const html = await htmlRes.text();
    const js = await jsRes.text();
    if (!htmlRes.ok) return { status: "fail", detail: `HTML HTTP ${htmlRes.status}` };
    const noLine = !html.includes("LINEで送る") && !html.includes('id="btn-share"');
    const hasPdfSave = html.includes("PDFにする") && html.includes('id="btn-save"');
    const backNav = js.includes("DOCUMENT_CENTER_FALLBACK") && js.includes("resolveDocumentReturn");
    const noShareHandler = !js.includes('getElementById("btn-share")');
    if (noLine && hasPdfSave && backNav && noShareHandler) {
      return { status: "ok", detail: "PDFにする/保存のみ · document-center戻り" };
    }
    return { status: "fail", detail: `LINE除去:${noLine} 戻り:${backNav}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkEstimatePdfShareRemoved() {
  try {
    const res = await fetch("/estimate-v1", { cache: "no-store" });
    const html = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const noShareBtn = !html.includes("btn-pdf-quick-share");
    const hasUnderline = html.includes("doc-meta-underline-label");
    return noShareBtn && hasUnderline
      ? { status: "ok", detail: "共有ボタン削除 · 帳票アンダーライン UI" }
      : { status: "warn", detail: `share削除:${noShareBtn} underline:${hasUnderline}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkPdfMetaUnderline() {
  try {
    const [estRes, swRes, pdfRes] = await Promise.all([
      fetch("/js/estimate-v1.js", { cache: "no-store" }),
      fetch("/service-worker.js", { cache: "no-store" }),
      fetch("/api/health/pdf-diagnostics", { cache: "no-store" }),
    ]);
    const estJs = await estRes.text();
    const swText = await swRes.text();
    const hasToken = swText.includes("v2400-phase19");
    const estOk = !estJs.includes("btn-pdf-quick-share");
    const layoutOk = pdfRes.ok;
    if (hasToken && estOk && layoutOk) {
      return { status: "ok", detail: "SW v2400 · PDF診断OK · 見積共有削除" };
    }
    return { status: "warn", detail: `SW:${hasToken} est:${estOk} pdf:${layoutOk}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkCustomerSeparationPhase21(shareId) {
  try {
    const paths = [
      "/customer",
      "/customer/TOMS001",
      `/customer/project/${shareId}`,
      `/customer/document/${shareId}`,
      `/customer/monitoring/${shareId}`,
    ];
    const [pages, landingRes, contractRes, manifestRes, legacyRes, docJsRes, swRes, cssRes, sharedJsRes] =
      await Promise.all([
        Promise.all(paths.map((p) => fetch(p, { cache: "no-store" }).then((r) => ({ p, ok: r.ok, text: r.text() })))),
        fetch("/api/customer-portal/v1/landing", { cache: "no-store" }),
        fetch("/api/customer-portal/v1/route-contract", { cache: "no-store" }),
        fetch("/manifest-customer-v1.webmanifest", { cache: "no-store" }),
        fetch("/customer-portal", { redirect: "manual", cache: "no-store" }),
        fetch("/js/customer-document-v1.js", { cache: "no-store" }),
        fetch("/service-worker.js", { cache: "no-store" }),
        fetch("/css/customer-v1.css", { cache: "no-store" }),
        fetch("/js/customer-shared-v1.js", { cache: "no-store" }),
      ]);

    const pageResults = await Promise.all(
      pages.map(async ({ p, ok, text }) => ({ p, ok, html: await text }))
    );

    const all200 = pageResults.every((r) => r.ok);
    const noAppLinks = pageResults.every((r) => !r.html.includes('href="/app"'));
    const noForbidden = pageResults.every((r) =>
      CUSTOMER_FORBIDDEN_WORDS.every((w) => !r.html.includes(w))
    );

    const landing = await landingRes.json().catch(() => ({}));
    const contract = await contractRes.json().catch(() => ({}));
    const manifest = await manifestRes.json().catch(() => ({}));
    const docJs = await docJsRes.text();
    const swText = await swRes.text();
    const cssText = await cssRes.text();
    const sharedJs = await sharedJsRes.text();
    const startUrlOk = manifest.start_url === "/customer";
    const separated = contract.separation?.crossNavigationBlocked === true;
    const legacy301 = legacyRes.status === 301 && String(legacyRes.headers.get("location") || "").includes("/customer");
    const hasHome = landing.home?.cards?.length >= 6;
    const docBackOk =
      docJs.includes("/customer/project/") &&
      !docJs.includes("history.back") &&
      !docJs.includes("LINE");
    const tomsHtml = pageResults.find((r) => r.p === "/customer/TOMS001")?.html ?? "";
    const tomsOk =
      tomsHtml.includes("customer-home-v1") &&
      sharedJs.includes("cv-property-card-main") &&
      sharedJs.includes("cv-tap-hint") &&
      sharedJs.includes("トムズへ連絡");
    const swOk = swText.includes("v2401-phase21");
    const lightThemeOk = cssText.includes("--cv-bg: #f8fafc") && cssText.includes("background: var(--cv-card)");

    if (
      all200 &&
      noAppLinks &&
      noForbidden &&
      startUrlOk &&
      separated &&
      legacy301 &&
      hasHome &&
      docBackOk &&
      tomsOk &&
      swOk &&
      lightThemeOk
    ) {
      return {
        status: "ok",
        detail: `Phase21 OK · ${paths.length} pages · 禁止語0 · SW v2401 · 白基調UI`,
      };
    }
    return {
      status: "warn",
      detail: `200:${all200} app:${noAppLinks} forbid:${noForbidden} start:${startUrlOk} docBack:${docBackOk} toms:${tomsOk} sw:${swOk} theme:${lightThemeOk}`,
    };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkCustomerSeparationPhase20(shareId) {
  try {
    const paths = [
      "/customer",
      "/customer/TOMS001",
      `/customer/project/${shareId}`,
      `/customer/document/${shareId}`,
      `/customer/monitoring/${shareId}`,
    ];
    const [pages, landingRes, contractRes, manifestRes, legacyRes, docJsRes] = await Promise.all([
      Promise.all(paths.map((p) => fetch(p, { cache: "no-store" }).then((r) => ({ p, ok: r.ok, text: r.text() })))),
      fetch("/api/customer-portal/v1/landing", { cache: "no-store" }),
      fetch("/api/customer-portal/v1/route-contract", { cache: "no-store" }),
      fetch("/manifest-customer-v1.webmanifest", { cache: "no-store" }),
      fetch("/customer-portal", { redirect: "manual", cache: "no-store" }),
      fetch("/js/customer-document-v1.js", { cache: "no-store" }),
    ]);

    const pageResults = await Promise.all(
      pages.map(async ({ p, ok, text }) => ({ p, ok, html: await text }))
    );

    const all200 = pageResults.every((r) => r.ok);
    const noAppLinks = pageResults.every((r) => !r.html.includes('href="/app"'));
    const noForbidden = pageResults.every((r) =>
      CUSTOMER_FORBIDDEN_WORDS.every((w) => !r.html.includes(w))
    );

    const landing = await landingRes.json().catch(() => ({}));
    const contract = await contractRes.json().catch(() => ({}));
    const manifest = await manifestRes.json().catch(() => ({}));
    const docJs = await docJsRes.text();
    const startUrlOk = manifest.start_url === "/customer";
    const separated = contract.separation?.crossNavigationBlocked === true;
    const legacy301 = legacyRes.status === 301 && String(legacyRes.headers.get("location") || "").includes("/customer");
    const hasHome = landing.home?.cards?.length >= 6;
    const docBackOk =
      docJs.includes("/customer/project/") &&
      !docJs.includes("history.back") &&
      !docJs.includes("LINE");
    const tomsOk = pageResults.find((r) => r.p === "/customer/TOMS001")?.html.includes("cv-property-card") ||
      pageResults.find((r) => r.p === "/customer/TOMS001")?.html.includes("customer-home-v1");

    if (all200 && noAppLinks && noForbidden && startUrlOk && separated && legacy301 && hasHome && docBackOk && tomsOk) {
      return { status: "ok", detail: `Phase20 OK · ${paths.length} pages · 禁止語0 · 資料戻る先=project` };
    }
    return {
      status: "warn",
      detail: `200:${all200} app:${noAppLinks} forbid:${noForbidden} start:${startUrlOk} docBack:${docBackOk} toms:${!!tomsOk}`,
    };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkCustomerSeparationPhase19(shareId) {
  try {
    const paths = [
      "/customer",
      `/customer/project/${shareId}`,
      `/customer/document/${shareId}`,
      `/customer/monitoring/${shareId}`,
    ];
    const [pages, landingRes, contractRes, manifestRes, legacyRes] = await Promise.all([
      Promise.all(paths.map((p) => fetch(p, { cache: "no-store" }).then((r) => ({ p, ok: r.ok, text: r.text() })))),
      fetch("/api/customer-portal/v1/landing", { cache: "no-store" }),
      fetch("/api/customer-portal/v1/route-contract", { cache: "no-store" }),
      fetch("/manifest-customer-v1.webmanifest", { cache: "no-store" }),
      fetch("/customer-portal", { redirect: "manual", cache: "no-store" }),
    ]);

    const pageResults = await Promise.all(
      pages.map(async ({ p, ok, text }) => ({ p, ok, html: await text }))
    );

    const all200 = pageResults.every((r) => r.ok);
    const noAppLinks = pageResults.every((r) => !r.html.includes('href="/app"'));
    const noForbidden = pageResults.every((r) =>
      CUSTOMER_FORBIDDEN_WORDS.every((w) => !r.html.includes(w))
    );

    const landing = await landingRes.json().catch(() => ({}));
    const contract = await contractRes.json().catch(() => ({}));
    const manifest = await manifestRes.json().catch(() => ({}));
    const startUrlOk = manifest.start_url === "/customer";
    const separated = contract.separation?.crossNavigationBlocked === true;
    const legacy301 = legacyRes.status === 301 && String(legacyRes.headers.get("location") || "").includes("/customer");
    const hasHome = landing.home?.cards?.length >= 6;

    if (all200 && noAppLinks && noForbidden && startUrlOk && separated && legacy301 && hasHome) {
      return { status: "ok", detail: `Phase19 OK · ${paths.length} pages · 禁止語0 · start_url=/customer` };
    }
    return {
      status: "warn",
      detail: `200:${all200} app:${noAppLinks} forbid:${noForbidden} start:${startUrlOk} legacy:${legacy301}`,
    };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkCustomerSeparationPhase18() {
  try {
    const [landingRes, contractRes, landingHtml] = await Promise.all([
      fetch("/api/customer-portal/v1/landing", { cache: "no-store" }),
      fetch("/api/customer-portal/v1/route-contract", { cache: "no-store" }),
      fetch("/customer", { cache: "no-store" }).then((r) => r.text()),
    ]);
    const landing = await landingRes.json().catch(() => ({}));
    const contract = await contractRes.json().catch(() => ({}));
    const noAppLink = !landingHtml.includes('href="/app"');
    const noInternal = !landingHtml.includes("見積作成") && !landingHtml.includes("projectId");
    const separated = contract.separation?.crossNavigationBlocked === true;
    const hasCustomerRoutes = Array.isArray(contract.customerRoutes) && contract.customerRoutes.length >= 4;
    if (landingRes.ok && contractRes.ok && noAppLink && noInternal && separated && hasCustomerRoutes) {
      return { status: "ok", detail: `/customer 分離 OK · ${contract.customerRoutes.length} routes` };
    }
    return { status: "warn", detail: `app除去:${noAppLink} 分離:${separated}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

function renderPhase18Manifest(healthDetail, swInfo, contractData) {
  const mount = document.getElementById("phase18-manifest-body");
  if (!mount) return;
  const legacy = contractData?.legacyRedirects || LEGACY_REDIRECTS;
  const rows = [
    { label: "Commit Short", value: healthDetail.commitShort || "—" },
    { label: "SW Version", value: swInfo.swVersion || "—" },
    { label: "/app ゾーン", value: "社内専用" },
    { label: "/customer ゾーン", value: "お客様専用（PWA start_url）" },
    { label: "分離状態", value: contractData?.separation?.crossNavigationBlocked ? "分離済み" : "要確認" },
    { label: "社内正式URL数", value: String(PAGE_ROUTES.length) },
    { label: "お客様正式URL数", value: String((contractData?.customerRoutes || []).length) },
    { label: "旧URLリダイレクト数", value: String(legacy.length) },
    { label: "shared/routes", value: "tisly-routes-v1.ts" },
  ];
  mount.innerHTML = rows
    .map((r) => `<tr><td>${r.label}</td><td><code>${r.value}</code></td></tr>`)
    .join("");
}

function renderIphoneCustomerLinks() {
  const mount = document.getElementById("iphone-customer-links");
  if (!mount) return;
  mount.innerHTML = IPHONE_CUSTOMER_LINKS.map(
    (item) => `<a class="nav-quick-btn" href="${item.href}">${item.label}</a>`
  ).join("");
}

async function gatherRouteContract() {
  try {
    const res = await fetch("/api/customer-portal/v1/route-contract", { cache: "no-store" });
    return await res.json().catch(() => ({}));
  } catch {
    return {};
  }
}

function renderPhase17Manifest(healthDetail, swInfo) {
  const mount = document.getElementById("phase17-manifest-body");
  if (!mount) return;
  const cacheNames =
    swInfo.cacheNames?.length > 0 ? swInfo.cacheNames.join(", ") : "（ブラウザキャッシュなし）";
  const rows = [
    { label: "Commit Short", value: healthDetail.commitShort || "—" },
    { label: "最終Deploy日時", value: healthDetail.buildDate || "—" },
    { label: "JS Version (estimate)", value: ESTIMATE_UI_VERSION },
    { label: "JS Version (drawing)", value: SURVEY_DRAWING_UI_VERSION },
    { label: "SW Version", value: swInfo.swVersion || "—" },
    { label: "Cache Name", value: cacheNames },
    { label: "現行URL数", value: String(PAGE_ROUTES.length) },
    { label: "旧URL診断数", value: String(LEGACY_REDIRECTS.length) },
  ];
  mount.innerHTML = rows
    .map((r) => `<tr><td>${r.label}</td><td><code>${r.value}</code></td></tr>`)
    .join("");
}

async function gatherPhase17Health() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return {
      commitShort: data.commitShort || data.buildVersion?.commitShort || "—",
      buildDate: data.buildVersion?.date || "—",
      httpStatus: res.status,
    };
  } catch {
    return { commitShort: "—", buildDate: "—", httpStatus: 0 };
  }
}

async function gatherSwInfo() {
  const swVersion = await readServiceWorkerVersion();
  let cacheNames = [];
  try {
    if ("caches" in window) cacheNames = await caches.keys();
  } catch {
    /* ignore */
  }
  return { swVersion, cacheNames };
}

async function checkDrawingDirectLaunch() {
  try {
    const [pageRes, jsRes] = await Promise.all([
      fetch("/survey-drawing-v1", { cache: "no-store" }),
      fetch(`/js/survey-drawing-v1.js?v=${SURVEY_DRAWING_UI_VERSION}`, { cache: "no-store" }),
    ]);
    const html = await pageRes.text();
    const js = await jsRes.text();
    if (!pageRes.ok) return { status: "fail", detail: `HTTP ${pageRes.status}` };
    const checks = [
      js.includes("resolveDrawingIds"),
      js.includes("isLocalOnlyMode"),
      js.includes("SURVEY_DRAWING_TEMP_BANNER"),
      js.includes("saveDrawingToLocalStorage"),
      js.includes("syncGridStageSize"),
      html.includes("survey-drawing-ui-v5"),
      !js.includes("projectId または sketchId が必要です"),
    ];
    const ok = checks.filter(Boolean).length;
    if (ok === checks.length) return { status: "ok", detail: "方眼紙全面描画 + TEMP直接起動 OK" };
    return { status: "fail", detail: `${ok}/${checks.length} 項目` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkDrawingTempSave() {
  try {
    const res = await fetch(`/js/survey-drawing-local-v1.js`, { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const ok =
      js.includes("tisly:survey-drawing:") &&
      js.includes("buildLocalDrawingPayload") &&
      js.includes("TEMP-PROJECT-");
    return ok
      ? { status: "ok", detail: "localStorage fallback モジュール OK" }
      : { status: "fail", detail: "fallback 未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkFieldChecklistDefaults() {
  try {
    const res = await fetch("/js/field-checklist-defaults-v1.js", { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const required = ["工具一式", "脚立", "駐車場所", "お客様確認", "DEFAULT_FIELD_CHECKLIST_ITEMS"];
    const missing = required.filter((t) => !js.includes(t));
    if (!missing.length) return { status: "ok", detail: `${required.length - 1} デフォルト項目 OK` };
    return { status: "fail", detail: `未検出: ${missing.join(", ")}` };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

async function checkFieldChecklistSave() {
  try {
    const res = await fetch("/js/field-checklist-ui.js?v=fc-ui-v3", { cache: "no-store" });
    const js = await res.text();
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}` };
    const ok =
      js.includes("saveFieldChecklistLocal") &&
      js.includes("localOnly") &&
      js.includes("buildDefaultChecklistItems");
    return ok
      ? { status: "ok", detail: "チェック保存/localOnly OK" }
      : { status: "fail", detail: "保存ロジック未検出" };
  } catch (e) {
    return { status: "fail", detail: e.message || String(e) };
  }
}

function renderIphoneVerifyLinks() {
  const mount = document.getElementById("iphone-verify-links");
  if (!mount) return;
  mount.innerHTML = IPHONE_VERIFY_LINKS.map(
    (item) => `<a class="nav-quick-btn" href="${item.href}">${item.label}</a>`
  ).join("");
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

async function checkOldJsVersions() {
  const issues = [];
  try {
    const estRes = await fetch("/js/estimate-v1.js", { cache: "no-store" });
    const estJs = await estRes.text();
    if (estJs.includes("estimate-ui-v7")) issues.push("estimate-ui-v7");
    if (!estJs.includes("estimate-ui-v8")) issues.push("estimate-ui-v8 missing");
  } catch (e) {
    issues.push(`estimate JS: ${e.message}`);
  }
  try {
    const fcRes = await fetch("/js/field-checklist-ui.js", { cache: "no-store" });
    const fcJs = await fcRes.text();
    const dup = (fcJs.match(/function escapeHtml/g) || []).length;
    if (dup > 1) issues.push("field-checklist-ui escapeHtml×2");
  } catch (e) {
    issues.push(`field-checklist JS: ${e.message}`);
  }
  if (!issues.length) return { status: "ok", detail: "古いJS未検出 · estimate-ui-v8" };
  return { status: "fail", detail: issues.join(" · ") };
}

async function checkBottomNavPages() {
  const targets = [
    { path: "/field-checklist-v1", label: "現場", must: "現場チェックリスト" },
    { path: "/purchase-v1", label: "発注", must: "発注管理" },
  ];
  const failed = [];
  for (const t of targets) {
    try {
      const res = await fetch(t.path, { cache: "no-store" });
      const html = await res.text();
      if (!res.ok || !html.includes(t.must)) failed.push(t.label);
    } catch {
      failed.push(t.label);
    }
  }
  if (!failed.length) return { status: "ok", detail: "現場/発注ページ OK" };
  return { status: "fail", detail: `未検出: ${failed.join(", ")}` };
}

function renderBottomNavQuickLinks() {
  const mount = document.getElementById("bottom-nav-quick");
  if (!mount) return;
  mount.innerHTML = BOTTOM_NAV_LINKS.map(
    (item) =>
      `<a class="nav-quick-btn" href="${item.href}">${item.label}</a>`
  ).join("");
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
      '/field-checklist-v1"',
      '/field-check-v1"',
      '/field-check-v1?tab=orders"',
    ];
    const missing = required.filter((href) => !js.includes(href));
    const dupField =
      js.includes('label: "現場"') &&
      js.includes('label: "材料"') &&
      (js.match(/href: "\/field-check-v1"/g) || []).length > 1;
    if (dupField) {
      return { status: "fail", detail: "現場/材料が同じURL（field-check-v1）" };
    }
    if (!missing.length) return { status: "ok", detail: "8タブリンク OK · 現場≠材料" };
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
  renderBottomNavQuickLinks();
  renderIphoneVerifyLinks();
  renderIphoneCustomerLinks();

  const rows = [];
  const diagRows = [];
  let lastError = null;
  let lastSuccess = checkedAt;

  for (const r of PAGE_ROUTES) {
    rows.push({ path: r.path, label: r.label, ...(await checkPage(r.path)) });
  }
  for (const r of CUSTOMER_ROUTES) {
    rows.push({ path: r.path, label: `customer: ${r.label}`, ...(await checkPage(r.path)) });
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

  const phase14Results = [];
  for (const probe of PROJECT_OPERATIONAL_PROBES) {
    const result = await probeDataApi(probe);
    rows.push({ path: probe.path, label: `Phase14 ${probe.label}`, ...result });
    diagRows.push({
      path: probe.path,
      label: `Phase14 ${probe.label}`,
      status: result.status,
      detail: result.detail,
    });
    phase14Results.push({ probe, result });
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

  const navPages = await checkBottomNavPages();
  rows.push({ path: "bottom nav pages", label: "現場/発注ページ", ...navPages });

  const oldJs = await checkOldJsVersions();
  rows.push({ path: "old JS detection", label: "古いJS検出", ...oldJs });

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

  const drawDirect = await checkDrawingDirectLaunch();
  rows.push({ path: "Phase9 drawing direct", label: "図面直接起動", ...drawDirect });

  const drawTempSave = await checkDrawingTempSave();
  rows.push({ path: "Phase9 drawing local", label: "図面TEMP保存", ...drawTempSave });

  const fcDefaults = await checkFieldChecklistDefaults();
  rows.push({ path: "Phase9 checklist defaults", label: "現場チェック項目生成", ...fcDefaults });

  const fcSave = await checkFieldChecklistSave();
  rows.push({ path: "Phase9 checklist save", label: "現場チェック保存", ...fcSave });

  const phase17Health = await gatherPhase17Health();
  const swInfo = await gatherSwInfo();
  const routeContract = await gatherRouteContract();
  renderPhase18Manifest(phase17Health, swInfo, routeContract);
  renderPhase17Manifest(phase17Health, swInfo);

  const customerSep = await checkCustomerSeparationPhase19(
    (await fetch("/api/customer-portal/v1/landing", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}))).home?.shareId || ""
  );
  rows.push({ path: "Phase19 customer", label: "お客様UI分離", ...customerSep });

  const customerSep20 = await checkCustomerSeparationPhase20(
    (await fetch("/api/customer-portal/v1/landing", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}))).home?.shareId || ""
  );
  rows.push({ path: "Phase20 customer", label: "お客様UI実運用", ...customerSep20 });

  const customerSep21 = await checkCustomerSeparationPhase21(
    (await fetch("/api/customer-portal/v1/landing", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}))).home?.shareId || ""
  );
  rows.push({ path: "Phase21 customer", label: "お客様UI最終版", ...customerSep21 });

  const docViewer17 = await checkDocumentViewerPhase17();
  rows.push({ path: "Phase17 document-viewer", label: "PDF UI", ...docViewer17 });

  const estShareRemoved = await checkEstimatePdfShareRemoved();
  rows.push({ path: "Phase17 estimate PDF", label: "見積PDF操作", ...estShareRemoved });

  const pdfUnderline = await checkPdfMetaUnderline();
  rows.push({ path: "Phase17 PDF/SW", label: "帳票/SW", ...pdfUnderline });

  rows.push({
    path: "/api/health commit",
    label: "HTTP Status",
    status: phase17Health.httpStatus === 200 ? "ok" : "fail",
    detail: `HTTP ${phase17Health.httpStatus} · ${phase17Health.commitShort}`,
  });

  rows.push({
    path: "Phase9 JS version",
    label: PHASE9_JS_VERSION,
    status: "ok",
    detail: `${SURVEY_DRAWING_UI_VERSION} · fc-defaults-v1`,
  });

  for (const link of IPHONE_VERIFY_LINKS) {
    rows.push({
      path: link.href,
      label: `実機: ${link.label}`,
      ...(await checkPage(link.href)),
    });
  }

  for (const link of IPHONE_CUSTOMER_LINKS) {
    rows.push({
      path: link.href,
      label: `実機(customer): ${link.label}`,
      ...(await checkPage(link.href)),
    });
  }

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

  const phase14Mount = document.getElementById("phase14-api-body");
  if (phase14Mount) {
    renderRows(
      phase14Results.map(({ probe, result }) => {
        const countMatch = result.detail?.match(/(\d+)件/);
        return {
          path: probe.label,
          status: result.status,
          detail: countMatch ? `${countMatch[1]}件` : result.detail,
        };
      }),
      "phase14-api-body"
    );
  }

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
    () => {
      refreshTislyPwaCache().catch((e) => alert(e.message || String(e)));
    },
    { once: true }
  );
}

document.getElementById("btn-run")?.addEventListener("click", () => runChecks().catch(console.error));
document.getElementById("btn-iphone-refresh")?.addEventListener("click", () => {
  refreshTislyPwaCache().catch((e) => alert(e.message || String(e)));
});
document.getElementById("btn-sw-refresh-always")?.addEventListener("click", () => {
  refreshTislyPwaCache().catch((e) => alert(e.message || String(e)));
});
runChecks().catch(console.error);
