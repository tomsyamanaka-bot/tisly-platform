import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const OFFLINE_QUEUE_KEY = "tisly_business_offline_queue_v541";
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const STATUS_LABELS = {
  new: "新規",
  survey_scheduled: "現調予定",
  survey_done: "現調完了",
  estimate_created: "見積作成済",
  estimate_sent: "見積送付済",
  estimate_sent_to_owner: "見積送付済",
  accepted: "受注",
  construction_scheduled: "工事予定",
  construction_done: "工事完了",
  completion_report_created: "完了報告済",
  invoice_created: "請求作成済",
  invoice_sent: "請求送付済",
  invoice_sent_to_owner: "請求送付済",
  payment_scheduled: "入金予定",
  paid: "入金済",
  closed: "クローズ",
  archived: "クローズ",
};

function token() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function updateOfflineBar() {
  const el = document.getElementById("biz-offline-bar");
  if (!el) return;
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  const offline = !navigator.onLine;
  if (!offline && !q.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = offline
    ? `オフライン — 未同期 ${q.length} 件`
    : `未同期 ${q.length} 件 — タップで同期`;
}

function queueOffline(item) {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  q.push({ ...item, at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  updateOfflineBar();
}

function queueItemToSyncOp(item) {
  const path = item.path || "";
  const body = item.body || {};
  if (path === "/projects" && (item.method || "POST") === "POST") {
    return { type: "project_create", payload: body, clientId: item.at };
  }
  const photoMatch = path.match(/^\/projects\/([^/]+)\/(survey-photo|construction-photo)$/);
  if (photoMatch) {
    return {
      type: "photo_memo",
      projectId: photoMatch[1],
      payload: {
        ...body,
        kind: photoMatch[2] === "construction-photo" ? "construction" : "survey",
      },
      clientId: item.at,
    };
  }
  const statusMatch = path.match(/^\/projects\/([^/]+)\/status$/);
  if (statusMatch) {
    return { type: "status_change", projectId: statusMatch[1], payload: body, clientId: item.at };
  }
  const estMatch = path.match(/^\/projects\/([^/]+)\/estimate$/);
  if (estMatch) {
    return { type: "estimate_item", projectId: estMatch[1], payload: body, clientId: item.at };
  }
  const invMatch = path.match(/^\/projects\/([^/]+)\/invoice$/);
  if (invMatch) {
    return { type: "invoice_memo", projectId: invMatch[1], payload: body, clientId: item.at };
  }
  const payMatch = path.match(/^\/projects\/([^/]+)\/payment$/);
  if (payMatch) {
    return { type: "payment_memo", projectId: payMatch[1], payload: body, clientId: item.at };
  }
  return null;
}

async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  if (!q.length) return;
  const items = q.map(queueItemToSyncOp).filter(Boolean);
  if (items.length) {
    const headers = { "Content-Type": "application/json" };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch("/api/business/offline/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      const body = await res.json();
      const failed = (body.failed || []).length;
      const synced = (body.synced || []).length;
      if (!failed) {
        localStorage.setItem(OFFLINE_QUEUE_KEY, "[]");
        updateOfflineBar();
        return;
      }
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q.slice(synced)));
      updateOfflineBar();
      return;
    }
  }
  const remain = [];
  for (const item of q) {
    try {
      const { path, method, body } = item;
      const headers = { "Content-Type": "application/json" };
      if (token()) headers.Authorization = `Bearer ${token()}`;
      const res = await fetch(`/api/business${path}`, {
        method: method || "POST",
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) remain.push(item);
    } catch {
      remain.push(item);
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remain));
  updateOfflineBar();
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  if (!navigator.onLine && (opts.method === "POST" || opts.method === "PATCH" || opts.method === "DELETE")) {
    queueOffline({
      path,
      method: opts.method || "POST",
      body: opts.body ? JSON.parse(opts.body) : undefined,
    });
    return { ok: true, status: 202, body: { queued: true } };
  }
  const res = await fetch(`/api/business${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function route() {
  const p = window.location.pathname.replace(/\/$/, "") || "/business";
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "business") return { view: "home" };
  if (parts[1] === "projects" && parts[2] === "new") return { view: "project_new" };
  if (parts[1] === "projects" && parts[2] && parts[3]) {
    return { view: parts[3], projectId: parts[2] };
  }
  if (parts[1] === "projects" && parts[2]) return { view: "project_detail", projectId: parts[2] };
  if (parts[1] === "projects") return { view: "projects" };
  if (parts[1] === "customers") return { view: "customers" };
  if (parts[1] === "pricing") return { view: "pricing" };
  if (parts[1] === "settings") return { view: "settings" };
  if (parts[1] === "drawing-symbols") return { view: "drawing_symbols" };
  return { view: "home" };
}

function navHtml() {
  return `
    <a href="/business">ホーム</a>
    <a href="/business/projects">案件</a>
    <a href="/business/projects/new">新規</a>
    <a href="/business/customers">顧客</a>
    <a href="/business/pricing">単価</a>
    <a href="/business/drawing-symbols">記号ライブラリ</a>
    <a href="/business/settings">設定</a>
    <a href="/app">App Hub</a>
  `;
}

function loginHtml() {
  return `
    <section class="biz-card">
      <h2>ログイン</h2>
      <label>顧客コード <input id="biz-code" value="TOMS001" /></label>
      <label>ユーザー <input id="biz-user" value="toms001.manager" /></label>
      <label>パスワード <input id="biz-pass" type="password" value="demo-remote-2026" /></label>
      <button type="button" class="biz-btn" id="biz-login">ログイン</button>
      <p class="biz-error" id="biz-login-err"></p>
    </section>
  `;
}

async function ensureLogin() {
  if (token()) return true;
  document.getElementById("biz-root").innerHTML = loginHtml();
  document.getElementById("biz-login")?.addEventListener("click", async () => {
    const err = document.getElementById("biz-login-err");
    err.textContent = "";
    const res = await fetch("/api/auth/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerCode: document.getElementById("biz-code").value.trim().toUpperCase(),
        username: document.getElementById("biz-user").value.trim(),
        password: document.getElementById("biz-pass").value,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = body.error || "ログイン失敗";
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, body.token);
    render();
  });
  return false;
}

async function loadFieldKpi() {
  try {
    const res = await fetch("/api/field-operations/kpi", {
      headers: token() ? { Authorization: `Bearer ${token()}` } : {},
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function renderHome() {
  const [{ body }, { body: settings }, fieldKpi] = await Promise.all([
    api("/hub-counts"),
    api("/settings"),
    loadFieldKpi(),
  ]);
  const today = body.todaySchedules || [];
  const queueLen = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]").length;
  const g = body.googleStatus || settings.googleOAuth || {};
  document.getElementById("biz-page-title").textContent = "TOMS業務ホーム";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>連携ダッシュボード</h2>
      <div class="biz-dash-grid">
        <div class="biz-dash-card" style="cursor:default"><div class="n">${g.connected ? "OK" : "—"}</div><div class="l">Google連携</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${settings.gmail?.connected ? "OK" : "—"}</div><div class="l">Gmail</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${body.qnapRecentSuccess ?? 0}</div><div class="l">QNAP保存</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${body.pdfStatus?.recentSuccess ?? 0}</div><div class="l">PDF生成</div></div>
        <a class="biz-dash-card" href="/business/projects?status=invoice_sent"><div class="n">${body.paymentPending ?? 0}</div><div class="l">入金待ち</div></a>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${body.todaySurvey ?? 0}</div><div class="l">今日の現調</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${body.todayConstruction ?? 0}</div><div class="l">今日の工事</div></div>
        <a class="biz-dash-card" href="/business/projects"><div class="n">${body.drawingInProgress ?? 0}</div><div class="l">施工図作成中</div></a>
        <a class="biz-dash-card" href="/business/projects"><div class="n">${body.specificationPending ?? 0}</div><div class="l">仕様書未作成</div></a>
        <a class="biz-dash-card" href="/business/projects"><div class="n">${body.drawingEstimatePending ?? 0}</div><div class="l">図面あり見積未反映</div></a>
        <div class="biz-dash-card" id="biz-queue-card" style="cursor:pointer"><div class="n">${queueLen}</div><div class="l">未送信キュー</div></div>
      </div>
    </section>
    <section class="biz-card">
      <h2>今日の予定 (${today.length})</h2>
      ${
        today.length
          ? today
              .map(
                (t) =>
                  `<a class="biz-list-item" href="/business/projects/${t.projectId}">
                    <strong>${t.kind === "site_survey" ? "現調" : t.kind === "construction" ? "工事" : "入金"}</strong>
                    ${t.customerName} — ${t.title}<br/><span class="hint">${t.date} ${t.startTime || ""}</span>
                  </a>`
              )
              .join("")
          : '<p class="hint">本日の予定はありません</p>'
      }
    </section>
    ${
      fieldKpi
        ? `<section class="biz-card">
      <h2>現場運用 KPI（Phase 1621–1680）</h2>
      <div class="biz-dash-grid">
        <div class="biz-dash-card" style="cursor:default"><div class="n">¥${(fieldKpi.revenue ?? 0).toLocaleString()}</div><div class="l">売上</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">¥${(fieldKpi.grossProfit ?? 0).toLocaleString()}</div><div class="l">粗利</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${fieldKpi.maintenanceContracts ?? 0}</div><div class="l">保守契約</div></div>
        <div class="biz-dash-card" style="cursor:default"><div class="n">${fieldKpi.uninvoiced ?? 0}</div><div class="l">未請求</div></div>
        <a class="biz-dash-card" href="/business/kpi"><div class="n">${fieldKpi.projectCount ?? 0}</div><div class="l">案件数</div></a>
      </div>
      <p class="hint">月別: ${(fieldKpi.monthlyProjects ?? []).slice(-3).map((m) => `${m.month} ¥${m.revenue?.toLocaleString()}`).join(" · ") || "—"}</p>
    </section>`
        : ""
    }
    <section class="biz-card">
      <h2>ダッシュボード</h2>
      <div class="biz-dash-grid">
        <a class="biz-dash-card" href="/business/projects?status=survey_scheduled"><div class="n">${body.surveyScheduled ?? 0}</div><div class="l">現調予定</div></a>
        <a class="biz-dash-card" href="/business/projects?status=survey_done"><div class="n">${body.estimatePending ?? 0}</div><div class="l">見積待ち</div></a>
        <a class="biz-dash-card" href="/business/projects?status=construction_scheduled"><div class="n">${body.constructionScheduled ?? 0}</div><div class="l">工事予定</div></a>
        <a class="biz-dash-card" href="/business/projects?status=invoice_created"><div class="n">${body.invoicePending ?? 0}</div><div class="l">請求待ち</div></a>
        <a class="biz-dash-card" href="/business/projects?status=invoice_sent"><div class="n">${body.paymentPending ?? 0}</div><div class="l">入金待ち</div></a>
        <a class="biz-dash-card" href="/business/projects?status=new"><div class="n">${body.newProjects ?? 0}</div><div class="l">新規案件</div></a>
      </div>
    </section>
    <section class="biz-card">
      <h2>連携状態</h2>
      <div class="biz-integration-row"><span>Google Calendar</span><span class="mock">${settings.googleCalendar?.mode || "mock"}</span></div>
      <div class="biz-integration-row"><span>Gmail</span><span class="mock">${settings.gmail?.defaultTo || ""}</span></div>
      <div class="biz-integration-row"><span>QNAP</span><span class="mock">${settings.qnap?.baseRoot || ""}</span></div>
      <a class="biz-btn secondary" href="/business/settings" style="margin-top:0.5rem;text-align:center;text-decoration:none">設定詳細</a>
    </section>
    <a class="biz-btn" href="/business/projects/new">新規案件を登録</a>
    <a class="biz-btn secondary" href="/business/pricing" style="text-align:center;text-decoration:none">顧客別単価</a>
    <a class="biz-btn secondary" href="/business/projects" style="text-align:center;text-decoration:none">案件一覧</a>
  `;
  document.getElementById("biz-offline-bar")?.addEventListener("click", () => flushOfflineQueue().then(render));
  document.getElementById("biz-queue-card")?.addEventListener("click", () => flushOfflineQueue().then(render));
}

async function renderProjects() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get("status");
  const { body } = await api("/projects");
  let projects = body.projects || [];
  if (filter) projects = projects.filter((p) => p.status === filter);
  document.getElementById("biz-page-title").textContent = "案件一覧";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>案件${filter ? ` (${STATUS_LABELS[filter] || filter})` : ""}</h2>
      ${
        projects.length
          ? projects
              .map(
                (p) =>
                  `<a class="biz-list-item" href="/business/projects/${p.id}">
                    <strong>${p.title}</strong><br/>
                    <span class="biz-status">${STATUS_LABELS[p.status] || p.status}</span>
                    ${p.customerName} · ${p.projectNo}
                  </a>`
              )
              .join("")
          : "<p>案件がありません</p>"
      }
    </section>
    <a class="biz-btn" href="/business/projects/new">新規案件</a>
  `;
}

async function renderProjectNew() {
  const { body: cust } = await api("/customers");
  const customers = cust.customers || [];
  document.getElementById("biz-page-title").textContent = "新規案件";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>案件情報</h2>
      <label>顧客
        <select id="np-customer">${customers.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
      </label>
      <label>お客様名（表示）<input id="np-cname" placeholder="山田様" /></label>
      <label>工事名 <input id="np-title" placeholder="防犯カメラ設置" /></label>
      <label>住所 <input id="np-address" /></label>
      <label>電話 <input id="np-phone" /></label>
      <button type="button" class="biz-btn" id="np-save">登録する</button>
      <p class="biz-error" id="np-err"></p>
    </section>
  `;
  document.getElementById("np-save")?.addEventListener("click", async () => {
    const cid = document.getElementById("np-customer").value;
    const cname =
      document.getElementById("np-cname").value.trim() ||
      customers.find((c) => c.id === cid)?.name ||
      "お客様";
    const title = document.getElementById("np-title").value.trim();
    if (!title) {
      document.getElementById("np-err").textContent = "工事名を入力してください";
      return;
    }
    const { ok, body } = await api("/projects", {
      method: "POST",
      body: JSON.stringify({
        customerId: cid,
        customerName: cname,
        title,
        address: document.getElementById("np-address").value,
        phone: document.getElementById("np-phone").value,
      }),
    });
    if (!ok) {
      document.getElementById("np-err").textContent = body.error || "登録失敗";
      return;
    }
    location.href = `/business/projects/${body.project.id}`;
  });
}

function previewBlock(title, text) {
  return `<h3>${title}</h3><pre class="biz-preview">${text}</pre>`;
}

async function loadProject(id) {
  const { ok, body } = await api(`/projects/${id}`);
  if (!ok) throw new Error(body.error || "not found");
  return body;
}

async function renderProjectDetail(id) {
  const data = await loadProject(id);
  const p = data.project;
  document.getElementById("biz-page-title").textContent = p.title;
  const next = data.nextAction;
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <span class="biz-status">${STATUS_LABELS[p.status] || p.status}</span>
      <p>${p.customerName} · ${p.projectNo}</p>
      <p>${p.address || "住所未入力"}</p>
      ${next ? `<a class="biz-btn next" href="${next.hrefSuffix}">${next.label}</a>` : ""}
    </section>
    <section class="biz-card">
      <h2>メニュー</h2>
      <a class="biz-list-item" href="/business/projects/${id}/survey">現調</a>
      <a class="biz-list-item" href="/business/projects/${id}/estimate">見積</a>
      <a class="biz-list-item" href="/business/projects/${id}/estimate-draft">見積ドラフト v2</a>
      <a class="biz-list-item" href="/business/projects/${id}/construction">工事</a>
      <a class="biz-list-item" href="/business/projects/${id}/completion-report">完了報告</a>
      <a class="biz-list-item" href="/business/projects/${id}/invoice">請求</a>
      <a class="biz-list-item" href="/business/projects/${id}/payment">入金</a>
      <a class="biz-list-item" href="/business/projects/${id}/drawing">施工図を作る</a>
      <a class="biz-list-item" href="/business/projects/${id}/specification">仕様書を作る</a>
      <button type="button" class="biz-list-item" id="btn-est-from-drawing" style="width:100%;text-align:left;border:none;background:transparent;cursor:pointer">図面から見積候補を作る</button>
    </section>
    ${data.qnapPlan ? `<section class="biz-card"><h2>QNAP保存予定</h2>${previewBlock("", data.qnapPlan.basePath + "\n" + (data.qnapPlan.folders || []).join("\n"))}</section>` : ""}
    <section class="biz-card"><button type="button" class="biz-btn secondary" id="btn-qnap">QNAP mock保存</button></section>
    ${(data.calendarDrafts || []).length ? `<section class="biz-card"><h2>カレンダー下書き</h2>${data.calendarDrafts.map((d) => previewBlock(d.title, `${d.start}\n${d.description}`)).join("")}</section>` : ""}
    ${(data.mailDrafts || []).length ? `<section class="biz-card"><h2>メール下書き</h2>${data.mailDrafts.map((m) => previewBlock(m.subject, `To: ${m.to}\n\n${m.body}\n\n添付: ${(m.attachmentPaths || []).join(", ")}`)).join("")}</section>` : ""}
  `;
  document.getElementById("btn-qnap")?.addEventListener("click", async () => {
    await api(`/projects/${id}/qnap/save`, { method: "POST", body: "{}" });
    render();
  });
  document.getElementById("btn-est-from-drawing")?.addEventListener("click", async () => {
    const plans = data.drawingPlans || [];
    if (!plans.length) {
      alert("先に施工図を作成してください");
      return;
    }
    const { body } = await api(
      `/projects/${id}/drawing-plans/${plans[0].id}/estimate-candidate`,
      { method: "POST", body: "{}" }
    );
    alert(`見積候補:\n${body.candidate?.summary || JSON.stringify(body)}`);
  });
}

async function renderDrawingSymbols() {
  const { body } = await api("/drawing-symbols");
  document.getElementById("biz-page-title").textContent = "記号ライブラリ";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>業種別記号</h2>
      <div class="biz-symbol-grid">
        ${(body.symbols || [])
          .map(
            (s) =>
              `<div class="biz-symbol-chip" style="border-left:4px solid ${s.color}"><strong>${s.label}</strong><br/><small>${s.tradeType} / ${s.symbolType}</small></div>`
          )
          .join("")}
      </div>
      <a class="biz-btn secondary" href="/business">ホーム</a>
    </section>`;
}

async function renderDrawing(projectId) {
  const data = await loadProject(projectId);
  let plan = (data.drawingPlans || [])[0];
  if (!plan) {
    const created = await api(`/projects/${projectId}/drawing-plans`, {
      method: "POST",
      body: JSON.stringify({ title: "施工図", tradeType: "security_camera" }),
    });
    plan = created.body.plan;
  }
  const symRes = await api(`/drawing-plans/${plan.id}`);
  const palette = symRes.body.symbols || [];
  document.getElementById("biz-page-title").textContent = "施工図編集";
  const bgStyle = plan.backgroundImagePath
    ? `background-image:url(${plan.backgroundImagePath});background-size:contain;background-repeat:no-repeat;background-position:center;`
    : "background:#1e293b;";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <label>業種
        <select id="dr-trade">
          ${["security_camera", "aircon", "lighting", "electrical", "internet", "tv_antenna", "ventilation", "other"]
            .map((t) => `<option value="${t}" ${plan.tradeType === t ? "selected" : ""}>${t}</option>`)
            .join("")}
        </select>
      </label>
      <label>ルート種別 <select id="dr-route-type">
        ${["lan", "vvf", "coaxial", "refrigerant_pipe", "drain", "duct", "other"]
          .map((t) => `<option value="${t}">${t}</option>`)
          .join("")}
      </select></label>
      <input type="file" accept="image/*" id="dr-bg-file" />
      <button type="button" class="biz-btn secondary" id="dr-bg-upload">背景画像</button>
      <button type="button" class="biz-btn secondary" id="dr-save">保存</button>
    </section>
    <section class="biz-card">
      <h2>記号パレット（クリックで配置）</h2>
      <div class="biz-palette">${palette.map((s) => `<button type="button" class="biz-palette-btn" data-sid="${s.id}" data-label="${s.label}" style="border-color:${s.color}">${s.icon} ${s.label}</button>`).join("")}</div>
    </section>
    <section class="biz-card">
      <div id="dr-canvas" class="biz-drawing-canvas" style="${bgStyle}min-height:320px;position:relative;">
        ${(plan.symbols || [])
          .map(
            (s, i) =>
              `<div class="biz-placed-symbol" data-idx="${i}" style="left:${s.x}px;top:${s.y}px">${s.label || "●"}</div>`
          )
          .join("")}
      </div>
      <p class="hint">キャンバスをクリックして選択中の記号を配置。記号をドラッグで移動。</p>
      <label>ルート概算長(m) <input type="number" id="dr-route-len" value="10" min="1" /></label>
      <button type="button" class="biz-btn secondary" id="dr-add-route">ルートを追加</button>
    </section>
    <label>メモ <textarea id="dr-notes">${plan.notes || ""}</textarea></label>
    <a class="biz-btn secondary" href="/business/projects/${projectId}">案件に戻る</a>
  `;
  let selectedSymbol = palette[0] || null;
  let symbols = [...(plan.symbols || [])];
  let routes = [...(plan.routes || [])];
  document.querySelectorAll(".biz-palette-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSymbol = palette.find((x) => x.id === btn.dataset.sid) || null;
      document.querySelectorAll(".biz-palette-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  const canvas = document.getElementById("dr-canvas");
  canvas?.addEventListener("click", (ev) => {
    if (!selectedSymbol || ev.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    symbols.push({
      id: `ps-${Date.now()}`,
      symbolId: selectedSymbol.id,
      x: ev.clientX - rect.left - 12,
      y: ev.clientY - rect.top - 12,
      rotation: 0,
      label: selectedSymbol.label,
      memo: "",
      linkedPhotoIds: [],
    });
    const el = document.createElement("div");
    el.className = "biz-placed-symbol";
    el.style.left = `${symbols[symbols.length - 1].x}px`;
    el.style.top = `${symbols[symbols.length - 1].y}px`;
    el.textContent = selectedSymbol.label;
    canvas.appendChild(el);
  });
  document.getElementById("dr-add-route")?.addEventListener("click", () => {
    const routeType = document.getElementById("dr-route-type").value;
    const estimatedLength = Number(document.getElementById("dr-route-len").value) || 1;
    routes.push({
      id: `rt-${Date.now()}`,
      routeType,
      points: [
        { x: 40, y: 40 },
        { x: 200, y: 120 },
      ],
      color: "#22c55e",
      lineStyle: "solid",
      estimatedLength,
      memo: "",
    });
    alert(`ルート追加: ${routeType} ${estimatedLength}m`);
  });
  document.getElementById("dr-save")?.addEventListener("click", async () => {
    await api(`/drawing-plans/${plan.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        tradeType: document.getElementById("dr-trade").value,
        symbols,
        routes,
        notes: document.getElementById("dr-notes").value,
      }),
    });
    alert("施工図を保存しました");
  });
  document.getElementById("dr-bg-upload")?.addEventListener("click", async () => {
    const file = document.getElementById("dr-bg-file").files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    await api(`/projects/${projectId}/drawing-plans/${plan.id}/background`, {
      method: "POST",
      body: JSON.stringify({ imageBase64: b64, fileName: file.name }),
    });
    render();
  });
}

