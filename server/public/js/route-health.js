const PAGE_ROUTES = [
  { path: "/schedule-v1", label: "日程" },
  { path: "/survey-v1", label: "現調" },
  { path: "/survey-drawing-v1", label: "現調図面" },
  { path: "/estimate-v1", label: "見積" },
  { path: "/projects-v1", label: "現場" },
  { path: "/field-check-v1", label: "持ち物" },
  { path: "/purchase-v1", label: "発注" },
  { path: "/project-dashboard-v1", label: "案件DB" },
  { path: "/documents-v1", label: "書類" },
  { path: "/monitoring-3d-v2", label: "Monitoring 3D" },
  { path: "/monitoring-map-assets-v1", label: "mapAssets" },
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

const API_CHECKS = [{ path: "/api/health", label: "Health API" }];

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

function statusLabel(s) {
  if (s === "ok") return '<span class="ok">✅ 存在</span>';
  if (s === "warn") return '<span class="warn">⚠ 要確認</span>';
  return '<span class="fail">❌ 404/異常</span>';
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
  const rows = [];
  for (const r of PAGE_ROUTES) {
    const result = await checkPage(r.path);
    rows.push({ path: r.path, label: r.label, ...result });
  }
  for (const r of LEGACY_REDIRECTS) {
    const result = await checkRedirect(r.from, r.expect);
    rows.push({ path: `${r.from} (redirect)`, label: `→ ${r.expect}`, ...result });
  }
  for (const r of API_CHECKS) {
    const result = await checkApi(r.path);
    rows.push({
      path: r.path,
      label: r.label,
      status: result.status === "ok" ? "ok" : "fail",
      detail: result.status === "ok" ? result.detail : `⚠ API異常: ${result.detail}`,
    });
  }
  renderRows(rows);
}

document.getElementById("btn-run")?.addEventListener("click", () => runChecks().catch(console.error));
runChecks().catch(console.error);
