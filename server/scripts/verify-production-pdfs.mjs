/**
 * 本番 PDF 検証 — Content-Type / サイズ / %PDF ヘッダ
 * 用法: node scripts/verify-production-pdfs.mjs
 */
const BASE = process.env.TISLY_BASE_URL || "https://tisly.jp";
const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

async function login() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const j = await res.json();
  if (!res.ok || !j.token) throw new Error(`login failed: ${res.status}`);
  return j.token;
}

async function listProjects(token) {
  const res = await fetch(`${BASE}/api/projects/v1/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`projects failed: ${res.status}`);
  return j.projects ?? j.items ?? [];
}

async function verifyPdf(token, projectId, kind, label) {
  const url = `${BASE}/api/estimate/v1/projects/${projectId}/${kind === "estimate" ? "pdf" : kind === "invoice" ? "invoice/pdf" : kind === "specification" ? "specification/pdf" : "completion-report/pdf"}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const ct = res.headers.get("content-type") || "";
  const cl = Number(res.headers.get("content-length") || 0);
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 5).toString("ascii");
  const ok =
    res.ok &&
    ct.includes("application/pdf") &&
    (cl >= 10000 || buf.length >= 10000) &&
    head === "%PDF-";
  return {
    label,
    ok,
    status: res.status,
    contentType: ct,
    size: buf.length,
    head,
    url,
  };
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log("health:", JSON.stringify({ commitShort: health.commitShort, pdfEngine: health.pdfEngine, pdfEngineReady: health.pdfEngineReady }));

  const token = await login();
  const projects = await listProjects(token);
  const withDocs = projects.filter((p) => p.estimateId || p.invoiceId);
  const project = withDocs[0] ?? projects[0];
  if (!project) throw new Error("no projects");

  console.log(`project: ${project.title || project.id}`);

  const kinds = [
    ["estimate", "見積"],
    ["invoice", "請求"],
    ["specification", "仕様"],
    ["report", "完了報告"],
  ];

  const results = [];
  for (const [kind, label] of kinds) {
    try {
      results.push(await verifyPdf(token, project.id, kind, label));
    } catch (e) {
      results.push({ label, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const r of results) {
    console.log(
      r.ok ? "OK" : "NG",
      r.label,
      r.status ?? "",
      r.contentType ?? "",
      r.size != null ? `${r.size} B` : "",
      r.head ?? r.error ?? ""
    );
  }

  const allOk = results.every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
