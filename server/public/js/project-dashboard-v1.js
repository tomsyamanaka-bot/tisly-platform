import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/dashboard-v1";
const DASHBOARD_RETURN = encodeURIComponent("/project-dashboard-v1");

function projectDetailHref(projectId) {
  return `/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&return=${DASHBOARD_RETURN}`;
}

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatYen(n) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function api(path) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let searchTimer = null;

function renderOperationalKpi(operational) {
  const grid = $("op-kpi-grid");
  const period = $("op-kpi-period");
  if (!grid || !operational) return;
  if (period) {
    period.textContent = `今週 ${operational.weekLabel ?? ""} · 今月 ${operational.monthLabel ?? ""}`;
  }
  grid.innerHTML = (operational.cards ?? [])
    .map((c) => {
      const val =
        c.format === "yen"
          ? formatYen(c.value)
          : c.format === "percent"
            ? `${c.value}%`
            : `${c.value}<span style="font-size:0.72rem;font-weight:600">件</span>`;
      const cls =
        c.key === "in_progress" || c.key === "month_sales" ? "op-kpi-card highlight" : "op-kpi-card";
      return `<div class="${cls}">
        <div class="val">${val}</div>
        <div class="lbl">${escapeHtml(c.label)}</div>
      </div>`;
    })
    .join("");
}

function renderKpi(cards) {
  const el = $("kpi-scroll");
  if (!el) return;
  el.innerHTML = (cards ?? [])
    .map((c) => {
      const cls = c.key === "total" ? "kpi-pill total" : "kpi-pill";
      return `<div class="${cls}">
        <div class="val">${c.count}<span style="font-size:0.72rem;font-weight:600">件</span></div>
        <div class="lbl">${escapeHtml(c.label)}</div>
      </div>`;
    })
    .join("");
}

