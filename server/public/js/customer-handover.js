import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const codeMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = codeMatch ? codeMatch[1].toUpperCase() : "TOMS001";

function token() {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function api(path) {
  const headers = token() ? { Authorization: `Bearer ${token()}` } : {};
  const res = await fetch(path, { headers });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function ensureLogin() {
  if (token()) return;
  const res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode,
      username: `${customerCode.toLowerCase()}.owner`,
      password: "demo-remote-2026",
    }),
  });
  if (res.ok) {
    const data = await res.json();
    sessionStorage.setItem(TOKEN_KEY, data.token);
  }
}

function tableRows(rows, cols) {
  if (!rows?.length) return "<p>（なし）</p>";
  const head = cols.map((c) => `<th>${c.label}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${r[c.key] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

async function load() {
  await ensureLogin();
  const data = await api(`/api/customer/${customerCode}/handover`);
  const h = data.handover;
  document.getElementById("handover-meta").textContent = `${h.customerName} (${h.customerCode}) — ${h.generatedAt.slice(0, 19)}`;
  document.getElementById("handover-root").innerHTML = `
    <section>
      <h2>アクセスURL</h2>
      <p><strong>ログイン</strong></p><div class="url-box"><a href="${h.loginUrl}">${h.loginUrl}</a></div>
      <p><strong>TV</strong></p><div class="url-box"><a href="${h.tvUrl}">${h.tvUrl}</a></div>
      <p><strong>PRO Remote</strong></p><div class="url-box"><a href="${h.proRemoteUrl}">${h.proRemoteUrl}</a></div>
    </section>
    <section>
      <h2>設備一覧</h2>
      ${tableRows(h.equipment, [
        { key: "deviceId", label: "ID" },
        { key: "label", label: "名称" },
        { key: "kind", label: "種別" },
        { key: "status", label: "状態" },
      ])}
    </section>
    <section>
      <h2>QR一覧</h2>
      ${tableRows(h.qrList, [
        { key: "assetId", label: "資産ID" },
        { key: "deviceId", label: "設備ID" },
        { key: "label", label: "ラベル" },
      ])}
    </section>
    <section>
      <h2>施工写真</h2>
      ${h.constructionPhotos?.length ? h.constructionPhotos.map((p) => `<p><a href="${p.url}">${p.caption}</a></p>`).join("") : "<p>（なし）</p>"}
    </section>
    <section>
      <h2>完了報告</h2>
      ${h.completionReport ? `<p>${h.completionReport.title}</p><p>${h.completionReport.workMemo}</p>` : "<p>（未作成）</p>"}
    </section>
    <section>
      <h2>保守予定</h2>
      ${tableRows(h.maintenanceSchedule, [
        { key: "title", label: "タイトル" },
        { key: "dueDate", label: "予定日" },
        { key: "status", label: "状態" },
      ])}
    </section>
    <section>
      <h2>緊急連絡先</h2>
      <p>電話: ${h.emergencyContact.phone}</p>
      <p>メール: ${h.emergencyContact.email}</p>
      <p>${h.emergencyContact.hours}</p>
    </section>
    ${h.deploymentChecklist ? `<section><h2>導入チェックリスト</h2><p>${h.deploymentChecklist.completedCount}/${h.deploymentChecklist.totalCount} 完了</p></section>` : ""}
  `;
}

renderPwaTopbar("customer", customerCode);
load().catch((e) => {
  document.getElementById("handover-root").innerHTML = `<p>${e.message}</p>`;
});
