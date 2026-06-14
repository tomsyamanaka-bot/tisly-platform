/**
 * 最終仕上げフェーズ — 天気 / Maps / PDF 実機確認スクショ
 * Usage: npm run build && node scripts/capture-final-polish-screenshots.mjs [baseUrl]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/final-polish-screenshots");
const pdfDir = path.join(root, "data/pdf-verify");
const layoutDir = path.join(root, "data/pdf-layout-samples");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(pdfDir, { recursive: true });

const baseUrl = process.argv[2]?.replace(/\/$/, "") || "http://127.0.0.1:3080";
const iphoneSafari = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const iphonePwa = { ...iphoneSafari, deviceScaleFactor: 3 };
const a4Print = { width: 794, height: 1123, deviceScaleFactor: 2 };

const report = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  weather: {},
  googleMaps: { checks: [], pass: true },
  pdf: {},
  screenshots: outDir,
};

async function loginToken() {
  const res = await fetch(`${baseUrl}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(`login failed: ${res.status}`);
  return data.token;
}

async function injectAuth(page, token) {
  await page.goto(`${baseUrl}/customer/TOMS001/login`, { waitUntil: "networkidle2" });
  await page.evaluate((t) => {
    localStorage.setItem("tisly_admin_token", t);
    sessionStorage.setItem("tisly_token", t);
  }, token);
}

async function generatePdfHtmlFiles() {
  const { renderEstimateHtml } = await import("../dist/business/pdf/estimate-template.js");
  const { renderInvoiceHtml } = await import("../dist/business/pdf/invoice-template.js");
  const { renderPracticalCompletionReportHtml } = await import(
    "../dist/estimate/practical-completion-report-template.js"
  );
  const { renderSpecificationHtml } = await import("../dist/estimate/specification-template.js");

  const project = {
    id: "BIZ-FINAL",
    projectNo: "PRJ-FINAL-001",
    customerId: "c1",
    customerName: "最終確認テスト株式会社",
    title: "防犯カメラ工事",
    address: "茨城県守谷市",
    phone: "029-000-0000",
    status: "estimate_created",
    surveySchedule: null,
    surveyMemo: "最終確認用メモ",
    surveyPhotos: Array.from({ length: 6 }, (_, i) => ({
      url: `https://via.placeholder.com/400x300?text=Survey${i + 1}`,
      title: `現調写真${i + 1}`,
    })),
    estimateId: "e1",
    constructionSchedule: null,
    requiredMaterials: "",
    constructionMemo: "",
    constructionPhotos: [],
    completionReportId: null,
    invoiceId: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };

  const estimate = {
    id: "e1",
    projectId: project.id,
    estimateNo: "260614-001",
    customerName: project.customerName,
    title: project.title,
    header: {
      addressee: "最終確認テスト株式会社 御中",
      subject: "防犯カメラ設置工事",
      issueDate: "2026-06-14",
      estimateNo: "260614-001",
      validUntil: "2026-07-14",
      staffName: "山中 智紀",
      workLocation: "守谷市",
    },
    items: [
      { id: "l1", category: "material", name: "防犯カメラ", memo: "LAN配線", unit: "台", quantity: 2, unitPrice: 45000, amount: 90000, orderTarget: false },
      { id: "l2", category: "labor", name: "工事", memo: "作業", unit: "式", quantity: 1, unitPrice: 88000, amount: 88000, orderTarget: false },
    ],
    lineSubtotal: 178000,
    shuseiDiscount: 0,
    shuseiDiscountMemo: "",
    subtotal: 178000,
    tax: 17800,
    total: 195800,
    internalCost: 0,
    grossProfit: 178000,
    grossProfitRate: 100,
    pdfPath: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };

  const invoice = {
    id: "i1",
    projectId: project.id,
    invoiceNo: "260614-001",
    estimateRefNo: estimate.estimateNo,
    customerName: project.customerName,
    title: project.title,
    items: estimate.items,
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    invoiceDate: "2026-06-14",
    paymentDueDate: "2026-07-14",
    bankInfo: "三菱UFJ銀行 つくば支店 普通 1234567 カ）トムズ",
    pdfPath: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };

  const completionPhotos = Array.from({ length: 6 }, (_, i) => ({
    url: `https://via.placeholder.com/400x300?text=Photo${i + 1}`,
    title: `完了写真${i + 1}`,
  }));

  return {
    "estimate-live.html": renderEstimateHtml(project, estimate),
    "invoice-live.html": renderInvoiceHtml(project, invoice, estimate),
    "completion-report-live.html": renderPracticalCompletionReportHtml({
      projectNo: project.projectNo,
      addressee: "最終確認テスト株式会社 御中",
      subject: "防犯カメラ設置工事",
      siteName: "守谷市",
      workLocation: "守谷市",
      issueDate: "2026-06-14",
      staffName: "山中 智紀",
      startTime: "09:00",
      endTime: "17:00",
      workContent: "防犯カメラ設置",
      checklistSummary: "電源: OK",
      notes: "",
      generatedAt: "2026-06-14T00:00:00.000Z",
      photos: completionPhotos,
    }),
    "specification-live.html": renderSpecificationHtml({
      projectNo: project.projectNo,
      addressee: "最終確認テスト株式会社 御中",
      subject: "防犯カメラ設置工事",
      siteName: "守谷市",
      workLocation: "守谷市",
      issueDate: "2026-06-14",
      staffName: "山中 智紀",
      generatedAt: "2026-06-14T00:00:00.000Z",
      systemConfig: "4ch NVR",
      equipmentList: "カメラ4台",
      notes: project.surveyMemo,
      photos: project.surveyPhotos,
    }),
  };
}

function copyBeforeLayoutIfMissing() {
  for (const name of ["estimate-live.html", "invoice-live.html"]) {
    const src = path.join(pdfDir, name);
    const before = path.join(layoutDir, `before-${name.replace(".html", "")}-layout.html`);
    if (fs.existsSync(src) && !fs.existsSync(before)) {
      fs.copyFileSync(src, before);
    }
  }
}

async function captureWeatherAndMaps(page, token) {
  await injectAuth(page, token);
  await page.goto(`${baseUrl}/schedule-v1?verify=${Date.now()}`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#week-days .schedule-day-card", { timeout: 30000 });

  const weatherLabels = await page.evaluate(() => ({
    base: document.body.innerText.includes("基準地天気"),
    site: document.body.innerText.includes("現場天気"),
  }));
  report.weather = weatherLabels;

  await page.screenshot({ path: path.join(outDir, "01-schedule-week-safari.png"), fullPage: true });

  const targetDate = await page.evaluate(() => {
    const card =
      document.querySelector('[data-date="2026-06-14"]') ||
      document.querySelector(".schedule-day-card[data-date]");
    return card?.getAttribute("data-date") || null;
  });

  const card = targetDate
    ? await page.$(`[data-date="${targetDate}"]`)
    : await page.$(".schedule-day-card");
  if (card) {
    await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await card.screenshot({ path: path.join(outDir, "02-schedule-day-card-weather.png") });
  }

  const mapsChecks = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href*='google.com/maps']")];
    return links.map((a) => ({
      href: a.getAttribute("href") || "",
      text: (a.textContent || "").trim().slice(0, 80),
    }));
  });
  report.googleMaps.checks.push({ screen: "schedule-v1-week", links: mapsChecks });

  if (targetDate) {
    await page.goto(`${baseUrl}/schedule-day-v1?date=${targetDate}`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#day-events, #day-title", { timeout: 15000 }).catch(() => null);
    await page.screenshot({ path: path.join(outDir, "03-schedule-day-detail-safari.png"), fullPage: true });

    const dayChecks = await page.evaluate(() => {
      const travel = [...document.querySelectorAll(".schedule-intel-travel-link")].map((a) => a.href);
      const addressBtn = !!document.querySelector(".schedule-intel-address-btn");
      const baseWeather = document.body.innerText.includes("基準地天気");
      const siteWeather = document.body.innerText.includes("現場天気");
      const locationLinks = [...document.querySelectorAll("a[href*='google.com/maps']")].map((a) => a.href);
      return { travel, addressBtn, baseWeather, siteWeather, locationLinks };
    });
    report.googleMaps.checks.push({ screen: "schedule-day-v1", date: targetDate, ...dayChecks });
    report.weather.dayDetail = { base: dayChecks.baseWeather, site: dayChecks.siteWeather };
  }

  await page.setViewport(iphoneSafari);
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  );
  await page.goto(`${baseUrl}/schedule-v1?pwa=1`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#week-days", { timeout: 15000 });
  await page.screenshot({ path: path.join(outDir, "04-schedule-week-pwa.png"), fullPage: true });

  if (targetDate) {
    await page.goto(`${baseUrl}/schedule-day-v1?date=${targetDate}&pwa=1`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(outDir, "05-schedule-day-pwa.png"), fullPage: true });
  }
}

async function capturePdfScreenshots(page, htmlFiles) {
  for (const [name, html] of Object.entries(htmlFiles)) {
    const htmlPath = path.join(pdfDir, name);
    fs.writeFileSync(htmlPath, html, "utf8");
  }

  const kinds = [
    ["estimate-live.html", "06-estimate-a4-after.png"],
    ["invoice-live.html", "07-invoice-a4-after.png"],
    ["specification-live.html", "08-specification-a4-after.png"],
    ["completion-report-live.html", "09-completion-a4-after.png"],
  ];

  for (const [htmlName, pngName] of kinds) {
    const htmlPath = path.join(pdfDir, htmlName);
    await page.setViewport(a4Print);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts?.ready);
    await page.screenshot({ path: path.join(outDir, pngName), fullPage: true });
    report.pdf[htmlName] = { saved: true, screenshot: pngName };
  }

  for (const name of ["estimate-live.html", "invoice-live.html"]) {
    const beforePath = path.join(layoutDir, `before-${name.replace(".html", "")}-layout.html`);
    if (fs.existsSync(beforePath)) {
      const beforePng = name.includes("estimate")
        ? "estimate-layout-before.png"
        : "invoice-layout-before.png";
      await page.goto(pathToFileURL(beforePath).href, { waitUntil: "networkidle0" });
      await page.screenshot({ path: path.join(outDir, beforePng), fullPage: true });
      report.pdf[`before-${name}`] = beforePng;
    }
  }

  await page.setViewport(iphoneSafari);
  for (const [htmlName, pngName] of [
    ["estimate-live.html", "10-estimate-iphone-safari.png"],
    ["invoice-live.html", "11-invoice-iphone-safari.png"],
  ]) {
    await page.goto(pathToFileURL(path.join(pdfDir, htmlName)).href, { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(outDir, pngName), fullPage: true });
  }
}

async function main() {
  copyBeforeLayoutIfMissing();
  const htmlFiles = await generatePdfHtmlFiles();
  const token = await loginToken();
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  await captureWeatherAndMaps(page, token);
  await capturePdfScreenshots(page, htmlFiles);

  report.googleMaps.pass = report.googleMaps.checks.every((c) => {
    const urls = [...(c.links || []), ...(c.travel || []), ...(c.locationLinks || [])];
    if (!urls.length && c.screen === "schedule-v1-week") return true;
    return urls.every((u) => typeof u === "string" && u.includes("google.com/maps"));
  });

  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log("Final polish verification complete:", outDir);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
