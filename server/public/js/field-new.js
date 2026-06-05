const TOKEN_KEY = "tisly_token";

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

async function ensureLogin() {
  if (token()) return;
  const res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      username: "toms001.manager",
      password: "demo-remote-2026",
    }),
  });
  if (res.ok) {
    const data = await res.json();
    sessionStorage.setItem(TOKEN_KEY, data.token);
  }
}

document.getElementById("field-form")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const plans = String(fd.get("planCandidates") || "standard")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const body = {
    customerCode: fd.get("customerCode"),
    customerName: fd.get("customerName"),
    address: fd.get("address"),
    buildingType: fd.get("buildingType"),
    planCandidates: plans,
    surveyStaff: fd.get("surveyStaff"),
    scheduledDate: fd.get("scheduledDate"),
    memo: fd.get("memo"),
  };
  const out = document.getElementById("result");
  out.innerHTML = "<p>作成中…</p>";
  await ensureLogin();
  const res = await fetch("/api/field/projects/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    out.innerHTML = `<p class="error">${data.error || res.status}</p>`;
    return;
  }
  const fp = data.fieldProject;
  out.innerHTML = `<div class="result">
    <p><strong>作成完了</strong> ${fp.id}</p>
    <p>Survey: <a href="${data.links.survey}">${fp.surveyProjectId}</a></p>
    <p>Business: <a href="${data.links.business}">${fp.businessProjectId}</a></p>
    <p>Timeline: <a href="${data.links.timeline}">API</a></p>
    <p><a href="/deployment/checklist/${fp.businessProjectId}">施工チェックリスト RC2</a></p>
  </div>`;
});
