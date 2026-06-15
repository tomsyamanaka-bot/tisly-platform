/**
 * 本番書類閲覧 UX 検証 — health / 配信JS / 4帳票 PDF API
 * Usage: node scripts/verify-doc-viewer-prod.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/doc-viewer-prod-verify");
fs.mkdirSync(outDir, { recursive: true });

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
  const res = await fetch(`${BASE}/api/estimate/v1/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`projects failed: ${res.status}`);
  return j.projects ?? j.items ?? [];
}

function pdfUrlFor(projectId, kind) {
  const base = `${BASE}/api/estimate/v1/projects/${projectId}`;
  if (kind === "estimate") return `${base}/pdf?includePhotos=false`;
  if (kind === "invoice") return `${base}/invoice/pdf?includePhotos=false`;
  if (kind === "specification") return `${base}/specification/pdf`;
  return `${base}/completion-report/pdf`;
}

async function verifyPdf(token, projectId, kind, label) {
  const url = pdfUrlFor(projectId, kind);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const ct = res.headers.get("content-type") || "";
  const clHeader = res.headers.get("content-length");
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 5).toString("ascii");
  const contentLength = clHeader ? Number(clHeader) : buf.length;
  const ok =
    res.status === 200 &&
    ct.includes("application/pdf") &&
    contentLength >= 10000 &&
    buf.length >= 10000 &&
    head === "%PDF-";
  return {
    kind,
    label,
    ok,
    status: res.status,
    contentType: ct,
    contentLength,
    bytes: buf.length,
    head,
    url,
  };
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  const html = await fetchText(`${BASE}/document-viewer-v1.html`);
  const shareJs = await fetchText(`${BASE}/js/pdf-share-v1.js`);
  const viewerJs = await fetchText(`${BASE}/js/document-viewer-v1.js`);

  const htmlOk =
    html.includes('id="btn-back"') &&
    html.includes("← 戻る") &&
    html.includes('id="btn-pdf"') &&
    html.includes("PDFにする") &&
    html.includes('id="btn-share"') &&
    html.includes(">共有</button>") &&
    !html.includes("navigator.share({ title, url");

  const shareCodeOk =
    shareJs.includes("navigator.share({ files: [file]") &&
    !shareJs.includes("navigator.share({ title, url") &&
    !viewerJs.includes("navigator.share({ title, url") &&
    shareJs.includes('type: "application/pdf"') &&
    shareJs.includes("document-viewer-v1.html");

  const token = await login();
  const projects = await listProjects(token);
  const project =
    projects.find((p) => (p.invoiceId || p.invoiceNo) && (p.estimateId || p.estimateNo)) ??
    projects.find((p) => p.estimateId || p.estimateNo) ??
    projects[0];
  const projectId = project?.id || project?.businessProjectId;
  if (!projectId) throw new Error("no project for prod verify");

  const kinds = [
    ["estimate", "見積書"],
    ["invoice", "請求書"],
    ["specification", "仕様書"],
    ["completion-report", "工事完了報告書"],
  ];

  const pdfResults = [];
  for (const [kind, label] of kinds) {
    pdfResults.push(await verifyPdf(token, projectId, kind, label));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    commitShort: health.commitShort,
    pdfEngine: health.pdfEngine,
    pdfEngineReady: health.pdfEngineReady,
    projectId,
    projectTitle: project.title || project.siteName || projectId,
    htmlOk,
    shareCodeOk,
    shareEvidence: {
      filesOnlyShare: shareJs.includes("navigator.share({ files: [file]"),
      noTitleUrlShare: !shareJs.includes("navigator.share({ title, url"),
      pdfFileType: shareJs.includes('type: "application/pdf"'),
      forbiddenViewerUrl: shareJs.includes("document-viewer-v1.html"),
    },
    documents: pdfResults,
    allOk:
      htmlOk &&
      shareCodeOk &&
      pdfResults.every((r) => r.ok),
  };

  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("health commitShort:", health.commitShort);
  console.log("htmlOk:", htmlOk, "shareCodeOk:", shareCodeOk);
  console.log("project:", report.projectTitle, projectId);
  for (const r of pdfResults) {
    console.log(
      r.ok ? "OK" : "NG",
      r.label,
      r.status,
      r.contentType,
      `CL=${r.contentLength}`,
      `${r.bytes}B`,
      r.head
    );
  }
  console.log("shareEvidence:", JSON.stringify(report.shareEvidence));
  console.log(`Report: ${outDir}`);
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
