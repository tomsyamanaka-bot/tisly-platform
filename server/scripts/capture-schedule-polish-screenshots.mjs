#!/usr/bin/env node
/** 日程画面 実運用仕上げ — iPhone 390×844 確認スクショ */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "schedule-polish-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function login(page) {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token: data.token, code: LOGIN.customerCode }
  );
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

function hasVerticalGlyphRuns(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length >= 4 && /^[\u3040-\u9fff？！、。A-Za-z0-9]{1}$/.test(line[0])) {
      const chars = [...line.replace(/\s/g, "")];
      if (chars.length >= 4 && chars.every((c) => c.length === 1)) return true;
    }
  }
  return false;
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const hint = document.getElementById("page-hint");
    const syncCard = document.getElementById("sync-status-card");
    const syncSummary = document.getElementById("sync-status-summary");
    const modeTabs = document.querySelector(".schedule-mode-tabs");
    const todayCard = document.querySelector(".schedule-day-today");
    const navBottom = document.querySelector(".tisly-practical-nav-bottom");
    const bodyText = document.body.innerText || "";

    const hintStyle = hint ? getComputedStyle(hint) : null;
    const verticalHint =
      hintStyle &&
      (hintStyle.writingMode !== "horizontal-tb" ||
        hint.scrollHeight > hint.clientHeight * 2);

    const syncText = syncSummary?.innerText || "";
    const syncLongOnScreen =
      syncText.length > 120 ||
      /作成 \d+件.*更新 \d+件.*スキップ/.test(syncText.replace(/\n/g, " "));

    const tabRects = modeTabs
      ? [...modeTabs.querySelectorAll(".tab-btn")].map((b) => {
          const r = b.getBoundingClientRect();
          return { w: r.width, h: r.height, text: b.textContent?.trim() };
        })
      : [];

    let todayAboveNav = true;
    if (todayCard && navBottom) {
      const cardRect = todayCard.getBoundingClientRect();
      const navRect = navBottom.getBoundingClientRect();
      todayAboveNav = cardRect.bottom <= navRect.top + 2 || cardRect.top < navRect.top;
    }

    const addressUnset = !!document.querySelector(".schedule-intel-address-unset");

    return {
      hintText: hint?.textContent?.trim() || "",
      verticalHint,
      syncVisible: Boolean(syncCard && !syncCard.classList.contains("hidden")),
      syncText,
      syncLongOnScreen,
      tabRects,
      todayAboveNav,
      addressUnset,
      hasModeTabs: tabRects.length === 3,
      bodySnippet: bodyText.slice(0, 500),
    };
  });
}

async function mockSyncSuccess(page) {
  await page.evaluate(() => {
    const card = document.getElementById("sync-status-card");
    const summary = document.getElementById("sync-status-summary");
    const toggle = document.getElementById("btn-sync-detail-toggle");
    const detail = document.getElementById("sync-status-detail");
    if (!card || !summary) return;
    card.classList.remove("hidden");
    card.classList.add("sync-success-state");
    summary.innerHTML = [
      "<p class=\"schedule-sync-line\">Googleカレンダー：同期成功</p>",
      "<p class=\"schedule-sync-line\">最終同期：2026/6/17 8:20</p>",
      "<p class=\"schedule-sync-line\">取得：9件　更新：9件</p>",
    ].join("");
    if (toggle) {
      toggle.classList.remove("hidden");
      toggle.textContent = "詳細";
      toggle.dataset.defaultLabel = "詳細";
    }
    if (detail) {
      detail.textContent = "作成 0件 · スキップ 0件\n送信: primary / bidirectional / 2026-06-17〜2026-06-23";
      detail.classList.add("hidden");
    }
  });
}

async function mockSyncFailure(page) {
  await page.evaluate(() => {
    const card = document.getElementById("sync-status-card");
    const summary = document.getElementById("sync-status-summary");
    const toggle = document.getElementById("btn-sync-detail-toggle");
    const detail = document.getElementById("sync-status-detail");
    if (!card || !summary) return;
    card.classList.remove("hidden");
    card.classList.add("sync-error-state");
    summary.innerHTML = "<p class=\"schedule-sync-line\">Googleカレンダー：同期失敗</p>";
    if (toggle) {
      toggle.classList.remove("hidden");
      toggle.textContent = "詳細を見る";
      toggle.dataset.defaultLabel = "詳細を見る";
    }
    if (detail) {
      detail.textContent =
        "Googleカレンダー同期に失敗しました。予定の重複保存エラーです。再同期してください。";
      detail.classList.add("hidden");
    }
  });
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  );
  await login(page);

  await page.goto(`${BASE}/schedule-v1?verify=${Date.now()}`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#week-days .schedule-day-card", { timeout: 30000 });
  await page.waitForSelector("#sync-status-card", { timeout: 10000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 1200));

  const layoutDefault = await inspectLayout(page);
  await shot(page, "01-schedule-week-iphone-default.png");

  await mockSyncSuccess(page);
  const layoutSuccess = await inspectLayout(page);
  await shot(page, "02-schedule-sync-success-compact.png");

  await mockSyncFailure(page);
  const layoutFailure = await inspectLayout(page);
  await shot(page, "03-schedule-sync-failure-compact.png");

  const todayCard = await page.$(".schedule-day-today");
  if (todayCard) {
    await todayCard.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await new Promise((r) => setTimeout(r, 400));
    await shot(page, "04-schedule-today-card-iphone.png");
  }

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    outDir: OUT,
    checks: {
      hintIsShort: layoutDefault.hintText === "空き日確認・Google同期",
      noVerticalHint: !layoutDefault.verticalHint,
      modeTabsOk: layoutDefault.hasModeTabs,
      todayAboveNav: layoutDefault.todayAboveNav,
      syncSuccessCompact:
        layoutSuccess.syncVisible !== false && !layoutSuccess.syncLongOnScreen,
      syncFailureCompact:
        layoutFailure.syncText.includes("同期失敗") &&
        !layoutFailure.syncText.includes("重複保存") &&
        !layoutFailure.bodySnippet.includes("重複保存"),
      addressUnsetBlock: layoutDefault.addressUnset,
    },
    layoutDefault,
    layoutSuccess,
    layoutFailure,
  };

  report.pass =
    report.checks.hintIsShort &&
    report.checks.noVerticalHint &&
    report.checks.modeTabsOk &&
    report.checks.todayAboveNav &&
    report.checks.syncSuccessCompact &&
    report.checks.syncFailureCompact;
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
