import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";

function authHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loadList() {
  const res = await fetch("/api/toms/customer-master", { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const list = document.getElementById("cm-list");
  list.innerHTML = (data.customers || [])
    .map(
      (c) =>
        `<div class="row" data-id="${c.id}">
          <strong>${c.name}</strong> ${c.company}<br>
          <small>${c.phone} · ${c.address}</small>
        </div>`
    )
    .join("");
  list.querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", () => loadDetail(el.dataset.id));
  });
}

async function loadDetail(id) {
  const res = await fetch(`/api/toms/customer-master/${id}`, { headers: authHeaders() });
  if (!res.ok) return;
  const c = await res.json();
  const panel = document.getElementById("cm-detail");
  panel.hidden = false;
  panel.innerHTML = `
    <h2>${c.name}</h2>
    <p>${c.company} · ${c.email} · ${c.phone}</p>
    <h3>施工履歴 (${c.constructionHistory?.length ?? 0})</h3>
    <ul>${(c.constructionHistory || [])
      .map((p) => `<li><a href="/project/${p.id}">${p.title}</a></li>`)
      .join("")}</ul>
    <h3>請求履歴</h3>
    <ul>${(c.invoiceHistory || [])
      .map((i) => `<li>${i.invoiceNo} ¥${i.total}</li>`)
      .join("")}</ul>`;
}

document.getElementById("cm-search")?.addEventListener("input", async (ev) => {
  const q = ev.target.value.trim();
  if (q.length < 2) {
    loadList();
    return;
  }
  const res = await fetch(`/api/toms/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("cm-list").innerHTML = (data.hits || [])
    .map(
      (h) =>
        `<div class="row"><a href="${h.href}"><strong>${h.title}</strong></a><br><small>${h.subtitle}</small></div>`
    )
    .join("");
});

loadList().catch(console.error);
renderPwaTopbar("business", "顧客台帳");
