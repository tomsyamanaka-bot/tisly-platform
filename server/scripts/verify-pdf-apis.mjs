/**
 * 見積/請求/仕様/完了報告 PDF API を curl 相当で検証。
 * 用法: node scripts/verify-pdf-apis.mjs [baseUrl]
 */
const base = process.argv[2] || "http://127.0.0.1:3000";

async function login() {
  const res = await fetch(`${base}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed: ${data.error || res.status}`);
  return data.token;
}

async function checkPdf(label, url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const ct = res.headers.get("content-type") || "";
  const lenHeader = res.headers.get("content-length");
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 5).toString("ascii");
  const ok =
    res.status === 200 &&
    ct.includes("application/pdf") &&
    buf.length >= 10000 &&
    head === "%PDF-";
  console.log(
    JSON.stringify({
      label,
      ok,
      status: res.status,
      contentType: ct,
      contentLength: lenHeader ? Number(lenHeader) : buf.length,
      bytes: buf.length,
      head,
      error: ok ? null : buf.subarray(0, 200).toString("utf8").slice(0, 120),
    })
  );
  return ok;
}

async function main() {
  const token = await login();
  const list = await fetch(`${base}/api/estimate/v1/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const project = (list.projects || list.items || []).find((p) => p.estimateId || p.estimateNo);
  if (!project?.id && !project?.businessProjectId) {
    throw new Error("no project for PDF verify");
  }
  const projectId = project.id || project.businessProjectId;

  await fetch(`${base}/api/estimate/v1/projects/${projectId}/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => ({}));

  const checks = [
    ["estimate", `${base}/api/estimate/v1/projects/${projectId}/pdf`],
    ["invoice", `${base}/api/estimate/v1/projects/${projectId}/invoice/pdf`],
    ["specification", `${base}/api/estimate/v1/projects/${projectId}/specification/pdf`],
    ["completion-report", `${base}/api/estimate/v1/projects/${projectId}/completion-report/pdf`],
  ];

  let allOk = true;
  for (const [label, url] of checks) {
    const ok = await checkPdf(label, url, token);
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