async function renderSpecification(projectId) {
  const data = await loadProject(projectId);
  const plan = (data.drawingPlans || [])[0];
  document.getElementById("biz-page-title").textContent = "仕様書作成";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>仕様書PDF</h2>
      <p>施工図: ${plan ? plan.title : "未作成 — 施工図画面で作成してください"}</p>
      <label>概要 <textarea id="spec-overview">${data.project.title} 工事仕様</textarea></label>
      <button type="button" class="biz-btn" id="spec-pdf">仕様書PDFを生成</button>
      <pre class="biz-preview" id="spec-out"></pre>
    </section>
    ${(data.specifications || [])
      .map((d) => `<section class="biz-card"><a href="${d.pdfPath}" target="_blank">${d.title}</a></section>`)
      .join("")}
    <a href="/business/projects/${projectId}">戻る</a>
  `;
  document.getElementById("spec-pdf")?.addEventListener("click", async () => {
    const { ok, body } = await api(`/projects/${projectId}/specification/generate-pdf`, {
      method: "POST",
      body: JSON.stringify({
        drawingPlanId: plan?.id,
        overview: document.getElementById("spec-overview").value,
      }),
    });
    document.getElementById("spec-out").textContent = ok
      ? JSON.stringify(body, null, 2)
      : body.error || "failed";
    if (ok) render();
  });
}

async function renderSurvey(id) {
  const data = await loadProject(id);
  const p = data.project;
  document.getElementById("biz-page-title").textContent = "現調入力";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>現調予定</h2>
      <label>日付 <input type="date" id="sv-date" value="${p.surveySchedule?.date || ""}" /></label>
      <label>開始 <input type="time" id="sv-start" value="${p.surveySchedule?.startTime || "09:00"}" /></label>
      <label>終了 <input type="time" id="sv-end" value="${p.surveySchedule?.endTime || "12:00"}" /></label>
      <label>内容 <textarea id="sv-memo">${p.surveySchedule?.memo || ""}</textarea></label>
      <button type="button" class="biz-btn" id="sv-sched">予定を保存（カレンダー下書き作成）</button>
    </section>
    <section class="biz-card">
      <h2>現調メモ・写真</h2>
      <label>メモ <textarea id="sv-done-memo">${p.surveyMemo || ""}</textarea></label>
      <input type="file" accept="image/*" capture="environment" id="sv-photo" />
      <button type="button" class="biz-btn" id="sv-photo-btn">写真を追加</button>
      <button type="button" class="biz-btn secondary" id="sv-done">現調完了にする</button>
      <p>写真: ${(p.surveyPhotos || []).length}枚</p>
    </section>
    <a class="biz-btn secondary" href="/business/projects/${id}">案件に戻る</a>
  `;
  document.getElementById("sv-sched")?.addEventListener("click", async () => {
    await api(`/projects/${id}/survey-schedule`, {
      method: "POST",
      body: JSON.stringify({
        date: document.getElementById("sv-date").value,
        startTime: document.getElementById("sv-start").value,
        endTime: document.getElementById("sv-end").value,
        memo: document.getElementById("sv-memo").value,
      }),
    });
    render();
  });
  document.getElementById("sv-done")?.addEventListener("click", async () => {
    await api(`/projects/${id}/survey-done`, {
      method: "POST",
      body: JSON.stringify({ memo: document.getElementById("sv-done-memo").value }),
    });
    location.href = `/business/projects/${id}/estimate`;
  });
  document.getElementById("sv-photo-btn")?.addEventListener("click", async () => {
    const file = document.getElementById("sv-photo").files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    await api(`/projects/${id}/survey-photo`, {
      method: "POST",
      body: JSON.stringify({ imageBase64: b64, fileName: file.name }),
    });
    render();
  });
}

