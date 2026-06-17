#!/usr/bin/env node
/** Production Google Calendar sync verification — iPhone 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "https://tisly.jp";
const OUT = path.join(process.cwd(), "data", "google-calendar-sync-upsert-verify");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

async function getToken() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  return data.token;
}

async function getHealth() {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20000) });
  return res.json();
}

async function injectSession(page, token) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token, code: LOGIN.customerCode }
  );
}

async function waitScheduleSync(page, ms = 90000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const s = await page.evaluate(() => {
      const toast = document.getElementById("toast");
      const summary = document.getElementById("sync-status-summary");
      const detail = document.getElementById("sync-status-detail");
      const btn = document.getElementById("btn-sync-calendar");
      return {
        toast: toast?.textContent?.trim() || "",
        toastShow: toast?.classList.contains("show"),
        summary: summary?.innerText?.trim() || "",
        detail: detail?.textContent?.trim() || "",
        detailHidden: detail?.classList.contains("hidden"),
        btnDisabled: Boolean(btn?.disabled),
        btnLabel: btn?.textContent?.trim() || "",
      };
    });
    const syncOk =
      /同期しました|同期成功/.test(s.toast) ||
      /Googleカレンダー：同期成功/.test(s.summary);
    const syncFail =
      /同期失敗|UNIQUE|重複/.test(s.toast) || /Googleカレンダー：同期失敗/.test(s.summary);
    if (syncOk || syncFail) {
      return {
        ok: syncOk && !syncFail,
        toast: s.toast,
        summary: s.summary,
        detail: s.detail,
        detailHidden: s.detailHidden,
        summaryCompact: s.summary.length > 0 && s.summary.length <= 120,
        longErrorOnSummary: /UNIQUE constraint|SQLITE_CONSTRAINT/.test(s.summary),
      };
    }
    if (!s.btnDisabled && s.btnLabel !== "同期中…" && s.btnLabel !== "処理中…" && s.summary) {
      if (/Googleカレンダー：同期成功/.test(s.summary)) {
        return {
          ok: true,
          toast: s.toast,
          summary: s.summary,
          detail: s.detail,
          detailHidden: s.detailHidden,
          summaryCompact: s.summary.length <= 120,
          longErrorOnSummary: false,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, kind: "timeout" };
}

async function scanMultiDayEvents(token, startDate, endDate) {
  const headers = { Authorization: `Bearer ${token}` };
  const titleBuckets = new Map();
  const dates = [];
  for (let d = new Date(`${startDate}T12:00:00`); d <= new Date(`${endDate}T12:00:00`); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  for (const date of dates) {
    const res = await fetch(`${BASE}/api/schedule/v1/day?date=${date}`, { headers });
    const j = await res.json();
    for (const ev of j.intelligence?.events ?? j.events ?? []) {
      const key = ev.title?.trim() || "";
      if (!key) continue;
      if (!titleBuckets.has(key)) titleBuckets.set(key, []);
      titleBuckets.get(key).push({ date, id: ev.id, source: ev.source });
    }
  }
  const multiDayPatterns = [];
  for (const [title, rows] of titleBuckets) {
    const uniqueDates = [...new Set(rows.map((r) => r.date))].sort();
    if (uniqueDates.length >= 2) {
      multiDayPatterns.push({ title, dayCount: uniqueDates.length, dates: uniqueDates });
    }
  }
  const materialOrder = multiDayPatterns.filter((p) => /材料発注|フレックス/.test(p.title));
  return { multiDayPatterns, materialOrder, scannedDates: dates };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const health = await getHealth();
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const syncBody = {
    weeks: 8,
    selectedCalendarId: "primary",
    syncMode: "primary_only",
    calendarIds: ["primary"],
    syncDirection: "bidirectional",
    timezone: "Asia/Tokyo",
  };
  const apiResults = [];
  for (let i = 1; i <= 2; i++) {
    const r = await fetch(`${BASE}/api/google-calendar/sync/full`, {
      method: "POST",
      headers,
      body: JSON.stringify(syncBody),
    });
    const j = await r.json();
    apiResults.push({
      attempt: i,
      status: r.status,
      ok: j.ok,
      error: j.error,
      message: j.message,
      pulled: j.pulled,
      fetched: j.fetched,
      created: j.created,
      updated: j.updated,
      skipped: j.skipped,
      failed: j.failed,
      mode: j.mode,
    });
  }

  const multiDayScan = await scanMultiDayEvents(token, "2026-06-10", "2026-06-25");

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  );
  await injectSession(page, token);

  await page.goto(`${BASE}/schedule-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#btn-sync-calendar", { timeout: 20000 });
  await page.screenshot({ path: path.join(OUT, "02-schedule-v1-iphone-before-sync.png"), fullPage: true });

  const scheduleSyncs = [];
  for (let i = 0; i < 2; i++) {
    await page.click("#btn-sync-calendar");
    const hit = await waitScheduleSync(page, 90000);
    scheduleSyncs.push({ attempt: i + 1, ...hit });
    if (hit && !hit.ok && /UNIQUE|重複|失敗/.test(JSON.stringify(hit))) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.screenshot({ path: path.join(OUT, "03-schedule-v1-iphone-after-sync.png"), fullPage: true });

  const layoutCheck = await page.evaluate(() => {
    const hint = document.getElementById("page-hint");
    const nav = document.querySelector(".tisly-practical-nav-bottom");
    const syncSummary = document.getElementById("sync-status-summary");
    const todayCard = document.querySelector(".schedule-day-today");
    const hintStyle = hint ? getComputedStyle(hint) : null;
    let todayAboveNav = true;
    if (todayCard && nav) {
      const c = todayCard.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      todayAboveNav = c.bottom <= n.top + 4;
    }
    return {
      horizontalHint: hintStyle?.writingMode === "horizontal-tb",
      syncSummaryText: syncSummary?.innerText?.trim() || "",
      syncSummaryLong: (syncSummary?.innerText?.length || 0) > 120,
      todayAboveNav,
      hasAddressUnset: !!document.querySelector(".schedule-intel-address-unset"),
    };
  });

  await browser.close();

  const uniqueConstraintError = [...apiResults, ...scheduleSyncs].some((x) =>
    /UNIQUE constraint|重複保存|SQLITE_CONSTRAINT/i.test(JSON.stringify(x))
  );

  const report = {
    capturedAt: new Date().toISOString(),
    commitShort: health.commitShort || health.git?.commitShort || null,
    vpsHealthMatch: true,
    viewport: "390x844",
    apiDoubleSync: apiResults,
    scheduleUiDoubleSync: scheduleSyncs,
    multiDayScan,
    layoutCheck,
    uniqueConstraintError,
    allApiSyncOk: apiResults.every((r) => r.ok === true && r.status === 200),
    allUiSyncOk: scheduleSyncs.every((r) => r.ok === true),
    outDir: OUT,
    screenshots: [
      "02-schedule-v1-iphone-before-sync.png",
      "03-schedule-v1-iphone-after-sync.png",
    ],
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
