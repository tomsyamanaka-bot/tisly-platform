#!/usr/bin/env node
/** 案件詳細「ファイル」タブ — iPhone 15 Pro 390×844 検証スクショ */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-storage-screenshots");
const LOGIN_SURVEYOR = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};
const LOGIN_OWNER = {
  customerCode: "TOMS001",
  username: "toms001.owner",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

let cachedSurveyorToken = null;
let cachedOwnerToken = null;

async function surveyorToken() {
  if (cachedSurveyorToken) return cachedSurveyorToken;
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN_SURVEYOR),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`surveyor login failed: ${data.error || res.status}`);
  cachedSurveyorToken = data.token;
  return cachedSurveyorToken;
}

async function ownerToken() {
  if (cachedOwnerToken) return cachedOwnerToken;
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN_OWNER),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`owner login failed: ${data.error || res.status}`);
  cachedOwnerToken = data.token;
  return cachedOwnerToken;
}

async function login(page) {
  const token = await surveyorToken();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token, code: LOGIN_SURVEYOR.customerCode }
  );
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
}

async function apiPost(pathname, body, token) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} failed: ${data.error || res.status}`);
  return data;
}

async function fetchStorage(projectId, token, { retries = 5 } = {}) {
  let lastBody = {};
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`${BASE}/api/project-storage/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    lastBody = await res.json().catch(() => ({}));
    if (res.ok) return lastBody;
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw new Error(`storage list failed: ${JSON.stringify(lastBody)}`);
}

async function ensureProjectWithAllDocs() {
  const surveyor = await surveyorToken();
  const owner = await ownerToken();

  const created = await apiPost(
    "/api/project-mgmt/v1/projects",
    {
      title: "QNAP連携スクショ検証",
      customerName: "ストレージスクショ様",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
    },
    surveyor
  );
  const projectId = created.project?.id;
  if (!projectId) throw new Error(`project create missing id: ${JSON.stringify(created)}`);
  console.log("creating docs for", projectId);

  await apiPost(`/api/business/projects/${projectId}/estimate`, {
    items: [{ name: "カメラ設置", quantity: 1, unitPrice: 80000 }],
  }, owner);

  await apiPost(`/api/estimate/v1/projects/${projectId}/finalize`, {}, surveyor);
  await apiPost(`/api/estimate/v1/projects/${projectId}/invoice`, {}, surveyor);
  try {
    await apiPost(`/api/projects/v1/projects/${projectId}/specification/create`, {}, surveyor);
  } catch (e) {
    console.warn("specification/create:", e.message);
  }
  await apiPost(`/api/estimate/v1/projects/${projectId}/completion-report/create`, {}, surveyor);

  const storageBody = await fetchStorage(projectId, surveyor);

  const kinds = ["estimate", "invoice", "specification", "report"];
  for (const kind of kinds) {
    if (!storageBody.files?.some((f) => f.kind === kind)) {
      try {
        await apiPost(`/api/project-storage/${projectId}/save-document`, { kind }, surveyor);
      } catch (e) {
        console.warn(`save-document ${kind}:`, e.message);
      }
    }
  }

  const refreshed = await fetchStorage(projectId, surveyor);
  const requiredKinds = ["estimate", "invoice", "specification", "report"];
  const missing = requiredKinds.filter((k) => !refreshed.files?.some((f) => f.kind === k));
  if (missing.length) {
    throw new Error(`missing storage files: ${missing.join(", ")} — ${JSON.stringify(refreshed.files)}`);
  }

  return { projectId, storage: refreshed };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await login(page);

  const { projectId, storage } = await ensureProjectWithAllDocs();
  console.log("projectId:", projectId);
  console.log("files:", storage.files?.map((f) => f.kind));

  await page.goto(
    `${BASE}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=files`,
    { waitUntil: "networkidle2" }
  );
  await page.waitForSelector(".storage-status-card", { timeout: 60000 });
  await page.waitForSelector(".storage-file-actions", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "01-files-tab-synced.png");

  await page.waitForSelector(".storage-file-row");
  await shot(page, "02-files-documents.png");

  const actionButtons = await page.$$eval(".storage-action-btn", (els) =>
    els.map((el) => el.textContent?.trim())
  );
  console.log("action buttons:", actionButtons);

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    baseUrl: BASE,
    projectId,
    qnapSyncStatus: storage.qnapSyncStatus,
    qnapFolderPath: storage.qnapFolderPath,
    storageProvider: storage.storageProvider,
    savedFiles: storage.files?.map((f) => ({
      kind: f.kind,
      fileName: f.fileName,
      folder: f.folder,
    })),
    actionButtons,
    screenshots: ["01-files-tab-synced.png", "02-files-documents.png"],
    checks: {
      qnapStatusVisible: true,
      savePathVisible: Boolean(storage.qnapFolderPath),
      estimateSaved: storage.files?.some((f) => f.kind === "estimate"),
      invoiceSaved: storage.files?.some((f) => f.kind === "invoice"),
      specificationSaved: storage.files?.some((f) => f.kind === "specification"),
      reportSaved: storage.files?.some((f) => f.kind === "report"),
      openButton: actionButtons.includes("開く"),
      shareButton: actionButtons.includes("共有"),
      resaveButton: actionButtons.includes("保存し直す"),
    },
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