async function renderEstimateDraft(id) {
  document.getElementById("biz-page-title").textContent = "見積ドラフト v2";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>TOMS見積ドラフト v2</h2>
      <p class="hint">Survey AI v2 から材料・工事・粗利率付きドラフトを生成</p>
      <button type="button" class="biz-btn" id="btn-draft-gen">ドラフト生成</button>
      <button type="button" class="biz-btn secondary" id="btn-draft-load">最新を読込</button>
      <div id="draft-table" class="hint" style="margin-top:1rem">—</div>
      <pre class="biz-preview" id="draft-out"></pre>
    </section>
    <a href="/business/projects/${id}">戻る</a>
  `;
  const renderTable = (draft) => {
    if (!draft?.lines?.length) {
      document.getElementById("draft-table").textContent = "行なし";
      return;
    }
    const rows = draft.lines
      .map(
        (l) =>
          `<tr><td>${l.materialCategory || l.laborCategory}</td><td>${l.name}</td><td>${l.quantity}${l.unit}</td><td>¥${l.unitPrice}</td><td>¥${l.costPrice}</td><td>${l.grossProfitRate}%</td><td>${l.customerDescription?.slice(0, 30)}…</td></tr>`
      )
      .join("");
    document.getElementById("draft-table").innerHTML = `
      <p>粗利率 ${draft.grossProfitRate}% / 小計 ¥${draft.subtotal}</p>
      <table class="items"><thead><tr><th>区分</th><th>品名</th><th>数量</th><th>単価</th><th>原価</th><th>粗利</th><th>説明</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  document.getElementById("btn-draft-gen")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/estimate-draft`, { method: "POST", body: "{}" });
    document.getElementById("draft-out").textContent = JSON.stringify(body.draft, null, 2);
    renderTable(body.draft);
  });
  document.getElementById("btn-draft-load")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/estimate-draft`);
    document.getElementById("draft-out").textContent = JSON.stringify(body.draft, null, 2);
    renderTable(body.draft);
  });
}

