import { apiGet, apiPost } from "./api.js";

const parts = window.location.pathname.split("/");
const customerCode = parts[parts.indexOf("customer") + 1] ?? "";

async function load() {
  if (!customerCode || customerCode === "new") return;
  document.getElementById("title").textContent = `顧客導入管理 — ${customerCode}`;
  document.getElementById("pkg-html").href = `/api/deployment-kit/package/${customerCode}/html`;
  document.getElementById("pkg-pdf").href = `/api/deployment-kit/package/${customerCode}/pdf`;

  const maint = await apiGet(`/api/deployment-kit/maintenance/${customerCode}`);
  document.getElementById("maint-list").innerHTML = maint.cases
    .map(
      (c) =>
        `<li>${c.caseId} — ${c.status} — ${c.notes ?? ""} <small>${c.createdAt}</small></li>`
    )
    .join("");

  const install = await apiGet(`/api/deployment-kit/install/${customerCode}/dashboard`);
  document.getElementById("install-link").innerHTML = `<a href="${install.installUrl}">施工PWAを開く</a>`;
  document.getElementById("install-devices").innerHTML = install.devices
    .map((d) => `<li>${d.label} (${d.deviceId}) — ${d.status}</li>`)
    .join("");
}

document.getElementById("maint-btn").addEventListener("click", async () => {
  const notes = document.getElementById("maint-notes").value;
  await apiPost("/api/deployment-kit/maintenance/request", { customerCode, notes });
  load();
});

load().catch(console.error);
