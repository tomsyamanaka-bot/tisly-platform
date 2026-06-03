import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const STATUS_LABELS = {
  new: "新規",
  survey_scheduled: "現調予定",
  survey_done: "現調完了",
  estimate_created: "見積作成済",
  estimate_sent_to_owner: "見積送付済",
  accepted: "受注",
  construction_scheduled: "工事予定",
  construction_done: "工事完了",
  completion_report_created: "完了報告済",
  invoice_created: "請求作成済",
  invoice_sent_to_owner: "請求送付済",
  payment_scheduled: "入金予定",
  paid: "入金済",
  archived: "保管",
};

function token() {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
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
  return { view: "home" };
}

function navHtml() {
  return `
    <a href="/business">ホーム</a>
    <a href="/business/projects">案件</a>
    <a href="/business/projects/new">新規</a>
    <a href="/business/customers">顧客</a>
    <a href="/business/pricing">単価</a>
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

async function renderHome() {
  const { body } = await api("/hub-counts");
  document.getElementById("biz-page-title").textContent = "TOMS業務ホーム";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <h2>進捗サマリー</h2>
      <div class="biz-stats">
        <div class="biz-stat"><div class="n">${body.newProjects ?? 0}</div><div class="l">新規案件</div></div>
        <div class="biz-stat"><div class="n">${body.surveyScheduled ?? 0}</div><div class="l">現調予定</div></div>
        <div class="biz-stat"><div class="n">${body.estimatePending ?? 0}</div><div class="l">見積待ち</div></div>
        <div class="biz-stat"><div class="n">${body.constructionScheduled ?? 0}</div><div class="l">工事予定</div></div>
        <div class="biz-stat"><div class="n">${body.invoicePending ?? 0}</div><div class="l">請求待ち</div></div>
        <div class="biz-stat"><div class="n">${body.paymentPending ?? 0}</div><div class="l">入金待ち</div></div>
      </div>
    </section>
    <a class="biz-btn" href="/business/projects/new">新規案件を登録</a>
    <a class="biz-btn secondary" href="/business/projects" style="text-align:center;text-decoration:none">案件一覧</a>
  `;
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
      <a class="biz-list-item" href="/business/projects/${id}/construction">工事</a>
      <a class="biz-list-item" href="/business/projects/${id}/completion-report">完了報告</a>
      <a class="biz-list-item" href="/business/projects/${id}/invoice">請求</a>
      <a class="biz-list-item" href="/business/projects/${id}/payment">入金</a>
    </section>
    ${data.qnapPlan ? `<section class="biz-card"><h2>QNAP保存予定</h2>${previewBlock("", data.qnapPlan.basePath + "\n" + (data.qnapPlan.folders || []).join("\n"))}</section>` : `<section class="biz-card"><button type="button" class="biz-btn secondary" id="btn-qnap">QNAPパスを表示</button></section>`}
    ${(data.calendarDrafts || []).length ? `<section class="biz-card"><h2>カレンダー下書き</h2>${data.calendarDrafts.map((d) => previewBlock(d.title, `${d.start}\n${d.description}`)).join("")}</section>` : ""}
    ${(data.mailDrafts || []).length ? `<section class="biz-card"><h2>メール下書き</h2>${data.mailDrafts.map((m) => previewBlock(m.subject, `To: ${m.to}\n\n${m.body}\n\n添付: ${(m.attachmentPaths || []).join(", ")}`)).join("")}</section>` : ""}
  `;
  document.getElementById("btn-qnap")?.addEventListener("click", async () => {
    await api(`/projects/${id}/qnap-plan`, { method: "POST" });
    render();
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
      <button type="button" class="biz-btn" id="btn-mail">確認用メール下書き</button>
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
    const { body } = await api(`/projects/${id}/estimate-mail`, { method: "POST", body: "{}" });
    document.getElementById("est-out").textContent = JSON.stringify(body.mail, null, 2);
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
    const { body } = await api(`/projects/${id}/invoice-mail`, { method: "POST", body: "{}" });
    document.getElementById("inv-out").textContent = JSON.stringify(body.mail, null, 2);
  });
}

async function renderPayment(id) {
  document.getElementById("biz-page-title").textContent = "入金管理";
  document.getElementById("biz-root").innerHTML = `
    <section class="biz-card">
      <label>入金予定日 <input type="date" id="pay-due" /></label>
      <button type="button" class="biz-btn" id="pay-sched">入金予定を登録（カレンダー下書き）</button>
      <button type="button" class="biz-btn" id="pay-done">入金済みにする</button>
    </section>
    <a href="/business/projects/${id}">戻る</a>
  `;
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

async function renderPricing() {
  const { body } = await api("/pricing");
  document.getElementById("biz-page-title").textContent = "顧客別単価表";
  const tiers = body.tiers || [];
  document.getElementById("biz-root").innerHTML = tiers
    .map(
      (t) =>
        `<section class="biz-card"><h2>${t.name}</h2>${(t.items || [])
          .map((i) => `<div>${i.name}: ¥${i.defaultUnitPrice}/${i.unit}</div>`)
          .join("")}</section>`
    )
    .join("");
}

async function renderSettings() {
  const { body } = await api("/settings");
  document.getElementById("biz-page-title").textContent = "連携設定（予定）";
  document.getElementById("biz-root").innerHTML = `<pre class="biz-preview">${JSON.stringify(body, null, 2)}</pre>`;
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
      default:
        await renderHome();
    }
  } catch (e) {
    document.getElementById("biz-root").innerHTML = `<p class="biz-error">${e.message}</p>`;
  }
}

renderPwaTopbar("business", "TOMS業務");
render();
window.addEventListener("popstate", render);