async function renderEstimate(id) {
  const data = await loadProject(id);
  const ai = data.aiCandidate;
  document.getElementById("biz-page-title").textContent = "見積作成";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>見積</h2>
      ${ai && !ai.applied ? `<span class="biz-ai-badge">AI候補あり — 反映前にご確認ください</span>` : ""}
      <button type="button" class="biz-btn secondary" id="btn-ai">AI候補を取得</button>
      <button type="button" class="biz-btn" id="btn-est">見積を作成（AI候補を反映）</button>
      <button type="button" class="biz-btn secondary" id="btn-est-pdf">見積PDFを再生成</button>
      <button type="button" class="biz-btn" id="btn-mail">見積送付メール（mock）</button>
      <button type="button" class="biz-btn secondary" id="btn-accept">受注にする</button>
      <pre class="biz-preview" id="est-out"></pre>
    </section>
    <a href="/business/projects/${id}">戻る</a>
  `;
  document.getElementById("btn-ai")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/ai-candidate`, { method: "POST", body: "{}" });
    document.getElementById("est-out").textContent = JSON.stringify(body, null, 2);
  });
  document.getElementById("btn-est")?.addEventListener("click", async () => {
    let items = [];
    try {
      const draft = await api(`/projects/${id}/ai-candidate/draft-lines`);
      if (draft.ok) items = draft.body.lines;
    } catch {
      /* */
    }
    const { body } = await api(`/projects/${id}/estimate`, {
      method: "POST",
      body: JSON.stringify({ items, fromAi: true }),
    });
    document.getElementById("est-out").textContent = JSON.stringify(body.estimate, null, 2);
  });
  document.getElementById("btn-est-pdf")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/estimate`);
    document.getElementById("est-out").textContent = JSON.stringify(body, null, 2);
  });
  document.getElementById("btn-mail")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/mail/estimate-ready`, { method: "POST", body: "{}" });
    document.getElementById("est-out").textContent = JSON.stringify(body.mail ?? body, null, 2);
    render();
  });
  document.getElementById("btn-accept")?.addEventListener("click", async () => {
    await api(`/projects/${id}/accepted`, { method: "POST", body: "{}" });
    location.href = `/business/projects/${id}/construction`;
  });
}