function bindCardNavigation(root) {
  root.querySelectorAll(".dash-card[data-href]").forEach((card) => {
    const open = () => {
      const href = card.getAttribute("data-href");
      if (href) window.location.href = href;
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function renderToday(data) {
  const list = $("today-list");
  const label = $("today-date-label");
  if (!list) return;
  if (label) label.textContent = data.date ?? "";
  const items = data.items ?? [];
  if (!items.length) {
    list.innerHTML = '<p class="empty-hint">今日の予定はありません</p>';
    return;
  }
  list.innerHTML = items
    .map((item) => {
      const href = item.detailHref;
      const attrs = href
        ? `class="dash-card" data-href="${escapeHtml(href)}" tabindex="0" role="button"`
        : `class="dash-card static"`;
      const assignee = item.assignee ? `担当: ${escapeHtml(item.assignee)}` : "担当: —";
      const addr = item.address ? escapeHtml(item.address) : "住所未設定";
      const rawHint =
        item.rawTitle && item.rawTitle !== item.title
          ? `<div class="dash-raw-title">${escapeHtml(item.rawTitle)}</div>`
          : "";
      return `<article ${attrs}>
        <div class="dash-card-head">
          <span class="dash-time">${escapeHtml(item.timeLabel)}</span>
          ${item.projectNo ? `<span class="status-chip">${escapeHtml(item.projectNo)}</span>` : ""}
        </div>
        <div class="dash-title">${escapeHtml(item.title)}</div>
        ${rawHint}
        <div class="dash-meta">${addr}<br>${assignee}</div>
      </article>`;
    })
    .join("");
  bindCardNavigation(list);
}

function alertBorderClass(priority) {
  if (priority === "red") return "alert-red-border";
  if (priority === "yellow") return "alert-yellow-border";
  return "alert-blue-border";
}

function alertBadgeClass(priority) {
  if (priority === "red") return "alert-badge alert-red";
  if (priority === "yellow") return "alert-badge alert-yellow";
  return "alert-badge alert-blue";
}

function renderAlerts(alerts) {
  const list = $("alerts-list");
  if (!list) return;
  if (!alerts?.length) {
    list.innerHTML = '<p class="empty-hint">要対応案件はありません 👍</p>';
    return;
  }
  list.innerHTML = alerts
    .map((a) => {
      const href = projectDetailHref(a.projectId);
      return `<article class="dash-card ${alertBorderClass(a.priority)}" data-href="${escapeHtml(href)}" tabindex="0" role="button">
        <div class="dash-card-head">
          <span class="${alertBadgeClass(a.priority)}">${escapeHtml(a.alertLabel)}</span>
          <span class="status-chip">${escapeHtml(a.mgmtStatusLabel)}</span>
        </div>
        <div class="dash-title">${escapeHtml(a.customerName)} — ${escapeHtml(a.title)}</div>
        <div class="dash-meta">${escapeHtml(a.projectNo)} · ${escapeHtml(a.detail)}${a.assignee ? ` · ${escapeHtml(a.assignee)}` : ""}</div>
      </article>`;
    })
    .join("");
  bindCardNavigation(list);
}

function renderRecent(projects) {
  const list = $("recent-list");
  if (!list) return;
  if (!projects?.length) {
    list.innerHTML = '<p class="empty-hint">案件がありません</p>';
    return;
  }
  list.innerHTML = projects
    .map((p) => {
      const href = projectDetailHref(p.id);
      const auto = p.automation;
      const progressLine = auto
        ? `<div class="dash-meta auto-dash-progress">
            やる事 ${auto.tasksDone}/${auto.tasksTotal}
            · 持ち物 ${auto.toolsChecked}/${auto.toolsTotal}
            · 写真 ${auto.photosShot}/${auto.photosTotal}
            ${auto.qnapPending > 0 ? `· QNAP 未保存あり` : ""}
          </div>`
        : "";
      const suggestLine =
        p.suggestions?.length > 0
          ? `<div class="dash-meta ai-dash-hint">💡 ${escapeHtml(p.suggestions[0].label)}</div>`
          : "";
      return `<article class="dash-card" data-href="${escapeHtml(href)}" tabindex="0" role="button">
        <div class="dash-card-head">
          <span class="dash-meta" style="font-family:ui-monospace,monospace;font-weight:700;color:#475569">${escapeHtml(p.projectNo)}</span>
          <span class="status-chip">${escapeHtml(p.mgmtStatusLabel)}</span>
        </div>
        <div class="dash-title">${escapeHtml(p.customerName)}${p.title ? ` — ${escapeHtml(p.title)}` : ""}</div>
        ${p.templateName ? `<div class="dash-meta">${escapeHtml(p.templateName)}</div>` : ""}
        ${progressLine}
        ${suggestLine}
        <div class="dash-meta">更新: ${formatDateTime(p.updatedAt)}</div>
      </article>`;
    })
    .join("");
  bindCardNavigation(list);
}

function renderCityStats(cities) {
  const tbody = $("city-tbody");
  if (!tbody) return;
  tbody.innerHTML = (cities ?? [])
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.cityName)}</td><td>${escapeHtml(c.cityCode)}</td><td>${c.count}件</td></tr>`
    )
    .join("");
}

function renderSales(sales) {
  const grid = $("sales-grid");
  const label = $("sales-month-label");
  if (!grid || !sales) return;
  if (label) label.textContent = sales.monthLabel ?? "";
  grid.innerHTML = `
    <div class="sales-card"><span class="label">見積金額合計</span><span class="amount">${formatYen(sales.estimateTotal)}</span></div>
    <div class="sales-card"><span class="label">請求金額合計</span><span class="amount">${formatYen(sales.invoiceTotal)}</span></div>
    <div class="sales-card"><span class="label">入金金額合計</span><span class="amount">${formatYen(sales.paidTotal)}</span></div>`;
}

function renderSearchResults(projects) {
  const wrap = $("search-results");
  if (!wrap) return;
  if (!projects?.length) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML = `
    <h2 style="font-size:0.88rem;margin:0 0 0.45rem">🔍 検索結果 (${projects.length}件)</h2>
    ${projects
      .map((p) => {
        const href = projectDetailHref(p.id);
        return `<article class="dash-card" data-href="${escapeHtml(href)}" tabindex="0" role="button">
          <div class="dash-card-head">
            <span class="dash-meta" style="font-family:ui-monospace,monospace;font-weight:700">${escapeHtml(p.projectNo)}</span>
            <span class="status-chip">${escapeHtml(p.mgmtStatusLabel)}</span>
          </div>
          <div class="dash-title">${escapeHtml(p.customerName)}</div>
          <div class="dash-meta">${escapeHtml(p.municipality || p.address || "")}${p.assignee ? ` · ${escapeHtml(p.assignee)}` : ""}</div>
        </article>`;
      })
      .join("")}`;
  bindCardNavigation(wrap);
}

function renderRecentDocs(items) {
  const list = $("recent-docs-list");
  if (!list) return;
  if (!items?.length) {
    list.innerHTML = '<p class="empty-hint">まだ履歴がありません</p>';
    return;
  }
  list.innerHTML = items
    .map((item) => {
      const href = `/documents-v1?projectId=${encodeURIComponent(item.projectId)}`;
      return `<article class="dash-card" data-href="${escapeHtml(href)}" tabindex="0" role="button">
        <div class="dash-card-head">
          <span class="dash-time">${escapeHtml(item.projectNo)}</span>
        </div>
        <div class="dash-title">${escapeHtml(item.title)}</div>
        <div class="dash-meta">${escapeHtml(item.customerName)} · ${escapeHtml(item.fileName)}</div>
      </article>`;
    })
    .join("");
  bindCardNavigation(list);
}

async function loadDashboard() {
  const token = getCustomerToken();
  const docsPromise = fetch("/api/documents/v1/recent?limit=10", {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.json())
    .catch(() => ({ items: [] }));

  const [summaryRes, todayRes, alertsRes, recentRes, cityRes, salesRes, opRes, docsRes] = await Promise.all([
    api("/summary"),
    api("/today"),
    api("/alerts"),
    api("/recent"),
    api("/city-stats"),
    api("/sales"),
    api("/operational-kpi"),
    docsPromise,
  ]);
  renderOperationalKpi(opRes.operational);
  renderKpi(summaryRes.summary?.cards ?? []);
  renderToday(todayRes);
  renderAlerts(alertsRes.alerts ?? []);
  renderRecentDocs(docsRes.items ?? []);
  renderRecent(recentRes.projects ?? []);
  renderCityStats(cityRes.cities ?? []);
  renderSales(salesRes.sales);
}

async function runSearch(q) {
  if (!q.trim()) {
    renderSearchResults([]);
    return;
  }
  const data = await api(`/summary?q=${encodeURIComponent(q.trim())}`);
  renderSearchResults(data.searchResults ?? []);
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = $("search-input")?.value ?? "";
    runSearch(q).catch((e) => toast(e.message));
  }, 280);
}

async function main() {
  if (!requireCustomerLogin()) return;
  initPracticalNav({
    appId: "project_mgmt_v1",
    appName: "案件ダッシュボード",
    theme: "blue",
    onBack: () => {
      window.location.href = "/app";
    },
  });
  $("search-input")?.addEventListener("input", scheduleSearch);
  try {
    await loadDashboard();
  } catch (e) {
    toast(e.message || "読み込みに失敗しました");
  }
}

main();