async function renderConstruction(id) {
  const data = await loadProject(id);
  const p = data.project;
  document.getElementById("biz-page-title").textContent = "工事・施工写真";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>工事予定</h2>
      <label>日付 <input type="date" id="cn-date" /></label>
      <label>必要部材 <textarea id="cn-mat">${p.requiredMaterials || ""}</textarea></label>
      <label>注意点 <textarea id="cn-memo">${p.constructionMemo || ""}</textarea></label>
      <button type="button" class="biz-btn" id="cn-sched">工事予定を保存</button>
    </section>
    <section class="biz-card">
      <h2>施工写真</h2>
      <input type="file" accept="image/*" capture="environment" id="cn-photo" />
      <button type="button" class="biz-btn" id="cn-photo-btn">写真追加</button>
      <button type="button" class="biz-btn" id="cn-done">工事完了</button>
    </section>
    <a href="/business/projects/${id}">戻る</a>
  `;
  document.getElementById("cn-sched")?.addEventListener("click", async () => {
    await api(`/projects/${id}/construction-schedule`, {
      method: "POST",
      body: JSON.stringify({
        date: document.getElementById("cn-date").value,
        requiredMaterials: document.getElementById("cn-mat").value,
        memo: document.getElementById("cn-memo").value,
      }),
    });
    render();
  });
  document.getElementById("cn-photo-btn")?.addEventListener("click", async () => {
    const file = document.getElementById("cn-photo").files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    await api(`/projects/${id}/construction-photo`, {
      method: "POST",
      body: JSON.stringify({ imageBase64: b64, fileName: file.name }),
    });
    render();
  });
  document.getElementById("cn-done")?.addEventListener("click", async () => {
    await api(`/projects/${id}/construction-done`, { method: "POST", body: "{}" });
    location.href = `/business/projects/${id}/completion-report`;
  });
}

async function renderCompletion(id) {
  document.getElementById("biz-page-title").textContent = "完了報告書";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <label>作業メモ <textarea id="rp-memo"></textarea></label>
      <button type="button" class="biz-btn" id="rp-create">完了報告書を作成（PDF）</button>
      <pre class="biz-preview" id="rp-out"></pre>
    </section>
    <a href="/business/projects/${id}/invoice">請求書へ</a>
  `;
  document.getElementById("rp-create")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/completion-report`, {
      method: "POST",
      body: JSON.stringify({ workMemo: document.getElementById("rp-memo").value }),
    });
    document.getElementById("rp-out").textContent = JSON.stringify(body, null, 2);
  });
}

async function renderInvoice(id) {
  document.getElementById("biz-page-title").textContent = "請求書";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <label>入金予定日 <input type="date" id="inv-due" /></label>
      <button type="button" class="biz-btn" id="inv-create">請求書を作成（見積から・PDF）</button>
      <button type="button" class="biz-btn" id="inv-mail">送付メール下書き</button>
      <pre class="biz-preview" id="inv-out"></pre>
    </section>
    <a href="/business/projects/${id}/payment">入金管理へ</a>
  `;
  document.getElementById("inv-create")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/invoice`, {
      method: "POST",
      body: JSON.stringify({ paymentDueDate: document.getElementById("inv-due").value }),
    });
    document.getElementById("inv-out").textContent = JSON.stringify(body, null, 2);
  });
  document.getElementById("inv-mail")?.addEventListener("click", async () => {
    const { body } = await api(`/projects/${id}/mail/invoice-ready`, { method: "POST", body: "{}" });
    document.getElementById("inv-out").textContent = JSON.stringify(body.mail ?? body, null, 2);
  });
}

async function renderPayment(id) {
  document.getElementById("biz-page-title").textContent = "入金管理";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <label>入金予定日 <input type="date" id="pay-due" /></label>
      <button type="button" class="biz-btn" id="pay-sched">入金予定を登録（カレンダー下書き）</button>
      <label>入金額 <input type="number" id="pay-amount" /></label>
      <label>入金日 <input type="date" id="pay-date" /></label>
      <label>方法 <input id="pay-method" value="bank_transfer" /></label>
      <button type="button" class="biz-btn" id="pay-record">入金を記録</button>
      <button type="button" class="biz-btn" id="pay-done">入金済みにする</button>
    </section>
    <a href="/business/projects/${id}">戻る</a>
  `;
  document.getElementById("pay-record")?.addEventListener("click", async () => {
    await api(`/projects/${id}/payment`, {
      method: "POST",
      body: JSON.stringify({
        amount: Number(document.getElementById("pay-amount").value),
        paymentDate: document.getElementById("pay-date").value,
        method: document.getElementById("pay-method").value,
      }),
    });
    render();
  });
  document.getElementById("pay-sched")?.addEventListener("click", async () => {
    await api(`/projects/${id}/payment-due`, {
      method: "POST",
      body: JSON.stringify({ paymentDueDate: document.getElementById("pay-due").value }),
    });
    render();
  });
  document.getElementById("pay-done")?.addEventListener("click", async () => {
    await api(`/projects/${id}/paid`, { method: "POST", body: "{}" });
    location.href = `/business/projects/${id}`;
  });
}

async function renderCustomers() {
  const { body } = await api("/customers");
  document.getElementById("biz-page-title").textContent = "顧客管理";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      ${(body.customers || [])
        .map((c) => `<div class="biz-list-item"><strong>${c.name}</strong><br/>${c.phone} ${c.email}</div>`)
        .join("")}
    </section>
  `;
}

function confirmRealSend(label) {
  return window.confirm(`【本番送信確認】\n${label}\n\n本当に実行しますか？`);
}

async function renderPricing() {
  const params = new URLSearchParams(window.location.search);
  const customerFilter = params.get("customer_code") || "";
  const contractorFilter = params.get("contractor_code") || "";
  const { body } = await api("/pricing");
  document.getElementById("biz-page-title").textContent = "顧客別単価";
  let rules = body.rules || [];
  if (customerFilter) {
    rules = rules.filter((r) => r.scopeType === "customer" && r.scopeRef === customerFilter);
  }
  if (contractorFilter) {
    rules = rules.filter((r) => r.scopeType === "contractor" && r.scopeRef === contractorFilter);
  }
  const scopeLabel = { customer: "顧客別", contractor: "元請け別", work_item: "工事項目", standard: "標準" };
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>CSV</h2>
      <label>顧客コードでフィルタ <input id="csv-customer" value="${customerFilter}" placeholder="TOMS001" /></label>
      <label>元請けコード <input id="csv-contractor" value="${contractorFilter}" /></label>
      <button type="button" class="biz-btn secondary" id="csv-export">CSV出力</button>
      <label>CSV取込 <textarea id="csv-import" rows="4" placeholder="customer_code,contractor_code,..."></textarea></label>
      <label>取込モード
        <select id="csv-import-mode"><option value="append">追加</option><option value="replace">上書き</option></select>
      </label>
      <button type="button" class="biz-btn secondary" id="csv-preview-btn">プレビュー</button>
      <button type="button" class="biz-btn" id="csv-import-btn">CSV取込</button>
      <div id="csv-preview-table"></div>
      <pre class="biz-preview" id="csv-result"></pre>
    </section>
    <section class="biz-card">
      <h2>単価ルール (${rules.length})</h2>
      ${rules
        .map(
          (r) =>
            `<div class="biz-list-item" style="cursor:default">
              <strong>${r.name}</strong>
              <span class="biz-status">${scopeLabel[r.scopeType] || r.scopeType}${r.active ? "" : " · 無効"}</span><br/>
              ¥${r.unitPrice}/${r.unit} · ${r.workCategory}
            </div>`
        )
        .join("")}
    </section>
    <section class="biz-card">
      <h2>新規ルール</h2>
      <label>区分
        <select id="pr-scope"><option value="standard">標準</option><option value="customer">顧客別</option><option value="contractor">元請け別</option><option value="work_item">工事項目</option></select>
      </label>
      <label>名称 <input id="pr-name" /></label>
      <label>単価 <input id="pr-price" type="number" /></label>
      <button type="button" class="biz-btn" id="pr-add">追加</button>
    </section>
  `;
  document.getElementById("pr-add")?.addEventListener("click", async () => {
    await api("/pricing", {
      method: "POST",
      body: JSON.stringify({
        scopeType: document.getElementById("pr-scope").value,
        name: document.getElementById("pr-name").value,
        unitPrice: Number(document.getElementById("pr-price").value),
        workCategory: "other",
      }),
    });
    render();
  });
  document.getElementById("csv-export")?.addEventListener("click", () => {
    const q = new URLSearchParams();
    const c = document.getElementById("csv-customer").value.trim();
    const k = document.getElementById("csv-contractor").value.trim();
    if (c) q.set("customer_code", c);
    if (k) q.set("contractor_code", k);
    window.open(`/api/business/pricing/export-csv?${q}`, "_blank");
  });
  document.getElementById("csv-preview-btn")?.addEventListener("click", async () => {
    const csv = document.getElementById("csv-import").value;
    const { body: r } = await api("/pricing/preview-csv", { method: "POST", body: JSON.stringify({ csv }) });
    const errRows = (r.errors || []).join("\n");
    const table = (r.rows || [])
      .map(
        (row) =>
          `<tr class="${row._error ? "biz-error-row" : ""}"><td>${row.line}</td><td>${row.scope}</td><td>${row.item_name}</td><td>${row.unit_price}</td><td>${row.customer_code || "—"}</td><td>${row.contractor_code || "—"}</td><td>${row.active}</td></tr>`
      )
      .join("");
    document.getElementById("csv-preview-table").innerHTML = `<p>有効 ${r.validCount} / 無効 ${r.invalidCount}</p>
      <table class="items"><thead><tr><th>行</th><th>区分</th><th>品名</th><th>単価</th><th>顧客</th><th>元請</th><th>有効</th></tr></thead><tbody>${table}</tbody></table>
      ${errRows ? `<pre class="biz-preview">${errRows}</pre>` : ""}`;
  });
  document.getElementById("csv-import-btn")?.addEventListener("click", async () => {
    const csv = document.getElementById("csv-import").value;
    const mode = document.getElementById("csv-import-mode").value;
    if (mode === "replace" && !confirmRealSend("単価CSVを上書き取込します")) return;
    const { body: r } = await api("/pricing/import-csv", {
      method: "POST",
      body: JSON.stringify({ csv, mode }),
    });
    document.getElementById("csv-result").textContent = JSON.stringify(r, null, 2);
    render();
  });
}

async function renderSettings() {
  const { body } = await api("/settings");
  const rs = body.realSend || {};
  document.getElementById("biz-page-title").textContent = "連携設定";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <div class="biz-integration-row"><span>Google/Gmail</span><span class="mock">${body.googleOAuth?.mode ?? body.googleCalendar?.mode} / ${body.googleOAuth?.connected ? "接続済" : "未接続"}</span></div>
      <div class="biz-integration-row"><span>QNAP</span><span class="mock">${body.qnap?.mode} — ${body.qnap?.baseRoot}</span></div>
      <div class="biz-integration-row"><span>PDF</span><span class="mock">${body.pdf?.mode} (${body.pdf?.templates?.estimate})</span></div>
      <div class="biz-integration-row"><span>送信先メール</span><span>${body.mailTo ?? body.gmail?.defaultTo}</span></div>
      <h3>real送信ガード</h3>
      <label><input type="checkbox" id="rs-dry" ${rs.dryRun ? "checked" : ""}/> dry-run</label>
      <label><input type="checkbox" id="rs-mock" ${rs.mockOnly ? "checked" : ""}/> mock only</label>
      <label><input type="checkbox" id="rs-real" ${rs.realSendEnabled ? "checked" : ""}/> real send enabled</label>
      <button type="button" class="biz-btn secondary" id="btn-save-real-send">ガード設定を保存</button>
      <h3>TOMS会社情報</h3>
      <p class="hint">${body.company?.name}<br/>${body.company?.address}<br/>${body.company?.phone}</p>
      <button type="button" class="biz-btn secondary" id="btn-google-test">Google接続テスト</button>
      <button type="button" class="biz-btn secondary" id="btn-qnap-test">QNAP接続テスト</button>
      <button type="button" class="biz-btn secondary" id="btn-push-mock">Business通知（mock）</button>
      <a class="biz-btn secondary" href="/api/business/accounting/export-csv?format=standard" style="display:block;text-align:center;text-decoration:none;margin-top:0.5rem">会計CSV（標準）</a>
      <a class="biz-btn secondary" href="/api/business/accounting/export-csv?format=freee" style="display:block;text-align:center;text-decoration:none;margin-top:0.35rem">会計CSV（freee）</a>
      <a class="biz-btn secondary" href="/api/business/accounting/export-csv?format=yayoi" style="display:block;text-align:center;text-decoration:none;margin-top:0.35rem">会計CSV（弥生）</a>
      <a class="biz-btn secondary" href="/api/business/integration-logs/export-csv" style="display:block;text-align:center;text-decoration:none;margin-top:0.35rem">integration logs CSV</a>
    </section>
    <section class="biz-card">
      <h3>integration logs（直近）</h3>
      <div id="integration-logs-list" class="hint">読込中…</div>
    </section>
  `;
  document.getElementById("btn-save-real-send")?.addEventListener("click", async () => {
    await api("/settings/real-send", {
      method: "PATCH",
      body: JSON.stringify({
        dryRun: document.getElementById("rs-dry").checked,
        mockOnly: document.getElementById("rs-mock").checked,
        realSendEnabled: document.getElementById("rs-real").checked,
      }),
    });
    render();
  });
  document.getElementById("btn-google-test")?.addEventListener("click", async () => {
    const { body: t } = await api("/google/test", { method: "POST", body: "{}" });
    alert(JSON.stringify(t, null, 2));
  });
  document.getElementById("btn-qnap-test")?.addEventListener("click", async () => {
    const { body: t } = await api("/qnap/test-connection", { method: "POST", body: "{}" });
    alert(JSON.stringify(t, null, 2));
  });
  document.getElementById("btn-push-mock")?.addEventListener("click", async () => {
    if (!confirmRealSend("Business Web Push（mock）を送信")) return;
    const { body: t } = await api("/notifications/push-mock", {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    });
    alert(JSON.stringify(t, null, 2));
  });
  const { body: logs } = await api("/integration-logs?limit=20");
  document.getElementById("integration-logs-list").innerHTML = (logs.logs || [])
    .map(
      (l) =>
        `<div style="margin-bottom:0.35rem"><code>${l.createdAt?.slice(0, 19)}</code> [${l.type}/${l.provider}] ${l.status}${l.errorMessage ? " — " + l.errorMessage : ""}</div>`
    )
    .join("") || "ログなし";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function render() {
  document.getElementById("biz-nav").innerHTML = navHtml();
  if (!(await ensureLogin())) return;
  const r = route();
  try {
    switch (r.view) {
      case "home":
        await renderHome();
        break;
      case "projects":
        await renderProjects();
        break;
      case "project_new":
        await renderProjectNew();
        break;
      case "project_detail":
        await renderProjectDetail(r.projectId);
        break;
      case "survey":
        await renderSurvey(r.projectId);
        break;
      case "estimate":
        await renderEstimate(r.projectId);
        break;
      case "estimate-draft":
        await renderEstimateDraft(r.projectId);
        break;
      case "construction":
        await renderConstruction(r.projectId);
        break;
      case "completion-report":
        await renderCompletion(r.projectId);
        break;
      case "invoice":
        await renderInvoice(r.projectId);
        break;
      case "payment":
        await renderPayment(r.projectId);
        break;
      case "customers":
        await renderCustomers();
        break;
      case "pricing":
        await renderPricing();
        break;
      case "settings":
        await renderSettings();
        break;
      case "drawing_symbols":
        await renderDrawingSymbols();
        break;
      case "drawing":
        await renderDrawing(r.projectId);
        break;
      case "specification":
        await renderSpecification(r.projectId);
        break;
      default:
        await renderHome();
    }
  } catch (e) {
    document.getElementById("biz-root").innerHTML = `<p class="biz-error">${e.message}</p>`;
  }
}

renderPwaTopbar("business", "TOMS業務");
render();
updateOfflineBar();
window.addEventListener("popstate", render);
window.addEventListener("online", () => {
  flushOfflineQueue().then(render);
  updateOfflineBar();
});
window.addEventListener("offline", updateOfflineBar);
